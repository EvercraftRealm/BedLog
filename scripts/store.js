import { system, world } from "@minecraft/server";
import { DEFAULT_LOOKBACK_MS, LEVELS, matchesFilter } from "./core.js";

const META_KEY = "blf:store_meta";
const SEGMENT_PREFIX = "blf:segment_";
const LEGACY_CHUNK_PREFIX = "blf:store_";
const TARGET_SEGMENT_CHARS = 12000;
const MAX_ENTRIES = 256000;
const LEGACY_MAX_CHUNKS = 64;
const STORE_VERSION = 2;
const DEFAULT_PAGE_FILTER = Object.freeze({
  levels: LEVELS,
  source: "",
  query: "",
  lookbackMs: DEFAULT_LOOKBACK_MS
});

function readJsonProperty(key) {
  const value = world.getDynamicProperty(key);
  if (typeof value !== "string") throw new Error(`Missing dynamic property ${key}`);
  return JSON.parse(value);
}

function segmentKey(index) {
  return `${SEGMENT_PREFIX}${index}`;
}

export class LogStore {
  #totalEntries = 0;
  #sequence = 0;
  #firstSegment = 0;
  #activeSegment = 0;
  #activeEntries = [];

  load() {
    try {
      const rawMeta = world.getDynamicProperty(META_KEY);
      if (typeof rawMeta !== "string") return;
      const meta = JSON.parse(rawMeta);
      if (meta.version === STORE_VERSION) this.#loadSegmented(meta);
      else if (Number.isInteger(meta.chunks)) this.#migrateLegacy(meta);
    } catch (error) {
      console.warn(`[BedLog] Could not load persisted history: ${error}`);
      this.#resetMemory();
    }
  }

  add(input) {
    const now = new Date();
    this.#sequence += 1;
    const entry = {
      id: `${now.getTime().toString(36)}-${this.#sequence.toString(36)}`,
      receivedAt: now.toISOString(),
      ...input
    };
    this.#activeEntries.push(entry);
    this.#totalEntries += 1;
    this.#persistAppend();
    this.#enforceRetention();
    this.#persistMeta();
    return entry;
  }

  stats() {
    const completedSegments = this.#activeSegment - this.#firstSegment;
    const estimatedStorageBytes = completedSegments * TARGET_SEGMENT_CHARS
      + JSON.stringify(this.#activeEntries).length;
    return {
      entries: this.#totalEntries,
      maxEntries: MAX_ENTRIES,
      segments: completedSegments + 1,
      estimatedStorageBytes
    };
  }

  async page({ cursor, limit = 50, filter = DEFAULT_PAGE_FILTER } = {}) {
    const results = [];
    const cutoff = Number.isFinite(filter.lookbackMs) && filter.lookbackMs > 0
      ? Date.now() - filter.lookbackMs
      : undefined;
    let segmentIndex = cursor?.segment ?? this.#activeSegment;
    let offset = cursor?.offset;
    let scannedSegments = 0;

    while (segmentIndex >= this.#firstSegment && results.length < limit) {
      const segment = segmentIndex === this.#activeSegment
        ? this.#activeEntries
        : readJsonProperty(segmentKey(segmentIndex));
      if (!Array.isArray(segment)) throw new Error(`Storage segment ${segmentIndex} is not an array`);

      let entryIndex = offset === undefined ? segment.length - 1 : Math.min(offset, segment.length - 1);
      for (; entryIndex >= 0; entryIndex -= 1) {
        const receivedAt = Date.parse(segment[entryIndex].receivedAt);
        if (cutoff !== undefined && Number.isFinite(receivedAt) && receivedAt < cutoff) {
          return { entries: results, nextCursor: undefined, scannedSegments: scannedSegments + 1 };
        }
        if (matchesFilter(segment[entryIndex], filter)) results.push(segment[entryIndex]);
        if (results.length === limit) {
          const nextCursor = this.#nextCursor(segmentIndex, entryIndex);
          return { entries: results, nextCursor, scannedSegments: scannedSegments + 1 };
        }
      }

      segmentIndex -= 1;
      offset = undefined;
      scannedSegments += 1;
      if (scannedSegments % 4 === 0 && segmentIndex >= this.#firstSegment) {
        await system.waitTicks(1);
      }
    }

    return { entries: results, nextCursor: undefined, scannedSegments };
  }

  #nextCursor(segmentIndex, entryIndex) {
    if (entryIndex > 0) return { segment: segmentIndex, offset: entryIndex - 1 };
    if (segmentIndex > this.#firstSegment) return { segment: segmentIndex - 1 };
    return undefined;
  }

  #loadSegmented(meta) {
    const first = Number(meta.firstSegment);
    const active = Number(meta.activeSegment);
    if (!Number.isInteger(first) || !Number.isInteger(active) || first < 0 || active < first) {
      throw new Error("Invalid segmented storage metadata");
    }
    const activeEntries = readJsonProperty(segmentKey(active));
    if (!Array.isArray(activeEntries)) throw new Error("Active storage segment is not an array");
    this.#activeEntries = activeEntries;
    this.#firstSegment = first;
    this.#activeSegment = active;
    this.#sequence = Number(meta.sequence) || 0;
    this.#totalEntries = Number(meta.entries) || activeEntries.length;
    this.#enforceRetention();
    this.#persistMeta();
  }

  #migrateLegacy(meta) {
    if (meta.chunks < 0 || meta.chunks > LEGACY_MAX_CHUNKS) throw new Error("Invalid legacy storage metadata");
    let serialized = "";
    for (let index = 0; index < meta.chunks; index += 1) {
      const chunk = world.getDynamicProperty(`${LEGACY_CHUNK_PREFIX}${index}`);
      if (typeof chunk !== "string") throw new Error(`Missing legacy storage chunk ${index}`);
      serialized += chunk;
    }
    const entries = JSON.parse(serialized || "[]");
    if (!Array.isArray(entries)) throw new Error("Legacy history is not an array");
    const retainedEntries = entries.slice(-MAX_ENTRIES);
    this.#sequence = Number(meta.sequence) || 0;
    this.#writeFreshSegments(retainedEntries);
    for (let index = 0; index < meta.chunks; index += 1) {
      world.setDynamicProperty(`${LEGACY_CHUNK_PREFIX}${index}`, undefined);
    }
    console.log(`[BedLog] Migrated ${retainedEntries.length} entries to segmented storage.`);
  }

  #writeFreshSegments(entries) {
    this.#firstSegment = 0;
    this.#activeSegment = 0;
    this.#activeEntries = [];
    this.#totalEntries = entries.length;
    for (const entry of entries) {
      const candidate = [...this.#activeEntries, entry];
      if (this.#activeEntries.length > 0 && JSON.stringify(candidate).length > TARGET_SEGMENT_CHARS) {
        world.setDynamicProperty(segmentKey(this.#activeSegment), JSON.stringify(this.#activeEntries));
        this.#activeSegment += 1;
        this.#activeEntries = [entry];
      } else {
        this.#activeEntries = candidate;
      }
    }
    world.setDynamicProperty(segmentKey(this.#activeSegment), JSON.stringify(this.#activeEntries));
    this.#persistMeta();
  }

  #persistAppend() {
    const serialized = JSON.stringify(this.#activeEntries);
    if (serialized.length <= TARGET_SEGMENT_CHARS || this.#activeEntries.length === 1) {
      world.setDynamicProperty(segmentKey(this.#activeSegment), serialized);
      return;
    }
    const newest = this.#activeEntries.pop();
    this.#activeSegment += 1;
    this.#activeEntries = [newest];
    world.setDynamicProperty(segmentKey(this.#activeSegment), JSON.stringify(this.#activeEntries));
  }

  #enforceRetention() {
    while (this.#totalEntries > MAX_ENTRIES && this.#firstSegment < this.#activeSegment) {
      const oldest = readJsonProperty(segmentKey(this.#firstSegment));
      const removeCount = Array.isArray(oldest) ? oldest.length : 0;
      world.setDynamicProperty(segmentKey(this.#firstSegment), undefined);
      this.#firstSegment += 1;
      this.#totalEntries -= removeCount;
    }
  }

  #persistMeta() {
    world.setDynamicProperty(META_KEY, JSON.stringify({
      version: STORE_VERSION,
      sequence: this.#sequence,
      firstSegment: this.#firstSegment,
      activeSegment: this.#activeSegment,
      entries: this.#totalEntries
    }));
  }

  #resetMemory() {
    this.#totalEntries = 0;
    this.#sequence = 0;
    this.#firstSegment = 0;
    this.#activeSegment = 0;
    this.#activeEntries = [];
  }
}


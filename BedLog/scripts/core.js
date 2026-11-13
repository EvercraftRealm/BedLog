export const LEVELS = Object.freeze(["debug", "info", "warn", "error", "fatal"]);
export const DEFAULT_FILTER_LEVELS = Object.freeze(["warn", "error", "fatal"]);
export const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_SOURCE_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 2000;
const LEVEL_SET = new Set(LEVELS);

function normalizeText(value, fallback, maxLength) {
  const normalized = String(value ?? fallback).trim();
  return (normalized || fallback).slice(0, maxLength);
}

function selectedLevels(filter) {
  if (Array.isArray(filter.levels)) return filter.levels;
  if (filter.level && filter.level !== "all") return [filter.level];
  return LEVELS;
}

export function safeContext(value) {
  if (value === undefined) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return undefined;
    return serialized.length <= MAX_CONTEXT_LENGTH
      ? JSON.parse(serialized)
      : `${serialized.slice(0, MAX_CONTEXT_LENGTH - 3)}...`;
  } catch {
    return "[Unserializable context]";
  }
}

export function normalizeLogInput(input) {
  const candidate = input && typeof input === "object" ? input : { message: input };
  const levelCandidate = String(candidate.level ?? "").toLowerCase();
  return {
    source: normalizeText(candidate.source, "Unknown", MAX_SOURCE_LENGTH),
    level: LEVEL_SET.has(levelCandidate) ? levelCandidate : "error",
    message: normalizeText(candidate.message, "(empty message)", MAX_MESSAGE_LENGTH),
    context: safeContext(candidate.context)
  };
}

export function parseWriteMessage(message) {
  try {
    return normalizeLogInput(JSON.parse(message));
  } catch {
    return normalizeLogInput({ source: "Script Event", message });
  }
}

export function matchesFilter(entry, filter) {
  if (Number.isFinite(filter.lookbackMs) && filter.lookbackMs > 0) {
    const receivedAt = Date.parse(entry.receivedAt);
    if (Number.isFinite(receivedAt) && receivedAt < Date.now() - filter.lookbackMs) return false;
  }
  if (!selectedLevels(filter).includes(entry.level)) return false;
  if (filter.source && !entry.source.toLowerCase().includes(filter.source.toLowerCase())) return false;
  if (filter.query) {
    const haystack = `${entry.source}\n${entry.message}\n${JSON.stringify(entry.context ?? "")}`.toLowerCase();
    if (!haystack.includes(filter.query.toLowerCase())) return false;
  }
  return true;
}

export function shortTime(isoTime) {
  const match = /T(\d\d:\d\d:\d\d)/.exec(isoTime);
  return match ? match[1] : isoTime;
}


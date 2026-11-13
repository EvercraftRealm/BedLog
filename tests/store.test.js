import test from "node:test";
import assert from "node:assert/strict";
import { mockStats, resetCounters, resetMock, world } from "@minecraft/server";
import { LogStore } from "../BedLog/scripts/store.js";

function request(index, messageSize = 900) {
  return {
    source: "Load Test",
    level: "info",
    message: `${String(index).padStart(4, "0")}:${"x".repeat(messageSize)}`
  };
}

function populate(count = 100) {
  resetMock();
  const store = new LogStore();
  for (let index = 0; index < count; index += 1) store.add(request(index));
  return store;
}

test("appends by rewriting only the active segment and metadata", () => {
  const store = populate();

  const stats = mockStats();
  const segmentKeys = stats.keys.filter((key) => key.startsWith("blf:segment_"));
  assert.ok(segmentKeys.length > 5, "test data should span multiple segments");
  assert.equal(stats.sets, 200, "each append should perform two property writes");
  assert.equal(store.stats().entries, 100);
  assert.equal(store.stats().maxEntries, 256000);
  assert.ok(store.stats().estimatedStorageBytes > 0);
});

test("startup loads metadata and only the active segment", () => {
  populate();
  resetCounters();
  const reloaded = new LogStore();
  reloaded.load();
  const stats = mockStats();
  assert.equal(stats.gets, 2);
  assert.equal(reloaded.stats().entries, 100);
});

test("viewer paging reads only enough segments to fill the page", async () => {
  populate();
  resetCounters();
  const reloaded = new LogStore();
  reloaded.load();
  resetCounters();

  const result = await reloaded.page({ limit: 5 });
  const stats = mockStats();
  const totalSegments = reloaded.stats().segments;

  assert.equal(result.entries.length, 5);
  assert.match(result.entries[0].message, /^0099:/);
  assert.ok(stats.gets < totalSegments, "a page must not read the full archive");
  assert.ok(result.nextCursor);
});

test("default lookback stops scanning when entries are older than seven days", async () => {
  resetMock();
  const oldEntry = { ...request(1, 10), receivedAt: "2020-01-01T00:00:00.000Z" };
  const recentEntry = { ...request(2, 10), receivedAt: new Date().toISOString() };
  world.setDynamicProperty("blf:segment_0", JSON.stringify([oldEntry]));
  world.setDynamicProperty("blf:segment_1", JSON.stringify([recentEntry]));
  world.setDynamicProperty("blf:store_meta", JSON.stringify({
    version: 2,
    sequence: 2,
    firstSegment: 0,
    activeSegment: 1,
    entries: 2
  }));

  const store = new LogStore();
  store.load();
  const page = await store.page({ limit: 50 });

  assert.equal(page.entries.length, 1);
  assert.match(page.entries[0].message, /^0002:/);
  assert.equal(page.nextCursor, undefined);
});

test("migrates the legacy whole-history format once", async () => {
  resetMock();
  const legacyEntries = [request(1, 10), request(2, 10)];
  world.setDynamicProperty("blf:store_0", JSON.stringify(legacyEntries));
  world.setDynamicProperty("blf:store_meta", JSON.stringify({ chunks: 1, sequence: 2 }));

  const store = new LogStore();
  store.load();
  const stats = mockStats();
  const meta = JSON.parse(stats.properties.get("blf:store_meta"));
  const page = await store.page({ limit: 10 });

  assert.equal(meta.version, 2);
  assert.equal(stats.properties.has("blf:store_0"), false);
  assert.equal(store.stats().entries, 2);
  assert.equal(page.entries.length, 2);
});


import test from "node:test";
import assert from "node:assert/strict";
import { matchesFilter, normalizeLogInput, parseWriteMessage, safeContext } from "../BedLog/scripts/core.js";

test("normalizes and bounds untrusted input", () => {
  const entry = normalizeLogInput({ source: "  Pack  ", level: "WARNING", message: "hello" });
  assert.deepEqual(entry, { source: "Pack", level: "error", message: "hello", context: undefined });
  assert.equal(normalizeLogInput({ source: "x".repeat(100), message: "ok" }).source.length, 64);
  assert.equal(normalizeLogInput({ message: "x".repeat(1200) }).message.length, 1000);
  assert.equal(normalizeLogInput({ level: "warn", message: "expected" }).level, "warn");
  assert.equal(normalizeLogInput({ level: "DeBUG", message: "mixed case" }).level, "debug");
  assert.equal(normalizeLogInput({ level: "anything-else", message: "unexpected" }).level, "error");
  assert.equal(normalizeLogInput({ message: "missing" }).level, "error");
});

test("parses structured and plain script-event messages", () => {
  assert.equal(parseWriteMessage('{"source":"A","level":"warn","message":"B"}').level, "warn");
  assert.deepEqual(parseWriteMessage("plain"), {
    source: "Script Event",
    level: "error",
    message: "plain",
    context: undefined
  });
});

test("handles circular context", () => {
  const circular = {};
  circular.self = circular;
  assert.equal(safeContext(circular), "[Unserializable context]");
});

test("filters by level, source, message, and context", () => {
  const entry = { receivedAt: new Date().toISOString(), level: "warn", source: "Inventory", message: "Missing item", context: { slot: 3 } };
  assert.equal(matchesFilter(entry, { levels: ["warn", "error"], source: "vent", query: "slot" }), true);
  assert.equal(matchesFilter(entry, { levels: ["error", "fatal"], source: "", query: "" }), false);
  assert.equal(matchesFilter(entry, { levels: [], source: "", query: "" }), false);
  const oldEntry = { ...entry, receivedAt: "2020-01-01T00:00:00.000Z" };
  assert.equal(matchesFilter(oldEntry, { levels: ["warn"], source: "", query: "", lookbackMs: 1000 }), false);
});


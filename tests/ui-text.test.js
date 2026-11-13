import test from "node:test";
import assert from "node:assert/strict";
import { FONT_FALLBACK_MARKER, formatEstimatedStorage, notoText, truncatePreviewSource } from "../BedLog/scripts/ui-text.js";

test("uses existing symbols and adds the fallback only to plain ASCII lines", () => {
  assert.equal(
    notoText("first\n\n← Back\nINFO • 12:00 • Pack\n§a↺ Refresh"),
    `${FONT_FALLBACK_MARKER}first\n\n← Back\nINFO • 12:00 • Pack\n§a↺ Refresh`
  );
});

test("truncates long preview sources without changing short sources", () => {
  assert.equal(truncatePreviewSource("Short Source"), "Short Source");
  assert.equal(truncatePreviewSource("ExactlyTwelve"), "ExactlyTwelv...");
  assert.equal(truncatePreviewSource("abcdefghijklmnop"), "abcdefghijkl...");
  assert.equal(truncatePreviewSource("😀😀😀😀😀😀😀😀😀😀😀😀😀"), "😀😀😀😀😀😀😀😀😀😀😀😀...");
});

test("formats estimated log storage in KB and MB", () => {
  assert.equal(formatEstimatedStorage(0), "<1 KB");
  assert.equal(formatEstimatedStorage(12_000), "11.7 KB");
  assert.equal(formatEstimatedStorage(1_572_864), "1.5 MB");
});


export const FONT_FALLBACK_MARKER = "▹";

export function truncatePreviewSource(value, maxLength = 12) {
  const characters = Array.from(String(value ?? ""));
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength).join("")}...`
    : characters.join("");
}

export function formatEstimatedStorage(bytes) {
  const normalized = Math.max(0, Number(bytes) || 0);
  if (normalized < 1024) return "<1 KB";
  if (normalized < 1024 * 1024) return `${(normalized / 1024).toFixed(1)} KB`;
  return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
}

function hasFallbackGlyph(line) {
  const visibleText = line.replace(/§./g, "");
  return /[^\x00-\x7F]/.test(visibleText);
}

export function notoText(value, color = "") {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => {
      if (line.length === 0) return "";
      return hasFallbackGlyph(line)
        ? `${color}${line}`
        : `${FONT_FALLBACK_MARKER}${color}${line}`;
    })
    .join("\n");
}


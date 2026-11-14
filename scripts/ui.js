import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { DEFAULT_FILTER_LEVELS, DEFAULT_LOOKBACK_MS, LEVELS, shortTime } from "./core.js";
import { formatEstimatedStorage, notoText, truncatePreviewSource } from "./ui-text.js";

const PAGE_SIZE = 50;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FILTER_LEVEL_OPTIONS = Object.freeze([
  { level: "debug", label: "§8⚙ Debug§r" },
  { level: "info", label: "§bℹ Info§r" },
  { level: "warn", label: "§e⚠ Warning§r" },
  { level: "error", label: "§v✖ Error§r" },
  { level: "fatal", label: "§m☠ Fatal§r" }
]);
const LOOKBACK_OPTIONS = Object.freeze([
  { label: "◷ 24 hours", milliseconds: DAY_MS },
  { label: "◷ 7 days", milliseconds: DEFAULT_LOOKBACK_MS },
  { label: "◷ 30 days", milliseconds: 30 * DAY_MS },
  { label: "◷ 90 days", milliseconds: 90 * DAY_MS },
  { label: "▹ All retained", milliseconds: Infinity }
]);
const LEVEL_COLOR = Object.freeze({
  debug: "§8",
  info: "§b",
  warn: "§e",
  error: "§v",
  fatal: "§m"
});

function fullUtcTime(isoTime) {
  const readable = String(isoTime)
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")
    .replace(/Z$/, "");
  return `${readable} UTC`;
}

function defaultFilter() {
  return {
    levels: DEFAULT_FILTER_LEVELS,
    source: "",
    query: "",
    lookbackMs: DEFAULT_LOOKBACK_MS
  };
}

function entryPreview(entry) {
  const color = LEVEL_COLOR[entry.level] ?? "§f";
  const message = entry.message.replace(/[\r\n]+/g, " ");
  const source = truncatePreviewSource(entry.source);
  return `${color}${entry.level.toUpperCase()}§r • ${shortTime(entry.receivedAt)} UTC • §t${source}§r\n${message}`;
}

export async function openLogViewer(player, store, state = {}) {
  const filter = state.filter ?? defaultFilter();
  const page = Math.max(0, state.page ?? 0);
  const cursors = state.cursors ?? [undefined];
  const pageData = await store.page({ cursor: cursors[page], limit: PAGE_SIZE, filter });
  const pageEntries = pageData.entries;
  const stats = store.stats();
  const storageSize = formatEstimatedStorage(stats.estimatedStorageBytes);

  const form = new ActionFormData()
    .title(notoText("✎ Bedrock Logging Framwork"))
    .body(notoText(`Page ${page + 1}  •  ${stats.entries} entries  •  ~${storageSize}`))
    .button(notoText("§b⫶☰ Filters"))
    .button(notoText("§a↺ Refresh"));

  for (const entry of pageEntries) {
    form.button(notoText(entryPreview(entry)));
  }
  if (page > 0) form.button(notoText("← Previous page"));
  if (pageData.nextCursor) form.button(notoText("Next page →"));

  const result = await form.show(player);
  if (result.canceled || result.selection === undefined) return;
  if (result.selection === 0) return openFilters(player, store, { page, filter, cursors });
  if (result.selection === 1) {
    const refreshState = page === 0 ? { page: 0, filter, cursors: [undefined] } : { page, filter, cursors };
    return openLogViewer(player, store, refreshState);
  }

  const entryIndex = result.selection - 2;
  if (entryIndex < pageEntries.length) {
    return openEntry(player, store, pageEntries[entryIndex], { page, filter, cursors });
  }

  let navigationIndex = pageEntries.length + 2;
  if (page > 0) {
    if (result.selection === navigationIndex) return openLogViewer(player, store, { page: page - 1, filter, cursors });
    navigationIndex += 1;
  }
  if (pageData.nextCursor && result.selection === navigationIndex) {
    const nextCursors = cursors.slice(0, page + 1);
    nextCursors[page + 1] = pageData.nextCursor;
    return openLogViewer(player, store, { page: page + 1, filter, cursors: nextCursors });
  }
}

async function openFilters(player, store, state) {
  const currentLevels = new Set(Array.isArray(state.filter.levels) ? state.filter.levels : DEFAULT_FILTER_LEVELS);
  const lookbackIndex = LOOKBACK_OPTIONS.findIndex((option) => option.milliseconds === state.filter.lookbackMs);
  const currentLookback = lookbackIndex >= 0 ? lookbackIndex : 1;
  const form = new ModalFormData().title(notoText("Filters • BedLog"));
  for (const option of FILTER_LEVEL_OPTIONS) {
    form.toggle(notoText(option.label), { defaultValue: currentLevels.has(option.level) });
  }
  form
    .dropdown(notoText("◷ Lookback"), LOOKBACK_OPTIONS.map((option) => option.label), { defaultValueIndex: currentLookback })
    .textField(notoText("⌁ Source contains"), "▹ Add-on name", { defaultValue: state.filter.source })
    .textField(notoText("⌕ Search"), "▹ Message or context", { defaultValue: state.filter.query })
    .submitButton(notoText("→ Apply filters"));

  const result = await form.show(player);
  if (result.canceled || !result.formValues) return openLogViewer(player, store, state);
  const levelValues = result.formValues.slice(0, LEVELS.length);
  const [selectedLookbackIndex, source, query] = result.formValues.slice(LEVELS.length);
  const lookback = LOOKBACK_OPTIONS[Number(selectedLookbackIndex)] ?? LOOKBACK_OPTIONS[1];
  return openLogViewer(player, store, {
    page: 0,
    cursors: [undefined],
    filter: {
      levels: LEVELS.filter((_, index) => Boolean(levelValues[index])),
      lookbackMs: lookback.milliseconds,
      source: String(source ?? "").trim().slice(0, 64),
      query: String(query ?? "").trim().slice(0, 128)
    }
  });
}

async function openEntry(player, store, entry, state) {
  const levelColor = LEVEL_COLOR[entry.level] ?? "";
  const context = entry.context === undefined
    ? ""
    : `\n\n≡ Context\n${JSON.stringify(entry.context, null, 2)}`;
  const details = [
    `◷ Received: ${fullUtcTime(entry.receivedAt)}`,
    `⌁ Source: §t${entry.source}§r`,
    `⚑ Level: ${levelColor}${entry.level}§r`,
    `№ ID: ${entry.id}`,
    "",
    `${entry.message}${context}`
  ].join("\n");
  const form = new ActionFormData()
    .title(notoText(`${levelColor}${entry.level.toUpperCase()}§r • BedLog`))
    .body(notoText(details))
    .button(notoText("← Back to logs"))
    .button(notoText("§a↺ Refresh"));
  const result = await form.show(player);
  if (result.canceled) return;
  return openLogViewer(player, store, state);
}


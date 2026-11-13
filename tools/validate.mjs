import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const roots = ["BedLog"];
let checked = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith(".json")) {
      JSON.parse(await readFile(path, "utf8"));
      checked += 1;
    }
  }
}

for (const root of roots) await walk(root);

for (const script of [
  "BedLog/scripts/core.js",
  "BedLog/scripts/main.js",
  "BedLog/scripts/store.js",
  "BedLog/scripts/ui-text.js",
  "BedLog/scripts/ui.js"
]) {
  execFileSync(process.execPath, ["--check", script], { stdio: "inherit" });
}

const bp = JSON.parse(await readFile("BedLog/manifest.json", "utf8"));
const script = bp.modules.find((module) => module.type === "script");
if (!script || script.entry !== "scripts/main.js") throw new Error("Behavior pack script entry is invalid");
if (!bp.dependencies.some((dependency) => dependency.module_name === "@minecraft/server" && dependency.version === "2.11.0")) {
  throw new Error("Behavior pack does not target @minecraft/server 2.11.0");
}
if (bp.metadata?.product_type !== "addon") throw new Error("Behavior pack must declare metadata.product_type as addon");
console.log(`Validated ${checked} JSON files and behavior pack manifest.`);


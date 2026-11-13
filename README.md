# BedLog

Bedrock Logging Framework, or BedLog for short, is an operator-facing logging system for Minecraft: Bedrock Edition. The native content log is only viewable per player, and is of little help in multiplayer. BedLog fixes that. It gives behavior packs a central logging framework through the native Script Event API, and gives world operators a searchable log viewer.

## Compatibility

- Target: Minecraft Bedrock **26.60** (`min_engine_version` `1.26.60`)
- Script API: `@minecraft/server` **2.11.0**
- Forms API: `@minecraft/server-ui` **2.2.0**
- No experimental toggles required

## Install

Open the `BedLog.mcpack` file and enable the imported behavior pack on your Minecraft world. 

Move BedLog to the bottom of your behavior-pack list so it loads first and can receive logs from compatible add-ons.

Operators can open the viewer with `/blf:log`.

## Viewer

The log viewer supports:

- Newest-first paging with up to 50 entries per page
- Logging-level, lookback period, source, and text filters
- Up to 256,000 persistent entries with no performance impact

Q: How are so many log entries handled performantly?
A: Persistence is append-segmented. Each incoming log rewrites only the current segment (up to roughly 12,000 characters) and a small metadata property. Completed segments are immutable. Searches advance through older segments in small batches, yield between batches, and retain only the current 50-entry result page in memory. Searching through a full storage, with broad search terms, and an infinite lookback period, could take up to several minutes. However even in this worst case scenario, the world/server performance should never be impacted.

## Use the Framework

Use the BedLog Framework with Bedrock's built-in Script Event infrastructure directly in your addon:

```js
import { system } from "@minecraft/server";

system.sendScriptEvent("blf:log", JSON.stringify({
  source: "My Add-On",
  level: "warn",
  message: "Ready"
}));
```
- Sources are limited to 64 characters
- Messages are limited to 1,000 characters.
- Accepted levels are `debug`, `info`, `warn`, `error`, and `fatal`. 
- A missing or unrecognized level is recorded as `error`. 
- BedLog timestamps entries when it receives them. 
- Avoid unnecessary logs. For example, only log routine startup messages in development builds.
- Consolidate related errors. When one issue produces multiple errors, send them to BedLog as a single entry when practical.

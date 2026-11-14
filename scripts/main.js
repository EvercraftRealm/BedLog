import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world
} from "@minecraft/server";
import { normalizeLogInput, parseWriteMessage } from "./core.js";
import { LogStore } from "./store.js";
import { openLogViewer } from "./ui.js";

const store = new LogStore();
const VIEWER_COMMAND = "blf:log";
const LOG_EVENT = "blf:log";
let ready = false;

function openFromCommand(origin) {
  const player = origin.sourceEntity;
  if (!(player instanceof Player)) {
    return { status: CustomCommandStatus.Failure, message: "BedLog's viewer must be opened by a player." };
  }
  system.run(() => {
    openLogViewer(player, store).catch((error) => {
      console.error(`[BedLog] Viewer failed: ${error}`);
      player.sendMessage("§cBedLog could not open the viewer. Try again after closing other menus.");
    });
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand({
    name: VIEWER_COMMAND,
    description: "Open the BedLog operator log viewer",
    permissionLevel: CommandPermissionLevel.GameDirectors,
    cheatsRequired: false
  }, openFromCommand);
});

world.afterEvents.worldLoad.subscribe(() => {
  store.load();
  ready = true;
  store.add(normalizeLogInput({ source: "BedLog", level: "info", message: "BedLog started" }));
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (!ready || event.id !== LOG_EVENT) return;
  store.add(parseWriteMessage(event.message));
});



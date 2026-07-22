/**
 * settings — public surface + the process-wide singleton. `initSettings()`
 * runs first-boot auto-detect (navigator hints + touch) so the very first
 * match isn't janky; thereafter the persisted blob wins.
 */
import { isTouchDevice, readTouchEnv } from "../input/mobileDetect";
import { SettingsStore } from "./SettingsStore";
import type { DetectEnv } from "./presets";

export * from "./types";
export * from "./presets";
export { SettingsStore } from "./SettingsStore";

/** The shared settings store — read by the render side and the React HUD. */
export const settingsStore = new SettingsStore();

/** Live device hints for auto-detect / "reset to recommended". */
export function detectEnv(): DetectEnv {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    hardwareConcurrency: nav?.hardwareConcurrency ?? 8,
    deviceMemory: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
    touch: isTouchDevice(readTouchEnv()),
  };
}

/** Call once at boot: seed a recommended preset on a fresh install. */
export function initSettings(): void {
  settingsStore.seedIfFirstBoot(detectEnv());
}

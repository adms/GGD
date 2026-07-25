/**
 * Batch-1 visible-correctness (1C-1). The gore pipeline (settings field →
 * goreSettings bridge → setGoreOverride → vfx) shipped fully wired but ORPHANED:
 * no screen ever wrote `goreStyle` / `goreIntensity`, so the values were frozen
 * at their defaults forever and the user could never reach the "off" /
 * intensity-0 branch the pipeline was built to serve.
 *
 * These pin the now-present UI control TWO ways:
 *   1. the exact writes the new SettingsScreen controls perform
 *      (`patchGraphics({ goreStyle })` / `patchGraphics({ goreIntensity })`)
 *      actually flow through the live bridge into the effective gore config;
 *   2. a comment-stripped source scan proves SettingsScreen really binds those
 *      writes (the grep count the plan reported was 0).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { SettingsStore } from "../settings";
import { bindGoreToSettings } from "../vfx/goreSettings";
import { goreConfig, resetGoreConfig, resolveGore } from "../vfx/goreConfig";

let unbind: (() => void) | null = null;

beforeEach(() => {
  resetGoreConfig();
});

afterEach(() => {
  unbind?.();
  unbind = null;
  resetGoreConfig();
});

describe("1C-1 gore controls reach the pipeline (gore-settings-ui)", () => {
  it("picking 'off' turns the effective gore config off", () => {
    cover("gore-settings-ui");
    const store = new SettingsStore(null); // isolated, no localStorage
    unbind = bindGoreToSettings(store);
    expect(goreConfig().style).not.toBe("off"); // default ships blood on

    store.patchGraphics({ goreStyle: "off" }); // the Segmented control's onPick
    expect(goreConfig().style).toBe("off");
  });

  it("dragging intensity to 0 resolves to no gore, whatever the style", () => {
    cover("gore-settings-ui");
    const store = new SettingsStore(null);
    unbind = bindGoreToSettings(store);

    store.patchGraphics({ goreStyle: "blood", goreIntensity: 0 }); // Slider onChange
    // an intensity of 0 is an "off" by another name — the branch no UI could reach
    expect(resolveGore(goreConfig()).intensity).toBe(0);
    expect(resolveGore(goreConfig()).style).toBe("off");
  });

  it("intensity flows through as a scale on the way back up", () => {
    cover("gore-settings-ui");
    const store = new SettingsStore(null);
    unbind = bindGoreToSettings(store);
    store.patchGraphics({ goreStyle: "blood", goreIntensity: 0.5 });
    const r = resolveGore(goreConfig());
    expect(r.style).toBe("blood");
    expect(r.intensity).toBeGreaterThan(0);
  });
});

describe("1C-1 SettingsScreen binds the gore writes (gore-settings-ui)", () => {
  const SRC = readFileSync(fileURLToPath(new URL("./SettingsScreen.tsx", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("has a style picker and an intensity slider bound to patchGraphics", () => {
    cover("gore-settings-ui");
    expect(SRC).toMatch(/patchGraphics\(\s*\{\s*goreStyle:/);
    expect(SRC).toMatch(/patchGraphics\(\s*\{\s*goreIntensity:/);
  });
});

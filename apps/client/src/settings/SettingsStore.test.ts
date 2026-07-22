/**
 * settings-perf: SettingsStore persistence (save/load/migrate) + live pub/sub.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SettingsStore } from "./SettingsStore";
import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION, migrateSettings, type Settings } from "./types";
import { PRESET_PARAMS } from "./presets";

function fakeStorage(seed: Record<string, string> = {}): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("settings persistence (settings-perf)", () => {
  it("saves changes and reloads them into a fresh store", () => {
    cover("settings-persistence");
    const storage = fakeStorage();
    const a = new SettingsStore(storage);
    expect(a.isFirstBoot).toBe(true);
    a.patchGraphics({ resolutionScale: 0.7, shadows: false });
    a.patchNetwork({ interpolationDelayMs: 140 });

    const b = new SettingsStore(storage);
    expect(b.isFirstBoot).toBe(false);
    expect(b.graphics().resolutionScale).toBe(0.7);
    expect(b.graphics().shadows).toBe(false);
    expect(b.network().interpolationDelayMs).toBe(140);
  });

  it("migrates an older/partial persisted shape onto current defaults (clamped)", () => {
    cover("settings-persistence");
    // an older blob: version 1, missing new fields, some out-of-range values
    const old = {
      version: 1,
      graphics: { qualityPreset: "medium", resolutionScale: 5, fpsCap: 45 },
      network: { interpolationDelayMs: 9999 },
    };
    const migrated = migrateSettings(old);
    expect(migrated.version).toBe(SETTINGS_VERSION);
    expect(migrated.graphics.qualityPreset).toBe("medium");
    expect(migrated.graphics.resolutionScale).toBe(1); // clamped 5 → 1.0
    expect(migrated.graphics.fpsCap).toBe(60); // invalid 45 → default 60
    expect(migrated.graphics.dynamicResolution).toBe(true); // filled from defaults
    expect(migrated.network.interpolationDelayMs).toBe(200); // clamped 9999 → 200

    // and the store loads that migrated shape from raw storage
    const storage = fakeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(old) });
    const store = new SettingsStore(storage);
    expect(store.graphics().resolutionScale).toBe(1);
    expect(store.network().interpolationDelayMs).toBe(200);
  });

  it("setPreset writes concrete fixed-preset values", () => {
    cover("settings-preset-map");
    const store = new SettingsStore(fakeStorage());
    store.setPreset("low");
    expect(store.graphics().qualityPreset).toBe("low");
    expect(store.graphics().resolutionScale).toBe(PRESET_PARAMS.low.resolutionScale);
    expect(store.graphics().shadows).toBe(false);
  });

  it("resetToRecommended applies the auto-detected preset", () => {
    cover("settings-autodetect");
    const store = new SettingsStore(fakeStorage());
    const preset = store.resetToRecommended({ hardwareConcurrency: 12, deviceMemory: 16, touch: false });
    expect(preset).toBe("high");
    expect(store.graphics().qualityPreset).toBe("high");
  });

  it("seedIfFirstBoot only seeds when nothing is persisted", () => {
    cover("settings-autodetect");
    const storage = fakeStorage();
    const a = new SettingsStore(storage);
    a.setPreset("low"); // persists
    const b = new SettingsStore(storage);
    b.seedIfFirstBoot({ hardwareConcurrency: 12, touch: false }); // must NOT overwrite
    expect(b.graphics().qualityPreset).toBe("low");
  });
});

describe("settings live pub/sub (settings-perf)", () => {
  it("notifies subscribers on every change; unsubscribe stops delivery", () => {
    cover("settings-pubsub");
    const store = new SettingsStore(fakeStorage());
    const seen: Settings[] = [];
    const off = store.subscribe((s) => seen.push(s));

    store.patchGraphics({ fpsCap: 30 });
    store.setPreset("high");
    expect(seen).toHaveLength(2);
    expect(seen[0]!.graphics.fpsCap).toBe(30);
    expect(seen[1]!.graphics.qualityPreset).toBe("high");

    off();
    store.patchNetwork({ showPerfOverlay: true });
    expect(seen).toHaveLength(2); // unsubscribed
  });
});

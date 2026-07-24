/**
 * SettingsStore — the single source of truth for user settings. Plain
 * pub/sub over an immutable Settings snapshot (NOT Zustand — this is read by
 * both the imperative render side and the React HUD, and per the client
 * architecture gate Zustand is confined to the HUD store). Every mutation
 * persists to localStorage immediately and notifies subscribers so graphics +
 * network changes apply live.
 */
import {
  DEFAULT_GRAPHICS,
  DEFAULT_NETWORK,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  clampGraphics,
  clampNetwork,
  cloneSettings,
  migrateSettings,
  type GraphicsSettings,
  type NetworkSettings,
  type QualityPreset,
  type Settings,
} from "./types";
import { applyPreset, autoDetectPreset, type DetectEnv } from "./presets";

type Persist = Pick<Storage, "getItem" | "setItem">;

function safeLocalStorage(): Persist | null {
  try {
    // `typeof !== "undefined"` alone is not enough: Node 20+ DEFINES a global
    // `localStorage` that is only usable when the process was started with
    // --localstorage-file, and whose getItem is missing otherwise. Without the
    // method check, merely importing the settings singleton throws in any
    // node-environment vitest file — so the render seam could not be unit
    // tested at all. Duck-type the two methods we actually use.
    if (typeof localStorage === "undefined") return null;
    return typeof localStorage.getItem === "function" && typeof localStorage.setItem === "function"
      ? localStorage
      : null;
  } catch {
    return null; // WKWebView private mode throws on access
  }
}

export class SettingsStore {
  private settings: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(private storage: Persist | null = safeLocalStorage()) {
    this.settings = this.read();
  }

  private read(): Settings {
    const raw = this.storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return cloneSettings({ version: SETTINGS_VERSION, graphics: { ...DEFAULT_GRAPHICS }, network: { ...DEFAULT_NETWORK } });
    try {
      return migrateSettings(JSON.parse(raw));
    } catch {
      return cloneSettings({ version: SETTINGS_VERSION, graphics: { ...DEFAULT_GRAPHICS }, network: { ...DEFAULT_NETWORK } });
    }
  }

  private commit(next: Settings): void {
    this.settings = next;
    this.storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    for (const fn of this.listeners) fn(next);
  }

  /** Whether a persisted blob already existed (false on a fresh install). */
  get isFirstBoot(): boolean {
    return !this.storage?.getItem(SETTINGS_STORAGE_KEY);
  }

  get(): Settings {
    return this.settings;
  }

  graphics(): GraphicsSettings {
    return this.settings.graphics;
  }

  network(): NetworkSettings {
    return this.settings.network;
  }

  /** Subscribe to any settings change; returns an unsubscriber. */
  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Merge partial graphics changes (clamped) and persist + notify. */
  patchGraphics(partial: Partial<GraphicsSettings>): void {
    this.commit({
      ...this.settings,
      graphics: clampGraphics({ ...this.settings.graphics, ...partial }),
    });
  }

  patchNetwork(partial: Partial<NetworkSettings>): void {
    this.commit({
      ...this.settings,
      network: clampNetwork({ ...this.settings.network, ...partial }),
    });
  }

  /** Apply a quality preset (writes concrete values for fixed presets). */
  setPreset(preset: QualityPreset): void {
    this.commit({
      ...this.settings,
      graphics: clampGraphics(applyPreset(this.settings.graphics, preset)),
    });
  }

  /** "Reset to recommended": auto-detect the hardware and apply that preset. */
  resetToRecommended(env: DetectEnv): QualityPreset {
    const preset = autoDetectPreset(env);
    this.commit({
      version: SETTINGS_VERSION,
      graphics: clampGraphics(applyPreset({ ...DEFAULT_GRAPHICS }, preset)),
      network: { ...DEFAULT_NETWORK },
    });
    return preset;
  }

  /** First-boot seed: only touches storage/state when nothing is persisted. */
  seedIfFirstBoot(env: DetectEnv): void {
    if (!this.isFirstBoot) return;
    this.resetToRecommended(env);
  }
}

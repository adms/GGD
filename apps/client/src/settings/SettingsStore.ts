/**
 * SettingsStore — the single source of truth for user settings. Plain
 * pub/sub over an immutable Settings snapshot (NOT Zustand — this is read by
 * both the imperative render side and the React HUD, and per the client
 * architecture gate Zustand is confined to the HUD store). Every mutation
 * persists to localStorage immediately and notifies subscribers so graphics +
 * network changes apply live.
 */
import { DEFAULT_INPUT_GUARD } from "../input/inputGuard";
import {
  DEFAULT_NETWORK,
  DEFAULT_UI,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  clampGraphics,
  clampNetwork,
  clampUi,
  cloneSettings,
  defaultGraphicsFor,
  migrateSettings,
  type GraphicsSettings,
  type NetworkSettings,
  type QualityPreset,
  type Settings,
  type UiSettings,
} from "./types";
import { applyPreset, autoDetectPreset, type DetectEnv } from "./presets";
import { isTouchDevice, readTouchEnv } from "../input/mobileDetect";

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

  /**
   * Is this a touch device? Captured ONCE at construction (owner 2026-07-28:
   * 手機預設 30 fps). Injectable so the platform split is unit-testable without
   * a DOM — reading `readTouchEnv()` inline would make the rule untestable and
   * would re-evaluate it on every read.
   */
  private readonly touch: boolean;

  constructor(
    private storage: Persist | null = safeLocalStorage(),
    touch: boolean = isTouchDevice(readTouchEnv()),
  ) {
    this.touch = touch;
    this.settings = this.read();
  }

  /** Fresh-install defaults FOR THIS PLATFORM (only `fpsCap` differs). */
  private fresh(): Settings {
    return cloneSettings({
      version: SETTINGS_VERSION,
      graphics: defaultGraphicsFor(this.touch),
      network: { ...DEFAULT_NETWORK },
      input: { ...DEFAULT_INPUT_GUARD },
      // ⛔ 新裝置一律「中」，**連觸控裝置也是**。iPhone 上直接開成「最小」很誘人，
      // 但那是替玩家決定他的視力 —— owner 給的是七個檔位讓他自己選，而「中」是
      // 他明說的預設。平台差異只住在 fpsCap 那一格（見 defaultGraphicsFor）。
      ui: { ...DEFAULT_UI },
    });
  }

  private read(): Settings {
    const raw = this.storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return this.fresh();
    try {
      return migrateSettings(JSON.parse(raw), { touch: this.touch });
    } catch {
      return this.fresh();
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

  ui(): UiSettings {
    return this.settings.ui;
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

  /** Merge partial UI changes (clamped) and persist + notify. */
  patchUi(partial: Partial<UiSettings>): void {
    this.commit({
      ...this.settings,
      ui: clampUi({ ...this.settings.ui, ...partial }),
    });
  }

  /**
   * Apply a quality preset (writes concrete values for fixed presets).
   *
   * ⚠️ `this.touch` MUST be passed. When `fpsCapFollowsPreset` is ON, this is
   * what decides whether the reset lands on 60 or 30 — a phone player tapping
   * 「高畫質」 would otherwise silently go back to the DESKTOP default while the
   * settings page kept showing the preset they picked. `resetToRecommended`
   * below had the argument from the start; this one did not, which is exactly
   * the shape of a fix applied to one of two sibling call sites.
   *
   * ⚠️ 出貨值下 `applyPreset` **不碰 fpsCap**(GH#271) —— 玩家在 fps 那一排選過
   * 的東西贏。那個決策點住在 `GraphicsSettings.fpsCapFollowsPreset`,而
   * `applyPreset` 直接從傳進去的 graphics 讀它,所以這裡不需要多傳一個參數。
   */
  setPreset(preset: QualityPreset): void {
    this.commit({
      ...this.settings,
      graphics: clampGraphics(applyPreset(this.settings.graphics, preset, this.touch)),
    });
  }

  /**
   * "Reset to recommended": auto-detect the hardware and apply that preset.
   *
   * ⚠️ **`ui` 刻意被保留下來，不跟著重設。** HUD 縮放是玩家對**他的眼睛與他的
   * 螢幕**做的選擇（owner 講的是 32 吋 / MacBook / iPad / iPhone），不是一個效能
   * 參數 —— 它對 GPU 的影響是零。一個按「重設為建議值」想修掉掉幀的人，不應該
   * 因此被把字縮回看不見。同一個理由讓 `applyPreset` 從來不碰 `goreStyle`。
   */
  resetToRecommended(env: DetectEnv): QualityPreset {
    const preset = autoDetectPreset(env);
    this.commit({
      version: SETTINGS_VERSION,
      graphics: clampGraphics(applyPreset(defaultGraphicsFor(this.touch), preset, this.touch)),
      network: { ...DEFAULT_NETWORK },
      input: { ...DEFAULT_INPUT_GUARD },
      ui: clampUi({ ...this.settings.ui }),
    });
    return preset;
  }

  /** First-boot seed: only touches storage/state when nothing is persisted. */
  seedIfFirstBoot(env: DetectEnv): void {
    if (!this.isFirstBoot) return;
    this.resetToRecommended(env);
  }
}

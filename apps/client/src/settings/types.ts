/**
 * settings/types — the typed, versioned client Settings object. Plain data
 * (no Babylon / React / Zustand): the SettingsStore persists it to
 * localStorage and pub/subs changes so graphics + network settings apply LIVE.
 * RenderConfig / QualityController are the consumers that map these values
 * onto the Babylon engine + vfx budgets.
 */
import { INTERP_DELAY_MS, SNAPSHOT_MS } from "@ggd/shared/constants";
import { defaultFpsCap } from "../render/frameCap";
import { INTENT_HZ_DEFAULT, clampIntentHz } from "../input/IntentClock";

/** Top-level graphics selector. "auto" hands quality to the adaptive manager. */
export type QualityPreset = "low" | "medium" | "high" | "auto";

/** rAF render cap; 0 = uncapped (render every animation frame). */
export type FpsCap = 30 | 60 | 120 | 0;

/**
 * 濺血 style (task #39). "default" defers to `content/config/gore.json` (which
 * ships "blood"); anything else is the player's explicit choice and OVERRIDES
 * the content doc — including per-champion overrides, which may only ever make
 * a hit less bloody. This is a tone/consent setting, not a graphics one, so
 * `applyPreset` deliberately never touches it.
 */
export type GoreSetting = "default" | "blood" | "stylized" | "off";

const GORE_SETTINGS: readonly GoreSetting[] = ["default", "blood", "stylized", "off"];

/**
 * How much of the fight gets a floating number (task #92). In a 4-team lobby
 * most damage on screen involves neither you nor your team, and drawing all of
 * it is the 光污染 the user already rejected once. Default "team":
 *   off  — no floating text at all
 *   self — only events where YOU are the source or the target
 *   team — the above plus what happens to your teammates
 *   all  — everything, including enemy-vs-enemy
 */
export type CombatTextScope = "off" | "self" | "team" | "all";

const COMBAT_TEXT_SCOPES: readonly CombatTextScope[] = ["off", "self", "team", "all"];

export interface GraphicsSettings {
  qualityPreset: QualityPreset;
  /** 0.5–1.0 — render-buffer scale (→ Engine.setHardwareScalingLevel). */
  resolutionScale: number;
  fpsCap: FpsCap;
  shadows: boolean;
  /** 0–1 — VfxSystem particle-budget multiplier. */
  particleDensity: number;
  /** world units: entities/props beyond this from the followed champ are culled. */
  drawDistance: number;
  /** engine AA sample toggle (needs an engine recreate → applies next boot). */
  antialias: boolean;
  /** allow the adaptive manager to nudge resolution even on a fixed preset. */
  dynamicResolution: boolean;
  /** max concurrent floating combat-text numbers (density cap). */
  damageNumberCap: number;
  /** how much of the fight is numbered (see CombatTextScope). */
  combatTextScope: CombatTextScope;
  /** 濺血 spray style; "default" follows content/config/gore.json. */
  goreStyle: GoreSetting;
  /** 0–1 multiplier on the content doc's spray intensity (1 = as authored). */
  goreIntensity: number;
}

export interface NetworkSettings {
  /**
   * INTERP_MIN_DELAY_MS–200 ms — feeds InterpolationBuffer render delay.
   * This is the value GameApp ACTUALLY passes to TimeSync.renderTick; the
   * shared INTERP_DELAY_MS constant is only the default seeded below and
   * TimeSync's unused fallback parameter. Changing the constant without
   * changing this default would leave every existing player on the old delay.
   */
  interpolationDelayMs: number;
  showPerfOverlay: boolean;
  showPing: boolean;
  /** widen interp delay slightly when snapshot arrival variance is high. */
  adaptiveJitterBuffer: boolean;
  /**
   * 每秒把操作送出去幾次 (task #282)。**這是「你的操作有多少會被伺服器看到」**,
   * 不是畫質選項:sim 每秒跑 30 tick,一個 tick 只吃一筆 intent,所以 30 = 每
   * 一 tick 都有你的輸入,15 = 每兩 tick 才有一次(手機以前就是掉在這附近)。
   *
   * 調低是**真的省電**(少取樣、少送封包),代價是操作解析度。範圍與理由都在
   * `input/IntentClock.ts`:INTENT_HZ_MIN..INTENT_HZ_MAX。
   */
  intentHz: number;
}

export interface Settings {
  version: number;
  graphics: GraphicsSettings;
  network: NetworkSettings;
}

/** Bump when the persisted shape changes; migrateSettings deep-merges forward. */
export const SETTINGS_VERSION = 4;

/**
 * Floor for the interpolation-delay slider, DERIVED from the snapshot rate.
 *
 * The InterpolationBuffer clamps (freezes) rather than extrapolates when the
 * render clock outruns the newest sample, so the delay must cover at least two
 * snapshot intervals for a single late/dropped packet to pass unnoticed.
 * Math.floor keeps this at 66 for a 30 Hz snapshot rate, matching the shipped
 * INTERP_DELAY_MS exactly instead of clamping it up to 67.
 *
 * The old hardcoded floor was 60 ms, which at the old 20 Hz rate was 1.2
 * intervals — the slider's minimum was itself a stutter setting.
 */
export const INTERP_MIN_DELAY_MS = Math.floor(2 * SNAPSHOT_MS);
/** Ceiling for the interpolation-delay slider (unchanged). */
export const INTERP_MAX_DELAY_MS = 200;

/**
 * The interpolation delay shipped BEFORE the 30 Hz snapshot change. A persisted
 * blob still carrying exactly this value was never touched by the player, so
 * migrateSettings adopts the new default for it; anything else is a deliberate
 * tuning and is preserved.
 */
const LEGACY_INTERP_DELAY_MS = 100;

/**
 * fps 上限在 v4 之前是全平台 60。手機上那個 60 從來不是玩家「選的」,它就是預設,
 * 所以 v3→v4 對**觸控裝置**上正好等於 60 的 blob 採用新的平台預設 30
 * (owner 2026-07-28)。和上面 interpolationDelay 的做法同形,理由也同形:
 * 不這樣做的話,這個改動對「已經玩過的人」——也就是全部的人——完全沒有效果。
 *
 * ⚠️ 代價要說清楚:手機上**刻意**選過 60 的玩家會被改成 30。設定頁還在,改回去
 * 是一次點擊,而且改回去之後 version 已經是 4,不會再被動到。桌機一律不受影響。
 */
export const LEGACY_UNIVERSAL_FPS_CAP: FpsCap = 60;

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  qualityPreset: "high",
  resolutionScale: 1.0,
  fpsCap: 60,
  shadows: true,
  particleDensity: 1.0,
  drawDistance: 140,
  antialias: true,
  dynamicResolution: true,
  damageNumberCap: 48,
  combatTextScope: "team",
  goreStyle: "default",
  goreIntensity: 1,
};

export const DEFAULT_NETWORK: NetworkSettings = {
  // derived, never a literal — it must track SNAPSHOT_MS to keep the buffer's
  // two-interval headroom (see INTERP_DELAY_MS in @ggd/shared/constants)
  interpolationDelayMs: INTERP_DELAY_MS,
  showPerfOverlay: false,
  showPing: true,
  adaptiveJitterBuffer: false,
  // 派生,不是字面量 —— 預設就是「每一個 sim tick 都有你的輸入」。
  intentHz: INTENT_HZ_DEFAULT,
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  graphics: { ...DEFAULT_GRAPHICS },
  network: { ...DEFAULT_NETWORK },
};

/** localStorage key for the persisted settings blob. */
export const SETTINGS_STORAGE_KEY = "ggd.settings";

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

const FPS_CAPS: readonly FpsCap[] = [0, 30, 60, 120];

/** Clamp/normalize graphics values into their valid ranges. */
export function clampGraphics(g: GraphicsSettings): GraphicsSettings {
  const preset: QualityPreset =
    g.qualityPreset === "low" ||
    g.qualityPreset === "medium" ||
    g.qualityPreset === "high" ||
    g.qualityPreset === "auto"
      ? g.qualityPreset
      : "high";
  return {
    qualityPreset: preset,
    resolutionScale: clamp(g.resolutionScale, 0.5, 1.0),
    fpsCap: FPS_CAPS.includes(g.fpsCap) ? g.fpsCap : 60,
    shadows: Boolean(g.shadows),
    particleDensity: clamp(g.particleDensity, 0, 1),
    drawDistance: clamp(g.drawDistance, 20, 400),
    antialias: Boolean(g.antialias),
    dynamicResolution: Boolean(g.dynamicResolution),
    damageNumberCap: Math.round(clamp(g.damageNumberCap, 4, 64)),
    // a corrupt value falls back to "team" (the default), never to "off" —
    // silently killing the feature would read as a bug, not as a setting
    combatTextScope: COMBAT_TEXT_SCOPES.includes(g.combatTextScope) ? g.combatTextScope : "team",
    goreStyle: GORE_SETTINGS.includes(g.goreStyle) ? g.goreStyle : "default",
    // a corrupt value must fall back to "as authored", NOT to 0 — silently
    // disabling the spray would read as a bug, not as a setting
    goreIntensity: Number.isFinite(g.goreIntensity) ? clamp(g.goreIntensity, 0, 1) : 1,
  };
}

/** Clamp/normalize network values into their valid ranges. */
export function clampNetwork(n: NetworkSettings): NetworkSettings {
  return {
    interpolationDelayMs: Math.round(
      clamp(n.interpolationDelayMs, INTERP_MIN_DELAY_MS, INTERP_MAX_DELAY_MS),
    ),
    showPerfOverlay: Boolean(n.showPerfOverlay),
    showPing: Boolean(n.showPing),
    adaptiveJitterBuffer: Boolean(n.adaptiveJitterBuffer),
    // 有**上界**,不是只有下界(CLAUDE.md #277 的教訓):30 打成 300 會讓手機
    // 每秒送 300 個保證被伺服器丟掉的封包。clampIntentHz 兩邊都夾。
    intentHz: clampIntentHz(n.intentHz),
  };
}

/**
 * Migrate/merge a persisted blob (any older/partial shape) onto the current
 * defaults, clamping every field. Unknown → default; bumps to SETTINGS_VERSION.
 */
export function migrateSettings(raw: unknown, opts: { touch?: boolean } = {}): Settings {
  const obj = (raw ?? {}) as Partial<Settings>;
  const touch = opts.touch === true;
  const g = (obj.graphics ?? {}) as Partial<GraphicsSettings>;
  const n = { ...((obj.network ?? {}) as Partial<NetworkSettings>) };
  // v2 → v3: the snapshot rate went 20 → 30 Hz and the interpolation delay
  // 100 → 66 ms. A returning player's persisted 100 would otherwise pin them to
  // the OLD latency forever — the change would ship and they would never feel
  // it. Only the untouched legacy DEFAULT is adopted forward; a player who
  // deliberately moved the slider keeps their value (clampNetwork still raises
  // anything below the new two-interval floor).
  const priorVersion = typeof obj.version === "number" ? obj.version : 0;
  if (priorVersion < 3 && n.interpolationDelayMs === LEGACY_INTERP_DELAY_MS) {
    n.interpolationDelayMs = DEFAULT_NETWORK.interpolationDelayMs;
  }
  // v3 → v4: fps 上限改成看平台(桌機 60 / 手機 30)。見 LEGACY_UNIVERSAL_FPS_CAP。
  const gg = { ...g };
  if (priorVersion < 4 && touch && gg.fpsCap === LEGACY_UNIVERSAL_FPS_CAP) {
    gg.fpsCap = defaultFpsCap(true) as FpsCap;
  }
  return {
    version: SETTINGS_VERSION,
    graphics: clampGraphics({ ...defaultGraphicsFor(touch), ...gg }),
    network: clampNetwork({ ...DEFAULT_NETWORK, ...n }),
  };
}

/**
 * The shipped graphics defaults FOR THIS PLATFORM. Only `fpsCap` differs;
 * everything else is `DEFAULT_GRAPHICS` verbatim, so there is exactly one place
 * that knows the platform matters at all.
 */
export function defaultGraphicsFor(touch: boolean): GraphicsSettings {
  return { ...DEFAULT_GRAPHICS, fpsCap: defaultFpsCap(touch) as FpsCap };
}

export function cloneSettings(s: Settings): Settings {
  return {
    version: s.version,
    graphics: { ...s.graphics },
    network: { ...s.network },
  };
}

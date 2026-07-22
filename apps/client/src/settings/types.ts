/**
 * settings/types — the typed, versioned client Settings object. Plain data
 * (no Babylon / React / Zustand): the SettingsStore persists it to
 * localStorage and pub/subs changes so graphics + network settings apply LIVE.
 * RenderConfig / QualityController are the consumers that map these values
 * onto the Babylon engine + vfx budgets.
 */

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
  /** 60–200 ms — feeds InterpolationBuffer render delay. */
  interpolationDelayMs: number;
  showPerfOverlay: boolean;
  showPing: boolean;
  /** widen interp delay slightly when snapshot arrival variance is high. */
  adaptiveJitterBuffer: boolean;
}

export interface Settings {
  version: number;
  graphics: GraphicsSettings;
  network: NetworkSettings;
}

/** Bump when the persisted shape changes; migrateSettings deep-merges forward. */
export const SETTINGS_VERSION = 2;

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
  interpolationDelayMs: 100,
  showPerfOverlay: false,
  showPing: true,
  adaptiveJitterBuffer: false,
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
    interpolationDelayMs: Math.round(clamp(n.interpolationDelayMs, 60, 200)),
    showPerfOverlay: Boolean(n.showPerfOverlay),
    showPing: Boolean(n.showPing),
    adaptiveJitterBuffer: Boolean(n.adaptiveJitterBuffer),
  };
}

/**
 * Migrate/merge a persisted blob (any older/partial shape) onto the current
 * defaults, clamping every field. Unknown → default; bumps to SETTINGS_VERSION.
 */
export function migrateSettings(raw: unknown): Settings {
  const obj = (raw ?? {}) as Partial<Settings>;
  const g = (obj.graphics ?? {}) as Partial<GraphicsSettings>;
  const n = (obj.network ?? {}) as Partial<NetworkSettings>;
  return {
    version: SETTINGS_VERSION,
    graphics: clampGraphics({ ...DEFAULT_GRAPHICS, ...g }),
    network: clampNetwork({ ...DEFAULT_NETWORK, ...n }),
  };
}

export function cloneSettings(s: Settings): Settings {
  return {
    version: s.version,
    graphics: { ...s.graphics },
    network: { ...s.network },
  };
}

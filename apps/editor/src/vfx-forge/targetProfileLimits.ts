export type VfxHardCapScope = "scene" | "managed" | "off";
export type VfxRoundPurgeMode = "off" | "soft" | "full";

export interface EffectiveVfxLimits {
  maxParticlesPerSystem: number;
  maxRatePerSystem: number;
  maxActiveRibbons: number;
  ribbonFadeBudgetSec: number;
  hardMaxLifeSec: number;
  hardCapScope: VfxHardCapScope;
  maxOneShotEmitters: number;
  roundPurgeMode: VfxRoundPurgeMode;
}

export interface EffectiveVfxLimitsReceipt extends EffectiveVfxLimits {
  schema: "ggd-effective-vfx-limits@1";
  limitProfileId: string;
  resolverFingerprint: string;
}

const EFFECTIVE_LIMIT_FIELDS = [
  "maxParticlesPerSystem",
  "maxRatePerSystem",
  "maxActiveRibbons",
  "ribbonFadeBudgetSec",
  "hardMaxLifeSec",
  "hardCapScope",
  "maxOneShotEmitters",
  "roundPurgeMode",
] as const satisfies readonly (keyof EffectiveVfxLimits)[];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveNumber(
  value: unknown,
  field: string,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(`effectiveVfxLimits.${field} 必須是正${integer ? "整" : ""}數`);
  }
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new Error(`effectiveVfxLimits.${field} 必須是 1–256 字元的非空字串`);
  }
  return value;
}

/**
 * Read the machine profile's resolved limits. Missing means the older honest
 * compatibility state; a partially present object is contract corruption and
 * fails closed instead of mixing remote and bundled values.
 *
 * JSON cannot encode Infinity, so `maxOneShotEmitters: null` is the explicit
 * representation for the runtime's unlimited rollback mode.
 */
export function readEffectiveVfxLimits(profile: unknown): EffectiveVfxLimitsReceipt | null {
  const root = record(profile);
  if (!root || root["effectiveVfxLimits"] === undefined || root["effectiveVfxLimits"] === null) {
    return null;
  }
  const limits = record(root["effectiveVfxLimits"]);
  if (!limits) throw new Error("effectiveVfxLimits 必須是 JSON object");

  if (limits["schema"] !== "ggd-effective-vfx-limits@1") {
    throw new Error("effectiveVfxLimits.schema 必須是 ggd-effective-vfx-limits@1");
  }

  const hardCapScope = limits["hardCapScope"];
  if (hardCapScope !== "scene" && hardCapScope !== "managed" && hardCapScope !== "off") {
    throw new Error("effectiveVfxLimits.hardCapScope 必須是 scene／managed／off");
  }
  const roundPurgeMode = limits["roundPurgeMode"];
  if (roundPurgeMode !== "off" && roundPurgeMode !== "soft" && roundPurgeMode !== "full") {
    throw new Error("effectiveVfxLimits.roundPurgeMode 必須是 off／soft／full");
  }

  const oneShot = limits["maxOneShotEmitters"];
  const maxOneShotEmitters = oneShot === null
    ? Number.POSITIVE_INFINITY
    : positiveNumber(oneShot, "maxOneShotEmitters", true);

  return {
    schema: "ggd-effective-vfx-limits@1",
    limitProfileId: nonEmptyString(limits["limitProfileId"], "limitProfileId"),
    resolverFingerprint: nonEmptyString(limits["resolverFingerprint"], "resolverFingerprint"),
    maxParticlesPerSystem: positiveNumber(limits["maxParticlesPerSystem"], "maxParticlesPerSystem", true),
    maxRatePerSystem: positiveNumber(limits["maxRatePerSystem"], "maxRatePerSystem", true),
    maxActiveRibbons: positiveNumber(limits["maxActiveRibbons"], "maxActiveRibbons", true),
    ribbonFadeBudgetSec: positiveNumber(limits["ribbonFadeBudgetSec"], "ribbonFadeBudgetSec"),
    hardMaxLifeSec: positiveNumber(limits["hardMaxLifeSec"], "hardMaxLifeSec"),
    hardCapScope,
    maxOneShotEmitters,
    roundPurgeMode,
  };
}

export function vfxLimitDrift(
  runtime: EffectiveVfxLimits,
  advertised: EffectiveVfxLimits,
): readonly string[] {
  return EFFECTIVE_LIMIT_FIELDS.flatMap((field) =>
    Object.is(runtime[field], advertised[field])
      ? []
      : [`${field}: renderer=${String(runtime[field])}, profile=${String(advertised[field])}`],
  );
}

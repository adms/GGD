import { Configs } from "@ggd/shared/content";
import {
  maxParticlesPerSystem,
  maxRatePerSystem,
  setParticleDensityCaps,
} from "../../../client/src/vfx/particleFactory";
import {
  oneShotEmitterCap,
  roundPurgeModeOf,
  vfxCleanupPolicy,
  vfxHardMaxLifeSec,
} from "../../../client/src/vfx/vfxCleanupPolicy";
import { MAX_ACTIVE_RIBBONS } from "../../../client/src/vfx/RibbonTrail";
import { RIBBON_FADE_BUDGET_SEC } from "../../../client/src/vfx/ribbonMath";

export interface EffectiveVfxLimits {
  maxParticlesPerSystem: number;
  maxRatePerSystem: number;
  maxActiveRibbons: number;
  ribbonFadeBudgetSec: number;
  hardMaxLifeSec: number;
  maxOneShotEmitters: number;
  roundPurgeMode: string;
}

/**
 * Install and read the same live knobs as the shipped client. No literal
 * budget lives in the editor: changing config or a runtime clamp changes both
 * the preview and the numbers shown to the author.
 */
export function applyVfxRuntimeLimits(): EffectiveVfxLimits {
  setParticleDensityCaps(
    Configs.tryGet("vfx-budget") as
      | { maxParticlesPerSystem?: number; maxRatePerSystem?: number }
      | undefined,
  );
  const cleanup = vfxCleanupPolicy();
  return {
    maxParticlesPerSystem: maxParticlesPerSystem(),
    maxRatePerSystem: maxRatePerSystem(),
    maxActiveRibbons: MAX_ACTIVE_RIBBONS,
    ribbonFadeBudgetSec: RIBBON_FADE_BUDGET_SEC,
    hardMaxLifeSec: vfxHardMaxLifeSec(cleanup),
    maxOneShotEmitters: oneShotEmitterCap(cleanup),
    roundPurgeMode: roundPurgeModeOf(cleanup),
  };
}

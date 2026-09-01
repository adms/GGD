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
  vfxHardCapScope,
  vfxHardMaxLifeSec,
} from "../../../client/src/vfx/vfxCleanupPolicy";
import { MAX_ACTIVE_RIBBONS } from "../../../client/src/vfx/RibbonTrail";
import { RIBBON_FADE_BUDGET_SEC } from "../../../client/src/vfx/ribbonMath";
import {
  vfxLimitDrift,
  type EffectiveVfxLimits,
} from "./targetProfileLimits";

export type { EffectiveVfxLimits } from "./targetProfileLimits";

/**
 * Install and read the same live knobs as the shipped client. No literal
 * budget lives in the editor: changing config or a runtime clamp changes both
 * the preview and the numbers shown to the author.
 */
export function applyVfxRuntimeLimits(
  advertised: EffectiveVfxLimits | null = null,
): EffectiveVfxLimits {
  setParticleDensityCaps(
    advertised ?? Configs.tryGet("vfx-budget") as
      | { maxParticlesPerSystem?: number; maxRatePerSystem?: number }
      | undefined,
  );
  const cleanup = vfxCleanupPolicy();
  const runtime: EffectiveVfxLimits = {
    maxParticlesPerSystem: maxParticlesPerSystem(),
    maxRatePerSystem: maxRatePerSystem(),
    maxActiveRibbons: MAX_ACTIVE_RIBBONS,
    ribbonFadeBudgetSec: RIBBON_FADE_BUDGET_SEC,
    hardMaxLifeSec: vfxHardMaxLifeSec(cleanup),
    hardCapScope: vfxHardCapScope(cleanup),
    maxOneShotEmitters: oneShotEmitterCap(cleanup),
    roundPurgeMode: roundPurgeModeOf(cleanup),
  };
  if (!advertised) return runtime;

  const drift = vfxLimitDrift(runtime, advertised);
  if (drift.length > 0) {
    throw new Error(
      `VFX_RUNTIME_LIMIT_DRIFT：正式站宣告值與目前預覽 renderer 不一致（${drift.join("；")}）`,
    );
  }
  return advertised;
}

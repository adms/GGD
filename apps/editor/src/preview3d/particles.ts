/**
 * Editor preview adapter over the CLIENT particle factory — preview == ship.
 * The single toParticleSystem implementation lives in
 * `apps/client/src/vfx/particleFactory.ts`; this module only rebinds
 * texture-URL resolution to the editor's content-api mount. (Relative source
 * import: @ggd/client is a private app with no package export surface, and
 * pnpm resolves the client file's own deps — @babylonjs/core, @ggd/shared —
 * to the same store realpaths the editor uses.)
 */
import type { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import {
  toParticleSystem as sharedToParticleSystem,
  type ToParticleSystemOptions,
} from "../../../client/src/vfx/particleFactory";
import { assetUrl } from "./assetUrl";

export {
  burstNow,
  capacityFor,
  scaledBurstCount,
  blendModeFor,
  colorStopsFor,
  sizeStopsFor,
  spriteCellMapping,
  type ToParticleSystemOptions,
} from "../../../client/src/vfx/particleFactory";

/** Client factory with the editor's content-api texture-URL mapping. */
export function toParticleSystem(
  doc: VfxDoc,
  scene: Scene,
  opts: ToParticleSystemOptions = {},
): ParticleSystem {
  return sharedToParticleSystem(doc, scene, { resolveTextureUrl: assetUrl, ...opts });
}

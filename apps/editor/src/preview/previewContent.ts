import {
  ContentLoader,
  HttpContentSource,
  registerAll,
  type LoadResult,
} from "@ggd/shared/content";
import { applyVfxRuntimeLimits, type EffectiveVfxLimits } from "../vfx-forge/runtimeLimits";

export interface PreviewContentReady {
  contentVersion: string;
  warnings: number;
  quarantined: number;
  limits: EffectiveVfxLimits;
}

let active: Promise<PreviewContentReady> | null = null;

/**
 * Load the same parsed/expanded/registered content graph used by the game.
 *
 * A raw champion plus a raw ability is not enough for a truthful SimWorld:
 * combo-family cadence, tier values, statuses, projectiles and model presets
 * live in other collections.  Keeping this as one shared promise also makes
 * React StrictMode unable to start two competing registry loads.
 */
export function ensurePreviewContentReady(): Promise<PreviewContentReady> {
  if (active) return active;
  active = new ContentLoader(new HttpContentSource({
    baseUrl: "/content-api",
    mode: "api",
    // Chromium's Window.fetch requires its receiver. HttpContentSource keeps
    // the callback as a member and invokes that member, so hand it a closure
    // instead of the bare host function (which throws "Illegal invocation").
    fetchFn: (input, init) => globalThis.fetch(input, init),
  }))
    .load({ policy: "fail-closed" })
    .then((result: LoadResult) => {
      registerAll(result.store);
      return {
        contentVersion: result.manifest.contentVersion,
        warnings: result.warnings.length,
        quarantined: result.quarantined.length,
        limits: applyVfxRuntimeLimits(),
      };
    })
    .catch((error: unknown) => {
      active = null;
      throw error;
    });
  return active;
}

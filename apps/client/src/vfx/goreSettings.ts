/**
 * goreSettings — the one-way bridge from the user's graphics settings onto the
 * vfx layer's gore config (task #39).
 *
 * Kept out of `goreConfig.ts` on purpose: that module is pure data with no
 * imports, so the content layer (ContentDb) can push the art-directed doc in
 * without dragging the settings singleton — and the reducers stay trivially
 * unit-testable. This file is the only place the two meet.
 *
 * Direction is strictly settings → vfx. The player's choice always wins over
 * the content doc, and `applyPreset` never touches the gore fields, so picking
 * a graphics preset can never quietly turn blood back on.
 */
import { settingsStore, type GoreSetting, type GraphicsSettings } from "../settings";
import { setGoreOverride, type GoreOverride } from "./goreConfig";

/** Map the persisted graphics fields onto the vfx override. PURE. */
export function goreOverrideFrom(g: Pick<GraphicsSettings, "goreStyle" | "goreIntensity">): GoreOverride {
  return {
    style: (g.goreStyle satisfies GoreSetting) === "default" ? "default" : g.goreStyle,
    intensityScale: g.goreIntensity,
  };
}

let unbind: (() => void) | null = null;

/**
 * Push the current settings into the vfx layer and keep them in sync.
 * Idempotent: calling it twice re-binds rather than stacking subscriptions.
 * Returns an unbinder (test seam / teardown).
 */
export function bindGoreToSettings(store = settingsStore): () => void {
  unbind?.();
  setGoreOverride(goreOverrideFrom(store.graphics()));
  const off = store.subscribe((s) => setGoreOverride(goreOverrideFrom(s.graphics)));
  unbind = (): void => {
    off();
    unbind = null;
  };
  return unbind;
}

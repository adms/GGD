/**
 * clipMap resolution — logical animation states (idle/run/attack/cast/hurt/
 * death) mapped to AnimationGroup clip names inside a .glb. Pure functions so
 * the model inspector's mapping logic is unit-testable against a stub clip
 * list (anything with a `name`).
 */
import type { ModelDoc } from "@ggd/shared/content";

export interface NamedClip {
  name: string;
}

// ⭐⭐ GH#940 —— 這裡本來是**第二個** `CLIP_STATES`（同名、同內容、各自漂）。
// ⇒ 轉出唯一住處那一份（`packages/shared/src/voxel/clips.ts`，它與
//   `zClipMap` 的 `.strict()` 綁在一起 ⇒ 那個綁定是承重的）。
import { ANIM_STATES } from "@ggd/shared/content/animPulse";
import type { AnimState } from "@ggd/shared/content/animPulse";

// ⭐ 轉出同一份 —— 本地名字保住既有的 import 端（⛔ 搬家不逼消費者改一行）。
export const CLIP_STATES = ANIM_STATES;
export type ClipState = AnimState;

/**
 * Find the AnimationGroup for a clip name: exact match first, then a
 * case-insensitive fallback (author typo forgiveness). Null when missing —
 * the inspector shows that state as a mapping error.
 */
export function resolveClip<T extends NamedClip>(groups: readonly T[], clipName: string): T | null {
  const exact = groups.find((g) => g.name === clipName);
  if (exact) return exact;
  const lower = clipName.toLowerCase();
  return groups.find((g) => g.name.toLowerCase() === lower) ?? null;
}

export interface ClipMapEntry {
  state: ClipState;
  clip: string;
  found: boolean;
}

/** Per-state resolution report for a doc's clipMap against the GLB's groups. */
export function clipMapStatus(
  clipMap: ModelDoc["clipMap"],
  groups: readonly NamedClip[],
): ClipMapEntry[] {
  return CLIP_STATES.map((state) => {
    const clip = clipMap[state];
    return { state, clip, found: resolveClip(groups, clip) !== null };
  });
}

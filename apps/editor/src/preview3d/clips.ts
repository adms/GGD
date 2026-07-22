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

export const CLIP_STATES = ["idle", "run", "attack", "cast", "hurt", "death"] as const;
export type ClipState = (typeof CLIP_STATES)[number];

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

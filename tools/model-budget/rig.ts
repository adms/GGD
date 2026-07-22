/**
 * rig — the rig-survival check the geometry decimator must pass before its
 * output is accepted.
 *
 * meshoptimizer's simplifier only rewrites the index/vertex buffers and remaps
 * JOINTS_0 / WEIGHTS_0; it must not add or drop a joint, a clip or a channel,
 * and every skinned primitive must still carry its weights. Anything else means
 * the decimation broke the rig — and a decimator that destroys a skinned mesh's
 * weights is worse than the oversized model it replaced, so optimize.ts REJECTS
 * such a candidate and never writes it. This module is separate from the CLI so
 * the check can be unit-tested against real files.
 */
import { measureGlb, readGlb } from "./glb";

export interface RigSummary {
  skins: number;
  joints: number;
  clips: number;
  channels: number;
  tris: number;
  skinnedPrims: number;
  withWeights: number;
}

export interface RigCheck {
  ok: boolean;
  reasons: string[];
  before: RigSummary;
  after: RigSummary;
}

export function summariseRig(file: string): RigSummary {
  const g = readGlb(file);
  const skins: any[] = g.json.skins ?? [];
  const anims: any[] = g.json.animations ?? [];
  const m = measureGlb(file);
  let skinnedPrims = 0;
  let withWeights = 0;
  for (const mesh of g.json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      if (p.attributes?.JOINTS_0 !== undefined) {
        skinnedPrims++;
        if (p.attributes?.WEIGHTS_0 !== undefined) withWeights++;
      }
    }
  }
  return {
    skins: skins.length,
    joints: skins.reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    clips: anims.length,
    channels: anims.reduce((n, a) => n + (a.channels?.length ?? 0), 0),
    tris: m.triangles,
    skinnedPrims,
    withWeights,
  };
}

/**
 * Compare a decimated candidate against its source. The candidate must have the
 * same skeleton (skins, joints), the same animation (clips, channels), still
 * carry weights on every skinned primitive, and actually have FEWER triangles
 * (a decimation that did nothing is not worth adopting).
 */
export function checkRig(srcFile: string, candidateFile: string): RigCheck {
  const before = summariseRig(srcFile);
  const after = summariseRig(candidateFile);
  const reasons: string[] = [];
  if (after.skins !== before.skins) reasons.push(`skin count ${before.skins}→${after.skins}`);
  if (after.joints !== before.joints) reasons.push(`joint count ${before.joints}→${after.joints}`);
  if (after.clips !== before.clips) reasons.push(`animation clip count ${before.clips}→${after.clips}`);
  if (after.channels !== before.channels) reasons.push(`animation channel count ${before.channels}→${after.channels}`);
  if (before.skinnedPrims > 0 && after.withWeights < after.skinnedPrims)
    reasons.push(`${after.skinnedPrims - after.withWeights} skinned primitive(s) lost WEIGHTS_0`);
  if (after.tris >= before.tris) reasons.push(`triangles did not decrease (${before.tris}→${after.tris})`);
  return { ok: reasons.length === 0, reasons, before, after };
}

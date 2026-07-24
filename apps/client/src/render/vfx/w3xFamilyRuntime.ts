/**
 * `_w3x-families.json` → something `W3xEmitterRig.play()` can take.
 *
 * PURE — no `@babylonjs` import, so it runs in the doc generator, in Node tests
 * and in the editor. The rig already knows how to hang N emitters off one
 * attachment point at N pivots; this file's only jobs are
 *   (1) resolve each layer's `docId` against the loaded `vfx` collection,
 *   (2) hand the layer's stored `runtime` flags straight through, and
 *   (3) expand a 蝗蟲群 `swarm` LAYOUT into the ring of member instances WC3
 *       actually spawned — count, radius, stagger, tint and scale all coming
 *       from the map's own object data.
 *
 * (3) is the only non-obvious part. WC3 draws a locust swarm with N *units*,
 * which `vfx@1` cannot do, so the ring is rebuilt as N copies of one member
 * emitter placed at the real radius. Every copy is a normal emitter spec with
 * its own `pivotOffset`, which means the existing budget pass sees a ring and
 * subsamples it EVENLY instead of cutting a contiguous arc out of it — no rig
 * change was needed for that, it falls out of the layout being data.
 */
import type { VfxDoc } from "@ggd/shared/content";
import { MAX_SYSTEMS_PER_EFFECT } from "./emitterBudget";
import type { W3xEffectSpec, W3xEmitterSpec } from "./W3xEmitterRig";
import type { W3xFamilyEffect, W3xSwarmLayout } from "./w3xFamilies";

export interface FamilySpecOptions {
  /** ability level, 1-based — picks the swarm's member count */
  level?: number;
  /**
   * Doc id for a swarm member, REQUIRED when the effect is a layout-only
   * swarm (`layers: []`). There is deliberately no default: the member art is
   * a Blizzard model this repo does not have, and quietly substituting one
   * would be exactly the invention the fidelity rules forbid.
   */
  memberDocId?: string;
  /** cap the expanded member count (the audition page's slider) */
  maxSwarmMembers?: number;
}

export interface FamilySpecResult {
  spec: W3xEffectSpec | null;
  /** doc ids the manifest names that the collection does not have */
  missingDocIds: string[];
  /** why `spec` is null, or what had to be substituted */
  problems: string[];
}

/** Multiply every colour stop by `rgb` — the swarm member's `uclr/uclg/uclb`. */
export function tintVfxDoc(doc: VfxDoc, rgb: readonly [number, number, number]): VfxDoc {
  const mul = (c: readonly [number, number, number, number]): [number, number, number, number] => [
    clamp01(c[0] * rgb[0]),
    clamp01(c[1] * rgb[1]),
    clamp01(c[2] * rgb[2]),
    c[3],
  ];
  return {
    ...doc,
    color: { start: mul(doc.color.start), end: mul(doc.color.end) },
    ...(doc.colorStops
      ? { colorStops: doc.colorStops.map(([t, c]) => [t, mul(c)] as [number, [number, number, number, number]]) }
      : {}),
  };
}

/** Multiply every size stop — the swarm member's `usca`. */
export function scaleVfxDoc(doc: VfxDoc, k: number): VfxDoc {
  if (k === 1) return doc;
  return {
    ...doc,
    size: { start: Math.max(doc.size.start * k, 1e-4), end: Math.max(doc.size.end * k, 0) },
    ...(doc.sizeStops
      ? { sizeStops: doc.sizeStops.map(([t, s]) => [t, Math.max(s * k, 0)] as [number, number]) }
      : {}),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Members alive at the given ability level (WC3 levels are 1-based). */
export function swarmCountForLevel(swarm: W3xSwarmLayout, level: number): number {
  const i = Math.max(1, Math.min(level, swarm.countPerLevel.length)) - 1;
  return swarm.countPerLevel[i] ?? swarm.countPerLevel[0] ?? 0;
}

/**
 * The ring: `PolarProjection(radius, 360°·i/N)`, one member every
 * `spawnIntervalSec`. Members sit on the GROUND plane (WC3 XY → Babylon XZ),
 * which is why `y` is 0 and not the radius.
 *
 * WHAT IS DATA AND WHAT IS AN ASSUMPTION, because they are NOT the same here:
 *   · DATA — the member count per level (`AUls` DataA), the stagger (DataB) and
 *     the radius (the ability's `aare`, 600 WC3 = 11 world units). Read from
 *     `war3map.w3a`.
 *   · ASSUMPTION — the ARRANGEMENT. WC3's locusts are units: they spawn on the
 *     caster and fly out to whatever is inside `aare`, so at any instant they
 *     are scattered through the disc, not pinned to its rim. The object data
 *     says nothing about where they are, so this places them evenly on the rim:
 *     deterministic, and it keeps the budget's even-subsample meaningful (drop
 *     members and it stays a ring). It is the arrangement, not the size, that
 *     is invented — and `aare` is a 600-range AoE, so at 11 world units against
 *     a 1.7-unit champion the ring is genuinely wide. That is the map's number,
 *     reported rather than quietly shrunk ([[ggd-faithful-import-over-rescale]]).
 */
export function swarmRingPlacements(
  swarm: W3xSwarmLayout,
  count: number,
): { x: number; y: number; z: number; delaySec: number }[] {
  const out: { x: number; y: number; z: number; delaySec: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / Math.max(count, 1);
    out.push({
      x: Math.cos(a) * swarm.radiusWorld,
      y: 0,
      z: Math.sin(a) * swarm.radiusWorld,
      delaySec: i * swarm.spawnIntervalSec,
    });
  }
  return out;
}

export function familyEffectToSpec(
  effect: W3xFamilyEffect,
  docsById: ReadonlyMap<string, VfxDoc>,
  opts: FamilySpecOptions = {},
): FamilySpecResult {
  const missingDocIds: string[] = [];
  const problems: string[] = [];

  if (effect.swarm) {
    const swarm = effect.swarm;
    const memberId = opts.memberDocId ?? effect.layers[0]?.docId;
    if (!memberId) {
      problems.push(
        `${effect.id} is a LAYOUT-ONLY swarm: WC3 drew each member as \`${swarm.memberModel}\`, which this repo does not have. Pass \`memberDocId\` to choose a stand-in — the rig will not pick one for you.`,
      );
      return { spec: null, missingDocIds, problems };
    }
    const base = docsById.get(memberId);
    if (!base) {
      missingDocIds.push(memberId);
      return { spec: null, missingDocIds, problems };
    }
    if (memberId !== effect.layers[0]?.docId) {
      problems.push(
        `Member art is a STAND-IN (\`${memberId}\`); the original is \`${swarm.memberModel}\`. Count, radius, stagger, tint and scale below are the map's own.`,
      );
    }
    const runtime = effect.layers[0]?.runtime;
    const wanted = swarmCountForLevel(swarm, opts.level ?? swarm.countPerLevel.length);
    const count = Math.min(wanted, opts.maxSwarmMembers ?? wanted);
    if (count < wanted) {
      problems.push(`swarm truncated to ${count} of ${wanted} members by maxSwarmMembers`);
    }
    if (count > MAX_SYSTEMS_PER_EFFECT) {
      // Say this out loud rather than letting the budget quietly decide it.
      // `planEffectBudget` will keep MAX_SYSTEMS_PER_EFFECT members EVENLY
      // around the ring (so it stays a ring) and fold the dropped members'
      // emission rate into the survivors. For a ring of one continuous fire —
      // DivineRing — folding preserves the look. For a swarm of DISCRETE
      // creatures it does not: N sparse members become 6 dense ones, and "many
      // things circling you" reads as "six geysers". That is a real deviation,
      // not a rounding error, and the fix is a system budget this effect can
      // afford, not a quieter message.
      problems.push(
        `${count} members exceeds MAX_SYSTEMS_PER_EFFECT (${MAX_SYSTEMS_PER_EFFECT}). The budget will keep ${MAX_SYSTEMS_PER_EFFECT} evenly around the ring and fold the rest's emission into them — fewer, denser members, which reads differently from WC3's ${count} separate creatures.`,
      );
    }
    problems.push(
      `Arrangement is an ASSUMPTION, not data: members are spread evenly on the rim of the ${swarm.radiusWc3}-range AoE (${swarm.radiusWorld} world units). WC3's locusts are units that spawn on the caster and fly out, so they are scattered through the disc. Count / stagger / radius / tint / scale are the map's; the ring is this engine's.`,
    );
    const member = scaleVfxDoc(tintVfxDoc(base, swarm.memberTint), swarm.memberScale);
    const emitters: W3xEmitterSpec[] = swarmRingPlacements(swarm, count).map((p, i) => ({
      // A distinct id per member: the rig pools by doc id AND indexes the
      // runtime flags by it, so N members sharing one id would collapse onto
      // one pivot — the same failure mode the DivineRing pivots exposed.
      doc: { ...member, id: `${member.id}~s${String(i).padStart(2, "0")}` },
      runtime: {
        modelSpace: runtime?.modelSpace ?? false,
        xYQuad: runtime?.xYQuad ?? false,
        lineEmitter: runtime?.lineEmitter ?? false,
        wantsHeadAndTail: false,
        priorityPlane: runtime?.priorityPlane ?? 0,
        pivotOffset: { x: p.x, y: p.y, z: p.z },
        trackFrameSec: runtime?.trackFrameSec ?? 1 / 1000,
      },
      delaySec: p.delaySec,
    }));
    return {
      spec: {
        id: effect.id,
        emitters,
        ...(effect.attach ? { attach: effect.attach } : {}),
        ...(effect.durationSec !== null ? { durationSec: effect.durationSec } : {}),
      },
      missingDocIds,
      problems,
    };
  }

  const emitters: W3xEmitterSpec[] = [];
  for (const layer of effect.layers) {
    const doc = docsById.get(layer.docId);
    if (!doc) {
      missingDocIds.push(layer.docId);
      continue;
    }
    emitters.push({ doc, runtime: layer.runtime });
  }
  if (emitters.length === 0) {
    problems.push(`${effect.id} resolved to zero emitters`);
    return { spec: null, missingDocIds, problems };
  }
  return {
    spec: {
      id: effect.id,
      emitters,
      ...(effect.attach ? { attach: effect.attach } : {}),
      ...(effect.durationSec !== null ? { durationSec: effect.durationSec } : {}),
    },
    missingDocIds,
    problems,
  };
}

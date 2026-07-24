/**
 * PARTICLE BUDGET for rebuilt WC3 effects.
 *
 * THE PROBLEM IS REAL, NOT THEORETICAL. A faithful WC3 effect is not one
 * emitter: `DivineRing.mdx` has **20** `PRE2` emitters, `EarthTornado2.mdx` and
 * `LightningTornado.mdx` have **14** each, `AquaSpikeVersion2.mdx` has 12. This
 * arena puts up to **12 champions on screen at once**, several of them carrying
 * a PERSISTENT `Asph` orb (76 abilities in the map are orbs — they are on for
 * the whole match, not for a cast). Bind those naively and a single teamfight is
 * 200+ `ParticleSystem`s — i.e. 200+ draw calls — before anyone casts anything.
 *
 * THREE MECHANISMS, IN THIS ORDER (cheapest damage first):
 *
 *  1. **MERGE identical emitters.** WC3 artists stack N copies of one emitter to
 *     thicken an effect: 5 of `DivineRing`'s 20 are byte-identical rings. Merging
 *     them into one system at N× the rate is VISUALLY LOSSLESS — same particles,
 *     same count, same look — and it is where most of the win comes from. Do
 *     this before considering any actual degradation.
 *  2. **DROP the least visible emitters.** Ranked by an explicit contribution
 *     score, so what survives is the part of the effect a player can actually
 *     see, not whichever emitter happened to be first in the file.
 *  3. **SCALE the emission rate** of what remains, as the last resort — it keeps
 *     the effect's shape and colour and only thins it.
 *
 * Never dropped: the highest-scoring emitter of an effect. An effect that is on
 * screen at all draws SOMETHING, so an ability never becomes silently invisible
 * under load (which is exactly the failure the #98 empty glbs already caused).
 *
 * HONEST LIMIT: the screen caps are applied PER PLAY against the population at
 * that moment, and a live effect keeps the allocation it was given. So twelve
 * effects starting in quick succession overshoot the nominal system cap by
 * whatever the earlier ones already committed — measured on the audition page:
 * 12 × DivineRing = 70 systems against a nominal 64 (+9%), 4,881 live particles
 * against a nominal 8,000. Re-planning live effects every frame would fix the
 * overshoot and cost a rebuild of every ParticleSystem mid-flight, which is a
 * worse trade. The overshoot is bounded by MAX_SYSTEMS_PER_EFFECT × effects.
 *
 * Pure — no Babylon import, no scene, fully unit-testable.
 */
import type { VfxDoc } from "@ggd/shared/content";

// ---------------------------------------------------------------------------
// Screen budgets
// ---------------------------------------------------------------------------

/**
 * Live particles allowed across ALL rebuilt WC3 effects at quality 1.0.
 *
 * Derivation: 12 champions × ~600 particles each. 600 is roughly two of this
 * project's existing `fx.prim.*` bursts in flight (`burstCount` 40–52, capacity
 * ×2) plus a persistent orb, which is what a champion realistically shows.
 */
export const SCREEN_PARTICLE_BUDGET = 8000;

/**
 * Live `ParticleSystem`s (≈ draw calls) allowed across all rebuilt WC3 effects.
 * 64 keeps the particle layer well under the per-frame draw-call headroom the
 * arena renderer leaves after terrain, 12 champion models and the HUD.
 */
export const SCREEN_SYSTEM_BUDGET = 64;

/** Systems ONE effect may ever use, however many emitters its model had. */
export const MAX_SYSTEMS_PER_EFFECT = 6;

export interface BudgetContext {
  /** how many rebuilt effects are live right now (including this one), >= 1 */
  liveEffects: number;
  /** RenderConfig particle-density multiplier (mobile tier halves it) */
  qualityScale?: number;
  /** override for tests / the audition page */
  screenParticleBudget?: number;
  screenSystemBudget?: number;
  maxSystemsPerEffect?: number;
  /** extra merge discriminator — see `Distinguish` (the pivot lives here) */
  distinguish?: Distinguish;
}

// ---------------------------------------------------------------------------
// Cost + contribution
// ---------------------------------------------------------------------------

/**
 * Particles this doc keeps alive in steady state.
 *
 * Continuous: `rate × maxLifetime` is the classic Little's-law occupancy.
 * Burst: the whole burst is alive at once, and a pooled instance can be re-fired
 * while the previous burst still has particles in flight — so budget for two,
 * matching `particleFactory.capacityFor`.
 */
export function liveParticleEstimate(doc: VfxDoc): number {
  if (doc.mode === "burst") return Math.max(1, (doc.burstCount ?? 24) * 2);
  return Math.max(1, Math.ceil((doc.rate ?? 30) * doc.lifetimeSec.max));
}

/** Peak size and peak alpha over the doc's authored gradients. */
function peaks(doc: VfxDoc): { size: number; alpha: number } {
  const sizes = doc.sizeStops?.map(([, s]) => s) ?? [doc.size.start, doc.size.end];
  const alphas = doc.colorStops?.map(([, c]) => c[3]) ?? [doc.color.start[3], doc.color.end[3]];
  return { size: Math.max(0, ...sizes), alpha: Math.max(0, ...alphas) };
}

/**
 * How much of the screen this emitter actually paints — the ranking used when
 * something has to go.
 *
 * `size²` because a particle is a quad (its screen area is quadratic in size),
 * `alpha` because a near-transparent layer is barely perceptible, `sqrt(count)`
 * because overlapping particles saturate rather than add linearly, and a small
 * additive bonus because an additive layer reads brighter than the same pixels
 * blended. A zero-alpha or zero-size emitter scores 0 and is dropped first — it
 * is invisible by construction.
 */
export function contributionScore(doc: VfxDoc): number {
  const { size, alpha } = peaks(doc);
  if (size <= 0 || alpha <= 0) return 0;
  const count = liveParticleEstimate(doc);
  const blendBonus = doc.blendMode === "additive" ? 1.15 : 1;
  return size * size * alpha * Math.sqrt(count) * blendBonus;
}

// ---------------------------------------------------------------------------
// 1. Merge identical emitters (visually lossless)
// ---------------------------------------------------------------------------

/**
 * Caller-supplied discriminator appended to the merge signature.
 *
 * Two emitters can be identical as `vfx@1` docs and still be visually distinct
 * because of something the doc cannot carry — above all the emitter's PIVOT.
 * `DivineRing`'s 20 emitters differ ONLY in where they sit, and that layout is
 * the ring. Merging them on doc equality alone would collapse the ring into a
 * single column, so `W3xEmitterRig` passes the pivot (and the WC3 node flags)
 * through here.
 */
export type Distinguish = (doc: VfxDoc) => string;

function mergeSignature(doc: VfxDoc, distinguish?: Distinguish): string {
  const { id: _id, rate: _rate, burstCount: _burst, ...rest } = doc;
  return JSON.stringify(rest) + (distinguish ? "|" + distinguish(doc) : "");
}

/**
 * Fold byte-identical emitters into one system carrying their combined
 * emission. VISUALLY LOSSLESS: the same number of identical particles is born
 * per second from the same shape — only the number of draw calls changes.
 *
 * Order is stable (first occurrence wins its position) so a given effect always
 * merges the same way — replays and screenshots stay comparable.
 */
export function mergeIdenticalEmitters(docs: readonly VfxDoc[], distinguish?: Distinguish): VfxDoc[] {
  const byKey = new Map<string, VfxDoc>();
  const order: string[] = [];
  for (const doc of docs) {
    const key = mergeSignature(doc, distinguish);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...doc });
      order.push(key);
      continue;
    }
    if (prev.mode === "burst") prev.burstCount = (prev.burstCount ?? 0) + (doc.burstCount ?? 0);
    else prev.rate = Math.round(((prev.rate ?? 0) + (doc.rate ?? 0)) * 1000) / 1000;
    // The survivor keeps the lexicographically smallest id of the group, so the
    // merged emitter's identity does not depend on the order emitters happened
    // to appear in the .mdx — which matters because that id is the POOL KEY.
    if (doc.id < prev.id) prev.id = doc.id;
  }
  return order.map((k) => byKey.get(k)!);
}

// ---------------------------------------------------------------------------
// 2 + 3. The plan
// ---------------------------------------------------------------------------

export interface BudgetedEmitter {
  doc: VfxDoc;
  /** 1 = faithful emission; < 1 = thinned to fit the budget */
  rateScale: number;
  /** particles this emitter is expected to keep alive after `rateScale` */
  particles: number;
  /** how many source emitters were folded into this one by the merge pass */
  mergedFrom: number;
}

export interface EffectBudgetPlan {
  /** the emitters to actually build, highest contribution first */
  emitters: BudgetedEmitter[];
  /** doc ids that were dropped entirely, in drop order */
  dropped: string[];
  /** systems before/after the merge pass — the lossless win */
  systemsBeforeMerge: number;
  systemsAfterMerge: number;
  /** total live particles the plan is expected to cost */
  particles: number;
  /** true when nothing was dropped and nothing was thinned */
  faithful: boolean;
}

/**
 * Fit one effect's emitters into this frame's share of the screen budget.
 *
 * The share shrinks as more effects go live, so a 1-v-1 skirmish shows the full
 * 20-emitter `DivineRing` and a 12-champion teamfight shows its strongest few —
 * degradation is gradual and is driven by what is on screen, not by a fixed
 * quality tier alone.
 */
export function planEffectBudget(docs: readonly VfxDoc[], ctx: BudgetContext): EffectBudgetPlan {
  const quality = Math.max(0.05, ctx.qualityScale ?? 1);
  const live = Math.max(1, Math.trunc(ctx.liveEffects));
  const particleBudget = ((ctx.screenParticleBudget ?? SCREEN_PARTICLE_BUDGET) * quality) / live;
  const systemBudget = Math.max(
    1,
    Math.min(
      ctx.maxSystemsPerEffect ?? MAX_SYSTEMS_PER_EFFECT,
      Math.floor(((ctx.screenSystemBudget ?? SCREEN_SYSTEM_BUDGET) * quality) / live) || 1,
    ),
  );

  const systemsBeforeMerge = docs.length;
  const merged = mergeIdenticalEmitters(docs, ctx.distinguish);
  // how many originals each survivor absorbed (for the report / audition page)
  const counts = new Map<string, number>();
  for (const d of docs) {
    const k = mergeSignature(d, ctx.distinguish);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const ranked = merged
    .map((doc) => ({ doc, score: contributionScore(doc), mergedFrom: counts.get(mergeSignature(doc, ctx.distinguish)) ?? 1 }))
    // stable, deterministic: score desc, then id asc so ties never reorder
    .sort((a, b) => b.score - a.score || (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0));

  // ---- families: emitters that differ ONLY in what `distinguish` sees ------
  // These are the same particles placed differently — a RING of 20, a WALL of
  // 12. Cutting one by rank picks an arbitrary contiguous arc (the tie-break is
  // the id) and leaves a broken ring. Cutting it by EVEN SUBSAMPLING leaves a
  // sparser ring that is still a ring, and folding the dropped members'
  // emission into the survivors keeps the effect's brightness. Watching a
  // 20-emitter DivineRing lose 14 arcs on the audition page is what put this
  // pass here.
  const families = new Map<string, typeof ranked>();
  const familyOrder: string[] = [];
  for (const r of ranked) {
    const key = mergeSignature(r.doc); // NO distinguish: the visual family
    let fam = families.get(key);
    if (!fam) {
      fam = [];
      families.set(key, fam);
      familyOrder.push(key);
    }
    fam.push(r);
  }

  // allocate systems across families: one each (in rank order) then the
  // remainder proportionally to family size, so a 20-emitter ring gets most of
  // the budget and a lone spark still gets its one system
  const alloc = new Map<string, number>();
  let remaining = systemBudget;
  for (const key of familyOrder) {
    if (remaining <= 0) break;
    alloc.set(key, 1);
    remaining--;
  }
  const wanted = familyOrder.map((k) => Math.max(0, (families.get(k)!.length ?? 0) - (alloc.get(k) ?? 0)));
  const totalWanted = wanted.reduce((a, b) => a + b, 0);
  if (remaining > 0 && totalWanted > 0) {
    familyOrder.forEach((k, i) => {
      const extra = Math.min(wanted[i]!, Math.round((wanted[i]! / totalWanted) * systemBudget));
      const give = Math.min(extra, remaining);
      alloc.set(k, (alloc.get(k) ?? 0) + give);
      remaining -= give;
    });
    // hand any rounding leftovers to the biggest families, in rank order
    for (const k of familyOrder) {
      if (remaining <= 0) break;
      const fam = families.get(k)!;
      const give = Math.min(fam.length - (alloc.get(k) ?? 0), remaining);
      if (give > 0) {
        alloc.set(k, (alloc.get(k) ?? 0) + give);
        remaining -= give;
      }
    }
  }

  const kept: typeof ranked = [];
  const dropped: string[] = [];
  for (const key of familyOrder) {
    const fam = families.get(key)!;
    const keep = Math.min(fam.length, alloc.get(key) ?? 0);
    if (keep === 0) {
      for (const r of fam) dropped.push(r.doc.id);
      continue;
    }
    if (keep === fam.length) {
      kept.push(...fam);
      continue;
    }
    // EVEN subsample of the family's own order (which is the .mdx order, since
    // ties sort by id), then fold the lost emission into what survives
    const boost = fam.length / keep;
    const chosen = new Set<number>();
    for (let i = 0; i < keep; i++) chosen.add(Math.min(fam.length - 1, Math.round((i * fam.length) / keep)));
    // rounding can collide; fill forward so exactly `keep` survive
    for (let i = 0; chosen.size < keep && i < fam.length; i++) chosen.add(i);
    fam.forEach((r, i) => {
      if (!chosen.has(i)) {
        dropped.push(r.doc.id);
        return;
      }
      const doc = { ...r.doc };
      if (doc.mode === "burst") doc.burstCount = Math.max(1, Math.round((doc.burstCount ?? 1) * boost));
      else doc.rate = Math.round((doc.rate ?? 10) * boost * 1000) / 1000;
      kept.push({ ...r, doc });
    });
  }
  kept.sort((a, b) => b.score - a.score || (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0));

  const rawParticles = kept.reduce((n, r) => n + liveParticleEstimate(r.doc), 0);
  // one global thinning factor, so the effect's internal balance is preserved
  // (thinning only the biggest emitter would change the effect's shape)
  const rateScale = rawParticles > particleBudget ? Math.max(0.05, particleBudget / rawParticles) : 1;

  const emitters: BudgetedEmitter[] = kept.map((r) => ({
    doc: r.doc,
    rateScale,
    particles: Math.max(1, Math.round(liveParticleEstimate(r.doc) * rateScale)),
    mergedFrom: r.mergedFrom,
  }));

  return {
    emitters,
    dropped,
    systemsBeforeMerge,
    systemsAfterMerge: merged.length,
    particles: emitters.reduce((n, e) => n + e.particles, 0),
    faithful: dropped.length === 0 && rateScale === 1,
  };
}

/**
 * Apply a plan's `rateScale` to a doc, returning a NEW doc. Kept separate from
 * `planEffectBudget` so a caller can show the faithful numbers and the shipped
 * numbers side by side (the audition page does exactly that).
 */
export function applyRateScale(doc: VfxDoc, rateScale: number): VfxDoc {
  if (rateScale === 1) return doc;
  const out: VfxDoc = { ...doc };
  if (doc.mode === "burst") out.burstCount = Math.max(1, Math.round((doc.burstCount ?? 24) * rateScale));
  else out.rate = Math.max(0.001, Math.round((doc.rate ?? 30) * rateScale * 1000) / 1000);
  return out;
}

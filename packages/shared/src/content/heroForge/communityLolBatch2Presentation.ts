import type { VfxScriptEntry, VfxScriptSegment } from "../schema/vfxScript";
import type { CommunityHeroExample, Move } from "./communityExamples";
import { HERO_SLOTS, type HeroSlot } from "./constants";

type ActiveSlot = Exclude<HeroSlot, "PASSIVE">;
type Rgb = [number, number, number];
type Particle = Extract<VfxScriptSegment, { kind: "vfx" }>;
type Cue = Omit<Particle, "kind" | "tint">;
type Proc = { kind: string; vfxId: string; at: "self" | "target" | "point"; statusId?: string };
type Look = { color: Rgb; slots: Record<ActiveSlot, Cue[]>; passive: Proc[]; success?: Partial<Record<ActiveSlot, Proc[]>>; landing?: Partial<Record<ActiveSlot, string>> };

const cue = (vfxId: string, at: Cue["at"] = "self", on: Cue["on"] = "castEffect", extra: Partial<Cue> = {}): Cue => ({ vfxId, at, on, ...extra });
const pulse = (at: Cue["at"] = "self"): Cue => cue("fx.prim.holy.pulse", at, "castEffect", { w3xScale: 0.8 });
const mend = (): Cue => cue("fx.prim.nature.pulse", "self", "castEffect", { w3xScale: 0.65 });
const ground = (at: Cue["at"] = "point", on: Cue["on"] = "castEffect"): Cue => cue("fx.prim.physical.shockwave", at, on, { flyHeight: 0 });
const impact = (on: Cue["on"] = "castEffect"): Cue => cue("fx.prim.physical.explosion-lg", "target", on, { w3xScale: 0.8 });
// This existing document declares yawFrom:aim. A forward offset supplies a
// nonzero caster->emitter vector, so self-cast lines follow the actual facing.
const beam = (on: Cue["on"] = "castEffect"): Cue => cue("fx.prim.holy.beam-flat", "self", on, { offsetForwardU: 0.35, flyHeight: 55 });
const shot = (): Cue[] => [cue("fx.prim.arcane.pulse-sm", "self", "projectileSpawn", { w3xScale: 0.5 }), impact("projectileHit")];
const ready = (): Cue => cue("fx.prim.physical.slash", "self", "castEffect", { w3xScale: 0.65, flyHeight: 55 });
const proc = (kind: string, vfxId: string, at: Proc["at"] = "self", statusId?: string): Proc => ({ kind, vfxId, at, ...(statusId ? { statusId } : {}) });

/** Basic GGD cues, not reconstructed Riot VFX or approval of missing mechanics. */
const LOOKS: Record<string, Look> = {
  sett: {
    color: [255, 185, 75],
    slots: { Q: [ready()], W: [beam(), pulse()], E: [ground("self")], R: [cue("fx.prim.earth.pulse-sm", "self", "castStart")], EX: [mend()] },
    passive: [proc("damage", "fx.prim.physical.pulse-sm", "target"), proc("heal", "fx.prim.nature.pulse-sm")],
    landing: { R: "fx.prim.earth.nova-lg" },
  },
  fiddlesticks: {
    color: [190, 70, 65],
    slots: {
      Q: [cue("fx.prim.void.pulse", "target")],
      W: [cue("fx.prim.void.swarm", "self", "strike", { w3xScale: 1.3 })],
      E: [beam(), cue("fx.prim.physical.slash", "point")],
      R: [cue("fx.prim.void.summon", "self", "castStart"), cue("fx.prim.void.swarm", "self", "strike", { w3xScale: 1.5 })],
      EX: [cue("fx.prim.void.summon", "self", "castEffect", { w3xScale: 1.3 })],
    },
    passive: [proc("summon", "fx.prim.void.summon")],
  },
  ornn: {
    color: [255, 110, 35],
    slots: { Q: [beam(), ground("point")], W: [beam(), cue("fx.prim.fire.explosion", "point", "castEffect", { w3xScale: 0.7 })], E: [cue("fx.prim.physical.shockwave")], R: [cue("fx.prim.fire.pulse", "self", "castStart"), beam()], EX: [pulse("target")] },
    passive: [proc("damage", "fx.prim.fire.explosion", "target")],
  },
  chogath: {
    color: [185, 85, 230],
    slots: { Q: [cue("fx.prim.void.pulse-sm", "point", "castEffect")], W: [beam()], E: [ready()], R: [], EX: [mend()] },
    passive: [proc("heal", "fx.prim.nature.pulse-sm")],
    success: { Q: [proc("damage", "fx.prim.earth.shockwave", "point")], R: [proc("damage", "fx.prim.blood.nova", "target")] },
  },
  ashe: {
    color: [105, 200, 255],
    slots: { Q: [], W: [beam(), cue("fx.prim.physical.slash", "point")], E: [cue("fx.prim.ice.pulse-sm", "point", "castEffect")], R: shot(), EX: [pulse()] },
    passive: [proc("applyStatus", "fx.prim.ice.pulse-sm", "target", "$hero.frost")],
    success: { Q: [proc("applyBuff", "fx.prim.ice.pulse-lg")], E: [proc("applyStatus", "fx.prim.ice.shockwave", "point", "$hero.delivery-signature")] },
  },
  blitzcrank: {
    color: [255, 220, 75],
    slots: { Q: shot(), W: [cue("fx.prim.lightning.dash")], E: [ready(), cue("fx.prim.lightning.pulse-sm")], R: [ground("self"), cue("fx.prim.lightning.nova", "self")], EX: [] },
    passive: [proc("shield", "fx.prim.lightning.pulse")],
    success: { EX: [proc("damage", "fx.prim.lightning.explosion-lg", "target")] },
  },
  ahri: {
    color: [240, 120, 205],
    slots: { Q: [beam(), beam("strike")], W: [cue("fx.prim.fire.pulse", "self", "strike")], E: shot(), R: [cue("fx.prim.arcane.dash")], EX: [cue("fx.prim.arcane.pulse", "point")] },
    passive: [proc("heal", "fx.prim.nature.pulse-sm")],
    landing: { R: "fx.prim.arcane.explosion" },
  },
  thresh: {
    color: [75, 235, 185],
    slots: { Q: shot(), W: [cue("fx.prim.arcane.summon", "self"), pulse("target")], E: [beam(), cue("fx.prim.physical.slash", "point")], R: [ground("self"), cue("fx.prim.void.nova", "self")], EX: [ground("self")] },
    passive: [proc("applyBuff", "fx.prim.nature.pulse-sm")],
  },
  velkoz: {
    color: [200, 120, 255],
    slots: { Q: shot(), W: [beam(), beam("strike")], E: [cue("fx.prim.void.pulse-sm", "point", "castEffect")], R: [{ ...beam(), timeScale: 0.25 }, cue("fx.prim.void.pulse-sm", "self", "strike")], EX: [] },
    passive: [proc("damage", "fx.prim.void.explosion", "target")],
    success: { E: [proc("damage", "fx.prim.void.shockwave", "point")], EX: [proc("restore", "fx.prim.arcane.pulse")] },
  },
  malphite: {
    color: [200, 155, 95],
    slots: { Q: [cue("fx.prim.earth.nova-lg", "target")], W: [ready()], E: [ground("self")], R: [cue("fx.prim.physical.shockwave")], EX: [pulse(), ground("self")] },
    passive: [proc("shield", "fx.prim.earth.pulse-sm")],
    landing: { R: "fx.prim.earth.nova-lg" },
  },
  garen: {
    color: [245, 220, 110],
    slots: { Q: [ready()], W: [pulse()], E: [ground("self", "strike")], R: [cue("fx.prim.holy.explosion", "target"), impact()], EX: [mend()] },
    passive: [proc("heal", "fx.prim.nature.pulse-sm")],
  },
};

/** Insert cosmetic effects only beside the existing successful effect leaves.
 * In particular consumeStatus.onMissing is never decorated just because a cast
 * happened. Conditions stay on the cue as well as its original effect.
 */
function decorate(value: unknown, rules: readonly Proc[], landing?: string): unknown {
  if (Array.isArray(value)) return value.flatMap((entry) => {
    const copied = decorate(entry, rules, landing);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [copied];
    const effect = entry as Record<string, unknown>;
    const rule = rules.find((r) => r.kind === effect.kind && (r.statusId === undefined || r.statusId === effect.statusId));
    return rule ? [copied, { kind: "spawnVfx", vfxId: rule.vfxId, at: rule.at, ...(effect.condition ? { condition: structuredClone(effect.condition) } : {}) }] : [copied];
  });
  if (!value || typeof value !== "object") return value;
  const parentKind = (value as Record<string, unknown>).kind;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    // Resource failures are not successful presentation events.
    if (key === "onMissing") return [key, structuredClone(child)];
    const decorated = decorate(child, rules, landing);
    const movementEnd = (parentKind === "leap" && key === "onLand") || (parentKind === "dash" && key === "onEnd");
    return [key, movementEnd && landing && Array.isArray(decorated)
      ? [...decorated, { kind: "spawnVfx", vfxId: landing, at: "point" }]
      : decorated];
  }));
}

/** Authoring-time wrapper only. No runtime branches, models or gameplay knobs. */
export function withCommunityLolBatch2Presentation(recipe: CommunityHeroExample): CommunityHeroExample {
  const look = LOOKS[recipe.id];
  if (!look || recipe.authoredPresentation) return recipe;
  const authoredPresentation: NonNullable<CommunityHeroExample["authoredPresentation"]> = {};
  const moves = { ...recipe.moves };
  for (const slot of HERO_SLOTS) {
    const move = recipe.moves[slot];
    const rules = slot === "PASSIVE" ? look.passive : (look.success?.[slot] ?? []);
    moves[slot] = { ...move, params: decorate(move.params, rules, slot === "PASSIVE" ? undefined : look.landing?.[slot]) as Move["params"] };
    if (slot === "PASSIVE") continue; // There is no passive-cast wire event.
    const segments: VfxScriptEntry[] = [
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast", replaces: "caster.action" },
      ...look.slots[slot].map((part): Particle => ({ kind: "vfx", tint: [...look.color], ...part })),
    ];
    authoredPresentation[slot] = {
      yields: ["caster.castFx"], segments,
      notes: `${recipe.name} ${slot}：GGD 基本演出，非原作特效還原。投射物依實際命中、週期演出依 strike、移動結束依 onLand/onEnd；落點與成功分支使用既有 spawnVfx。判定與尚缺機制仍以技能資料為準。`,
    };
  }
  return { ...recipe, moves, authoredPresentation };
}

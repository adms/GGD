/**
 * `leap` (task #247) — the map's own parabolic jump.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged. Note the
 * `bakeList` PARAMETER on both members: the cast-time baker is handed in rather
 * than imported, which is what keeps this module off the registry's dependency
 * cycle (see effectKind.ts).
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveAbilityRange } from "../abilities/abilitySystem";
import { resolveLandingPoint, startLeap } from "../movement/leap";

export const leapEffect: EffectKindSpec<"leap"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    // Task #247. The FLYER is either the caster (the shipped self-leaps: 蒼月潮
    // 07-03, 01-02 隕石擊, 76-04 三檔) or each resolved target (the thrown arcs:
    // 52-02 蹂躪編年史, 77-00 浮雲-旋一閃) — one primitive, two subjects.
    const applyTo = e.applyTo ?? "self";
    const flyers = applyTo === "target" ? ctx.targets : [ctx.caster];
    // CAST-TIME RESOLUTION, once per cast (not per flyer — the JASS has ONE
    // `udg_MoonDamage`, so a multi-body throw pays the same frozen number).
    // This is the line that makes 07-03's combo bonus reachable at all: the
    // window it reads is 1.00 s and the arc it rides is 1.44 s.
    const onLand = e.onLand !== undefined ? bakeList(e.onLand, ctx) : undefined;
    for (const flyer of flyers) {
      const ft = world.transform.get(flyer);
      if (!ft) continue;
      // "inPlace" is a vertical hop (76-04 三檔.巨人迴旋彈 has NO
      // SetUnitPositionLoc on the caster anywhere in its cluster); "toPoint"
      // aims at the snapshotted cast point, or — for a thrown target with no
      // point — straight along the caster's facing by the arc's own reach.
      // DRAG PHASE (j:51755-51763): 52-02 蹂躪編年史 yanks the victim to the
      // caster BEFORE throwing, and the JASS aims the throw from the caster's
      // own location (j:51765-51767) — not from wherever the victim stood. So
      // the arc's ORIGIN moves too, or the landing point is off by the whole
      // caster→victim distance. The pull is compressed into the takeoff tick;
      // in the JASS it takes dist/1000 s (≤0.3 s at this ability's 300-unit
      // cast range) and ends within 50 wc3 u (0.92 GGD) of the caster.
      const ct = world.transform.get(ctx.caster);
      const drag = e.dragToCaster === true && applyTo === "target" && ct !== undefined;
      const takeoff = drag && ct ? { x: ct.pos.x, z: ct.pos.z } : { x: ft.pos.x, z: ft.pos.z };
      let requested = { x: takeoff.x, z: takeoff.z };
      if (e.mode === "toPoint") {
        if (applyTo === "target" && ctx.point === undefined) {
          // A thrown victim on a UNIT-targeted ability has no cast point to
          // aim at, so it flies `throwDistance` along the caster's facing —
          // the JASS's own PolarProjection(caster, 400, facing) (j:51767),
          // put through the #136 reach factor like every other length.
          const dir = ctx.direction ?? ct?.facing ?? { x: 0, z: 1 };
          const reach = resolveAbilityRange(world, e.throwDistance ?? 0);
          requested = { x: takeoff.x + dir.x * reach, z: takeoff.z + dir.z * reach };
        } else if (ctx.point) {
          requested = { x: ctx.point.x, z: ctx.point.z };
        }
      }
      // The landing point is proved LEGAL here, once, at takeoff — the arc is
      // re-aimed rather than corrected at touchdown (see movement/leap.ts).
      // "Legal" means obstacle-free and inside the zone boundary; it does NOT
      // mean range-clamped, and there is deliberately no clamp here. Reach was
      // already bounded upstream, where the ability's range is known: a
      // "ground" cast has its point clamped to `resolveAbilityRange(def.range)`
      // by abilitySystem, a "targeted" cast rejects an out-of-range target
      // outright, and the thrown-victim branch above flies its own
      // `throwDistance` (already through the #136 reach factor). The clamp this
      // call used to carry was passed `len(requested - flyer.pos)` — its own
      // input distance — so it could never fire; see resolveLandingPoint.
      // ⭐ owner 2026-08-21 —— 弧線的終點也不可以落在**牆的另一邊**。
      //    `from` 要傳 `takeoff` 而不是飛行者現在的位置：52-02 先把受害者拖到
      //    施法者身上才丟，穿牆判定問的是**這條弧線真正跨過什麼**，⛔ 不是
      //    受害者原本站在哪（少了這一格，被拖過來的人會從錯的起點量牆）。
      const to = resolveLandingPoint(world, flyer, requested, { mode: "leap", from: takeoff });
      startLeap(world, flyer, {
        ...(drag ? { from: takeoff } : {}),
        to,
        apexHeight: e.apexHeight,
        durationSec: e.durationSec,
        ...(e.landRadius !== undefined ? { landRadius: e.landRadius } : {}),
        ...(onLand !== undefined ? { onLand } : {}),
        casterId: ctx.caster,
        rank: ctx.rank,
        origin: ctx.origin,
        ...(ctx.abilitySlot !== undefined ? { slot: ctx.abilitySlot } : {}),
      });
    }
  },

  bake(e, ctx, bakeList) {
    return e.onLand === undefined ? e : { ...e, onLand: bakeList(e.onLand, ctx) };
  },
};

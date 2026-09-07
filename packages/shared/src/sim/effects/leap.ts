/**
 * `leap` (task #247) — the map's own parabolic jump.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged. Note the
 * `bakeList` PARAMETER on both members: the cast-time baker is handed in rather
 * than imported, which is what keeps this module off the registry's dependency
 * cycle (see effectKind.ts).
 */
import type { EffectKindSpec } from "./effectKind";
import type { EffectContext } from "./effect";
import { resolveAbilityRange } from "../abilities/abilitySystem";
import { resolveLandingPoint, startLeap } from "../movement/leap";
import { normalize, sub, type Vec2 } from "../math/vec2";

/**
 * ⭐ GH#1050 —— 一具**被丟的**身體往哪個方向飛。原作這一族沒有任何一支有「落點」，
 * 每一次拋投都是 **方向 × 定長**，而方向有兩種，由「先不先拖到施法者身上」決定：
 *  · 拖過來再丟（`dragToCaster`）⇒ **施法者的朝向**：A0U1 j:51765
 *    `PolarProjectionBJ(casterLoc, 400.00, GetUnitFacing(caster))`。ground 施法在
 *    abilitySystem 把 facing commit 成「施法者 → 選點」＝ `ctx.direction`，所以先讀它。
 *  · 原地丟（不拖）⇒ **施法者 → 受害者**：A0L6 j:50109 / A0SQ j:29634 的
 *    `AngleBetweenPoints(caster, victim)`。受害者疊在施法者身上（零向量）時退回上一條。
 * 兩條都退化時用施法者現在的 facing；連 facing 都沒有就朝 +z（與舊分支逐字相同）。
 */
function throwDirection(
  ctx: EffectContext,
  ct: { pos: Vec2; facing: Vec2 } | undefined,
  victimPos: Vec2 | undefined,
  victimOrigin?: Vec2,
): Vec2 {
  if (victimPos !== undefined && ct !== undefined) {
    const away = normalize(sub(victimPos, ct.pos));
    if (away.x !== 0 || away.z !== 0) return away;
  }
  const d = ctx.direction;
  if (d !== undefined && (d.x !== 0 || d.z !== 0)) return d;
  const f = ct?.facing;
  if (f !== undefined && (f.x !== 0 || f.z !== 0)) return f;
  // ⭐ 施法者還沒有朝向（剛生成、從沒動過 —— castabilitySweep 的假人就是這樣）：
  //    沿「施法者 → 受害者**原本站的地方**」丟；零向量的朝向會讓拖到身上的人原地落地 ⇒ no-op。
  if (victimOrigin !== undefined && ct !== undefined) {
    const back = normalize(sub(victimOrigin, ct.pos));
    if (back.x !== 0 || back.z !== 0) return back;
  }
  return { x: 0, z: 1 };
}

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
        if (applyTo === "target" && e.throwDistance !== undefined) {
          // ⭐ GH#1050 —— 拋投**距離**模式：一具被丟的身體，節點上有 `throwDistance`
          //    就飛 `throwDistance`，⛔ 不管這次施法有沒有 `ctx.point`。
          //    在此之前這一段只在 `ctx.point === undefined` 時才讀 —— 而每一條真的
          //    施法入口都**必給** point（ground 夾過的點、targeted 的目標座標），
          //    於是 `throwDistance` 在玩家按得到的每一條路上都是裝飾：
          //    同一個施法點，100 與 1000 落在同一格（票文的重現表）。
          //    ⇒ 「玩家選的點」在 ground 施法裡的意思是**抓哪裡 ＋ 朝哪邊**，⛔ 不是終點；
          //    終點＝起跳點 ＋ 方向 × reach（#136 reach factor 與其他每一段長度同一把尺）。
          //    rollback：模板 `throwMode: "point"` ⇒ expand **不寫** throwDistance ⇒
          //    走下面那條「選點就是終點」分支（2026-09-06 之前的行為）。
          const reach = resolveAbilityRange(world, e.throwDistance);
          const dir = throwDirection(ctx, ct, drag ? undefined : ft.pos, ft.pos);
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

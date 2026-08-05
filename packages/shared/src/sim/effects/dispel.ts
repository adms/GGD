/**
 * `dispel` —— 【淨化】【驅散】（A4b，#278）。
 *
 * 把目標身上選定的池子清掉，走 `sim/clearPools.ts` 的那一支唯一函式。
 *
 * ── ⚠️ `shape` 只有 `single` 與 `circle`，而這是刻意的 ────────────────────
 * owner 核准的 E1 硬約束是「**新 kind 一律帶 `shape`**」—— 那是「這個 kind
 * 要有一個講得清楚的作用範圍」，不是「四個值都要收」。
 *
 * `line` / `cone` **沒有列進 enum**，因為今天沒有任何一份文件需要它們，而
 * 一個 schema 收得下、引擎卻沒實作的值**正是我在同一批裡剛刪掉的 `onLevelUp`**：
 * 作者選得到、後台存得起來、卡片上看得到，而它一次都不會發生。
 * 要加的那天，enum 與這裡的分派**一起**加。
 *
 * ⚠️ 順帶一提：`cone` 之後要加的時候**不能用角度算** ——
 * `sim/purity.test.ts` 禁三角函式。文件要存 `coneCosHalfAngle`（dot 門檻），
 * 度數↔餘弦的換算放後台表單那一層（admin 不受純度閘管）。
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { alliedChampions } from "./hooks";
import { distSq } from "../math/vec2";
import { clearPools, type ClearPolarity, type PoolSelection } from "../clearPools";

export const dispelEffect: EffectKindSpec<"dispel"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const rules = world.dispelRules;
    // 止血閥。⚠️ 它**只**關掉這個 effect kind —— 復活與回合重置走的是
    // `clearForFreshBody`，那兩條不受它影響（它們不是淨化，是重置）。
    if (!rules.enabled) return;

    // ── 誰被清 ──────────────────────────────────────────────────────────
    // `single` = hook/技能已經解析好的那些人（`target: self|event|allies`
    // 那一層決定的），這個 kind 不重新發明目標選擇。
    let victims: EntityId[] = [...ctx.targets];

    if (e.shape === "circle") {
      const radius = resolveAbilityRadius(world, e.radius ?? 0);
      if (radius <= 0) return;
      const centre =
        (ctx.targets[0] !== undefined ? world.transform.get(ctx.targets[0])?.pos : undefined) ??
        ctx.point ??
        world.transform.get(ctx.caster)?.pos;
      if (!centre) return;

      if (e.side === "enemies") {
        victims = enemiesInCircle(world, ctx.caster, centre, radius);
      } else {
        // 友方圓 —— 用**同一份** broadphase 的反面：先取全隊英雄，再用半徑濾。
        // ⚠️ 沒有 `alliesInCircle`，而我不新造第二套空間查詢：
        // `alliedChampions` 已經是排序過的全序名單（`sim/purity.test.ts` 在守
        // Map 迭代順序），一場最多 12 個人，距離濾是 12 次平方比較。
        const r2 = radius * radius;
        victims = alliedChampions(world, ctx.caster).filter((id) => {
          const t = world.transform.get(id);
          return t !== undefined && distSq(centre, t.pos) <= r2;
        });
      }

      // TOTAL ORDER：近的先，同距離時 id 小的先。`maxTargets` 正好在這裡切一刀，
      // 所以少了第二關鍵字就是把「誰被淨化」交給 Array.prototype.sort 的實作
      //（理由與 `damageArea.ts` 那一段逐字相同）。
      const withD = victims
        .map((id) => ({ id, d2: distSq(centre, world.transform.get(id)!.pos) }))
        .sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
      const cap = e.maxTargets ?? withD.length;
      victims = withD.slice(0, Math.max(0, cap)).map((v) => v.id);
    }

    // ── 每一個目標清什麼 ────────────────────────────────────────────────
    const pools: PoolSelection = e.pools ?? {
      status: rules.defaultPoolStatus,
      dot: rules.defaultPoolDot,
      shields: rules.defaultPoolShields,
      buffs: rules.defaultPoolBuffs,
    };
    const polarity: ClearPolarity = e.polarity ?? "debuff";
    // 文件寫了 `count` 也夾不過全域上限（一句話管到底，見 `dispelRules.ts`）。
    const count = Math.min(e.count ?? rules.maxCountCap, rules.maxCountCap);

    for (const id of victims) {
      // 殭屍吃不吃淨化 —— 第 3 場之後場上大多數敵人就是殭屍，PvE 與 PvP 的
      // 答案不一定相同，所以它是一格欄位不是一個判斷式。
      if (!rules.appliesToMobs && world.mob.has(id)) continue;
      clearPools(world, id, {
        pools,
        polarity,
        // ⛔ 淨化**一定**看 `dispellable`。回合重置不看（`clearForFreshBody`
        // 傳 false）—— 那是兩件不同的事，而它們共用同一支函式正是為了讓這個
        // 差別是一個**參數**而不是兩份會分岔的程式碼。
        requireDispellable: true,
        count,
        order: e.order ?? rules.defaultOrder,
        defaults: {
          status: rules.statusDefaultDispellable,
          dot: rules.dotDefaultDispellable,
          buffs: rules.buffDefaultDispellable,
        },
      });
    }
  },
};

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
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";
import { clearPools, type ClearPolarity, type PoolSelection } from "../clearPools";

export const dispelEffect: EffectKindSpec<"dispel"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const rules = world.dispelRules;
    // 止血閥。⚠️ 它**只**關掉這個 effect kind —— 復活與回合重置走的是
    // `clearForFreshBody`，那兩條不受它影響（它們不是淨化，是重置）。
    if (!rules.enabled) return;

    // ── 誰被清 ──────────────────────────────────────────────────────────
    // `shape` 的解析走 `shapeTargets`（D1 破盾也走它）—— 兩個 kind 各手寫一份
    // 「圓怎麼取人」，分歧的那一天沒有人會發現。
    const victims = shapeTargets(e, ctx);

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

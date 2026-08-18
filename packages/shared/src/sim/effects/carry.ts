/**
 * `carry` handler —— 「把隊友收進箱子」的那一刻（禰豆子的木箱，[EX∅ 根源]）。
 *
 * ── 這一支只負責**上車**，⛔ 不負責跟隨 ──────────────────────────────────
 * 寫一列 `world.carried` 就結束。每 tick 把乘客的座標從載具重建的是
 * `systems/CarrySystem.ts`，而那是刻意的分工（抄 `aura/auraCarrier.ts` 的
 * DECISION 1）：跟隨若寫在這裡就得訂閱事件，而事件會漏、會重複、會在 replay 上
 * 與現場不同步。「誰在誰身上」是一個每 tick 都問得出答案的**狀態**。
 *
 * ── 幾何與過濾一律走既有的兩支模板（第零守則⑨）────────────────────────────
 * `shapeTargets`（圓怎麼取人、全序怎麼排）與 `selectVictims` / `runOnHitChain`
 * （逐一過濾、切上限、把**真的上車的那群人**交下游）。⛔ 不抄第三份 ——
 * 抄出來的那一份與 `damageArea` 分歧的那天，畫面上跟「這張卡就是這樣設計的」
 * 分不出來。
 *
 * ⚠️ `maxTargets` **不交給 `shapeTargets` 切**：先切再過濾會讓
 * 「只有生命低於 15% 的隊友躲得進來」變成「最近的那一個如果剛好殘血才躲得進來」。
 * 切刀由 `selectVictims` 在過濾之後下，與 G1 的 `qualified` 語意逐字相同。
 *
 * ── 四道拒載，每一道都擋掉一個真的會發生的壞形狀 ──────────────────────────
 *  ① 載具自己 —— `alliedChampions` 含持有者本人，不擋就會出現「自己背自己」，
 *    而 `CarrySystem` 會把它的座標寫成它自己的（無害但永遠不可選取）。
 *  ② 已經在別人箱子裡的人 —— 不擋就是兩具載具搶同一個乘客，最後一筆贏，
 *    而先寫的那一筆在 `world.carried` 裡被靜默覆蓋。
 *  ③ 自己也是載具的人 —— 鏈式背負（A 背 B、B 背 C）會讓 `CarrySystem` 的
 *    單趟複製依賴 Map 順序，兩個 replica 因此分岔。⛔ 一層就好。
 *  ④ 屍體 —— 進了箱子就永遠不可選取，而復活圈是靠**點得到**才救得回來的。
 *
 * ⛔ **四道拒載跑在 `selectVictims` 之前，順序是語意**：`side:"allies"` 的圓
 * 從 `alliedChampions` 出來，而那份名單**含持有者自己而且他離圓心 0 距離**——
 * 先切 `maxTargets: 1` 再拒載的話，那一刀每次都正好切下持有者本人，然後拒載
 * 把他丟掉 ⇒ **一個人都收不進箱子**，而卡片上寫著「1 名隊友」。
 * ⚠️ 這不是假想：它是這一版第一次寫出來的形狀，被守衛第一條斷言抓到的。
 *
 * PURITY：不抽 rng（`victimCondition` 若含機率葉，抽籤在 `selectVictims` 裡，
 * 走的是既有的兩相位規約）、不看時鐘，到期是**絕對 tick**。
 */
import type { EffectKindSpec } from "./effectKind";
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { shapeTargets } from "./shapeTargets";
import { runOnHitChain, selectVictims } from "./victimFilter";

/** 「不可選取」四根軸的出貨預設。⚠️ `abilityAoe` 是 false —— 不可選取 ≠ 免疫。 */
const UNTARGETABLE_DEFAULTS = {
  autoAcquire: true,
  mobAggro: true,
  manualTarget: true,
  abilityAoe: false,
} as const;

export const carryEffect: EffectKindSpec<"carry"> = {
  apply(e, ctx, _bakeList, runList) {
    const { world } = ctx;
    const carrier = ctx.caster;
    // 載具得先是一具在場上的身體 —— 沒有座標就沒有東西可以跟隨。
    if (!world.transform.get(carrier)) return;

    // ⛔ 半徑/全序交給模板，名額**不**交給它（見檔頭）。
    const sorted = shapeTargets(
      { ...e, side: e.side ?? "allies", maxTargets: undefined },
      ctx,
    )
      .filter((id) => canBoard(world, carrier, id))
      .map((id) => ({ id }));
    const cap = e.maxTargets ?? 1;
    const picked = selectVictims(sorted, cap, e.victimCondition, undefined, ctx);

    const u = { ...UNTARGETABLE_DEFAULTS, ...(e.untargetable ?? {}) };
    const expiresAtTick = world.tick + Math.round(e.durationSec / world.dt);
    const boarded: EntityId[] = [];
    for (const { id } of picked) {
      world.carried.set(id, {
        carrier,
        expiresAtTick,
        blocksAutoAcquire: u.autoAcquire,
        blocksMobAggro: u.mobAggro,
        blocksManualTarget: u.manualTarget,
        blocksAbilityAoe: u.abilityAoe,
        onCarrierDeath: e.onCarrierDeath ?? "release",
      });
      boarded.push(id);
    }
    // 交下游的是**真的上車的那群人**，⛔ 不是 `ctx.targets`（上游交下來的震央）。
    runOnHitChain(e, boarded, ctx, runList);
  },
};

/** 四道拒載（見檔頭①②③④）。⛔ 跑在 `selectVictims` 的名額刀**之前**。 */
function canBoard(world: SimWorld, carrier: EntityId, id: EntityId): boolean {
  if (id === carrier) return false; // ①
  if (world.carried.has(id)) return false; // ②
  if (isCarryingSomeone(world, id)) return false; // ③
  const hp = world.health.get(id);
  if (hp && !hp.alive) return false; // ④
  return true;
}

/** 這具身體現在背著別人嗎（拒載③）。`world.carried` 是「乘客 → 載具」，所以要掃值。 */
function isCarryingSomeone(world: SimWorld, id: EntityId): boolean {
  for (const st of world.carried.values()) if (st.carrier === id) return true;
  return false;
}

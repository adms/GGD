/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  資源衍生屬性 —— 「AP + (目前 MP 的 5%)」, i.e. a stat term that DRAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 光魔杖 (godie-i027) 的效能第二行是 「AP+ (目前MP的 5%)」。整份 `statPipeline`
 * 的模型是 `final = (base + Σflat)·(1 + ΣpctAdd)·Π(1 + pctMult)`,而那條式子裡
 * 的每一項都是**重算的那一刻算完就凍住**的。一個隨著法力條下降而變小的加成在
 * 那個模型裡沒有位置 —— 這個檔就是那個位置。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼是 `ModOp.PercentOf` 的第三個來源域,而不是新的 op / 新的 effect
 *
 * `ModOp.PercentOf` 已經是「把 A 的 X% 加到 B」,已經有**第二趟**求值、已經有
 * `percentOfTargets` 的快速略過、已經在 schema 與編輯器上。它唯一缺的是「A 可以
 * 不是一條 `Stat`」。所以這裡加的是 {@link StatModifier.fromResource} 一個選用
 * 欄位,不是第七個 op:
 *
 *   · `from: maxMana`        —— 最大法力的 5%(靜態,重算時算完)
 *   · `fromResource: "mp"`   —— **目前**法力的 5%(活的,會跟著喝掉的魔耗掉)
 *
 * 兩者共用同一趟求值、同一個 `stacks` 規則、同一條「讀不到另一條 `PercentOf`
 * 的產出」的收斂保證。`hp` 與 `mp` 這組字彙不是這裡發明的 ——
 * `sim/content/condition.ts` 的 {@link ResourceStat} 已經是它,而且
 * `zEffectCondition` 的 `{kind:"stat", stat:"hp"|"mp"}` 已經在內容上用了它。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② THE HARD QUESTION: 什麼東西讓它重算
 *
 * 「每 tick 把 `sc.dirty` 打開」的直覺代價常被說成「每一 tick 重算場上每一個人
 * 的每一條屬性」。**那是錯的,而且錯得可以量。** `statRecomputeSystem` 只重算
 * `dirty` 的實體,而這個系統**只**會把帶著資源項的實體打成 dirty —— 也就是
 * 「身上有光魔杖的那幾位」,場上通常是 0 個。
 *
 * 而且連那幾位也不是每 tick 都算:{@link resourceSignature} 記下上一次真的被
 * 折進去的資源讀數,只有**讀數變了**才打 dirty。滿魔站著不動的英雄簽章不動,
 * 一次都不重算。
 *
 * MEASURED, 而不是估的。24 個英雄、每人 10 個 source、法力**每一 tick 都在動**
 * (最壞情形),連續 30,000 tick,量的是 `resourceStatSystem` +
 * `statRecomputeSystem` 兩者加起來的全額成本:
 *
 *     帶著這件裝備的人數      每 tick        佔 30 Hz 一格 (33.3 ms) 的比例
 *     ────────────────────────────────────────────────────────────────────
 *     0 (今天的每一場)        5.15 µs        0.015 %
 *     1                      10.94 µs        0.033 %
 *     6                      35.79 µs        0.107 %
 *     24 (全場都帶)          130.77 µs        0.39 %
 *
 * 也就是說「每 tick 重算」這件事的真實代價,在全場 24 個人都帶著光魔杖、而且
 * 法力一刻不停在動的極端情形下,是一格 tick 的 **0.4 %**。「重算場上每一個人的
 * 每一條屬性」這個直覺的問題在於它假設了 `sc.dirty` 會被全場打開 —— 不會,
 * `statRecomputeSystem` 只重算 dirty 的,而這個系統只把**帶著這種 modifier 的
 * 那幾個**打成 dirty。0 個持有者那一列(0.015 %)就是掃描本身的成本,和
 * `stealthSystem` / `flightSystem` 每 tick 做的事同一個量級 —— 而那兩個系統是
 * 這個專案對「source 上掛的能力」既有的、出貨中的做法。
 *
 * (量測腳本是一次性的,沒有留在樹上:它印時間,不斷言任何東西,留著只會變成一條
 * 在慢機器上會紅的假守衛。數字寫在這裡,重跑的方法是把 `resourceStatSystem` +
 * `statRecomputeSystem` 包在 `process.hrtime.bigint()` 裡跑 30,000 tick。)
 *
 * ⚠️ 所以這裡**沒有**一個「多久刷新一次」的節流欄位,而那是刻意的:
 * `combat/block.ts` 檔頭自己記著「一根沒有任何內容在用的軸就是失敗形態 ②」。
 * 真正該是欄位的決策點是 **`fromResource` 讀的是「目前」還是「最大」**,而那個
 * 決策已經是一個欄位了(`fromResource: "mp"` ↔ `from: "maxMana"`,同一條
 * modifier 換一個鍵),owner 在後台改一個下拉就切得過去。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 為什麼折進 `sc.final` 而不是在**讀取時**算
 *
 * `stats/attrSources.ts` 的 `liveAttribute` 走的是讀取時求值,因為 三圍 的讀者
 * 只有三個。`Stat.AbilityPower` 不是:它被技能係數、面板、商店預覽、戰情面板、
 * codex 讀,而且未來每加一個讀者就多一次「忘了呼叫那個函式」的機會 —— 那正是
 * 失敗形態 ③(可以從樹上刪掉而測試全綠)。
 *
 * 折進 `sc.final` 讓**每一個既有讀者自動誠實**,一行都不用改:HUD 的
 * 「戰鬥實際」欄(#125)、商店的即時預覽(#106)、傷害公式的 `ratios` 全部讀的
 * 就是同一個 `sc.final[ap]`。代價是上面那個「什麼時候重算」的問題,而 ② 已經
 * 付過了。
 *
 * ⚠️ 商店預覽有一個**它自己**的誠實問題,而且不是這個檔造成的:
 * `apps/client/src/ui/panels/statPreview.ts` 是在一個 scratch world 裡 spawn 一
 * 個滿血滿魔的英雄。滿魔時 `目前 MP` = `最大 MP`,所以預覽會顯示這條加成的
 * **上限值**。那份檔案因此拿到了 `manaPct` / `hpPct` 兩個選用欄位,呼叫端餵得
 * 進來就是誠實的;沒餵 = 1 = 滿資源,也就是「這件裝備最好的情況」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 決定性 (sim/purity.test.ts)
 *
 * 沒有 rng、沒有時鐘、沒有三角函式、沒有 `**`;沒有遞減計數器(這個機制沒有
 * 到期概念);唯一的迭代是 `world.stats` 這個 Map,而這個系統對每一個項目做的
 * 事**互不相干**(只寫自己那一格的 `dirty` 與簽章),所以迭代順序不影響結果 ——
 * 和 `statRecomputeSystem` 自己對同一個 Map 做的事一模一樣。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ResourceStat } from "../content/condition";
import { ModOp, type ModifierSource } from "./modifiers";

/**
 * 這個單位**現在**這項資源有多少。沒有 `HealthComp` 的實體(投射物、金幣、
 * 復活圈)回 0 —— 它們也不可能帶著道具,所以這條路只有在測試裡才走得到。
 *
 * ⚠️ 回的是**絕對值**不是比例:文案寫的是「目前 MP 的 5%」,而 5% 的 300 點魔
 * 是 15 點 AP。要比例的地方是 `zEffectCondition`,不是這裡。
 */
export function liveResource(world: SimWorld, id: EntityId, key: ResourceStat): number {
  const hp = world.health.get(id);
  if (!hp) return 0;
  const v = key === "hp" ? hp.hp : hp.mana;
  // 負血(死亡那一 tick 可以是負的)讀成 0:一件「你越死越強」的裝備不是設計,
  // 是一個沒有人下界的乘法。
  return v > 0 ? v : 0;
}

/**
 * 這個來源清單裡有沒有任何一條**活著的**資源衍生 modifier。
 *
 * 回 `false` 是場上絕大多數單位的答案,而且是這個系統唯一的成本 —— 走一次
 * `sources`、每個 source 走一次 `modifiers`,沒有配置、沒有算術。
 */
export function hasResourceModifier(
  sources: readonly ModifierSource[],
  tick: number,
): boolean {
  for (const src of sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    if (!src.modifiers) continue;
    for (const m of src.modifiers) {
      if (m.op === ModOp.PercentOf && m.fromResource !== undefined) return true;
    }
  }
  return false;
}

/**
 * 「這個單位的資源衍生項目前該是多少」—— 一個把**每一條**資源 modifier 的
 * 貢獻加起來的純量,只拿來當**簽章**用(值變了才重算),不是最終數字本身。
 *
 * 最終數字由 `stats/statPipeline.ts` 的第二趟算,而且是**逐條屬性**分開算的;
 * 這裡刻意把全部加成一個純量,因為「有沒有變」不需要分辨是哪一條變的。
 *
 * ⚠️ 乘 `stacks`,和管線裡的算法一致 —— 否則一個只有疊層數變了的 tick 會被
 * 這個簽章判成「沒變」,而管線其實會給出不同的答案。
 */
export function resourceSignature(
  world: SimWorld,
  id: EntityId,
  sources: readonly ModifierSource[],
): number {
  let sig = 0;
  for (const src of sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!src.modifiers) continue;
    const stacks = src.stacks ?? 1;
    for (const m of src.modifiers) {
      if (m.op !== ModOp.PercentOf || m.fromResource === undefined) continue;
      sig += m.value * stacks * liveResource(world, id, m.fromResource);
    }
  }
  return sig;
}

/**
 * 系統:把「資源衍生項的讀數變了」翻譯成 `sc.dirty`。
 *
 * 跑在 `regenSystem` 之後、當 tick 最後一次 `statRecomputeSystem` 之前 ——
 * 那個位置同時吃得到**這一 tick 的回魔**與**這一 tick 被技能/道具花掉的魔**
 * (光魔杖自己的 `spendMana` 在傷害佇列裡發生,也就是更早),所以一次掃描就把
 * 兩種來源都吸收了。
 *
 * ⚠️ 沒有帶資源 modifier 的實體**完全不留下任何痕跡**:不寫 `resourceSig`、
 * 不碰 `dirty`。所以掛上這個系統對既有內容是逐位元相同的 no-op,既有 replay
 * 與 digest 不變。
 */
export function resourceStatSystem(world: SimWorld): void {
  for (const [id, sc] of world.stats) {
    if (!hasResourceModifier(sc.sources, world.tick)) continue;
    const sig = resourceSignature(world, id, sc.sources);
    if (sc.resourceSig === sig) continue;
    sc.resourceSig = sig;
    sc.dirty = true;
  }
}

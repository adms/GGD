/**
 * 預測影子的**飛行來源** —— owner 2026-08-23（逐字）：
 *
 *     「特別是飛行單位（翔封界、有翼劍士等）飛行路徑是可以飛過牆，
 *       **後端計算與前端預測方法不同**」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 「不同」到底在哪 —— 量到的，⛔ 不是猜的
 *
 * 兩邊跑的**是同一支函式**：`LocalPrediction.tickOnce()` 直接 import 出貨的
 * `movementSystem`（`@ggd/shared/sim/systems/MovementSystem`），伺服器的
 * `SimWorld.step()` 跑的也是同一支。所以「方法不同」⛔ 不是兩份實作。
 *
 * ⭐ **不同的是餵進去的狀態。** `movementSystem` 問
 * `flightIgnoresObstacles(world, id)` ——它讀 `world.flight`，而 `world.flight`
 * 由 `flightSystem`（`SimWorld.step` 的 slot 1d）從 `StatsComp.sources` 推導。
 * 影子世界裡：
 *
 *   · `tickOnce` 只跑 `orderSystem` + `movementSystem`，**從來沒跑過 `flightSystem`**
 *   · `spawn()` 鋪的 `stats.sources` 是**空陣列**
 *
 * ⇒ `world.flight` 恆為空 ⇒ 影子**永遠是地面單位**：它撞牆停住，伺服器讓她飛過去，
 * 於是每一個快照都把玩家往前拉一段 —— ⭐ **那正是 owner 說的「循環來回拉扯」
 * 在飛行英雄身上的樣子**，而且只有駕駛那具身體的玩家看得到。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 修法：讓影子跑**出貨的** `flightSystem`，⛔ 不是在客戶端再寫一個 if
 *
 * 第〇·五守則：機制住引擎，客戶端只負責把**同一份資料**擺好。所以這個檔只做
 * 一件事 —— 回答「這具身體的**天生技**給不給飛行」，答案是一個**出貨形狀的**
 * `ModifierSource`，交給出貨的 `flightSystem` 去解析。
 *
 * ⚠️ **涵蓋範圍（⛔ 誠實地寫清楚，第一·五守則）**
 *
 * | 來源 | 影子預測得到嗎 | 為什麼 |
 * |---|---|---|
 * | **天生技**（04-00 翔封界 `godie-h020` / `godie-hjai`）| ✅ | `championId` 每一幀由 `setChampionId` 餵進來，這個檔查得到 |
 * | 道具（天叢雲劍 · 立體機動裝置）、增益（騎乘 EX）、**變身 buff**（77-03 有翼劍士）| ⛔ **還沒有** | 它們是掛在身上的 `ModifierSource`，而客戶端今天**沒有任何通道**把它們交給影子 —— `GameApp` 只餵 `moveSpeed` / `attackRange` / `championId` 三格 |
 *
 * ⭐ 那條通道是**一行**：`LocalPrediction.setFlight(grant)`（公開 API，已經在了）。
 * ⛔ 這一批不接，是因為呼叫端 `apps/client/src/GameApp.ts` 由別的 lane 佔用
 * （第零守則⚡④ 的逐檔柵欄）。⚠️ 在接上之前，**變身/道具**取得的飛行仍然會有
 * 上面那個拉扯 —— ⛔ 不要以為這一支把整題修完了。
 */
import { Champions, Abilities } from "@ggd/shared/sim/content/registry";
import { isPassiveInnate, abilityPassiveSourceId } from "@ggd/shared/sim/abilities/abilityPassives";
import type { ModifierSource } from "@ggd/shared/sim/stats/modifiers";
import type { ChampionId, AbilityId } from "@ggd/shared/ids";

/**
 * 這具身體的**天生技**給的飛行來源，或 null。
 *
 * ⚠️ 走的是出貨的 `isPassiveInnate` 與 `abilityPassiveSourceId` ——
 * ⛔ 不是「`slot === "PASSIVE"`」抄一份：那兩個判準在伺服器上會演化
 * （`innateKind: "active"` 就是後來才分出來的），抄一份的那天沒有東西會紅。
 *
 * ⭐ 只讀 `ranks[0]`：天生技從出生就是 rank 1，這是 `abilityPassives.ts`
 * 檔頭寫死的語意（`rank N -> passive.ranks[N-1]`）。
 */
export function innateFlightSource(championId: string): ModifierSource | null {
  if (!championId) return null;
  const champ = Champions.tryGet(championId as ChampionId);
  const innateId = champ?.passiveAbility;
  if (innateId === undefined) return null;
  const def = Abilities.tryGet(innateId as AbilityId);
  if (def === undefined || !isPassiveInnate(def)) return null;
  const grant = def.passive?.ranks[0]?.flight;
  if (grant === undefined) return null;
  return { id: abilityPassiveSourceId(innateId), kind: "passive", flight: grant };
}

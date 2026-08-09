/**
 * GH#308 —— `destroy(id)` 必須清掉**每一個** per-entity store。
 *
 * ⛔ **沒有一行「檢查 world.marks」**，刻意的：手寫的清單就是下一個會漏的東西
 *（`marks` 與 `airborne` 能在 17 個 delete 中間缺席，正是因為每條舊守衛只驗自己
 * 那一格）。這裡**在執行期列舉** world 上所有 Map/Set，塞同一個 id，跑真的
 * `destroy()`，再問誰還在 —— 明天新增的第 44 個 store 忘了清會自己紅。
 *
 * ⚠️ 執行期分不出 `Map<EntityId,…>` 與 `Map<ZoneIndex,…>`，差額寫成一張**明確**的
 * 豁免表，每筆寫它的 key 是什麼。預設是「要清」；豁免是一個看得見的決定。
 *
 * 突變：拿掉 `this.marks.delete(id)` → 紅且指名 marks；拿掉
 * `this.airborne.delete(id)` → 紅且指名 airborne；豁免表加一個不存在的名字 → 紅且指名它。
 */
import { it, expect } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";

/** 不以 EntityId 為 key 的 store —— 每一筆寫**它的 key 是什麼**。 */
const NOT_KEYED_BY_ENTITY: Readonly<Record<string, string>> = {
  bossSpawnsThisRound: "key = 回合序號",
  flowerNextSpawn: "key = zone index",
  reviveCharges: "key = TeamId",
  flowerZones: "元素 = zone index",
  mobZones: "元素 = zone index",
  settledZones: "元素 = zone index",
  spawnHaltedZones: "元素 = zone index",
};

it("SimWorld.destroy 清乾淨每一個 per-entity store (GH#308)", () => {
  const world = new SimWorld(SKELETON_ARENA, 20260809);
  const bag = world as unknown as Record<string, unknown>;
  const isStore = (v: unknown): v is Map<unknown, unknown> | Set<unknown> =>
    v instanceof Map || v instanceof Set;

  // 豁免表本身不得腐爛：一個已經不存在的名字會靜默豁免掉「未來同名的新 store」。
  expect(Object.keys(NOT_KEYED_BY_ENTITY).filter((n) => !isStore(bag[n]))).toEqual([]);

  const id = world.spawn();
  const stores = Object.entries(bag)
    .filter(([n, v]) => isStore(v) && !(n in NOT_KEYED_BY_ENTITY))
    .sort(([a], [b]) => (a < b ? -1 : 1)) as Array<[string, Map<unknown, unknown> | Set<unknown>]>;
  // 空列舉會讓這條無聲通過（失敗形態③）。不是出貨值，是「列舉真的有東西」的地板。
  expect(stores.length).toBeGreaterThan(20);
  for (const [, s] of stores) {
    // 哨兵一律用 Map：`destroy` 會走 `bossDamage` 的 ledger 並呼叫 `.delete`。
    if (s instanceof Map) s.set(id, new Map());
    else s.add(id);
  }
  expect(stores.filter(([, s]) => !s.has(id)).map(([n]) => n)).toEqual([]);

  world.destroy(id);

  expect(stores.filter(([, s]) => s.has(id)).map(([n]) => n)).toEqual([]);
});

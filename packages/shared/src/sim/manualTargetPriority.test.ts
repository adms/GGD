/**
 * 玩家點名的目標 > 自動索敵 (GH#266).
 *
 * owner 2026-08-03:「玩家無法指定攻擊 特殊殭屍? **玩家指定攻擊的對象應該是
 * 最高優先級**」。
 *
 * ── 這裡量到的缺陷 ────────────────────────────────────────────────────────
 * 一條明確的 `attackTarget` 指令指到特殊殭屍,之後**每 tick 送一條 move**
 * (= 類比搖桿 / 虛擬搖桿的真實形狀:`GamepadInput.mapGamepadFrame` 與
 * `TouchInput.touchMoveOrder` 推著的時候每一拍都送一條)——
 *
 *     修正前: 下一個 tick 目標就從特殊殭屍換成旁邊的普通殭屍,
 *             `attackTargetAuto` 由 false 變 true。手選的壽命 = **1 tick**。
 *     修正後: 12 tick 之後仍然是同一隻,`attackTargetAuto` 仍然是 false。
 *
 * 換掉之後**回不來**:比較器 (`sim/targeting.ts`) 的 key 3 是「血量低的優先」,
 * 特殊殭屍的血量遠高於雜魚,所以只要旁邊有雜魚,自動索敵永遠不會挑它。
 * 這就是 owner 說的「無法指定攻擊」。
 *
 * ── 這幾條守衛是對著哪幾種失敗形態長的 ──────────────────────────────────
 * ⑤ 被測的不是出貨的那個:世界用**真的** `spawnChampion` / `spawnMob` /
 *    `mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG)` 建,規則用 `SimWorld` 的
 *    出貨預設(`world.combatFeel` 不覆寫),而且斷言逐 tick 跑**真的**
 *    `world.step`,不是直接呼叫 `orderSystem` 或手寫 `nav`。
 * ④ 斷言方向跟缺陷無關:場上**同時**有特殊與普通兩隻,而且普通那隻更近、血更少
 *    ——「自動索敵會挑普通那隻」由第二條測試親自量出來。所以「目標還是特殊那隻」
 *    是一個只有正確實作會產生的答案,不是「反正場上只有一個候選」。
 * ③ 可以從實作刪掉但測試全綠:第二條把欄位切到 #274 那一側,量到**相反**的結果。
 *    那條線刪掉的話這兩條會同時紅(一條說沒換,一條說換了)。
 *
 * ⚠️ 這裡**一個出貨數值都不抄**(第二守則 / owner 2026-08-03「不要過度測試數值
 * 調整」):特殊殭屍的血量、索敵半徑、`survivesGroundMove` 的出貨值,全部從
 * `DEFAULT_*` 推導或根本不斷言。守的是**機制**(會不會被換掉),不是數字。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { mobRulesFromConfig, spawnMob, type MobRules } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";
import {
  DEFAULT_COMBAT_FEEL,
  DEFAULT_MANUAL_ORDER,
  type CombatFeelRules,
  type ManualOrderRules,
} from "./combatFeel";
import type { IntentFrame } from "./intents";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const Z0 = SKELETON_ARENA.zones[0]!;
/** 淨空的走道(競技場中心 +12,避開 |z|=8 的兩根柱子與 24 單位邊界夾限)。 */
const lane = (dx: number) => ({ x: Z0.center.x + dx, z: Z0.center.z + 12 });

/** `chance: 1` → 每一次生成都是特殊殭屍;`0` → 每一次都是普通的。出貨規則之外只動這一格。 */
function mobRules(chance: number): MobRules {
  const base = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
  return { ...base, special: { ...base.special!, chance } };
}

interface Scene {
  w: SimWorld;
  hero: EntityId;
  special: EntityId;
  normal: EntityId;
}

/**
 * 一個英雄 + 一隻特殊殭屍(遠)+ 一隻普通殭屍(近)。
 *
 * 普通那隻**故意更近**:自動索敵的最後兩把鑰匙是「血量低」與「距離近」,兩把都
 * 指向普通那隻,所以「目標仍然是特殊那隻」不可能是巧合。
 */
function scene(manualOrder?: ManualOrderRules): Scene {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  if (manualOrder) {
    w.combatFeel = { ...DEFAULT_COMBAT_FEEL, manualOrder } satisfies CombatFeelRules;
  }
  beginCombatMobs(w, mobRules(1), [0]);
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: lane(0),
    zone: 0,
  });
  const special = spawnMob(w, 0, mobRules(1), 1, 0);
  const normal = spawnMob(w, 0, mobRules(0), 2, 0);
  expect(w.mob.get(special)!.kind, "這一隻本來就該是特殊殭屍").toBe("special");
  expect(w.mob.get(normal)!.kind, "這一隻本來就該是普通殭屍").toBe("normal");
  w.transform.get(special)!.pos = lane(5);
  w.transform.get(normal)!.pos = lane(2);
  w.rebuildGrid();
  return { w, hero, special, normal };
}

const seat = (o: IntentFrame["order"]): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(0), { order: o, commands: [] }]]);

/** 每 tick 往前推一格搖桿 —— 這是「玩家正在走路」在 sim 眼中的樣子。 */
function steer(w: SimWorld, hero: EntityId): void {
  const t = w.transform.get(hero)!;
  w.step(seat({ kind: "move", point: { x: t.pos.x + 4, z: t.pos.z } }));
}

describe("GH#266 玩家點名的攻擊目標 > 自動索敵", () => {
  it("★ 明確指令指到特殊殭屍 → 之後一路推搖桿,12 tick 後目標仍是那一隻", () => {
    const { w, hero, special, normal } = scene();
    w.step(seat({ kind: "attackTarget", entity: special }));
    expect(w.nav.get(hero)!.attackTarget, "指令當下就沒寫進去 = 選不到,不是被蓋掉").toBe(
      special,
    );

    // 逐 tick 檢查,不是只看第 12 tick 的結果。owner 的規則是「**永遠**」,而
    // 缺陷本身只有 1 tick 寬:量到的是「下一個 tick 就換掉」,而**再過幾 tick
    // 之後,雙方都在移動,自動索敵有可能剛好又挑回同一隻** —— 只斷言終點的
    // 守衛會被這種巧合放過去(失敗形態 ④)。
    const held: { tick: number; target: EntityId | null; auto: boolean }[] = [];
    for (let i = 0; i < 12; i++) {
      steer(w, hero);
      const n = w.nav.get(hero)!;
      held.push({ tick: w.tick, target: n.attackTarget, auto: n.attackTargetAuto });
    }
    // 「還是手選的」比「還是同一個 id」強:自動索敵若把它降級成自己的目標,
    // 下一 tick 就會被 `shouldSwapAutoTarget` 換掉,而 id 那一條會照樣綠。
    expect(
      held.filter((h) => h.target !== special || h.auto),
      `玩家點的特殊殭屍(${special})在推搖桿的過程中被換掉了;普通殭屍是 ${normal}`,
    ).toEqual([]);
  });

  it("欄位切到 #274 那一側 → 量到相反的結果(所以上面那條不是「反正不會換」)", () => {
    const { w, hero, special, normal } = scene({
      ...DEFAULT_MANUAL_ORDER,
      survivesGroundMove: false,
    });
    w.step(seat({ kind: "attackTarget", entity: special }));
    expect(w.nav.get(hero)!.attackTarget).toBe(special);

    steer(w, hero); // 一格搖桿就夠了 —— 這正是量到的「壽命 1 tick」

    const nav = w.nav.get(hero)!;
    expect(nav.attackTarget, "#274 的行為:一條地面指令取代手選目標").toBe(normal);
    expect(nav.attackTargetAuto).toBe(true);
  });

  it("A 移動 (`attackMove`) 仍然取代手選目標 —— #274 沒有被整個撤掉", () => {
    const { w, hero, special, normal } = scene();
    w.step(seat({ kind: "attackTarget", entity: special }));
    const t = w.transform.get(hero)!;
    w.step(seat({ kind: "attackMove", point: { x: t.pos.x + 4, z: t.pos.z } }));

    const nav = w.nav.get(hero)!;
    expect(nav.attackTarget, "A 是玩家自己下的另一條戰鬥決策,該覆寫掉舊的點名").toBe(normal);
    expect(nav.attackTargetAuto).toBe(true);
  });

  it("`leashUnits` 是那個出口:目標超出牽引距離就放手", () => {
    const { w, hero, special, normal } = scene({ ...DEFAULT_MANUAL_ORDER, leashUnits: 3 });
    w.step(seat({ kind: "attackTarget", entity: special })); // 特殊那隻在 5 單位外
    // 牽引距離 3 < 5,所以下一次索敵就該放手,方向盤還給自動索敵。
    steer(w, hero);
    const nav = w.nav.get(hero)!;
    expect(nav.attackTarget, "超出牽引距離卻沒有放手").not.toBe(special);
    expect(nav.attackTarget).toBe(normal);
  });
});

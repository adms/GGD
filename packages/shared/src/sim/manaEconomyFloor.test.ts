/**
 * 回魔地板（GH#446）的守衛。
 *
 * ⭐ **owner 2026-08-20 把它降級了**：「refillSeconds:15 => **時間是建議原則
 * 不是死程式邏輯**，你要**量給我以後給我例外清單判斷**，一樣錨點」
 * ⇒ 出貨 `enforceFloor: false`，**預設什麼都不拉**。
 *
 * ⚠️ 所以這兩條的方向在 2026-08-20 **對調**了：出貨那一邊現在是「回不滿」，
 * 而「回得滿」變成把開關打開之後才會發生的事。⭐ 第〇·六守則：
 * **測試只做預設啟動的那一邊**，這裡的第二條之所以留著，是因為它是第一條的
 * **對照組** —— 少了它，第一條對「機制整個被刪掉」也會過（失敗形態③）。
 *
 * ⛔ 不驗「15 是不是對的數字」—— 那一格住 `content/config/mana-economy.json`
 * + Zod `DEFAULT_*` + 後台，三者之間已經有 drift 測試在守。
 *
 * ⚠️ 走的是**真的 `world.step()`**，⛔ 不是直接呼叫 `manaRegenPerSec`：
 * 那支純函式測起來永遠會過，就算 `RegenSystem` 那一行被改回
 * `sc.final[Stat.ManaRegen]` 也一樣（失敗形態③：整段接線可以撤銷而測試全綠）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId } from "../ids";
import { DEFAULT_MANA_ECONOMY } from "./manaEconomy";

const Z0 = SKELETON_ARENA.zones[0]!;

function arena(): { world: SimWorld; id: ReturnType<typeof spawnChampion> } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const id = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { ...Z0.center },
    zone: 0,
  });
  return { world, id };
}

/** 把魔力抽乾，跑 N 秒，回傳最後的魔力比例。 */
function refillRatio(world: SimWorld, id: ReturnType<typeof spawnChampion>, sec: number): number {
  const hp = world.health.get(id)!;
  hp.mana = 0;
  for (let k = 0; k < Math.round(sec / world.dt); k++) world.step(new Map());
  return hp.mana / hp.maxMana;
}

beforeEach(() => {
  // ⚠️ ⛔ 不要先 `Champions.clear()` —— `registerSkeletonContent` 有一個
  //    「只跑一次」的旗標，清掉之後它就再也不會補回來（第二個 it 會拿到空表）。
  registerSkeletonContent();
});

describe("回魔建議值 (GH#446, owner 2026-08-20 降級成建議原則)", () => {
  it("⭐ 出貨預設**不拉** —— 同一段時間回到的魔力**嚴格少於**「真的拉」的那一邊", () => {
    const shippedRun = arena();
    const forcedRun = arena();
    // 出貨規則真的是 world 拿到的那一份（⛔ 不是測試自己捏一個）。
    expect(shippedRun.world.manaEconomy).toEqual(DEFAULT_MANA_ECONOMY);
    expect(DEFAULT_MANA_ECONOMY.enforceFloor).toBe(false);
    forcedRun.world.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enforceFloor: true };

    const sec = DEFAULT_MANA_ECONOMY.refillSeconds;
    // ⚠️ 斷言寫成**兩邊相比**而不是「< 1」：地板剛好在 refillSeconds 那一刻補滿，
    //    所以「< 1」對「地板照樣生效」也會過（浮點差一點點）—— 那是失敗形態④，
    //    突變驗證當場抓到過。⛔ 不要改回單邊門檻。
    expect(refillRatio(shippedRun.world, shippedRun.id, sec)).toBeLessThan(
      refillRatio(forcedRun.world, forcedRun.id, sec),
    );
  });

  it("⛔ 對照組：打開 enforceFloor 才真的把他拉到建議秒數內回滿", () => {
    const { world, id } = arena();
    world.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enforceFloor: true };
    // ⚠️ 這一條是上面那條的反面：兩條都過才代表「是這個開關在動」，
    //    而不是整條規則被刪光了（失敗形態③：撤銷整段接線而測試全綠）。
    expect(refillRatio(world, id, DEFAULT_MANA_ECONOMY.refillSeconds)).toBeGreaterThan(0.99);
  });
});

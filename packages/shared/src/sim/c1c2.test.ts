/**
 * C1【沉默】與 C2【混亂】的行為守衛（#278）。
 *
 * 兩項各一條，不做額外分支（CLAUDE.md 第零守則②③：一個功能一條守衛）。
 *
 *  C1 ⛔ 重點不是「按 Q 沒反應」，是**魔力不可以被扣、冷卻不可以進入**。
 *     閘放到 `spendMana` 之後的話，玩家按 Q 會「技能沒出去但資源沒了」——
 *     那比不能施法更糟，而畫面上只看得到一個沒反應的按鈕。
 *
 *  C2 ⭐ **owner 2026-08-09 改判**（GH#299 第 9 條 / GH#301-3）：
 *     「混亂應該是**完全無法指定目標**，並且會**亂走路**，跟恐懼一樣」。
 *     ⛔ 舊斷言（「自動索敵挑得到**隊友**」）驗的是被推翻掉的那個裁決 ——
 *     照著它寫的實作在玩家眼裡是「照常打架，只是有時候打到隊友」。
 *     所以現在兩件事一起讀：**連敵人都挑不到** + **身體真的在亂走**。
 *
 * 突變紀錄（見 commit message）:
 *   · `abilitySystem.ts` 的 silenced 那一行刪掉        → c1-silenced 紅
 *   · `targeting.ts` 的 `if (isConfused(...)) return false` 拿掉 → c2-confused 紅
 *   · `OrderSystem.ts` 最後那行 `chaosPass(world)` 拿掉 → c2-confused 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { acquireTarget } from "./targeting";
import { CHAOS_REROLL_TICKS, CHAOS_STEP_DISTANCE } from "./chaos";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { StatusEffect } from "./components";

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

function spawn(w: SimWorld, seat: number, team: number, dx: number): EntityId {
  return spawnChampion(w, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
}

function put(w: SimWorld, id: EntityId, extra: Partial<StatusEffect>): void {
  const st = w.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: "test" as StatusEffect["statusId"],
    sourceId: "src:test",
    expiresAtTick: w.tick + 300,
    ...extra,
  });
  w.status.set(id, st);
}

describe("C1 沉默 / C2 混亂", () => {
  it("C1 被沉默時按 Q 被拒,而且魔力沒被扣、冷卻沒進入", () => {
    cover("c1-silenced");
    const w = new SimWorld(SKELETON_ARENA, 31);
    w.combatActive = true;
    const hero = spawn(w, 0, 0, 0);
    spawn(w, 1, 1, 2);
    w.step(new Map());

    const hp = w.health.get(hero)!;
    const ab = w.abilities.get(hero)!;
    put(w, hero, { silenced: true });

    const manaBefore = hp.mana;
    // ⚠️ 冷卻住在**每一格自己**的 `cooldownRemainingTicks`(stats/statsComp.ts)，
    // 不是 comp 上的一張 map。2026-08-06 修正：這一行原本讀 `ab.cooldowns`，
    // 那個屬性不存在，所以斷言是 `{} === {}` —— 永遠成立、什麼都沒驗
    //(失敗形態④)。vitest 不做型別檢查，所以它綠了一整天，是 `pnpm typecheck`
    // 抓到的。**測試自己也會有啞斷言。**
    const cdBefore = ab.slots.Q.cooldownRemainingTicks;

    expect(castAbility(w, hero, "Q", { type: "self" })).toBe("silenced");
    // ⛔ 三件事一起讀：被拒 + 魔力沒少 + 冷卻沒動。
    // 只驗「被拒」的話，一個把閘放在 spendMana 之後的實作照樣過。
    expect(hp.mana).toBe(manaBefore);
    expect(ab.slots.Q.cooldownRemainingTicks).toBe(cdBefore);
  });

  it("C2 混亂 = 完全選不到目標 + 亂走路", () => {
    cover("c2-confused");
    const w = new SimWorld(SKELETON_ARENA, 32);
    w.combatActive = true;
    const hero = spawn(w, 0, 0, 0);
    const foe = spawn(w, 1, 1, 3); // 敵隊，就在旁邊
    w.step(new Map());

    // 沒混亂：敵人當然挑得到。
    expect(acquireTarget(w, hero, 12)?.id).toBe(foe);

    put(w, hero, { targetsAllies: true });

    // ⭐ 承重①：「**完全**無法指定目標」—— 連近在眼前的敵人都挑不到。
    expect(acquireTarget(w, hero, 12)).toBeNull();

    // ⭐ 承重②：真的亂走。每個重抽窗口記一次方向；跑滿幾個窗口之後，
    // ⛔ 方向要**不只一種**（一個寫死方向的實作只會有一種），而且每一步的
    // 長度都是那一格常數 —— 一個「只清目標、不寫 moveTarget」的實作
    // （`chaosPass` 沒接上）會在這裡拿到 null。
    const dirs = new Set<string>();
    for (let i = 0; i < CHAOS_REROLL_TICKS * 6; i++) {
      w.step(new Map());
      const nav = w.nav.get(hero)!;
      const t = w.transform.get(hero)!;
      expect(nav.attackTarget).toBeNull(); // 不打人
      const mt = nav.moveTarget;
      expect(mt).not.toBeNull();
      expect(Math.hypot(mt!.x - t.pos.x, mt!.z - t.pos.z)).toBeLessThanOrEqual(
        CHAOS_STEP_DISTANCE + 1e-6,
      );
      dirs.add(`${Math.round((mt!.x - t.pos.x) * 100)}`);
    }
    expect(dirs.size).toBeGreaterThan(1);
  });
});

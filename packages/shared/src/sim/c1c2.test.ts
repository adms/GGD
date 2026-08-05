/**
 * C1【沉默】與 C2【混亂】的行為守衛（#278）。
 *
 * 兩項各一條，不做額外分支（CLAUDE.md 第零守則②③：一個功能一條守衛）。
 *
 *  C1 ⛔ 重點不是「按 Q 沒反應」，是**魔力不可以被扣、冷卻不可以進入**。
 *     閘放到 `spendMana` 之後的話，玩家按 Q 會「技能沒出去但資源沒了」——
 *     那比不能施法更糟，而畫面上只看得到一個沒反應的按鈕。
 *
 *  C2 ⛔ 重點是自動索敵**真的會挑到隊友**。混亂不是新狀態：`berserk` 已經負責
 *     「丟掉座位的指令 + 交還給自動索敵」，這一格只多開敵我閘那一道。
 *
 * 突變紀錄（見 commit message）:
 *   · `abilitySystem.ts` 的 silenced 那一行刪掉      → c1-silenced 紅
 *   · `targeting.ts` 的 `!isConfused(...)` 拿掉      → c2-confused 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { acquireTarget } from "./targeting";
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
    const cdBefore = JSON.stringify(ab.cooldowns ?? {});

    expect(castAbility(w, hero, "Q")).toBe("silenced");
    // ⛔ 三件事一起讀：被拒 + 魔力沒少 + 冷卻沒動。
    // 只驗「被拒」的話，一個把閘放在 spendMana 之後的實作照樣過。
    expect(hp.mana).toBe(manaBefore);
    expect(JSON.stringify(ab.cooldowns ?? {})).toBe(cdBefore);
  });

  it("C2 混亂時自動索敵挑得到隊友", () => {
    cover("c2-confused");
    const w = new SimWorld(SKELETON_ARENA, 32);
    w.combatActive = true;
    const hero = spawn(w, 0, 0, 0);
    const mate = spawn(w, 1, 0, 1.5); // 同隊，而且是最近的
    w.step(new Map());

    // 沒混亂：隊友不是合法目標，所以索敵挑不到他。
    expect(acquireTarget(w, hero, 12)?.id).not.toBe(mate);

    put(w, hero, { berserk: true, targetsAllies: true });

    // 混亂之後隊友變成合法目標（而且他最近，所以就是他）。
    expect(acquireTarget(w, hero, 12)?.id).toBe(mate);
  });
});

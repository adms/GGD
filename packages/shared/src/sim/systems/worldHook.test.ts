/**
 * `worldHookSystem` 的行為守衛 —— 事件流上的世界時刻真的送得到卡片手上。
 *
 * ── 只釘兩條，因為這支系統只有兩種列 ────────────────────────────────────
 *
 *  ① `scope:"world"` —— 廣播給場上活人，**死人收不到**。
 *     兩個方向一起讀：只驗「活人收到」的話，一個「發給所有人」的實作照樣過，
 *     而那正是「趴著等王」變成策略的那個缺陷（失敗形態④）。
 *
 *  ② `scope:"actor"` —— ⚠️ 迴避那一列的 `actorKey`/`targetKey` 是**反的**
 *     （持有者＝閃掉的人，target＝攻擊者）。照抄別列會把卡片掛到攻擊者身上，
 *     而畫面上兩者都是「有人閃了一下」，看不出差別。
 *
 * ── 為什麼不逐一驗六列 ──────────────────────────────────────────────────
 * 六列走的是**同一個迴圈**，差別只有表上的參數。逐列再抄一份斷言驗的是同一段
 * 程式碼的第六份複本 —— 那不是覆蓋，是重複（CLAUDE.md 第零守則⑦）。
 * 表格本身由 TypeScript 的 `HookEvent` union 守著：打錯 hook 名編譯就紅。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `WorldHookSystem.ts` 的 `scope === "world"` 那一支整段刪掉 → wh-world 紅
 *   · 迴避那一列的 `actorKey`/`targetKey` 對調                  → wh-evade-owner 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { worldHookSystem } from "./WorldHookSystem";
import { deathSystem } from "./DeathSystem";
import { reviveSystem } from "./ReviveSystem";
import { beginCombatRevives } from "../revive";
import { fireHooks } from "../effects/hooks";
import type { HookDef, HookEvent } from "../stats/modifiers";
import type { EffectDef } from "../effects/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 4);
  w.combatActive = true; // 整支系統的第一道閘
  return w;
}

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + seat, z: C.z },
    zone: 0,
  });
}

/**
 * 一張「這個時刻發生時，在**自己**身上蓋一個記號」的卡。
 * ⚠️ 用 `applyStatus` 而不是治療：治療要跟自然回血比大小，而那條路 2026-08-05
 * 已經騙過一次守衛（`reflectHook.test.ts` 檔頭）。記號沒有雜訊。
 */
function markCard(on: HookEvent, statusId: string): HookDef {
  return {
    on,
    target: "self",
    effects: [
      { kind: "applyStatus", statusId, durationSec: 30, moveSpeedMult: 1 } as unknown as EffectDef,
    ],
  } as HookDef;
}

function marks(w: SimWorld, id: EntityId): string[] {
  return (w.status.get(id)?.effects ?? []).map((e) => String(e.statusId)).sort();
}

describe("worldHookSystem —— 事件流 → hook 廣播", () => {
  it("⛔ 世界時刻廣播給活人,而死人收不到", () => {
    cover("wh-world");
    const w = stage();
    const alive = hero(w, 0, 0);
    const dead = hero(w, 1, 0);
    for (const id of [alive, dead]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onBossSpawn", "saw-boss")] });
    }
    w.health.get(dead)!.alive = false;

    w.emit("mobBossSpawn", { id: 999, zone: 0 });
    worldHookSystem(w);

    // ⛔ 兩個方向一起讀。只驗上面那行的話,「發給所有人」也會過。
    expect(marks(w, alive)).toEqual(["saw-boss"]);
    expect(marks(w, dead)).toEqual([]);
  });

  it("⛔ 迴避的持有者是**閃掉的那個**,不是攻擊者", () => {
    cover("wh-evade-owner");
    const w = stage();
    const evader = hero(w, 0, 0);
    const attacker = hero(w, 1, 1);
    for (const id of [evader, attacker]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onEvade", "dodged")] });
    }

    // `combat/evasion.ts` 的形狀:source = 攻擊者, target = 閃掉的人。
    w.emit("evade", { source: attacker, target: evader, x: 0, z: 0 });
    worldHookSystem(w);

    expect(marks(w, evader)).toEqual(["dodged"]);
    expect(marks(w, attacker)).toEqual([]);
  });

  it("⛔ #293 死亡時發得出去（持有者已經死了），而死者的其他 hook 仍然不響", () => {
    cover("wh-death-owner-dead");
    const w = stage();
    const victim = hero(w, 0, 0);
    const killer = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:victim",
      kind: "item",
      hooks: [markCard("onDeath", "died"), markCard("onDamageTaken", "hurt")],
    });

    // 出貨那條路:`DeathSystem`（slot 9）**先**寫 alive=false 才 emit，
    // `worldHookSystem`（9f）晚它一步 —— 這個順序就是 #293 的全部。
    w.health.get(victim)!.hp = 0;
    deathSystem(w);
    expect(w.health.get(victim)!.alive).toBe(false); // 這條守衛的前提，不是結論
    worldHookSystem(w);
    expect(marks(w, victim)).toEqual(["died"]);

    // ⛔ 反向:存活閘還在。少了這一段，「把 fireHooks 的存活閘整個刪掉」
    // 也會讓上面那行變綠 —— 而那會讓屍體繼續吃 AoE 觸發被動。
    fireHooks(w, victim, "onDamageTaken", killer);
    expect(marks(w, victim)).toEqual(["died"]);
  });

  it("⛔ #294 復活時掛在被復活的人身上 —— 走真的復活圈那條路", () => {
    cover("wh-revive-owner");
    const w = stage();
    const victim = hero(w, 0, 0);
    const rescuer = hero(w, 1, 0); // 站在屍體旁 1u，在 radius 內
    for (const id of [victim, rescuer]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onRevive", "back")] });
    }
    // 夾具值（不是出貨值）:channelTicks 1 讓一個 tick 就完成詠唱。
    beginCombatRevives(
      w,
      { channelTicks: 1, radius: 2, decayMult: 2, revivesPerTeamPerRound: 1,
        reviveHpPctMax: 0.5, reviveManaPctMax: 0.5, contestPauses: true,
        damageInterrupts: false, ccInterrupts: true },
      [asTeamId(0)],
    );

    w.health.get(victim)!.hp = 0;
    deathSystem(w); //   9  —— emit death
    reviveSystem(w); //  9c —— 落下圈圈、隊友詠唱完成 → emit reviveComplete
    worldHookSystem(w); // 9f

    // `reviveComplete.id` 是**圈圈**（發完就 destroy），只有 `ownerId` 是英雄。
    expect(marks(w, victim)).toEqual(["back"]);
    expect(marks(w, rescuer)).toEqual([]); // 也不是頂著圈圈的那位
  });
});

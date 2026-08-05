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
});

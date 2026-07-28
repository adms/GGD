/**
 * 道具冷卻倍率 `combatEnv.itemCooldown` (GH#189 第三塊).
 *
 * owner 2026-07-28:道具冷卻要能獨立於技能冷卻調整,預設 1x。
 *
 * ---------------------------------------------------------------------------
 * 為什麼守衛長這樣
 * ---------------------------------------------------------------------------
 * 這顆旋鈕最容易的兩種壞法都不會讓任何既有測試變紅:
 *   ① 加了 key、後台也看得到,但 sim 裡沒有任何地方讀它 —— 面板可以調,調了
 *      沒事發生(失敗形狀②的變體:設定送到了,但沒有人消費)。
 *   ② 讀了,但**連英雄天生技 / 三選一 / 靈氣的 ICD 一起**縮放 —— 一個叫
 *      「道具冷卻時間」的倍率動到了不是道具的東西。
 * 所以下面每一條都是 A/B:同一份 hook、同一段 tick,只差 `src.kind` 或只差
 * 倍率,兩邊必須給出不同的**發動次數**。
 *
 * 量的是 `buffApply` 事件 —— hook 真的跑完 effects 才會發出的那個訊號,而且是
 * 會離開伺服器的通道;不是 `hookLastFired` 這種內部欄位(失敗形狀⑦)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "./hooks";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "../combatEnv";
import { ModOp, type ModifierSourceKind } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

/** 1 秒 ICD。@30Hz 是 30 tick,所以 60 tick 的窗口在 1x 下發動 3 次。 */
const ICD_SEC = 1;
const WINDOW_TICKS = 61;

function hero(world: SimWorld): EntityId {
  return spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
}

/**
 * 每一 tick 都嘗試發動一次 on-hit hook,回傳 `WINDOW_TICKS` 內真的發動了幾次。
 * `kind` 決定這份 hook 掛在道具上還是掛在別的東西上。
 */
function procsIn(kind: ModifierSourceKind, itemCooldown: number, cooldown = 1): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatEnv = normalizeCombatEnv({ itemCooldown, cooldown });
  const id = hero(world);
  attachSource(world, id, {
    id: `src:${kind}`,
    kind,
    hooks: [
      {
        on: "onBasicAttack",
        target: "self",
        internalCooldown: ICD_SEC,
        effects: [
          {
            kind: "applyBuff",
            modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 0.01 }],
            duration: 999,
            stackKey: "icd-probe",
          },
        ],
      },
    ],
  });

  let procs = 0;
  for (let i = 0; i < WINDOW_TICKS; i++) {
    fireHooks(world, id, "onBasicAttack", id);
    for (const e of world.events) if (e.type === "buffApply" && e.data.source === id) procs++;
    world.step(new Map());
  }
  return procs;
}

describe("combatEnv.itemCooldown (#189)", () => {
  it("出貨預設是 1.0 —— 加這顆旋鈕不改變任何既有道具的節奏", () => {
    cover("combat-env-item-cooldown");
    expect(DEFAULT_COMBAT_ENV.itemCooldown).toBe(1);
    // 1 秒 ICD、61 tick 的窗口 → tick 0 / 30 / 60,三次。
    expect(procsIn("item", 1)).toBe(3);
  });

  it("★ 2.0 讓道具被動的內部冷卻真的變兩倍長(3 次 → 2 次)", () => {
    cover("combat-env-item-cooldown");
    // 2 秒 ICD → tick 0 / 60,兩次。一個「讀了 key 但沒乘上去」的實作還是 3。
    expect(procsIn("item", 2)).toBe(2);
    // …而且方向是對的:0.5 讓它更常發動(0.5 秒 ICD → 0/15/30/45/60)。
    expect(procsIn("item", 0.5)).toBe(5);
  });

  it("★ 只動道具 —— 天生技 / 三選一 / buff 的 ICD 不受影響", () => {
    cover("combat-env-item-cooldown");
    // 同一份 hook、同一個 2.0 倍率,唯一的差別是 `src.kind`。
    //
    // `"aura"` 不在名單裡,而且不是遺漏:那個 kind **只有 sim 自己寫**
    // (sim/aura/aura.ts 擁有每一份,離開半徑就拔掉),手動掛一份會在第一次
    // `step` 就被 auraSystem 收走 —— 量到的會是靈氣的生命週期,不是這顆旋鈕。
    for (const kind of ["champion", "augment", "passive", "buff"] as const) {
      expect(procsIn(kind, 2), `${kind} 的 ICD 被道具冷卻倍率動到了`).toBe(3);
    }
  });

  it("★ 技能冷卻倍率碰不到道具 ICD(兩顆旋鈕互相獨立)", () => {
    cover("combat-env-item-cooldown");
    // `cooldown` 4.0 是很大的一個數:如果道具 ICD 誤讀了它,這裡會掉到 1 次。
    expect(procsIn("item", 1, 4)).toBe(3);
    // 反向:道具倍率 4.0 時道具自己確實變慢了(證明上一行不是因為倍率整個沒被讀)。
    expect(procsIn("item", 4, 1)).toBe(1);
  });
});

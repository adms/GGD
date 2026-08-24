/**
 * GH#678 —— 另一個場地的聲音／語音不影響目前場地：收最後一個歸不了戶的洞。
 *
 * `death` 是 #638 之後**唯一**一則有聲音消費端（#223 的 defeat 語音 —— 任何英雄
 * 死亡都喊，`GameApp.dispatchContextualVoice`）而歸不了戶的 cue 事件：payload 沒有
 * zone、沒有座標、也不在 `EVENT_SPATIAL`。修在**發射端**：`DeathSystem` 的 payload
 * 補 `zone`（typed `DeathEvent`，GH#608 規矩）。
 *
 * 形態⑧防呆：事件是**真的 SimWorld** 跑**真的 deathSystem** 發出來的，⛔ 不是手搭
 * payload；判準逐字走出貨那一條式子（`zoneAllowsCue(cueEventZone(…))` × 真的
 * `VisibleZones`）—— 與 `GameApp.handleDrainedEvent` 的 `zoneOk` 同一個閘。
 * `zoneOfEntity` 刻意恆 null（＝實體已出快照的最壞情況），所以 zone **只能**來自
 * payload —— 這正是要在發射端補欄位、客戶端補不了的理由。
 *
 * ── 突變紀錄（一批一條）───────────────────────────────────────────────────
 *  · `DeathSystem` payload 的 `zone` 欄拿掉（改回 `{ id, killer }`）→ 歸不了戶
 *    fail-open 放行 → `[true, true]` ≠ `[true, false]` 紅，訊息指名他場那一發 → 改回。
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { deathSystem } from "@ggd/shared/sim/systems/DeathSystem";
import { cueEventZone, zoneAllowsCue } from "./spatialPolicy";
import { VisibleZones } from "../net/zoneVisibility";

/** 一具站在指定 zone、這一 tick 剛好歸零的身體（deathSystem 只讀這兩個 comp）。 */
function dyingBody(world: SimWorld, zone: number): number {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone,
  });
  world.health.set(id, { hp: 0, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
  return id;
}

describe("GH#678 另一場地的 death（defeat 語音）不外漏", () => {
  it("真的 deathSystem 發的 death 帶死者的 zone；只有本地觀看 zone 的過閘", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const near = dyingBody(world, 0);
    const far = dyingBody(world, 1);
    deathSystem(world);

    const deaths = new Map<unknown, Record<string, unknown>>();
    for (const e of world.events) if (e.type === "death") deaths.set(e.data.id, e.data);
    expect([...deaths.keys()].sort(), "兩具都真的死了").toEqual([near, far].sort());

    // 本地正在觀看 zone 0（觀戰切換走同一個集合 —— refreshVisibleZones）
    const viewing = new VisibleZones();
    viewing.begin();
    viewing.add(0);
    viewing.end();
    // 最壞情況：喊的那一刻實體已出快照 ⇒ 實體歸戶恆 null，zone 只能來自 payload
    const zoneOfGone = (): number | null => null;
    const allows = (id: number): boolean =>
      zoneAllowsCue(cueEventZone("death", deaths.get(id)!, zoneOfGone), viewing);
    expect([allows(near), allows(far)], "同 zone 放行，他場丟棄").toEqual([true, false]);
  });
});

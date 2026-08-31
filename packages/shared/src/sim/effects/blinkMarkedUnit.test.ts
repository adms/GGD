/**
 * ⭐⭐ GH#448 —— **同一個按鍵，兩段行為**（owner 2026-08-19 逐字）：
 *
 * > 「30-00 攝影機 => 因為**已經不是 dota 大地圖**，請你幫我這招改成
 * >  **給予指定敵方英雄標記**，之後施展**若無指定敵方英雄單位代表順移至敵方身邊**」
 *
 * ── ⭐ 引擎缺的那一格 ────────────────────────────────────────────────────
 * `blink.to` 原本只有 `point | targetUnit | caster` ——
 * ⛔ **沒有「瞬移到被我標記的那個人」**。
 *
 * ⭐ 而「被我標記的」不需要新的簿記：`StatusEffect.sourceId` 存的是 `ctx.origin`
 *（＝這支技能的 id，`sim/effects/applyStatus.ts:204`）
 * ⇒ 「這個 `statusId` ＋ 這支技能」就唯一決定了那個人。
 * ⛔ 新增一份「誰標了誰」的表會是第〇·四守則的第二個住處。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `st.sourceId === ctx.origin` 那一半拿掉 → 「別人標的不算」紅
 *   · 找不到時回一個 fallback 座標而不是 `null` → 「沒標記就不動」紅
 *   · 迭代不排序（拿掉 `.sort()`）→ ⚠️ purity 那條閘會紅（⛔ 不在這裡）
 *   · ⛔ `markStatusId === undefined` 的早退 → **綠**（⭐ 它是冗餘的，見該 `it()` 的註解）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { blinkEffect } from "./blink";

const Z0 = SKELETON_ARENA.zones[0]!;
const A = "fixture-blink-a" as ChampionId;
const ORIGIN = "ability:test.mark";

beforeAll(() => {
  registerSkeletonContent();
  registerChampion({ ...THORNE, id: A });
});

function stage(): { world: SimWorld; caster: EntityId; marked: EntityId; other: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 20260831);
  const at = (dx: number, dz: number, seat: number): EntityId =>
    spawnChampion(world, {
      championId: A,
      seatId: asSeatId(seat),
      teamId: asTeamId(seat === 0 ? 0 : 1),
      pos: { x: Z0.center.x + dx, z: Z0.center.z + dz },
      zone: 0,
    });
  const caster = at(0, 0, 0);
  const marked = at(6, 0, 1);
  const other = at(-6, 0, 2);
  world.rebuildGrid();
  return { world, caster, marked, other };
}

/** ⭐ 真的把標記掛上去（⛔ 不是造一份假的 world 狀態）。 */
function mark(world: SimWorld, id: EntityId, sourceId: string): void {
  const comp = world.status.get(id) ?? { effects: [] };
  comp.effects.push({
    statusId: "burn" as never,
    sourceId,
    expiresAtTick: world.tick + 10_000,
  } as never);
  world.status.set(id, comp);
}

const run = (world: SimWorld, caster: EntityId, markStatusId?: string): void => {
  blinkEffect.apply(
    { kind: "blink", shape: "single", to: "markedUnit", applyTo: "self", markStatusId } as never,
    { world, caster, origin: ORIGIN, targets: [] } as never,
    [] as never,
    (() => {}) as never,
  );
};

const posOf = (world: SimWorld, id: EntityId): { x: number; z: number } => {
  const t = world.transform.get(id)!;
  return { x: t.pos.x, z: t.pos.z };
};

describe("GH#448 blink to markedUnit", () => {
  it("量尺先自證：三個身體站在**不同**位置（⛔ 否則位移量不出來）", () => {
    const s = stage();
    expect(posOf(s.world, s.caster).x).not.toBeCloseTo(posOf(s.world, s.marked).x, 1);
  });

  it("★ ⭐ **標記過 ⇒ 瞬移到他身邊**", () => {
    const s = stage();
    mark(s.world, s.marked, ORIGIN);
    const before = posOf(s.world, s.caster);
    run(s.world, s.caster, "burn");
    const after = posOf(s.world, s.caster);
    expect(after, "⛔ 施法者沒有移動 —— 標記路徑沒接上").not.toEqual(before);
    const d = Math.hypot(after.x - posOf(s.world, s.marked).x, after.z - posOf(s.world, s.marked).z);
    expect(d, "⛔ 落點離被標記的人太遠").toBeLessThan(2);
  });

  it("★ ⭐ **沒標記 ⇒ 什麼都不做**（⛔ 不瞬移到隨便一個敵人）", () => {
    const s = stage();
    const before = posOf(s.world, s.caster);
    run(s.world, s.caster, "burn");
    expect(posOf(s.world, s.caster), "⛔ 它跑去某個地方了").toEqual(before);
  });

  it("★ ⭐ **別人標的不算** —— `sourceId` 不是這支技能就當作沒標", () => {
    const s = stage();
    mark(s.world, s.marked, "ability:someone-else");
    const before = posOf(s.world, s.caster);
    run(s.world, s.caster, "burn");
    expect(
      posOf(s.world, s.caster),
      "⛔ 追到了別人標記的目標 —— 那會讓兩位臭作互相搶目標",
    ).toEqual(before);
  });

  it("⭐ 沒填 `markStatusId` ⇒ 什麼都不做（⛔ 不是隨便挑一個狀態）", () => {
    // ⚠️ ⭐ **這一格刻意標成「⛔ 沒有突變驗過」**（2026-08-31 實測）：
    //   拿掉 `if (e.markStatusId === undefined) return null;` 之後它**仍然綠** ——
    //   ⭐ 因為 `st.statusId === undefined` 對每一個狀態都是 false ⇒ 落到同一個 `null`。
    //   ⇒ ⭐ **那一行是冗餘的早退，⛔ 不是承重的線**（承重的是①`sourceId` ②`best === null`，
    //     兩條都紅過）。留著它是為了讓意圖寫在程式裡，⛔ 而這一格只是把契約寫成可讀的行為，
    //   ⛔ 不可以被引用成「這條路徑有守衛」。
    const s = stage();
    mark(s.world, s.marked, ORIGIN);
    mark(s.world, s.other, ORIGIN);
    const before = posOf(s.world, s.caster);
    run(s.world, s.caster, undefined);
    expect(
      posOf(s.world, s.caster),
      "⛔ 沒指定要追哪一個標記，而它挑了一個 —— 那是「猜」，⛔ 不是機制",
    ).toEqual(before);
  });
});

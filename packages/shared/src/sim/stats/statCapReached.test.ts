/**
 * GH#354 / G19 —— **屬性首次達到一般上限**（`statCapReached` → `onStatCapReached`）。
 *
 * #61 閃耀金玉「每當自身**任一屬性首次達到一般上限**時，獲得 1 層『金玉』，最多 2 層。
 * 每層使：所有已達上限的屬性 解鎖上限 +25%⋯」。
 *
 * ⭐ 事件負載帶 `stat`，而那一格**同時**解掉「已達上限的**那些**屬性 +25%」——
 * 所以 owner 2026-08-17 裁掉的 G20（跨屬性計數器）確實不需要存在。
 *
 * ⚠️ 三條性質，各自對應一個會靜默壞掉的地方：
 *   ① 到頂會發 —— 沒有的話整張卡是死的（失敗形態②）
 *   ② **只發一次** —— 「首次」是這張卡的全部語意；每 tick 都發的話 2 層上限
 *      會在同一 tick 內被跑滿
 *   ③ 門檻是**一般**上限而不是解鎖後的高度 —— 後者會讓這張卡永遠追不到自己
 *
 * 突變紀錄：`statPipeline` 的 `sc.capReached?.has(stat)` 早退刪掉
 * → 第②條當場紅（每次 recompute 都再發一次）；改回。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Augments, Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "./statPipeline";
import { Stat } from "./statTypes";
import { ModOp } from "./modifiers";
import { capFor, DEFAULT_STAT_CAPS } from "../statCaps";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!;
});

/** ⛔ 挑一條真的有夾限的屬性，⛔ 不寫死出貨的攻速數字（第二守則）。 */
const CAPPED = (Object.keys(DEFAULT_STAT_CAPS) as Stat[]).find((s) => {
  const c = capFor(DEFAULT_STAT_CAPS, s);
  return Number.isFinite(c.base) && c.base > 0;
})!;

function fresh(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
  recomputeStats(world, id);
  world.events.length = 0; // 開場的 recompute 不算
  return { world, id };
}

function capEvents(world: SimWorld): { entity: unknown; stat: unknown }[] {
  return world.events
    .filter((e) => e.type === "statCapReached")
    .map((e) => e.data as { entity: unknown; stat: unknown });
}

describe("屬性首次到頂（GH#354 / G19）", () => {
  it("★ ① 推到一般上限就發，而且負載帶**是哪一條屬性**", () => {
    const { world, id } = fresh();
    attachSource(world, id, {
      id: "push",
      kind: "buff",
      modifiers: [{ stat: CAPPED, op: ModOp.Flat, value: 1e9 }],
    });
    recomputeStats(world, id);
    const got = capEvents(world);
    expect(got.length, "推到上限卻沒有任何事件 —— 整張卡是死的").toBeGreaterThan(0);
    expect(got.some((e) => e.stat === CAPPED && e.entity === id)).toBe(true);
  });

  it("★ ② 只發一次 —— 「首次」是這張卡的全部語意", () => {
    const { world, id } = fresh();
    attachSource(world, id, {
      id: "push",
      kind: "buff",
      modifiers: [{ stat: CAPPED, op: ModOp.Flat, value: 1e9 }],
    });
    recomputeStats(world, id);
    const first = capEvents(world).filter((e) => e.stat === CAPPED).length;
    expect(first).toBe(1);
    // 再算五次（買裝備、升級、buff 到期都會觸發 recompute）—— 一則都不可以多。
    for (let i = 0; i < 5; i++) recomputeStats(world, id);
    expect(capEvents(world).filter((e) => e.stat === CAPPED).length, "每次重算都再發一次").toBe(1);
  });

  it("③ 沒到上限就不發（⛔ 不是「有屬性就發」）", () => {
    const { world, id } = fresh();
    recomputeStats(world, id);
    expect(capEvents(world).some((e) => e.stat === CAPPED)).toBe(false);
  });

  it("★ ④ 門檻是**一般**上限 —— 解鎖之後不會把門檻一起抬走", () => {
    const { world, id } = fresh();
    const { base, unlocked } = capFor(DEFAULT_STAT_CAPS, CAPPED);
    // 同時掛「解鎖」與「推到底」：如果門檻讀的是解鎖後的高度，
    // 那麼一件「到頂就解鎖」的寶具永遠追不到自己 —— 事件會不發。
    attachSource(world, id, {
      id: "both",
      kind: "buff",
      modifiers: [
        { stat: CAPPED, op: ModOp.CapRaise, value: unlocked },
        { stat: CAPPED, op: ModOp.Flat, value: base },
      ],
    });
    recomputeStats(world, id);
    expect(
      capEvents(world).some((e) => e.stat === CAPPED),
      "解鎖之後門檻跟著抬高了 —— 這張卡永遠追不到自己",
    ).toBe(true);
  });

  it("⑤ 閂跟著身體走：另一個身體自己從頭算起", () => {
    const { world, id } = fresh();
    attachSource(world, id, {
      id: "push",
      kind: "buff",
      modifiers: [{ stat: CAPPED, op: ModOp.Flat, value: 1e9 }],
    });
    recomputeStats(world, id);
    const other = spawnChampion(world, {
      championId: champion,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: SKELETON_ARENA.zones[0]!.center.x + 2, z: SKELETON_ARENA.zones[0]!.center.z },
      zone: 0,
    });
    attachSource(world, other, {
      id: "push",
      kind: "buff",
      modifiers: [{ stat: CAPPED, op: ModOp.Flat, value: 1e9 }],
    });
    recomputeStats(world, other);
    expect(capEvents(world).filter((e) => e.entity === other && e.stat === CAPPED).length).toBe(1);
  });
});

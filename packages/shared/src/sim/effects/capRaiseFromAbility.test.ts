/**
 * GH#286 —— **技能**（不是道具、不是三選一）解得開攻速上限嗎。
 *
 * 三支重製文案要的就是這條路：59-001 完全暴走「[攻擊速度]提升至最上限 10」·
 * 15-04 雷天大壯「[攻擊速度上限]提升至10」· 80-002 戰無不勝「提升[攻擊速度上限]至10」。
 *
 * ⚠️ 既有的守衛蓋不到這一條：`sim/economy/capUnlockContent.test.ts` 走
 * `applyAugmentPick`（三選一）與 `grantItemFree`（道具），兩條都**繞過 effectRunner**。
 * 技能的路多了一段 `applyBuff` 搬運（`modifiers` 在那裡被原封轉交只是**現在**成立）。
 * 量到的證據：把 `applyBuff` 改成 filter 掉 capRaise，那 12 條**全綠**，只有這一支紅。
 *
 * ⛔ 出貨數值（4.0 / 10.0）不寫進斷言 —— 一律從 `DEFAULT_STAT_CAPS` 推導。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { zEffectDef } from "../../content/schema/effect";
import { Augments, Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { capFor, DEFAULT_STAT_CAPS } from "../statCaps";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { Rng } from "../math/rng";
import { applyEffect } from "./effectRunner";
import type { EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
/**
 * 出貨表的兩層，不抄字面值。
 * ⚠️ 一定要餵 `DEFAULT_STAT_CAPS`（= `SimWorld.statCaps` 的預設）——
 * `capFor(undefined, …)` 走的是「沒有 cap 表」那條退路，會回 `base === unlocked`
 * 的單層，於是整支測試的三條斷言塌成同一個數字而且**全綠**。
 */
const CAP = capFor(DEFAULT_STAT_CAPS, Stat.AttackSpeed);
/**
 * 起跳點 = 兩層的中點的一半，所以 ×2 之後**嚴格落在 base 與 unlocked 之間**。
 * 三種壞實作因此各自被一條斷言分開：夾在 base（CapRaise 沒送到）、
 * 停在 START_AS（×2 沒生效）、跳到 unlocked（夾在硬上限而不是實際值）。
 */
const START_AS = (CAP.base + CAP.unlocked) / 4;

let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!; // 排序後取第一個：Map 迭代順序不可倚賴
});

const asOf = (w: SimWorld, id: EntityId): number => w.stats.get(id)!.final[Stat.AttackSpeed];

/** 一名英雄，攻速被一個量出來的 Flat 精準推到 `START_AS`。 */
function heroAt(world: SimWorld): EntityId {
  const id = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
  recomputeStats(world, id);
  attachSource(world, id, {
    id: "test:as-floor",
    kind: "buff",
    modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: START_AS - asOf(world, id) }],
  });
  recomputeStats(world, id);
  return id;
}

/**
 * 走出貨的技能路徑：effectRunner → applyBuff。`unlock` 決定帶不帶 CapRaise。
 * 每次都開一個乾淨的世界 —— 同一個身上掛兩次 buff 會互相污染。
 */
function castDoubleAttackSpeed(unlock: boolean): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = heroAt(world);
  const e: EffectDef = {
    kind: "applyBuff",
    duration: 999,
    modifiers: [
      { stat: Stat.AttackSpeed, op: ModOp.PercentMult, value: 1.0 },
      ...(unlock ? [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: CAP.unlocked }] : []),
    ],
  };
  applyEffect(e, {
    world,
    caster: id,
    rank: 1,
    targets: [id],
    origin: "ability:test.r",
    rng: new Rng(1),
  });
  recomputeStats(world, id);
  return asOf(world, id);
}

describe("GH#286 技能解鎖攻速上限（59-001 / 15-04 / 80-002 走的那條路）", () => {
  it("★ 同一支技能：沒有 CapRaise 夾在一般上限，加上 CapRaise 就抬得起來", () => {
    cover("statcaps-ability-capraise");
    // 前提：攻速必須是**兩層**的。單層（base === unlocked）會讓下面三條斷言
    // 全部退化成同一個數字，整條守衛靜默失效。
    expect(CAP.unlocked, "攻速的解鎖層被關掉了 —— 這三支技能的文案就不成立").toBeGreaterThan(
      CAP.base,
    );
    const locked = castDoubleAttackSpeed(false);
    const unlocked = castDoubleAttackSpeed(true);
    expect(locked, "沒有 CapRaise 卻超過一般上限 —— 上限根本沒在夾").toBeCloseTo(CAP.base, 6);
    expect(unlocked, "技能帶了 CapRaise 卻還是被夾在一般上限 —— applyBuff 沒把它送到").toBeCloseTo(
      START_AS * 2,
      6,
    );
    expect(unlocked, "夾在硬上限而不是實際值").toBeLessThan(CAP.unlocked);
  });

  it("出貨的 Zod 收得下這個 effect —— 作者寫得出來，不是只有測試組得出來", () => {
    cover("statcaps-ability-capraise");
    // 失敗形態②的上游那一半：sim 跑得動，但內容載入器把文件擋掉 → 三支技能
    // 照樣拿不到，而且錯誤訊息會指向別的地方（見 CLAUDE.md 內容 build 那一節）。
    const parsed = zEffectDef.safeParse({
      kind: "applyBuff",
      duration: 999,
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: CAP.unlocked }],
    });
    expect(parsed.success, `技能文件寫不出 capRaise：${parsed.error?.message}`).toBe(true);
  });
});

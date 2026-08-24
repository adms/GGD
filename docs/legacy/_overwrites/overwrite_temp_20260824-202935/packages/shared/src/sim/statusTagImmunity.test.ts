/**
 * ⭐ GH#656 —— 殭屍王的**選擇性**狀態免疫。
 *
 * owner 2026-08-24（逐字）：
 * > 「殭屍王**免疫負面狀態** 包含**暈眩 緩慢 詛咒 致盲**
 * >  但**可被吸血、暴擊、淨化跟其他技能標記與疊層**」
 *
 * ⛔ 這一支驗**機制**不驗數字：斷言全部是「這一份狀態掛上去了沒有」。
 * ⭐ 兩個方向一起讀 —— 只驗「暈眩擋掉了」的話，一個把**所有**狀態都擋掉的
 * 實作（＝ owner 明說不要的那一種）也會過。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { attachSource } from "./stats/statPipeline";
import { Statuses } from "./content/registry";
import { clearPools } from "./clearPools";
import type { EffectContext, EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";

/** 出貨的分群：`cc` = owner 點名的四類；標記／疊層那一半不帶它。 */
const STUN = "t-stun";
const SLOW = "t-slow";
const BLIND = "t-blind";
const MARK = "t-mark";

beforeAll(() => {
  registerSkeletonContent();
  Statuses.register(STUN, { polarity: "debuff", tags: ["stun", "hard-cc", "cc", "debuff"] });
  Statuses.register(SLOW, { polarity: "debuff", tags: ["slow", "soft-cc", "cc", "debuff"] });
  Statuses.register(BLIND, { polarity: "debuff", tags: ["blind", "miss", "soft-cc", "cc", "debuff"] });
  // ⭐ 標記／疊層：出貨的【破甲】【破魔】【連段窗】就是這個形狀 —— debuff 極性
  // 卻**不帶 `cc`**。owner 明說這一半要留著。
  Statuses.register(MARK, { polarity: "debuff", tags: ["armor-break", "shred", "debuff"] });
});

const C = SKELETON_ARENA.zones[0]!.center;

function rig(immuneTags?: readonly string[]): { world: SimWorld; king: EntityId; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const king = mk(0, 0, 0);
  const caster = mk(1, 1, 2);
  world.step(new Map());
  if (immuneTags) {
    // ⭐ 走**出貨的**那條路：一份 `ModifierSource` 上的 `statusImmunity` 授予，
    // ⛔ 不是測試自己造一個旁路（失敗形態⑤）。殭屍王的天生技 rank 掛的就是它。
    attachSource(world, king, {
      id: "passive:king-innate",
      kind: "passive",
      modifiers: [],
      statusImmunity: { tags: immuneTags },
    });
  }
  return { world, king, caster };
}

function hit(world: SimWorld, caster: EntityId, king: EntityId, statusId: string): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [king],
    origin: "test:king",
    rng: world.rng,
  };
  runEffects(
    [{ kind: "applyStatus", statusId: statusId as StatusId, duration: 5 } as EffectDef],
    ctx,
  );
}

function held(world: SimWorld, id: EntityId): string[] {
  return (world.status.get(id)?.effects ?? []).map((e) => String(e.statusId)).sort();
}

describe("選擇性狀態免疫 (GH#656 殭屍王)", () => {
  it("免疫 cc 那一類：暈眩／緩慢／致盲全部掛不上，⛔ 而標記與疊層照樣掛得上", () => {
    const { world, king, caster } = rig(["cc"]);
    for (const s of [STUN, SLOW, BLIND, MARK]) hit(world, caster, king, s);
    // 兩個方向一起讀：左邊少一個 = 免疫漏了；右邊多一個 = 免疫吃掉了 owner 要留的那一半。
    expect(held(world, king)).toEqual([MARK]);
  });

  it("沒有授予免疫的同一具身體，四種全部掛得上（⛔ 不是狀態本身壞了）", () => {
    const { world, king, caster } = rig();
    for (const s of [STUN, SLOW, BLIND, MARK]) hit(world, caster, king, s);
    expect(held(world, king)).toEqual([BLIND, MARK, SLOW, STUN].sort());
  });

  it("免疫是**逐 tag** 的：只免 slow 時，暈眩照樣掛得上", () => {
    const { world, king, caster } = rig(["slow"]);
    for (const s of [STUN, SLOW]) hit(world, caster, king, s);
    expect(held(world, king)).toEqual([STUN]);
  });

  it("⭐ 免疫擋的是「掛上來」，⛔ 不擋【淨化】把身上的東西拔走", () => {
    const { world, king, caster } = rig(["cc"]);
    hit(world, caster, king, MARK);
    expect(held(world, king)).toEqual([MARK]);
    clearPools(world, king, { pools: { status: true }, polarity: "debuff" });
    // owner：「可被⋯淨化」—— 免疫過的身體仍然被淨化得動。
    expect(held(world, king)).toEqual([]);
  });
});

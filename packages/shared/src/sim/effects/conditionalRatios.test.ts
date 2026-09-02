/**
 * ⭐ `ratios[].when` —— 條件式係數的**承重守衛**（GH#936）。
 *
 * owner 2026-09-02（逐字）：
 * > 「#10 龍破斬：卡面說「碎片增幅後 +180%AP」，⛔ 而 1.8×AP 是常駐的，不需要碎片
 * >  => **碎片是 EX 施展得到的增幅狀態，可以做條件偵測增幅 AP 傷害**，開票」
 *
 * ⛔ 這裡**沒有一條**斷言長成「schema 有 `when` 這個欄位」——那是失敗形態⑦
 * （掃屬性代替掃行為）。每一條都：**過出貨的 `zScaling`** → 綁**出貨的**
 * `evaluateCondition`（真的 `SimWorld`、真的 `applyStatus` 掛上去的狀態）→
 * 讀 `resolveScaling` 真的回傳值。
 *
 * ⭐ **兩個方向一起驗**（CLAUDE.md：一把只驗過單邊的尺不算自證過）——
 * 條件不成立時那一項**不計入**，成立時**計入**。只驗其中一邊的話，
 * 「`when` 根本沒接上」與「條件真的沒成立」量起來一模一樣。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `effect.ts::resolveScaling` 的
 *    `if (r.when !== undefined && (holds === undefined || !holds(r.when))) continue;`
 *    整行拿掉（＝回到「一律計入」，也就是這張票要修的缺陷本身）
 *    → ①「條件不成立不計入」FAIL、③「沒接求值器 ⇒ 不計入」FAIL；②④ 仍綠
 *    （②是「成立時計入」—— ⭐ 它對壞掉的實作**也會過**，這正是為什麼一邊不夠）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { evaluateCondition } from "../content/condition";
import { NO_ATTR_LOOKUP, resolveScaling, type Scaling } from "./effect";
import { Stat, zeroStats } from "../stats/statTypes";
import { zScaling } from "../../content/schema/common";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
const BUFF = "sunder" as StatusId; // 出貨骨架內容裡就有的狀態，⛔ 不自己編一個
const [BASE, AP, COEFF] = [100, 200, 0.5];

/** 施法者一名 ＋ 一支綁在**出貨** `evaluateCondition` 上的求值器。 */
function rig() {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const hero: EntityId = spawnChampion(world, {
    zone: 0, championId: SELA.id as ChampionId, seatId: asSeatId(0),
    teamId: asTeamId(0), pos: { x: C.x, z: C.z },
  });
  const stats = { ...zeroStats(), [Stat.AbilityPower]: AP };
  /** 走出貨的 `applyStatus` 把狀態掛到施法者身上（⛔ 不手寫進 StatusComp）。 */
  const buff = (): void =>
    runEffects([{ kind: "applyStatus", statusId: BUFF, duration: 9 }], {
      world, caster: hero, rank: 1, targets: [hero], origin: "probe", rng: world.rng,
    });
  let asked = 0;
  const holds = (cond: Parameters<typeof evaluateCondition>[1]) => {
    asked += 1;
    return evaluateCondition(world, cond, { self: hero, target: hero });
  };
  return {
    buff,
    asks: () => asked,
    /** `holds` 省略 ⇒ 「沒有人接上求值器」那條路。 */
    dmg: (sc: Scaling, wired = true) =>
      resolveScaling(stats, sc, 1, NO_ATTR_LOOKUP, wired ? holds : undefined),
  };
}

/** ⛔ 一定要過出貨的 Zod：型別上寫得出來、schema 收不下的東西是假綠。 */
const scaling = (gated: boolean): Scaling =>
  zScaling.parse({
    flat: BASE,
    ratios: [{ stat: "ap", coeff: COEFF, ...(gated ? { when: { kind: "status", subject: "self", statusId: BUFF } } : {}) }],
  }) as Scaling;

describe("ratios[].when —— 條件式係數（GH#936）", () => {
  it("★ ① 條件不成立 ⇒ 那一項不計入（⭐ 這一條是缺陷本身：1.8×AP 曾經是常駐的）", () => {
    const r = rig();
    expect(r.dmg(scaling(true)), "還沒掛上增幅狀態就不該吃 AP 係數").toBe(BASE);
  });

  it("★ ② 條件成立 ⇒ 計入（⚠️ 單獨看它對壞掉的實作也會過，所以①②要一起讀）", () => {
    const r = rig();
    r.buff();
    expect(r.dmg(scaling(true)), "掛上之後才吃 AP 係數").toBe(BASE + AP * COEFF);
  });

  it("★ ③ `when` 缺席 ＝ 今天，一個位元都不差，而且**一次求值器都不問**（零 rng draw）", () => {
    const r = rig();
    expect(r.dmg(scaling(false)), "沒有 when 的係數一律計入").toBe(BASE + AP * COEFF);
    expect(r.dmg(scaling(false), false), "沒接求值器也一樣 —— 出貨那 208 個節點走的就是這條").toBe(BASE + AP * COEFF);
    expect(r.asks(), "⛔ when 缺席時不可以呼叫求值器（呼叫了就會消耗 world.rng）").toBe(0);
  });

  it("★ ④ 有 `when` 卻沒有人接求值器 ⇒ 不計入（fail-CLOSED，⛔ 不是疏忽）", () => {
    const r = rig();
    r.buff();
    expect(r.dmg(scaling(true), false), "沒接線要長得像「條件沒成立」，⛔ 不可以像「常駐」").toBe(BASE);
  });
});

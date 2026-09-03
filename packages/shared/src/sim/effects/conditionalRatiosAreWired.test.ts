/**
 * ⭐⭐ **條件式係數在出貨的那條路上真的被問了**（2026-09-03）。
 *
 * ⛔⛔ 量到的缺口（GH#937 的前提回驗挖出來的）：
 * `resolveScaling` 的第五參 `holds` 是 **fail-CLOSED** ——
 * 檔頭那張表逐字寫著「`when` 有而 `holds` 沒有 ⇒ **不計入**」。
 * ⭐ 而 2026-09-03 量到全 repo **零個 production 呼叫點傳它**
 * ⇒ ⭐⭐ GH#936／#944 落地的四筆條件式係數在遊戲裡**永遠是 0**。
 *
 * ⚠️⚠️ **而既有的守衛對它結構性失明**（失敗形態⑪：兩條各驗一半，接縫沒人站）：
 *
 * | 守衛 | 它證明了什麼 | ⛔ 它問不到什麼 |
 * |---|---|---|
 * | `conditionalRatios.test.ts`（#936） | ⭐ `resolveScaling` **收到** `holds` 時會問它 | ⛔ **有沒有人傳** |
 * | `normalizersKeepConditionalRatios`（今天） | ⭐ 內容裡那幾筆**還在** | ⛔ 它們**有沒有生效** |
 * | `fragmentGatedRatio` / `formAmplifyClaims` | ⭐ 卡面與 JSON 對得上 | ⛔ 同上 |
 *
 * ⇒ ⭐ 這一支走的是**出貨的那條路**：真的 `SimWorld`、真的 `runEffects`、
 * 真的 `damage` handler、量**真的掉血**。⛔ 不自己呼叫 `resolveScaling`
 * （那是形態⑤ —— 被測的不是出貨的那個，而 #936 那一支就是刻意只驗那一層）。
 *
 * ⭐ **兩個方向一起驗**（CLAUDE.md：一把只驗過單邊的尺不算自證過）：
 * 條件成立 ⇒ 掉血**更多**；不成立 ⇒ 回到基礎值。
 * ⚠️ 只驗「成立時多」的話，「條件永遠成立」與「接線正確」量起來一模一樣。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `damage.ts` 的 `scalingOracle(ctx.world, ctx.caster, target)` 拿掉第五參
 *    （＝回到今天出貨前的樣子）→ ①🔴「條件成立時要更痛」FAIL（兩次掉血相同）
 *    ②仍綠（它是「不成立時不加」—— ⭐ 對沒接線的實作也會過，這正是為什麼要兩邊）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { zScaling } from "../../content/schema/common";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";
import type { EffectDef } from "./effect";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** ⭐ 出貨骨架內容裡就有的狀態 —— ⛔ 不自己編一個（編的那個 registry 不認得）。 */
const BUFF = "sunder" as StatusId;

interface Rig {
  world: SimWorld;
  hero: EntityId;
  victim: EntityId;
}

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      zone: 0,
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
    });
  return { world, hero: mk(0, 0, 0), victim: mk(1, 1, 1.2) };
}

/** ⛔ 一定要過出貨的 Zod —— 型別上寫得出來、schema 收不下的東西是假綠。 */
function gatedDamage(): EffectDef {
  return {
    kind: "damage",
    damageType: "true",
    amount: zScaling.parse({
      flat: 100,
      ratios: [
        { stat: "ap", coeff: 5, when: { kind: "status", subject: "self", statusId: BUFF } },
      ],
    }),
  } as EffectDef;
}

/** 打一發，回傳**掉了多少血** —— ⭐ 量血差，⛔ 不量絕對值（護甲先吃掉一部分）。 */
function hit(r: Rig, withBuff: boolean): number {
  if (withBuff)
    runEffects([{ kind: "applyStatus", statusId: BUFF, duration: 9 } as EffectDef], {
      world: r.world,
      caster: r.hero,
      rank: 1,
      targets: [r.hero],
      origin: "probe",
      rng: r.world.rng,
    });
  const before = r.world.health.get(r.victim)?.hp ?? 0;
  runEffects([gatedDamage()], {
    world: r.world,
    caster: r.hero,
    rank: 1,
    targets: [r.victim],
    origin: "probe",
    rng: r.world.rng,
  });
  // ⚠️ ⭐ 傷害走**佇列** —— 要跑一個 tick 才落地
  //   （`authGatesWave1.test.ts` 逐字：「傷害走佇列，要跑一個 tick 才落地」）。
  //   ⛔ 少了這一行，兩邊都量到 0 ⇒ 「接線壞了」與「量尺壞了」長得一模一樣。
  r.world.step(new Map());
  return before - (r.world.health.get(r.victim)?.hp ?? 0);
}

describe("條件式係數在出貨路徑上真的被問了（2026-09-03）", () => {
  it("★★ ⭐⭐ 條件**成立**時掉血更多 —— ⛔ 沒接求值器的話這一條會 FAIL", () => {
    const plain = hit(rig(), false);
    const buffed = hit(rig(), true);
    expect(plain, "⛔ 基礎那一發沒有掉血 —— 量尺壞了，這一支的結論全部作廢").toBeGreaterThan(0);
    expect(
      buffed,
      `⛔⛔ 帶著狀態打出去與沒帶一樣痛（${buffed} vs ${plain}）\n` +
        "  ⭐ 那代表 `resolveScaling` 的第五參沒有被傳進來 ⇒ fail-closed ⇒ 那一項不計入。\n" +
        "  ⭐ 修法：那個 effect handler 要傳 `scalingOracle(ctx.world, ctx.caster, target)`。",
    ).toBeGreaterThan(plain);
  });

  it("⭐ 反方向：條件**不成立**時那一項**不計入**（⛔ 否則等於常駐）", () => {
    // ⭐ 兩個**獨立**的 rig —— ⛔ 同一個會被上一次 `step()` 推進的 tick 污染。
    const plain = hit(rig(), false);
    const again = hit(rig(), false);
    expect(
      again,
      "⛔ 兩發沒帶狀態的傷害不一樣 —— 那條件式係數在漏水（或量尺不穩）",
    ).toBe(plain);
  });
});

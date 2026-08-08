/**
 * Lane 1（2026-08-08）四個新 effect kind 的**行為**守衛。
 *
 * 一支檔案守四個 kind，因為它們是**同一個形狀的四個實例**（`shape` + 決策欄位
 * + 一個 handler，界共用 `kindLimits.ts`）—— 第零守則⑨：K 個模板 + 一張表。
 *
 * ⚠️ 每一條讀的都是**最終世界狀態**（`hp` / `mana` / `cooldownRemainingTicks` /
 * `rng.state`），不是「EffectDef 長什麼樣」。出貨數值一個都沒有進斷言：
 * 夾具自己造的量從夾具推導（CLAUDE.md「驗機制不驗數字」）。
 *
 * ── 突變紀錄（都真的做過：改壞 → 紅 → 改回來）─────────────────────────────
 *  · `weightedBranch.apply` 的「一次 draw」改成每分支各 `ctx.rng.next()` 一次
 *      → `wb-single-draw` 紅（rng 狀態多走了 N−1 步）
 *  · `modifyCooldown` 的 `if (e.slot !== undefined && e.slot !== slot) continue`
 *    拿掉（＝變成全域 cdr）→ `mc-only-one-slot` 紅（W 的冷卻也被清掉）
 *  · `swapResource` 的「先驗後改」改成邊改邊跳過（`onInvalidTarget` 失效）
 *      → `sr-abort-atomic` 紅（自己的血被換成一半而目標其實已經死了）
 *  · `eventValueConversion` 忽略 `basis` 欄位（永遠讀 `mitigated`）
 *      → `evc-no-event-no-effect` 的第三段紅（`basis:"raw"` 拿到 mitigated 的量）
 *
 * ⚠️ 誠實紀錄一個**沒有紅**的突變：把 `if (!inc) return` 改成 `value = 0` 之後
 * 照跑，四條仍然全綠 —— 因為下游的 `if (!(value > 0)) return` 把它接住了。
 * 也就是說「沒有事件就整條不執行」這條斷言驗到的是**結果**，不是那一行。
 * 兩層擋法是刻意的（早退比較誠實），但這裡不假裝那一行有守衛。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { Rng } from "../math/rng";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef, TriggerDamage } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): { world: SimWorld; caster: EntityId; other: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 13);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const other = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, caster, other };
}

function run(
  world: SimWorld,
  caster: EntityId,
  targets: EntityId[],
  effects: EffectDef[],
  incoming?: TriggerDamage,
): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets,
    origin: "ability:test.lane1",
    rng: world.rng,
    ...(incoming ? { incoming } : {}),
  };
  runEffects(effects, ctx);
}

describe("Lane 1 的四個 effect kind", () => {
  it("modifyCooldown 只動被指名的那一格 —— 它不是全域 cdr", () => {
    cover("mc-only-one-slot");
    const { world, caster } = stage();
    const ab = world.abilities.get(caster)!;
    const cd = 60;
    ab.slots.Q = { abilityId: "probe.q" as AbilityId, rank: 1, cooldownRemainingTicks: cd };
    ab.slots.W = { abilityId: "probe.w" as AbilityId, rank: 1, cooldownRemainingTicks: cd };

    run(world, caster, [caster], [
      { kind: "modifyCooldown", shape: "single", slot: "Q", mode: "reset" },
    ]);

    expect(ab.slots.Q.cooldownRemainingTicks, "被指名的那一格沒有被重置").toBe(0);
    // ⛔ 這一半才是重點：全域 cdr 的實作對上面那條也會過。
    expect(ab.slots.W.cooldownRemainingTicks, "沒被指名的那一格也被動了 = 這是全域 cdr").toBe(cd);
  });

  it("weightedBranch 只執行中選的那一支,而且整段**只抽一次** rng", () => {
    cover("wb-single-draw");
    const { world, caster } = stage();
    const hp = world.health.get(caster)!;
    hp.hp = hp.maxHp * 0.2; // 挖坑，否則回血被 maxHp 夾掉

    // 期望的 rng 終態 = 從當下狀態**只**走一步。
    const probe = new Rng(0);
    probe.state = world.rng.state;
    probe.next();
    const afterOneDraw = probe.state;

    const before = hp.hp;
    const bump = 7;
    run(world, caster, [caster], [
      {
        kind: "weightedBranch",
        shape: "single",
        branches: [
          // weight 0 = 關掉但沒刪掉；它永遠不該被選到。
          { weight: 0, effects: [{ kind: "heal", amount: { flat: bump * 100 } }] },
          { weight: 1, effects: [{ kind: "heal", amount: { flat: bump } }] },
        ],
      },
    ]);

    // ① 中選的是唯一有權重的那一支（0 權重的分支沒有被執行）。
    expect(hp.hp - before).toBeCloseTo(bump, 6);
    // ② ⭐ 承重線：每分支各抽一次的實作會讓狀態多走 N−1 步。
    expect(world.rng.state, "整段執行不是剛好一次 rng draw").toBe(afterOneDraw);
  });

  it("swapResource 原子交換,而其中一個目標失效時整招不做（不留半套狀態）", () => {
    cover("sr-abort-atomic");
    const { world, caster, other } = stage();
    // 第三個身體，等一下把它弄成失效的那一個。
    const corpse = spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(2),
      teamId: asTeamId(1),
      pos: { x: C.x + 4, z: C.z },
      zone: 0,
    });
    const mine = world.health.get(caster)!;
    const theirs = world.health.get(other)!;
    mine.hp = mine.maxHp * 0.2;
    theirs.hp = theirs.maxHp * 0.8;

    // ① 正常的一對一交換。
    const mine0 = mine.hp;
    const theirs0 = theirs.hp;
    run(world, caster, [other], [{ kind: "swapResource", shape: "single" }]);
    expect(mine.hp).toBeCloseTo(theirs0, 6);
    expect(theirs.hp).toBeCloseTo(mine0, 6);

    // ② ⛔ 兩個目標、其中一個失效 → `"abort"`（預設）＝ **一格都不動**。
    // ⚠️ 一定要有一個**還活著**的目標同場，否則「邊改邊跳過」的實作在這裡
    // 也什麼都不做，這條就對兩種實作都會過（失敗形態 ④）。
    world.health.get(corpse)!.alive = false;
    const mineBefore = mine.hp;
    const theirsBefore = theirs.hp;
    const swapTwo: EffectDef = { kind: "swapResource", shape: "single" };
    run(world, caster, [other, corpse], [swapTwo]);
    expect(mine.hp, "有目標失效卻仍然換掉了活著的那一個 = 留下半套狀態").toBeCloseTo(
      mineBefore,
      6,
    );
    expect(theirs.hp).toBeCloseTo(theirsBefore, 6);

    // ③ `onInvalidTarget: "skip"` 是一個真的選項（活著的那一個照換）。
    run(world, caster, [other, corpse], [{ ...swapTwo, onInvalidTarget: "skip" }]);
    expect(mine.hp).toBeCloseTo(theirsBefore, 6);
  });

  it("eventValueConversion 把「這一下」轉成資源,沒有那一下就整條不執行", () => {
    cover("evc-no-event-no-effect");
    const { world, caster } = stage();
    const hp = world.health.get(caster)!;
    hp.mana = 0;

    const incoming: TriggerDamage = {
      raw: 100,
      mitigated: 60,
      hpLost: 40,
      origin: "basic",
      reflectDepth: 0,
      resolvePass: 0,
      type: "magic",
      crit: false,
    };
    const ratio = 0.5;
    const convert: EffectDef = { kind: "eventValueConversion", shape: "single", ratio };

    // ⚠️ 先驗**沒有**事件的那一半：它必須留在 0。
    run(world, caster, [caster], [convert]);
    expect(hp.mana, "沒有 incoming 卻仍然發了資源").toBe(0);

    run(world, caster, [caster], [convert], incoming);
    // 預設基數是 `mitigated`（§16.12 未 freeze，所以它是欄位）。從夾具推導，
    // 不抄任何出貨數值。
    expect(hp.mana).toBeCloseTo(incoming.mitigated * ratio, 6);

    // `basis` 真的是一格會被讀到的欄位（否則它是一個看起來有設、沒人讀的旋鈕）。
    hp.mana = 0;
    run(world, caster, [caster], [{ ...convert, basis: "raw" }], incoming);
    expect(hp.mana).toBeCloseTo(incoming.raw * ratio, 6);
  });
});

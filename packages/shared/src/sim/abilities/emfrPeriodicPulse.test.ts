/**
 * 15-00 真·不死不滅（`godie-emfr.passive`）—— **週期**的行為守衛（GH#648 先導）。
 *
 * #648 說這 43 支「說明宣稱迴圈、JSON 一格迴圈機制都沒有」。15-00 在名單上，
 * 但它的迴圈**早就住在** `passive.ranks[].hooks` 的 `onInterval` + `internalCooldown`
 * 裡（GH#369，`IntervalHookSystem` 發射）—— 名單把它算進去是掃描器看不見 hook 層
 * （`shape_axes.json` 的 `passive.hooks: []`），⛔ 不是機制不存在。
 * 這一條守衛把「機制真的存在」釘住：**真 SimWorld、出貨文件、逐 tick 數跳**。
 *
 * 既有的 `emfrThresholdPassive.test.ts` 只驗**門檻**（之上不跳、之下跳）——
 * 若 ICD 被整段拿掉、每 tick 跳 30 次，那一條照樣全綠。這裡驗的是它缺的那一半：
 * **每秒一跳 = 等距，跳距逐字等於出貨文件的 `internalCooldown`**。
 *
 * ⛔ 「1 秒」「1%」都**沒有**住在這裡（第二守則）—— 期望值全部從出貨 JSON 推導。
 * ⚠️ 數的是**魔力往下掉的那些 tick**（`spendMana.pctMaxMana`）：回血側混著自然
 * 回復，魔力側在 `manaEconomy` 關閉 + 全域回魔歸零之後，唯一的往下走就是這一跳。
 *
 * 突變（2026-08-24 驗過）：`sim/effects/hooks.ts` 的 ICD 閘
 * `if (world.tick - last < icdTicks) continue;` 改成恆不擋 → 每 tick 都跳，
 * 「跳距＝ICD」與「N 秒 ≈ N 跳」兩條一起紅。已用 Edit 還原。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { DEFAULT_MANA_ECONOMY } from "../manaEconomy";
import { DEFAULT_BASE_BONUS } from "../baseBonus";
import { Stat } from "../stats/statTypes";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const NEGI = "godie-emfr" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

describe("15-00 真·不死不滅 —— 每秒那一跳真的是週期", () => {
  it("門檻之下：跳距逐字等於出貨的 internalCooldown，觀察 N 個週期就跳 N 次", () => {
    const innate = Abilities.get(Champions.get(NEGI).passiveAbility!);
    const hook = innate.passive?.ranks[0]?.hooks?.[0];
    // 反向守衛：出貨文件真的還帶著 ICD 與燒魔那一半（沒有它們，下面數不到東西
    // 也分不出「每 tick」與「每秒」）。
    const icd = hook?.internalCooldown;
    expect(icd, "出貨文件的 internalCooldown 不見了").toBeGreaterThan(0);
    const spend = hook!.effects.find((e) => e.kind === "spendMana");
    const pct = spend && "pctMaxMana" in spend ? spend.pctMaxMana : undefined;
    expect(pct, "出貨文件的 spendMana.pctMaxMana 不見了").toBeGreaterThan(0);

    const world = new SimWorld(SKELETON_ARENA, 4242);
    // 同 emfrThresholdPassive.test.ts：把兩個跟本題無關的全域魔力項關掉，
    // 讓「魔力往下掉」只剩這一支自己（理由寫在那一支檔頭，這裡不重抄）。
    world.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enabled: false };
    world.baseBonus = { ...DEFAULT_BASE_BONUS, [Stat.ManaRegen]: 0 };
    world.combatActive = true; // `onInterval` 的閘
    const id = spawnChampion(world, {
      championId: NEGI,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 14 },
      zone: 0,
    });
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.2; // 明顯在門檻之下（門檻本身由 threshold 那一條守衛看管）

    const periods = 5; // 觀察窗：5 個週期（測試自己的選擇，⛔ 不是出貨數字）
    const ticks = Math.round((icd! * periods) / world.dt);
    const pulseFloor = 0.5 * pct! * hp.maxMana; // 半跳為界：容自然噪訊、不容整跳
    const pulseTicks: number[] = [];
    for (let i = 0; i < ticks; i++) {
      const before = hp.mana;
      world.step(NO_INTENTS);
      if (before - hp.mana > pulseFloor) pulseTicks.push(i);
    }

    // ① N 個週期 ≈ N 跳（第一跳不吃 ICD，允許相位差一跳）
    expect(pulseTicks.length).toBeGreaterThanOrEqual(periods);
    expect(pulseTicks.length).toBeLessThanOrEqual(periods + 1);
    // ② 承重：跳與跳**等距**，而且那個距離就是出貨文件的 ICD —— 「每 tick 跳
    //    30 次」與「一開始連跳后停住」在這一條上都活不下來。
    const gaps = pulseTicks.slice(1).map((t, k) => t - pulseTicks[k]!);
    expect(gaps.length).toBeGreaterThan(0);
    expect(new Set(gaps).size, `跳距不等距: ${gaps.join(",")}`).toBe(1);
    expect(gaps[0]).toBe(Math.round(icd! / world.dt));
  });
});

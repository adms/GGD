/**
 * GH#489 —— 【吞噬】改成**被動自動發生**之後，它的節奏來自哪裡。
 *
 * owner 2026-08-19：「①**59-01 吞噬**（godie-e00r.q，初號機）=> **改成被動
 * 自動發生 低於該門檻直接吃掉**」／2026-08-20：「**採用原本主動的冷卻時間就好了**」。
 *
 * ⭐ 這一支跑**真的 sim + 出貨的那一份文件**（`ContentLoader` → `registerAll`），
 * ⛔ 不掃原始碼字串、⛔ 不自己手寫一份 fixture ——「被測的不是出貨的那個」
 * 正是七種失敗形態的第 ⑤ 種，而這支技能的整條價值就在那份 JSON 上。
 *
 * ⛔ **一個出貨數字都不寫進斷言**（第二守則：守衛驗機制不驗數字）。門檻、內部
 * 冷卻、卡面冷卻、全域冷卻倍率**全部從註冊表與 config 讀回來** —— owner 下週
 * 把 60 秒改成 30 秒時，這一支自己跟著走，⛔ 不會用錯誤的訊息紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const EVA = "godie-e00r" as ChampionId;

/** 出貨那一份 59-01 的三個量，⛔ 全部讀回來。 */
let icdSec = 0;
let cardCdSec = 0;
let cdMult = 0;
let threshold = 0;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const def = Champions.get(EVA)!.abilities.Q;
  const hook = def.passive!.ranks[0]!.hooks![0]!;
  icdSec = hook.internalCooldown!;
  threshold = (hook.effects[0] as { thresholdPctOfMax: number[] }).thresholdPctOfMax[0]!;
  cardCdSec = def.cooldown[0]!;
  cdMult = (Configs.all() as { schema?: string; multipliers?: Record<string, number> }[]).find(
    (c) => c.schema === "config.combat-env@1",
  )!.multipliers!.cooldown!;
});

const hero = (w: SimWorld, seat: number, team: number, x: number, c: ChampionId): EntityId =>
  spawnChampion(w, {
    championId: c,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z: 0 },
    zone: 0,
  });

/** 把獵物釘在處決線以下再步進 —— ⛔ 隔離回血，這一支問的是**節奏**不是回復。 */
const stepPinned = (w: SimWorld, n: number, prey: EntityId[]): void => {
  for (let i = 0; i < n; i++) {
    for (const id of prey) {
      const h = w.health.get(id);
      if (h?.alive) h.hp = h.maxHp * threshold * 0.5;
    }
    w.step(new Map());
  }
};
const alive = (w: SimWorld, id: EntityId): boolean => w.health.get(id)?.alive === true;

describe("GH#489 · 59-01 吞噬 = 被動自動發生 + 內部冷卻", () => {
  /**
   * ⭐ **最承重的一條**：拿掉 hook 的 `internalCooldown`（或把
   * `hookIcdTicks` 的閘改成 0）→ 兩隻獵物在同一 tick 一起被吃掉 → 這裡紅。
   */
  it("① 門檻以下自動被吃掉，而且內部冷卻期間第二個吃不到", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const me = hero(w, 0, 0, 0, EVA);
    const a = hero(w, 1, 1, 1.5, EVA);
    const b = hero(w, 2, 1, 2.5, EVA);

    // ⛔ 沒有人施法 —— 這一步就是「自動發生」。
    stepPinned(w, 1, [a, b]);
    expect(alive(w, a)).toBe(false);
    expect(alive(w, b)).toBe(true);

    // 冷卻中：釘在處決線以下 **整段** 內部冷卻，它一次都不可以被吃掉。
    const icdTicks = Math.round(icdSec / w.dt);
    stepPinned(w, icdTicks - 2, [b]);
    expect(alive(w, b)).toBe(true);

    // 冷卻一過就自己吃 —— ⛔ 這半條同樣重要：一個永遠不再觸發的被動也「通過」上一條。
    stepPinned(w, 3, [b]);
    expect(alive(w, b)).toBe(false);
  });

  /**
   * owner 2026-08-20：「採用原本主動的冷卻時間就好了」。
   * ⚠️ 兩個欄位是**兩種秒**：卡面 × `combatEnv.cooldown` 才是玩家真的等到的秒數，
   * 而 `internalCooldown` 從來就是實際秒（`sim/effects/hookIcd.ts`）。
   * 逐字抄 60 進去 = 等 5 倍久，而卡片、schema、測試全部正常 —— 這一條就是那個閘。
   */
  it("② 內部冷卻 = 這一支自己的卡面冷卻換算成實際秒（⛔ 不是照抄卡面秒）", () => {
    expect(icdSec).toBeCloseTo(cardCdSec * cdMult, 6);
  });
});

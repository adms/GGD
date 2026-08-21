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
 * ⛔ **一個出貨數字都不寫進斷言**（第二守則：守衛驗機制不驗數字）。門檻、掃描
 * 節奏、兩餐之間的冷卻、卡面冷卻、全域冷卻倍率**全部從註冊表與 config 讀回來**
 * —— owner 下週把 60 秒改成 30 秒時，這一支自己跟著走，⛔ 不會用錯誤的訊息紅。
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
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const EVA = "godie-e00r" as ChampionId;

/** 出貨那一份 59-01 的四個量，⛔ 全部讀回來。 */
let scanSec = 0; // hook.internalCooldown —— 多久掃一次
let mealSec = 0; // onDevour 掛上的冷卻狀態有多長 —— 兩餐之間
let cardCdSec = 0; // ability.cooldown[]（卡面秒）
let cdMult = 0; // combat-env 的技能冷卻倍率
let threshold = 0;
let radius = 0; // 吞噬圓的半徑（⛔ 讀回來，不抄 12）

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const def = Champions.get(EVA)!.abilities.Q;
  const hook = def.passive!.ranks[0]!.hooks![0]!;
  const devour = hook.effects[0] as {
    thresholdPctOfMax: number[];
    radius?: number;
    onDevour?: { duration?: number }[];
  };
  scanSec = hook.internalCooldown!;
  mealSec = devour.onDevour![0]!.duration!;
  threshold = devour.thresholdPctOfMax[0]!;
  radius = devour.radius!;
  cardCdSec = def.cooldown[0]!;
  cdMult = (Configs.all() as { schema?: string; multipliers?: Record<string, number> }[]).find(
    (c) => c.schema === "config.combat-env@1",
  )!.multipliers!.cooldown!;
});

const hero = (w: SimWorld, seat: number, team: number, c: ChampionId): EntityId =>
  spawnChampion(w, {
    championId: c,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: 0, z: 0 },
    zone: 0,
  });

/**
 * 把獵物釘在**處決線以下**、並釘在**普攻打不到、吞噬圓吃得到**的距離上再步進。
 *
 * ⛔ 兩個釘子都不是為了方便：
 *   · 血量 —— 隔離回血，這一支問的是**節奏**不是回復；
 *   · 距離 —— 隔離**普攻**。實測（`origin:"basic"`）三個身體疊在出生點時會互相
 *     平A，而獵物被釘在門檻以下 ⇒ 誰先揮到誰就先死，於是這條守衛會對一個壞掉的
 *     吞噬「通過」（失敗形態④：斷言方向與缺陷無關）。
 */
const stepPinned = (w: SimWorld, n: number, eva: EntityId, prey: readonly EntityId[]): void => {
  const gap = radius * 0.75; // 吞噬圓內（0.75 < 1），普攻圈外
  for (let i = 0; i < n; i++) {
    const at = w.transform.get(eva)!.pos;
    prey.forEach((id, k) => {
      const h = w.health.get(id);
      if (h?.alive) h.hp = h.maxHp * threshold * 0.5;
      const t = w.transform.get(id);
      if (t) t.pos = { x: at.x, z: at.z + (k === 0 ? gap : -gap) };
    });
    w.step(new Map());
  }
};
const alive = (w: SimWorld, id: EntityId): boolean => w.health.get(id)?.alive === true;
const secs = (w: SimWorld, s: number): number => Math.round(s / w.dt);

describe("GH#489 · 59-01 吞噬 = 被動自動發生 + 兩餐之間有冷卻", () => {
  /**
   * ⭐ **最承重的一條**。三個突變各自讓它紅：
   *   · 拿掉 hook 的 `condition`（或那顆 `onDevour` 的冷卻狀態）→ 第二隻馬上被吃 → 紅
   *   · 把 `onInterval` 換成任何要動手的事件      → 第一隻永遠不死 → 紅
   *   · 把 `hookIcdTicks` 的節奏閘改成 0          → 兩隻在同一輪掃描裡一起沒 → 紅
   */
  it("① 門檻以下自動被吃掉，而且「兩餐之間」那段時間第二個吃不到", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    // ⛔ 關掉自動接敵：⛔ 不是為了方便，是為了讓這一支**只**量到吞噬。開著的話
    //    三個身體會互相普攻，而獵物被釘在 1.5% 血 ⇒ 誰先打到誰就先死，
    //    於是這條守衛會對一個壞掉的吞噬「通過」（失敗形態④：斷言方向與缺陷無關）。
    w.combatFeel = {
      ...w.combatFeel,
      autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...w.combatFeel.autoEngage, enabled: false },
    };
    const me = hero(w, 0, 0, EVA);
    const a = hero(w, 1, 1, EVA);
    const b = hero(w, 2, 1, EVA);

    // ⚠️ 先空跑一 tick：`rebuildGrid` 在 step 的**開頭**跑，而競技場是在那之後
    //    才把三個身體挪到出生點的 —— 少了這一 tick，圓形範圍查詢讀到的是舊格子。
    w.step(new Map());

    // ⛔ 沒有人施法 —— 這一步就是「自動發生」。
    stepPinned(w, secs(w, scanSec) + 2, me, [a, b]);
    expect([alive(w, a), alive(w, b)].filter((x) => !x)).toHaveLength(1);
    const eaten = alive(w, a) ? b : a;
    const left = eaten === a ? b : a;

    // 冷卻中：釘在處決線以下**整段**兩餐間隔，它一次都不可以被吃掉。
    stepPinned(w, secs(w, mealSec) - secs(w, scanSec) - 4, me, [left]);
    expect(alive(w, left)).toBe(true);

    // 冷卻一過就自己吃 —— ⛔ 這半條同樣重要：一個再也不觸發的被動也「通過」上一條。
    stepPinned(w, secs(w, scanSec) + 6, me, [left]);
    expect(alive(w, left)).toBe(false);
  });

  /**
   * owner 2026-08-20：「採用原本主動的冷卻時間就好了」。
   * ⚠️ 兩個欄位是**兩種秒**：卡面 × `combatEnv.cooldown` 才是玩家真的等到的秒數，
   * 而 hook / status 那一側從來就是實際秒（`sim/effects/hookIcd.ts`）。
   * 逐字抄 60 進去 = 等 5 倍久，而卡片、schema、測試全部正常 —— 這一條就是那個閘。
   */
  it("② 兩餐之間 = 這一支自己的卡面冷卻換算成實際秒（⛔ 不是照抄卡面秒）", () => {
    expect(mealSec).toBeCloseTo(cardCdSec * cdMult, 6);
    // 掃描節奏必須**比一餐短**，否則「兩餐之間 12 秒」會被取樣週期蓋掉。
    expect(scanSec).toBeGreaterThan(0);
    expect(scanSec).toBeLessThan(mealSec);
  });
});

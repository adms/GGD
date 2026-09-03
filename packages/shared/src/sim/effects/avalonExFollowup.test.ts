/**
 * ⭐⭐ 【理想鄉反彈成功 → **EX 的追打**】的行為守衛（GH#974）。
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⭐ 這一條補的是 `avalonReflectFeedback.test.ts` **刻意不驗**的那一半
 * ════════════════════════════════════════════════════════════════════════
 * 那一條的標題逐字是「**只點 R（⛔ 沒有 EX）**」—— 它守的是「EX 沒解鎖的那一整場，
 * 反彈成功也要看得見」。⭐ 而**解鎖之後**那一段追打，⛔ 從來沒有守衛。
 *
 * owner 2026-09-04（逐字，這一條的設計來源）：
 * > 「理想鄉 是**主動施放** 一段時間內會反彈之後觸發一連串動畫傷害機制」
 * > 「⭐ 逐一生 dummy 放連鎖閃電 這是**第一段**傷害，有 EX 就會**補上** 17 段 script 演出
 * >   其實不衝突」
 *
 * ⇒ ⭐ 兩段，⛔ 不是二選一：
 *   ① **R**（20-04 永恆的理想鄉）反彈成功 ⇒ 反傷 ＋ 畫面回饋（那一條守衛在守）
 *   ② **EX**（20-002 解放.約束勝利劍MAX）解鎖 ⇒ **再補上**七次斬擊 ＋ 約束勝利之劍
 *
 * ── 📏 為什麼非驗不可（2026-09-04 量到）─────────────────────────────────
 * 20-002 的演出是 `content/vfx-scripts/godie-e002.ex.json` 的 **17 段，全部 `on:"strike"`**。
 * ⭐ 而 `strike` 這個觸發器要的是 sim 的 **`comboStrike`** 事件
 *   （`VfxScriptPlayer` 的 `case "comboStrike"`）。
 * ⇒ ⭐⭐ **沒有 `comboStrike` ⇒ 那 17 段一段都不會跑，而且不會有任何一行 log。**
 *
 * ⚠️ 而它中間隔著三層，每一層都可能安靜地斷掉：
 *   EX 解鎖（`rank ≥ 1`，`abilityPassives.ts:134` 的 `rank <= 0` 直接 return null）
 *     → `syncAbilityPassives` 把 `passive.ranks[].hooks` 掛成 source
 *       → 反彈成功 → `reflectHookSystem` 派 `onReflectSuccess`
 *         → hook 裡的 `delayed`（count 7）→ `strikeCue: true` → `comboStrike`
 *
 * ── ⭐ 兩個方向（⛔ 單邊校準過的尺不算自證過）────────────────────────────
 * ① 已知**有**：EX 解鎖（rank 1）＋ 反彈真的成功 ⇒ ⭐ 要有 `comboStrike`
 * ② 已知**沒有**：EX **未解鎖**（rank 0，＝那一條既有守衛跑的那一場）
 *    ⇒ ⛔ 不可以有 `comboStrike`（否則這條斷言對「EX 有沒有解鎖」是瞎的）
 *
 * ⛔ 斬擊次數／傷害數字**一格都沒有進斷言**（第二守則：驗機制不驗數字）——
 * 那些是後台與技能編輯器每週在調的東西。
 *
 * MUTATION LOG（落地前實跑）：
 *   · 承重線 —— 出貨 `godie-e002.ex.json` 的 `onReflectSuccess` hook 裡那個
 *     `delayed` 效果拿掉（＝反彈照樣成功、反傷一格不差，只是**追打不見了**）
 *     → 方向① 紅：「EX 解鎖了而反彈成功之後沒有任何一段追打」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { combatResolveSystem } from "../combat/damage";
import { reflectHookSystem } from "../systems/ReflectHookSystem";
import { syncAbilityPassives } from "../abilities/abilityPassives";
import { runEffects } from "./effectRunner";
import { Abilities } from "../content/registry";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

const HERE = dirname(fileURLToPath(import.meta.url));
const docPath = (id: string): string => join(HERE, `../../../../../content/abilities/${id}.json`);
const readDoc = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(docPath(id), "utf8")) as Record<string, unknown>;

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

/**
 * 跑一次「施放理想鄉 → 吃一發魔法傷害 → 反彈成功」，回傳事件流。
 * @param exRank EX 的等級。⭐ 0 ＝ 沒解鎖（方向②）、1 ＝ 解鎖（方向①）。
 */
function reflectOnce(exRank: number): { comboStrikes: number; reflected: number } {
  const world = new SimWorld(SKELETON_ARENA, 54900);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = {
    ...world.combatFeel,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false },
  };

  // ⭐ 出貨的兩份文件都註冊進去（⛔ 不是夾具手寫的 —— 失敗形態⑤）。
  const exDoc = readDoc("godie-e002.ex");
  Abilities.register("godie-e002.ex" as AbilityId, exDoc as never);

  const avalon = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const attacker = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 12, z: C.z },
    zone: 0,
  });
  world.step(new Map());

  // ⭐ 把 EX 掛上去並設等級 —— `abilityPassives.ts:134` 對 `rank <= 0` 直接 return null，
  //   ⇒ **解鎖與否就是這一格**，而那正是兩個方向的分界。
  const ab = world.abilities.get(avalon);
  if (ab) {
    (ab as { exSlot: { abilityId: AbilityId; rank: number; cooldownRemainingTicks: number } | null }).exSlot = {
      abilityId: "godie-e002.ex" as AbilityId,
      rank: exRank,
      cooldownRemainingTicks: 0,
    };
    syncAbilityPassives(world, avalon);
  }

  // ① 施放 20-04 永恆的理想鄉（出貨 JSON 的 effects）。
  const ctx: EffectContext = {
    world,
    caster: avalon,
    rank: 1,
    targets: [avalon],
    origin: "ability:godie-e002.r",
    rng: world.rng,
  };
  runEffects((readDoc("godie-e002.r")["effects"] as EffectDef[]), ctx);

  // ② 敵人打一發**魔法**傷害（hook 的 damageType 過濾）。
  const hpBefore = world.health.get(attacker)!.hp;
  world.damageQueue.push({
    source: attacker,
    target: avalon,
    amount: 200,
    type: "magic",
    crit: false,
    origin: "ability:enemy",
  });
  combatResolveSystem(world);
  const reflected = hpBefore - world.health.get(attacker)!.hp;

  // ③ 派 `onReflectSuccess`（出貨在 `world.step()` 的 8b），再跑一 tick 讓
  //    hook 排出來的 `delayed` 班表真的落地。
  reflectHookSystem(world);
  let comboStrikes = world.events.filter((e) => e.type === "comboStrike").length;
  for (let i = 0; i < 40 && comboStrikes === 0; i += 1) {
    world.step(new Map());
    comboStrikes += world.events.filter((e) => e.type === "comboStrike").length;
  }
  return { comboStrikes, reflected };
}

describe("理想鄉反彈成功 → EX 的追打（GH#974）", () => {
  it("★★ ⭐ 方向①【EX 解鎖】反彈成功 ⇒ 追打真的排出來（20-002 的 17 段靠它）", () => {
    const { comboStrikes, reflected } = reflectOnce(1);

    // ⭐ 對照組：反彈**真的成功了**。⛔ 少了它，下面那條可能是在驗
    //    「一個從來沒有觸發過的 hook 安靜地什麼都沒做」。
    expect(reflected, "⛔ 反彈根本沒打到攻擊者 —— 下面驗的追打是空的").toBeGreaterThan(0);

    expect(
      comboStrikes,
      "⛔⛔ EX 解鎖了、反彈也成功了，⛔ 而**一段追打都沒有排出來**。\n" +
        "  ⭐ 20-002 的演出是 `vfx-scripts/godie-e002.ex.json` 的 **17 段，全部 `on:\"strike\"`**，\n" +
        "    而 `strike` 要的就是這裡的 `comboStrike` 事件。\n" +
        "  ⇒ 沒有它 ⇒ **17 段一段都不會跑，而且不會有任何一行 log**（owner：「特效超多都消失了」）。",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐ 方向②【EX 未解鎖】⇒ ⛔ 不可以有追打（⚠️ 否則上一條對解鎖與否是瞎的）", () => {
    const { comboStrikes, reflected } = reflectOnce(0);

    expect(reflected, "⛔ 沒解鎖 EX 時反彈本身也該照常成功（那是 R 做的事）").toBeGreaterThan(0);
    expect(
      comboStrikes,
      "⛔⛔ EX **沒有解鎖**而追打照樣排出來了 ⇒ ⭐ 上一條斷言對「EX 在不在」是瞎的，\n" +
        "  它會對每一場都通過（⛔ 一把只驗過單邊的尺）。",
    ).toBe(0);
  });
});

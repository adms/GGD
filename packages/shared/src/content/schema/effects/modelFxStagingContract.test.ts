/**
 * ⭐【多實例演出】`spawnModelFx` 的**落點環**契約（#553 群組⑧ 後續）。
 *
 * owner 2026-08-22 逐字：「飛影 **38-002 究極暴走黑龍波**＋**38-03 邪王炎殺黑龍波**
 * **三條黑龍＋衝擊波＋動地剁** 等效果也是經典 JASS 特效技能，務必**花時間好好掃描
 * 學習轉化為技能模板、特效模板**」；同一天：「也別忘了**動地剁**，跟相關的**音效要播出來**」。
 *
 * ── ⭐ `orbit` 與 `radial` 是**兩種畫面**，⛔ 不是同一種的兩個寫法 ─────────────
 * 原作 A09I 的動地剁在 `tools/jass-dragon/out/A09I.staging.json` 逐字是
 * `polarProjections: { angle: "( I2R(udg_BlackDargon) * 30.00 )", dist: 350.0 }`
 * ＋ `loopBounds: { var: "BlackDargon", max: 12 }` ⇒ **半徑 350 的環上 12 個「位置」**，
 * 每個位置站一隻 `timedLifeSec` 的傀儡對自己腳下丟一發。
 *
 * 而引擎的兩條路徑（`sim/effects/spawnModelFx.ts::modelFxInstances`）是：
 *   · `orbit`  → `ringPoints(origin, distance, count)`，**每一具各自一個座標**、travel 0
 *   · `radial` → 每一具**共用施法者這一個座標**，只有方向不同，往外飛 `distance`
 * ⇒ 「地面被剁開一圈」是前者；後者是「腳下噴出十二根然後散掉」。⛔ 兩者在
 * JSON 上只差一個字，而**沒有任何既有守衛問過這一格**（第一·五守則的形狀：
 * schema 收得下、`content:build` 全綠、畫面上演的是另一件事）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— 把 `content/abilities/godie-u010.ex.json` 動地剁那一節點的
 *    `"path": "orbit"` 改回 `"radial"`（並拿掉 `lifeSec`，因為 refine 會擋）
 *      → 紅：「38-002 的動地剁不是一圈落點：12 具站在 1 個座標上
 *        （path=radial）—— 那是腳下噴發，⛔ 不是地面被剁開一圈」
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../loader";
import { shippedContentSource } from "../../__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../../../sim/content/registry";
import { SimWorld } from "../../../sim/SimWorld";
import { SKELETON_ARENA } from "../../../sim/world/ArenaDef";
import { spawnChampion } from "../../../sim/spawnChampion";
import { runEffects } from "../../../sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "../../../sim/effects/effect";
import type { ModelFxSpawnEvent } from "../../../sim/effects/spawnModelFx";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 施放**出貨的**那一支，回傳 sim 真的送上線的每一則 `modelFxSpawn`。 */
function stagings(championId: string, abilityId: string): ModelFxSpawnEvent[] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(abilityId as AbilityId);
  expect(def, `${abilityId} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [], origin: `ability:${abilityId}`, rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ 施放事件要在下一次 step() **之前**讀（step 第一行清空 events）。
  return world.events
    .filter((e) => e.type === "modelFxSpawn")
    .map((e) => e.data as unknown as ModelFxSpawnEvent);
}

const spots = (ev: ModelFxSpawnEvent): Set<string> =>
  new Set(ev.instances.map((i) => `${i.x},${i.z}`));

describe("① 落點環真的站成一圈（orbit ≠ radial）", () => {
  it("★ 動地剁的每一具各占一個座標，而三條黑龍是從同一個座標往外發散", () => {
    const evs = stagings("godie-u010", "godie-u010.ex");
    expect(evs.length, "38-002 一具模型都沒出場").toBeGreaterThan(0);
    // ⭐ 用「實例最多的那一組」認落點環，⛔ 不用 path 認 —— 拿被測的那一格當
    //    篩選條件的話，它被改壞時這條斷言只會**找不到東西**，⛔ 而不是指出病灶。
    const ring = evs.reduce((a, b) => (b.instances.length > a.instances.length ? b : a));
    expect(ring.instances.length, "38-002 沒有多實例演出 —— 動地剁不在這一支裡").toBeGreaterThan(1);
    expect(
      spots(ring).size,
      `38-002 的動地剁不是一圈落點：${ring.instances.length} 具站在 ${spots(ring).size} 個座標上` +
        `（path=${ring.path}）—— 那是腳下噴發，⛔ 不是地面被剁開一圈`,
    ).toBe(ring.instances.length);

    // ⭐ 反面：發散那一族**必須**共用一個原點，否則上面那條對兩種實作都會過。
    const burst = evs.filter((e) => e !== ring && e.path === "radial");
    expect(burst.length, "三條黑龍與衝擊波尾流不見了").toBeGreaterThan(0);
    for (const e of burst) expect(spots(e).size, `${e.modelKey} 的發散實例不該各占一個座標`).toBe(1);
  });
});

/**
 * ⛔ 42-04 世界終結（`godie-n003.r` / `godie-n01g.r`，圓周噴發 12 具大冰塊）今天
 * 完全無聲，而**理由不是「還沒排到」**：它們是 `R` 槽 ⇒ 同時鏡射進
 * `content/champions/*.json`，而 champions 不在這條 lane 的檔案柵欄裡。
 * ⭐ 反駁法：補上聲音的那一天，下面第二條斷言會紅並要求把這兩列刪掉 ——
 * ⛔ 一個沒有到期日的豁免就是一張永久許可證。
 */
const FENCED_OUT = new Set(["godie-n003.r", "godie-n01g.r"]);

describe("② 每一支帶多實例演出的技能都出得了聲", () => {
  it("owner：「跟相關的音效要播出來」（豁免要寫得出理由，補齊了就要刪）", () => {
    const silent: string[] = [];
    const stale: string[] = [];
    for (const def of Abilities.all() as unknown as Record<string, unknown>[]) {
      let multi = false;
      let audible = typeof def["sfxKey"] === "string";
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return void n.forEach(walk);
        if (n === null || typeof n !== "object") return;
        const r = n as Record<string, unknown>;
        if (r["kind"] === "spawnModelFx") {
          if (typeof r["count"] === "number" && r["count"] >= 2) multi = true;
          if (typeof r["soundKey"] === "string" || typeof r["arriveSoundKey"] === "string") audible = true;
        }
        Object.values(r).forEach(walk);
      };
      walk(def["effects"]);
      walk(def["passive"]);
      if (!multi) continue;
      const id = String(def["id"]);
      if (FENCED_OUT.has(id)) {
        if (audible) stale.push(id);
      } else if (!audible) silent.push(id);
    }
    expect(silent, "多實例演出整支無聲 —— 十幾具模型同時出場而喇叭一點反應都沒有").toEqual([]);
    expect(stale, "這幾支已經有聲音了 —— 把 FENCED_OUT 裡的那一列刪掉").toEqual([]);
  });
});

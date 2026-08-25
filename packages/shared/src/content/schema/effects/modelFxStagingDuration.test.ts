/**
 * ⭐【多實例演出】`spawnModelFx` 的**停留時間**契約（#553 群組⑧ 第二輪）。
 *
 * ── 為什麼「畫在哪裡」修好了還不夠 ────────────────────────────────────────
 * `modelFxStagingContract.test.ts` 問的是**畫在哪裡**（`orbit` 的十二具各占一個
 * 座標，⛔ 不是十二具疊在腳下）。這一支問的是同一族的另一半：**畫多久。**
 *
 * 38-002 究極暴走黑龍波的三條黑龍與衝擊波在這一輪之前是 `distance 8 / speed 30`
 * ＝ **0.267 秒**。原作 A09I 是 **1.04 秒**，而且有兩個獨立來源都指向它：
 *   · `timeline.countGates.below = 14` × `timeline.periodicSec = 0.08` ＝ 1.04
 *   · `tpl-dragon-serpent` 的 `travel 1690 wc3u ÷ speed 1625 wc3u/s`  ＝ 1.04
 *   （`tools/jass-dragon/out/A09I.staging.json`，逐字）
 *
 * ⭐ 而 `speed: 30` **不是筆誤** —— `1625 wc3u/s × GGD_PER_WC3(11/600) = 29.8`
 * 是逐字忠實的換算（同一個係數驗過動地剁的環半徑：`350 × 11/600 = 6.417`
 * ＝ 出貨的 `6.42`）。壞掉的是把**速度**忠實搬過來、卻把**距離**縮成小競技場的
 * 尺寸（1690 wc3u ＝ 30.98 格 → 出貨 8 格）：⇒ **整段演出被加速了近 4 倍。**
 *
 * ⚠️ 這是一個**會重複發生**的形狀，⛔ 不是這一支的筆誤：記憶裡的地圖鐵則逐字是
 * 「24×18 的小競技場，只是**看起來**像無限城」。每一次把 w3x 的距離壓進這個場地，
 * **時間就被一起壓掉了**，而畫面上跟「這支技能沒有特效」分不出來（失敗形態②）。
 *
 * ── 為什麼門檻不是我挑的字面值 ────────────────────────────────────────────
 * 它從 `content/ability-templates/tpl-radial-burst.json` 的 `distance / speed`
 * 推導 ＝ 42-04 世界終結那十二顆大冰塊的停留時間，一份**出貨且已經被接受**的
 * 多實例演出。⛔ 模板調了門檻自己會跟著動（第〇·四守則：值在載入時從共用表解析）。
 *
 * ── ⛔ 為什麼它是一個獨立的檔案 ───────────────────────────────────────────
 * 寫的當下 `modelFxStagingContract.test.ts` 的工作區同時有**另外兩條 lane** 的
 * 未提交改動（describe ④、以及一支新的無聲技能）。同一個檔案的 hunk 分不開 ⇒
 * 把它塞進去等於把別人沒做完的東西送上我的 commit（CLAUDE.md 併行 lane 那一節）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `content/abilities/godie-u010.ex.json` 三條黑龍的
 *    `"speed": 7.7` 改回 `30.0`
 *      → 紅：「多實例演出一閃就沒了 —— 十幾具模型在四分之一秒內出現又消失⋯
 *        godie-u010.ex: 最短的一具只停 0.267 秒（門檻 0.750 秒）」
 *    還原用 `Edit` 改回那一行，⛔ 不是 `git checkout`。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-u010.ex.json`
 *   · `content/abilities/godie-u010.ex.json` 是 **tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh tiers:apply`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     apply_tiers.py 只重算**五級距那幾格**(damageTier/flat · cooldownTier · manaCostTier ·
 *     radiusTier · rangeTier),並把 MIRRORED 欄位**單向**鏡射進 content/champions/ 的內嵌副本;
 *     其餘欄位是**原封寫回** ⇒ 那些手改會留下來 —— ⛔ 但那是繞過隔離區的手改,仍然要走 genrun。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { ContentLoader } from "../../loader";
import { shippedContentSource } from "../../__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../../../sim/content/registry";
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
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(abilityId as AbilityId);
  if (def === undefined) return [];
  runEffects((def.effects ?? []) as EffectDef[], {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: `ability:${abilityId}`,
    rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ 施放事件要在下一次 step() **之前**讀（step 第一行清空 events）。
  return world.events
    .filter((e) => e.type === "modelFxSpawn")
    .map((e) => e.data as unknown as ModelFxSpawnEvent);
}

/** 出貨的哪一位英雄擁有這支技能（施法者只影響起點與面向，⛔ 不影響幾何）。 */
function ownerOf(abilityId: string): string | undefined {
  for (const c of Champions.all() as unknown as Record<string, unknown>[]) {
    if (c["exAbility"] === abilityId) return String(c["id"]);
    const slots = (c["abilities"] ?? {}) as Record<string, { id?: string }>;
    for (const s of Object.values(slots)) if (s?.id === abilityId) return String(c["id"]);
  }
  return undefined;
}

/** ⭐ 門檻＝出貨且已被接受的多實例演出模板自己的停留時間，⛔ 不是一個字面值。 */
function floorSec(): number {
  const tpl = JSON.parse(
    readFileSync(join(CONTENT, "ability-templates/tpl-radial-burst.json"), "utf8"),
  ) as { params: Record<string, { default: number }> };
  return tpl.params["distance"]!.default / tpl.params["speed"]!.default;
}

/**
 * ⛔ 這張表現在是空的，而它**寫下來的當天就被自己的到期日清空了**：
 * 寫的時候 38-03（`godie-u010.e` / `godie-uvng.e`）的動地剁還是 `radial` 6.42／30
 * ＝ 0.214 秒，理由是「`E` 槽會鏡射進 `content/champions/*.json`，不在柵欄裡」；
 * 同一天另一條 lane 連 champion 鏡射一起把它改成 `orbit` ＋ `lifeSec: 3.0`。
 * ⭐ 帶到期日的豁免會自己回收；⛔ 新的技能不得加進來當許可證。
 */
const FENCED_OUT = new Set<string>([]);

describe("多實例演出要在畫面上停得夠久，玩家才看得見", () => {
  it("★ 一次施放裡沒有任何一組多實例在 tpl-radial-burst 的停留時間之前就消失", () => {
    const min = floorSec();
    const tooFast: string[] = [];
    const stale: string[] = [];
    for (const def of Abilities.all() as unknown as Record<string, unknown>[]) {
      const id = String(def["id"]);
      const champ = ownerOf(id);
      if (champ === undefined) continue; // 沒有人拿得到的技能：不是玩家看得到的東西
      // ⭐ 「是不是多實例」與「停多久」都問 sim **真的送上線**的那一份
      //    （`instances`），⛔ 不是文件上的 `count`、也⛔ 不是 distance/speed 再算
      //    一次：引用特效模板的節點在磁碟上根本沒有 `count`（載入時才補），拿原文
      //    當篩選條件會讓整族逃掉（失敗形態⑤：被測的不是出貨的那個）。
      const worst = stagings(champ, id)
        .filter((e) => e.instances.length >= 2)
        .flatMap((e) => e.instances.map((i) => i.durationSec))
        .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
      if (!Number.isFinite(worst)) continue;
      if (FENCED_OUT.has(id)) {
        if (worst >= min) stale.push(id);
      } else if (worst < min) {
        tooFast.push(`${id}: 最短的一具只停 ${worst.toFixed(3)} 秒（門檻 ${min.toFixed(3)} 秒）`);
      }
    }
    expect(
      tooFast,
      "多實例演出一閃就沒了 —— 十幾具模型在四分之一秒內出現又消失，" +
        "在畫面上跟「這支技能沒有特效」分不出來（第二守則失敗形態②）",
    ).toEqual([]);
    expect(stale, "這幾支已經停得夠久了 —— 把 FENCED_OUT 裡的那一列刪掉").toEqual([]);
  });
});

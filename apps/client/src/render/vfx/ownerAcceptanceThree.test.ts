/**
 * OWNER 的三支驗收技能 —— 「我說過我要驗收三技能來判斷技能特效動畫是否移植完成」。
 *
 * ⚠️ 這支守衛的存在理由**不是**「再測一次晉升表」（`w3xAbilityArt.test.ts` 已經在做），
 * 而是 GH#450 當場踩到的那個洞：⭐ **驗收被拿去對著下架的分身量。**
 *
 * 04-03 龍破斬 / 42-04 世界終結 各有**兩份**同編號抄本（`godie-h020.e` 與
 * `godie-hjai.e`；`godie-n01g.r` 與 `godie-n003.r`），而 `data/curation/whitelist.json`
 * 裡只有其中一份。`abilityCodeParity.COSMETIC_FIELDS` 把 `vfxKey` 列為「可以不一樣」
 * （owner：改名不是缺陷），所以兩份抄本的特效**本來就會分歧且不會有任何訊號** ——
 * 於是「量下架那一份 → 看到 `fx.prim.*` → 回報『還沒接原作特效』」是一條完全沒有
 * 守衛的錯誤路徑，而它真的發生了。
 *
 * 所以第一條斷言先釘住**身分**（這一份是白名單上那一份、而且它的編號沒被換過），
 * 第二條才問畫面：這一支真的解析得到原作推導出來的特效文件嗎。
 *
 * ⛔ 這裡**不**斷言 `vfxKey` 本身不是 `fx.prim.*`。那是 GH#450 開票時的假設，而它是錯的：
 * 家族列（`fx.fam.*`）的技能，其 `vfxKey` **刻意**留著 `fx.prim.*` 當第 3 級退路
 * （`VfxSystem.playCastVfx` 的四級階梯 + `primitiveFallbackFor`），因為家族文件是
 * 產生內容，`content:build` 沒跑就解不出來。⭐ 真正該問的是**這一次施法會播什麼**，
 * 也就是 `w3xArtFor()` 解出來的那一份。
 *
 * ── ⭐ 2026-08-23：名單改成**與另一份驗收產物逐字同一份**，而且全部是本體 ──────
 *
 * owner 2026-08-23 逐字（三支動畫特效，也是這一批的題目）：
 * > 「Saber約束勝利之劍(翻滾光束), 依文世界終結(圓周噴發大冰塊), 莉娜龍破斬
 * >  (一直線火球衝擊波後目的地火焰大爆炸) 都是動畫特效」
 *
 * ⛔ 在此之前**兩份驗收產物指著不同的文件**，而「驗收過了」這句話因此沒有意義：
 *   · 這一份： `godie-hjai.e` / `godie-n003.r` / `godie-hart.r`
 *   · `tools/skill-audit/audit.py` 的 `CALIBRATION`：`godie-h020.e` / `godie-h020.r` /
 *     `godie-n01g.r` / `godie-hart.r` —— ⚠️ **前三個沒有一個在白名單上**
 *     （`godie-h020` 逐字寫在 `roster.json` 的 `retiredChampions` 裡）。
 * ⇒ 兩邊現在都是 `godie-e002.e` / `godie-n003.r` / `godie-hjai.e`。
 *
 * ⚠️ 拿掉的那一支知識不會消失：01-04 超究武神霸斬 的本體是 `godie-hart.r`，
 * 它**本來就是本體**（只是不在 owner 這一次點名的三支裡），而它的特效文件仍然被
 * `w3xAbilityArt.test.ts` **逐列**驗（那一支跑遍每一列晉升，⛔ 不是只驗這三支）。
 *
 * ── ⭐ 第三條斷言：**畫面上真的有東西** ────────────────────────────────────
 * 前兩條問的都是「文件對不對」，而 2026-08-23 量到的缺陷前兩條**全部是綠的**：
 * 本體 `godie-n003.r` 的 `spawnModelFx` 與 `floatingText` 都是 **0**，圓周噴發的
 * 大冰塊只長在變身態 `godie-n01g.r` 上 ⇒ ⭐ **玩家選依文潔琳按下 R 什麼都看不到，
 * 要變身之後才有。** 身分對、特效文件對、schema 對、`content:build` 全綠（第一·五
 * 守則的形狀）。⇒ 第三條跑**出貨的**技能（`ContentLoader` + `registerAll` + 真的
 * `SimWorld` + 真的事件，⛔ 不是手寫夾具＝失敗形態⑤），只問兩件事：
 * **有模型出場嗎、有浮動文字嗎**。
 *
 * ⛔ 一個座標、一個秒數、一個出貨數值都不抄（第二守則：驗機制不驗數字）——
 * 「幾具冰塊」只斷言 **> 1**，⛔ 不是 12：等分有沒有發生是機制，十二是內容值。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— `content/modelFxPreset.ts` 的 `PRESET_FIELDS` 拿掉 `"count"`
 *    （＝引用模板的節點補不到等分數，`spawnModelFx` 退化成**一具**，而畫面上
 *    「一顆大冰塊」與「十二顆」都看得到東西 ⇒ 前兩條與 `modelFxSpawn` 那條全綠）
 *      → 紅：「42-04 世界終結 只生出一具模型 —— 圓周噴發退化成一具:
 *        expected 1 to be greater than 1」
 */
import { describe, it, expect, beforeAll } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zVfxDoc } from "@ggd/shared/content";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "@ggd/shared/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { w3xArtFor } from "./w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

/**
 * owner 逐字點名的三支。`code` 是 w3x 編號（JASS 對照的 join key，⛔ 不可浮動）。
 * ⭐ 三支**全部是本體**，⛔ 沒有一支是變身態或下架抄本 —— 見檔頭。
 */
const ACCEPTANCE = [
  { id: "godie-e002.e", code: "20-03", label: "Saber 約束與勝利之劍" },
  { id: "godie-n003.r", code: "42-04", label: "依文潔琳 世界終結" },
  { id: "godie-hjai.e", code: "04-03", label: "莉娜因巴斯 龍破斬" },
] as const;

/**
 * ⛔⛔ GH#979 —— `data/curation/whitelist.json` 是 **git-ignored 的營運狀態**
 * （`packages/shared/testkit/balancePopulation.ts` 的檔頭逐字說明過為什麼）。
 *
 * ⚠️ ⭐ 在此之前這一行在**模組頂層**跑 ⇒ 全新 clone（CI／任何新機器）上
 * **整個 suite 在收集階段就 ENOENT**，`Test Files 1 failed` 而**一條測試都沒跑**。
 * ⇒ 那不是「這一支壞了」，是「這一支在那台機器上**不存在**」——
 *   而兩者在 `pnpm -r` 的輸出裡長得一模一樣。
 *
 * ⭐ 處置照同 repo 的先例（`tools/model-budget/report.test.ts` 的 `HAS_OVERLAY`）：
 * **量不到就大聲說「沒驗到」再 skip**，⛔ 不是靜默跳過、⛔ 也不是假裝通過。
 */
const WHITELIST_PATH = root("data/curation/whitelist.json");
const HAS_WHITELIST = existsSync(WHITELIST_PATH);
if (!HAS_WHITELIST) {
  console.warn(
    `⚠️ **沒驗到** —— ${WHITELIST_PATH} 不存在（全新 clone / CI）。\n` +
      "   這一支的三條驗收都以**上架名單**為前提 ⇒ 在這台機器上「通過」與「沒跑」量起來一樣。\n" +
      "   ⇒ 刻意 skip，⛔ 而不是靜默跳過。根治見 GH#995（產生的判準不要烘進營運狀態）。",
  );
}
const itWithWhitelist = HAS_WHITELIST ? it : it.skip;
const whitelist = new Set<string>(
  HAS_WHITELIST
    ? (JSON.parse(readFileSync(WHITELIST_PATH, "utf8")) as { champions: string[] }).champions
    : [],
);

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 施放**出貨的**那一支，回傳這一次施放送上線的每一則事件（含延遲那幾則）。 */
function castShipped(id: string): { type: string; data: Record<string, unknown> }[] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: id.split(".")[0] as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const body = spawnChampion(world, {
    championId: id.split(".")[0] as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 3, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(id as AbilityId);
  expect(def, `${id} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world,
    caster,
    rank: 1,
    targets: [body],
    origin: `ability:${id}`,
    rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ `step()` 第一行清空 `events`，所以每一 tick 都要當場收走。延遲那幾句台詞
  //    （42-04 的四句排在 0.35 / 0.7 / 1.05 秒）要跑完才收得到。
  const out = [...world.events];
  for (let t = 0; t < 60; t++) {
    world.step(new Map());
    out.push(...world.events);
  }
  return out;
}

describe("owner 驗收的三支技能特效", () => {
  itWithWhitelist("量的是白名單上那一份抄本，而且編號沒被換掉", () => {
    for (const { id, code, label } of ACCEPTANCE) {
      const p = root(`content/abilities/${id}.json`);
      expect(existsSync(p), `${label}: ${id} 不在出貨的 content/abilities`).toBe(true);
      const doc = JSON.parse(readFileSync(p, "utf8")) as { name?: string };
      expect(doc.name ?? "", `${label}: ${id} 的編號漂了 —— 驗收在量別支技能`).toMatch(
        new RegExp(`^${code}\\s`),
      );
      const champion = id.split(".")[0] ?? id;
      expect(
        whitelist.has(champion),
        `${label}: ${champion} 不在 whitelist.json —— 這是下架分身，改它玩家一個位元都看不到`,
      ).toBe(true);
    }
  });

  itWithWhitelist("每一支施法時真的播原作推導出來的特效，⛔ 不是通用原型", () => {
    for (const { id, label } of ACCEPTANCE) {
      const art = w3xArtFor(id);
      expect(art, `${label}: ${id} 沒有任何 w3x 藝術列 —— 這一招只剩通用原型`).toBeDefined();
      for (const docId of [art!.primary, ...art!.extra]) {
        expect(
          docId.startsWith("fx.prim."),
          `${label}: 解到 ${docId} —— 通用原型不是原作特效`,
        ).toBe(false);
        // ⚠️ `fx.w3x.stock.*` 是 GH#439 刻意的**候選** id（`stockEmitterIds` 是一條規則，
        // ⛔ 不是一張已抽取清單）：`extract_stock_vfx.py --min-refs` 沒收到的模型
        // 在播放時被 `this.doc()` 跳過，逐位元不影響行為。所以這一格只驗**真的
        // 承諾過會有**的那些 id，⛔ 不把一條刻意的候選規則誤判成缺陷。
        if (docId.startsWith("fx.w3x.stock.")) continue;
        const p = root(`content/vfx/${docId}.json`);
        expect(existsSync(p), `${label}: ${docId} 這份 vfx 文件不存在`).toBe(true);
        expect(zVfxDoc.parse(JSON.parse(readFileSync(p, "utf8"))).id).toBe(docId);
      }
    }
  });

  itWithWhitelist("★ 每一支放出來，畫面上真的有模型出場、也真的有特效文字", () => {
    for (const { id, label } of ACCEPTANCE) {
      const events = castShipped(id);
      const models = events.filter((e) => e.type === "modelFxSpawn");
      expect(
        models.length,
        `${label}: 一具模型都沒出場 —— 這一招在本體身上是看不見的（${id}）`,
      ).toBeGreaterThan(0);
      expect(
        events.filter((e) => e.type === "floatingText").length,
        `${label}: 一個特效文字都沒有 —— owner 逐字要的「別忘了還有特效文字」（${id}）`,
      ).toBeGreaterThan(0);
      // ⭐ 圓周噴發是「一圈」，⛔ 不是一具。等分數本身是內容值，所以只問 **> 1**。
      if (id !== "godie-n003.r") continue;
      const inst = (models[0]!.data as unknown as ModelFxSpawnEvent).instances;
      expect(inst.length, `${label}: 只生出一具模型 —— 圓周噴發退化成一具`).toBeGreaterThan(1);
    }
  });
});

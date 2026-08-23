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
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../loader";
import { shippedContentSource, shippedDocFiles } from "../../__fixtures__/shippedContent";
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
 * ⭐ **豁免清單現在是空的，而它是被自己的到期日清空的。**
 *
 * 上一輪（#553）這裡有 `godie-n003.r` / `godie-n01g.r`（42-04 世界終結，圓周噴發
 * 12 具大冰塊），理由是「它們是 `R` 槽 ⇒ 鏡射進 champions ⇒ 不在那條 lane 的柵欄裡」，
 * 並且寫著「補上聲音的那一天下面第二條斷言會紅並要求把這兩列刪掉」。
 * **那一天就是今天**：另一條 lane 給了它們 `soundKey: "magicIce"` ＋
 * `arriveSoundKey: "wc3.gluescreenmeteorhit1"`，`stale` 斷言逐字點名了這兩列。
 * ⇒ ⭐ 一個**帶到期日**的豁免會自己回收，⛔ 一個沒有到期日的就是永久許可證。
 */
const FENCED_OUT = new Set<string>([]);

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

/** 一份文件裡每一個「引用了特效模板」的 `spawnModelFx` 節點。 */
function presetNodes(doc: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    const r = n as Record<string, unknown>;
    if (r["kind"] === "spawnModelFx" && typeof r["preset"] === "string") out.push(r);
    Object.values(r).forEach(walk);
  };
  walk(doc["effects"]);
  walk(doc["passive"]);
  return out;
}

/**
 * ⛔ `tpl-line-blast`（04-03 龍破斬）還沒有 `soundKey` 這一格，而**理由不是
 * 「還沒排到」**：這條 lane 的檔案柵欄只含 `tpl-beam-roll.json`。機制本身
 * （`content/modelFxPreset.ts` 的 SOUND_FIELDS）已經對**所有**模板生效 ⇒ 補齊的
 * 動作是在那份模板加兩格 param，⛔ 不是再寫一次程式。
 * ⭐ 反駁法：它長出聲音鍵的那一天，第二條斷言會紅並要求刪掉這一列。
 * （`tpl-radial-burst` ⛔ 不在這張表上：42-04 世界終結那兩份文件**自己的節點**
 *   已經帶了聲音鍵，所以它從第一條斷言的角度看已經是好的。）
 */
const SOUNDLESS_TEMPLATES = new Set(["tpl-line-blast"]);

/**
 * ⛔ `tpl-beam-roll` 的 `modelKey` 預設（模板 exemplar 是 20-03 約束與勝利之劍的
 * `imported.netherstrike`）把**四支不同英雄的招式**收斂成同一具模型 —— 陽電子砲、
 * 龜派氣功、龍鬥氣砲在畫面上與 Saber 逐像素相同。
 * ⚠️ 修法是逐支填自己的 `modelKey`，而那要同時改 `content/abilities/*.json` **與**
 * 它們鏡射進 `content/champions/*.json` 的副本（`abilityMirror.test.ts` 逐欄比對
 * `effects`），而 champions 不在這條 lane 的檔案柵欄裡。
 * ⭐ 反駁法：任一支填了自己的 `modelKey`，第二條斷言會紅並要求刪掉那一列；
 * ⛔ 新技能一律不得加進這張表 —— 它是一份會過期的紀錄，不是一張許可證。
 */
const SHARED_MODEL_FENCED_OUT = new Set([
  "20-03 約束與勝利之劍",
  "59-04 野戰型陽電子砲",
  "08-03 龍鬥氣砲咒文",
  "09-04 龜派氣功",
]);

describe("④ 引用特效模板的演出：出得了聲，而且保得住自己的身分", () => {
  it("★ 每一個引用模板的節點在**載入後**都帶著聲音鍵（家族級預設，⛔ 不是逐支填）", () => {
    const silent: string[] = [];
    const stale: string[] = [];
    for (const def of Abilities.all() as unknown as Record<string, unknown>[]) {
      for (const n of presetNodes(def)) {
        const tpl = String(n["preset"]);
        const audible =
          typeof n["soundKey"] === "string" || typeof n["arriveSoundKey"] === "string";
        if (SOUNDLESS_TEMPLATES.has(tpl)) {
          if (audible) stale.push(tpl);
        } else if (!audible) silent.push(`${String(def["id"])} → ${tpl}`);
      }
    }
    expect(
      silent,
      "引用特效模板的演出整族無聲 —— 模型飛出去而喇叭一點反應都沒有；" +
        "聲音要住模板的 params（一格解整族），⛔ 不是逐支寫進技能 JSON",
    ).toEqual([]);
    expect(stale, "這幾張模板已經有聲音格了 —— 把 SOUNDLESS_TEMPLATES 裡的那一列刪掉").toEqual([]);
  });

  it("★ 同一張模板不可以把兩支不同的技能收斂成同一具模型", () => {
    const byTemplate = new Map<string, Set<string>>();
    const stale: string[] = [];
    for (const { doc } of shippedDocFiles<Record<string, unknown>>("abilities")) {
      const name = String(doc["name"] ?? doc["id"]);
      for (const n of presetNodes(doc)) {
        // ⚠️ 讀的是**出貨原文**，⛔ 不是註冊後的：註冊時模板已經把 modelKey 補上，
        //    問「作者有沒有自己填」只有在解析之前問得到。
        if (typeof n["modelKey"] === "string") {
          if (SHARED_MODEL_FENCED_OUT.has(name)) stale.push(name);
          continue;
        }
        const tpl = String(n["preset"]);
        if (!byTemplate.has(tpl)) byTemplate.set(tpl, new Set());
        byTemplate.get(tpl)!.add(name);
      }
    }
    const collapsed: string[] = [];
    for (const [tpl, names] of [...byTemplate].sort((a, b) => a[0].localeCompare(b[0]))) {
      // 只有一支技能靠模板預設 = 那具模型就是它的身分，⛔ 不是收斂。
      if (names.size < 2) continue;
      const open = [...names].filter((n) => !SHARED_MODEL_FENCED_OUT.has(n)).sort();
      if (open.length > 0) collapsed.push(`${tpl}: ${open.join(" / ")}`);
    }
    expect(
      collapsed,
      "這幾支共用了模板的 modelKey 預設 —— 模板擁有的是**演出幾何**，" +
        "⛔ 不是招式的身分：不填就會長成 exemplar 那一支的樣子（第二守則失敗形態⑦）",
    ).toEqual([]);
    expect(stale, "這幾支已經有自己的模型了 —— 把 SHARED_MODEL_FENCED_OUT 裡的那一列刪掉").toEqual(
      [],
    );
  });
});

/**
 * ⭐⑤【原作那一具自己會出聲，而我們這一具不會】—— ⛔ 這裡的判準**不是我挑的**。
 *
 * owner 2026-08-23：「**開票快接，並且別忘了特效音效也要接上**」。
 * ⚠️ ② 只問「`count ≥ 2` 的多實例演出」，④ 只問「引用模板的節點」——
 * ⇒ **單具、字面 `modelKey`** 的那一族（D6 接上的 11 支正是這一族）**沒有人問過**。
 *
 * ⭐ 而「它該不該有聲音」有一個**推導得出來的**答案：`.mdx` 自己會把音效事件
 * （`SNDX****`）烘在動畫軌上。`tools/w3x-import/out/VFX_SOUND_JOIN.json` 的
 * `modelBoundSoundsets.byModel` 就是那一份普查（132 顆掃過、65 顆有事件）。
 * ⇒ ⭐ 原作那一具**真的會響**的模型，我們接上去卻無聲 = 還原掉了一半。
 * ⛔ 反過來，沒有事件的模型（`herocloudcyd` / `herocloudstrife` / `blackhole` /
 *    `oblivionaura` / `magical-sword`）這條**不叫** —— 給它們聲音是**設計**不是還原，
 *    ⛔ 不由這條守衛替 owner 決定。
 *
 * ⭐ 名單**從普查推導**，⛔ 不抄字面值：哪天多抽出一顆帶音效事件的模型，
 * 這條自己就會開始問它，⛔ 不必改測試。
 *
 * ── 突變紀錄（一批一條）─────────────────────────────────────────────
 *  · 拿掉 `content/abilities/godie-u01u.r.json` 那一格 `"soundKey"`（與
 *    `arriveSoundKey` 一起）→ 紅，訊息逐字指名
 *    `godie-u01u.r → imported.heromusashimiyamoto`。
 */
const SOUND_JOIN = join(CONTENT, "../tools/w3x-import/out/VFX_SOUND_JOIN.json");

/** `imported.<stem>` —— 原作 `.mdx` 自己帶著 `SNDX` 音效事件的那幾顆。 */
function modelsThatSoundInW3x(): Set<string> {
  const raw = JSON.parse(readFileSync(SOUND_JOIN, "utf8")) as {
    modelBoundSoundsets?: { byModel?: Record<string, unknown[]> };
  };
  return new Set(
    Object.entries(raw.modelBoundSoundsets?.byModel ?? {})
      .filter(([, ev]) => Array.isArray(ev) && ev.length > 0)
      .map(([stem]) => `imported.${stem}`),
  );
}

describe("⑤ 單具演出：原作模型自己會出聲的，接上去就不可以無聲", () => {
  it("★ owner：「別忘了特效音效也要接上」（名單從 w3x 普查推導，⛔ 不是一張手打的表）", () => {
    const audible = modelsThatSoundInW3x();
    expect(audible.size, "VFX_SOUND_JOIN 讀不到任何帶音效事件的模型 —— 母體是空的").toBeGreaterThan(0);

    const silent: string[] = [];
    let checked = 0;
    for (const def of Abilities.all() as unknown as Record<string, unknown>[]) {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return void n.forEach(walk);
        if (n === null || typeof n !== "object") return;
        const r = n as Record<string, unknown>;
        // ⚠️ 引用模板的節點歸 ④ 管（聲音住模板的 params，⛔ 不逐支填）。
        if (r["kind"] === "spawnModelFx" && r["preset"] === undefined) {
          const key = typeof r["modelKey"] === "string" ? r["modelKey"] : "";
          if (audible.has(key)) {
            checked += 1;
            if (typeof r["soundKey"] !== "string" && typeof r["arriveSoundKey"] !== "string") {
              silent.push(`${String(def["id"])} → ${key}`);
            }
          }
        }
        Object.values(r).forEach(walk);
      };
      walk(def["effects"]);
      walk(def["passive"]);
    }

    expect(checked, "沒有任何出貨節點引用到會出聲的原作模型 —— 這條斷言是真空綠的").toBeGreaterThan(0);
    expect(
      silent,
      "原作那一具 `.mdx` 自己烘著音效事件，而我們接上去的這一具無聲 —— " +
        "聲音鍵要從 `VFX_SOUND_JOIN.modelBoundSoundsets` 那一列的 wav 檔名推出來" +
        "（`wc3.<檔名小寫>`），⛔ 不要挑一個好聽的",
    ).toEqual([]);
  });
});

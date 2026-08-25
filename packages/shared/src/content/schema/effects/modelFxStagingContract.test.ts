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
import { readFileSync, readdirSync } from "node:fs";
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
/**
 * ⭐ 三張 `tpl-locust-*`（GH#693）也在這張表上，而**理由不是「還沒排到」**：
 * ⑤ 那條的普查（`VFX_SOUND_JOIN.modelBoundSoundsets`）逐字量到它們的採用者用的原作
 * `.mdx` **本來就沒有** `SNDX` 音效事件 —— `blackhole` 就在 ⑤ 檔頭點名的「沒有事件」
 * 名單裡，而 `w3x.stock.flamestrike1` 是 stock MPQ 抽出來的，那份普查連掃都沒掃到它
 * （它只產得出 `imported.<stem>` 的鍵）。⇒ 給它們聲音是**設計**不是還原，
 * ⛔ 不由這條守衛替 owner 決定（與 ⑤ 檔頭逐字同一句）。
 * ⭐ 反駁法：模板長出 `soundKey` 預設、或任何一支採用者自己填了聲音的那一天，
 * 上面那條 `stale` 斷言會紅並指名該把這一列刪掉。
 * ⚠️ `tpl-locust-orb` ⛔ **不在**這張表上，而那是量出來的：它的四支採用者
 * （77-01 / 14-01 / 79-03 / 11-04）**每一支自己的節點都帶著聲音鍵** ——
 * 所以從第一條斷言的角度看它已經是好的（與 `tpl-radial-burst` 逐字同一個處境）。
 */
const SOUNDLESS_TEMPLATES = new Set([
  "tpl-line-blast",
  "tpl-locust-line",
  "tpl-locust-travel",
  "tpl-locust-swarm",
]);

/**
 * ⛔ `tpl-beam-roll` 的 `modelKey` 預設（模板 exemplar 是 20-03 約束與勝利之劍的
 * `imported.netherstrike`）把**四支不同英雄的招式**收斂成同一具模型 —— 陽電子砲、
 * 龜派氣功、龍鬥氣砲在畫面上與 Saber 逐像素相同。
 *
 * ⭐ **2026-08-23 換掉了這張表的理由**（舊理由「champions 不在柵欄裡」已經不成立 ——
 * 這一輪就改得到）。新的、⭐ **會過期**的理由是 ⑥ 量到的東西：
 * `netherstrike.glb` 的 5 個 primitive **全部** alpha 0 ⇒ 這四支**一個像素都沒畫過**。
 * ⇒ ⛔ 現在把它們拆成四個 `modelKey`，只會得到**四份指向同一具零像素模型的複本**
 * （＝同一個事實的第二個住處，第〇·四守則），而畫面上逐位元不變 —— ⭐ 身分在
 * 「看得見」之前是**不可觀測**的。原作的五具 dummy（`ReviveHuman` / `Awaken` /
 * `ParasiteMissile`）三份 .glb **repo 裡都沒有**，所以拆開也接不到自己的模型。
 * ⭐ 反駁法：`ZERO_PIXEL_FX_MODELS` 少掉 `imported.netherstrike` 的那一天（重烘落地），
 * 這四支就該各自接上自己的模型並刪掉這裡的四列；⛔ 新技能一律不得加進來。
 *
 * ⭐ 2026-08-25（GH#688 Phase 5 pilot）：那一天到了 —— 09-04 接上了自己的原作模型
 * `w3x.stock.revivehuman`（h007 的 ReviveHuman.mdl，stock MPQ→glb 第一支），
 * `stale` 斷言點名後照規矩刪掉那一列。剩下三支照原作對應：20-03＝h00S/h00X
 * （ReviveHuman 紅/NetherStrike）、59-04＝h000、08-03＝h01P（Awaken）—— Phase 6。
 */
const SHARED_MODEL_FENCED_OUT = new Set([
  "20-03 約束與勝利之劍",
  "59-04 野戰型陽電子砲",
  "08-03 龍鬥氣砲咒文",
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

/**
 * ⭐⑥【它畫不畫得出任何像素】—— owner 2026-08-23 逐字：「**最基本的 初號機陽離子砲、
 * SABER約束勝利之劍、小呆龍鬥氣砲、悟空龜派氣功 這四個經典總是要看到橫放的光束砲吧**」、
 * 「作為翻轉角度的蝗蟲群單位 通常大小跟顏色都有再做調整，務必檢查，
 *  **避免出現很小顏色又不對的氣功砲**」。
 *
 * ⚠️ ⭐ 「務必檢查」的結果（**直接讀 .glb 位元組**，⛔ 不是推測）：
 * `imported.netherstrike` 的 **5 個 primitive 全部**帶 `baseColorFactor:[0,0,0,0]`
 * ＋ `alphaMode:"BLEND"`，而戰鬥場景 ⛔ **沒有 GlowLayer／bloom**
 * （`render/views/CoinView.ts` 與 `vfx/GoldPickupFx.ts` 的檔頭逐字寫著這件事）。
 * ⇒ ⭐⭐ **四支經典氣功砲從第一天起一個像素都沒有畫出來過** —— 它⛔ 不是「很小」，
 * 是**不存在**。同一個形狀在移動模型特效這一族命中 6 個 modelKey（下表）。
 *
 * ⭐ 它是**轉檔器刻意的軟刪除**，⛔ 不是資料壞掉：`tools/w3x-import/w3xlib/gltf.py`
 * 的 `fm >= 3 and not has_opaque_base` 分支逐字是「solid bright-on-black glow: no
 * alpha to key on → drop the quad rather than paint a black slab」。netherstrike 的
 * 四張貼圖在 `models_report.json` 裡全部列在 `missing_textures` ⇒ alpha 提示退回
 * "opaque" ⇒ 五張材質**全部**走進那個分支。
 *
 * ⛔ **既有的每一條守衛對它結構上是綠的**：①②④⑤ 問的是「有沒有多實例／有沒有聲音／
 * 身分有沒有分開」，`modelFxWireContract` 問的是「事件送不送得出去」——
 * **沒有一條問過「那具模型畫不畫得出東西」**（第二守則失敗形態①：算出來了但畫在看不見的地方）。
 *
 * ⚠️ 豁免表帶**到期日**，⛔ 不是許可證：重烘（或客戶端讓加法輝光走 ALPHA_ADD）之後
 * 那一列會變 stale 並要求刪掉。⛔ 新的 modelKey 一律不得加進來。
 *
 * ── 突變紀錄（一批一條，承重線）──────────────────────────────────────────
 *  · 把 `imported.netherstrike` 從 `ZERO_PIXEL_FX_MODELS` 拿掉
 *      → 紅：「這幾具移動模型特效畫不出任何像素…imported.netherstrike（0/5 primitive）」
 */
// 2026-08-24 重烘落地（GH#649）：gltf.py 把「無 alpha 的加法輝光」改成 luma-key、
// 零幾何的純 emitter 模型烘出佔位輝光面片 ⇒ 28 份零像素 .glb 剩 3 份
// （collision 一家 —— 來源 MDX 逐位元是空的：0 geoset、0 emitter、0 texture，
// 而且沒有任何 spawnModelFx 指到它）。五列豁免全部到期，照上面的規矩刪掉。
const ZERO_PIXEL_FX_MODELS = new Set<string>([]);

/** 這一份 .glb 有幾個 primitive 真的會被畫出來（材質 alpha > 0）。 */
function visiblePrimitives(glbPath: string): { visible: number; total: number } {
  const buf = readFileSync(glbPath);
  let off = 12; // glTF 檔頭
  let json: Record<string, never[]> | undefined;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    off += len;
  }
  const g = (json ?? {}) as unknown as {
    materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: unknown } }[];
    meshes?: { primitives?: { material?: number }[] }[];
  };
  const lit = new Set<number>();
  (g.materials ?? []).forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    // ⚠️ 貼圖自己帶 alpha ⇒ 畫得出來；⛔ 沒有 baseColorFactor 是 glTF 的預設不透明白。
    if (pbr.baseColorTexture !== undefined || pbr.baseColorFactor === undefined) lit.add(i);
    else if ((pbr.baseColorFactor[3] ?? 1) > 0) lit.add(i);
  });
  let visible = 0;
  let total = 0;
  for (const mesh of g.meshes ?? [])
    for (const p of mesh.primitives ?? []) {
      total += 1;
      if (p.material === undefined || lit.has(p.material)) visible += 1;
    }
  return { visible, total };
}

describe("⑥ 移動模型特效指到的模型，要真的畫得出像素", () => {
  it("★ owner：「這四個經典總是要看到橫放的光束砲吧」（豁免帶到期日，補好了就要刪）", () => {
    // ⭐ 讀**註冊後**的技能：`preset` 已經把 modelKey 補上，所以模板預設也在射程內。
    const keys = new Set<string>();
    for (const def of Abilities.all() as unknown as Record<string, unknown>[]) {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return void n.forEach(walk);
        if (n === null || typeof n !== "object") return;
        const r = n as Record<string, unknown>;
        if (r["kind"] === "spawnModelFx" && typeof r["modelKey"] === "string")
          keys.add(r["modelKey"]);
        Object.values(r).forEach(walk);
      };
      walk(def["effects"]);
      walk(def["passive"]);
    }
    expect(keys.size, "沒有任何 spawnModelFx 節點解析出 modelKey —— 這條斷言是真空綠的").toBeGreaterThan(0);

    const blank: string[] = [];
    const stale: string[] = [];
    for (const key of [...keys].sort()) {
      const doc = Models.tryGet(key);
      expect(doc, `${key} 不在模型註冊表裡 —— 移動模型特效指向一個不存在的 modelKey`).toBeDefined();
      const { visible, total } = visiblePrimitives(join(CONTENT, doc!.glbPath));
      if (visible === 0) {
        if (!ZERO_PIXEL_FX_MODELS.has(key)) blank.push(`${key}（0/${total} primitive）`);
      } else if (ZERO_PIXEL_FX_MODELS.has(key)) {
        stale.push(`${key}（${visible}/${total} primitive）`);
      }
    }
    expect(
      blank,
      "這幾具移動模型特效畫不出任何像素 —— 材質 alpha 全是 0 而場景沒有 GlowLayer／bloom：" +
        "技能放得出來、傷害照打、畫面上什麼都沒有。⛔ 調 scale 與 fxTint 都治不了它" +
        "（0 像素的東西沒有大小也沒有顏色）—— 修法是重烘 .glb 或讓加法輝光走 ALPHA_ADD",
    ).toEqual([]);
    expect(stale, "這幾具已經畫得出來了 —— 把 ZERO_PIXEL_FX_MODELS 裡的那一列刪掉").toEqual([]);
  });
});

/**
 * ⭐⑦【出貨的 imported .glb 一份都不可以是「零個可畫 primitive」】—— GH#649。
 *
 * ⚠️ ⑥ 只掃**被 `spawnModelFx` 指到**的 modelKey，所以它對兩件事結構上失明：
 *   · 一具零像素的 .glb 只要**還沒有**技能指過去，⑥ 是綠的 —— 而它會在某一支
 *     技能接上去的那一刻變成「技能放得出來、畫面什麼都沒有」，⛔ 那時候查的人
 *     會去查技能而不是查模型；
 *   · 別的消費端（`spawnModelFx` 以外的擺設／掛件／道具模型）它一律看不到。
 * ⇒ 這一條把柵欄拉到**整個出貨資料夾**：`content/assets/models/imported/*.glb`
 *   每一份都必須至少有 1 個畫得出來的 primitive。
 *
 * ⛔ 豁免要帶**能被反駁的理由**，⛔ 不是「還沒收」：唯一合法的理由是
 * 「**來源 MDX 裡沒有任何東西可以轉**」—— 那時候烤一個面片出來是**捏造幾何**，
 * ⛔ 不是轉檔。量到的（`tools/w3x-import/reconvert_zero_pixel.py` 的 UNFIXABLE）：
 * `collision.mdx` 是 1188 位元組的純骨架 —— 0 geoset · 0 頂點 · 0 PRE2 emitter ·
 * 0 貼圖，而且它在原作就是**看不見的碰撞體積輔助模型**，畫不出東西才是對的。
 *
 * ── 突變紀錄（一批一條，承重線）──────────────────────────────────────────
 *  · 把 `collision` 從 `EMPTY_SOURCE_GLBS` 拿掉
 *      → 紅：「這幾份出貨的 imported .glb 畫不出任何 primitive…collision（0/0）」
 */
const EMPTY_SOURCE_GLBS = new Map<string, string>([
  [
    "collision",
    "來源 collision.mdx 是 1188 位元組的純骨架：0 geoset／0 頂點／0 PRE2 emitter／" +
      "0 貼圖。luma-key 需要一份材質、emitter 烤面片需要一顆 emitter，兩條修法各缺一半的" +
      "輸入 ⇒ 沒有東西可以轉；而且它是原作的隱形碰撞體積輔助模型，畫不出東西才是對的。",
  ],
  ["collision-mid", "collision 的 LOD 階，來源同一份空的 collision.mdx。"],
  ["collision-small", "collision 的 LOD 階，來源同一份空的 collision.mdx。"],
]);

describe("⑦ 出貨的 imported .glb 都要畫得出至少一個 primitive", () => {
  it("★ 零像素只准在「來源真的是空的」時候豁免（豁免表帶理由，補好了就要刪）", () => {
    const dir = join(CONTENT, "assets/models/imported");
    const names = readdirSync(dir)
      .filter((f) => f.endsWith(".glb"))
      .map((f) => f.slice(0, -4))
      .sort();
    expect(names.length, "出貨的 imported 資料夾是空的 —— 這條斷言是真空綠的").toBeGreaterThan(100);

    const blank: string[] = [];
    const stale: string[] = [];
    for (const name of names) {
      const { visible, total } = visiblePrimitives(join(dir, `${name}.glb`));
      if (visible === 0) {
        if (!EMPTY_SOURCE_GLBS.has(name)) blank.push(`${name}（${visible}/${total}）`);
      } else if (EMPTY_SOURCE_GLBS.has(name)) {
        stale.push(`${name}（${visible}/${total}）`);
      }
    }
    expect(
      blank,
      "這幾份出貨的 imported .glb 畫不出任何 primitive —— 材質 alpha 全是 0（加法輝光被軟刪除）" +
        "或者整份沒有 mesh（純 emitter 模型被匯出成空殼）。⛔ 調 scale／fxTint 治不了 0 像素：" +
        "修法是重烘（`python3 tools/w3x-import/reconvert_zero_pixel.py`），" +
        "⛔ 真的無解才進 EMPTY_SOURCE_GLBS 並寫下來源為什麼是空的",
    ).toEqual([]);
    expect(
      stale,
      "這幾份已經畫得出來了 —— 把 EMPTY_SOURCE_GLBS 裡的那一列刪掉（豁免帶到期日，⛔ 不是許可證）",
    ).toEqual([]);
  });
});

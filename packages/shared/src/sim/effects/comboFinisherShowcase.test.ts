/**
 * ⭐【龍虎亂舞 —— 自動連段→收尾重招】這一族的**演出**守衛（#549 / GH#608 後續）。
 *
 * owner 2026-08-23（逐字，⭐ 這句話定義了題目）：
 * > 「**龍虎亂舞是這個模板的俗稱**，意思是類似**格鬥天王**裡的角色招式龍虎亂舞，
 * >  **放招之後自動打打打打最後一個重招或大招結尾**，在許多格鬥遊戲常見」
 *
 * 同一天的第 2 項：「⋯都是要變成**技能與特效模板**，產出模板 還有**檢查 script**，
 * ⭐ **別忘了還有特效文字**」。
 *
 * ── 為什麼是**兩條**，而且第二條不是多餘的 ─────────────────────────────────
 * ① **行為**：連段跑起來的時候，特效文字真的一段一段冒出來，而且**收尾那一拍**
 *    才閃才震。⛔ 這一條不驗數字（幾點傷害、閃多亮、震多久）—— 那些是後台每週
 *    在調的東西（第二守則）。
 * ② **契約**：⛔ 一支技能可以完全沒有演出而行為測試照樣全綠（失敗形態②：算出來
 *    了但玩家看不到）。所以第二條去問**每一支**出貨的連段技有沒有帶齊三件套。
 *
 * ── ⭐ `{{i}}` 為什麼是這一族的承重 ────────────────────────────────────────
 * 原作 `CreateTextTagUnitBJ( I2S(udg_SupI) + "Hit", … )`（war3map.j 的 SuperFF7
 * 迴圈）在 GGD 是 `perStrike` 裡**一個** `floatingText` 寫 `"{{i}}Hit"`，⛔ 不是
 * 七個各寫死一個數字的節點（第〇·四守則）。而 `comboStrikes` 的收尾班次是班表的
 * **最後一格**，所以「6 段本體 ＋ 收尾」自然得到 `1Hit`…`7Hit` ——
 * ⭐ 逐字對上卡面的「連斬七次」，⛔ 而且段數改了它自己會跟著改。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `sim/effects/delayed.ts` 的 `sequenceIndex: index + 1`
 *    改成 `sequenceIndex: 1`（＝段號不再前進；`{{i}}` 仍然解析、字仍然冒、
 *    數量仍然是七個，畫面上「有字在跳」看起來完全正常）
 *      → 紅：`expected [ '1Hit', '1Hit', … ] to deeply equal [ '1Hit', '2Hit', … ]`
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility, rankUpAbility } from "../abilities/abilitySystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const TEMPLATE_PATH = join(CONTENT_DIR, "ability-templates/tpl-combo-finisher.json");
const ABILITY_DIR = join(CONTENT_DIR, "abilities");
const Z0 = SKELETON_ARENA.zones[0]!;
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
const NO_INTENTS = new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

cover("combo-finisher-showcase");

describe("① 行為 —— 放招之後自動打打打打，最後一拍才是重招", () => {
  it("每一段各冒一個特效文字（段號自己前進），⭐ 而閃爍與震動只發生在收尾那一拍", () => {
    const world = new SimWorld(SKELETON_ARENA, 250);
    let seat = 0;
    const mk = (team: number, dx: number): EntityId =>
      spawnChampion(world, {
        championId: "godie-hart" as ChampionId,
        seatId: asSeatId(seat++),
        teamId: asTeamId(team),
        pos: { x: P.x + dx, z: P.z },
        zone: 0,
      });
    const cloud = mk(0, 0);
    const foe = mk(1, 3);
    world.step(NO_INTENTS);
    world.rebuildGrid();

    world.ultGateOverride = true;
    const ab = world.abilities.get(cloud)!;
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, cloud, "R")).toBe(true);
    const hp = world.health.get(cloud)!;
    hp.mana = hp.maxMana = Math.max(hp.maxMana, 1000);
    // ⚠️ 目標要活過整段連段 —— `dropDeadTargets` 預設為真，死了就沒有後面幾刀，
    //    而那會讓這條守衛用「特效文字壞了」這句假話紅。
    const victim = world.health.get(foe)!;
    victim.hp = victim.maxHp = 100000;

    expect(castAbility(world, cloud, "R", { type: "entity", entityId: foe })).toBe("ok");

    const texts: string[] = [];
    let lastTextTick = -1;
    const punctuation: { type: string; tick: number }[] = [];
    for (let i = 0; i < 200; i++) {
      world.step(NO_INTENTS);
      for (const ev of world.events) {
        if (ev.type === "floatingText") {
          texts.push(String(ev.data["text"]));
          lastTextTick = world.tick;
        } else if (ev.type === "screenFlash" || ev.type === "screenShake") {
          punctuation.push({ type: ev.type, tick: world.tick });
        }
      }
    }

    // ⭐ 承重：段號**自己前進**，⛔ 不是七個寫死的節點，也⛔ 不是七個同號。
    expect(texts).toEqual(["1Hit", "2Hit", "3Hit", "4Hit", "5Hit", "6Hit", "7Hit"]);
    // ⭐ 承重：「重招」與「第 N 刀」在畫面上唯一分得開的地方 —— 標點只在最後一拍。
    expect(punctuation.map((p) => p.type).sort()).toEqual(["screenFlash", "screenShake"]);
    for (const p of punctuation) {
      expect(p.tick, `${p.type} 落在連段中途 —— 每一刀都閃就等於沒有收尾`).toBe(lastTextTick);
    }
  });
});

/**
 * ⛔ 這一支今天帶不齊三件套，而**理由不是「還沒排到」**：
 * `content/abilities/godie-hapm.ex.json`（52-002 射殺百頭，家族 `nine-lives-hits`
 * ＝ 10 段＋收尾）不在這條 lane 的檔案柵欄裡。
 * ⭐ 反駁法：它補上三件套的那一天，下面第二條斷言會紅並要求把這一列刪掉 ——
 * ⛔ 一個沒有到期日的豁免就是一張永久許可證。
 */
const FENCED_OUT = new Set(["godie-hapm.ex"]);

describe("② 契約 —— 每一支出貨的連段技都帶著模板宣告的演出三件套", () => {
  /** 「自動連段→收尾」的**結構**判準：N 段排程 ＋ 一個收尾。⛔ 這裡沒有技能 id。 */
  function comboNodes(doc: unknown): { perStrike: unknown[]; finisher: unknown[] }[] {
    const out: { perStrike: unknown[]; finisher: unknown[] }[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return void n.forEach(walk);
      if (n === null || typeof n !== "object") return;
      const r = n as Record<string, unknown>;
      if (r["kind"] === "comboStrikes" && Array.isArray(r["finisher"]))
        out.push({ perStrike: r["perStrike"] as unknown[], finisher: r["finisher"] as unknown[] });
      // ⭐ `delayed` + `finalEffects` 是**同一個家族的另一個作者介面**（同一支
      //    `delayedSystem` 付款）—— 只認 `comboStrikes` 會讓一半的成員逃掉。
      if (r["kind"] === "delayed" && Array.isArray(r["finalEffects"]))
        out.push({ perStrike: r["effects"] as unknown[], finisher: r["finalEffects"] as unknown[] });
      Object.values(r).forEach(walk);
    };
    walk(doc);
    return out;
  }

  const kinds = (list: unknown[]): string[] =>
    (list ?? []).map((e) => String((e as Record<string, unknown>)["kind"]));

  it("模板宣告的三件套 = 每一刀的打擊特效 · 每一刀的特效文字 · 收尾的閃爍與震動", () => {
    const tpl = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as {
      family: string;
      params: Record<string, unknown>;
    };
    expect(tpl.family).toBe("combo-finisher");
    // ⛔ 從模板拿掉任何一格 = 這一族的演出契約少了一件，下面的斷言就沒有依據。
    for (const slot of ["hitVfx", "hitText", "finisherVfx", "finisherFlashAlpha", "finisherShakeAmplitude"])
      expect(Object.keys(tpl.params), `模板少了 ${slot}`).toContain(slot);
  });

  it("出貨內容裡每一段「連段→收尾」都帶齊了（豁免要寫得出理由）", () => {
    const bad: string[] = [];
    const staleExemptions: string[] = [];
    for (const f of readdirSync(ABILITY_DIR).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(ABILITY_DIR, f), "utf8")) as { id: string };
      for (const node of comboNodes(doc)) {
        const per = kinds(node.perStrike);
        const fin = kinds(node.finisher);
        const text = (node.perStrike ?? []).find(
          (e) => (e as Record<string, unknown>)["kind"] === "floatingText",
        ) as Record<string, unknown> | undefined;
        const missing = [
          per.includes("spawnVfx") ? "" : "每一刀的打擊特效(perStrike.spawnVfx)",
          typeof text?.["text"] === "string" && String(text["text"]).includes("{{i}}")
            ? ""
            : "每一刀的特效文字(perStrike.floatingText 帶 {{i}})",
          fin.includes("spawnVfx") ? "" : "收尾特效(finisher.spawnVfx)",
          fin.includes("screenFlash") ? "" : "收尾閃爍(finisher.screenFlash)",
          fin.includes("screenShake") ? "" : "收尾震動(finisher.screenShake)",
        ].filter(Boolean);
        if (FENCED_OUT.has(doc.id)) {
          if (missing.length === 0) staleExemptions.push(doc.id);
        } else if (missing.length > 0) {
          bad.push(`${doc.id}: 缺 ${missing.join(" · ")}`);
        }
      }
    }
    expect(bad, `連段技少了演出 —— 玩家看不出「打了幾下」也看不出哪一下是重招`).toEqual([]);
    expect(staleExemptions, "這幾支已經補齊了 —— 把 FENCED_OUT 裡的那一列刪掉").toEqual([]);
  });
});

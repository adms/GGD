/**
 * ⭐⭐ **卡面說 `[被動]`／`[靈氣]`，引擎就不可以讓它被施放**（GH#940 ① · GH#948）。
 *
 * ── ⚠️ 這個數字我量了**四次**，前三次都是錯的 ──────────────────────────────
 *
 * | 量法 | 得到 | 為什麼錯 |
 * |---|---:|---|
 * | raw JSON，`effects` 非空當「可施放」 | 14 | ⛔ 漏掉 `effects:[]` **但有 `template`** 的那 15 支 |
 * | raw JSON ＋ 出貨判準 | 29 | ⛔ 漏掉 PASSIVE 槽 `innateKind:"active"` 的那 1 支 |
 * | raw JSON ＋ 兩支判準 | 30 | ⚠️ 數字對了，⛔ **理由是錯的**（模板在載入時才展開，raw 看不到） |
 * | ⭐ **出貨載入器 ＋ 出貨判準** | **30** | ⭐ 這一個 |
 *
 * ⇒ ⭐ **教訓**：⛔ 不要量 `content/*.json`，⭐ 要量 `registerAll()` 之後的註冊表 ——
 * 模板（82 支帶 `template`）在**載入時**展開，而 raw JSON 上它們看起來是空的。
 *
 * ⚠️ 同一條調查裡還有兩個「欄位名／通道」誤判，兩個都是讀完整份文件才發現的：
 * · `vfx` 段的欄位叫 **`vfxId`**（⛔ 不是 `vfxKey`）——差一個字，統計差 10 倍
 * · ⭐ 一支技能可以**完全不用 `effects` 也不用 `passive`**：`godie-hapm.passive`
 *   （十二道試煉）整支住在 **`marks`** 裡 ⇒ ⛔「兩者都無 ＝ 空轉」是**假的判準**
 *
 * ── ⭐ 這條閘在守什麼 ─────────────────────────────────────────────────────
 *
 * 第一·五守則：**卡片上不可以有「說了但不會發生」的字**。
 * 一張寫著 `[被動]` 的卡，玩家的預期是「它自己會發生」——
 * ⛔ 而引擎讓它佔一個技能鍵、吃一次冷卻、需要主動按。
 *
 * ⭐ 而且**它不是理論的**：`godie-hvwd.w`（明鏡止水）卡面寫
 * 「[靈氣] 7% 的遠距攻擊傷害加成」，⛔ 而它 `effects:0`／無 `passive`／無 `marks`
 * ⇒ ⭐ **按下去什麼都不會發生**。
 *
 * ── ⚠️ 為什麼是**棘輪**而不是 0 ───────────────────────────────────────────
 *
 * 修法是**逐支的設計決定**（照第〇·六守則的階梯：owner 的技能說明 > 編輯器 JSON
 * ⇒ 卡面贏 ⇒ 那 30 支的 JSON 要改成真的被動）。⛔ 那不是一次改動，
 * ⭐ 而棘輪保證它**只能變短**：修一支就把數字調小，⛔ 而新增一支會紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { isPassiveOnly } from "../sim/abilities/abilityPassives";
import { innateCastBlock } from "../sim/abilities/innateActive";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 卡面上宣告「這是自己會發生的東西」的兩個標籤。 */
const PASSIVE_TAG = /\[(被動|靈氣)\]/;

/**
 * ⭐ 棘輪 —— **只能往下**。2026-09-02 量到 30。
 * ⚠️ 修好一支就把這個數字調小，⛔ 不要放大它（放大＝又寫了一張說謊的卡）。
 */
// ⭐ 2026-09-02（GH#905）：30 → 29 —— `godie-u00v.q` 44-01 的拳頭從
//   `tpl-buff-self`（給自己 as+0.25）翻成 `passive.ranks[].hooks[onBasicAttack]`
//   ⇒ 它變成純被動,⭐ 而卡面逐字就寫著 `[被動] 0秒冷卻`。⛔ 棘輪只准降。
// ⭐ 2026-09-06 29 → 25：06-01/06-02 山形修煉 ×2 形態照 owner「被動就被動」改成 passive proc（卡面 [被動] 終於是真的）。
const CEIL = 25;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** ⭐ 出貨的兩支判準逐字組合 —— ⛔ 不是我在這裡重寫一份。 */
function engineSaysCastable(def: Parameters<typeof isPassiveOnly>[0]): boolean {
  return innateCastBlock(def) === null && !isPassiveOnly(def);
}

function liars(): string[] {
  const out: string[] = [];
  for (const def of Abilities.all()) {
    const d = def as unknown as Record<string, unknown>;
    const txt = `${String(d["name"] ?? "")} ${String(d["description"] ?? "")}`;
    if (!PASSIVE_TAG.test(txt)) continue;
    if (engineSaysCastable(def)) out.push(String(d["id"]));
  }
  return out.sort();
}

describe("卡面的 [被動]／[靈氣] 要與引擎一致（GH#940 ① · GH#948）", () => {
  it("⭐ 儀器：註冊表載得起來，而且真的有卡掛著這兩個標籤", () => {
    // ⛔ 沒有這一條，下面的棘輪在內容載入失敗時會「0 ≤ 30」通過。
    expect(Abilities.all().length, "⛔ 註冊表是空的 —— 內容沒載起來").toBeGreaterThan(300);
    const tagged = Abilities.all().filter((def) => {
      const d = def as unknown as Record<string, unknown>;
      return PASSIVE_TAG.test(`${String(d["name"] ?? "")} ${String(d["description"] ?? "")}`);
    });
    expect(tagged.length, "⛔ 一張卡都沒掛 [被動]/[靈氣] ⇒ 這條在量空氣").toBeGreaterThan(50);
  });

  it("⭐⭐ 棘輪：卡面說被動而引擎判可施放的支數**只能變少**", () => {
    const bad = liars();
    expect(
      bad.length,
      `⛔ ${bad.length} 支卡面掛 [被動]/[靈氣]，而引擎判它**可施放**（上限 ${CEIL}）。\n` +
        "   ⭐ 玩家讀到「被動」的預期是「它自己會發生」——\n" +
        "     ⛔ 而引擎讓它佔一個技能鍵、吃一次冷卻、需要主動按。\n" +
        "   ⇒ 修法照第〇·六守則的階梯（owner 的技能說明 > 編輯器 JSON）：\n" +
        "     ⭐ **卡面贏** ⇒ 把那一支的 JSON 改成真的被動（`passive` / `marks`），\n" +
        "     ⛔ 不是把卡面的標籤刪掉。\n" +
        `   目前：${bad.join(" ")}`,
    ).toBeLessThanOrEqual(CEIL);
  });

  it("⭐ 棘輪不可以是虛的 —— 上限要貼著現況（⛔ 不是一個寬鬆的大數字）", () => {
    // ⚠️ 一個遠高於現況的上限＝一條**永遠不會紅**的閘（失敗形態⑨）。
    expect(
      CEIL - liars().length,
      `⛔ 上限比現況寬 ${CEIL - liars().length} 支 ⇒ 這條閘在那個範圍內是**瞎的**。\n` +
        `   ⇒ 修好幾支就把 CEIL 調到幾支（現在應該是 ${liars().length}）。`,
    ).toBeLessThanOrEqual(0);
  });
});

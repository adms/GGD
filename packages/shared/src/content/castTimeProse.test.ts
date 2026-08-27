/**
 * ⛔⛔ **卡面寫的吟唱秒數，必須是玩家真的站著不動那幾秒。**（GH#792）
 *
 * ── 為什麼要有這一條（量到的，⛔ 不是假設）──────────────────────────────
 *
 * #787 依 owner 2026-08-27 逐字「把所有詠唱超過一秒的都調整至一秒」，在**載入時**
 * 夾（`castTimeMaxSec = 1.0`）。⭐ 那一格夾的是**引擎**，⛔ 沒有動任何一份說明 ——
 * 於是 **11 支**技能的卡面繼續寫著「吟唱2秒／3秒」，而引擎只吟唱 1 秒。
 *
 * ⇒ 第一·五守則的活體樣本：schema 收得下、`content:build` 全綠、全套測試全綠，
 * **而卡片上那句話不會發生**。⛔ 每一條既有的閘都對它結構性失明：
 *
 * | 既有的閘 | 它問的問題 | 為什麼漏掉 |
 * |---|---|---|
 * | `abilityProse.test.ts` ② | 「這個數字**綁得上**佔位符嗎？」 | 在 GH#792 之前 `{{cast}}` 根本不在詞彙裡 |
 * | `descriptionClaims.test.ts` | 「卡面數字**對不對**？」 | 它的 `MismatchRule` 七條裡**沒有吟唱**這一軸 |
 * | `castTimeRules.test.ts` | 「夾子本身算得對嗎？」 | ⭐ 算得完全對 —— 壞的是**沒有人告訴卡片** |
 *
 * ⭐ 三條都在問**一個名詞**；這一條問的是**兩個名詞的關係**（卡面 ↔ 引擎），
 * 而那正是「每一個零件都對、只有它們的組合是空的」那一族唯一抓得到的問法。
 *
 * ── 它與 `abilityProse.test.ts` 的分界（⛔ 不是第二份守衛）──────────────────
 *
 * 那一支問「這個數字**是不是一段靜態文字**」（結構），這一支問
 * 「這個數字**今天還是不是真的**」（配對）。⭐ 一支寫死「吟唱1秒」的卡片今天
 * 逐字為真 ⇒ 那一支不會叫、這一支也不會叫；而 owner 把 `castTimeMaxSec` 調到 2
 * 的那一刻，**只有這一支會紅**。⇒ 兩條都要在。
 *
 * ⛔ 讀的是**註冊表**那一份（＝每一個消費端真的拿到的字），⛔ 不是磁碟 ——
 * 磁碟上是 `吟唱{{cast}}秒`，而玩家看到的是算繪之後的數字（失敗形態⑤：
 * 被測的不是出貨的那個）。
 *
 * 修法（⛔ 不是改這條測試）：把說明裡的字面秒數換成 `{{cast}}`
 * ——來源在 `tools/skill-remake/heroes/*.py`，改完跑
 * `bash scripts/genrun.sh skillremake:json`。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { applyCastTimeRules, castTimeRulesFromDoc } from "../sim/castTimeRules";
import { DEFAULT_PROSE_TABLES, abilityQuantities, renderAbilityText } from "./abilityProse";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 卡面上的吟唱字樣。⚠️ 台詞已經先被剝掉（第〇·六守則②）。 */
const CAST_RE = /(?:吟唱|詠唱)\s*([0-9]+(?:\.[0-9]+)?)\s*秒/g;
/** `「…」` 是角色對白不是效果 —— ⛔ 剝**整段**（含跨行、含行中）。 */
const stripQuotes = (s: string): string => s.replace(/「[^」]*」/gs, "");

describe("卡面的吟唱秒數 = 引擎真的吟唱那幾秒（GH#792）", () => {
  /** `[技能 id, 卡面上寫的秒數們, 引擎真的吟唱幾秒]`。 */
  let rows: [string, string[], number][] = [];

  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);

    // ⛔ 從出貨 config **推導**夾子，⛔ 不抄 1.0 進斷言（那是第四個住處，必過期）。
    const rules = castTimeRulesFromDoc(
      (Configs.all() as unknown as { schema?: string }[]).find(
        (c) => c.schema === "config.cast-time@1",
      ),
    );
    rows = [];
    for (const id of Abilities.ids()) {
      const def = Abilities.get(id) as unknown as { description?: string; castTimeSec?: number };
      const said = [...stripQuotes(def?.description ?? "").matchAll(CAST_RE)].map((m) => m[1]!);
      if (said.length === 0) continue;
      const spec = def.castTimeSec;
      const real =
        typeof spec === "number" && Number.isFinite(spec) && spec > 0
          ? applyCastTimeRules(rules, spec)
          : 0;
      rows.push([String(id), said, real]);
    }
  });

  /**
   * ⭐ **承重的那一條**：把 `abilityQuantities` 裡 `applyCastTimeRules(...)` 換成
   * 裸的 `castTimeSec`，`{{cast}}` 就會算繪出規格值 ⇒ 這一條逐支點名（突變驗過）。
   */
  it("① 說明裡每一個吟唱秒數都等於夾後的實際秒數", () => {
    const bad = rows
      .filter(([, said, real]) => said.some((s) => Number.parseFloat(s) !== real))
      .map(([id, said, real]) => `  ${id}：卡面寫「吟唱${said.join("/")}秒」，引擎 ${real} 秒`);
    expect(
      bad.join("\n"),
      `⛔ 卡片上有「說了但不會發生」的秒數（第一·五守則）。\n` +
        `⭐ 修法：說明改用 {{cast}}（來源 tools/skill-remake/heroes/*.py），` +
        `再跑 bash scripts/genrun.sh skillremake:json：\n${bad.join("\n")}`,
    ).toBe("");
  });

  /**
   * ⭐ 量尺自己要先自證（單邊校準的尺會在最需要說話的時候沉默）——
   * 抓得到「有吟唱」，也要抓得到「這一支根本沒有吟唱秒數可比」。
   */
  it("② 這把尺真的量得到東西（⛔ 空的母體不算綠）", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(([, , real]) => real > 0)).toBe(true);
  });

  /**
   * ⭐⭐ **兩個方向都要驗**（第一守則：一把只驗過單邊的尺，不算自證過）。
   * 一個寫死「吟唱1秒」的卡面在今天與 `{{cast}}` **量起來一模一樣** ——
   * 分得出來的唯一辦法是**轉動那一格**：`castTimeMaxSec` 拉到 8（＝ owner 的止血閥、
   * 一支都夾不到）⇒ 真的佔位符會跟著回到規格值，寫死的字面值不會動。
   */
  it("③ 佔位真的是佔位：castTimeMaxSec 拉到 8 ⇒ 卡面跟著回到規格值", () => {
    const def = Abilities.get("godie-e007.ex" as never) as unknown as { castTimeSec?: number };
    const src = "吟唱{{cast}}秒";
    const spec = def.castTimeSec!;
    const shipped = castTimeRulesFromDoc(
      (Configs.all() as unknown as { schema?: string }[]).find(
        (c) => c.schema === "config.cast-time@1",
      ),
    );
    const render = (maxSec: number): string =>
      renderAbilityText(src, abilityQuantities(def, { ...DEFAULT_PROSE_TABLES, castTime: { ...shipped, castTimeMaxSec: maxSec } }));
    expect(spec).toBeGreaterThan(shipped.castTimeMaxSec); // ⛔ 沒被夾到的技能證明不了任何事
    expect(render(shipped.castTimeMaxSec)).toBe(`吟唱${shipped.castTimeMaxSec}秒`);
    expect(render(8)).toBe(`吟唱${spec}秒`);
  });
});

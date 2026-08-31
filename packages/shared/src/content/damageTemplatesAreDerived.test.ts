/**
 * ⛔ **一支引用了傷害模板的技能，不可以是免費的** —— 而擋住它的那張表必須是**推導**的。
 *
 * ── 這一支存在的理由（2026-08-31 量到，GH#648 內容批）────────────────────────
 * `tools/skill-remake/tierize.py` 落地 owner 2026-08-21 ⑦「若不是主動傷害技能
 * 就免魔力吧 乾脆點」：**非**主動傷害技 ⇒ `manaCost` 抹成 0、`manaCostTier` 拔掉。
 * ⇒ 那條規則的正確性整個掛在「這支技能算不算傷害技」這個判斷上，而模板技的傷害
 *   住在 `template.params`（⛔ 不在 `effects` 裡）⇒ 它靠一張 `DAMAGE_TEMPLATES` 認人。
 *
 * ⛔ 而那張表**是手寫的 7 個名字**，出貨模板裡符合條件的有 **15 個** ⇒ 少了 8 個。
 * ⭐ 它在 2026-08-31 之前**每一天都是綠的** —— 因為那 8 個當時零採用。
 *   GH#648 接上第一支的那一刻，5 支技能（04-02 炸彈陣×2 · 90-01 飛葉快刀×2 ·
 *   37-03 災難之牆）的 `manaCost` 被當場從 288/72 抹成 **0** 並拔掉 `manaCostTier`
 *   ⇒ ⭐ **五支免費的大絕**，而 `content:build` 全綠、Zod 全綠、1,239 條測試全綠。
 *
 * ⚠️ 逐條查過**沒有任何既有守衛**問得出這一題：
 *   · `abilityAffordableAtUnlock` 問「首階 MP 付不付得起」—— **0 一定付得起** ⇒ 綠
 *   · `tierRawParity` 問「級別與原始值一不一致」—— 級別被**一起拔掉**了 ⇒ 綠
 *   · `noOpModifierClaims` 問 modifier，⛔ 不問耗魔
 * ⇒ 這正是 CLAUDE.md 的元規則：**一份手寫的表會過期，而且不會有東西紅**
 *   （同族前科：`SIM_CAPABILITIES` 的檔頭自己記錄它撒過兩次謊）。
 *
 * ── ⭐ 兩條斷言驗的是**關係**，⛔ 不是名詞 ─────────────────────────────────
 *  ① 兩側**各自推導**同一個集合（TS 讀 `content/ability-templates/`，Python 讀它自己的）
 *     ⇒ 有人把 Python 那一格改回字面 frozenset 就紅。⛔ 不是 grep 原始碼字串：
 *       它**真的把 python 跑起來**問答案（同 `backupRules.test.ts` 的形狀）。
 *  ② 症狀本身：引用傷害模板的出貨技能，⛔ 不可以全階耗魔都是 0。
 *     ⇒ ①漏掉某一條路時，②仍然會在**玩家看得到的那一面**叫。
 *
 * ── 突變紀錄（一批一條，最承重的那一條）────────────────────────────────────
 *  · `tierize.py` 的 `DAMAGE_TEMPLATES = _derive_damage_templates()` 改回原本手寫的
 *    7 個名字 ⇒ ① 🔴 紅，訊息逐字列出少掉的 8 個（含 `tpl-periodic-field`）。
 *    再跑一次 `pnpm tiers:apply` ⇒ ② 也 🔴 紅並指名那 5 支免費技。改回 ⇒ 綠。
 *  ⭐ 承重的是①：②要等正規化器真的跑過才會髒，而①在**編輯發生的當下**就叫。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TPL_DIR = join(REPO, "content/ability-templates");
const ABIL_DIR = join(REPO, "content/abilities");

/** `template.params` 裡屬於「傷害」的參數名 —— ⚠️ 與 `tierize.py` 同一份詞彙表。 */
const DAMAGE_PARAMS = ["damage", "hitDamage", "tickDamage", "damageTier"];

const docsIn = (dir: string): Record<string, unknown>[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>);

/** TS 側的推導：宣告了任何一格傷害參數的出貨模板。 */
function derivedHere(): string[] {
  return docsIn(TPL_DIR)
    .filter((d) => DAMAGE_PARAMS.some((k) => k in ((d["params"] ?? {}) as object)))
    .map((d) => String(d["id"]))
    .sort();
}

/** Python 側的答案 —— ⭐ 真的把它跑起來問，⛔ 不是掃原始碼字串（失敗形態⑥）。 */
function derivedInPython(): string[] {
  const out = execFileSync(
    "python3",
    ["-c", "import json,sys;sys.path.insert(0,'tools/skill-remake');import tierize;print(json.dumps(sorted(tierize.DAMAGE_TEMPLATES)))"],
    { cwd: REPO, encoding: "utf8" },
  );
  return JSON.parse(out.trim()) as string[];
}

describe("傷害模板的名單是推導的（⛔ 不是一張手寫的表）", () => {
  it("① 承重：Python 的 DAMAGE_TEMPLATES == 出貨模板自己宣告的傷害參數", () => {
    const here = derivedHere();
    expect(here.length, "母體是空的 ⇒ 這條斷言什麼都沒驗").toBeGreaterThan(0);
    expect(
      derivedInPython(),
      "⛔ tierize.py 的 DAMAGE_TEMPLATES 與出貨模板對不上。\n" +
        "　 少了誰 ⇒ owner ⑦「非傷害技就免魔」會把那一族的技能**抹成免費**，\n" +
        "　 而 manaCostTier 被一起拔掉 ⇒ 連 tierRawParity 都不會紅（2026-08-31 實際發生）。\n" +
        "⭐ 修法是讓它繼續**推導**（`_derive_damage_templates()`），⛔ 不是往字面清單補一行。",
    ).toEqual(here);
  });

  it("② 症狀：引用傷害模板的出貨技能，⛔ 不可以全階耗魔都是 0", () => {
    const damageTemplates = new Set(derivedHere());
    const free: string[] = [];
    let checked = 0;
    for (const d of docsIn(ABIL_DIR)) {
      const ref = (d["template"] as { ref?: unknown } | undefined)?.ref;
      if (typeof ref !== "string" || !damageTemplates.has(ref)) continue;
      checked += 1;
      const mp = d["manaCost"];
      if (Array.isArray(mp) && mp.length > 0 && mp.every((x) => !x)) {
        free.push(`${String(d["id"])}（${ref}）`);
      }
    }
    expect(checked, "一支引用傷害模板的技能都沒掃到 ⇒ 這條守衛在測空集合").toBeGreaterThan(0);
    expect(
      free,
      "⛔ 這幾支是**傷害技**卻不用花魔力 —— 多半是 tierize.py 的 ⑦ 把它們誤判成非傷害技。\n" +
        "　 ⛔ 不要在這裡加豁免：先問 DAMAGE_TEMPLATES 認不認得它的模板（斷言①）。",
    ).toEqual([]);
  });
});

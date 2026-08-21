/**
 * ⭐【填了級別，原始值就必須說同一句話】—— owner 2026-08-21 ② 的閘。
 *
 * owner 逐字：「[v] **A 以級距為準，改 JSON**」（20 支 `rangeTier`/`radiusTier`
 * 與原始數值不符，最刺眼的是 **44-01 死神之眼：級距 12、JSON 寫 2，差 6 倍**）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼原始欄位**不能刪掉**（那是「乾脆一點」的第一直覺，而它是錯的）
 *
 * 四張級距表各有一格 `enabled` —— 那是**止血閥**（一鍵回到舊的那一套數字）。
 * 刪掉原始值之後拉止血閥 = 420 支技能沒有冷卻、沒有傷害、沒有射程。
 * `zAbilityDef` 自己也寫著「要留特例就不要填級別」⇒ **原始欄位就是特例機制**。
 *
 * ⇒ 兩格都留，但**必須逐位元組相等**。那正是這一條在守的東西：
 *   · 級別 → 註冊時 `resolve*Tier` 會贏（所以引擎跑級別）
 *   · 原始值 → 止血閥拉下去之後接手（所以它必須是同一個數字）
 * 兩者不一致 = **卡片說 2、引擎跑 12**，而 `content:build` 綠、Zod 綠、全套測試綠
 *（第一·五守則的鏡像：這一次不是「說了不會發生」，是「發生的比說的多六倍」）。
 *
 * ⚠️ 數字**從 `DEFAULT_*` 推導**，⛔ 不從 `content/config/` 讀 ——
 * 那樣這條測試會變成「產生器跟它自己比對」（產生器就是讀 config 的）。
 * `DEFAULT_*` 與 config 之間另有 drift 測試在守，所以這裡是真的**第二個意見**。
 *
 * 突變紀錄：把任何一份技能文件的 `range` 改掉（保留 `rangeTier`）→ 這一條紅並
 * 指名 `<檔>.range`。把 `tools/skill-remake/tierize.py::_apply_geometry` 整段拿掉
 * → 20 支同時紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RANGE_TIERS } from "./rangeTiers";
import { DEFAULT_AOE_TIERS } from "./aoeTiers";
import { DEFAULT_COOLDOWN_TIERS, cooldownShapeOf } from "./cooldownTiers";
import { DEFAULT_DAMAGE_TIERS } from "./damageTiers";
import { DEFAULT_MANA_TIERS } from "./manaTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const AB = join(REPO, "content/abilities");

/**
 * ⛔ **具名退路** —— `檔:欄位` → 為什麼它還在漂移。
 *
 * ⚠️ 這是**名單**不是豁免（同 `balanceAnchors.test.ts` 的 `LEGACY_ANCHORS`）：
 * 每一筆都要帶一個**能被反駁的理由**，而且下面有反向斷言 ——
 * 收乾淨之後那一筆會變成過期項目而紅，⛔ 不會靜靜留著變成沒人讀的豁免。
 *
 * ⭐ 2026-08-21 owner ② 落地之後這裡是**空的**（20/20 全部收乾淨）。
 */
const TIER_RAW_DRIFT: Readonly<Record<string, string>> = Object.freeze({});

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const tierValue = (t: unknown, tbl: Readonly<Record<SkillTierName, number>>): number | undefined =>
  typeof t === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(t)
    ? tbl[t as SkillTierName]
    : undefined;

describe("填了級別的節點，原始值必須等於級距值（owner 2026-08-21 ②）", () => {
  it("⭐ 五軸一起看 —— 級別與原始值不可以說兩句話", () => {
    const stale = new Set(Object.keys(TIER_RAW_DRIFT));
    const bad: string[] = [];
    const seen = { range: 0, radius: 0, cooldown: 0, damage: 0, mana: 0 };
    const flag = (key: string, msg: string): void => {
      if (stale.delete(key)) return;
      bad.push(msg);
    };

    for (const f of readdirSync(AB).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(AB, f), "utf-8")) as Rec;

      // ① 施法距離 —— 頂層一格。
      const rt = tierValue(doc["rangeTier"], DEFAULT_RANGE_TIERS.range);
      if (rt !== undefined) {
        seen.range++;
        if (doc["range"] !== rt) flag(`${f}:range`, `${f}.range = ${doc["range"]}，級別要 ${rt}`);
      }

      // ② 冷卻 —— 頂層一格，⚠️ 秒數取決於**形狀**（單體 6 ≠ 範圍 30）。
      const ct = doc["cooldownTier"];
      if (typeof ct === "string") {
        seen.cooldown++;
        const want = DEFAULT_COOLDOWN_TIERS.seconds[cooldownShapeOf(doc, DEFAULT_COOLDOWN_TIERS)][
          ct as SkillTierName
        ];
        const cd = doc["cooldown"];
        if (!Array.isArray(cd) || cd.some((x) => x !== want)) {
          flag(`${f}:cooldown`, `${f}.cooldown = ${JSON.stringify(cd)}，級別要每一階都是 ${want}`);
        }
      }

      // ②b 耗魔 —— 頂層一格（2026-08-21 起是五軸的第五軸）。
      // ⚠️ 它與冷卻**完全同一個形態**，而漏掉它的後果更難看見：
      // `manaCostTier` 的下界是 1，所以一支「級別寫著極小、manaCost 卻是 0」的
      // 免費技，會在註冊時被 `resolveManaCostTier` 悄悄改成收 73 —— 卡片、
      // schema、全套測試都正常，只有玩家會發現按不下去（失敗形態②）。
      const mt = doc["manaCostTier"];
      if (typeof mt === "string") {
        seen.mana++;
        const want = DEFAULT_MANA_TIERS.manaCost[mt as SkillTierName];
        const mp = doc["manaCost"];
        if (!Array.isArray(mp) || mp.some((x) => x !== want)) {
          flag(`${f}:manaCost`, `${f}.manaCost = ${JSON.stringify(mp)}，級別要每一階都是 ${want}`);
        }
      }

      // ③④ 半徑與傷害 —— 它們住在**效果樹的任何一層**（`Scaling` 到處都是）。
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return void node.forEach(walk);
        if (!isRec(node)) return;
        const rad = tierValue(node["radiusTier"], DEFAULT_AOE_TIERS.radius);
        if (rad !== undefined && typeof node["radius"] === "number") {
          seen.radius++;
          if (node["radius"] !== rad) {
            flag(`${f}:radius`, `${f} 的 ${String(node["kind"])}.radius = ${node["radius"]}，級別要 ${rad}`);
          }
        }
        // ⛔⛔ **傷害那一軸 2026-08-22（#534）退場了** —— ⛔ 不要把它加回來。
        //
        // owner:「那你**只要改公式表 等於全改完**」「不然英雄、技能、道具、特效
        // 這些堆積起來會**指數爆炸**」⇒ 出貨文件現在**只寫 `damageTier`**，
        // 算好的 `flat` 由 `resolveDamageTier()` 在**註冊時**填回去（第〇·四守則）。
        //
        // ⚠️ 這一段原本要求 `flat === 級距值`，而**新的閘要求它們不可以並存**
        //（`tierFlatExclusive.test.ts`）—— 兩條守衛會互相打架，而打架的那一刻
        // 一定有一條在用錯誤的訊息紅。⭐ 拿掉這一段之後，「級別與原始值說兩句話」
        // 這個缺陷在**結構上不可能發生**（原始值根本不在文件裡了），
        // 那比用一條測試去守它強。
        //
        // ⭐ 其餘四軸（冷卻／射程／半徑／耗魔）**仍然**把原始值與級別一起存，
        // 所以它們留著。哪天它們也改成載入時解析，這整支就該退休。
        if (node["damageTier"] !== undefined) seen.damage++;
        for (const v of Object.values(node)) walk(v);
      };
      walk(doc);
    }

    expect(bad, "級別與原始值說了兩句話。⛔ 不要改這條測試 —— 跑\n" +
      "  python3 tools/skill-remake/apply_tiers.py && python3 tools/skill-remake/batch1.py\n" +
      "真的要留特例，就進 TIER_RAW_DRIFT 並寫下為什麼。").toEqual([]);
    // ⭐ 反向：名單上的必須真的還在漂移。收乾淨就要刪掉那一筆。
    expect([...stale], "TIER_RAW_DRIFT 有過期的項目").toEqual([]);
    // ⭐ 這一條的**承重線**：五軸都要真的掃到東西。若某一軸掃到 0 筆，
    //    上面那個迴圈對它就是空轉，而空轉的守衛與綠燈長得一模一樣。
    expect(Object.values(seen).every((n) => n > 0), `五軸的覆蓋筆數 ${JSON.stringify(seen)}`).toBe(true);
  });
});

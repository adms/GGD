/**
 * ⭐⭐ **「宣告的欄位」對「實際的結構／卡面」**（GH#948）。
 *
 * ## ⭐ 為什麼是一支掃描器 ＋ 四條規則，⛔ 不是四支各寫一遍
 *
 * 票文 Scope 逐字：「⭐ **一支掃描器 ＋ 四條規則**（⛔ 不是四支各寫一遍）」。
 * ⭐ 四項的共同形狀是**同一個**：**文件裡有一個欄位，而它與這支技能的實際結構
 * 或卡面不符** —— ⛔ 而沒有任何守衛在問這個問題。
 *
 * ## ⛔ 前提回驗把兩條規則的意義改掉了（2026-09-02，⛔ 不是照票文抄）
 *
 * | # | 票文說 | ⭐ 量到 |
 * |---|---|---|
 * | ① 被動帶吟唱 | 34 支「⭐⭐ AP 係數公式的吟唱項**會照收**」 | ⭐ **34 支成立**，⛔ **而那個公式今天還不存在**（它是 #942 要建的）⇒ 這一條今天是**預防**，⛔ 不是止血 |
 * | ② `12-04` 卡面說大範圍而級距是中 | 一支（`godie-ewar.r`） | ⭐ **兩支** —— `godie-e007.r` 是它的變身對，⛔ 票文漏了 |
 * | ③ 同時有 `cooldown` 陣列與 `cooldownTier` | 暗示是少數幾支、是「第二個住處」 | ⭐⭐ **342 支**，⛔ 而它**不是第二個住處**：`resolveCooldownTier()` 在**載入時**把整個陣列覆寫成級距解出來的值（`cooldownTiers.ts:234`）⇒ 那些數字是**被覆寫的殘留**，⛔ 不是活的第二份 |
 * | ④ `77-002` 掛 `onBasicAttack` 而卡面沒寫 | 「變身對要一起改」 | ⭐ 變身對**不對稱**：`godie-e00w.ex` 有 1 個 hook，`godie-e00x.ex` **0 個** |
 *
 * ⇒ ⭐ ③ 從「**修 342 份檔**」變成「**釘住那個覆寫真的還在**」——
 * ⚠️ 因為若哪天 `resolveCooldownTier` 的「級別贏」被改掉，那 342 個殘留數字
 * 會**當場變成活的**，而 ⛔ 沒有任何東西會紅。
 *
 * ## 產物
 *
 * `docs/editor-contract/ggd-declared-shape-census.json` —— ⭐ 給編輯器讀，
 * ⛔ 不是給人讀的散文。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ABIL = join(ROOT, "content/abilities");

interface Doc {
  id: string;
  name?: string;
  slot?: string;
  description?: string;
  castTimeSec?: number;
  cooldown?: unknown;
  cooldownTier?: string;
  radiusTier?: string;
  [k: string]: unknown;
}

const docs: Doc[] = readdirSync(ABIL)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Doc);

/**
 * ⭐ 剝掉 `「…」` —— 第〇·六守則細則②：那是**角色對白**，⛔ 不是效果。
 * ⚠️ 剝的是**整段**（含跨行、含行中）—— ⛔ 不是「行首是「的那幾行」。
 */
const mechanics = (s: string): string => s.replace(/「[\s\S]*?」/g, "");

/** ① 被動槽卻帶著吟唱時間 —— ⭐ #942 的公式落地時它會白拿最多 +50% 係數。 */
const rule1 = docs
  .filter((d) => String(d.slot ?? "").toUpperCase() === "PASSIVE" && Number(d.castTimeSec ?? 0) > 0)
  .map((d) => ({ id: d.id, castTimeSec: d.castTimeSec }))
  .sort((a, b) => a.id.localeCompare(b.id));

/** ② 卡面說「大範圍」而 `radiusTier` 不是「大」。 */
const rule2 = docs
  .filter((d) => /大範圍/.test(mechanics(d.description ?? "")) && d.radiusTier !== undefined && d.radiusTier !== "大")
  .map((d) => ({ id: d.id, name: d.name, radiusTier: d.radiusTier }))
  .sort((a, b) => a.id.localeCompare(b.id));

/** ③ 同時有 `cooldown` 陣列與 `cooldownTier` —— ⭐ 見檔頭：這是**殘留**不是第二住處。 */
const rule3 = docs
  .filter((d) => typeof d.cooldownTier === "string" && Array.isArray(d.cooldown) && d.cooldown.length > 0)
  .map((d) => d.id)
  .sort();

/** ④ 掛 `onBasicAttack` 而卡面（剝台詞後）沒有「攻擊時」。 */
const rule4 = docs
  .filter((d) => JSON.stringify(d).includes("onBasicAttack") && !/攻擊時/.test(mechanics(d.description ?? "")))
  .map((d) => ({ id: d.id, name: d.name }))
  .sort((a, b) => a.id.localeCompare(b.id));

const out = {
  schema: "ggd-declared-shape-census@1",
  note:
    "⭐ 「宣告的欄位」對「實際的結構／卡面」（GH#948）—— ⛔ 產物，改 " +
    "`tools/declared-shape/gen.ts`，⛔ 不要手改。⚠️ 卡面比對前**剝掉 `「…」`**" +
    "（第〇·六守則細則②：那是角色對白，⛔ 不是效果）。",
  counts: {
    abilities: docs.length,
    passiveWithCastTime: rule1.length,
    cardSaysWideButTierIsNot: rule2.length,
    cooldownArrayAlongsideTier: rule3.length,
    basicAttackHookNotOnCard: rule4.length,
  },
  passiveWithCastTime: rule1,
  cardSaysWideButTierIsNot: rule2,
  cooldownArrayAlongsideTier: { count: rule3.length, sample: rule3.slice(0, 8) },
  basicAttackHookNotOnCard: rule4,
};

const json = `${JSON.stringify(out, null, 2)}\n`;
const dest = join(ROOT, "docs/editor-contract/ggd-declared-shape-census.json");
if (process.argv.includes("--check")) {
  const cur = readFileSync(dest, "utf8");
  if (cur !== json) {
    console.error("⛔ ggd-declared-shape-census.json 過期 —— 跑 `pnpm declshape:build` 然後 git add");
    process.exit(1);
  }
  console.log(`declshape:check OK（${docs.length} 支技能）`);
} else {
  writeFileSync(dest, json, "utf8");
  console.log(
    `declshape: ${docs.length} 支 → 被動帶吟唱 ${rule1.length} · 卡面大範圍不符 ${rule2.length} · ` +
      `冷卻殘留 ${rule3.length} · 攻擊時 hook 沒上卡 ${rule4.length}`,
  );
}

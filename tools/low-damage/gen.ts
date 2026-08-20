/**
 * ⭐【GH#445】「傷害太低」警告清單的產生器。
 *
 * owner 2026-08-20（逐字）：
 * > 「**傷害太低要跳出警告清單給我，後台跟 codex 編輯器也同步跳警告**」
 *
 * ```bash
 * pnpm lowdmg:build     # 重生成 docs/傷害偏低警告清單.md
 * pnpm lowdmg:check     # 唯讀：產物是不是最新（逐位元組）
 * ```
 *
 * ⛔ **這份 md 是產生的，不可以手改。** 它的每一個數字都從三張出貨表推導：
 * `config/cooldown-tiers.json` × `config/damage-tiers.json` ×
 * `config/authoring-rules.json` 的 `proportionality.expectedHits`。
 * ⇒ owner 在後台動任何一格，跑一次 build 這份清單就跟著動。
 *
 * ⚠️ **刻意沒有產生日期**（與 `caps:export` / `spec:build` / `newhero:build` 同一個理由）：
 * 任何隨時鐘變動的欄位都會讓 `--check` 的逐位元組比對永遠不相等，於是它只能被放寬成
 * 模糊比對 —— 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 *
 * ⚠️ 也刻意**不寫語料份數**（同 `tools/newhero/gen.ts`）：它會因為**無關**的內容改動
 * 而變（有人把一位英雄搬進 `_legacy`），而那會讓這份清單在一個位元都沒變的
 * 情況下紅。份數印在 stdout，⛔ 不進交付物。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceAbilityOwners } from "../../packages/shared/testkit/balancePopulation";
import {
  ANCHOR_SHAPE,
  ANCHOR_TIER,
  abilitiesInLowDamageCells,
  anchorRate,
  cellRate,
  describeLowDamageCells,
  lowDamageCells,
  type AbilityCellDoc,
} from "../../packages/shared/src/content/lowDamageCells";
import {
  COOLDOWN_SHAPES,
  DEFAULT_COOLDOWN_TIERS,
} from "../../packages/shared/src/content/cooldownTiers";
import { DEFAULT_DAMAGE_TIERS } from "../../packages/shared/src/content/damageTiers";
import { DEFAULT_EXPECTED_HITS } from "../../packages/shared/src/content/proportionality";
import { SKILL_TIER_NAMES } from "../../packages/shared/src/content/skillTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = "docs/傷害偏低警告清單.md";

const SEC = DEFAULT_COOLDOWN_TIERS.seconds;
const DMG = DEFAULT_DAMAGE_TIERS.damage;
const HITS = DEFAULT_EXPECTED_HITS;

/**
 * 語料 = **母體英雄的技能**，⛔ 不是 `content/abilities` 底下的每一份。
 *
 * ⚠️ 2026-08-21 以前這裡讀整個目錄，於是 `sela`/`thorne` 這兩張 fail-open 骨架佔位的
 * 8 支技能也被拿去對照五級距 —— owner 2026-08-21：「**錯誤的母體資料**」。
 *
 * ⛔ 語料**不含變身態的技能**（owner 2026-08-21：「查所有屬性級距等 都是不考慮變身態的」）。
 * ⚠️ 變身態的技能是本體那一支的**第二份**（同一個 `NN-XX` 編號，例 `godie-e001.passive`
 * 與 `godie-e00n.passive` 都是「22-00 嗚鎖打!」）—— 兩份都算就是把同一支技能數兩次，
 * 於是這份清單會列出兩列一模一樣的東西，而 owner 要照著它改的是**一支**技能。
 */
function corpus(): AbilityCellDoc[] {
  const dir = join(ROOT, "content/abilities");
  const owners = balanceAbilityOwners(ROOT);
  const out: AbilityCellDoc[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    // 檔名慣例（task #11）：`<championId>.<slot>.json`。⛔ 用檔名切，不用 doc.id ——
    // 兩者相等時結果一樣，不相等時檔名才是 `_index.json` 收錄的那一份。
    const owner = f.replace(/\.(q|w|e|r|ex|passive|innate)\.json$/, "");
    if (!owners.has(owner)) continue;
    out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as AbilityCellDoc);
  }
  // ⚠️ 空語料 = 讀壞了，⛔ 不是「內容是空的」。同 roster-guard 的那一條。
  if (out.length === 0) throw new Error("content/abilities 讀出 0 份文件 —— 讀取器壞了，⛔ 不是內容空了");
  return out;
}

function render(docs: readonly AbilityCellDoc[]): string {
  const cells = lowDamageCells(SEC, DMG, HITS);
  const anchor = anchorRate(SEC, DMG, HITS);
  const flagged = abilitiesInLowDamageCells(docs, cells);
  const L: string[] = [];

  L.push("# 傷害偏低警告清單（GH#445）");
  L.push("");
  L.push("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**");
  L.push(">");
  L.push("> ```bash");
  L.push("> pnpm lowdmg:build     # 重生成");
  L.push("> pnpm lowdmg:check     # 唯讀：過期就回非零");
  L.push("> ```");
  L.push(">");
  L.push("> owner 2026-08-20（逐字裁決）：");
  L.push("> 「**傷害太低要跳出警告清單給我，後台跟 codex 編輯器也同步跳警告**」");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 這一份在回答什麼");
  L.push("");
  L.push("一支技能的**期望輸出**是「每一卡面秒打出去多少傷害」：");
  L.push("");
  L.push("```");
  L.push("rate(形狀, 級距) = 傷害級距[同名那一格] × 期望命中人數[形狀] ÷ 冷卻[形狀][級距]");
  L.push("```");
  L.push("");
  L.push(
    `錨點是**對角線的起點**「${ANCHOR_SHAPE}・${ANCHOR_TIER}」= **${anchor.toFixed(2)} / 卡面秒**，` +
      "因為傷害五級距表本來就是拿它展開的（`damageTiers.tiersFromAnchor()`）。",
  );
  L.push("⇒ 單體那一列**恆等於**錨點；偏低只可能出現在別的形狀上。");
  L.push("");
  L.push("⚠️ **只警告不擋。** owner 說的是「不合理」不是「不准」，刻意的破例要留空間。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ① 十五格的期望輸出");
  L.push("");
  L.push(`| 形狀 | ${SKILL_TIER_NAMES.join(" | ")} |`);
  L.push(`|---|${SKILL_TIER_NAMES.map(() => "---:").join("|")}|`);
  for (const shape of COOLDOWN_SHAPES) {
    if (!(HITS[shape] > 0)) {
      L.push(`| **${shape}** | ${SKILL_TIER_NAMES.map(() => "豁免").join(" | ")} |`);
      continue;
    }
    const cols = SKILL_TIER_NAMES.map((t) => {
      const r = cellRate(SEC, DMG, HITS, shape, t);
      const pct = Math.round((r / anchor - 1) * 100);
      return `${r.toFixed(1)}<br>${pct === 0 ? "±0%" : `**${pct}%**`}`;
    });
    L.push(`| **${shape}** | ${cols.join(" | ")} |`);
  }
  L.push("");
  L.push(
    `⭐ 「變身」整列**豁免**（期望命中人數 = ${HITS["變身"]}）：` +
      "它的回報軸根本不是傷害，對它要求一個最低傷害級距等於逼作者在變身技上填傷害。",
  );
  L.push("");
  L.push("**輸入（三張出貨表，⛔ 這裡不抄第二份）**");
  L.push("");
  L.push(`| 形狀 | 期望命中人數 | 卡面冷卻（${SKILL_TIER_NAMES.join(" / ")}） |`);
  L.push("|---|---:|---|");
  for (const shape of COOLDOWN_SHAPES) {
    L.push(`| ${shape} | ${HITS[shape]} | ${SKILL_TIER_NAMES.map((t) => SEC[shape][t]).join(" / ")} |`);
  }
  L.push("");
  L.push(`| 傷害五級距 | ${SKILL_TIER_NAMES.map((t) => `${t} ${DMG[t]}`).join(" · ")} |`);
  L.push("|---|---|");
  L.push("");
  L.push("---");
  L.push("");
  L.push(`## ② 偏低的 ${cells.length} 格`);
  L.push("");
  if (cells.length === 0) {
    L.push("⭐ **目前一格都沒有。** 三張表現在的組合讓十五格全部達到錨點。");
  } else {
    L.push("| 格 | 每卡面秒 | 相對錨點 | 照級距名填會拿到 | 要追平錨點得跳到 |");
    L.push("|---|---:|---:|---|---|");
    for (const c of cells) {
      L.push(
        `| **${c.shape}・${c.tier}**（${SEC[c.shape][c.tier]} 卡面秒） | ${c.ratePerCardSecond.toFixed(1)} | ` +
          `**${c.deficitPct}%** | ${c.diagonalDamageTier}（${DMG[c.diagonalDamageTier]}） | ` +
          `**${c.requiredDamageTier}**（${DMG[c.requiredDamageTier]}） |`,
      );
    }
  }
  L.push("");
  L.push("⛔ **這不是「要改那兩格的數值」。** owner 同一則裁決的另一半是出貨值一格都不動 ——");
  L.push("要放寬就去調上游那三張表（後台三頁），這份清單下一秒就跟著動。");
  L.push("");
  L.push("---");
  L.push("");
  L.push(`## ③ 落在偏低格的出貨技能 —— **${flagged.length} 支**`);
  L.push("");
  L.push("⚠️ 「落在」＝ 它的**卡面冷卻**離那一格最近（出貨 358 支有冷卻的技能裡，");
  L.push("137 支的秒數不在格點上，例 25 秒 ⇒ 取最近的一格，⛔ 不是無條件進位）。");
  L.push("");
  L.push("⛔ 這不是一張「要修的清單」——它是**這條規則今天在對誰說話**。");
  L.push("真正的處置是 GH#447（傷害五級距套到 461 支）在做的事。");
  L.push("");
  if (flagged.length === 0) {
    L.push("⭐ 目前一支都沒有。");
  } else {
    L.push("| # | 技能 id | 名稱 | 形狀 | 卡面冷卻 | 落在 | 偏低 |");
    L.push("|---:|---|---|---|---:|---|---:|");
    flagged.forEach((p, i) => {
      L.push(
        `| ${i + 1} | \`${p.id}\` | ${p.name} | ${p.shape} | ${p.seconds} | ` +
          `${p.cell!.shape}・${p.cell!.tier} | **${p.cell!.deficitPct}%** |`,
      );
    });
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ④ 同一份推導的另外三個消費端");
  L.push("");
  L.push("owner 要的是「**後台跟 codex 編輯器也同步跳警告**」，⛔ 不是只有這一份文件。");
  L.push("");
  L.push("| 誰 | 走哪條路 |");
  L.push("|---|---|");
  L.push(
    "| **後台**（鑄英雄工坊 · 新英雄頁） | `newHeroChecks.checkNewHeroDocs()` 的 " +
      "`low-damage-cell` 規則 —— 存檔的那一刻跳。開關在「新英雄檢查警示」那一頁 |",
  );
  L.push(
    "| **codex 編輯器** | `authoringRules.buildAuthoringRules()` 的 `principle` 清單 " +
      "→ `GET /api/v1/content-import/authoring-rules` 與 `content/editor-target-profile.json` 的內嵌副本 |",
  );
  L.push(
    "| **創建英雄出身模板** | `newHeroDefaults.liftCooldown()` —— 生成的新技能" +
      "**不會出生在**這幾格裡（`pnpm newhero:check` 的配對閘在守） |",
  );
  L.push("");
  L.push("一句話版本（⭐ 上面三個消費端**共用**這一段，⛔ 各自寫一段就是三份會過期的散文）：");
  L.push("");
  L.push("> " + describeLowDamageCells(SEC, DMG, HITS));
  L.push("");
  return L.join("\n") + "\n";
}

function main(): void {
  const check = process.argv.includes("--check");
  const docs = corpus();
  const text = render(docs);
  const path = join(ROOT, OUT);

  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      console.error(`⛔ ${OUT} 不存在 —— 跑 \`pnpm lowdmg:build\` 然後 git add。`);
      process.exit(1);
    }
    if (current !== text) {
      console.error(`⛔ ${OUT} 過期了 —— 跑 \`pnpm lowdmg:build\` 然後 git add。`);
      process.exit(1);
    }
    console.log(`✅ ${OUT} 是最新的（語料 ${docs.length} 支技能）。`);
    return;
  }

  writeFileSync(path, text);
  const cells = lowDamageCells(SEC, DMG, HITS);
  const flagged = abilitiesInLowDamageCells(docs, cells);
  console.log(`✅ 寫入 ${OUT}（偏低 ${cells.length} 格 · ${flagged.length} 支技能 · 語料 ${docs.length} 支）。`);
}

main();

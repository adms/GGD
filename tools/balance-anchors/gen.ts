/**
 * 平衡錨點量測器 —— **三個空間**的中位數從出貨內容量出來，⛔ 沒有一個是打上去的。
 *
 * ```bash
 * pnpm anchors:build     # 重量並寫產物
 * pnpm anchors:check     # 唯讀，逐位元組比對；過期就非零離開
 * ```
 *
 * ---------------------------------------------------------------------------
 * owner 2026-08-20（逐字，這一支存在的理由）
 * ---------------------------------------------------------------------------
 * > 「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」
 *
 * ⛔ 在此之前只有**一個**數字（`MEDIAN_EFFECTIVE_HP`），而它把三層混在一起：
 * 英雄卡的成長曲線 × `combat-env` 的系統倍率 × 魔抗減傷。owner 看到的是一個
 * 被兩個無關旋鈕污染過的數字，而**推導鏈的每一步都用它**。
 *
 * ⇒ 現在量**兩個空間**，⛔ 魔抗那一層**整層不再進入任何推導**：
 *
 *   | 空間 | 是什麼 | 誰在用 |
 *   |---|---|---|
 *   | **純基礎** | `championStatBase(卡, 屬性, 等級, 出貨env)` —— 只有成長曲線 | ⭐ owner 判斷用 |
 *   | **引擎最終** | 純基礎 × env 鏈 ＋ 基礎加成 | 引擎真的在打的血條 |
 *
 * ⚠️ **基礎加成不參與倍率**（owner #273：「初始HP/MP/AP 增加數值⋯**不參與倍率計算**」）
 * ⇒ 最終 = `base × mult + bonus`，⛔ **不是** `(base + bonus) × mult`。
 * 上一版把 3,442 當成一個「空間」就是踩到這個 —— 它是**混合量**，回乘差 +16.5%。
 *
 * ---------------------------------------------------------------------------
 * 產出
 * ---------------------------------------------------------------------------
 *   · packages/shared/src/content/balanceAnchorsDerived.ts —— 量到的中位數 + 兩個 env 輸入
 *   · docs/平衡錨點量測.md                                  —— 三個空間的對照表（owner / Codex 讀）
 *
 * ⚠️ 用的是**出貨** `combat-env.json` / `base-bonus.json`，⛔ 不是程式預設 ——
 * 兩者今天就不一樣（`agiToArmor` 0.15 vs 0.3），而引擎跑的是前者。
 * ⇒ owner 轉那兩格的任何一格，這一支 `--check` 就紅。**那是刻意的閘**：
 * 級距表整條推導鏈掛在它們上面，轉了而沒有重量 = 一張說謊的表。
 *
 * ⚠️ ⛔ 刻意**沒有產生日期**（同 `caps:export` / `spec:build` / `statcaps:build`）：
 * 任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationDocs,
} from "../../packages/shared/testkit/balancePopulation";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import {
  COMBAT_ENV_DEFAULTS,
  STAT_ENV_CHAIN,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../../packages/shared/src/sim/combatEnv";
import {
  ANCHOR_ROLE,
  BALANCE_ANCHOR_LEVELS,
  type BalanceAnchorLevel,
} from "../../packages/shared/src/content/balanceAnchors";
import {
  DAMAGE_TIER_NAMES,
  DAMAGE_TIERS_DOC_ID,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorFloorFrom,
  minTierStep,
  tierRatios,
  tierStep,
  tiersFromAnchor,
} from "../../packages/shared/src/content/damageTiers";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");

const DERIVED_TS = "packages/shared/src/content/balanceAnchorsDerived.ts";
const DOC_MD = "docs/平衡錨點量測.md";

// ------------------------------------------------------------------ inputs --
/** 出貨的戰鬥系統表 —— 引擎真的跑的那一份，⛔ 不是程式預設。 */
function shippedEnv(): CombatEnvMultipliers {
  const doc = JSON.parse(readFileSync(join(REPO, "content/config/combat-env.json"), "utf-8")) as {
    multipliers?: Record<string, number>;
  };
  return Object.freeze({
    ...COMBAT_ENV_DEFAULTS,
    ...(doc.multipliers ?? {}),
  }) as CombatEnvMultipliers;
}

/** 出貨的基礎加成 —— **倍率之外**的那一層扁平贈禮（owner #273）。 */
function shippedBaseBonus(): Readonly<Record<string, number>> {
  const doc = JSON.parse(readFileSync(join(REPO, "content/config/base-bonus.json"), "utf-8")) as {
    bonus?: Record<string, number>;
  };
  return Object.freeze({ ...(doc.bonus ?? {}) });
}

/**
 * 母體 = **對戰可選名單**（`balancePopulationIds`），⛔ 不是 `readdirSync(content/champions)`。
 *
 * ⚠️ 2026-08-21 以前這裡讀目錄 ⇒ 71 張卡，其中 **22 張是雜訊**（20 個變身態＝同一位
 * 英雄的第二張卡、`sela`/`thorne`＝fail-open 骨架佔位）。owner：「**錯誤的母體資料**」。
 * ⚠️ 這一行在 2026-08-21 之前寫著「與 `tools/stat-caps` **同一個**母體」——
 * 那句話現在是假的，而且**刻意**是假的（第三守則：註解會說謊，所以改它）。
 * 兩把尺量的是不同的東西：
 *   · **錨點**（這一支）＝「一位**玩家會選到**的英雄有多少血」→ 只算對戰可選本體。
 *   · **柵欄**（`tools/stat-caps`）＝「上限不可以夾到**引擎生得出來**的任何單位」
 *     → 一張都不能少，含變身態、含骨架。少算一張的代價是那一位被靜默夾住。
 */
function population(): Record<string, unknown>[] {
  return balancePopulationDocs(REPO);
}

const median = (xs: number[]): number => {
  const b = [...xs].sort((a, z) => a - z);
  return b.length === 0 ? 0 : b[b.length >> 1]!;
};

/** env 鏈在這條屬性上的乘積 —— 純基礎 → 引擎最終的那**一次**倍率。 */
function envChain(stat: Stat, env: CombatEnvMultipliers): number {
  let k = 1;
  for (const link of STAT_ENV_CHAIN[stat] ?? []) k *= statEnvFactor(link, env, undefined);
  return k;
}

// ----------------------------------------------------------------- compute --
const env = shippedEnv();
const bonus = shippedBaseBonus();
const pop = population();

const HP_MULT = envChain(Stat.MaxHealth, env);
const MP_MULT = envChain(Stat.MaxMana, env);
const HP_BONUS = bonus["maxHealth"] ?? 0;
const MP_BONUS = bonus["maxMana"] ?? 0;

/** 一位數小數 —— 逐位元組比對要一個穩定的字面表示（`2808.6000000000004` 不行）。 */
const q = (n: number): number => Math.round(n * 10) / 10;

const baseHp: Record<number, number> = {};
const baseMana: Record<number, number> = {};
for (const lv of BALANCE_ANCHOR_LEVELS) {
  baseHp[lv] = q(median(pop.map((d) => championStatBase(d as never, Stat.MaxHealth, lv, env))));
  baseMana[lv] = q(median(pop.map((d) => championStatBase(d as never, Stat.MaxMana, lv, env))));
}

const finalHp = (lv: BalanceAnchorLevel): number => q(baseHp[lv]! * HP_MULT + HP_BONUS);
const finalMana = (lv: BalanceAnchorLevel): number => q(baseMana[lv]! * MP_MULT + MP_BONUS);

// ⭐ 級距表用**這一輪剛量到的**數字算，⛔ 不是 `anchorFloor()`（那讀的是上一輪
//   寫進 `balanceAnchorsDerived.ts` 的量測 —— 會差一拍，而且 `--check` 要跑兩次才綠）。
const floorAt = (lv: BalanceAnchorLevel): number => anchorFloorFrom(baseHp[lv]!, HP_MULT, HP_BONUS);
const SMALLEST = floorAt(SHIPPED_ANCHOR_LEVEL);
const DAMAGE = tiersFromAnchor(SMALLEST);
/** 天花板：一發不可以秒殺 hard limit 那一級的中位英雄（**引擎最終**空間）。 */
const CEILING = Math.floor(finalHp(SHIPPED_ANCHOR_LEVEL));
const castsAt = (lv: BalanceAnchorLevel): number => finalHp(lv) / SMALLEST;
const RATIOS = tierRatios();

// ------------------------------------------------------------------- emit ---
const rec = (m: Record<number, number>): string =>
  BALANCE_ANCHOR_LEVELS.map((lv) => `  ${lv}: ${m[lv]},`).join("\n");

function derivedTs(): string {
  return `/**
 * ⚙️ **產生檔 —— ⛔ 不要手改。** \`pnpm anchors:build\` 重量，\`pnpm anchors:check\` 逐位元組驗。
 *
 * 三個錨點（LV${BALANCE_ANCHOR_LEVELS.join(" / LV")}）在**兩個空間**的中位數，母體＝
 * **${pop.length} 位對戰可選英雄**（${BALANCE_POPULATION_PROVENANCE}），量法走出貨管線
 * （\`championStatBase(卡, 屬性, 等級, 出貨 combat-env)\`）。
 * ⛔ 母體**不是** \`readdirSync(content/champions)\` —— 那是 71 張卡，含 20 個變身態
 * （同一位英雄的第二張卡 ⇒ 重複計數）與 2 張 fail-open 骨架佔位（owner 2026-08-21
 * 「**錯誤的母體資料**」）。
 *
 * ⛔ **魔抗減傷不在這裡，也不在任何下游推導裡**（owner 2026-08-20：
 * 「不要計算 HP 系統倍率以及魔抗減傷 **會讓我誤判**」）。它只對魔法傷害成立，
 * 拿它量物理技能就是用一把不適用的尺。
 *
 * ⚠️ 兩個 env 輸入是從**出貨 config** 讀出來的快照，⛔ 不是程式預設。
 * owner 轉了 \`combat-env.maxHealth\` 或 \`base-bonus.maxHealth\`，\`anchors:check\` 會紅 ——
 * 那是刻意的閘，因為傷害五級距整條推導鏈掛在它們上面。
 */

/** 純基礎空間的中位**最大生命** —— ⛔ 無系統倍率、⛔ 無初始加成、⛔ 無魔抗。 */
export const MEDIAN_BASE_HP: Readonly<Record<number, number>> = Object.freeze({
${rec(baseHp)}
});

/** 純基礎空間的中位**最大魔力** —— 同上三個⛔。 */
export const MEDIAN_BASE_MANA: Readonly<Record<number, number>> = Object.freeze({
${rec(baseMana)}
});

/** \`combat-env\` 在最大生命上的 env 鏈乘積（出貨值的快照）。 */
export const HP_ENV_MULT = ${HP_MULT};
/** \`combat-env\` 在最大魔力上的 env 鏈乘積（出貨值的快照）。 */
export const MANA_ENV_MULT = ${MP_MULT};
/** \`base-bonus.maxHealth\` —— **倍率之外**的扁平贈禮（owner #273「不參與倍率計算」）。 */
export const HP_BASE_BONUS = ${HP_BONUS};
/** \`base-bonus.maxMana\` —— 同上。 */
export const MANA_BASE_BONUS = ${MP_BONUS};
`;
}

/**
 * 出貨的傷害五級距文件。⭐ **五個數字由這一支寫**，⛔ 沒有一個是手打的。
 *
 * ⚠️ `enabled` 從現有檔案**沿用** —— 那是 owner 的一鍵 rollback 開關，
 * ⛔ 產生器不可以替他把它翻回來。
 */
function damageTiersJson(): string {
  let enabled = true;
  try {
    const have = JSON.parse(
      readFileSync(join(REPO, `content/config/${DAMAGE_TIERS_DOC_ID}.json`), "utf-8"),
    ) as { enabled?: unknown };
    if (typeof have.enabled === "boolean") enabled = have.enabled;
  } catch {
    /* 第一次產生：預設開著（第〇·六守則「優先權大的更新後都是預設啟動」）。 */
  }
  const ladder = DAMAGE_TIER_NAMES.map((n) => `${n} ${DAMAGE[n]}`).join(" / ");
  const rates = BALANCE_ANCHOR_LEVELS.map(
    (lv) =>
      `LV${lv} ${castsAt(lv).toFixed(1)} 發 ${castsAt(lv) <= KILL_CASTS_REF ? "✅" : "❌"}`,
  ).join(" · ");
  const note =
    `傷害**五級距**（GH#447）—— 四軸裡唯一的**回報**軸。⭐ **這五個數字是 \`pnpm anchors:build\` 寫的，⛔ 不要手改**（改了 \`anchors:check\` 會紅）。` +
    `⛔ **2026-08-20 第二次重錨**：owner 逐字更正兩件事 ——「**🅲 保留倍率，但把它從錨點推導裡剝掉**」與「**我的建議是拿 30 級的當標準就好**」，` +
    `外加「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」。⇒ ① 錨點空間從「中位**有效**血量」（含魔抗）換成「中位**純基礎**血量」，魔抗那一層**整層退場**；` +
    `② 出貨錨**就是 hard limit LV${SHIPPED_ANCHOR_LEVEL}**，⛔ 不再是「滿足得了的最高那一個」（那條規則會挑到 LV50）。` +
    `⭐ **2026-08-21 第三次重錨（母體）**：owner 逐字「**錯誤的母體資料**」⇒ 中位數的母體從 \`readdirSync(content/champions)\`（71 張卡，含 20 個變身態＋2 張 fail-open 骨架佔位）` +
    `換成 **${pop.length} 位對戰可選英雄**（${BALANCE_POPULATION_PROVENANCE}）。變身態是同一位英雄的第二張卡，放進去就是重複計數。` +
    `⭐ 推導鏈（四個輸入全部在別處，這裡一個字面值都沒有）：\`純基礎中位 ${baseHp[SHIPPED_ANCHOR_LEVEL]} ÷ ${KILL_CASTS_REF} 發 × HP 倍率 ${HP_MULT} ＋ 初始加成 ${HP_BONUS} ÷ ${KILL_CASTS_REF} 發\` ` +
    `= ${(((baseHp[SHIPPED_ANCHOR_LEVEL]! / KILL_CASTS_REF) * HP_MULT + HP_BONUS / KILL_CASTS_REF)).toFixed(1)} → 進位到 ${tierStep()}（「使五格皆整數的最小單位」${minTierStep()} 的整數倍）⇒ **${SMALLEST}**。` +
    `⚠️ **初始加成不參與倍率**（owner #273）—— 算式是 \`base × ${HP_MULT} + ${HP_BONUS}\`，⛔ **不是** \`(base + ${HP_BONUS}) × ${HP_MULT}\`；上一版把它折進「基礎」再回乘，差 **+16.5%**，那不是量測誤差是算術錯誤。` +
    `② 其餘四格 ＝ 極小 × 單體冷卻比（${DAMAGE_TIER_NAMES.map((n) => RATIOS[n]).join(" : ")}），**與冷卻表嚴格成正比** —— 那正是 owner Q4「已經有傷害相應的冷卻跟耗魔做限制」的意思。` +
    `⇒ 五格 **${ladder}**，五格全整數。⭐ 三個錨點的達成率（打死該級中位英雄要幾發極小，門檻 ${KILL_CASTS_REF} 發，分母是**引擎最終**血量 ${BALANCE_ANCHOR_LEVELS.map((lv) => finalHp(lv)).join(" / ")}）：${rates}。` +
    `⚠️ LV50/LV99 的缺口**不是這張表調得掉的**：血量比傷害長得快，那要動的是成長曲線。` +
    `⚠️ 天花板 ${CEILING} ＝ LV${SHIPPED_ANCHOR_LEVEL} 的引擎最終中位血量 —— 一發不可以秒殺 hard limit 那一級的中位英雄；極大 ${DAMAGE[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!]} 是它的 ` +
    `${((DAMAGE[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!] / CEILING) * 100).toFixed(0)}%。` +
    `⭐ 只有**一張**表：形狀的代價整個住在冷卻軸上（範圍表比單體貴 2–5×），再在傷害軸打一次折就是同一個懲罰收兩次。` +
    `技能 JSON 在 amount 裡填 damageTier，⛔ 不填 flat/perRank（級距會取代它們）。`;
  const doc = {
    id: DAMAGE_TIERS_DOC_ID,
    schema: "config.damage-tiers@1",
    note,
    enabled,
    damage: Object.fromEntries(DAMAGE_TIER_NAMES.map((n) => [n, DAMAGE[n]])),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function docMd(): string {
  const L: string[] = [];
  L.push("# 平衡錨點量測（GH#447）");
  L.push("");
  L.push("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**");
  L.push(">");
  L.push("> ```bash");
  L.push("> pnpm anchors:build     # 重量");
  L.push("> pnpm anchors:check     # 唯讀：過期就回非零");
  L.push("> ```");
  L.push(">");
  L.push("> owner 2026-08-20（逐字裁決）：");
  L.push("> 「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 為什麼要分「空間」");
  L.push("");
  L.push("一隻英雄的血量在三個地方是三個不同的數字。把它們混成一個，就會出現");
  L.push("「同一個數字被兩個無關的後台旋鈕污染」——而**整條傷害級距推導鏈都用它**。");
  L.push("");
  L.push("| 空間 | 裡面含什麼 | 誰在用 |");
  L.push("|---|---|---|");
  L.push("| **純基礎** | 英雄卡的成長曲線本身 | ⭐ owner 判斷用 |");
  L.push(
    `| **引擎最終** | 純基礎 × ${HP_MULT}（\`combat-env.maxHealth\`）＋ ${HP_BONUS}（\`base-bonus.maxHealth\`） | 引擎真的在打的血條 |`,
  );
  L.push("| ~~有效~~ | ~~再除掉魔抗減傷~~ | ⛔ **已退場** —— 只對魔法傷害成立 |");
  L.push("");
  L.push("⚠️ **初始加成不參與倍率**（owner #273）⇒ 換算式是");
  L.push("");
  L.push("```");
  L.push(`引擎最終 = 純基礎 × ${HP_MULT} + ${HP_BONUS}     ⛔ 不是 (純基礎 + ${HP_BONUS}) × ${HP_MULT}`);
  L.push("```");
  L.push("");
  L.push("---");
  L.push("");
  L.push(`## 量到的（母體＝**${pop.length} 位對戰可選英雄**，裸裝）`);
  L.push("");
  L.push(`> 母體來源：\`${BALANCE_POPULATION_PROVENANCE}\`。`);
  L.push("> ⛔ **不是** `content/champions` 的檔案數 —— 那含變身態（同一位英雄的第二張卡）");
  L.push("> 與 fail-open 骨架佔位，會把中位數往有變身的人拉（owner 2026-08-21「錯誤的母體資料」）。");
  L.push("");
  L.push("| 錨點 | 身分 | 純基礎 HP | 引擎最終 HP | 純基礎 MP | 引擎最終 MP |");
  L.push("|---|---|---:|---:|---:|---:|");
  for (const lv of BALANCE_ANCHOR_LEVELS) {
    L.push(
      `| **LV${lv}** | ${ANCHOR_ROLE[lv]} | ${baseHp[lv]!.toLocaleString()} | ` +
        `**${finalHp(lv).toLocaleString()}** | ${baseMana[lv]!.toLocaleString()} | ` +
        `${finalMana(lv).toLocaleString()} |`,
    );
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 這兩個 env 輸入是**出貨值的快照**");
  L.push("");
  L.push("| 輸入 | 出處 | 值 |");
  L.push("|---|---|---:|");
  L.push(`| 最大生命 env 鏈 | \`content/config/combat-env.json\` | ${HP_MULT} |`);
  L.push(`| 最大魔力 env 鏈 | \`content/config/combat-env.json\` | ${MP_MULT} |`);
  L.push(`| 初始生命加成 | \`content/config/base-bonus.json\` | ${HP_BONUS} |`);
  L.push(`| 初始魔力加成 | \`content/config/base-bonus.json\` | ${MP_BONUS} |`);
  L.push("");
  L.push("⇒ 轉了其中任何一格而沒有跑 `pnpm anchors:build`，`anchors:check` 會**紅並指名**。");
  L.push("那是刻意的：傷害五級距整條推導鏈掛在這四個數字上。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ⭐ 傷害五級距的推導鏈（`content/config/damage-tiers.json` 由這一支寫）");
  L.push("");
  L.push("```");
  L.push(`純基礎中位(LV${SHIPPED_ANCHOR_LEVEL}) ${baseHp[SHIPPED_ANCHOR_LEVEL]}`);
  L.push(`  ÷ ${KILL_CASTS_REF} 發                     ← owner Q1「20 次以內一定要能殺死對方」`);
  L.push(`  × HP 倍率 ${HP_MULT}                    ← combat-env.maxHealth`);
  L.push(
    `  + 初始加成 ${HP_BONUS} ÷ ${KILL_CASTS_REF} 發        ← base-bonus.maxHealth，⛔ 不參與倍率（owner #273）`,
  );
  L.push(
    `  = ${(((baseHp[SHIPPED_ANCHOR_LEVEL]! / KILL_CASTS_REF) * HP_MULT + HP_BONUS / KILL_CASTS_REF)).toFixed(2)}`,
  );
  L.push(
    `  → 進位到 ${tierStep()}（「使五格皆整數的最小單位」= ${minTierStep()}，粒度取它的整數倍）`,
  );
  L.push(`  = 極小 ${SMALLEST}`);
  L.push("```");
  L.push("");
  L.push(`⇒ 五格 ＝ 極小 × 單體冷卻比 **${DAMAGE_TIER_NAMES.map((n) => RATIOS[n]).join(" : ")}**：`);
  L.push("");
  L.push(`| 級距 | ${DAMAGE_TIER_NAMES.join(" | ")} |`);
  L.push(`|---|${DAMAGE_TIER_NAMES.map(() => "---:").join("|")}|`);
  L.push(`| **傷害** | ${DAMAGE_TIER_NAMES.map((n) => `**${DAMAGE[n]}**`).join(" | ")} |`);
  L.push(
    `| 佔 LV${SHIPPED_ANCHOR_LEVEL} 血條 | ${DAMAGE_TIER_NAMES.map((n) => `${((DAMAGE[n] / finalHp(SHIPPED_ANCHOR_LEVEL)) * 100).toFixed(1)}%`).join(" | ")} |`,
  );
  L.push("");
  L.push("## 三個錨點的達成率");
  L.push("");
  L.push(`「打死該級中位英雄要幾發**極小**」，門檻 ${KILL_CASTS_REF} 發（owner Q1）。`);
  L.push("");
  L.push("| 錨點 | 身分 | 引擎最終血量 | 要幾發 | 達成 | 這一級自己要求的極小 |");
  L.push("|---|---|---:|---:|---|---:|");
  for (const lv of BALANCE_ANCHOR_LEVELS) {
    const n = castsAt(lv);
    L.push(
      `| **LV${lv}** | ${ANCHOR_ROLE[lv]} | ${finalHp(lv).toLocaleString()} | ${n.toFixed(1)} | ` +
        `${n <= KILL_CASTS_REF ? "✅" : "❌"} | ${floorAt(lv).toLocaleString()} |`,
    );
  }
  L.push("");
  L.push(
    `⚠️ 出貨錨是 **LV${SHIPPED_ANCHOR_LEVEL}**（owner 2026-08-20：「**我的建議是拿 30 級的當標準就好**，` +
      "因為技能通常還有 AP 加成那塊沒算到」）—— ⛔ **不是**「滿足得了的最高那一個」，那條規則會挑到 LV50。",
  );
  L.push("");
  L.push(
    `⚠️ 天花板 **${CEILING.toLocaleString()}** ＝ LV${SHIPPED_ANCHOR_LEVEL} 的引擎最終中位血量：一發不可以秒殺 hard limit 那一級的中位英雄。` +
      `極大 ${DAMAGE[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!].toLocaleString()} 是它的 ` +
      `**${((DAMAGE[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!] / CEILING) * 100).toFixed(0)}%**。`,
  );
  L.push("");
  return L.join("\n");
}

// ------------------------------------------------------------------ write ---
const outputs: [string, string][] = [
  [DERIVED_TS, derivedTs()],
  [`content/config/${DAMAGE_TIERS_DOC_ID}.json`, damageTiersJson()],
  [DOC_MD, docMd()],
];

let stale = 0;
for (const [rel, want] of outputs) {
  const abs = join(REPO, rel);
  let have = "";
  try {
    have = readFileSync(abs, "utf-8");
  } catch {
    have = "";
  }
  if (have === want) continue;
  stale++;
  if (CHECK) {
    console.error(`✗ 過期：${rel}`);
  } else {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, want, "utf-8");
    console.log(`✔ 寫入 ${rel}`);
  }
}

const summary = `母體 ${pop.length} 張卡 · 純基礎 LV${BALANCE_ANCHOR_LEVELS[0]} 中位 ${baseHp[BALANCE_ANCHOR_LEVELS[0]]} · 引擎最終 ${finalHp(BALANCE_ANCHOR_LEVELS[0])}`;
if (CHECK) {
  if (stale > 0) {
    console.error(`\n${stale} 份產物過期 —— 跑 \`pnpm anchors:build\` 然後 git add。`);
    process.exit(1);
  }
  console.log(`✔ anchors 產物都是最新的（${summary}）`);
} else if (stale === 0) {
  console.log(`✔ 已經是最新的（${summary}）`);
}

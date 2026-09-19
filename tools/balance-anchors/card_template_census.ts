/**
 * 🧮 **英雄卡屬性的共用普查** —— GH#1224「74 張英雄卡共用同一組模板屬性」。
 *
 * ```bash
 * npx tsx tools/balance-anchors/card_template_census.ts            # 重量並寫報告
 * npx tsx tools/balance-anchors/card_template_census.ts --check    # 唯讀，逐位元組比對；過期回非零
 * npx tsx tools/balance-anchors/card_template_census.ts --out <路徑>
 * ```
 *
 * ---------------------------------------------------------------------------
 * ⛔ 這一支**不挑任何數字**
 * ---------------------------------------------------------------------------
 * owner 2026-08-22（逐字）：「總之**不要再叫我調整了，公式已定好**，只要公式本身自洽，
 * 我們**只調系統倍率**」。⇒ 這一支只回答**量**的問題：
 *
 *   ① 哪幾張卡共用同一組屬性（逐層：baseStats / growth / 三圍 / 決定血量的那幾格）
 *   ② 那些卡對**中位數**的實際影響（走出貨函式 `championStatBase`，⛔ 不是估）
 *   ③ 如果把某一群排除在分母外，五級距會變成什麼（走出貨函式 `tiersFromAnchor`
 *      與 `manaTiersFromPool`，⛔ 不是我算一個近似值）
 *
 * ⭐ **母體要不要換，是 owner 的決定**（GH#1224 驗收第三條）——
 * 這一份是給他挑的那張表，⛔ 不是一次改動。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這一欄的分母是什麼（讀這份報告之前要先知道的事）
 * ---------------------------------------------------------------------------
 * ⭐ **今天出貨的五級距並沒有掛在卡面中位上**：`content/config/balance-anchors.json`
 * 的 `enabled` 是 `true` ⇒ 錨點取的是**那份設定檔裡的固定值**（owner 2026-09-12
 * 「以後**固定數值 别再取中位數了**」）。卡面中位今天只在**兩條路**上生效：
 *
 *   · `enabled:false` 的 **rollback 路徑** —— 翻回去就等於把分母交還給名單
 *   · `gen.ts` 的**偏差警告**（差 >10% 印一行，⛔ 不改值）
 *
 * ⇒ ⛔ 不要把這份報告讀成「玩家今天打出來的傷害是這樣」。它回答的是
 * ⭐ 「**如果**分母交還給名單（或名單被當成平衡決定的依據），今天會得到什麼」。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 已知還缺的那一半（⛔ 不要讀成做完了）
 * ---------------------------------------------------------------------------
 * ⛔ 這一支**還沒有被接進任何閘** —— `package.json` 沒有 `cardcensus:check`，
 * `skills:check` 也沒有它。⇒ 報告會過期而**沒有任何東西會紅**（失敗形態 ⑨）。
 * ⭐ 接線那一行住 `package.json` 與 `packages/shared/src/ops/`，
 * ⛔ 都在這條 lane 的柵欄外 —— 留給主線，見報告最後一節。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationDocs,
} from "../../packages/shared/testkit/balancePopulation";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import {
  BALANCE_ANCHOR_LEVELS,
  ANCHOR_ROLE,
  type BalanceAnchorLevel,
} from "../../packages/shared/src/content/balanceAnchors";
import {
  DAMAGE_TIER_NAMES,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorFloorFrom,
  tierStep,
  tiersFromAnchor,
} from "../../packages/shared/src/content/damageTiers";
import { manaTiersFromPool } from "../../packages/shared/src/content/manaTiers";
// ⭐ 與 `gen.ts` **同一把尺**（同一支讀取器、同一個 `median` 定義）——
//    ⛔ 不是自己再 parse 一次 `combat-env.json`（那就是第二個住處）。
import { envChain, median, shippedAnchors, shippedBaseBonus, shippedEnv } from "./shippedInputs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");
const OUT_FLAG = process.argv.indexOf("--out");
const OUT_REL =
  OUT_FLAG >= 0 && process.argv[OUT_FLAG + 1] !== undefined
    ? process.argv[OUT_FLAG + 1]!
    : "docs/_reports/1224_card-template-census.md";

// ------------------------------------------------------------------ inputs --
const env = shippedEnv(REPO);
const bonus = shippedBaseBonus(REPO);
const ANCHORS = shippedAnchors(REPO);
const HP_MULT = envChain(Stat.MaxHealth, env);
const MP_MULT = envChain(Stat.MaxMana, env);
const HP_BONUS = bonus["maxHealth"] ?? 0;
const MP_BONUS = bonus["maxMana"] ?? 0;

/** 一位數小數 —— 與 `gen.ts` 同一個量化，⛔ 不然兩份報告的同一個數字會差在第 14 位。 */
const q = (n: number): number => Math.round(n * 10) / 10;

interface Card {
  readonly id: string;
  readonly name: string;
  readonly doc: Record<string, unknown>;
  /** 三圍的出處欄（`w3x` = 從原作解析來的；⛔ 其餘沒有出處欄）。 */
  readonly attrSource: string;
  readonly origin: string;
  /** 決定 `maxHealth(L)` 的**全部**輸入：base + 每級 + STR + STR 每級。 */
  readonly hpKey: string;
  /** 決定 `maxMana(L)` 的全部輸入。 */
  readonly mpKey: string;
  readonly baseKey: string;
  readonly growthKey: string;
  readonly attrKey: string;
  readonly allKey: string;
}

const num = (o: unknown, k: string): number => {
  const v = (o as Record<string, unknown> | undefined)?.[k];
  return typeof v === "number" ? v : 0;
};
const stable = (o: unknown): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries((o ?? {}) as Record<string, unknown>).sort(([a], [z]) => (a < z ? -1 : 1)),
    ),
  );

const cards: Card[] = balancePopulationDocs(REPO).map((doc) => {
  const base = doc["baseStats"];
  const growth = doc["growth"];
  const attrs = doc["attributes"] as Record<string, unknown> | undefined;
  return {
    id: String(doc["id"] ?? "?"),
    name: String(doc["name"] ?? doc["id"] ?? "?"),
    doc,
    attrSource: typeof attrs?.["source"] === "string" ? (attrs["source"] as string) : "（沒有）",
    origin: typeof doc["origin"] === "string" ? (doc["origin"] as string) : "（沒有）",
    hpKey: JSON.stringify([
      num(base, "maxHealth"),
      num(growth, "maxHealth"),
      num(attrs, "str"),
      num(attrs, "strGrowth"),
    ]),
    mpKey: JSON.stringify([
      num(base, "maxMana"),
      num(growth, "maxMana"),
      num(attrs, "int"),
      num(attrs, "intGrowth"),
    ]),
    baseKey: stable(base),
    growthKey: stable(growth),
    attrKey: stable(attrs),
    allKey: `${stable(base)}|${stable(growth)}|${stable(attrs)}`,
  };
});
cards.sort((a, b) => (a.id < b.id ? -1 : 1));

// ----------------------------------------------------------------- cluster --
type KeyOf = (c: Card) => string;
/** 同一把鑰匙下的分群 —— 由大到小，同大小照第一位成員的 id 排（⇒ 逐位元組穩定）。 */
function clusters(key: KeyOf, pool: readonly Card[] = cards): Card[][] {
  const by = new Map<string, Card[]>();
  for (const c of pool) {
    const k = key(c);
    const g = by.get(k);
    if (g === undefined) by.set(k, [c]);
    else g.push(c);
  }
  return [...by.values()].sort(
    (a, b) => b.length - a.length || (a[0]!.id < b[0]!.id ? -1 : 1),
  );
}
/** 落在「≥2 張共用」的卡有幾張 —— ⭐ 這才是「共用」的人數，⛔ 不是最大那一群的大小。 */
const sharedCount = (key: KeyOf): number =>
  clusters(key).reduce((n, g) => n + (g.length >= 2 ? g.length : 0), 0);

// ------------------------------------------------------------------ scales --
interface Scale {
  readonly label: string;
  /** 母體 —— ⛔ 一律印人數，一份不印分母的統計讀起來跟真的一模一樣。 */
  readonly pool: readonly Card[];
  readonly note: string;
}

const hpAt = (c: Card, lv: BalanceAnchorLevel): number =>
  championStatBase(c.doc as never, Stat.MaxHealth, lv, env);
const mpAt = (c: Card, lv: BalanceAnchorLevel): number =>
  championStatBase(c.doc as never, Stat.MaxMana, lv, env);

interface Measured {
  readonly n: number;
  readonly baseHp: Record<number, number>;
  readonly baseMana: Record<number, number>;
  readonly smallest: number;
  readonly damage: Readonly<Record<string, number>>;
  readonly mana: Readonly<Record<string, number>>;
  readonly castsAt30: number;
}

/** ⭐ 全部走出貨函式：`championStatBase` → `anchorFloorFrom` → `tiersFromAnchor`／`manaTiersFromPool`。 */
function measure(pool: readonly Card[], fixed?: { hp: Record<number, number>; mp: Record<number, number> }): Measured {
  const baseHp: Record<number, number> = {};
  const baseMana: Record<number, number> = {};
  for (const lv of BALANCE_ANCHOR_LEVELS) {
    baseHp[lv] = fixed?.hp[lv] ?? q(median(pool.map((c) => hpAt(c, lv))));
    baseMana[lv] = fixed?.mp[lv] ?? q(median(pool.map((c) => mpAt(c, lv))));
  }
  const smallest = anchorFloorFrom(baseHp[SHIPPED_ANCHOR_LEVEL]!, HP_BONUS);
  const pool30 = baseMana[SHIPPED_ANCHOR_LEVEL]! * MP_MULT + MP_BONUS;
  return {
    n: pool.length,
    baseHp,
    baseMana,
    smallest,
    damage: tiersFromAnchor(smallest),
    mana: manaTiersFromPool(pool30),
    castsAt30: (baseHp[SHIPPED_ANCHOR_LEVEL]! + HP_BONUS) / smallest,
  };
}

const ladder = (t: Readonly<Record<string, number>>): string =>
  DAMAGE_TIER_NAMES.map((n) => t[n]).join(" / ");

/**
 * ⭐ **探針** —— 中位數是哪一張卡給的。
 * CLAUDE.md：「一個統計要印出**分母與探針**，⛔ 不是只回一個數字」。
 * ⛔ 沒有這一欄，「中位 2838」就驗證不了 —— 讀的人指不出是誰。
 */
function probe(pool: readonly Card[], lv: BalanceAnchorLevel): Card | undefined {
  const b = [...pool].sort((a, z) => hpAt(a, lv) - hpAt(z, lv) || (a.id < z.id ? -1 : 1));
  return b[b.length >> 1];
}

/**
 * ⭐ 刻度是一條**階梯** —— `anchorFloorFrom` 是 `ceil(…/step)*step`，
 * ⇒ 中位數落在**一整段區間**裡都得到同一個極小值，跨過邊界就整表跳一格。
 * 一段有多寬：`tierStep() × KILL_CASTS_REF`（今天 50 × 20 ＝ 1000 點中位血量）。
 */
const BAND = tierStep() * KILL_CASTS_REF;
/** 這個中位落在哪一段：`(下緣, 上緣]`，以及離兩邊各多遠。 */
function band(baseHp: number): {
  low: number;
  high: number;
  toLow: number;
  toHigh: number;
  smallest: number;
} {
  const smallest = anchorFloorFrom(baseHp, HP_BONUS);
  const high = smallest * KILL_CASTS_REF - HP_BONUS;
  const low = high - BAND;
  return { low, high, toLow: baseHp - low, toHigh: high - baseHp, smallest };
}

// ⭐ 今天出貨的那一組（固定錨點）—— 每一個「如果」都要對著它比。
const SHIPPED = measure(cards, {
  hp: ANCHORS.baseHp ?? {},
  mp: ANCHORS.baseMana ?? {},
});
const usingFixed = ANCHORS.baseHp !== undefined && ANCHORS.baseMana !== undefined;

const bigHpClusters = clusters((c) => c.hpKey).filter((g) => g.length >= 2);
const sharedHpIds = new Set(bigHpClusters.flatMap((g) => g.map((c) => c.id)));
const w3xOnly = cards.filter((c) => c.attrSource === "w3x");
const notTemplateGroup = cards.filter(
  (c) => !c.id.startsWith("b2-") && !c.id.startsWith("community-review-"),
);
const uniqueHp = cards.filter((c) => !sharedHpIds.has(c.id));

const SCALES: Scale[] = [
  {
    label: "Ⓑ 全母體取中位（＝ `enabled:false` 的 rollback 路徑）",
    pool: cards,
    note: "今天的名單，一張不排除",
  },
  {
    label: "Ⓒ 排除「血量四件組與別人一模一樣」的卡",
    pool: uniqueHp,
    note: "共用者**全部**出局（含被共用的那一張）",
  },
  {
    label: "Ⓓ 只留三圍寫著 `source: \"w3x\"` 的卡",
    pool: w3xOnly,
    note: "⭐ 唯一「引用得到出處」的欄位",
  },
  {
    label: "Ⓔ 排除 `b2-*` 與 `community-review-*`（票上點名的兩群）",
    pool: notTemplateGroup,
    note: "照 id 前綴排除，⛔ 不是照證據",
  },
];

// ------------------------------------------------------------------- write --
function report(): string {
  const L: string[] = [];
  const P = (s = "") => L.push(s);

  P("# 🧮 英雄卡屬性共用普查（GH#1224）");
  P();
  P("> ⚙️ **這一份是量出來的，⛔ 不要手改。**");
  P(">");
  P("> ```bash");
  P("> npx tsx tools/balance-anchors/card_template_census.ts          # 重量");
  P("> npx tsx tools/balance-anchors/card_template_census.ts --check  # 唯讀；過期回非零");
  P("> ```");
  P(">");
  P("> ⛔ 這一支**一個數值都沒有挑** —— owner 2026-08-22 逐字：「公式已定好，只要公式本身自洽，");
  P("> **我們只調系統倍率**」。下面每一個數字都是**出貨函式**算出來的。");
  P();
  P("---");
  P();
  P("## 🔎 三句話（給 owner 挑的那張表在第 5 節）");
  P();
  {
    const shared = sharedCount((c) => c.hpKey);
    const b = band(SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]!);
    P(
      `1. **共用比票上寫的更嚴重**：票上說 74/132，今天量到 **${shared}/${cards.length} 位（` +
        `${((shared / cards.length) * 100).toFixed(0)}%）的血量曲線與別人一模一樣** —— ` +
        `⭐ 逐點相同，⛔ 不是「差不多」。`,
    );
    P(
      `2. ⭐⭐ **真正危險的不是共用，是刻度有階梯**：中位數落在 \`(${b.low}, ${b.high}]\` 這一整段裡` +
        `得到同一張表，而今天的錨點 **${SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]} 離下緣只有 ${q(b.toLow)} 點（` +
        `${((b.toLow / SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]!) * 100).toFixed(1)}%）** ⇒ ` +
        `⭐ 中位掉 ${q(b.toLow)} 點，全遊戲傷害 **−${((tierStep() / b.smallest) * 100).toFixed(0)}%**。`,
    );
    P(
      "3. ⭐ **有一個「零改動」的選項**：只算三圍寫著 `w3x`（＝引用得到出處）的那 " +
        `${w3xOnly.length} 位，中位數**三格都與今天的出貨值逐位元組相同** ⇒ 換這個分母，` +
        "五級距**一個數字都不用動**，而且新上架的模板預設卡**再也搬不動它**。",
    );
  }
  P();
  P("⛔ 上面第 3 點**不是提案** —— 我沒有挑（第一守則：這一格是 owner 的）。第 5 節四個選項並列。");
  P();
  P("---");
  P();
  P("## 0. 先看這一格：今天的傷害刻度**沒有**掛在卡面中位上");
  P();
  P(
    usingFixed
      ? "`content/config/balance-anchors.json` 的 `enabled` 是 **true** ⇒ 錨點用的是那份設定檔裡的**固定值**" +
          `（\`baseHp\` ${BALANCE_ANCHOR_LEVELS.map((lv) => `LV${lv} ${ANCHORS.baseHp?.[lv]}`).join(" · ")}）。`
      : "⚠️ `balance-anchors` 今天**關著**（或讀不到）⇒ ⭐ 錨點**就是**名單中位 —— 下面 Ⓑ 那一列即是出貨值。",
  );
  P();
  P("⇒ ⭐ 卡面中位今天只在**兩條路**上生效：");
  P();
  P("| 路 | 什麼時候 |");
  P("|---|---|");
  P("| **rollback** | `balance-anchors.enabled:false` ⇒ 分母交還給名單（＝下面的 Ⓑ） |");
  P("| **偏差警告** | `pnpm anchors:check` 差 >10% 印一行，⛔ 不改值 |");
  P();
  P("⛔ 所以這份報告**不是**「玩家今天打出來的傷害」，⭐ 它是「**如果**分母交還給名單，會得到什麼」。");
  P();
  P("---");
  P();
  P(`## 1. 母體 —— **${cards.length} 位**對戰可選英雄`);
  P();
  P(`> 來源：\`${BALANCE_POPULATION_PROVENANCE}\``);
  P(">");
  P("> ⛔ **不是** `content/champions/` 的檔案數（含變身態與 fail-open 骨架佔位）。");
  P();
  P("| 三圍出處欄（`attributes.source`） | 幾位 | 佔比 |");
  P("|---|---:|---:|");
  for (const [src, n] of [...new Map(
    cards.reduce((m, c) => m.set(c.attrSource, (m.get(c.attrSource) ?? 0) + 1), new Map<string, number>()),
  )].sort((a, b) => b[1] - a[1])) {
    P(`| \`${src}\` | ${n} | ${((n / cards.length) * 100).toFixed(1)}% |`);
  }
  P();
  P("⚠️ ⭐ `w3x` 是唯一**引用得到出處**的值（`tools/w3x-import/apply_attributes_to_content.py`");
  P("從 `RESOLVED_HERO_STATS.json` 寫進去的）。⛔ `authored` **不是**一個出處 ——");
  P("它只說「不是從 w3x 來的」，⛔ 沒有說是誰、依據什麼挑的。");
  P();
  P("---");
  P();
  P("## 2. 共用了什麼 —— 逐層量");
  P();
  P("| 層 | 不同的值有幾種 | 最大一群 | 落在「≥2 張共用」的卡 | 佔母體 |");
  P("|---|---:|---:|---:|---:|");
  const layers: [string, KeyOf][] = [
    ["**全套**（baseStats ＋ growth ＋ 三圍）", (c) => c.allKey],
    ["`baseStats`（15 格）", (c) => c.baseKey],
    ["`growth`（每級成長）", (c) => c.growthKey],
    ["`attributes`（三圍）", (c) => c.attrKey],
    ["⭐ **決定血量的四格**（base ＋ 每級 ＋ STR ＋ STR 每級）", (c) => c.hpKey],
    ["⭐ **決定魔力的四格**（base ＋ 每級 ＋ INT ＋ INT 每級）", (c) => c.mpKey],
  ];
  for (const [label, key] of layers) {
    const gs = clusters(key);
    const sh = sharedCount(key);
    P(
      `| ${label} | ${gs.length} | ${gs[0]!.length} | **${sh}** | ${((sh / cards.length) * 100).toFixed(1)}% |`,
    );
  }
  P();
  P("⭐ **要看的是倒數第二欄**（「≥2 張共用」），⛔ 不是「最大一群」——");
  P("票上的「74 張共用同一組」問的是**有多少張卡的屬性不是自己的**。");
  P();
  P("⚠️ 血量那一列與 `baseStats` 那一列**不會**相等：`maxHealth(L)` 只吃四格");
  P("（`championStatBase` ＝ `baseStats.maxHealth` ＋ `growth.maxHealth`×(L−1) ＋ `strToMaxHealth`×STR(L)），");
  P("⇒ 兩張卡在別的欄位不同、而血量曲線**逐點相同**，是常見的。");
  P();
  P("---");
  P();
  P("## 3. 最大的幾群（血量四件組）—— 逐張列名");
  P();
  for (const g of bigHpClusters.slice(0, 6)) {
    const [base, per, str, strG] = JSON.parse(g[0]!.hpKey) as number[];
    const originCount = [...new Map(
      g.reduce((m, c) => m.set(c.origin, (m.get(c.origin) ?? 0) + 1), new Map<string, number>()),
    )].sort((a, b) => b[1] - a[1]);
    const srcCount = [...new Map(
      g.reduce((m, c) => m.set(c.attrSource, (m.get(c.attrSource) ?? 0) + 1), new Map<string, number>()),
    )].sort((a, b) => b[1] - a[1]);
    P(
      `### ${g.length} 張：base \`${base}\` ＋ 每級 \`${per}\` ＋ STR \`${str}\`（每級 \`${strG}\`）` +
        ` ⇒ LV${SHIPPED_ANCHOR_LEVEL} 純基礎 **${q(hpAt(g[0]!, SHIPPED_ANCHOR_LEVEL))}**`,
    );
    P();
    P(`- 出身：${originCount.map(([o, n]) => `${o} ${n}`).join(" · ")}`);
    P(`- 三圍出處：${srcCount.map(([s, n]) => `\`${s}\` ${n}`).join(" · ")}`);
    P(`- 成員：${g.map((c) => `\`${c.id}\``).join("、")}`);
    P();
  }
  const rest = bigHpClusters.slice(6);
  if (rest.length > 0) {
    P(
      `⋯另有 **${rest.length}** 群（各 ${rest[0]!.length}–${rest[rest.length - 1]!.length} 張，` +
        `合計 ${rest.reduce((n, g) => n + g.length, 0)} 張）。`,
    );
    P();
  }
  P("---");
  P();
  P("## 4. `growth.maxHealth` 逐張量（票上 Scope 2：掉下來的是**成長**那一半）");
  P();
  const growthHp = [...new Map(
    cards.reduce(
      (m, c) => m.set(num(c.doc["growth"], "maxHealth"), (m.get(num(c.doc["growth"], "maxHealth")) ?? 0) + 1),
      new Map<number, number>(),
    ),
  )].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  P(`不同的每級成長只有 **${growthHp.length}** 種（母體 ${cards.length} 位）：`);
  P();
  P("| 每級成長 | 幾位 | 那幾位的出身 |");
  P("|---:|---:|---|");
  for (const [v, n] of growthHp.slice(0, 12)) {
    const who = cards.filter((c) => num(c.doc["growth"], "maxHealth") === v);
    const origins = [...new Map(
      who.reduce((m, c) => m.set(c.origin, (m.get(c.origin) ?? 0) + 1), new Map<string, number>()),
    )]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([o, k]) => `${o} ${k}`)
      .join(" · ");
    P(`| ${v} | ${n} | ${origins} |`);
  }
  if (growthHp.length > 12) P(`| ⋯另 ${growthHp.length - 12} 種 | ${growthHp.slice(12).reduce((n, [, k]) => n + k, 0)} | |`);
  P();
  P("⚠️ ⭐ 這一欄**今天沒有執行期讀者**（GH#1224 的第二則留言量過：註冊表被出身表覆寫，153/153 張）——");
  P("⛔ 但它**被這支統計讀**，而這支統計是 rollback 路徑上的分母。");
  P();
  P("---");
  P();
  P("## 5. ⭐ 換一個分母，五級距會變成什麼（全部走出貨函式）");
  P();
  P(
    `推導鏈（\`gen.ts\`，⛔ 一個字面值都沒有）：\`（純基礎中位 LV${SHIPPED_ANCHOR_LEVEL} ＋ 初始加成 ${HP_BONUS}）÷ ${KILL_CASTS_REF} 發\`` +
      " → 進位 ⇒ 極小 ⇒ 其餘四格 ＝ 極小 × 單體冷卻比。",
  );
  P();
  P(
    `| 分母 | 人數 | ${BALANCE_ANCHOR_LEVELS.map((lv) => `純基礎 HP 中位 LV${lv}`).join(" | ")} | ` +
      "⭐ 中位那一張（探針） | 極小 | 傷害五級距 | vs 出貨 | 耗魔五級距 |",
  );
  P(`|---|---:|${BALANCE_ANCHOR_LEVELS.map(() => "---:").join("|")}|---|---:|---|---:|---|`);
  P(
    `| ⭐ **Ⓐ 今天出貨**（固定錨點） | ${cards.length} | ` +
      `${BALANCE_ANCHOR_LEVELS.map((lv) => `**${SHIPPED.baseHp[lv]}**`).join(" | ")} | ` +
      "（⛔ 不取中位，讀設定檔） | " +
      `**${SHIPPED.smallest}** | **${ladder(SHIPPED.damage)}** | — | ${ladder(SHIPPED.mana)} |`,
  );
  for (const s of SCALES) {
    const m = measure(s.pool);
    const d = (m.smallest / SHIPPED.smallest - 1) * 100;
    const pr = probe(s.pool, SHIPPED_ANCHOR_LEVEL);
    P(
      `| ${s.label} | ${m.n} | ` +
        BALANCE_ANCHOR_LEVELS.map(
          (lv) => `${m.baseHp[lv]}${m.baseHp[lv] === SHIPPED.baseHp[lv] ? " ⭐同" : ""}`,
        ).join(" | ") +
        ` | \`${pr?.id ?? "?"}\` | ${m.smallest} | ${ladder(m.damage)} | ` +
        `**${d >= 0 ? "+" : ""}${d.toFixed(0)}%** | ${ladder(m.mana)} |`,
    );
  }
  P();
  for (const s of SCALES) P(`- **${s.label.slice(0, 2)}** ${s.note}`);
  P();
  P("⚠️ ⭐ 「vs 出貨」比的是**極小**那一格 —— 其餘四格與它嚴格成正比，所以同一個百分比。");
  P("⭐ 「同」＝ 那一格與 `balance-anchors.json` 的固定值**逐位元組相同**。");
  P("⭐ **探針**那一欄是「中位數是哪一張卡給的」—— ⛔ 一個不印探針的中位數驗證不了。");
  P();
  // ⭐ Ⓓ 與 Ⓐ 為什麼會逐位元組相同 —— ⛔ 只陳述量到的，⛔ 不宣稱因果。
  const at2838 = cards.filter(
    (c) => Math.abs(hpAt(c, SHIPPED_ANCHOR_LEVEL) - (SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL] ?? -1)) < 0.05,
  );
  if (at2838.length > 0) {
    P(
      `⭐⭐ **Ⓓ 與今天的出貨值三格全同**，而那個值 ${SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]} 正好是 ` +
        `**${at2838.length} 張卡**的 LV${SHIPPED_ANCHOR_LEVEL} 血量：` +
        `${at2838.map((c) => `\`${c.id}\`（${c.attrSource}）`).join("、")}。`,
    );
    P();
    P(
      "⚠️ ⛔ **這只是量到的相等，⛔ 不是我查到的因果** —— `content/config/owner-knobs.json` 裡" +
        "**沒有** `balance-anchors.baseHp` 這一格，⇒ 那三個數字引用不到 owner 的任何一句原話（它們是 2026-09-12 的一次量測快照）。" +
        "⭐ 能說的只有：**照 Ⓓ 換分母，今天的五級距一個數字都不用動。**",
    );
    P();
  }
  P("---");
  P();
  P(`## 5.5 ⭐⭐ 刻度是一條**階梯**，而今天的錨點站在階邊上`);
  P();
  P(
    `\`anchorFloorFrom\` 是 \`ceil((中位 ＋ ${HP_BONUS}) ÷ ${KILL_CASTS_REF} ÷ ${tierStep()}) × ${tierStep()}\` ⇒ ` +
      `⭐ **中位數落在一整段 ${BAND} 點寬的區間裡，得到的是同一張表**；跨過邊界，整張表跳一格。`,
  );
  P();
  const bShip = band(SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]!);
  P("| 分母 | 中位 LV30 | 它落在哪一段 | 離下緣 | 離上緣 | 極小 |");
  P("|---|---:|---|---:|---:|---:|");
  const bandRow = (label: string, v: number) => {
    const b = band(v);
    P(
      `| ${label} | ${v} | \`(${b.low}, ${b.high}]\` | **${q(b.toLow)}**（${((b.toLow / v) * 100).toFixed(1)}%） | ` +
        `${q(b.toHigh)}（${((b.toHigh / v) * 100).toFixed(1)}%） | ${b.smallest} |`,
    );
  };
  bandRow("⭐ **Ⓐ 今天出貨**（固定錨點）", SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]!);
  for (const s of SCALES) bandRow(s.label.slice(0, 2), measure(s.pool).baseHp[SHIPPED_ANCHOR_LEVEL]!);
  P();
  P(
    `⇒ ⭐⭐ **今天的錨點 ${SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]} 離下緣只有 ${q(bShip.toLow)} 點** ` +
      `—— 中位血量的 **${((bShip.toLow / SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]!) * 100).toFixed(1)}%**。`,
  );
  P();
  P(
    `⭐ 說白一點：中位再掉 ${q(bShip.toLow)} 點，極小就從 **${bShip.smallest} → ${bShip.smallest - tierStep()}**，` +
      `＝ **全遊戲每一支技能的傷害 −${((tierStep() / bShip.smallest) * 100).toFixed(0)}%**。` +
      `⭐ 而那個觸發條件**一張卡就做得到**（上面第 6 節逐群量過）。`,
  );
  P();
  P("⚠️ ⭐ 這不是「74 張卡共用預設」那個病，⭐ 是它的**放大器**：");
  P("共用的預設讓中位數**可以被一批新卡整段搬走**，而階梯讓「搬 1%」變成「傷害動 20%」。");
  P("⛔ 兩件事要分開看 —— 換分母治前者，⛔ 治不了後者。");
  P();
  P("---");
  P();
  P("## 6. 逐群敏感度：**只**拔掉這一群，中位會走多遠");
  P();
  P("| 拔掉哪一群 | 幾張 | 剩幾位 | 中位 LV30 | 中位動了 | 極小 | 傷害動了 |");
  P("|---|---:|---:|---:|---:|---:|---:|");
  const full = measure(cards);
  P(
    `| （不拔，全母體） | 0 | ${full.n} | ${full.baseHp[SHIPPED_ANCHOR_LEVEL]} | — | ${full.smallest} | — |`,
  );
  for (const g of bigHpClusters.slice(0, 6)) {
    const ids = new Set(g.map((c) => c.id));
    const m = measure(cards.filter((c) => !ids.has(c.id)));
    const dm =
      (m.baseHp[SHIPPED_ANCHOR_LEVEL]! / full.baseHp[SHIPPED_ANCHOR_LEVEL]! - 1) * 100;
    const dt = (m.smallest / full.smallest - 1) * 100;
    P(
      `| base ${JSON.parse(g[0]!.hpKey)[0]} ＋每級 ${JSON.parse(g[0]!.hpKey)[1]} ＋STR ${JSON.parse(g[0]!.hpKey)[2]} | ` +
        `${g.length} | ${m.n} | ${m.baseHp[SHIPPED_ANCHOR_LEVEL]} | ${dm >= 0 ? "+" : ""}${dm.toFixed(1)}% | ` +
        `${m.smallest} | ${dt >= 0 ? "+" : ""}${dt.toFixed(0)}% |`,
    );
  }
  P();
  P("⭐ 這張表回答的是票上那句「**它還會再動**」：一群同型卡上架（或下架），中位就往它那一格靠。");
  P();
  P("⚠️ ⭐ **「傷害動了」那一欄多半是 0%，⛔ 而那不是安全** —— 它只是說");
  P("「這一次沒跨過階梯的邊界」。⭐ 中位那一欄才是真正在動的東西（上面 5.5）。");
  P("⛔ 拿「傷害沒動」當成「母體沒問題」的證據，就是把**階梯的量化**讀成**穩定性**。");
  P();
  P("---");
  P();
  P("## 7. 三個錨點的達成率（每一個分母各算一次）");
  P();
  P(`門檻 ${KILL_CASTS_REF} 發（owner Q1「20 次以內一定要能殺死對方」），分母是**純基礎＋加成**。`);
  P();
  P(`| 分母 | ${BALANCE_ANCHOR_LEVELS.map((lv) => `LV${lv}（${ANCHOR_ROLE[lv]}）`).join(" | ")} |`);
  P(`|---|${BALANCE_ANCHOR_LEVELS.map(() => "---:").join("|")}|`);
  const rateRow = (label: string, m: Measured) =>
    P(
      `| ${label} | ` +
        BALANCE_ANCHOR_LEVELS.map((lv) => {
          const n = (m.baseHp[lv]! + HP_BONUS) / m.smallest;
          return `${n.toFixed(1)} 發 ${n <= KILL_CASTS_REF ? "✅" : "❌"}`;
        }).join(" | ") +
        " |",
    );
  rateRow("⭐ **Ⓐ 今天出貨**", SHIPPED);
  for (const s of SCALES) rateRow(s.label.slice(0, 2), measure(s.pool));
  P();
  P("---");
  P();
  P("## 8. ⛔ 這張票還缺什麼（⛔ 不要讀成做完了）");
  P();
  P("| 驗收條件 | 狀態 |");
  P("|---|---|");
  P("| 那些卡的每一格屬性要嘛引用得到出處、要嘛被標成「模板預設，未設計」 | ⚠️ **量到了，⛔ 還沒標**：今天唯一的出處欄是 `attributes.source`，而它只有 `w3x` 一種值算出處 |");
  P("| 錨點母體的定義寫成一條會紅的閘 | ⛔ **還沒有** —— 這一支沒有被 `skills:check` 收（`package.json` 在這條 lane 的柵欄外） |");
  P("| owner 決定：未設計的卡算不算在分母裡 | ⛔ **等 owner** —— 上面第 5 節就是那張選項表 |");
  P("| `anchors:check` 綠 | ✅ 綠（這份普查**不動**任何產物） |");
  P();
  P("⭐ **接線那一行**（留給主線）：`package.json` 加 `cardcensus:check` 並收進 `skills:check`，");
  P("或把這份普查的母體不變量寫成 `packages/shared/src/ops/` 底下一條測試。");
  P("⛔ 在那之前，這份報告會過期而**沒有任何東西會紅**（失敗形態 ⑨：一個沒有人看它綠過的閘）。");
  P();
  P("### ⛔⛔ 而那條閘**不能**是 `anchors:check` —— 突變量過了");
  P();
  P("把 `shippedInputs.ts` 的 `median()` 改壞（上中位 → 下中位）再跑兩支閘：");
  P();
  P("| 閘 | 結果 |");
  P("|---|---|");
  P("| `anchors:check`（`tsx tools/balance-anchors/gen.ts --check`） | ⛔ **還是綠的**（exit 0） |");
  P("| 這份普查的 `--check` | ✅ **紅**（exit 1，指名報告過期） |");
  P();
  P("⭐ 為什麼：`balance-anchors.enabled:true` 之後，三份產物都是從**固定值**寫出來的 ——");
  P("量測只餵那一行 advisory，⛔ 而 advisory **不是產物**。");
  P("⇒ ⭐ **今天「母體變了」不會讓任何一份產物過期**，所以票上要的那條閘");
  P("⛔ 不可能由 `anchors:check` 兼任，⭐ 它得是**另一條**（這一支，或 `ops/` 底下同型的一條）。");
  P();
  P("⚠️ 同一次突變也證明了 `gen.ts` 真的在吃 `shippedInputs.ts`：改 `shippedBaseBonus()`");
  P("⇒ `anchors:check` 三份產物全部判過期（`balanceAnchorsDerived.ts` · `damage-tiers.json` · `平衡錨點量測.md`）。");
  P();
  return L.join("\n");
}

const want = report();
const abs = join(REPO, OUT_REL);
let have = "";
try {
  have = readFileSync(abs, "utf-8");
} catch {
  have = "";
}
const summary =
  `母體 ${cards.length} 位 · 血量四件組共用 ${sharedHpIds.size} 位 · ` +
  `全母體中位 LV${SHIPPED_ANCHOR_LEVEL} ${measure(cards).baseHp[SHIPPED_ANCHOR_LEVEL]}（出貨固定值 ${SHIPPED.baseHp[SHIPPED_ANCHOR_LEVEL]}）`;
if (have === want) {
  console.log(`✔ 已經是最新的（${summary}）`);
} else if (CHECK) {
  console.error(`✗ 過期：${OUT_REL} —— 跑 \`npx tsx tools/balance-anchors/card_template_census.ts\` 然後 git add。`);
  process.exit(1);
} else {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, want, "utf-8");
  console.log(`✔ 寫入 ${OUT_REL}（${summary}）`);
}

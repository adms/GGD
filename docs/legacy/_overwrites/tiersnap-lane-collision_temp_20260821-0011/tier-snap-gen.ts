/**
 * **收進級距**的產生器 —— 出貨的 `config/tier-snap.json` 與那張「哪一支靠到哪一格」的清單。
 *
 * ```bash
 * pnpm tiersnap:build     # 重生成兩份產物
 * pnpm tiersnap:check     # 唯讀：過期就回非零
 * ```
 *
 * owner 2026-08-20（逐字，這一支的全部規格）：
 * > 「**收**：一次改掉 **137 支技能的冷卻也包括耗魔**，但**往前還是往後靠看傷害**，
 * >  **傷害低的往前靠、傷害高的往後靠**」
 *
 * ⛔ **它⛔ 不改任何一份技能 JSON。** 靠攏是**註冊時的一條規則**
 *（`packages/shared/src/content/tierSnap.ts`，接在 `registerAll` 的 `withTiers` 上）——
 * 這一支只是把那條規則**跑一遍給人看**。
 * ⭐ 兩個理由：① 新技能自動跟著收，⛔ 不會「每新增一支就多一支不在格點上的」；
 * ② 那 358 支裡有 90 支是 `tools/skill-remake/batch1.py` 逐位元組擁有的檔，
 * 寫進去下一次重生成就被無聲蓋掉（GH#319 的形狀）。
 *
 * ⚠️ 清單本身就是 owner 要的那個「先量再改」：**每一支印出「現在幾秒 → 靠到哪一格 →
 * 方向為什麼」**，而且幅度超過 ±30% 的會被標出來。
 *
 * ⚠️ ⛔ 刻意**沒有產生日期**（同 `caps:export` / `spec:build` / `anchors:build`）。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COOLDOWN_SHAPES,
  DEFAULT_COOLDOWN_TIERS,
  type CooldownShape,
} from "../../packages/shared/src/content/cooldownTiers";
import { DEFAULT_DAMAGE_TIERS, resolveDamageTier } from "../../packages/shared/src/content/damageTiers";
import { SKILL_TIER_NAMES } from "../../packages/shared/src/content/skillTiers";
import {
  DEFAULT_TIER_SNAP,
  MANA_CAST_ANCHORS,
  TIER_SNAP_DOC_ID,
  damageThreshold,
  describeTierSnap,
  planSnap,
  type AbilitySnap,
} from "../../packages/shared/src/content/tierSnap";
import { HARD_ANCHOR_LEVEL, medianFinalMana } from "../../packages/shared/src/content/balanceAnchors";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");
const CONFIG_JSON = `content/config/${TIER_SNAP_DOC_ID}.json`;
const DOC_MD = "docs/冷卻耗魔收級距清單.md";

/** 幅度超過這個就在清單上標紅字 —— ⛔ 不是一條規則，是**報告的門檻**。 */
const BIG_MOVE = 0.3;

const TIERS = DEFAULT_COOLDOWN_TIERS;
const SNAP = DEFAULT_TIER_SNAP;

function corpus(): Record<string, unknown>[] {
  const dir = join(REPO, "content/abilities");
  const out = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>);
  // ⚠️ 空語料 = 讀壞了，⛔ 不是「內容是空的」。同 roster-guard 的那一條。
  if (out.length === 0) throw new Error("content/abilities 讀出 0 份文件 —— 讀取器壞了");
  return out;
}

// ⭐ 走**出貨那條管線**：傷害級距先解析，再問靠攏規則 —— ⛔ 不自己重算一份
//   （`registerAll` 就是這個順序，兩邊分岔就是「報告說 A、引擎做 B」）。
const docs = corpus().map((d) => resolveDamageTier(d, DEFAULT_DAMAGE_TIERS));
const THRESHOLD = damageThreshold(SNAP, docs);

interface Row extends AbilitySnap {
  id: string;
  name: string;
}
const rows: Row[] = [];
for (const d of docs) {
  const plan = planSnap(d, TIERS, SNAP, THRESHOLD);
  if (plan === null) continue;
  rows.push({
    ...plan,
    id: typeof d["id"] === "string" ? (d["id"] as string) : "",
    name: typeof d["name"] === "string" ? (d["name"] as string) : "",
  });
}
rows.sort((a, b) => a.id.localeCompare(b.id));

const cdMove = (r: Row): number =>
  r.cooldown === null ? 0 : (r.cooldown.value - r.cooldownFrom) / r.cooldownFrom;
const withCooldown = () => corpusWithCooldown;
const corpusWithCooldown = docs.filter((d) => {
  const cd = d["cooldown"];
  if (typeof cd === "number") return cd > 0;
  return Array.isArray(cd) && cd.some((x) => typeof x === "number" && x > 0);
}).length;

const byShape = (s: CooldownShape): number => rows.filter((r) => r.shape === s).length;
const clamped = rows.filter((r) => r.cooldown?.why.includes("夾")).length;
const overCap = rows.filter((r) => r.cooldown?.why.includes("超過上限")).length;
const underFloor = rows.filter((r) => r.cooldown?.why.includes("低於下限")).length;
const longer = rows.filter((r) => r.cooldown?.why.includes("往後")).length;
const shorter = rows.filter((r) => r.cooldown?.why.includes("往前")).length;
const bigMoves = rows.filter((r) => Math.abs(cdMove(r)) > BIG_MOVE);

// ------------------------------------------------------------------- emit ---
function configJson(): string {
  let keep: Partial<Record<string, unknown>> = {};
  try {
    keep = JSON.parse(readFileSync(join(REPO, CONFIG_JSON), "utf-8")) as Record<string, unknown>;
  } catch {
    /* 第一次產生 */
  }
  const b = (k: string, fb: boolean): boolean => (typeof keep[k] === "boolean" ? (keep[k] as boolean) : fb);
  const note =
    `**收進級距**（owner 2026-08-20 的「收」）。⭐ **耗魔五格與這段說明是 \`pnpm tiersnap:build\` 寫的，⛔ 不要手改。**` +
    `owner 逐字：「**收**：一次改掉 **137 支技能的冷卻也包括耗魔**，但**往前還是往後靠看傷害**，**傷害低的往前靠、傷害高的往後靠**」。` +
    `⭐ 它是**註冊時的一條規則**（\`content/tierSnap.ts\` 接在 \`registerAll\` 的 withTiers 上），⛔ **不是 137 次手改技能 JSON** —— ` +
    `那樣做的話新技能不會跟著收，而且其中 90 支是 \`skill-remake/batch1.py\` 逐位元組擁有的檔，寫進去下一次重生成就被無聲蓋掉（GH#319 的形狀）。` +
    `⏸ **「高/低」那條線 owner 還沒給** ⇒ 第一守則：\`highDamageThreshold\` **0 = 自動**（全庫中位滿階傷害，今天量到 ${THRESHOLD}），` +
    `他想釘死就填一個正數。⚠️ 出貨走自動是刻意的：傷害五級距落地後全庫傷害會全面改寫，一個當時量到的絕對值馬上就過期，而且會**用錯誤的訊息**過期（技能靠錯邊，沒有東西會紅）。` +
    `⭐ 耗魔五格從**魔力池**（LV${HARD_ANCHOR_LEVEL} 中位引擎最終 ${Math.round(medianFinalMana(HARD_ANCHOR_LEVEL))}）與 owner 2026-08-19 的兩條規格推導：` +
    `${MANA_CAST_ANCHORS.map((a) => `${a.tier} = 池 ÷ ${a.casts}`).join("、")}，其餘三格由這兩個錨的比值長出來。` +
    `⛔ 不可以直接抄傷害那條梯子（×10）—— 極大會比整個魔力池還大，那支技能一輩子放不出來。` +
    `⭐ **量到的（出貨語料）**：有冷卻的 ${corpusWithCooldown} 支，其中 **${rows.length} 支**不在格點上` +
    `（${COOLDOWN_SHAPES.map((s) => `${s} ${byShape(s)}`).join(" · ")}）；往前靠 ${shorter} · 往後靠 ${longer} · ` +
    `低於下限夾 ${underFloor} · **超過上限夾 ${overCap}**；冷卻變動超過 ±${BIG_MOVE * 100}% 的有 **${bigMoves.length} 支**。逐支清單在 \`${DOC_MD}\`。` +
    `⚠️ \`outOfRange\` 獨立成一格是因為**超出上下限那一批的幅度最大**（最長 150 秒 → 60 秒），owner 要回頭時應該能只回頭這一批，⛔ 不必連整個機制一起關掉。`;
  const doc = {
    id: TIER_SNAP_DOC_ID,
    schema: "config.tier-snap@1",
    note,
    enabled: b("enabled", SNAP.enabled),
    snapCooldown: b("snapCooldown", SNAP.snapCooldown),
    snapManaCost: b("snapManaCost", SNAP.snapManaCost),
    outOfRange:
      typeof keep["outOfRange"] === "string" ? (keep["outOfRange"] as string) : SNAP.outOfRange,
    highDamageThreshold:
      typeof keep["highDamageThreshold"] === "number"
        ? (keep["highDamageThreshold"] as number)
        : SNAP.highDamageThreshold,
    manaCost: Object.fromEntries(SKILL_TIER_NAMES.map((n) => [n, SNAP.manaCost[n]])),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function pct(x: number): string {
  const v = Math.round(x * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

function docMd(): string {
  const L: string[] = [];
  L.push("# 冷卻與耗魔「收進級距」清單（GH#445 · #446 · #447）");
  L.push("");
  L.push("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**");
  L.push(">");
  L.push("> ```bash");
  L.push("> pnpm tiersnap:build     # 重生成");
  L.push("> pnpm tiersnap:check     # 唯讀：過期就回非零");
  L.push("> ```");
  L.push(">");
  L.push("> owner 2026-08-20（逐字裁決）：");
  L.push("> 「**收**：一次改掉 **137 支技能的冷卻也包括耗魔**，但**往前還是往後靠看傷害**，");
  L.push(">  **傷害低的往前靠、傷害高的往後靠**」");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 規則");
  L.push("");
  L.push(describeTierSnap(SNAP, TIERS));
  L.push("");
  L.push(`「高/低」那條線今天是 **${THRESHOLD}**（\`highDamageThreshold: 0\` ⇒ 自動＝全庫中位滿階傷害）。`);
  L.push("⛔ 它是**後台一格**，⛔ 不是寫死的 —— owner 之後看到某一支靠錯邊，改那一格就整批重算。");
  L.push("");
  L.push("⚠️ **超出格點上下限的沒有方向可挑**（例：單體 150 秒 vs 上限 60 秒）——");
  L.push("那時候只有一個合法值，由 `outOfRange` 決定夾不夾。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 量到的");
  L.push("");
  L.push("| | 支數 |");
  L.push("|---|---:|");
  L.push(`| 有冷卻的技能（母數） | ${corpusWithCooldown} |`);
  L.push(`| **不在格點上 ⇒ 被收** | **${rows.length}** |`);
  for (const s of COOLDOWN_SHAPES) L.push(`| 　└ ${s} | ${byShape(s)} |`);
  L.push(`| 　往**前**（短）靠 —— 傷害低 | ${shorter} |`);
  L.push(`| 　往**後**（長）靠 —— 傷害高 | ${longer} |`);
  L.push(`| 　低於下限 ⇒ 夾上來 | ${underFloor} |`);
  L.push(`| 　**超過上限 ⇒ 夾下來** | **${overCap}** |`);
  L.push(`| 冷卻變動超過 ±${BIG_MOVE * 100}% | **${bigMoves.length}** |`);
  L.push("");
  L.push(
    `⚠️ owner 說的「137 支」＝ ${COOLDOWN_SHAPES[0]} ＋ ${COOLDOWN_SHAPES[1]} 兩張表` +
      `（GH#445 留言的口徑）。**${COOLDOWN_SHAPES[2]}** 那一張當時沒被數進去，` +
      `所以實際不在格點上的是 **${rows.length}** 支。`,
  );
  L.push("");
  L.push("---");
  L.push("");
  L.push(`## ⛔ 超過上限的 ${overCap} 支 —— **幅度最大的一批，先看這張**`);
  L.push("");
  L.push("這一批沒有「往前/往後」可挑：它們的秒數在 owner 給的格點**之外**，只能夾到上限。");
  L.push("");
  L.push("| 技能 | id | 形狀 | 現在 | → 夾到 | 幅度 | 招牌傷害 |");
  L.push("|---|---|---|---:|---:|---:|---:|");
  for (const r of [...rows]
    .filter((x) => x.cooldown?.why.includes("超過上限"))
    .sort((a, b) => b.cooldownFrom - a.cooldownFrom)) {
    L.push(
      `| ${r.name} | \`${r.id}\` | ${r.shape} | ${r.cooldownFrom} 秒 | **${r.cooldown!.value} 秒** | ` +
        `**${pct(cdMove(r))}** | ${r.damage} |`,
    );
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 逐支清單");
  L.push("");
  L.push("⚠️ 「耗魔」那一欄只在**冷卻真的被收到**時才有值（owner：「冷卻**也包括**耗魔」）。");
  L.push("");
  L.push("| 技能 | id | 形狀 | 冷卻 | → | 幅度 | 為什麼 | 耗魔 | → |");
  L.push("|---|---|---|---:|---:|---:|---|---:|---:|");
  for (const r of rows) {
    const move = r.cooldown === null ? "" : pct(cdMove(r));
    const flag = r.cooldown !== null && Math.abs(cdMove(r)) > BIG_MOVE ? " ⚠️" : "";
    L.push(
      `| ${r.name} | \`${r.id}\` | ${r.shape} | ${r.cooldownFrom} | ` +
        `${r.cooldown === null ? "－" : `**${r.cooldown.value}**`} | ${move}${flag} | ` +
        `${r.cooldown?.why ?? r.mana?.why ?? "－"} | ${r.manaFrom || "－"} | ` +
        `${r.mana === null ? "－" : `**${r.mana.value}**`} |`,
    );
  }
  L.push("");
  return L.join("\n");
}

// ------------------------------------------------------------------ write ---
void withCooldown;
const outputs: [string, string][] = [
  [CONFIG_JSON, configJson()],
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

const summary = `${rows.length} 支被收（往前 ${shorter} · 往後 ${longer} · 夾 ${clamped}）· 界線 ${THRESHOLD} · ±${BIG_MOVE * 100}% 以上 ${bigMoves.length} 支`;
if (CHECK) {
  if (stale > 0) {
    console.error(`\n${stale} 份產物過期 —— 跑 \`pnpm tiersnap:build\` 然後 git add。`);
    process.exit(1);
  }
  console.log(`✔ tiersnap 產物都是最新的（${summary}）`);
} else if (stale === 0) {
  console.log(`✔ 已經是最新的（${summary}）`);
}

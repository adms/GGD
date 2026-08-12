/**
 * 英雄「出身」對照表產生器 —— 一支腳本產出兩份東西，⛔ 不手寫任何一份。
 *
 * 產出：
 *   · docs/hero-archetypes.json  —— 逐英雄的出身/初始/成長（審查與工具用）
 *   · docs/hero-archetypes.md    —— 同一份資料的 markdown 表（貼進計畫書）
 *
 * ⚠️ 這份 JSON **不是第四個住處**。權威資料仍然是：
 *   ① content/config/stat-normalization.json  —— 出身 × 屬性的級距表（引擎載入）
 *   ② content/champions/*.json                —— 每位英雄自己的卡（含可選的 archetype 覆寫）
 * 這份是從 ①② **推導**出來的快照，給 owner 審查與外部工具讀。
 * 守衛 tools/hero-archetypes/build.test.ts 會重跑這支腳本並比對，過期就紅。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import { primaryAttribute } from "../../packages/shared/src/content/statNormalization";

const ROOT = join(__dirname, "../..");
const T = JSON.parse(readFileSync(join(ROOT, "docs/hero-stat-tiers.json"), "utf-8")) as {
  population: { rows: { id: string; name: string; group: string; attackType: string; bodyScale: number; reachability: string; counterpartId: string | null }[] };
};

/**
 * ⚠️ **下架的英雄要從母體剔除。**
 *
 * `docs/hero-stat-tiers.json` 是 2026-08-11 產出的快照，而 `roster.json` 的
 * `retiredChampions` 之後動過 —— 2026-08-12 owner 問「天地志狼變身不是取消了嗎」
 * 的時候，那一位（`godie-e007`）確實已經在下架清單裡，但快照還留著他，
 * 於是他照樣出現在射程排名上。⛔ 母體算錯不會報錯，只會讓每一個統計都偏一點。
 */
const RETIRED = new Set<string>(
  (JSON.parse(readFileSync(join(ROOT, "content/config/roster.json"), "utf-8")) as {
    retiredChampions?: string[];
  }).retiredChampions ?? [],
);

/** 六出身 = 主屬性(3) × 攻擊型態(2)。⛔ 這是**推導**不是欄位，英雄卡的 `archetype` 才是覆寫。 */
export const ORIGINS = ["壁壘", "重砲", "刃舞", "遊獵", "魔劍", "咒術"] as const;
export type Origin = (typeof ORIGINS)[number];

export function originOf(primary: "str" | "agi" | "int", attackType: string): Origin {
  const melee = attackType !== "ranged";
  if (primary === "str") return melee ? "壁壘" : "重砲";
  if (primary === "agi") return melee ? "刃舞" : "遊獵";
  return melee ? "魔劍" : "咒術";
}

const STATS = [
  ["ms", Stat.MoveSpeed], ["armor", Stat.Armor], ["mr", Stat.MagicResist],
  ["maxHealth", Stat.MaxHealth], ["maxMana", Stat.MaxMana], ["ad", Stat.AttackDamage],
  ["ap", Stat.AbilityPower], ["as", Stat.AttackSpeed], ["range", Stat.AttackRange],
] as const;

const rows = T.population.rows
  .filter((r) => !RETIRED.has(r.id))
  .map((r) => {
  const d = JSON.parse(readFileSync(join(ROOT, `content/champions/${r.id}.json`), "utf-8")) as Record<string, never>;
  // ⚠️ 攻擊型態以**英雄卡**為準，⛔ 不用快照 —— 2026-08-12 owner 把妖狐藏馬本體
  //    與揍敵客桀諾從遠程改成近戰，快照還停在改之前。
  const attackType = (d as unknown as { attackType?: string }).attackType ?? r.attackType;
  const primary = primaryAttribute(d);
  const initial: Record<string, number> = {};
  const perLevel: Record<string, number> = {};
  for (const [key, stat] of STATS) {
    const l1 = championStatBase(d, stat, 1);
    // ⭐ 「每級成長」用 L2−L1 量，⛔ 不讀 growth 欄位 —— 三圍成長也會貢獻，
    //    只讀 growth 會漏掉一半（而且不同屬性漏的比例不同）。
    initial[key] = Number(l1.toFixed(3));
    perLevel[key] = Number((championStatBase(d, stat, 2) - l1).toFixed(4));
  }
  const a = (d as unknown as { attributes?: Record<string, number> }).attributes ?? {};
  return {
    id: r.id, name: r.name,
    身分: r.group === "transform" ? "變身" : r.group === "mob" ? "小怪" : "本體",
    reachability: r.reachability, counterpartId: r.counterpartId,
    attackType, bodyScale: r.bodyScale,
    primary, 出身: originOf(primary, attackType),
    archetypeOverride: (d as unknown as { archetype?: string }).archetype ?? null,
    attributes: { str: a.str ?? 0, agi: a.agi ?? 0, int: a.int ?? 0, strGrowth: a.strGrowth ?? 0, agiGrowth: a.agiGrowth ?? 0, intGrowth: a.intGrowth ?? 0 },
    initial, perLevel,
  };
});

const byOrigin = Object.fromEntries(ORIGINS.map((o) => [o, rows.filter((r) => r.出身 === o).length]));
const out = {
  schema: "ggd-hero-archetypes@1",
  generatedBy: "tools/hero-archetypes/build.ts",
  generatedFrom: {
    population: "docs/hero-stat-tiers.json → population.rows（74 = 可選本體 53 + 可達變身 21）",
    statFunction: "championStatBase(def, stat, L) —— 出貨的那一支，⛔ 沒有抄公式",
    initial: "L1 的最終值", perLevel: "L2 − L1（含三圍成長那一項）",
  },
  origins: { rule: "主屬性(str/agi/int) × 攻擊型態(melee/ranged)", counts: byOrigin },
  champions: rows,
};
writeFileSync(join(ROOT, "docs/hero-archetypes.json"), JSON.stringify(out, null, 2) + "\n");

const f = (n: number, d = 2) => n.toFixed(d);
const md = [
  `<!-- ⛔ 這一節由 tools/hero-archetypes/build.ts 產生，不要手改。 -->`,
  ``,
  `出身人數：${ORIGINS.map((o) => `${o} ${byOrigin[o]}`).join(" · ")}（母體 ${rows.length}）`,
  ``,
  `| 出身 | 身分 | 名稱 | 主屬 | 攻型 | 移速 | 裝甲 | 魔抗 | 生命 | AD | AP | 攻速 | 射程 |`,
  `|---|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|`,
  ...ORIGINS.flatMap((o) =>
    rows.filter((r) => r.出身 === o).sort((a, b) => b.initial.armor! - a.initial.armor!).map((r) =>
      `| ${o} | ${r.身分} | ${r.name} | ${r.primary} | ${r.attackType === "ranged" ? "遠" : "近"} | ${f(r.initial.ms!)}<br><sub>+${f(r.perLevel.ms!, 3)}</sub> | ${f(r.initial.armor!)}<br><sub>+${f(r.perLevel.armor!, 3)}</sub> | ${f(r.initial.mr!)}<br><sub>+${f(r.perLevel.mr!, 3)}</sub> | ${f(r.initial.maxHealth!, 0)}<br><sub>+${f(r.perLevel.maxHealth!, 1)}</sub> | ${f(r.initial.ad!, 0)}<br><sub>+${f(r.perLevel.ad!, 2)}</sub> | ${f(r.initial.ap!, 0)}<br><sub>+${f(r.perLevel.ap!, 2)}</sub> | ${f(r.initial.as!)}<br><sub>+${f(r.perLevel.as!, 3)}</sub> | ${f(r.initial.range!)} |`,
    ),
  ),
].join("\n");
writeFileSync(join(ROOT, "docs/hero-archetypes.md"), md + "\n");
console.log(`✓ docs/hero-archetypes.json (${rows.length} 位)  ·  docs/hero-archetypes.md`);
console.log(JSON.stringify(byOrigin, null, 0));

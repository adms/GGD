/**
 * 📡 出身屬性五級距雷達圖 —— GET /__live/radar-origins
 *
 * 回答「每一個出身（10 格）在 11 項屬性上各落在五級距的哪一格」，並附上
 * 逐英雄（含 join 不到的誠實清單）好讓頁面畫每英雄一張雷達、並排比較兩位。
 *
 * ⭐ 第〇·四守則：這裡**零重算** —— 級距名抄 `byOrigin`、級距值抄 `bands` /
 *   `bandsByScale`（range 是雙階梯，照 `scaleByOrigin` 選），逐英雄的
 *   initial/perLevel 抄 `docs/hero-archetypes.json`（tools/hero-archetypes/build.ts
 *   用**出貨的** championStatBase 算好的產物）。⛔ 一條公式都不在這裡重推。
 *
 * ⚠️ 誠實邊界：hero-archetypes 產物的母體是 49 位「對戰可選本體」；
 *   content/champions/ 有 72 份（含變身態與未上架）。兩邊都回傳，
 *   join 不到產物的英雄標 `inPopulation:false`（雷達照畫 —— 出身級距只吃
 *   origin 欄，不吃母體），origin 對不上級距表的列進 `unmatched`。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const NORM = "content/config/stat-normalization.json";
const ARCHETYPES = "docs/hero-archetypes.json";
const ROUTES = "content/config/origin-routes.json";
const CHAMP_DIR = "content/champions";

const TIER_ORDER = ["極小", "小", "中", "大", "極大"];

function championFiles(repoRoot) {
  return readdirSync(join(repoRoot, CHAMP_DIR))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();
}

/** deps 是函式：逐檔列 champions/*.json —— 目錄 mtime 抓不到「改一份既有檔」。 */
export function deps(repoRoot) {
  return [NORM, ARCHETYPES, ROUTES, ...championFiles(repoRoot).map((f) => `${CHAMP_DIR}/${f}`)];
}

export async function build(repoRoot) {
  const readJson = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
  const norm = readJson(NORM);
  const arch = readJson(ARCHETYPES);
  const routes = readJson(ROUTES);

  const stats = norm.appliesTo ?? [];
  const originNames = Object.keys(norm.byOrigin?.ms ?? {});

  /** 級距值解析：range 走雙階梯（近戰/遠程由出身選），其餘一把梯子。 */
  const bandValue = (stat, origin, tier) => {
    if (tier == null) return null;
    const scale = norm.scaleByOrigin?.[stat]?.[origin];
    const ladder =
      (scale && norm.bandsByScale?.[stat]?.[scale]) || norm.bands?.[stat] || null;
    return ladder?.[tier] ?? null;
  };

  // ── 出身 × 屬性：級距名 + 級距值 + range 用的是哪把梯子 ─────────────
  const origins = {};
  for (const origin of originNames) {
    const tiers = {};
    for (const stat of stats) {
      const tier = norm.byOrigin?.[stat]?.[origin] ?? null;
      tiers[stat] = {
        tier,
        ord: tier == null ? null : TIER_ORDER.indexOf(tier) + 1,
        value: bandValue(stat, origin, tier),
      };
    }
    const route = routes.origins?.[origin];
    origins[origin] = {
      tiers,
      rangeScale: norm.scaleByOrigin?.range?.[origin] ?? null,
      rule: route?.rule ?? null,
      tagline: route?.tagline ?? null,
    };
  }

  // ── 逐英雄：卡上欄位 join 產物（initial/perLevel 只有母體 49 位有） ──
  const byId = new Map((arch.champions ?? []).map((c) => [c.id, c]));
  const champions = [];
  const unmatched = [];
  for (const file of championFiles(repoRoot)) {
    const doc = readJson(`${CHAMP_DIR}/${file}`);
    const snap = byId.get(doc.id) ?? null;
    const row = {
      id: doc.id,
      name: doc.name ?? doc.id,
      origin: doc.origin ?? null,
      role: doc.role ?? null,
      attackType: doc.attackType ?? null,
      attributes: doc.attributes
        ? {
            str: doc.attributes.str ?? null,
            agi: doc.attributes.agi ?? null,
            int: doc.attributes.int ?? null,
            primary: doc.attributes.primary ?? null,
          }
        : null,
      inPopulation: snap != null,
      身分: snap?.["身分"] ?? null,
      initial: snap?.initial ?? null,
      perLevel: snap?.perLevel ?? null,
    };
    if (row.origin == null || origins[row.origin] == null) {
      unmatched.push({ id: row.id, name: row.name, origin: row.origin });
      continue;
    }
    champions.push(row);
  }
  champions.sort((a, b) =>
    a.origin === b.origin ? a.id.localeCompare(b.id) : a.origin.localeCompare(b.origin, "zh-Hant"),
  );

  const originCounts = {};
  for (const c of champions) originCounts[c.origin] = (originCounts[c.origin] ?? 0) + 1;

  return {
    tierOrder: TIER_ORDER,
    stats,
    referenceLevel: norm.referenceLevel ?? null,
    channel: norm.channel ?? {},
    origins,
    originCounts,
    populationCounts: arch.origins?.counts ?? {},
    champions,
    unmatched,
    sources: {
      tiers: `${NORM}（byOrigin/bands/bandsByScale —— 引擎載入的那一份）`,
      perHero: `${ARCHETYPES}（tools/hero-archetypes/build.ts 產物；過期就跑 pnpm archetypes:build）`,
      cards: `${CHAMP_DIR}/*.json（origin 與三圍直接抄卡）`,
    },
  };
}

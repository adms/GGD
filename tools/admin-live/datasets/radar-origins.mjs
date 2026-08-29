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

/**
 * ⭐ GH#821 寫入宣告 —— POST /__live/radar-origins/save（GH#828 把這一頁從唯讀改成可存）。
 * `stat-normalization.json` 是**手編 config**（genguard ✓）—— 這一頁畫的每一個形狀都是它的
 * 欄位，所以「資料的家」就是它。⭐ 只開 owner 會想改的三格，⛔ 不是整份都變成可編輯：
 *   ① `/byOrigin/<屬性>/<出身>`      級距名     —— 雷達的**半徑**（這一頁的主資料）
 *   ② `/scaleByOrigin/<屬性>/<出身>` 階梯名     —— 射程走近戰／遠程哪一把（出身綁定的決策點）
 *   ③ `/referenceLevel`              參考等級   —— 級距值報在哪一等（卡上小字的 L）
 * ⛔ 級距**值**（bands/bandsByScale）不開：那是平衡梯子，值的改動走既有 config 流程。
 * ⚠️ ARCHETYPES 是 archetypes:build 產物，⛔ 永遠不寫。
 *
 * ⭐ 每一條的界線都**從出貨的東西推導**，⛔ 不寫死：級名抄同一份檔 `bands` 的鍵、階梯名抄
 *   `bandsByScale[屬性]` 的鍵、出身名抄 `byOrigin` 自己的鍵。理由是出貨 schema
 *   （packages/shared/src/content/schema/config/statNormalization.ts）的 byOrigin /
 *   scaleByOrigin 都是 `.strict()`、key 表來自 ORIGINS、值是 `z.enum(NORMAL_BANDS)` /
 *   `z.enum(SCALE_KEYS)` ⇒ ⛔ **存進一個檔裡沒有的鍵或級名 = 後台存得下而內容驗證整份拒收**
 *   （這一批剛在別的 dataset 上量到同型缺陷：宣告的上界比出貨 schema 寬）。
 *   `referenceLevel` 的 `2..99` 是**逐字抄** schema 的 `z.number().int().min(2).max(99)`。
 */
const readNorm = (repoRoot) => JSON.parse(readFileSync(join(repoRoot, NORM), "utf8"));
/** pointer 的第 n 段（"/byOrigin/ms/坦克" ⇒ 1="ms"、2="坦克"）。 */
const seg = (pointer, n) => pointer.split("/").filter((s) => s !== "")[n] ?? "";
/** 級名＝bands / bandsByScale 裡「值全是數字」那一層的鍵（⛔ 不寫死五級名）。 */
function bandNames(norm) {
  const names = new Set();
  const collect = (node) => {
    if (node === null || typeof node !== "object") return;
    const vals = Object.values(node);
    if (!Array.isArray(node) && vals.length > 0 && vals.every((v) => typeof v === "number")) {
      for (const k of Object.keys(node)) names.add(k);
      return;
    }
    for (const v of vals) collect(v);
  };
  collect(norm.bands);
  collect(norm.bandsByScale);
  return names;
}
/** 這一份檔真的有的出身名（byOrigin 每一列的聯集 —— schema 那一格是 strict × ORIGINS）。 */
function originKeys(norm) {
  const out = new Set();
  for (const row of Object.values(norm.byOrigin ?? {})) for (const k of Object.keys(row ?? {})) out.add(k);
  return out;
}

export const write = {
  kind: "source",
  rules: [
    {
      paths: [NORM],
      pointers: ["/byOrigin/*/*"],
      value: { type: "string", maxLen: 8 },
      why: "出身 × 屬性 → 級距名（值在載入時從 bands 解析）",
      check(repoRoot, { pointer, value }) {
        const norm = readNorm(repoRoot);
        const [stat, origin] = [seg(pointer, 1), seg(pointer, 2)];
        if (!(stat in (norm.byOrigin ?? {}))) return `「${stat}」不是 byOrigin 裡的屬性 —— ⛔ 不新增 schema 不認得的鍵`;
        if (!originKeys(norm).has(origin)) return `「${origin}」不是既有的出身（${[...originKeys(norm)].join("/")}）`;
        const names = bandNames(norm);
        if (names.size === 0) return "讀不到 bands 的級名 —— ⛔ 不要把「讀不到」當成「合法」";
        return names.has(value) ? null : `「${value}」不在 bands 的級名（${[...names].join("/")}）`;
      },
    },
    {
      paths: [NORM],
      pointers: ["/scaleByOrigin/*/*"],
      value: { type: "string", maxLen: 8 },
      why: "出身 → 這一項走哪一把階梯（射程：近戰／遠程；查不到就退回單尺 bands）",
      check(repoRoot, { pointer, value }) {
        const norm = readNorm(repoRoot);
        const [stat, origin] = [seg(pointer, 1), seg(pointer, 2)];
        const ladders = norm.bandsByScale?.[stat];
        if (!ladders || Object.keys(ladders).length === 0)
          return `「${stat}」沒有雙階梯（bandsByScale 裡沒有它）—— 替它選階梯是空的一格`;
        if (!originKeys(norm).has(origin)) return `「${origin}」不是既有的出身（${[...originKeys(norm)].join("/")}）`;
        const keys = Object.keys(ladders);
        return keys.includes(value) ? null : `「${value}」不是 ${stat} 的階梯名（${keys.join("/")}）`;
      },
    },
    {
      paths: [NORM],
      pointers: ["/referenceLevel"],
      value: { type: "number", integer: true, min: 2, max: 99 },
      why: "級距值報在哪一等級（⭐ 2..99 逐字抄 schema/config/statNormalization.ts 的 int().min(2).max(99)）",
    },
  ],
};
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
    writeTargets: { norm: NORM },
    sources: {
      tiers: `${NORM}（byOrigin/bands/bandsByScale —— 引擎載入的那一份）`,
      perHero: `${ARCHETYPES}（tools/hero-archetypes/build.ts 產物；過期就跑 pnpm archetypes:build）`,
      cards: `${CHAMP_DIR}/*.json（origin 與三圍直接抄卡）`,
    },
  };
}

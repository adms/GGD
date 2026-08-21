/**
 * 移速／攻速 **每級成長五級距**的內容側落地器（owner 2026-08-21）。
 *
 * ```bash
 * pnpm speedtiers:build     # 把每一位的級別寫進英雄卡
 * pnpm speedtiers:check     # 唯讀，逐位元組比對；過期或漂了就非零離開
 * ```
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼是一支腳本，⛔ 不是 49 次手改（第零守則⑨ + owner 2026-08-21③）
 * ─────────────────────────────────────────────────────────────────────────────
 * 「49 位各填一格」有兩種做法，而其中一種會腐爛：
 *
 *   ⛔ 手填 —— 49 次編輯，而且**每新增一位英雄就多一位沒填的**，沒有任何東西會紅。
 *   ✅ 一條規則 —— 這支。級別由「他今天的成長落在梯子的哪一格」**推導**，
 *      所以「零平衡改動」不是我逐位核對出來的結論，是這支腳本的**定義**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 它做**外科手術式**的文字插入，⛔ 不是 JSON round-trip
 * ─────────────────────────────────────────────────────────────────────────────
 * 英雄卡是 `tools/champion-csv` 用 Python 寫出來的，Python 的 `json.dumps` 把
 * `22.0` 印成 `22.0`，而 `JSON.stringify` 印成 `22`。整棵樹 round-trip 一次 ＝
 * **70/71 張卡整份改寫**（實測），一次把兩個真正的欄位埋進幾千行雜訊裡。
 * ⇒ 這支只在 `"growth": {…},` 這個區塊後面插兩行，其餘位元組**一個都不碰**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 母體 = **49 位可選本體**，⛔ 不含變身態（owner 2026-08-21 兩則裁決）
 * ─────────────────────────────────────────────────────────────────────────────
 * > 「上架不能包含變身態 我們討論過了」「查所有屬性級距等 **都是不考慮變身態的**」
 *
 * 變身態不填級別 ⇒ 它們走「沒填級別 → 原樣返回」那條路，保留自己卡上的成長。
 * 這與 `statNormalization.skipTransformedBodies` 是**同一個**決定（變身態是同一位
 * 英雄的第二張卡，把本體的級別套上去會抹平「變身之後更強」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `--check` 驗**三件事**，⛔ 不是只驗檔案新不新
 * ─────────────────────────────────────────────────────────────────────────────
 *  ① 49 張卡都有兩個級別欄位，而且逐位元組等於現在重生成的結果。
 *  ② `requireAuthoredParity` 開著時：每一位的級別**解析出來等於他卡上的原值**
 *    （＝「這一版零平衡改動」那句宣稱的證據，⛔ 不是我在報告裡打的字）。
 *  ③ `config.stat-normalization@1` 沒有同時在寫 `growth.ms` / `growth.as`。
 *    ⚠️ 這一條是**兩個名詞的關係**：兩份設定各自都合法，只有它們的組合會讓
 *    級別被靜靜蓋掉（`as` 的 `channel` 今天就已經寫著 `growth`，只差沒進 `appliesTo`）。
 *
 * ⚠️ ⛔ 刻意**沒有產生日期**（同 `caps:export` / `anchors:build`）：任何隨時鐘變動的
 * 欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 —— 而一條被放寬的閘
 * 等於沒有閘（GH#389 · #426）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { balancePopulationIds, BALANCE_POPULATION_PROVENANCE } from "../../packages/shared/testkit/balancePopulation";
import {
  SPEED_GROWTH_AXES,
  SPEED_GROWTH_AXIS_LABEL,
  SPEED_GROWTH_TIER_FIELD,
  speedGrowthTableOf,
  speedGrowthTiersFromDoc,
  type SpeedGrowthAxis,
  type SpeedGrowthTierName,
} from "../../packages/shared/src/content/speedGrowthTiers";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");

const TIERS = speedGrowthTiersFromDoc(
  JSON.parse(readFileSync(join(REPO, "content/config/speed-growth-tiers.json"), "utf8")),
);
const TABLE = speedGrowthTableOf(TIERS);

/** 這位英雄這條軸今天的每級成長。⚠️ 缺鍵 = 0（`championStatBase` 就是這樣讀的）。 */
function authored(doc: Record<string, unknown>, axis: SpeedGrowthAxis): number {
  const g = doc["growth"] as Record<string, number> | undefined;
  return g?.[axis] ?? 0;
}

/** 「他今天的值落在梯子的哪一格」—— 取最接近的那一格，並回報差多少。 */
function tierFor(
  axis: SpeedGrowthAxis,
  value: number,
): { tier: SpeedGrowthTierName; exact: boolean } {
  let best: SpeedGrowthTierName | undefined;
  let bestDelta = Infinity;
  for (const [name, v] of Object.entries(TABLE[axis]) as [SpeedGrowthTierName, number][]) {
    const delta = Math.abs(v - value);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = name;
    }
  }
  return { tier: best!, exact: bestDelta < 1e-9 };
}

/**
 * 在 `"growth": {…}` 區塊後面插（或就地更新）兩行級別。
 * ⛔ 不 parse 也不 stringify 整份文件 —— 理由見檔頭。
 */
function withTierLines(raw: string, tiers: Record<SpeedGrowthAxis, SpeedGrowthTierName>): string {
  let out = raw;
  // 已經有的話就地換值（冪等，讓 build 可以重跑）。
  for (const axis of SPEED_GROWTH_AXES) {
    const field = SPEED_GROWTH_TIER_FIELD[axis];
    const re = new RegExp(`^  "${field}": "[^"]*",?$`, "m");
    if (re.test(out)) out = out.replace(re, `  "${field}": "${tiers[axis]}",`);
  }
  if (SPEED_GROWTH_AXES.every((a) => out.includes(`  "${SPEED_GROWTH_TIER_FIELD[a]}":`))) return out;

  const start = out.indexOf('\n  "growth": {');
  if (start < 0) throw new Error("這張卡沒有頂層 growth 區塊 —— 插入點斷了，去修這裡");
  // `growth` 是一層扁平的數字，所以它的收尾就是下一個 2 空白縮排的 `}`。
  const close = out.indexOf("\n  }", start + 1);
  if (close < 0) throw new Error("找不到 growth 區塊的結尾");
  const after = close + "\n  }".length;
  const comma = out[after] === "," ? 1 : 0;
  const lines = SPEED_GROWTH_AXES.map(
    (a) => `\n  "${SPEED_GROWTH_TIER_FIELD[a]}": "${tiers[a]}",`,
  ).join("");
  return out.slice(0, after + comma) + lines + out.slice(after + comma);
}

// ------------------------------------------------------------------- 走一遍 --
interface Row {
  id: string;
  tiers: Record<SpeedGrowthAxis, SpeedGrowthTierName>;
  drift: string[];
}

const ids = balancePopulationIds(REPO);
const rows: Row[] = [];
const stale: string[] = [];

for (const id of ids) {
  const path = join(REPO, "content/champions", `${id}.json`);
  const raw = readFileSync(path, "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const tiers = {} as Record<SpeedGrowthAxis, SpeedGrowthTierName>;
  const drift: string[] = [];
  for (const axis of SPEED_GROWTH_AXES) {
    const value = authored(doc, axis);
    const { tier, exact } = tierFor(axis, value);
    tiers[axis] = tier;
    if (!exact) {
      drift.push(
        `${SPEED_GROWTH_AXIS_LABEL[axis]} 卡上 ${value} → 最近的一格「${tier}」是 ${TABLE[axis][tier]}`,
      );
    }
  }
  rows.push({ id, tiers, drift });

  const next = withTierLines(raw, tiers);
  if (next === raw) continue;
  if (CHECK) stale.push(id);
  else writeFileSync(path, next, "utf8");
}

// ---------------------------------------------------------------- 三條後置條件 --
const problems: string[] = [];

// ① 檔案新不新（`--check` 專用；build 剛寫完必然是新的）。
if (stale.length > 0) {
  problems.push(
    `${stale.length} 張英雄卡的級別欄位過期或缺席：${stale.slice(0, 8).join(", ")}` +
      `${stale.length > 8 ? " …" : ""}\n  → 跑 \`pnpm speedtiers:build\` 然後 \`git add content/champions\`。⛔ 不要手填。`,
  );
}

// ② 零平衡改動的宣稱 —— 有宣稱就要有證據。
const drifted = rows.filter((r) => r.drift.length > 0);
if (TIERS.requireAuthoredParity && drifted.length > 0) {
  problems.push(
    `\`requireAuthoredParity\` 開著（＝這一版宣告「零平衡改動」），但有 ${drifted.length} 位的級別解析出來**不等於**他卡上的原值：\n` +
      drifted.map((r) => `    · ${r.id} — ${r.drift.join("；")}`).join("\n") +
      `\n  → 要嘛把梯子調到收得住他，要嘛把 \`requireAuthoredParity\` 關掉（那就是在宣告這一版**有**平衡改動）。⛔ 不要改測試。`,
  );
}

// ③ 兩份設定的**關係** —— 各自合法、組合起來會靜靜蓋掉級別。
const norm = JSON.parse(
  readFileSync(join(REPO, "content/config/stat-normalization.json"), "utf8"),
) as { appliesTo?: string[]; channel?: Record<string, string> };
const clash = (norm.appliesTo ?? []).filter(
  (k) => (SPEED_GROWTH_AXES as readonly string[]).includes(k) && norm.channel?.[k] === "growth",
);
if (clash.length > 0) {
  problems.push(
    `\`config.stat-normalization@1\` 正在寫 growth.${clash.join(" / growth.")} —— 那與速度級距是**同一格**，` +
      `而註冊時級距在後面 ⇒ 正規化那一半會被靜靜吃掉。\n` +
      `  → 把它從 appliesTo 拿掉，或把那一項的 channel 改成 baseStats，或關掉速度級距的總開關。⛔ 不要兩邊都留著。`,
  );
}

// ------------------------------------------------------------------- 報告 --
const tally = (axis: SpeedGrowthAxis): string =>
  Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.tiers[axis]] = (acc[r.tiers[axis]] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([t, n]) => `${t} ${n}`)
    .join(" · ");

console.log(`[speedtiers] 母體 ${rows.length} 位（${BALANCE_POPULATION_PROVENANCE}）`);
console.log(`[speedtiers] 梯子 ${TIERS.ladder}　總開關 ${TIERS.enabled ? "on" : "off"}`);
for (const axis of SPEED_GROWTH_AXES) {
  console.log(`[speedtiers] ${SPEED_GROWTH_AXIS_LABEL[axis]} 級別分佈：${tally(axis)}`);
}

if (problems.length > 0) {
  console.error(`\n[speedtiers] ⛔ ${problems.length} 個問題：\n` + problems.map((p) => `\n  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`[speedtiers] ${CHECK ? "check OK" : "build OK"}`);

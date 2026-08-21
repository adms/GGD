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
 * ⭐ 2026-08-21 下午加了**第二條推導**：這支該管哪幾條軸，也是推導出來的
 * （{@link NORMALIZED_AXES} / {@link MANAGED_AXES}，讀 `config.stat-normalization@1`）。
 * owner：「看不懂你第二第三選項，**請你照出身表的規劃來設定就好**」⇒ `as` 交給出身表，
 * 這支不再敲 `asGrowthTier` 而且會把卡上舊的那一行刪掉。⛔ 不是寫死「只管 ms」——
 * owner 哪天把 `as` 從 `appliesTo` 拿掉，級別欄位會自動長回 49 張卡。
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
 *  ③ ⭐ **一條軸恰好一個主人**：`config.stat-normalization@1` 的 `appliesTo`
 *    擁有的那幾條軸，英雄卡上**不可以**還留著級別欄位。
 *    ⚠️ 這一條是**兩個名詞的關係**：兩份設定各自都合法，只有它們的組合會讓
 *    出身表那一半被靜靜蓋掉（級距包在正規化**外面**，所以級距永遠贏）。
 *    ⚠️ 它在 2026-08-21 翻了面 —— 舊版問的是「正規化有沒有在寫 growth.<軸>」，
 *    那個問法預設了級距永遠是主人；owner「請你照出身表的規劃來設定就好」之後
 *    兩個主人都合法，⛔ 不合法的是**同時**。
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
  SPEED_GROWTH_PARITY_DRIFT,
  SPEED_GROWTH_TIER_NAMES,
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
 * ⭐ **這一支該管哪幾條軸 —— 從 `config.stat-normalization@1` 推導，⛔ 不是寫死名單。**
 *
 * owner 2026-08-21：「看不懂你第二第三選項，**請你照出身表的規劃來設定就好**」
 * ⇒ 出身表（`stat-normalization` 的 `bands` × `byOrigin`）是**那條軸的最後一句話**。
 *
 * ⚠️ 兩個系統寫**同一格** `growth.<軸>`，而註冊時級距包在正規化**外面**
 * （`registries.ts`）⇒ 兩邊都留著的話，正規化那一半會被靜靜吃掉（失敗形態②）。
 * ⇒ 規則只有一條：**一條軸只能有一個主人**。在 `appliesTo` 且走 `growth` 通道的
 * 軸交給正規化，這支就**不敲**它的級別欄位（而且會把卡上舊的那一行**刪掉**）。
 *
 * ⭐ 推導的好處是雙向的：owner 哪天把 `as` 從 `appliesTo` 拿掉，這支自動把
 * `asGrowthTier` 敲回去，⛔ 不必改程式、⛔ 不必記得。
 */
const NORM = JSON.parse(
  readFileSync(join(REPO, "content/config/stat-normalization.json"), "utf8"),
) as { appliesTo?: string[]; channel?: Record<string, string> };

const NORMALIZED_AXES: readonly SpeedGrowthAxis[] = SPEED_GROWTH_AXES.filter(
  (a) => (NORM.appliesTo ?? []).includes(a) && NORM.channel?.[a] === "growth",
);
const MANAGED_AXES: readonly SpeedGrowthAxis[] = SPEED_GROWTH_AXES.filter(
  (a) => !NORMALIZED_AXES.includes(a),
);

/**
 * 在 `"growth": {…}` 區塊後面插（或就地更新）級別行；正規化擁有的那幾條軸
 * 則**把既有那一行刪掉**。⛔ 不 parse 也不 stringify 整份文件 —— 理由見檔頭。
 */
function withTierLines(raw: string, tiers: Record<SpeedGrowthAxis, SpeedGrowthTierName>): string {
  let out = raw;
  // ⭐ 正規化擁有的軸：卡上那一行要**消失**，⛔ 不是留著一個沒有效果的欄位
  //   （留著＝後台照樣顯示它、作者照樣改它，而場上一個位元都不動）。
  for (const axis of NORMALIZED_AXES) {
    const field = SPEED_GROWTH_TIER_FIELD[axis];
    out = out.replace(new RegExp(`\\n  "${field}": "[^"]*",?`), "");
  }
  // 已經有的話就地換值（冪等，讓 build 可以重跑）。
  for (const axis of MANAGED_AXES) {
    const field = SPEED_GROWTH_TIER_FIELD[axis];
    const re = new RegExp(`^  "${field}": "[^"]*",?$`, "m");
    if (re.test(out)) out = out.replace(re, `  "${field}": "${tiers[axis]}",`);
  }
  if (MANAGED_AXES.every((a) => out.includes(`  "${SPEED_GROWTH_TIER_FIELD[a]}":`))) return out;

  const start = out.indexOf('\n  "growth": {');
  if (start < 0) throw new Error("這張卡沒有頂層 growth 區塊 —— 插入點斷了，去修這裡");
  // `growth` 是一層扁平的數字，所以它的收尾就是下一個 2 空白縮排的 `}`。
  const close = out.indexOf("\n  }", start + 1);
  if (close < 0) throw new Error("找不到 growth 區塊的結尾");
  const after = close + "\n  }".length;
  const comma = out[after] === "," ? 1 : 0;
  const lines = MANAGED_AXES.map(
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
  for (const axis of MANAGED_AXES) {
    const value = authored(doc, axis);
    // ⭐ 具名待裁決的軸**凍結**：卡上已經有的級別留著，⛔ 不從原值重新挑一格。
    //
    // ⚠️ 這一格是 2026-08-21 補的，而它擋掉的是一次**真的、無聲的平衡改動**：
    // 那天的架構改動把 49 位的 `growth.as` 重推導成 0.003–0.0281，而「挑最近的
    // 一格」會把 43 位的 `asGrowthTier` 從「小」(0.02) 改成「極小」(0.01) ——
    // ⇒ 攻速每級成長**砍半**，而它會以「產生器跑了一次」的樣子悄悄進 repo。
    // ⛔ 那個值今天**還沒有生效**（`as` 不在 stat-normalization 的 `appliesTo` 裡），
    // 所以拿它去挑級別＝拿一個死值去改活值。凍結 ⇒ 等 owner 裁決（理由逐字寫在
    // `SPEED_GROWTH_PARITY_DRIFT`），而下面的 ② 會把差異逐位印給他看。
    const held = doc[SPEED_GROWTH_TIER_FIELD[axis]];
    const frozen =
      SPEED_GROWTH_PARITY_DRIFT[axis] !== undefined &&
      typeof held === "string" &&
      (SPEED_GROWTH_TIER_NAMES as readonly string[]).includes(held);
    const tier = frozen ? (held as SpeedGrowthTierName) : tierFor(axis, value).tier;
    tiers[axis] = tier;
    if (Math.abs(TABLE[axis][tier] - value) > 1e-9) {
      drift.push(
        `${SPEED_GROWTH_AXIS_LABEL[axis]} 卡上 ${value} → 級別「${tier}」是 ${TABLE[axis][tier]}` +
          `${frozen ? "（**凍結**，⛔ 沒有重挑）" : "（最近的一格）"}`,
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

// ② 原值與級別不可以說兩句話 —— 有差異就要**具名**，而且要**印出來**。
//
// ⚠️ 2026-08-21 改過一次：這一格原本是「宣告零平衡改動就要有證據」，而那個框架
// 在同一天下午被 owner 的架構裁決打破（`growth.as` 被十出身表重推導）。
// ⛔ 放寬它或把 `requireAuthoredParity` 關掉都是錯的 —— owner 逐字「**我沒這樣說過**」，
// 那些 ±% 是架構改動的**後果**不是他要的目標。⇒ 現在它**如實報告**：
// 具名清單上的軸把差異逐位印出來給 owner 看，沒具名的一筆都不准。
const byAxis = new Map<SpeedGrowthAxis, string[]>();
for (const r of rows) {
  for (const axis of SPEED_GROWTH_AXES) {
    const line = r.drift.find((d) => d.startsWith(SPEED_GROWTH_AXIS_LABEL[axis]));
    if (line !== undefined) byAxis.set(axis, [...(byAxis.get(axis) ?? []), `${r.id} — ${line}`]);
  }
}
if (TIERS.requireAuthoredParity) {
  for (const [axis, lines] of [...byAxis].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const why = SPEED_GROWTH_PARITY_DRIFT[axis];
    if (why === undefined) {
      problems.push(
        `「${SPEED_GROWTH_AXIS_LABEL[axis]}」有 ${lines.length} 位的級別解析出來**不等於**他卡上的原值，` +
          `而這條軸**不在** \`SPEED_GROWTH_PARITY_DRIFT\` 上：\n` +
          lines.map((l) => `    · ${l}`).join("\n") +
          `\n  → 要嘛把值收回來，要嘛把這條軸連同**一個能被反駁的理由**寫進 ` +
          `packages/shared/src/content/speedGrowthTiers.ts。⛔ 不要關掉 requireAuthoredParity、⛔ 不要改測試。`,
      );
      continue;
    }
    // ⭐ 具名 ⇒ 不是問題，但**一定要印出來** —— 這份清單存在的唯一理由就是給 owner 看。
    console.warn(
      `\n[speedtiers] ⚠️ 「${SPEED_GROWTH_AXIS_LABEL[axis]}」有 ${lines.length} 位原值與級別不同（具名待裁決）\n` +
        `  理由：${why}\n` +
        lines.map((l) => `    · ${l}`).join("\n"),
    );
  }
  // ⭐ 反向：清單上的軸必須真的還在漂。收乾淨了就要刪掉那一筆。
  for (const axis of Object.keys(SPEED_GROWTH_PARITY_DRIFT)) {
    if (!byAxis.has(axis as SpeedGrowthAxis)) {
      problems.push(
        `\`SPEED_GROWTH_PARITY_DRIFT\` 上的「${axis}」已經不漂了 —— 刪掉那一筆，⛔ 不要留成沒人讀的豁免。`,
      );
    }
  }
}

// ③ 兩份設定的**關係** —— ⭐ **一條軸恰好一個主人**。
//
// ⚠️ 這一條在 2026-08-21 翻了面（owner：「請你照出身表的規劃來設定就好」）。
// 舊版問的是「正規化有沒有在寫 growth.<軸>」——那個問法預設了級距永遠是主人。
// 現在兩個主人都合法，⛔ 不合法的是**同時**：註冊時級距包在正規化外面，
// 兩邊都寫 ⇒ 出身表那一半被靜靜吃掉，而後台照樣顯示級別欄位（失敗形態②）。
//
// ⇒ 檢查改成「正規化擁有的軸，卡上不可以還留著級別欄位」。
// 突變：把 `NORMALIZED_AXES` 的過濾拿掉（＝兩邊都寫）→ 這裡逐位點名紅。
const doubleOwned: string[] = [];
for (const id of ids) {
  const doc = JSON.parse(
    readFileSync(join(REPO, "content/champions", `${id}.json`), "utf8"),
  ) as Record<string, unknown>;
  for (const axis of NORMALIZED_AXES) {
    if (typeof doc[SPEED_GROWTH_TIER_FIELD[axis]] === "string") {
      doubleOwned.push(`${id}.${SPEED_GROWTH_TIER_FIELD[axis]}`);
    }
  }
}
if (doubleOwned.length > 0) {
  problems.push(
    `${doubleOwned.length} 張卡同時被**兩個系統**寫同一格 growth：` +
      `${doubleOwned.slice(0, 8).join(", ")}${doubleOwned.length > 8 ? " …" : ""}\n` +
      `  → \`config.stat-normalization@1\` 的 appliesTo 已經擁有 ` +
      `${NORMALIZED_AXES.map((a) => `growth.${a}`).join(" / ")}，而註冊時級距包在正規化**外面** ⇒ ` +
      `出身表那一半會被靜靜吃掉。跑 \`pnpm speedtiers:build\` 把那幾行刪掉，⛔ 不要手改、⛔ 不要放寬這條。`,
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
for (const axis of MANAGED_AXES) {
  console.log(`[speedtiers] ${SPEED_GROWTH_AXIS_LABEL[axis]} 級別分佈：${tally(axis)}`);
}
for (const axis of NORMALIZED_AXES) {
  console.log(
    `[speedtiers] ${SPEED_GROWTH_AXIS_LABEL[axis]} 交給**出身表**（config.stat-normalization@1 的 appliesTo）` +
      ` ⇒ 這一支不敲 ${SPEED_GROWTH_TIER_FIELD[axis]}，卡上舊的那一行已刪除`,
  );
}

if (problems.length > 0) {
  console.error(`\n[speedtiers] ⛔ ${problems.length} 個問題：\n` + problems.map((p) => `\n  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`[speedtiers] ${CHECK ? "check OK" : "build OK"}`);

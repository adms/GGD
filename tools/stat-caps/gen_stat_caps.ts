/**
 * 屬性上限產生器 —— 那 7 條硬上限**從出貨內容量出來**，⛔ 沒有一個是打上去的。
 *
 * ```bash
 * pnpm statcaps:build     # 重算並寫三份產物
 * pnpm statcaps:check     # 唯讀，逐位元組比對；過期就非零離開
 * ```
 *
 * 產出（三份，全部由這一支寫）：
 *   · packages/shared/src/sim/statCapsDerived.ts  —— 引擎讀的那 7 個數字 + 出處
 *   · content/config/stat-caps.json               —— 出貨文件的同 7 格
 *   · docs/屬性上限推導.md                          —— 三個錨點的對照表（owner / Codex 讀）
 *
 * ---------------------------------------------------------------------------
 * 規則（⛔ 全部住在 `packages/shared/src/sim/statCapDerivation.ts`，這裡只執行）
 * ---------------------------------------------------------------------------
 *   cap_base(stat) = median( championStatBase(每張出貨卡, stat, 錨點等級, 出貨env) )
 *                    × STAT_CAP_MULTIPLE
 *
 * ⚠️ 三件事讓它不會再變成 owner 2026-08-20 抓到的那個迴圈：
 *   ① **基礎空間**量、基礎空間存；env 鏈由 `capCeiling()` 在讀取時乘**一次**。
 *   ② 錨點來自 `BALANCE_ANCHOR_LEVELS`，倍率只乘在**那一個**錨點上（⛔ 不再疊等級）。
 *   ③ 用的是**出貨** `combat-env.json` 的三圍係數，⛔ 不是 `DEFAULT_COMBAT_ENV`
 *      —— 那兩者今天就不一樣（`agiToArmor` 0.15 vs 0.3），而引擎跑的是前者。
 *      ⇒ 改 combat-env 會讓這一支 `--check` 紅，那是**刻意的閘**。
 *
 * ⚠️ 保險絲：任何一格算出來超過 `STAT_CAP_MAX[stat]`（防打錯的 Zod 上界）就
 * **非零離開並指名那一格** —— ⛔ 不自動放寬保險絲。這正是 LV50 / LV99 被擋下來
 * 的地方（armor 12,679 / maxHealth 1,629,840），也是「選 LV30」那個結論的來源。
 *
 * ⚠️ ⛔ 刻意**沒有產生日期**（同 `caps:export` / `spec:build`）：任何隨時鐘變動的
 * 欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 —— 而一條被放寬的
 * 閘等於沒有閘。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationIds,
} from "../../packages/shared/testkit/balancePopulation";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import { STAT_CAP_MAX, DEFAULT_STAT_CAPS } from "../../packages/shared/src/sim/statCaps";
import {
  DERIVED_CAP_STATS,
  STAT_CAP_ANCHOR_LEVEL,
  STAT_CAP_MULTIPLE,
} from "../../packages/shared/src/sim/statCapDerivation";
import {
  ANCHOR_ROLE,
  BALANCE_ANCHOR_LEVELS,
  type BalanceAnchorLevel,
} from "../../packages/shared/src/content/balanceAnchors";
import {
  COMBAT_ENV_DEFAULTS,
  STAT_ENV_CHAIN,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../../packages/shared/src/sim/combatEnv";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");

const DERIVED_TS = "packages/shared/src/sim/statCapsDerived.ts";
const CAPS_JSON = "content/config/stat-caps.json";
const DOC_MD = "docs/屬性上限推導.md";

// ------------------------------------------------------------------ inputs --
/** 出貨的戰鬥系統表 —— 引擎真的跑的那一份，⛔ 不是程式預設。 */
function shippedEnv(): CombatEnvMultipliers {
  const doc = JSON.parse(readFileSync(join(REPO, "content/config/combat-env.json"), "utf-8")) as {
    multipliers?: Record<string, number>;
  };
  return Object.freeze({ ...COMBAT_ENV_DEFAULTS, ...(doc.multipliers ?? {}) }) as CombatEnvMultipliers;
}

/**
 * 母體 = **對戰可選本體**（`balancePopulationIds`），⛔ 不是 `readdirSync(content/champions)`。
 *
 * ⚠️ 這一段在 2026-08-21 之前寫著「母體 = 註冊表服務得出來的每一張英雄卡（含變身態、
 * 含已下架），⛔ 少算一張的代價正是那一位被靜默夾住」。owner 2026-08-21 逐字推翻：
 *
 * > 「①**上架不能包含變身態 我們討論過了 之前就是這樣才沒改到正確的英雄技能**」
 * > 「②並且我們**查所有屬性級距等 都是不考慮變身態的**」
 *
 * ⭐ 「一張都不能少」那個顧慮**沒有消失，只是不靠母體解決**：上限是
 * `錨點中位 × STAT_CAP_MULTIPLE`（出貨 200×），而變身態是本體的第二張卡 ——
 * 它與本體的差距遠在兩個數量級之內，⛔ 200× 的柵欄不可能夾到它。
 * 用它去拉中位數換來的不是安全，是**重複計數**。
 */
function population(): { id: string; doc: Record<string, unknown> }[] {
  const dir = join(REPO, "content/champions");
  return balancePopulationIds(REPO).map((id) => ({
    id,
    doc: JSON.parse(readFileSync(join(dir, `${id}.json`), "utf-8")) as Record<string, unknown>,
  }));
}

const median = (xs: number[]): number => {
  const b = [...xs].sort((a, z) => a - z);
  return b.length === 0 ? 0 : b[b.length >> 1]!;
};

/** env 鏈在這條屬性上的乘積 —— 基礎空間 → 最終空間的那**一次**倍率。 */
function envChain(stat: Stat, env: CombatEnvMultipliers): number {
  let k = 1;
  for (const link of STAT_ENV_CHAIN[stat] ?? []) k *= statEnvFactor(link, env, undefined);
  return k;
}

// ----------------------------------------------------------------- compute --
const env = shippedEnv();
const pop = population();

interface Row {
  stat: Stat;
  /** 每個錨點的基礎空間中位數 */
  medianAt: Record<number, number>;
  /** 每個錨點的柵欄（基礎空間） */
  capAt: Record<number, number>;
  /** env 鏈乘積（基礎 → 最終） */
  chain: number;
  /** 裸裝母體在 LV99 的最大最終值 —— 「柵欄離最強的那一位有多遠」 */
  peakFinalL99: number;
  peakId: string;
  fuse: number;
}

const LEVELS: readonly BalanceAnchorLevel[] = BALANCE_ANCHOR_LEVELS;

const rows: Row[] = DERIVED_CAP_STATS.map((stat) => {
  const medianAt: Record<number, number> = {};
  const capAt: Record<number, number> = {};
  for (const lv of LEVELS) {
    const m = median(pop.map((p) => championStatBase(p.doc as never, stat, lv, env)));
    medianAt[lv] = m;
    capAt[lv] = Math.round(m * STAT_CAP_MULTIPLE);
  }
  const chain = envChain(stat, env);
  let peakFinalL99 = -Infinity;
  let peakId = "";
  for (const p of pop) {
    const v = championStatBase(p.doc as never, stat, 99, env) * chain;
    if (v > peakFinalL99) {
      peakFinalL99 = v;
      peakId = p.id;
    }
  }
  return { stat, medianAt, capAt, chain, peakFinalL99, peakId, fuse: STAT_CAP_MAX[stat] };
});

/**
 * 名單**外**的那幾條 —— 這條規則刻意不套在它們身上，但**數字照樣算出來**。
 *
 * ⚠️ 理由是量到的：上一輪之所以會用錯錨點，正是因為「要不要套 AP」那個判斷需要
 * 一個沒有人手邊有的數字，於是它被重新量了一次（而且量錯了空間）。
 * ⇒ 把它印在同一份文件上，下一次就不用量。
 */
const EXCLUDED_WHY: Readonly<Record<string, string>> = Object.freeze({
  ap: "owner 2026-08-01「先不要夾」；且 `statCapsApOpen.test.ts` 要求 ≥10× 實測最強組合",
  as: "owner 2026-07-28 直接給的 4.0 / 10.0（每秒攻擊次數）",
  lifesteal: "owner 2026-08-12 直接給的 20×（傷害 100 回復 2000）",
  cdr: "owner 2026-08-10 直接給的 0.99（99% 減免）",
  range: "owner 2026-08-12「上限是黑人牙膏 12，可以延伸到 16」；⛔ 空間不是強度",
  ms: "穿牆平手線（30Hz × 身體半徑 0.6），⛔ 不是平衡數字",
});
const excluded = (Object.keys(DEFAULT_STAT_CAPS) as Stat[])
  .filter((s) => !DERIVED_CAP_STATS.includes(s))
  .map((stat) => {
    const at: Record<number, number> = {};
    for (const lv of LEVELS) {
      at[lv] = Math.round(
        median(pop.map((p) => championStatBase(p.doc as never, stat, lv, env))) * STAT_CAP_MULTIPLE,
      );
    }
    return {
      stat,
      shipped: DEFAULT_STAT_CAPS[stat]!.base,
      why: EXCLUDED_WHY[stat] ?? "⚠️ 沒有理由 —— 補一條或把它加進 DERIVED_CAP_STATS",
      at,
    };
  });

// ⚠️ 保險絲 —— ⛔ 不自動放寬，指名那一格然後非零離開。
const blown = rows.filter((r) => r.capAt[STAT_CAP_ANCHOR_LEVEL]! > r.fuse);
if (blown.length > 0) {
  for (const r of blown) {
    console.error(
      `✗ ${r.stat}: 錨點 LV${STAT_CAP_ANCHOR_LEVEL} 推出 ${r.capAt[STAT_CAP_ANCHOR_LEVEL]} ` +
        `> STAT_CAP_MAX 保險絲 ${r.fuse}。⛔ 不要放寬保險絲 —— 換一個錨點，` +
        `或者這是一個要 owner 點頭的平衡決定。`,
    );
  }
  process.exit(1);
}

// ------------------------------------------------------------------ emit ----
const n = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(4).replace(/0+$/, ""));

function derivedTs(): string {
  const lines = rows.map(
    (r) =>
      `  ${JSON.stringify(r.stat)}: Object.freeze({ base: ${r.capAt[STAT_CAP_ANCHOR_LEVEL]}, unlocked: ${r.capAt[STAT_CAP_ANCHOR_LEVEL]} }),`,
  );
  const med = rows.map((r) => `  ${JSON.stringify(r.stat)}: ${n(r.medianAt[STAT_CAP_ANCHOR_LEVEL]!)},`);
  return `/**
 * ⛔ **產生的檔案 —— 一個字都不要手改。** \`pnpm statcaps:build\`
 *（產生器：tools/stat-caps/gen_stat_caps.ts，規則：sim/statCapDerivation.ts）
 *
 * 這 ${rows.length} 個數字是「**出貨母體在錨點等級的基礎空間中位數 × ${STAT_CAP_MULTIPLE}**」。
 * ⚠️ 它們是**基礎空間**的（⛔ 不含 \`combat-env\` 的 ×factor）——
 * 引擎在 \`statCaps.ts::capCeiling()\` 讀取時才乘 env 鏈，而且**只乘一次**。
 * 那正是 owner 2026-08-20「echo and loop back the formula」指的那個迴圈的修法。
 *
 * 它紅了（\`statcaps:check\`）不要改它，跑 \`pnpm statcaps:build\` 然後 \`git add\`。
 */
import { Stat } from "./stats/statTypes";

/** 一格天花板。與 \`statCaps.ts\` 的 \`StatCap\` 同構（⛔ 不 import，避免產生檔依賴它）。 */
export interface DerivedStatCap {
  readonly base: number;
  readonly unlocked: number;
}

/** 這一批數字是怎麼來的 —— 讓後台 / 文件 / Codex 契約**引用**而不是各自複述。 */
export interface DerivedCapProvenance {
  /** 量測用的等級（= \`STAT_CAP_ANCHOR_LEVEL\`） */
  readonly anchorLevel: number;
  /** owner 的倍率（= \`STAT_CAP_MULTIPLE\`） */
  readonly multiple: number;
  /** 母體大小 —— **對戰可選本體**（⛔ 不含變身態／骨架／退場） */
  readonly population: number;
  /** 每條屬性在錨點的**基礎空間**中位數 */
  readonly medians: Readonly<Partial<Record<Stat, number>>>;
}

export const DERIVED_CAP_PROVENANCE: DerivedCapProvenance = Object.freeze({
  anchorLevel: ${STAT_CAP_ANCHOR_LEVEL},
  multiple: ${STAT_CAP_MULTIPLE},
  population: ${pop.length},
  medians: Object.freeze({
${med.join("\n")}
  }),
});

export const DERIVED_STAT_CAPS: Readonly<Partial<Record<Stat, DerivedStatCap>>> = Object.freeze({
${lines.join("\n")}
});
`;
}

function capsJson(): string {
  const doc = JSON.parse(readFileSync(join(REPO, CAPS_JSON), "utf-8")) as {
    caps: Record<string, { base: number; unlocked: number }>;
  };
  for (const r of rows) {
    doc.caps[r.stat] = {
      base: r.capAt[STAT_CAP_ANCHOR_LEVEL]!,
      unlocked: r.capAt[STAT_CAP_ANCHOR_LEVEL]!,
    };
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function docMd(): string {
  const head = `# 屬性上限（stat-caps）—— 三個錨點的對照表

> ⛔ **產生的文件 —— 不要手改。** \`pnpm statcaps:build\`
> 來源：**${pop.length} 位對戰可選英雄**（${BALANCE_POPULATION_PROVENANCE}）× \`content/config/combat-env.json\`
> × \`packages/shared/src/sim/statCapDerivation.ts\`（規則）。

## 規則

\`\`\`
cap_base(屬性) = median( championStatBase(每張出貨卡, 屬性, 錨點, 出貨env) ) × ${STAT_CAP_MULTIPLE}
cap_final(屬性) = cap_base × env 鏈          ← 引擎讀取時乘，**只乘一次**
\`\`\`

出貨錨點：**LV${STAT_CAP_ANCHOR_LEVEL}**（${ANCHOR_ROLE[STAT_CAP_ANCHOR_LEVEL]}）。
owner 2026-08-20：「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
能 **50 比較好(soft limit)**, **99 是極限**」。

## ⚠️ 為什麼不是 LV50 / LV99

柵欄自己也有一條防打錯的保險絲（\`STAT_CAP_MAX\`）。往上換錨點會**撐爆保險絲**：

| 屬性 | 保險絲 | LV30 | LV50 | LV99 |
|---|--:|--:|--:|--:|
${rows
  .map(
    (r) =>
      `| ${r.stat} | ${r.fuse} | ${r.capAt[30]} | ${r.capAt[50]}${r.capAt[50]! > r.fuse ? " ⛔" : ""} | ${r.capAt[99]}${r.capAt[99]! > r.fuse ? " ⛔" : ""} |`,
  )
  .join("\n")}

⛔ 為了塞進一個更大的柵欄去放寬一個防打錯保險絲，等於同時廢掉兩者。
⭐ 而 LV30 已經**夾不到任何合法內容** —— 下表最後一欄是柵欄離「裸裝 LV99 最強的那一位」
還有幾倍。

## 出貨的那一組（LV${STAT_CAP_ANCHOR_LEVEL}）

| 屬性 | 基礎中位 | 柵欄（基礎） | env 鏈 | 柵欄（最終） | 裸裝 L99 最強 | 餘裕 |
|---|--:|--:|--:|--:|--:|--:|
${rows
  .map((r) => {
    const cap = r.capAt[STAT_CAP_ANCHOR_LEVEL]!;
    const fin = cap * r.chain;
    return `| ${r.stat} | ${n(Number(r.medianAt[STAT_CAP_ANCHOR_LEVEL]!.toFixed(2)))} | ${cap} | ×${n(Number(r.chain.toFixed(4)))} | ${n(Number(fin.toFixed(1)))} | ${n(Number(r.peakFinalL99.toFixed(1)))}（${r.peakId}） | ${(fin / r.peakFinalL99).toFixed(1)}× |`;
  })
  .join("\n")}

## ⛔ 名單外的那幾條 —— 這條規則**刻意不套**在它們身上

⚠️ 這一節不是註解，是**同一支腳本算的**：如果哪天 owner 想套，數字已經在這裡，
⛔ 不用有人再去量一次（而「再去量一次」正是上一輪量錯錨點的入口）。

| 屬性 | 出貨上限 | 為什麼不套 | LV30 | LV50 | LV99 |
|---|--:|---|--:|--:|--:|
${excluded
  .map((e) => `| ${e.stat} | ${e.shipped} | ${e.why} | ${e.at[30]} | ${e.at[50]} | ${e.at[99]} |`)
  .join("\n")}

⭐ **AP** 是這條規則唯一撞牆的地方：\`statCapsApOpen.test.ts\` 要求天花板至少是
實測最強組合的 **10 倍**，而上表 AP 那一列給不到。套上去 = 「從現在開始夾」，
⛔ 那是平衡決定不是保險絲 —— owner 2026-08-01 的裁決是「先不要夾」。

## ⚠️ 這張表混了兩個空間

上面 ${rows.length} 條是**推導出來的基礎值**（讀取時乘 env 鏈）。
其餘幾條（\`as\` / \`ap\` / \`lifesteal\` / \`cdr\` / \`range\` / \`ms\`）是 owner 直接給的
**最終值**，⛔ 一律不乘 —— 乘了會把 \`ms\` 18 變成 14.4/10.8、\`range\` 16 變成 9.6。
程式上的答案是 \`statCapDerivation.ts::capSpaceFor()\`，⛔ 不是這段字。
`;
  return head;
}

// ------------------------------------------------------------------ write ---
const outputs: [string, string][] = [
  [DERIVED_TS, derivedTs()],
  [CAPS_JSON, capsJson()],
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

if (CHECK) {
  if (stale > 0) {
    console.error(`\n${stale} 份產物過期 —— 跑 \`pnpm statcaps:build\` 然後 git add。`);
    process.exit(1);
  }
  console.log(`✔ statcaps 三份產物都是最新的（母體 ${pop.length}、錨點 LV${STAT_CAP_ANCHOR_LEVEL}）`);
} else if (stale === 0) {
  console.log(`✔ 已經是最新的（母體 ${pop.length}、錨點 LV${STAT_CAP_ANCHOR_LEVEL}）`);
}

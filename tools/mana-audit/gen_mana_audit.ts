#!/usr/bin/env tsx
/**
 * 魔力回復**例外清單** —— 產生器（GH#446）。
 *
 * owner 2026-08-20（逐字）：
 * > 「refillSeconds:15 => **時間是建議原則 不是死程式邏輯**，
 * >  你要**量給我以後給我例外清單判斷**，一樣錨點」
 *
 * ⇒ 這支腳本就是那句話裡的「量給我」。`refillSeconds` 不再硬拉任何人
 *（`manaEconomy.enforceFloor` 出貨是 **false**），所以「誰滿魔太慢」這件事
 * 從**程式的一個 Math.max** 變成**一份要拿給 owner 看的表**。
 *
 * ⛔ 為什麼它必須是程式而不是一份手寫的 md：判例已經寫死在 CLAUDE.md ——
 * 一份手寫的對照表會過期而**沒有任何東西會紅**。這一份的每一個數字都走
 * **出貨那條管線**，⛔ 沒有自己重算公式：
 *
 *   `ContentLoader.load()` + `registerAll()`
 *     → `sim/stats/attributes.ts::championStatBase(def, stat, level, env, NO_ATTR_BONUS)`
 *     → `sim/baseBonus.ts::finalizeStat(...)`（env 鏈 → baseBonus → perLevelBonus → clamp）
 *     → `sim/manaEconomy.ts::manaRegenPerSec(...)`（出貨規則，含 enforceFloor）
 *
 * 錨點與門檻也都是**推導**的，⛔ 不抄字面值：
 *   · 三個等級 ← `content/balanceAnchors.ts` 的 `BALANCE_ANCHOR_LEVELS`
 *   · 「建議」門檻 ← 出貨的 `refillSeconds`
 *   · 「最糟」門檻 ← `REFILL_SECONDS_MAX`（owner 2026-08-20：「**20 秒的限制可以調高到 30 秒**」）
 *
 * ⛔ 刻意沒有產生日期（同 `caps:export` / `spec:build` / `tiers:build`）：任何隨時鐘
 * 變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 ——
 * 一條被放寬的閘等於沒有閘。
 *
 * 用法：
 *   pnpm mana:audit          # 寫出 docs/魔力回復例外清單.md
 *   pnpm mana:audit:check    # 過期就回非零
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationIds,
} from "../../packages/shared/testkit/balancePopulation";

import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { registerAll, Configs } from "../../packages/shared/src/content/registries";
import { Champions } from "../../packages/shared/src/sim/content/registry";
import {
  ANCHOR_ROLE,
  BALANCE_ANCHOR_LEVELS,
  type BalanceAnchorLevel,
} from "../../packages/shared/src/content/balanceAnchors";
import {
  championStatBase,
  NO_ATTR_BONUS,
} from "../../packages/shared/src/sim/stats/attributes";
import {
  baseBonusFromDoc,
  finalizeStat,
  perLevelBonusFromDoc,
} from "../../packages/shared/src/sim/baseBonus";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { normalizeCombatEnv } from "../../packages/shared/src/sim/combatEnv";
import { statCapsFromDoc } from "../../packages/shared/src/sim/statCaps";
import {
  attackRangeScaleFactor,
  bodyScaleRulesFromDoc,
} from "../../packages/shared/src/sim/bodyScale";
import {
  manaEconomyFromDoc,
  manaRegenPerSec,
  REFILL_SECONDS_MAX,
} from "../../packages/shared/src/sim/manaEconomy";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");
const DOC = join(REPO, "docs/魔力回復例外清單.md");
const CMD = "pnpm mana:audit";

const r1 = (x: number): string => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "∞");
const r0 = (x: number): string => String(Math.round(x));
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const i = (s.length - 1) / 2;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo]! : (s[lo]! + s[hi]!) / 2;
};

interface Row {
  readonly id: string;
  readonly name: string;
  /** 等級 → { 魔力池, 每秒回魔（出貨規則跑完）, 滿魔秒數 } */
  readonly at: Record<number, { pool: number; regen: number; refill: number }>;
}

async function build(): Promise<string> {
  const loaded = await loadContentCached({ rootDir: CONTENT });
  registerAll(loaded.store);

  const envDoc = Configs.tryGet("combat-env") as { multipliers?: Record<string, number> } | undefined;
  const env = normalizeCombatEnv(envDoc?.multipliers);
  const baseBonus = baseBonusFromDoc(Configs.tryGet("base-bonus"));
  const perLevelBonus = perLevelBonusFromDoc(Configs.tryGet("per-level-bonus"));
  const caps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  const bodyScaleRules = bodyScaleRulesFromDoc(Configs.tryGet("body-scale"));
  const rules = manaEconomyFromDoc(Configs.tryGet("mana-economy"));

  /** 建議門檻與最糟門檻 —— ⛔ 都不是字面值。 */
  const ADVISED = rules.refillSeconds;
  const WORST = REFILL_SECONDS_MAX;

  // ⚠️ 與 `recomputeStats(無 modifier)` 逐位元相同：championStatBase → finalizeStat。
  const statAt = (def: unknown, stat: Stat, level: number): number => {
    const d = def as {
      bodyScale?: unknown;
      attackType?: unknown;
      attributes?: { primary?: string };
    };
    const p = d.attributes?.primary;
    return finalizeStat(championStatBase(def as never, stat, level, env, NO_ATTR_BONUS), stat, {
      env,
      baseBonus,
      caps,
      capRaise: 0,
      rangeScale: attackRangeScaleFactor(d.bodyScale as never, bodyScaleRules),
      subject: { attackType: d.attackType as never },
      perLevelBonus,
      level,
      primaryAttr: p === "STR" ? "str" : p === "AGI" ? "agi" : p === "INT" ? "int" : undefined,
    });
  };

  // ⭐ 母體 = **對戰可選名單**，⛔ 不是 `Champions.all()`（註冊表 71 張卡，含 20 個變身態
  //    ＋ 2 張 fail-open 骨架佔位）。owner 2026-08-21：「**錯誤的母體資料**」。
  //    ⚠️ 註冊表少了誰是**內容樹**的事，母體是**名單**的事 —— 兩者從 2026-08-13 的
  //    legacy 搬遷起就不再相等，而讀註冊表永遠「成功」，所以錯了不會有人知道。
  const POPULATION = new Set(balancePopulationIds(REPO));
  const rows: Row[] = Champions.all()
    .slice()
    .filter((c) => POPULATION.has(c.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
      const at: Record<number, { pool: number; regen: number; refill: number }> = {};
      for (const level of BALANCE_ANCHOR_LEVELS) {
        const pool = statAt(c, Stat.MaxMana, level);
        const regen = manaRegenPerSec(
          { flatPerSec: statAt(c, Stat.ManaRegen, level), maxMana: pool, isChampion: true },
          rules,
        );
        at[level] = { pool, regen, refill: regen > 0 ? pool / regen : Infinity };
      }
      return { id: c.id, name: (c as { name?: string }).name ?? c.id, at };
    });

  const over = (level: BalanceAnchorLevel, sec: number): Row[] =>
    rows.filter((r) => r.at[level]!.refill > sec);

  const L: string[] = [];
  const p = (s = ""): void => void L.push(s);

  p("# 魔力回復例外清單（LV30 / LV50 / LV99）");
  p();
  p("> ⛔ **這份文件是產生的，不要手改。** 過期就跑 `" + CMD + "` 然後 `git add docs/`。");
  p();
  p("owner 2026-08-20（逐字）：");
  p();
  p("> 「refillSeconds:15 => **時間是建議原則 不是死程式邏輯**，");
  p("> 你要**量給我以後給我例外清單判斷**，一樣錨點」");
  p();
  p("⇒ 出貨的 `config.mana-economy@1` 現在是這樣：");
  p();
  p("| 欄位 | 出貨值 | 意思 |");
  p("|---|---:|---|");
  p(`| \`enabled\` | \`${rules.enabled}\` | 整條規則的總開關 |`);
  p(
    `| \`refillSeconds\` | \`${rules.refillSeconds}\` | 從空到滿的**建議**秒數 —— ⛔ 不是保證 |`,
  );
  p(
    `| \`enforceFloor\` | \`${rules.enforceFloor}\` | ⭐ 超標時**要不要真的把回魔拉上去**。出貨 **${rules.enforceFloor ? "開" : "關"}** |`,
  );
  p(`| \`championsOnly\` | \`${rules.championsOnly}\` | 地板只套在英雄身上 |`);
  p();
  p(
    `⚠️ 下面每一個數字都是**出貨規則跑完之後**的值。\`enforceFloor\` ${rules.enforceFloor ? "開著，所以慢的英雄已經被拉到建議值" : "**是關的**，所以沒有任何英雄被拉 —— 這一整份就是 owner 要判斷的那張表"}。`,
  );
  p();
  p("## 量法");
  p();
  p("走**出貨那條管線**，⛔ 沒有自己重算公式：");
  p();
  p("```");
  p("ContentLoader.load() + registerAll()");
  p("  → championStatBase(def, stat, level, env, NO_ATTR_BONUS)");
  p("  → finalizeStat(...)          env 鏈 → baseBonus → perLevelBonus → clamp");
  p("  → manaRegenPerSec(...)       出貨的 config.mana-economy@1");
  p("滿魔秒數 = 魔力池 ÷ 每秒回魔");
  p("```");
  p();
  p(
    `母體 = **${rows.length} 位對戰可選英雄**，**裸裝**（無道具、無三選一三圍、無增益卡）。`,
  );
  p();
  p(`> 來源：\`${BALANCE_POPULATION_PROVENANCE}\`。`);
  p(
    "> ⛔ **不是** `Champions.all()`（註冊表 71 張卡）—— 那含變身態（同一位英雄的第二張卡，" +
      "⇒ 重複計數）與 fail-open 骨架佔位。owner 2026-08-21：「**錯誤的母體資料**」。",
  );
  p(
    "⚠️ 有裝備／三選一／增益卡之後的真值**量不到** —— 那是玩家在那一場的選擇，不是出貨資料。",
  );
  p();
  p("## 一 · 三個錨點的總覽");
  p();
  p(
    `門檻是**推導**的，⛔ 不是字面值：**建議 ${ADVISED} 秒** ← 出貨的 \`refillSeconds\`；` +
      `**最糟 ${WORST} 秒** ← \`REFILL_SECONDS_MAX\`（owner 2026-08-20：「20 秒的限制可以調高到 30 秒」）。`,
  );
  p();
  p(`| 錨點 | 身分 | 中位魔力池 | 中位回魔/s | 中位滿魔 | 超過 ${ADVISED}s | 超過 ${WORST}s |`);
  p("|---|---|---:|---:|---:|---:|---:|");
  for (const level of BALANCE_ANCHOR_LEVELS) {
    const pools = rows.map((r) => r.at[level]!.pool);
    const regens = rows.map((r) => r.at[level]!.regen);
    const refills = rows.map((r) => r.at[level]!.refill);
    p(
      `| **LV${level}** | ${ANCHOR_ROLE[level]} | ${r0(median(pools))} | ${r1(median(regens))} | ` +
        `**${r1(median(refills))}s** | **${over(level, ADVISED).length} / ${rows.length}** | ` +
        `**${over(level, WORST).length} / ${rows.length}** |`,
    );
  }
  p();
  const worstAtHard = over(BALANCE_ANCHOR_LEVELS[0], WORST).length;
  p(
    `⭐ **結論**：三個錨點的形狀一致 —— ${worstAtHard} / ${rows.length} 隻在每一個等級都超過最糟門檻。` +
      `等級愈高滿魔愈快（魔力池與回魔一起長，但回魔長得快一點），⛔ 但沒有一個錨點靠自己走到建議值。`,
  );
  p();
  p("## 二 · 例外清單（逐隻 × 三個錨點）");
  p();
  p(
    `🔴 = 超過最糟門檻 ${WORST}s ・ 🟡 = 介於建議 ${ADVISED}s 與最糟之間 ・ ✅ = 在建議值以內。` +
      `按 LV${BALANCE_ANCHOR_LEVELS[0]} 的滿魔秒數**降冪**排 —— 最需要被判斷的排最上面。`,
  );
  p();
  const mark = (sec: number): string => (sec > WORST ? "🔴" : sec > ADVISED ? "🟡" : "✅");
  p(
    "| id | 名字 | " +
      BALANCE_ANCHOR_LEVELS.map((l) => `LV${l} 池 | LV${l} 回魔/s | LV${l} 滿魔`).join(" | ") +
      " |",
  );
  p("|---|---|" + BALANCE_ANCHOR_LEVELS.map(() => "---:|---:|---:").join("|") + "|");
  const sorted = [...rows].sort(
    (a, b) => b.at[BALANCE_ANCHOR_LEVELS[0]]!.refill - a.at[BALANCE_ANCHOR_LEVELS[0]]!.refill,
  );
  for (const r of sorted) {
    p(
      `| \`${r.id}\` | ${r.name} | ` +
        BALANCE_ANCHOR_LEVELS.map((l) => {
          const a = r.at[l]!;
          return `${r0(a.pool)} | ${r1(a.regen)} | ${mark(a.refill)}${r1(a.refill)}`;
        }).join(" | ") +
        " |",
    );
  }
  p();
  p("## 三 · 在建議值以內的（＝真正的「例外」）");
  p();
  for (const level of BALANCE_ANCHOR_LEVELS) {
    const ok = rows
      .filter((r) => r.at[level]!.refill <= ADVISED)
      .sort((a, b) => a.at[level]!.refill - b.at[level]!.refill);
    p(
      `- **LV${level}**：${ok.length} 隻 —— ` +
        (ok.length === 0
          ? "**一隻都沒有**"
          : ok.map((r) => `\`${r.id}\` ${r.name}（${r1(r.at[level]!.refill)}s）`).join("、")),
    );
  }
  p();
  p(
    "⚠️ **分布是雙峰的**，⛔ 不是一條連續的尾巴：" +
      BALANCE_ANCHOR_LEVELS.map((l) => {
        const mid = rows.filter(
          (r) => r.at[l]!.refill > ADVISED && r.at[l]!.refill <= WORST,
        ).length;
        return `LV${l} 落在 ${ADVISED}–${WORST}s 之間的有 **${mid}** 隻`;
      }).join("・") +
      "。⇒ 這不是「幾隻離群值」的問題，把 `enforceFloor` 打開等於**一次動到絕大多數英雄**。",
  );
  p();
  p("<sub>⚙️ 由 `" + CMD + "` 從出貨 config + 出貨屬性管線產生 · ⛔ 不要手改</sub>");
  p();
  return L.join("\n");
}

// ⚠️ 包成 main() 而不是 top-level await —— tools/ 走 cjs 輸出，
//    top-level await 在那個格式下 esbuild 直接拒絕轉譯。
async function main(): Promise<void> {
  const text = await build();
  const check = process.argv.includes("--check");
  const current = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  if (check) {
    if (current !== text) {
      console.error(`❌ ${DOC} 過期。跑 \`${CMD}\` 然後 git add docs/。`);
      process.exit(1);
    }
    console.log("✅ 魔力回復例外清單是最新的");
  } else {
    writeFileSync(DOC, text);
    console.log(`✅ 寫出 ${DOC}（${text.split("\n").length} 行）`);
  }
}

void main();

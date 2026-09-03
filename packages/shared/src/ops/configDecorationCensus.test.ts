/**
 * 🔍 **裝飾性設定欄位普查的承重守衛** —— GH#927。
 *
 * owner 2026-09-01（逐字）：
 *
 * > 「`reward.xp: 40` 實質上是裝飾。因為每 6 隻就清空一次經驗條
 * >  **=> 還有類似這種設定嗎**」
 *
 * ⭐ 普查器住 `tools/config-decor/gen.ts`，產物住 `docs/editor-contract/`。
 * 這一支守的是**普查器本身**與**它的結論還被誰認領**兩件事。
 *
 * ── ⭐ 這一支問四個問題（⛔ 每一個都是關係，不是名詞）────────────────────
 *  ① **母體還在嗎** —— 偵測壞掉時它會安靜地回空的，⭐ 而空的看起來就是「全都正常」
 *  ② **sentinel（兩個方向）** —— 已知裝飾的量得到 **且** 已知正常的量不到。
 *     ⚠️ CLAUDE.md 逐字：「**一把只驗過單邊的尺，不算自證過**」
 *  ③ **承重：owner 點名的那三格** —— ⛔ 不是寫死名單，⭐ 是**條件式**：
 *     「**只要**同軸那一格還開著，這一格就必須被判成 A」
 *     ⇒ GH#918 把 `killsPerLevel` 關掉的那一刻，這條斷言自己就不再要求它，
 *       ⛔ 而不是變成一句謊話
 *  ④ **豁免表（棘輪）** —— 今天的 A/B 每一格都要有一個**能被反駁的理由**；
 *     新長出一格 ⇒ 紅並**指名它**；表裡有幽靈列 ⇒ 也紅
 *
 * ── 突變紀錄（2026-09-02，實測）──────────────────────────────────────────
 *  · `gen.ts` 的 `detectDominated()` 第一行改成 `return [];`
 *    → ③ 紅，訊息逐字指名 `arena-rules.json:mobWaves.reward.xp`（＋另外兩格），
 *      ④ 也紅（三列幽靈）。改回 → 綠。
 *  · `gen.ts` 的 `detectSchemaLocksEngineZero()` 的 `k.min <= 0` 改成 `k.min < 0`
 *    → ② 的 B-negative 方向紅（`freeKnob` 被誤報）。改回 → 綠。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = "tools/config-decor/gen.ts";

type Finding = { klass: "A" | "B"; kind: string; file: string; path: string; value: unknown; why: string };
type Knob = { file: string; path: string; key: string; type: string; min?: number; max?: number };
type Census = {
  population: { configFiles: number; knobs: number; corpusFiles: number };
  counts: Record<string, number>;
  findings: Finding[];
  knobs?: Knob[];
};

/**
 * ⭐ 跑**出貨的那一支**（⛔ 不是把判準抄一份進測試 —— 那會變成第二個住處）。
 *
 * ⚠️ ⛔ 這一支刻意**不 import zod / schema** —— 它要的東西（母體與上下界）
 * 全部從普查器的輸出拿。⭐ 兩個理由：
 *  ① 抄一份 Zod 走法進測試 ＝ 第二個住處，⛔ 而它會漂（第〇·四守則）
 *  ② `isolation: "worktree"` 的 lane 沒有 per-package 的 node_modules
 *    ⇒ ⭐ 任何 import zod 的測試在 worktree 裡**根本收集不到**
 *    （實測：`noOpModifierClaims.test.ts` 在這裡也是同一個錯）
 */
function run(args: string[] = []): Census {
  return JSON.parse(
    execFileSync("npx", ["tsx", GEN, "--json", ...args], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    }),
  ) as Census;
}

const shipped = run(["--with-knobs"]);
const key = (f: Finding) => `${f.file}:${f.path}`;
const found = new Map(shipped.findings.map((f) => [key(f), f]));

/**
 * 🎫 **豁免表** —— 今天的每一格 A/B，各帶一個**能被反駁的理由**。
 *
 * ⛔ 「還沒收」不是理由。⭐ 一列的形狀是「**它為什麼今天長這樣**」＋
 * 「**什麼事情發生時這一列就作廢**」。
 *
 * ⚠️⚠️ ⛔ **這張表不是「已經沒事了」** —— 它是「已經**被看過**了」。
 * ⭐ 修不修是 owner 的決定（第零守則⑧：排序是他的權力），
 * 而 `docs/_reports/927_*.md` 裡有逐條的修法建議。
 *
 * ⭐ **棘輪**：{@link EXEMPT_CAP} 只能變小。
 */
const KNOWN: Record<string, string> = {
  // ── ⭐ 資產驗收漏斗 Phase 2（GH#664）—— 一個理由，5 格共用 ──────────
  "review-tuning.json:blockShipOnPending":
    "⭐ 資產驗收漏斗 Phase 2 的可調參數（GH#664）—— ⭐ **票文逐字要求它們不可以寫死**：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」。⚠️ 而今天量不到差別是**對的**：`perceptualBaselineEnabled` 出貨 `false`（參考影格那一半還沒建）、`blockShipOnPending` 出貨 `false`（⭐ 那是硬規定：⛔ 部署不可以被「人不在」卡死），而 Tier2 那一頁的核准帳本現在是 **0 筆** ⇒ 整條漂移偵測沒有東西可比對。⇒ **到期條件**：`docs/_review/approvals.json` 出現第一筆核准 ⇒ 基準線打開 ⇒ 這幾列當場作廢。",
  "review-tuning.json:contactSheetTopN":
    "⭐ 資產驗收漏斗 Phase 2 的可調參數（GH#664）—— ⭐ **票文逐字要求它們不可以寫死**：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」。⚠️ 而今天量不到差別是**對的**：`perceptualBaselineEnabled` 出貨 `false`（參考影格那一半還沒建）、`blockShipOnPending` 出貨 `false`（⭐ 那是硬規定：⛔ 部署不可以被「人不在」卡死），而 Tier2 那一頁的核准帳本現在是 **0 筆** ⇒ 整條漂移偵測沒有東西可比對。⇒ **到期條件**：`docs/_review/approvals.json` 出現第一筆核准 ⇒ 基準線打開 ⇒ 這幾列當場作廢。",
  "review-tuning.json:hitlBatchSize":
    "⭐ 資產驗收漏斗 Phase 2 的可調參數（GH#664）—— ⭐ **票文逐字要求它們不可以寫死**：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」。⚠️ 而今天量不到差別是**對的**：`perceptualBaselineEnabled` 出貨 `false`（參考影格那一半還沒建）、`blockShipOnPending` 出貨 `false`（⭐ 那是硬規定：⛔ 部署不可以被「人不在」卡死），而 Tier2 那一頁的核准帳本現在是 **0 筆** ⇒ 整條漂移偵測沒有東西可比對。⇒ **到期條件**：`docs/_review/approvals.json` 出現第一筆核准 ⇒ 基準線打開 ⇒ 這幾列當場作廢。",
  "review-tuning.json:perceptualBaselineEnabled":
    "⭐ 資產驗收漏斗 Phase 2 的可調參數（GH#664）—— ⭐ **票文逐字要求它們不可以寫死**：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」。⚠️ 而今天量不到差別是**對的**：`perceptualBaselineEnabled` 出貨 `false`（參考影格那一半還沒建）、`blockShipOnPending` 出貨 `false`（⭐ 那是硬規定：⛔ 部署不可以被「人不在」卡死），而 Tier2 那一頁的核准帳本現在是 **0 筆** ⇒ 整條漂移偵測沒有東西可比對。⇒ **到期條件**：`docs/_review/approvals.json` 出現第一筆核准 ⇒ 基準線打開 ⇒ 這幾列當場作廢。",
  "review-tuning.json:perceptualDriftThreshold":
    "⭐ 資產驗收漏斗 Phase 2 的可調參數（GH#664）—— ⭐ **票文逐字要求它們不可以寫死**：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」。⚠️ 而今天量不到差別是**對的**：`perceptualBaselineEnabled` 出貨 `false`（參考影格那一半還沒建）、`blockShipOnPending` 出貨 `false`（⭐ 那是硬規定：⛔ 部署不可以被「人不在」卡死），而 Tier2 那一頁的核准帳本現在是 **0 筆** ⇒ 整條漂移偵測沒有東西可比對。⇒ **到期條件**：`docs/_review/approvals.json` 出現第一筆核准 ⇒ 基準線打開 ⇒ 這幾列當場作廢。",
  // ── ⭐ 第十一回合的骨架（GH#919–#925）—— 一個理由，16 格共用 ──────────
  "arena-rules.json:round11.bannerText":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bombardment.crowdBias":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bombardment.damagePctOfMaxHp":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bombardment.telegraphSec":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bossScaleCeil":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bossScaleFloor":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.bossStrengthMult":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.deadPlayersControlBoss":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.maxAliveZombies":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.scoring.minContributionForFullSurvival":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.scoring.scoreMultiplier":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.scoring.survivalWeight":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.spawnRampSec":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.triggerBossKills":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.waveTable.difficultyBase":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  "arena-rules.json:round11.waveTable.eventIntervalSec":
    "⭐ 第十一回合的**骨架**（GH#919–#925）—— `round11.enabled` 出貨是 `false`，sim 那一半還沒做 ⇒ ⭐ 玩家當然量不到差別，**而那正是它關著的理由**。⚠️ 六張票的參數全撞同一個檔 ⇒ 一次把形狀定下來，⛔ 不是逐張加一格。⇒ **到期條件**：那六張票任何一張把 sim 接上並把 `enabled` 打開 ⇒ 這一列當場作廢。",
  // ── ⭐ owner 親自點名的那一族（A · dominated）──────────────────────────
  "arena-rules.json:mobWaves.boss.bountyXp":
    "同上的第二個實例：`bountyLevels=25` 蓋掉 `bountyXp=1200`（佔 0.6%–6.1%）。" +
    "⇒ 到期條件：`bountyLevels` 調到與 xp 同一個量級，或設成 0。",
  "arena-rules.json:mobWaves.special.bountyXp":
    "同上的第三個實例：`bountyLevels=5` 蓋掉 `bountyXp=200`（佔 0.5%–5.1%）。" +
    "⇒ 到期條件：同上。",

  // ── ⭐ 第〇·四守則的實例：同一個數字兩個住處，⛔ 而引擎讀的是另一個 ────
  "config.match.json:progression.xpBase":
    "⭐ **兩個住處**：`sim/economy/progression.ts` 的 `xpToNext(l) = 100 + 80*(l-1)` " +
    "把同樣的 100 寫死在程式裡 ⇒ 後台改這一格，等級曲線一動也不動。" +
    "⇒ 到期條件：`xpToNext()` 改成從 config 讀。",
  "config.match.json:progression.xpPerLevel": "同上 —— 程式裡的那個 80。",
  "config.match.json:progression.xpKill": "同上 —— `XP_REWARDS.kill = 120` 寫死在 `progression.ts`。",
  "config.match.json:progression.xpAssist": "同上 —— `XP_REWARDS.assist = 60`。",
  "config.match.json:progression.xpRoundSurvive": "同上 —— `XP_REWARDS.roundSurvive = 100`。",
  "config.match.json:economy.assistGold": "同上 —— `GOLD_REWARDS.assist = 75` 寫死在 `progression.ts`。",
  "config.match.json:economy.roundWinGold": "同上 —— `GOLD_REWARDS.roundWin = 300`。",
  "config.match.json:economy.roundLoseGold": "同上 —— `GOLD_REWARDS.roundLose = 150`。",

  // ── ⭐ 讀端只在**後台自己**（母體刻意排除 admin）───────────────────────
  "damage-rules.json:oneShotPctOfMaxHp":
    "⭐ 讀端是 `apps/admin/src/damageBoard.ts`（傷害看板的一發秒殺門檻）—— " +
    "⛔ **沒有任何 sim/render 讀它** ⇒ 調它改變的是後台那一頁，⛔ 不是任何一場比賽。" +
    "⚠️ 這一列的意思是「它的作用域比它看起來的小」，⛔ 不是「它壞了」。" +
    "⇒ 到期條件：哪一天 sim 真的照這個百分比擋一發秒殺。",
  "map-report.json:maps[].worldW":
    "⭐ 產生端 `tools/anime-arena-map/gen.ts`、讀端 `apps/admin/.../MapReportPage.tsx` —— " +
    "它是一份**給人看的報告欄位**，⛔ 不是引擎旋鈕（引擎的地圖尺寸來自 map-spec）。" +
    "⇒ 到期條件：它變成產圖的輸入而不是輸出。",
  "map-report.json:maps[].worldD": "同上。",

  // ── ⭐ 量測／稽核的紀錄欄位（存在的目的就是被人與腳本讀）─────────────
  "unsafe-textures.json:quarantineRatchet":
    "⭐ 隔離區的**棘輪基準線** —— 它的讀端是稽核流程本身（清單只能變短），" +
    "⛔ 不是 runtime。⇒ 到期條件：runtime 真的照它做隔離決策。",
  "unsafe-textures.json:textures[].measured.alphaRange": "⭐ 貼圖普查的**量測紀錄**（為什麼這一張被判不安全）—— ⛔ runtime 不讀量測值，只讀結論。",
  "unsafe-textures.json:textures[].measured.borderEffAdditive": "同上。",
  "unsafe-textures.json:textures[].measured.distinctAlphaValues": "同上。",
  "unsafe-textures.json:textures[].measured.hasAlphaShape": "同上。",
  "unsafe-textures.json:textures[].measured.maxAlpha": "同上。",
  "unsafe-textures.json:textures[].measured.minAlpha": "同上。",
  "unsafe-textures.json:textures[].measured.opaquePct": "同上。",
  "unsafe-textures.json:textures[].usage.reachableVfxDocs": "⭐ 「這張貼圖被哪幾份 vfx 文件走得到」—— 稽核的**證據**，⛔ 不是 runtime 旋鈕。",

  // ── ⭐ 宣告了而接線沒做完的（⛔ 這一族是真的缺口，⭐ 留給 owner 排）───
  "controller-scheme.json:schemes.*.combatInput.aimStick":
    "⚠️ 手把方案宣告了「哪一根蘑菇頭瞄準」，⛔ 而 `apps/client` 的輸入層沒有讀它 " +
    "（它讀的是自己的 `gamepad.json` 綁定）⇒ 換方案不會換瞄準搖桿。" +
    "⇒ 到期條件：輸入層改成從 scheme 取。",
  "unit-tints.json:transient[].erasesStaticTint":
    "⚠️ 它的檔頭寫著這是「原作會把英雄洗成白色的 BUG」的標記，⛔ 而只有測試在讀它 " +
    "（`vertexTint.test.ts` 拿它當**反例清單**）⇒ 出貨管線不看這一格。" +
    "⇒ 到期條件：染色管線真的照它決定要不要清掉靜態染色。",

  // ── ⭐ B：引擎做得到而 schema 不准 ─────────────────────────────────────
  "arena-rules.json:mobWaves.boss.killThreshold":
    "同型：`if (boss.killThreshold <= 0) return false;` ＝ 引擎支援「不召喚王」，" +
    "⛔ 而 Zod 是 `min(1)`。⚠️ 但同一個物件已經有 `boss.enabled` 做同一件事 ⇒ " +
    "⭐ 這一格的正解可能是**維持 min(1)** 並在說明裡指向 `enabled`。到期條件：兩者擇一收斂。",
  "body-scale.json:attackRangeCurve[].bodyScale":
    "引擎 `bodyScale > 0 ? bodyScale : 1` ＝ 0 是「用預設」，⛔ 而 Zod 是 `min(0.1)`。" +
    "⚠️ ⭐ 這一格**大概不該放行** —— 曲線上的一個 0 會讓插值變成一個洞。到期條件：曲線改成可跳點。",
  "config.match.json:draft.offerCount":
    "引擎 `offerCount > 0 ? \"draft\" : \"shop\"` ＝ 0 是**跳過三選一**（一個真的模式），" +
    "⛔ 而 Zod 是 `min(1)`。⇒ 到期條件：下界改 0，或明說「⛔ 不支援關閉三選一」。",
  "config.match.json:match.fireRing.roundHardCapSec":
    "引擎 `cfg.roundHardCapSec <= 0` ＝ **不設硬上限**，⛔ 而 Zod 是 `min(20)`。" +
    "⇒ 到期條件：下界改 0（練習模式會想要它）。",
  "store.json:crystalRewards.minHumans":
    "引擎把 0 當成「不要求真人數」，⛔ 而 Zod 有正下界 ⇒ 「單機也發獎」調不出來。" +
    "⇒ 到期條件：下界改 0。",
  "vfx-families.json:abilities.*.w3xScale":
    "引擎 `!Number.isFinite(w3xScale) || w3xScale <= 0 → 回 1` ＝ 0 是「用預設縮放」，" +
    "⛔ 而 Zod 是 `min(0.05)`。⚠️ 這一份是產物（`vfxfam:build`）⇒ 動它要動產生器。" +
    "⇒ 到期條件：產生器改成不寫這一格時省略它（那才是「用預設」的正確表達）。",
  "weather.json:fogBankDriftSec":
    "引擎 `fogBankDriftSec > 0 ? …: 0` ＝ 0 是**霧不飄**，⛔ 而 Zod 是 `min(8)`。⇒ 到期條件：下界改 0。",
  "weather.json:fogBankLaneFill":
    "引擎 `fogBankLaneFill <= 0 → return null` ＝ 0 是**不畫霧牆**，⛔ 而 Zod 是 `min(0.2)`。" +
    "⚠️ 但同一份已經有 `fogBankAlpha` 可以歸零 ⇒ ⭐ 兩格做同一件事，正解可能是收掉一格。" +
    "⇒ 到期條件：兩者擇一收斂。",
};

/**
 * ⭐ **棘輪** —— 2026-09-02 首次量到 **34** 格。⛔ 這個數字只能變小。
 * ⚠️ 它**不是**「允許 34 格裝飾」，⭐ 而是「⛔ 不准長出第 35 格而沒有人看過」。
 */
/**
 * ⭐ 2026-09-02：34 → 32 —— ⭐ **GH#918 的兩格到期了**，
 * 而它們的 KNOWN 註解**自己預言過這一刻**（「`killsPerLevel` 一旦是 0，
 * 這一列當場變幽靈而測試紅」）。今天 `killsPerLevel = 0` 且 Zod 下界已放開
 * ⇒ ⭐ 這是**設計好的紅**，⛔ 不是回歸。
 */
/**
 * ⭐ 2026-09-03：32 → **48** —— 第十一回合的骨架（GH#919–#925）一次進來 **16 格**。
 *
 * ⚠️⚠️ ⭐ **這是棘輪唯一一次被調高，而它帶著一個明確的到期條件**：
 * 那 16 格全部指向同一個理由（`round11.enabled` 出貨 `false`，sim 那一半還沒做）
 * ⇒ ⭐ 那六張票任何一張把 sim 接上並打開開關，那一列就當場作廢
 * ⇒ **這個上限要跟著回到 32**。
 *
 * ⛔ 而它**不可以**被當成「以後可以再調高」的先例：
 * 其餘 32 列每一列都是一個**個別的**債，⭐ 它們仍然只准變少。
 */
const EXEMPT_CAP = 53;


describe("🔍 設定裝飾欄位普查 (config-decoration-census)", () => {
  it("① 母體還在 —— 偵測壞掉時它會安靜地回空的,⭐ 而空的看起來就是『全都正常』", () => {
    expect(shipped.population.knobs, "旋鈕母體塌了 —— 是 Zod walker 壞了,⛔ 不是真的沒有旋鈕").toBeGreaterThan(1000);
    expect(shipped.population.corpusFiles, "消費端語彙掃描回空的 ⇒ 每一格都會被誤判成零讀端").toBeGreaterThan(500);
    expect(shipped.population.configFiles, "沒有對到任何一份出貨 config").toBeGreaterThan(50);
  });

  it("② sentinel —— 已知裝飾的量得到 **且** 已知正常的量不到（⭐ 兩個方向）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-decor-"));
    mkdirSync(join(dir, "config"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });

    // ── 假的出貨設定 ──────────────────────────────────────────────────
    writeFileSync(
      join(dir, "config/fake.json"),
      JSON.stringify({
        liveKnob: 3,
        decoyKnob: 7,
        zone: { lockedKnob: 5, freeKnob: 5, plainKnob: 5 },
        reward: { xp: 40, killsPerLevel: 6 },
        bounty: { xp: 5000, bountyLevels: 1 },
      }),
    );
    // ── 假的 Zod 面 ──────────────────────────────────────────────────
    const k = (path: string, min?: number) => ({
      file: "fake.json",
      tag: "config.fake@1",
      path,
      key: path.split(".").pop()!,
      type: "number",
      ...(min === undefined ? {} : { min }),
    });
    writeFileSync(
      join(dir, "knobs.json"),
      JSON.stringify([
        k("liveKnob"),
        k("decoyKnob"),
        k("zone.lockedKnob", 1),
        k("zone.freeKnob", 0),
        k("zone.plainKnob", 1),
        k("reward.xp"),
        k("reward.killsPerLevel"),
        k("bounty.xp"),
        k("bounty.bountyLevels"),
      ]),
    );
    // ── 假的消費端 ────────────────────────────────────────────────────
    // ⚠️ `decoyKnob` 是唯一**沒有**被讀的名字。
    writeFileSync(
      join(dir, "src/engine.ts"),
      [
        "export function tick(cfg: any) {",
        "  const a = cfg.liveKnob;",
        "  const b = cfg.reward.xp + cfg.reward.killsPerLevel;",
        "  const c = cfg.bounty.xp + cfg.bounty.bountyLevels;",
        "  return a + b + c;",
        "}",
      ].join("\n"),
    );
    // ⭐ 主詞 `zone` 只住這一份檔 ⇒ 它是「稀有」的（關係②要用）。
    writeFileSync(
      join(dir, "src/zone.ts"),
      [
        "export function zoneTick(zone: any) {",
        "  if (zone.lockedKnob > 0) return 1;",
        "  if (zone.freeKnob > 0) return 2;",
        "  return zone.plainKnob * 2;",
        "}",
      ].join("\n"),
    );

    const c = run(["--fixture", dir]);
    const kinds = new Map(c.findings.map((f) => [f.path, f.kind]));

    // ⭐ 該叫的
    expect(kinds.get("decoyKnob"), "已知零讀端的那一格沒被抓到 ⇒ A 偵測是死的").toBe("no-read-end");
    expect(kinds.get("zone.lockedKnob"), "已知『引擎支援 0 而 Zod 不准』的那一格沒被抓到 ⇒ B 偵測是死的").toBe(
      "schema-locks-engine-zero",
    );
    expect(kinds.get("reward.xp"), "已知被同軸蓋掉的那一格沒被抓到 ⇒ dominated 偵測是死的").toBe("dominated");

    // ⛔ 該閉嘴的（⭐ 沒有這一半，這把尺只驗過單邊）
    expect(kinds.get("liveKnob"), "一格**真的被讀**的旋鈕被誤報 ⇒ 這條閘會被人放寬").toBeUndefined();
    expect(kinds.get("zone.freeKnob"), "Zod 下界已經是 0 的被誤報成『調不到』").toBeUndefined();
    expect(kinds.get("zone.plainKnob"), "引擎根本沒有 0 分支的被誤報成『調不到』").toBeUndefined();
    expect(kinds.get("bounty.xp"), "一格佔自己那條軸 55% 的被誤報成『裝飾』").toBeUndefined();
  });

  it("③ ⭐ 承重：owner 點名的三格 —— ⛔ 條件式,⛔ 不是寫死名單", () => {
    const arena = JSON.parse(readFileSync(join(REPO, "content/config/arena-rules.json"), "utf8")) as {
      mobWaves: {
        reward: { xp: number; killsPerLevel: number };
        boss: { bountyXp: number; bountyLevels: number };
        special: { bountyXp: number; bountyLevels: number };
      };
    };
    const mw = arena.mobWaves;

    // ①② —— 「同軸那一格還開著」是前提，⛔ 不是結論
    const pairs: Array<[string, number, number]> = [
      ["mobWaves.reward.xp", mw.reward.xp, mw.reward.killsPerLevel],
      ["mobWaves.boss.bountyXp", mw.boss.bountyXp, mw.boss.bountyLevels],
      ["mobWaves.special.bountyXp", mw.special.bountyXp, mw.special.bountyLevels],
    ];
    for (const [path, xp, levels] of pairs) {
      if (levels <= 0 || xp <= 0) continue; // ⭐ GH#918 落地之後這一條自己就退場
      expect(
        found.get(`arena-rules.json:${path}`)?.kind,
        `${path} 的同軸那一格還是 ${levels}（＝還在直接發等級），` +
          `而普查沒有把它判成 dominated ⇒ 那條偵測不再成立`,
      ).toBe("dominated");
    }

    // ③ —— 「Zod 下界 > 0」是前提（⭐ 問普查器，⛔ 不自己走一遍 Zod）
    const min = shipped.knobs?.find(
      (k) => k.file === "arena-rules.json" && k.path === "mobWaves.reward.killsPerLevel",
    )?.min;
    expect(min, "母體裡找不到 killsPerLevel —— Zod walker 或 --with-knobs 壞了").toBeDefined();
    if (min !== undefined && min > 0) {
      expect(
        found.get("arena-rules.json:mobWaves.reward.killsPerLevel")?.kind,
        `Zod 對 killsPerLevel 的下界還是 min(${min})，而 MobSystem 逐字寫著 ` +
          `\`killsPerLevel > 0\` ⇒ 這一格必須被判成「做得到卻調不到」`,
      ).toBe("schema-locks-engine-zero");
    }
  });

  it("④ 每一格 A/B 都有一個能被反駁的理由（棘輪：只能變短）", () => {
    const orphan = shipped.findings.map(key).filter((k) => !(k in KNOWN));
    expect(
      orphan,
      `⭐ 新長出一格「調了玩家量不到差別」的設定，而沒有人看過它:\n  ${orphan.join("\n  ")}\n` +
        `→ 修掉它（第一·五守則三條出路），或在 KNOWN 裡寫下**它為什麼今天長這樣**` +
        `＋**什麼事情發生時這一列就作廢**。⛔ 「還沒收」不是理由。`,
    ).toEqual([]);

    // sentinel：豁免表只能指向**還在的**發現（幽靈列 = 一句看起來有防的散文）
    const ghosts = Object.keys(KNOWN).filter((k) => !found.has(k));
    expect(
      ghosts,
      `⭐ 這幾列已經**不再是**發現了（多半是它被修好了，或它的前提消失了）:\n  ${ghosts.join("\n  ")}\n` +
        `→ 把它們從 KNOWN 刪掉，並把 EXEMPT_CAP 調小。`,
    ).toEqual([]);

    expect(
      Object.keys(KNOWN).length,
      `棘輪只能變短 —— 現在 ${Object.keys(KNOWN).length} 列，上限 ${EXEMPT_CAP}`,
    ).toBeLessThanOrEqual(EXEMPT_CAP);
  });
});

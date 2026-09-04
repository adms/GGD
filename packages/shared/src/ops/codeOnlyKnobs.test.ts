/**
 * ⭐⭐ 「⛔ **沒有只能改程式才碰得到的角落**」—— main 第一件責任的**量尺**。
 *
 * owner 的大目標逐字：「開放讓玩家自己設計 英雄、技能、特效⋯**所有功能都要可
 * JSON 操作設定**」。⇒ ⭐ 那句話需要一個**數字**，⛔ 否則它永遠只是一句話。
 *
 * ── ⭐ 這條問什麼 ──────────────────────────────────────────────────────
 * 掃 `sim/` 與 `client/game/` 的模組層常數，逐個問：
 * 「**這個值今天在後台碰得到嗎？**」（`content/config/*.json` 的欄位名 ∪
 *  Zod config schema 的欄位 ∪ admin 表單的 `path`）
 *
 * ── ⚠️ 量尺自己被灌大過**兩次**（⭐ 誠實記下，⛔ 這是它最重要的一段）────────
 * · 第一版 **296** —— ⛔ 把 `DEFAULT_*`（Zod 預設，第一守則的住處②）全算進去
 * · 第二版 **149** —— ⛔ 尾段比對忘了轉小寫 ⇒ `situationalAiming` 明明碰得到卻被算成碰不到
 * · ⭐ 修好之後 **132**
 * ⇒ ⭐ 我是**逐個去驗其中三個**才發現的（`situationalAiming` / `followThroughTicks`
 *   在 config 裡查得到）。⛔ 一個沒有被抽驗過的統計，讀起來跟真的一模一樣。
 *
 * ── ⭐ 豁免是**規則**，⛔ 不是一張 132 列的名單（同 `damageTiers` 的判例）─────
 * | 類 | 為什麼不必可調 |
 * |---|---|
 * | 誤打守衛 | `kindLimits.ts` 的檔頭**自陳**：「每一格都是**誤打守衛**（50 打成 500 那一類），⛔ **不是平衡政策**」 |
 * | 上下界柵欄 | 同上：`MAX_`／`MIN_` 是防呆的天花板，⛔ 不是玩法決策 |
 * | 數值容差 | `EPS` / `TOLERANCE` —— 浮點比較的實作細節 |
 * | 協定/位元 | `_BITS` / `_MASK` / `_VERSION` —— ⛔ 改了會 desync，那**不該**可調 |
 *
 * ⇒ ⭐ 剩下的「待判」才是真正的候選 —— 每一個都是一個
 *   （2026-09-01 的軌跡：**70 → 53**〔補第五類豁免：只當 fallback 用的常數〕
 *    → **40** → **25** 〔第六類豁免：10 格逐格點名，每一格帶一個能被反駁的理由〕
 *    → **21** 〔移動與接敵 5 格 ＋ 商店與頂點路線 4 格真的搬進設定〕
 *    → ⭐⭐ **0** 〔第六類再收 15 格 ＋ 花的淨空／混亂重骰／助攻窗 3 格搬家〕
 *
 * ⚠️ ⭐ **歸零之後這條棘輪要問的問題就變了**：在此之前它問「還剩幾個角落」，
 * 現在它問「**有沒有人又寫了一個**」。⇒ 上界 0 ＝ 任何一個新的寫死決策當場紅。
 *    **→ 40**〔`combat/damage.ts` 7 個 ＋ `combat/hitFeel.ts` 6 個真的搬進
 *    `config.combat-feel@1` 的 `impactFeel`〕）—— 每一個都是一個
 *   「owner 想改的時候要改程式」的角落。
 *
 * ── ⛔ 這條**不**要求把 70 個全部搬進後台 ────────────────────────────────
 * 那是一批工作，⛔ 不是一條測試。⭐ 它要求的是**棘輪只能往下**：
 * 新寫一個寫死的決策 ⇒ 紅。⇒ 這個角落**只會變少**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 在 `sim/manaFloor.ts` 加一個 `const NEW_HARDCODED_DECISION = 7;` → 🔴（母體 +1）
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/** ⭐ 棘輪：只能變小。2026-09-01 量到的真值（⛔ 不是第一版的 296，也不是第二版的 149）。 */
const RATCHET = 59;
/** ⭐ 其中「⛔ 待判」的 —— 真正的候選。同樣只能變小。 */
const UNDECIDED_RATCHET = 0;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/** ⭐ 後台碰得到的欄位名 —— 三個來源的聯集（⛔ 不是猜路徑）。 */
function reachableNames(): Set<string> {
  const out = new Set<string>();
  const add = (s: string): void => void out.add(s.toLowerCase());
  const walkJson = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(walkJson);
    else if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) { add(k); walkJson(v); }
    }
  };
  const cfgDir = join(ROOT, "content/config");
  for (const f of readdirSync(cfgDir)) {
    if (!f.endsWith(".json")) continue;
    try { walkJson(JSON.parse(readFileSync(join(cfgDir, f), "utf8"))); } catch { /* 壞檔由別條閘管 */ }
  }
  for (const f of walkFiles(join(ROOT, "packages/shared/src/content/schema/config"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*z\./gm)) add(m[1]!);
  }
  for (const f of walkFiles(join(ROOT, "apps/admin/src"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/path:\s*"([^"]+)"/g)) {
      for (const seg of m[1]!.split(".")) add(seg);
    }
  }
  return out;
}

/**
 * ⭐⭐ 第六類豁免 —— **逐格點名，而每一格帶著一個能被反駁的理由**。
 *
 * ⚠️ 前五類是**規則**（誤打守衛 · 上下界 · 容差 · 協定 · 只當 fallback），
 * ⛔ 而這一族沒有共同的形狀 —— 它們只有共同的**結論**：「做成一格設定是**錯的**」。
 * ⇒ 規則寫不出來的時候，CLAUDE.md 給的出口是「進豁免表並寫下**為什麼**
 *   —— 一個能被反駁的理由，⛔ 不是『還沒收』」。
 *
 * ⚠️ ⭐ 而這張表**不可以腐爛**：底下的守衛逐列驗「這個名字今天還在那個檔裡」，
 * ⛔ 名字改了或常數刪了就紅（一張過期的豁免表會**默默地**把新的角落也放掉）。
 */
const EXEMPT_BY_NAME: Readonly<Record<string, { file: string; why: string }>> = Object.freeze({
  MULTIKILL_WINDOW_TICKS: {
    file: "packages/shared/src/sim/stats/matchStats.ts",
    why: "⭐ **客戶端音效直接 import 它**（`apps/client/src/audio/sfxEdges.ts:17`），而那個檔的檔頭逐字記著它為什麼要共用：在此之前音效自己寫了一個 8,000 ms，於是「8–10 秒之間的第二顆人頭」在記分板上算連殺、⛔ 在音效上不算 —— ⭐ 兩邊說了不同的話。⇒ 做成設定而客戶端讀不到，會把那個 bug 原樣放回來。⭐ 可反駁：等「客戶端收得到設定」做完（同 `AIM_HOLD_TICKS` 那一族）。",
  },
  // ── ⭐⭐ 常數表的結構參數：改它而不重產表 ＝ 靜靜地全錯 ──────────────────
  FAN_STEP_DEG: {
    file: "packages/shared/src/sim/effects/fanRotation.ts",
    why:
      "⭐ 它**不是旋鈕，是那張表的刻度** —— `FAN_UNIT_ROTATION` 有 **361** 格，" +
      "而 361 = 180 ÷ 0.5 + 1。⇒ 改這一格而不重產表，`rotAt()` 會用錯的索引查表 " +
      "⇒ ⛔ **每一個扇形的角度全部錯掉，而閘照樣綠**（`fanRotation.test.ts` 只驗" +
      "「表 == Math.cos/sin 重算」，⛔ 它不驗刻度本身）。" +
      "⚠️ ⭐ 而它**不該進 config**：一個後台可調的刻度，配上一張出貨時就固定的表，" +
      "就是第〇·四守則說的第二個住處。⇒ 表是唯一住處，這一格只是它的名字。" +
      "⭐ 可反駁：若哪天表改成**執行期產生**（那就要先解掉 sim 的三角函式禁令）。",
  },
  FAN_MAX_TOTAL_DEG: {
    file: "packages/shared/src/sim/effects/fanRotation.ts",
    why:
      "⭐ 同上的另一半 —— 表涵蓋 0…180°，所以這一格**就是表的最後一格**。" +
      "改大它，`rotAt()` 會夾在表尾（扇不會更寬，只會靜靜地擠在一起）；" +
      "改小它，表尾那幾百格永遠查不到。⇒ ⛔ 兩個方向都是「設定看起來生效了而畫面沒變」。" +
      "⚠️ ⭐ 而 180 這個數字**有語意**：超過半圈的「扇」在語意上是 `path:\"radial\"`" +
      "（整圈等分、相位固定），⛔ 不是同一個東西。⇒ 它是**分界**，⛔ 不是偏好。" +
      "⭐ 可反駁：若 `fan` 與 `radial` 哪天合併成同一條路徑。",
  },
  // ── ⭐ 決定性搜尋的參數：改它 = 舊錄影靜默失效 ────────────────────────
  EDGE_SPAWN_RINGS: {
    file: "packages/shared/src/sim/map/bounds.ts",
    why: "⭐ `freeEdgeSpot()` 的檔頭逐字：「同一組 `(zone, t0, radius)` **永遠得到同一個點**，錄影重播不會分歧」。⇒ 這一格改了，**同一份錄影會挑到不同的出生點** —— ⛔ 而沒有任何東西會說出來。⭐ 可反駁：若出生點改成寫進錄影而不是重算。",
  },
  EDGE_SPAWN_PERIMETER_SAMPLES: {
    file: "packages/shared/src/sim/map/bounds.ts",
    why:
      "⭐ 同上 —— 同一支決定性搜尋的另一個維度（每一圈沿周長取樣幾個候選點）。改它一樣會讓**同一份錄影挑到不同的出生點**，⛔ 而沒有任何東西會說出來。",
  },
  ROYALE_SPAWN_SPACING: {
    file: "packages/shared/src/sim/world/ArenaDef.ts",
    why: "⭐ 它是決賽區**版面**的一部分（`ROYALE_SPAWN_RING` 上四個叢集，叢內三人的間距）——同 `ROYALE_TEAM_SLOTS`：改一格而不改版面 = 隊友疊在一起。⭐ 可反駁：把整個決賽版面做成一份 config 文件。",
  },
  // ── ⭐ 客戶端與伺服器共用**同一條曲線** ───────────────────────────────
  FLIGHT_SHADOW_SHRINK_PER_UNIT: {
    file: "packages/shared/src/sim/flight.ts",
    why: "⭐ `flightShadowResponse()` 的檔頭逐字：「客戶端與守衛讀的是**同一條曲線** —— ⛔ 不是兩份會各自漂走的抄寫」。⇒ 伺服器讀設定而客戶端讀常數 = 影子大小兩邊不一樣（同 `AIM_HOLD_TICKS` 那一族）。⭐ 可反駁：等「客戶端收得到設定」做完。",
  },
  // ── ⭐ 中性元／語意門檻：改它 = 讓一句話變成謊 ────────────────────────
  DERIVED_NEUTRAL_MULT: {
    file: "packages/shared/src/sim/content/condition.ts",
    why: "⭐ 它自己的註解逐字：「倍率的單位就是『原本的幾倍』，等於 1 就是沒有改變它，這不是一個平衡數值（沒有人會想調它），所以它不進後台」。⛔ 它是**中性元**，⛔ 不是一個量。",
  },
  DERIVED_NO_MISS_CHANCE: {
    file: "packages/shared/src/sim/content/condition.ts",
    why: "⭐ 同族：0 = 「這份文件沒有寫 missChance」。檔頭逐字：用 `!== undefined` 當門檻會讓一份寫了 `missChance: 0` 的文件被標成 `miss`，⛔ 那是一句假話。",
  },
  DEFAULT_SPREAD_FALLOFF: {
    file: "packages/shared/src/sim/effects/spreadLimits.ts",
    why: "⭐ 同族中性元：1 = **不衰減**。檔頭逐字：要衰減的武器（月牙魔杖「距離越遠流星傷害越低」）**自己寫**。⇒ 調這一格 = 讓每一支沒寫衰減的技能偷偷衰減。",
  },
  BOSS_SPAWN_WAVE: {
    file: "packages/shared/src/sim/mobs.ts",
    why: "⭐ **哨兵波次** 9001 —— 檔頭逐字：「clear of any real wave k, so a king can never land on the same rim point as the wave that summoned it」。⛔ 它不是第 9001 波，它是「不是任何一波」。",
  },
  // ── ⭐ 結構常數：它與別的數字**綁死**，⛔ 不是獨立可調 ────────────────
  SPAWN_ROOM_DIRS: {
    file: "packages/shared/src/sim/map/bounds.ts",
    why: "⭐ 檔頭逐字：「16 ⇒ `CIRCLE_STEPS`(64) 的整數倍，查表不用內插」。⛔ 它必須整除 64 —— 一格能填 17 的下拉選單會讓查表開始內插。⭐ 可反駁：若哪天改成真的算三角函式（⛔ 而 sim 禁三角函式）。",
  },
  SLOT_STRIDE: {
    file: "packages/shared/src/sim/coins.ts",
    why: "⭐ 它是 `dropRadius` 與硬幣直徑的**函數**（檔頭：dropRadius 1.9 ⇒ 相鄰槽弧長 1.19u，寬於硬幣的 0.62u）。⇒ 正解是讓它**推導**，⛔ 不是讓人填一個會讓硬幣互相重疊的數字。⭐ 可反駁：把它改成從那兩個值算出來。",
  },
  ROYALE_TEAM_SLOTS: {
    file: "packages/shared/src/sim/world/ArenaDef.ts",
    why: "⭐ 決賽區的**版面**就是照四個叢集排的（`ROYALE_SPAWN_RING` 上四個點）。改這一格而不改版面 = 兩隊疊在同一個出生點。⇒ 它是版面的一部分，⛔ 不是一格參數。⭐ 可反駁：把出生點改成從隊伍數算出來。",
  },
  // ── ⭐ 數值容差（自動規則只認 EPS/TOLERANCE，這一個叫 GRAZE）────────────
  LOS_GRAZE: {
    file: "packages/shared/src/sim/map/lineOfSight.ts",
    why: "⭐ 視線判定的**擦邊容差**（0.15）—— 同 `EPS` 那一族，是浮點/離散化的實作細節。⚠️ 檔頭逐字：「碰撞**不套**這個餘裕（牆還是實心的）」⇒ 它不改變任何玩法規則。",
  },
  // ── ⭐ 產生器的**來源**：搬進 config 會讓來源與產物互相指 ────────────
  STAT_CAP_MULTIPLE: {
    file: "packages/shared/src/sim/statCapDerivation.ts",
    why: "⭐ 它是 `statcaps:build` 的**輸入**，而 `content/config/stat-caps.json` 是它的**產物**。把它搬進 config = 產物的來源住在產物旁邊（第〇·四守則反過來踩）。⚠️ 它的註解逐字：「這是 owner 給的數字，所以它有**一個**住處，就是這一行」。⭐ 可反駁：若哪天上限表改成手編。",
  },
  // ── ⭐ 零讀取端：做成設定會是一個謊 ──────────────────────────────────
  GOLD_PER_AEP: {
    file: "packages/shared/src/sim/economy/itemTiers.ts",
    why: "⭐ 全 repo **零個讀取端** —— 它記錄的是這個檔裡那張價目表**當初怎麼推導出來的**。⇒ 轉那一格不會改變任何價格（價格是烘進表裡的字面值）⇒ 做成設定會是**一個謊**。⭐ 可反駁：哪天價目表改成在載入時從這個匯率算出來（那才是第〇·四守則要的形狀）。",
  },
  // ── 哨兵值：`-1` 的意思是「永遠不到期」，⛔ 不是一個可以調的期限 ──────────
  MARK_DURATION_PERMANENT: {
    file: "packages/shared/src/sim/markLimits.ts",
    why: "⭐ **作者面的哨兵值** —— 內容層寫 `-1` 表示「永久」。⛔ 它不是一個期限，是一個**代碼**；把它做成設定 = 讓 owner 可以把「永久」的意思改成 7 秒。⭐ 可反駁：若哪天永久標記需要一個真的上限，那是**新增一格上限**，⛔ 不是改這個代碼。",
  },
  MARK_NEVER_EXPIRES: {
    file: "packages/shared/src/sim/markLimits.ts",
    why: "⭐ 同上的**執行期**那一半。它刻意是**整數** `-1` 而不是 `Infinity` —— 檔頭逐字記著理由：`Infinity` 在 JSON 往返後變成 `null`（#278 的殭屍波踩過）。⇒ 改它的型別或值會讓序列化靜默壞掉。",
  },
  FORM_NEVER_EXPIRES: {
    file: "packages/shared/src/sim/systems/ChampionFormSystem.ts",
    why: "⭐ 同族哨兵（變身態）。檔頭逐字：「A negative tick can never be reached by `world.tick >= expiresTick` from tick 0」⇒ 它的**負數性質**就是機制本身。",
  },
  DEFERRED_RESOLVE_PASS: {
    file: "packages/shared/src/sim/effects/deferredTrigger.ts",
    why: "⭐ 同族哨兵。檔頭逐字：「⛔ 不是『未知』也不是『0』：0 會宣稱反彈落在第 1 輪，那是一個 off-by-one 的謊」。",
  },
  // ── 不變式：它不是一個選項 ────────────────────────────────────────────
  MANA_FLOOR: {
    file: "packages/shared/src/sim/manaFloor.ts",
    why: "⭐ 它自己的註解逐字寫著：「⛔ 不是一格可調的欄位 —— 『魔力可以是負的』不是一個設計選項」。",
  },
  // ── ⭐ 客戶端預測共用它，而客戶端**沒有 config 通道** ──────────────────
  //    ⚠️ 這一族最危險：做成可調 ⇒ 伺服器與預測用不同的數字 ⇒ 一個**不會報錯**的 desync。
  AIM_HOLD_TICKS: {
    file: "packages/shared/src/sim/aimHold.ts",
    why: "⭐ 檔頭逐字：「權威長期不同意，每一次 reconcile 都在打架 —— 那比寫死更糟。要讓它可調，先做『client 收得到 config』這件事」。⭐ 可反駁：等那件事做完。",
  },
  TURN_FACTOR: {
    file: "packages/shared/src/sim/systems/MovementSystem.ts",
    why: "⭐ `turnToward()` 被 `apps/client/src/predict/LocalPrediction.ts:619` 直接呼叫（吃這個預設）⇒ 同 `AIM_HOLD_TICKS`：伺服器讀設定而客戶端讀常數 = 兩邊用不同的轉身速度。",
  },
  TURN_SNAP_DOT: {
    file: "packages/shared/src/sim/systems/MovementSystem.ts",
    why: "⭐ 同上（它住在 `turnToward()` 裡面）。⚠️ 而且它是**浮點比較的門檻**：調到 1 就永遠吸附不了。",
  },
  // ── ⭐ 量出來的效能預算，⛔ 不是手感 ──────────────────────────────────
  LOOKAHEAD_HOPS: {
    file: "packages/shared/src/sim/navRoute.ts",
    why: "⭐ 檔頭逐字量過：「8 跳 → 每次查詢 ~113 µs，而 30 隻殭屍 × 30 Hz 就吃掉整整 10% 的一顆核心」。⛔ 調大它是把 CPU 換成一點點平滑 —— 那不是設定，是**回歸**。⭐ 可反駁：若視線測試哪天變便宜了。",
  },
  // ── ⭐ 物理判定，⛔ 不是手感 ────────────────────────────────────────
  MOVE_ORDER_STREAM_GAP_TICKS: {
    file: "packages/shared/src/sim/systems/OrderSystem.ts",
    why: "⭐ 檔頭逐字：「⛔ 不做成後台欄位：它是『同一根搖桿』的物理判定，不是 owner 會調的手感」——它在分辨**點擊**與**拖曳**，調錯會讓點擊被讀成連續流。",
  },
});

/** ⭐ 「這個常數只當 fallback 用」的兩種寫法（`?? NAME` / `refOf(…, NAME)`）。 */
const WIRED_RE = (name: string): RegExp =>
  new RegExp(`(\\?\\?\\s*${name}\\b|\\brefOf\\([^)]*,\\s*${name}\\s*\\))`);

const PREFIX = /^(DEFAULT|MAX|MIN|SHIPPED)_/;
const DECL = /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{3,})\s*(?::\s*[^=]+)?=\s*(-?\d+(?:\.\d+)?|true|false)\s*;/gm;

function classify(file: string, name: string): string {
  if (file.endsWith("kindLimits.ts")) return "誤打守衛";
  if (/_(MAX|MIN)_|^(MAX|MIN)_|_(MAX|MIN)$/.test(name)) return "上下界柵欄";
  if (name.includes("EPS") || name.includes("TOLERANCE")) return "數值容差";
  if (/_(BITS?|MASK|FLAG|VERSION|SCHEMA)/.test(name)) return "協定/位元";
  return "待判";
}

function census(
  /** ⭐ 可換 root —— 測試④ 用它對一棵**自造的樹**跑同一支掃描器（sentinel）。 */
  roots: readonly string[] = ["packages/shared/src/sim", "apps/client/src/game"],
): { file: string; name: string; cat: string }[] {
  const known = reachableNames();
  // ⭐ 全樹一次讀進來 —— fallback 常常寫在**別的檔**裡（見下面的 ①）。
  const allSrc = [
    ...walkFiles(join(ROOT, "packages/shared/src/sim")),
    ...walkFiles(join(ROOT, "apps/client/src/game")),
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const out: { file: string; name: string; cat: string }[] = [];
  for (const root of roots) {
    for (const f of walkFiles(join(ROOT, root))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(DECL)) {
        const name = m[1]!;
        const parts = name.replace(PREFIX, "").toLowerCase().split("_");
        // ⭐ 尾段逐段比對，⭐ **全部小寫**（⛔ 忘了這一步就會把母體灌大 17 個）
        let reachable = false;
        for (let i = 0; i < parts.length; i++) if (known.has(parts.slice(i).join(""))) { reachable = true; break; }
        if (reachable) continue;
        const rel = relative(ROOT, f);
        // ⭐ 第五類豁免：**這個常數只當 fallback 用** ⇒ 值的住處是 JSON，⛔ 常數只是它的預設。
        //   例：`sm.autoTargetable ?? DEFAULT_SUMMON_AUTO_TARGETABLE`
        //       `refOf(refs.kda, KDA_REF)`（`config.match@1` 的 `rating.kda`）
        //   ⚠️ 三個都**逐個讀過原始碼**驗過（⛔ 不是相信正則）—— 見測試③的反向控制組。
        // ⚠️ ⭐ 2026-09-01 放寬**兩次**（每一次都逐個抽驗過，⛔ 不是相信正則）：
        //   ① fallback 不一定寫在**宣告它的那個檔**裡 —— `DEFAULT_SUMMON_CAP` 宣告在
        //      `sim/summons.ts`，而 `e.maxAlive ?? DEFAULT_SUMMON_CAP` 在
        //      `sim/effects/summon.ts`（它吃的是**技能 JSON** 的 `maxAlive`）。⇒ 掃全樹。
        //   ② 有一族 fallback 長成「**規則物件的一格**」：`leashUnits: DEFAULT_TAUNT_LEASH`
        //      住在 `DEFAULT_TAUNT_RULES` 裡，而 `leashUnits` 是 `config.taunt@1` 的欄位。
        //      ⇒ 那一格的**鍵名**碰得到 ⇒ 這個常數就是它的預設。
        //   ⛔ 而 ② 刻意要求鍵名**在 config 裡查得到** —— 否則任意 `x: FOO` 都會被放掉。
        if (WIRED_RE(name).test(allSrc)) continue;
        {
          const asDefault = new RegExp(`(\\w+):\\s*${name}\\b`).exec(allSrc);
          if (asDefault && known.has(asDefault[1]!.toLowerCase())) continue;
        }
        // ⭐ 第六類：逐格點名的豁免（每一格帶著能被反駁的理由，見 `EXEMPT_BY_NAME`）。
        if (EXEMPT_BY_NAME[name]?.file === rel) continue;
        out.push({ file: rel, name, cat: classify(rel, name) });
      }
    }
  }
  return out;
}

describe("⭐ 沒有只能改程式才碰得到的角落（棘輪）", () => {
  const rows = census();

  it("★ ① 母體**只能變小** —— ⛔ 新寫一個寫死的決策就紅", () => {
    expect(
      rows.length,
      `⛔ 從 ${RATCHET} 變成 ${rows.length}。⭐ 新增的那幾個：\n` +
        // ⛔⛔ **這一行在 2026-09-05 之前指著錯的檔**（它讓我對 owner 說了兩次錯話）：
        //   `rows.slice(RATCHET)` 取的是**排序後的最後 N 筆**，⛔ 而不是「比基準線多出來的那幾筆」
        //   ——⭐ 兩者只有在「新來的剛好排在最後」時才一樣。
        //   實例：+2 的真兇是 `fanRotation.ts` 的 `FAN_*`（`77ccda83e`，2026-09-04），
        //   ⭐ 而這一行印的是 `WorldHookSystem.ts:MAX_DISPATCH_PASSES`（`4e3ebc881`，**2026-08-09**，
        //   比基準線 `4843f7ef3` 還早 ⇒ 它一直都在 59 裡面）。
        // ⇒ ⭐ CLAUDE.md 失敗形態⑨的鏡像：**錯誤訊息指著錯方向**，於是每一個人都往那裡查。
        // ⭐ 現在印**全部**並明說沒辦法逐筆歸因，⛔ 不假裝知道是哪幾個。
        rows.map((r) => `  · ${r.file}:${r.name}`).slice(-12).join("\n") +
        `\n⚠️ ⭐ 上面是**排序後的最後 12 筆**，⛔ **不是**「新增的那幾筆」——` +
        `\n   要知道真的多了什麼，去比對基準線 commit：` +
        `\n   git log -S "const RATCHET = ${RATCHET}" -- packages/shared/src/ops/codeOnlyKnobs.test.ts` +
        `\n   再對那個 commit 與 HEAD 各跑一次這支普查。` +
        `\n⭐ 修法是把它搬進三個住處（\`content/config\` ＋ Zod \`DEFAULT_*\` ＋ admin 欄位），` +
        `\n⛔ 或（⭐ 若它是誤打守衛／上下界／容差／協定）讓名字帶上那一類的記號。` +
        `\n⚠️ 母體變小了 ⇒ 把 RATCHET 改成新的數字（棘輪只准往下）。`,
    ).toBeLessThanOrEqual(RATCHET);
  });

  it("★ ② ⭐ **待判**的那一堆才是真正的角落 —— 同樣只能變小", () => {
    const undecided = rows.filter((r) => r.cat === "待判");
    expect(
      undecided.length,
      `⛔ 從 ${UNDECIDED_RATCHET} 變成 ${undecided.length} —— ⭐ 每一個都是一個` +
        `「owner 想改的時候要改程式」的角落（大目標：**所有功能都要可 JSON 操作設定**）。`,
    ).toBeLessThanOrEqual(UNDECIDED_RATCHET);
  });

  it("⭐ ③ **量尺自證 · 兩個方向** —— ⛔ 只驗過單邊的尺不算自證過", () => {
    // ⚠️ 這條是被踩出來的：量尺第二版把 `situationalAiming` 算成碰不到（尾段忘了轉小寫），
    //   ⭐ 而我是**逐個抽驗**才發現的。⇒ 把那次抽驗釘成一條測試。
    //
    // ⭐⭐ 2026-09-01 補上**反方向**（CLAUDE.md：「一把只驗過單邊的尺，不算自證過」）：
    //   那一天量尺又被抓到一次 —— `KDA_REF` 明明是 `config.match@1` 的 `rating.kda`
    //   （`MatchController.ts` 真的傳了 `ratingRefs`），⛔ 而量尺說它是角落。
    //   ⇒ 補了第五類豁免（只當 fallback 用）。
    //   ⚠️ ⭐ 而**放寬一條規則的當下，正是它最可能開始說謊的時刻** ——
    //     所以下面同時釘住「已知**真的**碰不到的那幾個仍然被算進來」。
    // ⚠️ ⭐ 2026-09-01 第二次換過反向控制組：`MANA_FLOOR` 與 `LOOKAHEAD_HOPS`
    //   **從母體裡消失了**，⭐ 而這一次是①（它們進了第六類豁免，各帶一個理由）——
    //   ⛔ 不是②。這條測試逼我逐個說出是哪一種，⭐ 而那正是它存在的理由。
    //   （量過的反例：把比對放寬成「任意連續片段」⇒ 母體 129 → **39**，
    //     因為 `MANA_FLOOR` 的 `floor` 在七份不相干的設定檔裡都是欄位名。
    //     ⭐ 那個方向的錯**看起來像進度**，⛔ 而它是量尺在說謊。）
    const names = new Set(rows.map((r) => r.name));

    for (const reachable of [
      "DEFAULT_KING_SITUATIONAL_AIMING", // content/config/arena-rules.json
      "DEFAULT_MOB_BASE_LEVEL", // 同上
      "KDA_REF", // config.match@1 的 rating.kda（逐行讀過 MatchController.ts:3687）
      "DEFAULT_SUMMON_AUTO_TARGETABLE", // `sm.autoTargetable ?? …`
      "DEFAULT_MOB_RING_DIAMETER", // `cfg.mob.groundRingDiameter ?? …`
    ]) {
      expect(
        names.has(reachable),
        `⛔⛔ \`${reachable}\` 在 JSON 裡改得到，而量尺說它碰不到\n` +
          `⇒ ⭐ 量尺**灌大了**，而一個灌大的統計讀起來跟真的一模一樣。`,
      ).toBe(false);
    }

    // ⭐⭐ 反向控制組 —— ⛔ 而 2026-09-01 它**用完了**：待判歸零之後，
    //   repo 裡再也沒有一個「已知碰不到」的常數可以當控制組。
    //
    // ⚠️ ⭐ 而那正是量尺最危險的一刻：**沒有東西可以證明它還看得見** ——
    //   一支永遠回 0 的掃描器與一支正確的掃描器，讀起來一模一樣。
    // ⇒ 控制組改成**自造的 sentinel**（CLAUDE.md 逐字：「掃描測試也內建 sentinel
    //   ——自造一份必不可見的文件，斷言檢查器抓得到它」）。
    const dir = mkdtempSync(join(tmpdir(), "ggd-knob-sentinel-"));
    const rel = relative(ROOT, dir);
    try {
      writeFileSync(
        join(dir, "fake.ts"),
        "// 一個**不在**任何住處裡的寫死決策 —— 掃描器抓不到它就是瞎了。\n" +
          "export const SENTINEL_HARDCODED_DECISION = 7;\n",
      );
      const found = census([rel]).map((r) => r.name);
      expect(
        found,
        "⛔⛔ 量尺對一個**自造的**寫死決策視而不見 ⇒ 它今天說的 0 不是「沒有角落」，\n" +
          "   ⭐ 而是「它什麼都看不見」。⚠️ 一支永遠回 0 的掃描器讀起來跟一支正確的一模一樣。",
      ).toContain("SENTINEL_HARDCODED_DECISION");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * ⭐⭐ **豁免表不可以腐爛** —— ⛔ 一張過期的豁免表會**默默地**把新的角落也放掉。
   *
   * ⚠️ 這是 CLAUDE.md 記過的形狀：「一個被散文守著的數字活過了它的保存期限，
   * 而**沒有任何東西變紅**」。⇒ 逐列驗「這個名字今天還在那個檔裡」。
   *
   * MUTATION LOG（落地前跑過）：
   *   · 表裡多加一列不存在的 `FOO_BAR` → 🔴（指名它與它宣稱的檔）
   */
  it("⭐ ④ 豁免表逐列還活著 —— ⛔ 名字改了/常數刪了就紅", () => {
    const dead: string[] = [];
    for (const [name, { file, why }] of Object.entries(EXEMPT_BY_NAME)) {
      let src = "";
      try { src = readFileSync(join(ROOT, file), "utf8"); } catch { /* 下面報 */ }
      if (!new RegExp(`\\bconst ${name}\\b`).test(src)) dead.push(`${file}:${name}`);
      expect(why.length, `${name} 的理由太短 —— ⛔ 豁免要帶一個**能被反駁**的理由`).toBeGreaterThan(30);
    }
    expect(
      dead,
      `⛔⛔ 豁免表上這幾列**已經不存在**了：\n${dead.map((d) => `  · ${d}`).join("\n")}\n` +
        `⇒ 要嘛那個常數搬走了（⭐ 把這一列刪掉），要嘛它改名了（⭐ 改這一列）。\n` +
        `⚠️ 留著它 = 一張過期的豁免表，而它會**默默地**放掉一個同名的新角落。`,
    ).toEqual([]);
  });
});

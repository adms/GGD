/**
 * 暴擊規則 —— 一次攻擊上有**多條**暴擊來源時，它們怎麼合成。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的裁決 (2026-08-09, GH#302)
 * ════════════════════════════════════════════════════════════════════════════
 * 逐字：
 *
 * > 我同時獲得 1%機率 100倍 以及 10%機率 2倍暴擊傷害，這樣我會有三種結果，
 * > 100x2=200、100、2倍，**因為是每一條暴擊獨立算完傷害再帶入下一條**
 *
 * 所以出貨值是 `multiply`：**每一條來源各抽各的骰，抽中的把自己的倍率乘進去**。
 * 兩條都中 = 200 倍、只中第一條 = 100 倍、只中第二條 = 2 倍、都沒中 = 1 倍。
 *
 * ⚠️ 這條規則在裁決之前是 `max`（只有期望值最高的那一條參與，整發只抽一次），
 * 而當時 `combat/critStrike.ts` 的檔頭 ③ 寫著一整段論證，說「取 max 才對，因為
 * 這個 repo 對同類乘數已經有一條規則（`block.ts` ⑤ 的取 max）」。
 * **那段論證被 owner 推翻了**，所以它已經從那個檔頭刪掉 —— CLAUDE.md 第三守則：
 * 一個活得比它描述的行為還久的註解，是一句等著被相信的謊。
 *
 * ⭐ 新的理由（也是 owner 給的，而且它與格擋/迴避**確實不同**）：
 * 暴擊是**肉鴿三選一會發的東西**。取 max 的世界裡，玩家的第二張暴擊卡是廢牌 ——
 * 撿到它畫面上什麼都沒有變。格擋/迴避是**防守側的保命率**，兩件疊起來趨近 100%
 * 本來就該收斂；暴擊是**進攻側的爆發**，它的樂趣就在疊起來會炸。
 * 同一個 repo 有兩條仲裁規則不是缺陷，前提是**兩條各自寫得出自己的理由**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三格都在後台（owner 2026-08-09：「暴擊計算方式 上限 這些參數都要能後台彈性設定」）
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 不只是上限 —— 連**怎麼算**本身都是一格下拉。第一守則：
 * 「拿不定主意的決策，解法是兩種模式都做、後台可切，不是挑一個然後在註解裡辯護。」
 *
 * PURITY: 純資料 + 純函式，沒有 `Math.random` / `Date.now` / 三角函式 / `**`，
 * 也沒有 Map/Set 迭代（`sim/purity.test.ts` 在守）。這個檔案**零 import**，
 * 同 `blockRules.ts` —— 它被 `SimWorld` 直接吃，不可以有回頭邊。
 */

/**
 * 多條暴擊來源同時吃得到這一發時，它們怎麼合成。
 *
 *   multiply  每一條**各抽各的骰**，抽中的把自己的倍率**乘**進總倍率
 *             （owner 2026-08-09 的裁決 = 出貨值）。1% × 100 倍 與 10% × 2 倍
 *             同時中 = 200 倍。
 *   max       只有期望增益（機率 × 倍率）最高的**那一條**參與，整發只抽一次
 *             （= 這條規則變成欄位之前的行為，2026-08-09 以前）。上面那個組合
 *             最多只拿得到 100 倍，第二張暴擊卡等於白撿。
 *   add       每一條各抽各的骰，抽中的倍率**相加**。上面那個組合兩條都中 = 102 倍
 *             —— 疊得起來但收斂很快，介於前兩者之間。
 *
 * ⚠️ `max` 之所以連**抽幾次骰**都跟著改（只抽一次），是因為它要能真的當成
 * 「退回舊行為」用：合成規則一樣但抽兩次骰的話，兩件暴擊武器的**觸發率**仍然
 * 被改掉了，那不是回滾，是第三種行為。
 */
export type CritStackMode = "multiply" | "max" | "add";

/** 後台下拉選單的選項來源；也是 `normalizeCritRules` 的合法值清單。 */
export const CRIT_STACK_MODES: readonly CritStackMode[] = Object.freeze([
  "multiply",
  "max",
  "add",
]);

export interface CritRules {
  /** 多條來源怎麼合成，見 {@link CritStackMode}。 */
  stackMode: CritStackMode;
  /**
   * 一次攻擊的**總**倍率上限（owner 指定 100）。
   *
   * ⚠️ 它夾的是**合成之後的總倍率**，不是逐條。owner 的例子 100 × 2 = 200
   * 會被夾成 100 —— 也就是說出貨設定下那個 200 是**拿不到**的，而這正是上限
   * 存在的意義：`multiply` 沒有上限就是指數爆炸，五張暴擊卡直接刪掉遊戲。
   */
  maxTotalMult: number;
  /**
   * 同一次攻擊最多算**幾條來源攜帶的**暴擊（owner 指定 5）。
   * 超出的那些照期望增益由高到低排序後**整條不參與**，連骰都不抽。
   *
   * ⚠️ 它管的是**可堆疊的那一側**（道具/技能/buff 掛上來的 `critStrike`），
   * 英雄自己的 `Stat.CritChance` 是一條**聚合屬性**、永遠只有一條，所以不佔格。
   * 這一點是刻意的：讓它佔格的話，把上限調到 1 會讓每一個堆了暴擊率的英雄
   * **完全吃不到**天堂之劍，而畫面上看起來就是「這把劍壞了」。
   */
  sourceCap: number;
}

/**
 * 出貨預設 —— owner 明說的那三個。
 *
 * ⚠️ 和 `DEFAULT_SHIELD_RULES` 不同、和 `DEFAULT_BLOCK_RULES` 相同：
 * **這一份會改變平衡**，而且是故意的。owner 推翻了舊行為。
 */
export const DEFAULT_CRIT_RULES: CritRules = Object.freeze({
  stackMode: "multiply",
  maxTotalMult: 100,
  sourceCap: 5,
});

/** 文件的 schema 字串 —— 讀寫兩端（sim / 後台 overlay）共用這一個常數。 */
export const CRIT_SCHEMA = "config.crit@1";
/** 文件 id（`config` collection 裡的 `crit`）。 */
export const CRIT_DOC_ID = "crit";

/** `maxTotalMult` 的執行期上下界，與 Zod 同一組數字。 */
export const CRIT_MAX_TOTAL_MULT_RANGE = Object.freeze({ min: 1, max: 1000 });
/** `sourceCap` 的執行期上下界，與 Zod 同一組數字。 */
export const CRIT_SOURCE_CAP_RANGE = Object.freeze({ min: 1, max: 16 });

function isStackMode(v: unknown): v is CritStackMode {
  // 逐一比對而不是 `includes`，因為 `readonly T[]` 的 `includes(unknown)` 在 TS
  // 下要先斷言，而斷言正是讓一個打錯的字串溜進 sim 的那一步（同 blockRules）。
  return v === "multiply" || v === "max" || v === "add";
}

function clampNumber(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * 正規化操作者/文件給的值。認不得的東西 → 出貨預設，**不是** throw，也不是
 * undefined：sim 不能在解碼設定時炸掉，而一個 undefined 的 `stackMode` 會讓
 * `rollCritStrike` 的分支全部落空 = 暴擊整族靜默失效（傷害照常、暴擊數字照跳、
 * 就是不痛）。
 *
 * ⚠️ `sourceCap` 取整：它是「取前 N 條」的 N，2.5 條是沒有意義的，而
 * `Array.length` 的比較會把 2.5 悄悄當成 2 —— 悄悄的那一半才是缺陷。
 */
export function normalizeCritRules(raw: unknown): CritRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cap = clampNumber(
    r.sourceCap,
    CRIT_SOURCE_CAP_RANGE.min,
    CRIT_SOURCE_CAP_RANGE.max,
    DEFAULT_CRIT_RULES.sourceCap,
  );
  return Object.freeze({
    stackMode: isStackMode(r.stackMode) ? r.stackMode : DEFAULT_CRIT_RULES.stackMode,
    maxTotalMult: clampNumber(
      r.maxTotalMult,
      CRIT_MAX_TOTAL_MULT_RANGE.min,
      CRIT_MAX_TOTAL_MULT_RANGE.max,
      DEFAULT_CRIT_RULES.maxTotalMult,
    ),
    sourceCap: Math.floor(cap),
  });
}

/**
 * 讀一份 `config.crit@1` 文件（sim 與後台共用的那個 `Configs` registry）。
 * 沒有文件 / schema 不對 → 出貨預設。
 */
export function critRulesFromDoc(doc: unknown): CritRules {
  if (!doc || typeof doc !== "object") return DEFAULT_CRIT_RULES;
  const d = doc as { schema?: unknown };
  if (d.schema !== CRIT_SCHEMA) return DEFAULT_CRIT_RULES;
  return normalizeCritRules(d);
}

/**
 * 預測影子的**扣留**規則（`config.combat-feel@1` 的 `predictionHold`，GH#370）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 這一格修的是 owner 2026-08-18 回報的「克勞德放完隕石擊以後會在**原地小步
 *    來回**看起來像卡頓抽搐」。⚠️ 而**根因不是克勞德，也不在 sim 裡**。
 *
 * ── 量到的（lane C，⛔ 不是推測）─────────────────────────────────────────
 * 伺服器座標**沒有**在來回：1v1 真打 180 tick，反轉 **0 次**，落點穩定在 1.20
 * 且末 60 tick 速度為 0。所以「攻擊距離邊界進一格出一格、加一格遲滯」那條路
 * **被證據排除了**。
 *
 * 真正在動的是**客戶端預測的影子**：拿出貨的 `LocalPrediction` 與伺服器並排跑，
 * 影子 render x **最大領先伺服器 2.14 單位，全部發生在施法鎖那 26 個 tick**；
 * 66 次快照裡 teleport 0 / reconcile 66 —— 也就是說誤差從來沒有超過
 * `TELEPORT_EPS`，走的**全部**是平滑校正那條路：影子每 tick 往前爬、每 50 ms
 * 被拉回一次。**66 次微幅前後 = 那個「小步來回」，而且只有施法的那個玩家看得到。**
 *
 * ── 為什麼影子看不到施法鎖（結構上的）───────────────────────────────────
 * `LocalPrediction` 的影子世界只鋪 `transform / nav / status / health / stats`，
 * **沒有 `abilities` 元件**。而 `sim/movementHold.ts` 判「這具身體被按住了嗎」讀的
 * 正是 `world.abilities.get(id)?.cast?.rooted` 與 `?.recovery`
 * ⇒ 影子**在型別上就看不到**施法鎖，也看不到 `nav.override`（leap）。
 *
 * 隕石擊剛好把三個窗口疊在一起（施法鎖 0.867 s + leap 0.82 s + 落地 knockback），
 * 所以它是全 roster 裡最明顯的一支 —— ⛔ 但它**不是唯一一支**，任何有施法鎖的
 * 技能都有同一個現象，只是幅度小到看不出來。
 *
 * ── 修法：用**權威旗標**扣留影子，⛔ 不是把 abilities 鋪進影子 ──────────
 * 快照裡的位元已經有了（`net/snapshot.ts` 一直在送 `CASTING` / `DASHING` /
 * `ROOTED` / `STUNNED` / `AIRBORNE`），只是客戶端從來沒有拿它們擋預測。
 * 樣板也已經存在：結算凍結 (`outcomeDecided`) 就是把 `predAccumMs = 0`。
 *
 * ⭐ 這比「把 abilities 元件鋪進影子」好，理由是**權威**：影子若自己算施法鎖，
 * 那就是第二個會與伺服器分歧的來源；讀伺服器送來的旗標則**定義上**不會分歧。
 *
 * ── 為什麼是欄位（第一守則）───────────────────────────────────────────
 * 「哪幾顆旗標該扣留影子」是一個**決策點**，而且有真實代價：扣留期間玩家的移動
 * 輸入要等一趟 RTT 才看得到反應。⛔ 所以它不可以是我在程式裡挑的一組常數。
 *
 * 出貨預設把五顆**全部**打開，理由是它們的語意都是「**伺服器正握著這具身體**」——
 * 影子在那段時間往前爬，⛔ 沒有任何一種情況下是對的。
 */
import { ENTITY_FLAG } from "../protocol/schema";

/** 一顆旗標的開關名 ↔ 它在 `EntityState.flags` 裡的位元。 */
export const PREDICTION_HOLD_BITS = Object.freeze({
  /** 施法鎖（`ab.cast.rooted`）—— 隕石擊那 26 個 tick 就是這一顆。 */
  casting: ENTITY_FLAG.CASTING,
  /** 引導（`channelling`）—— 和施法鎖同一族，身體同樣不歸玩家。 */
  channelling: ENTITY_FLAG.CHANNELLING,
  /** 位移中（`nav.override`，含 leap / dash）—— 路徑由伺服器算。 */
  dashing: ENTITY_FLAG.DASHING,
  /** 滯空（擊飛）—— 落點由伺服器算。 */
  airborne: ENTITY_FLAG.AIRBORNE,
  /** 定身：能轉身能出手，但**不能移動**。 */
  rooted: ENTITY_FLAG.ROOTED,
  /** 暈眩：什麼都不能做。 */
  stunned: ENTITY_FLAG.STUNNED,
} as const);

export type PredictionHoldFlag = keyof typeof PREDICTION_HOLD_BITS;

export interface PredictionHoldRules {
  /**
   * 止血閥。false = 整條機制不作用（＝這條缺陷被修之前的行為）。
   * ⚠️ 留著它是為了「一鍵回頭」，⛔ 不是為了觀望 —— 第〇·六守則：
   * 開關的預設值不是中立的，高層級的結果**預設 on**。
   */
  enabled: boolean;
  /** 哪幾顆旗標算「伺服器正握著這具身體」。 */
  flags: Readonly<Record<PredictionHoldFlag, boolean>>;
}

/**
 * 出貨值 —— 六顆全開。
 *
 * ⚠️ 這**不是**「全開比較安全」那種懶惰的預設。六顆的語意都是「伺服器正握著
 * 這具身體」，而影子在那段時間往前爬**沒有任何一種情況下是對的** ——
 * 它爬出去的每一格都會在 50 ms 後被拉回來，那正是玩家看到的抽搐。
 *
 * 想關掉某一顆的人要能講出「這一顆亮著的時候，玩家的本機移動**應該**立刻生效」，
 * 而今天六顆都講不出來。
 */
export const DEFAULT_PREDICTION_HOLD: PredictionHoldRules = Object.freeze({
  enabled: true,
  flags: Object.freeze({
    casting: true,
    channelling: true,
    dashing: true,
    airborne: true,
    rooted: true,
    stunned: true,
  }),
});

/**
 * 這一份規則要扣留的位元遮罩。`enabled: false` → 0（＝什麼都不扣）。
 *
 * ⚠️ 回**遮罩**而不是逐顆問，是因為呼叫端在**每一幀**跑：一次 `&` 比六次
 * 物件查表便宜，而且遮罩可以在設定變動時才重算。
 */
export function predictionHoldMask(rules: PredictionHoldRules): number {
  if (!rules.enabled) return 0;
  let mask = 0;
  // ⚠️ 逐 key 走 `PREDICTION_HOLD_BITS` 而不是走 `rules.flags` —— 前者是**程式**
  // 認得的那一份，後者可能來自後台/舊文件而多出或少掉某一格。
  for (const key of Object.keys(PREDICTION_HOLD_BITS) as PredictionHoldFlag[]) {
    if (rules.flags[key]) mask |= PREDICTION_HOLD_BITS[key];
  }
  return mask;
}

/**
 * 伺服器現在握著這具身體嗎？
 *
 * ⚠️ 寫成 `!== 0` 而不是 `> 0`：`flags` 是 **uint32**，而 JS 的位元運算子轉
 * int32 —— 高半部的旗標 `&` 出來會是**負數**，任何寫成 `> 0` 的讀端會靜默回
 * false（CLAUDE.md 的 BIT BUDGET 那一段記的就是這個陷阱）。
 */
export function serverHoldsBody(flags: number, mask: number): boolean {
  return (flags & mask) !== 0;
}

/** 正規化操作者/文件給的表 —— 缺格一律回出貨預設。 */
export function normalizePredictionHold(raw: unknown): PredictionHoldRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_PREDICTION_HOLD;
  const r = raw as { enabled?: unknown; flags?: unknown };
  const rawFlags = (r.flags ?? {}) as Record<string, unknown>;
  const flags = {} as Record<PredictionHoldFlag, boolean>;
  for (const key of Object.keys(PREDICTION_HOLD_BITS) as PredictionHoldFlag[]) {
    const v = rawFlags[key];
    flags[key] = typeof v === "boolean" ? v : DEFAULT_PREDICTION_HOLD.flags[key];
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_PREDICTION_HOLD.enabled,
    flags,
  };
}

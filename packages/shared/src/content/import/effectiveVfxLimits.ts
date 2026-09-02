/**
 * ⭐⭐ **實際生效的 VFX 限制**（P1-2）—— 給外部編輯器的**同一支** resolver。
 *
 * ── ⛔ 為什麼這一支必須存在 ───────────────────────────────────────────────
 * 外部編輯器要知道「我做的這份特效，上線之後會被夾成什麼樣」。
 * ⚠️ 而在此之前那些數字散在**三個地方**、⛔ 沒有一個地方讀得到全部：
 *   · `config.vfx-budget@1`（顆數／噴發率）
 *   · `config.vfx-cleanup@1`（壽命上限／一次性發射器／回合清理檔位）
 *   · **客戶端的常數**（`MAX_ACTIVE_RIBBONS = 10` · `RIBBON_MAX_LIFESPAN_SEC = 0.2`）
 *
 * ⇒ ⭐ 這一支把三者合成一份，⛔ 而且**不抄常數**：
 *   每一格都走**遊戲自己在用的那個夾子**（`clampMaxParticlesPerSystem` 那一族），
 *   ⇒ 編輯器看到的數字**就是**上線那一刻會生效的數字。
 *
 * ── ⛔ 為什麼不是「回 schema 的上界」 ────────────────────────────────────
 * schema 的 `.max()` 是**誤打守衛**（50 打成 500 那一類），⛔ 不是政策。
 * 一份把 schema 上界當成 effective limit 的 profile 會讓編輯器以為
 * 「我可以噴 8000 顆」，而遊戲夾在 1200 —— ⭐ 那正是這份 receipt 要防的事。
 *
 * ⚠️ ⭐ 兩格 ribbon 的值在 2026-09-02 之前是**客戶端常數**：這一支落地的同時，
 * 它們搬進 `config.vfx-cleanup@1`（三個住處），而客戶端改讀這一支
 * ⇒ ⛔ 不存在「編輯器讀一份、遊戲讀另一份」的可能。
 */
import {
  clampMaxParticlesPerSystem,
  clampMaxRatePerSystem,
} from "../schema/vfx";
import { sha256Hex } from "../sha256";
import { canonicalizeJcs } from "./jcs";
import {
  DEFAULT_VFX_CLEANUP,
  VFX_HARD_CAP_SCOPES,
  VFX_HARD_MAX_LIFE_SEC_BOUNDS,
  ROUND_PURGE_MODES,
  type ConfigVfxBudgetDoc,
  type ConfigVfxCleanupDoc,
  type RoundPurgeMode,
  type VfxHardCapScope,
} from "../schema/config";

export const EFFECTIVE_VFX_LIMITS_SCHEMA = "ggd-effective-vfx-limits@1" as const;

export interface EffectiveVfxLimits {
  /** ⭐ 交接文件釘死的 schema id（⛔ 缺它，對面 fail closed）。 */
  readonly schema: typeof EFFECTIVE_VFX_LIMITS_SCHEMA;
  /**
   * ⭐ 這一份收據是**哪一個 renderer／品質／裝置情境**的。
   *
   * ⚠️ ⭐ 為什麼它必須存在而不是省略：交接文件逐字要求
   * 「若不同 renderer／quality／device profile 會得到不同值，active profile 必須明示
   *  選到哪個 `limitProfileId`，Editor 只宣稱該 context 的 parity，
   *  ⛔ 不把桌機高階值冒充所有玩家裝置」。
   *
   * ⭐ 今天 GGD 的這八格**沒有**逐裝置分歧（`AdaptiveQuality` 動的是解析度與
   * 後處理，⛔ 不動這八格的任何一格）⇒ 只有一個 id。
   * ⛔ 而那**不是**「不需要這一格」的理由 —— 有了它，哪天真的長出第二個檔位時，
   * 對面看得出來這份收據換了 context，⭐ 而不是安靜地拿高階值去驗低階裝置。
   */
  readonly limitProfileId: string;
  /**
   * ⭐ 這一支 resolver 的指紋 —— ⛔ **算出來的**，不是寫死的版本號。
   *
   * ⚠️ 它必須在**任何一個夾子動過**的時候改變，否則它就只是一個會過期的散文
   * （第三守則）。⇒ 見 {@link resolverFingerprint}：它拿一組**探針**跑真的
   * resolver，把輸出雜湊起來 ⇒ ⭐ 改任何一格上下界或 fallback 都會讓它變。
   */
  readonly resolverFingerprint: string;
  /** 單一粒子系統的**瞬間顆數**上限（`particleFactory.capacityFor` 咬的那一格）。 */
  readonly maxParticlesPerSystem: number;
  /** 單一粒子系統的**每秒噴發**上限（`particleFactory.rateFor`）。 */
  readonly maxRatePerSystem: number;
  /** 同時活著的刀光／緞帶條數；超過就偷走最久沒開的那一條。 */
  readonly maxActiveRibbons: number;
  /** 一條緞帶最多活／淡多久（秒）—— 壽命即淡出預算。 */
  readonly ribbonFadeBudgetSec: number;
  /** 任何特效產生後的**終極**壽命上限（秒），到期 stop+reset+還回池子。 */
  readonly hardMaxLifeSec: number;
  /** 那道終極上限掃描的範圍：整個 scene／只掃 vfx 管線建的／關掉。 */
  readonly hardCapScope: VfxHardCapScope;
  /**
   * 同時允許幾個閒置的一次性發射器（硬上限，超過回收最久沒用的）。
   *
   * ⭐⭐ **`null` ＝ 不設限** —— 而那是一個**真的會發生**的狀態，⛔ 不是理論值：
   * `config.vfx-cleanup@1` 的 `enabled` 是止血閥（檔頭逐字：「false = 完全回到
   * #259 的行為」），而遊戲的 `oneShotEmitterCap()` 在那時回 **`Infinity`**。
   *
   * ⚠️ ⭐ 在此之前這一格**一律回 96** ⇒ 止血閥翻下去的那一刻，這份收據就在說謊，
   * ⛔ 而外部編輯器會照著一個不存在的上限去限制作者。
   * ⭐ JSON 對「無上限」的唯一表示是 `null`（⛔ 不是字串 `"Infinity"`，
   * ⛔ 也不是省略半份物件）—— 交接文件逐字釘死。
   */
  readonly maxOneShotEmitters: number | null;
  /** 回合間完整清理的檔位。 */
  readonly roundPurgeMode: RoundPurgeMode;
}

/**
 * ⭐ 一次性發射器上下界 —— ⛔ **不是**在這裡新寫的：
 * `apps/client/src/vfx/vfxCleanupPolicy.ts` 的 `ONE_SHOT_EMITTER_BOUNDS` 與
 * Zod 的 `.min(16).max(1024)` 是同一組。⚠️ 三個住處都寫著同樣的數字是既有狀態；
 * ⭐ 這一支的責任是**產出與遊戲相同的值**，⛔ 不是順手做一次跨檔重構。
 */
const ONE_SHOT_EMITTER_BOUNDS = { min: 16, max: 1024 } as const;

/**
 * ⭐ 只有一個限制情境（見 {@link EffectiveVfxLimits.limitProfileId}）。
 * ⛔ 哪天長出第二個，這裡要變成一個**推導**出來的 id，⛔ 不是再加一個字面值。
 */
const LIMIT_PROFILE_ID = "ggd-default-desktop@1";

/** 夾一個數字進 [lo, hi]；非數字 ⇒ fallback。⛔ 不是靜默回 0。 */
function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * ⭐ **唯一**的解析入口。兩份文件都可以缺席（⇒ 用出貨預設）。
 *
 * ⚠️ 缺席**不是** 0 —— `vfx-budget.json` 的 note 逐字寫著
 * 「缺這份文件＝出貨預設 1200/600（⛔ 不是 0）」。
 */
export function effectiveVfxLimits(
  budget?: Partial<ConfigVfxBudgetDoc> | null,
  cleanup?: Partial<ConfigVfxCleanupDoc> | null,
): EffectiveVfxLimits {
  // ⚠️ `config.vfx-budget@1` **沒有** `DEFAULT_*` 常數 —— 它的「缺席預設」住在
  //   `clampMaxParticlesPerSystem`/`clampMaxRatePerSystem` 自己裡面
  //   （`undefined ⇒ DEFAULT_MAX_*`）。⇒ 這裡傳 `undefined` 進去就是對的，
  //   ⛔ 不要在這裡再寫一份預設值（那會是第二個住處）。
  return Object.freeze({
    schema: EFFECTIVE_VFX_LIMITS_SCHEMA,
    limitProfileId: LIMIT_PROFILE_ID,
    resolverFingerprint: resolverFingerprint(),
    ...limitValues(budget, cleanup),
  });
}

/**
 * ⭐ **只有值**的那一半 —— 指紋與輸出**共用同一份算式**。
 *
 * ⚠️ ⛔ 抽出來不是為了整潔：如果指紋自己抄一份算式，它就會在算式改動時
 * **不變** —— ⭐ 那正是它要偵測的那件事。
 */
function limitValues(
  budget?: Partial<ConfigVfxBudgetDoc> | null,
  cleanup?: Partial<ConfigVfxCleanupDoc> | null,
): Omit<EffectiveVfxLimits, "schema" | "limitProfileId" | "resolverFingerprint"> {
  const b = budget ?? {};
  const c = cleanup ?? DEFAULT_VFX_CLEANUP;
  return Object.freeze({
    // ⭐ 走遊戲自己的夾子，⛔ 不是 schema 的 .max()
    maxParticlesPerSystem: clampMaxParticlesPerSystem(b.maxParticlesPerSystem),
    maxRatePerSystem: clampMaxRatePerSystem(b.maxRatePerSystem),
    maxActiveRibbons: Math.round(
      clamp(c.maxActiveRibbons, 1, 64, DEFAULT_VFX_CLEANUP.maxActiveRibbons ?? 10),
    ),
    ribbonFadeBudgetSec: clamp(
      c.ribbonFadeBudgetSec,
      0.02,
      2,
      DEFAULT_VFX_CLEANUP.ribbonFadeBudgetSec ?? 0.2,
    ),
    hardMaxLifeSec: clamp(
      c.vfxHardMaxLifeSec,
      VFX_HARD_MAX_LIFE_SEC_BOUNDS.min,
      VFX_HARD_MAX_LIFE_SEC_BOUNDS.max,
      DEFAULT_VFX_CLEANUP.vfxHardMaxLifeSec ?? 5,
    ),
    hardCapScope: oneOf(
      c.vfxHardCapScope,
      VFX_HARD_CAP_SCOPES,
      DEFAULT_VFX_CLEANUP.vfxHardCapScope ?? "scene",
    ),
    // ⭐ `enabled` 是止血閥 ⇒ 遊戲的 `oneShotEmitterCap()` 回 `Infinity`
    //   ⇒ ⭐ 這份收據必須說 `null`，⛔ 不是繼續報 96（那是一個不存在的上限）。
    maxOneShotEmitters:
      c.enabled === false
        ? null
        : Math.round(
            clamp(
              c.maxOneShotEmitters,
              ONE_SHOT_EMITTER_BOUNDS.min,
              ONE_SHOT_EMITTER_BOUNDS.max,
              DEFAULT_VFX_CLEANUP.maxOneShotEmitters ?? 96,
            ),
          ),
    roundPurgeMode: oneOf(
      c.roundPurgeMode,
      ROUND_PURGE_MODES,
      DEFAULT_VFX_CLEANUP.roundPurgeMode ?? "full",
    ),
  });
}

// ---------------------------------------------------------------------------
// 🔏 resolver 指紋
// ---------------------------------------------------------------------------

/**
 * ⭐⭐ **算出來的**指紋 —— ⛔ 不是一個寫死的版本號。
 *
 * ── ⛔ 為什麼不可以寫死 ──────────────────────────────────────────────────
 * 交接文件要的是「**與遊戲實際 resolver 同源**」的收據。一個手寫的
 * `"v1"` 在任何一格夾子被改動的那天**不會變** ⇒ ⭐ 對面會拿舊指紋當成
 * 「沒變」而繼續用過期的限制去驗內容 —— ⛔ 而那正是第三守則的形狀：
 * **一句在它到期之後還活著的散文，而沒有任何東西變紅。**
 *
 * ── ⭐ 做法：讓它是 resolver **行為**的雜湊 ─────────────────────────────
 * 拿一組**探針**（極小／極大／缺席／止血閥）真的跑一次 `effectiveVfxLimits()`，
 * 把每一組輸出 canonical 化再雜湊。
 * ⇒ ⭐ 改任何一格的上下界、fallback、或 `enabled` 的語意，指紋**當場就變**。
 *
 * ⚠️ ⭐ 探針裡**一定**要有 `enabled:false` 那一格：它是唯一會讓
 * `maxOneShotEmitters` 變成 `null` 的輸入 ⇒ 少了它，那條路的改動指紋看不見。
 *
 * ⚠️ ⛔ 探針**不讀出貨內容** —— 指紋要回答「resolver 是哪一版」，
 * ⛔ 不是「今天的設定值是多少」（後者本來就逐格印在收據上）。
 */
const PROBES: readonly (Partial<ConfigVfxCleanupDoc> | null)[] = Object.freeze([
  null,
  { enabled: false } as Partial<ConfigVfxCleanupDoc>,
  {
    enabled: true,
    maxActiveRibbons: 0,
    ribbonFadeBudgetSec: 0,
    vfxHardMaxLifeSec: 0,
    maxOneShotEmitters: 0,
  } as Partial<ConfigVfxCleanupDoc>,
  {
    enabled: true,
    maxActiveRibbons: 1e9,
    ribbonFadeBudgetSec: 1e9,
    vfxHardMaxLifeSec: 1e9,
    maxOneShotEmitters: 1e9,
  } as Partial<ConfigVfxCleanupDoc>,
]);

const BUDGET_PROBES: readonly (Partial<ConfigVfxBudgetDoc> | null)[] = Object.freeze([
  null,
  { maxParticlesPerSystem: 0, maxRatePerSystem: 0 } as Partial<ConfigVfxBudgetDoc>,
  { maxParticlesPerSystem: 1e9, maxRatePerSystem: 1e9 } as Partial<ConfigVfxBudgetDoc>,
]);

let cached: string | undefined;

/** 12 位十六進位（與 profile 其餘 digest 同一個表示法）。 */
export function resolverFingerprint(): string {
  if (cached !== undefined) return cached;
  const rows: unknown[] = [];
  for (const b of BUDGET_PROBES) {
    for (const c of PROBES) {
      // ⛔ 不能呼叫 `effectiveVfxLimits()`（那會無窮遞迴）—— 只跑**值**那一段。
      rows.push(limitValues(b, c));
    }
  }
  cached = sha256Hex(canonicalizeJcs(rows)).slice(0, 12);
  return cached;
}

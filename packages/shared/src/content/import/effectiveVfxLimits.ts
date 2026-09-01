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
  /** 同時允許幾個閒置的一次性發射器（硬上限，超過回收最久沒用的）。 */
  readonly maxOneShotEmitters: number;
  /** 回合間完整清理的檔位。 */
  readonly roundPurgeMode: RoundPurgeMode;
}

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
    maxOneShotEmitters: Math.round(
      clamp(c.maxOneShotEmitters, 16, 1024, DEFAULT_VFX_CLEANUP.maxOneShotEmitters ?? 96),
    ),
    roundPurgeMode: oneOf(
      c.roundPurgeMode,
      ROUND_PURGE_MODES,
      DEFAULT_VFX_CLEANUP.roundPurgeMode ?? "full",
    ),
  });
}

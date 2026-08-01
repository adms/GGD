/**
 * 飛行中的投射物**真的**要長什麼樣 —— owner #251「投射物特效沒有真實套用」。
 *
 * ===========================================================================
 * 動手前量到的事實（不是猜的，也不是讀註解來的）
 * ===========================================================================
 * 2026-08-01，對真的 `ProjectileView` 依序餵兩份文件、再從 Babylon 讀回那顆
 * `ParticleSystem`：先餵出貨的 `fx.prim.ice.bolt`，再餵一份把
 * `burstCount` 18→200、`sizeStops` 峰值 0.62→9、`lifetimeSec` →3–4 秒、
 * `speed` →40–60、`blendMode` →alpha、`gravityY` →99 **全部改掉**的版本。
 *
 *   capacity 48 / emitRate 55 / lifeTime 0.14–0.30 / emitPower 1.6–2.6 /
 *   blendMode 2(ONEONE) / gravity −1 / sizeStops [0,0.189][0.12,0.42][1,0]
 *
 * 兩次**一位元不差**。也就是說：文件唯一到得了飛行彈道的只有**顏色與貼圖**，
 * 其餘八個數字全部是 `ProjectileView.ts` 裡的常數 —— 一顆冰彈、一道貫穿波、
 * 一發平砍在畫面上是**同一顆彗星換個顏色**。這就是 owner 說的「沒有真實套用」。
 *
 * 第二件量到的事：出貨的 18 份 `projectile@1` 文件裡 `hitRadius` 有三檔 ——
 * 平砍 0.4、單發彈 0.5、**貫穿波 0.9**（`pierce: true`）—— 而三者的
 * `HEAD_SIZE` / `BODY_GIRTH` 完全一樣。打得到多寬這件事在畫面上不存在。
 *
 * ===========================================================================
 * 這個檔案是什麼
 * ===========================================================================
 * 一個**純函式**：`(vfx 文件, hitRadius, 後台旋鈕) → 這一發要用的那組數字`。
 * 沒有 `@babylonjs/*`，所以它可以在 Node 測試裡被直接比對，而
 * `ProjectileView` 只負責把這組數字**寫進**引擎。
 *
 * ⚠️ 這個分工不會自己防住第②號故障 —— 「算出來但沒送到」正是本檔在修的東西。
 * 所以守衛（`projectileArtApplied.test.ts`）讀的是**真的 `ParticleSystem`**，
 * 不是這裡的回傳值。
 *
 * ===========================================================================
 * 為什麼是「經過夾子的映射」而不是直接照抄文件
 * ===========================================================================
 * 這些文件是給**一次性命中爆點**寫的（`mode: "burst"`，`speed` 9–15），
 * 直接把 `speed` 灌進拖尾會讓尾巴往四面炸開，那不是拖尾是爆炸。所以每一項都
 * 有自己的映射與上下界，而「要不要做這件事」本身是後台的一格
 * （`config.vfx-families@1.projectileArtFromDoc`，關掉 = 升級前的固定彗星）。
 */
import type { VfxBlendMode, VfxDoc } from "@ggd/shared/content";
import {
  DEFAULT_PROJECTILE_ART_FROM_DOC,
  DEFAULT_PROJECTILE_FLY_HEIGHT_Y,
  DEFAULT_PROJECTILE_RADIUS_GAIN,
  clampProjectileFlyHeightY,
  clampProjectileRadiusGain,
  projectileSizeMultiplier,
} from "@ggd/shared/content/schema/vfx";

/** 3D body shape of the flying missile (projectile@1 `meshShape`). */
export type ProjectileMeshShape = "bolt" | "orb" | "shard";

// ---------------------------------------------------------------------------
// 出貨基準值 —— 升級前 `ProjectileView` 裡那八個常數，一個不改地搬過來
// ---------------------------------------------------------------------------

/** 彗星頭光暈的邊長（世界單位）。 */
export const SHIPPED_HEAD_SIZE = 1.15;
/** 3D 彈頭：鼻到尾的長度與截面。 */
export const SHIPPED_BODY_LENGTH = 0.95;
export const SHIPPED_BODY_GIRTH = 0.26;
/** 拖尾預算：少而大而亮而短（#33 的重調）。 */
export const SHIPPED_TRAIL_CAPACITY = 48;
export const SHIPPED_TRAIL_RATE = 55;
export const SHIPPED_TRAIL_LIFE = { min: 0.14, max: 0.3 } as const;
/** 拖尾粒子的峰值大小（pop-shrink 斜坡會把它縮到 0）。 */
export const SHIPPED_TRAIL_PEAK_SIZE = 0.42;
/** 拖尾的混色模式。 */
export const SHIPPED_TRAIL_BLEND: VfxBlendMode = "additive";

// ---------------------------------------------------------------------------
// 夾子 —— 每一條都說明它擋的是哪一種打錯
// ---------------------------------------------------------------------------

/** 拖尾粒子峰值大小。下界 0.1：再小就看不出有尾巴；上界 1.2：再大就糊成一團光。 */
export const MIN_TRAIL_PEAK_SIZE = 0.1;
export const MAX_TRAIL_PEAK_SIZE = 1.2;
/**
 * 拖尾粒子壽命（秒）。上界 0.5 擋的是「把爆點文件的 1–6 秒壽命照抄進拖尾」——
 * 那會讓每一發子彈在空中留一條化不開的煙，整場打完畫面全是線。
 * 下界 0.06 ≈ 手機 30fps 的兩張畫面。
 */
export const MIN_TRAIL_LIFE_SEC = 0.06;
export const MAX_TRAIL_LIFE_SEC = 0.5;
/**
 * 拖尾同時存在的粒子上限。
 *
 * ⚠️ 上界**刻意等於出貨值 48**，不是一個更寬的新數字：`ProjectileView.test.ts`
 * 的 `expect(trail.getCapacity()).toBeLessThanOrEqual(48)` 是 #33 訂下的 overdraw
 * 紀律，而「讓文件真的生效」不該順手把那條預算調寬 —— 我第一版寫 96，那條測試
 * 當場紅給我看，那正是它存在的理由。密度差異走 `emitRate`（同一份預算裡，
 * 36 顆的荊棘仍然比 18 顆的冰彈密）。下界 16：再少拖尾會斷斷續續。
 */
export const MIN_TRAIL_CAPACITY = 16;
export const MAX_TRAIL_CAPACITY = SHIPPED_TRAIL_CAPACITY;
/** 一份爆點文件的 `burstCount` → 拖尾容量的倍率（爆點是一瞬間，拖尾是持續的）。 */
export const TRAIL_CAPACITY_PER_BURST = 2;
/** 發射率 = 容量 × 這個數（略高於 1 讓尾巴填滿而不是稀疏）。 */
export const TRAIL_RATE_PER_CAPACITY = 1.15;

/** 後台那三格的生效值。 */
export interface ProjectileTuning {
  readonly artFromDoc: boolean;
  readonly radiusGain: number;
  readonly flyHeightY: number;
}

export const SHIPPED_PROJECTILE_TUNING: ProjectileTuning = {
  artFromDoc: DEFAULT_PROJECTILE_ART_FROM_DOC,
  radiusGain: DEFAULT_PROJECTILE_RADIUS_GAIN,
  flyHeightY: DEFAULT_PROJECTILE_FLY_HEIGHT_Y,
};

/** 一發子彈在畫面上的完整規格。 */
export interface ProjectileArt {
  /** 頭光暈 / 3D 彈頭的體積倍率（1 = 出貨大小）。 */
  readonly sizeMult: number;
  readonly headSize: number;
  readonly bodyLength: number;
  readonly bodyGirth: number;
  readonly flyHeightY: number;
  readonly trailPeakSize: number;
  readonly trailLife: { readonly min: number; readonly max: number };
  readonly trailCapacity: number;
  readonly trailRate: number;
  readonly trailBlend: VfxBlendMode;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 一份文件的粒子峰值大小（`sizeStops` 優先，沒有就用 `size.start`）。 */
export function docPeakSize(doc: VfxDoc): number {
  const stops = (doc as { sizeStops?: [number, number][] }).sizeStops;
  if (stops && stops.length > 0) return Math.max(...stops.map(([, s]) => s));
  return doc.size.start;
}

/**
 * 這一發要用的那組數字。
 *
 * `artFromDoc` 關掉、或根本沒有文件時，回的就是出貨基準值 × 體積倍率 ——
 * 也就是說**半徑那一格獨立於文件那一格**，可以只開一個。
 */
export function resolveProjectileArt(
  doc: VfxDoc | null,
  hitRadius: number | undefined,
  tuning: ProjectileTuning = SHIPPED_PROJECTILE_TUNING,
): ProjectileArt {
  const sizeMult = projectileSizeMultiplier(hitRadius, clampProjectileRadiusGain(tuning.radiusGain));
  const flyHeightY = clampProjectileFlyHeightY(tuning.flyHeightY);
  const base = {
    sizeMult,
    headSize: SHIPPED_HEAD_SIZE * sizeMult,
    bodyLength: SHIPPED_BODY_LENGTH * sizeMult,
    bodyGirth: SHIPPED_BODY_GIRTH * sizeMult,
    flyHeightY,
  };
  if (!tuning.artFromDoc || !doc) {
    return {
      ...base,
      trailPeakSize: SHIPPED_TRAIL_PEAK_SIZE * sizeMult,
      trailLife: SHIPPED_TRAIL_LIFE,
      trailCapacity: SHIPPED_TRAIL_CAPACITY,
      trailRate: SHIPPED_TRAIL_RATE,
      trailBlend: SHIPPED_TRAIL_BLEND,
    };
  }
  const capacity = Math.round(
    clamp(
      (doc.burstCount ?? SHIPPED_TRAIL_CAPACITY) * TRAIL_CAPACITY_PER_BURST,
      MIN_TRAIL_CAPACITY,
      MAX_TRAIL_CAPACITY,
    ),
  );
  const life = doc.lifetimeSec;
  return {
    ...base,
    trailPeakSize: clamp(docPeakSize(doc) * sizeMult, MIN_TRAIL_PEAK_SIZE, MAX_TRAIL_PEAK_SIZE),
    trailLife: {
      min: clamp(life.min, MIN_TRAIL_LIFE_SEC, MAX_TRAIL_LIFE_SEC),
      max: clamp(life.max, MIN_TRAIL_LIFE_SEC, MAX_TRAIL_LIFE_SEC),
    },
    trailCapacity: capacity,
    trailRate: Math.round(capacity * TRAIL_RATE_PER_CAPACITY),
    trailBlend: doc.blendMode,
  };
}

// ---------------------------------------------------------------------------
// 後台旋鈕的執行期狀態（和 `oneShotLife.ts` 同一個形狀）
// ---------------------------------------------------------------------------

let active: Partial<ProjectileTuning> | undefined;

/**
 * 裝上（或清掉）後台的投射物旋鈕。由 `ContentDb.load()` 呼叫，和
 * `setFamilyTuning` / `setOneShotMaxLifeSec` 同一條路、同一份
 * `config.vfx-families@1`。傳 `undefined` = 回到出貨值。
 */
export function setProjectileTuning(t: Partial<ProjectileTuning> | undefined): void {
  active = t;
}

/**
 * 一個 `hitRadius` 在**現在生效的旋鈕**之下的體積倍率。
 *
 * 給守衛用的「宣稱值」：測試拿它和 Babylon 手上的 `mesh.scaling` 比對，所以
 * 「算出來的」和「送到引擎的」必須相等 —— 那正是第②號故障的斷言方向。
 */
export function projectileSizeMultiplierOf(hitRadius: number | undefined): number {
  return projectileSizeMultiplier(hitRadius, projectileTuning().radiusGain);
}

/** 現在生效的旋鈕（後台的值，沒設過就是出貨值；界外的值夾回範圍內）。 */
export function projectileTuning(): ProjectileTuning {
  return {
    artFromDoc: active?.artFromDoc ?? DEFAULT_PROJECTILE_ART_FROM_DOC,
    radiusGain: clampProjectileRadiusGain(active?.radiusGain),
    flyHeightY: clampProjectileFlyHeightY(active?.flyHeightY),
  };
}

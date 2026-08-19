/**
 * 施法特效播在離地多高 —— **一個有名字的接縫，取代四個匿名的 `1.0`** (#230)，
 * 現在**真的接上去了** (owner #251「衝擊波特效沒有真實套用」)。
 *
 * ---------------------------------------------------------------------------
 * 動手前量到的東西（不是讀註解，是跑真的渲染器）
 * ---------------------------------------------------------------------------
 * 2026-08-01，把出貨的 `content/config/vfx-families.json` 餵給真的
 * `VfxSystem.handleEvent`，對 `w3xFamilyArtRows()` 裡**全部 91 支 `shockwaveRing`**
 * 各發一次施法事件，從 Babylon 讀回每一個 `ParticleSystem` 的 emitter 世界座標：
 *
 *   · 91 支畫出 105 個 `ParticleSystem`
 *   · emitter 世界 Y 的直方圖是**單獨一格**：`{ 1.0: 105 }`
 *   · 而出貨 config 對這個家族寫的是 `heightY: 0.15`
 *
 * 也就是：owner 說的「衝擊波特效沒有真實套用」**成立，但不是因為特效不存在**。
 * 衝擊波環存在、綁上了、每一支都在噴粒子 —— 它被畫在**胸口高度**，而它是一個
 * 「地面向外擴的環」。整張家族表 258 列裡有 216 列的設定高度不是 1.0。
 *
 * 為什麼會這樣：`resolveFamilyArt()` 每一支都算得出 `heightY`，然後
 * `familyRow()` 把 `ResolvedFamilyArt` 塞進 `W3xAbilityArt` 時，**那個介面沒有
 * 這個欄位**，值在那一行蒸發 —— 第②號故障。後台
 * `apps/admin/src/vfxForge.ts` 的 `DEAD_FAMILY_KNOBS` 白紙黑字列著它。
 *
 * ---------------------------------------------------------------------------
 * 接法：一個欄位，三個值，不是一個 `if`
 * ---------------------------------------------------------------------------
 * 「要不要接」本身是決策點，所以它是 `config.vfx-families@1.castHeightSource`
 * 的一格（第一守則）。三個值的語意與**為什麼出貨值是 `ground`** 寫在
 * `CAST_HEIGHT_SOURCES`（`packages/shared/src/content/schema/vfx.ts`）上面。
 * 一句話版本：`ground` 只讓**想往下**的家族往下，往上那一半（雷擊 3.2、流星
 * 3.5）維持平面，因為往下不可能飛出構圖，往上是 owner 還沒看過的視覺變更。
 *
 * ⚠️ 一起改掉的第二件事：EX 施法除了技能美術之外還會補一發
 * `VfxSystem.layeredPop(...,"ex",...)` 的打擊感火花。它以前吃 `HitSpark` 的
 * 預設 y=1.0，所以家族高度一接上去，兩層就會在畫面上脫開 ——
 * `familyCastOnScreen.test.ts` 的檔頭早就把這個後果寫下來了。現在
 * `playCastVfx` 把同一個 `castY` 傳給它。
 *
 * ---------------------------------------------------------------------------
 * 這個接縫買到什麼
 * ---------------------------------------------------------------------------
 * `familyCastOnScreen.test.ts` 斷言的是「**渲染器宣稱的高度 == Babylon 真的拿到
 * 的高度**」。它現在守的是一個真的會動的值：把 `familyCastHeightY` 改成回
 * `SHIPPED_CAST_HEIGHT_Y` 而 rig 那邊不動，兩邊仍然相等所以綠 —— 所以那條測試
 * **不是**這次改動的守衛；`castHeightApplied.test.ts` 才是（它量的是「地面家族
 * 的 emitter 真的比平面低」）。兩條一起才蓋得住②號故障的兩半。
 */
import {
  DEFAULT_CAST_HEIGHT_SOURCE,
  resolveCastHeightSource,
  type CastHeightSource,
} from "@ggd/shared/content/schema/vfx";
import type { W3xAbilityArt } from "./w3xAbilityArt";

export { DEFAULT_CAST_HEIGHT_SOURCE };
export type { CastHeightSource };

/**
 * 平面施法高度（世界單位）—— `"flat"` 模式下每一支技能的高度，也是其他兩個
 * 模式的**基準線**（`"ground"` 拿它當「往下才算」的門檻）。
 *
 * 1.0 ≈ 一位 1.7 單位高的英雄的胸口。這個值不是美術挑的，是
 * `VfxSystem.play()` 的預設值 —— 見檔頭。
 */
export const SHIPPED_CAST_HEIGHT_Y = 1.0;

/**
 * 出得了畫面的高度範圍。下界不是 0：emitter 剛好在 0 的粒子有一半在地板下
 * （第①號故障）。上界 8 = 戰鬥鏡頭下英雄頭頂再上去四個身高，
 * 和 `familyCastOnScreen.test.ts` 的 `CEILING_Y` 是同一條線。
 *
 * 夾子存在是因為 `resolveFamilyArt` 會把後台的家族 `heightY`（0–8）加上原圖
 * `SetUnitFlyHeight`（−2000–2000 WC3 單位）的差值，兩格都在界內時和仍可能出界。
 */
export const MIN_CAST_HEIGHT_Y = 0.05;
export const MAX_CAST_HEIGHT_Y = 8;

let activeSource: CastHeightSource | undefined;

/**
 * 裝上（或清掉）後台的高度模式。傳 `undefined` = 回到出貨值。
 * 由 `ContentDb.load()` 呼叫，和 `setFamilyTuning` / `setOneShotMaxLifeSec`
 * 同一條路、同一份 `config.vfx-families@1`。
 */
export function setCastHeightSource(v: string | undefined): void {
  activeSource = v === undefined ? undefined : resolveCastHeightSource(v);
}

/** 現在生效的模式（後台的值，沒設過就是出貨值）。 */
export function castHeightSource(): CastHeightSource {
  return activeSource ?? DEFAULT_CAST_HEIGHT_SOURCE;
}

/**
 * 這一次施法要播在哪個世界高度。
 *
 * `art` 沒有 `heightY`（`w3xAbilityArtRows()` 那 34 支晉升、或根本沒晉升的技能）
 * 一律走平面高度 —— 那些列沒有家族原型，也就沒有「這一招應該多高」這個答案。
 */
export function familyCastHeightY(art: W3xAbilityArt | undefined): number {
  const want = art?.heightY;
  if (want === undefined || !Number.isFinite(want)) return SHIPPED_CAST_HEIGHT_Y;
  const mode = castHeightSource();
  if (mode === "flat") return SHIPPED_CAST_HEIGHT_Y;
  // `ground` = 只採用「比平面低」的那一半（貼地的環/塵土/火柱/光柱）。
  if (mode === "ground" && want >= SHIPPED_CAST_HEIGHT_Y) return SHIPPED_CAST_HEIGHT_Y;
  return Math.min(MAX_CAST_HEIGHT_Y, Math.max(MIN_CAST_HEIGHT_Y, want));
}

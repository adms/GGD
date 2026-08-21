/**
 * modelSizing — THE ONE PLACE a champion's on-screen size is decided (GH#368).
 *
 * owner 2026-08-18:「多拉A夢在商店依然是巨大支，你是不是**沒改到正常遊戲大小**
 * （其他英雄也是?）」
 *
 * ⚠️ THE SHAPE OF THE DEFECT — four scenes, four hand-copies, one of them right.
 *
 * #150 introduced height normalization and it went in at ONE call site:
 * `ChampionView.tryUpgradeToGlb`, the arena. 結算 rides the arena (it is only a
 * camera over the live scene, see render/settlementCamera.ts) so it inherited
 * the fix. The other three paths kept multiplying the model doc's raw `scale`:
 *
 *   · `StorePreview.show`          → 商店 / 英靈殿 / 選擇英雄 / 回合勝者卡
 *   · `IntermissionScene.setChampion` → 補給站攤位
 *   · `championModelAudition`      → the /model audition page (normalized, but
 *                                    without the per-champion multiplier)
 *
 * And `doc.scale` is not a size. For an overlay doc it is the hard-coded
 * `OVERLAY_MODEL_SCALE = 1`, whose own comment says so in as many words —
 *「Any future consumer that uses `doc.scale` as an absolute has to measure,
 * exactly as ChampionView does」— and then GH#31 wired the previews onto the
 * overlay resolver, which made them exactly that consumer. Measured: 小叮噹
 * (godie-n00b) rides N00B.glb, which the w3x importer baked at 6.672u native.
 * The arena renders him at 1.8 × 0.65 = 1.17u; the preview scenes rendered the
 * raw 6.672u — 5.7× too big, standing on a podium that is 2.4u across. That is
 * the「巨大支」.
 *
 * ⛔ So the fix is NOT an `if` in StorePreview. It is this module: every path
 * that mounts a champion mesh calls {@link normalizedModelScale}, and a fifth
 * scene added tomorrow gets the size right by construction. `modelSizing.test.ts`
 * asserts the call sites, not the existence of the function.
 *
 * ⚠️⚠️ **BUT「呼叫同一支函式」不等於「餵它同一個量測」—— 這一段以前寫得像是等價的，
 * 而它不是**（CLAUDE.md 第三守則：註解會說謊，去驗證）。量到的（2026-08-22，GH#368）：
 *
 *   | 路徑 | `hiddenPrimitives` | 量高度用的 predicate |
 *   |---|---|---|
 *   | `ChampionView.tryUpgradeToGlb`  | ✅ 藏 | `ENABLED_ONLY` |
 *   | `StorePreview.show`             | ✅ 藏 | `ENABLED_ONLY` |
 *   | `IntermissionScene.setChampion` | ✅ 藏 | `ENABLED_ONLY` |
 *   | **`championModelAudition`**（`/model` 稽核頁） | ⛔ **從來沒藏** | ⛔ **裸的 `getHierarchyBoundingVectors(true)`** |
 *
 * ⇒ 第四條**呼叫了 {@link normalizedModelScale}，卻餵它血泥的高度**。後果與 #368
 * 原本那三條一模一樣：16 隻 overlay 英雄在稽核頁上矮 ~35%，而且腳底貼的是血泥
 * 不是身體（`hiddenPrimitives.ts` 的 `ENABLED_ONLY` 檔頭寫著「⛔ Never measure a
 * freshly-mounted champion WITHOUT this predicate」，而這一條正是那句話的反例）。
 *
 * ⚠️ 這正是**失敗形態 ⑤（被測的不是出貨的那個）**的一個新面孔：`modelSizing.test.ts`
 * 釘住了三條路徑算出同一個世界高度，⛔ 而稽核頁那一條**不在夾具裡**，所以它退回
 * 錯的量測時一格都不會紅。⇒ 修法在 `render/championModelAudition.ts`
 * （`applyHiddenPrimitives` + 兩處 `ENABLED_ONLY`），⛔ 不在這一支；
 * 這裡只負責不再宣稱它已經對了。
 *
 * This module is deliberately PURE (no @babylonjs import): the scenes hand it
 * numbers they measured with `getHierarchyBoundingVectors`, so it unit-tests
 * without an engine and can be imported by probe scripts.
 */
import { isStandinBodyGlb, standinRelativeScaleOf } from "@ggd/shared/content/standinScale";
import type { StandinScaleFields } from "@ggd/shared/content/standinScale";

/**
 * HEIGHT-NORMALIZATION target (task #150). Every loaded champion .glb is scaled
 * so its full silhouette stands ≈ this many world units tall, REGARDLESS of the
 * glb's native mesh height — which varies wildly per champion (measured 1.70u to
 * 2.32u rendered across the shipped roster, and 1.29u to 21.83u across the
 * Blizzard overlay, whose exporter only normalized the files that passed its
 * hero-height guard). Before #150 the render scale was the model doc's raw
 * `scale` applied as an ABSOLUTE — so consistency depended on every doc.scale
 * being hand-tuned per glb (fragile: any new/un-tuned import renders wrong).
 * Normalizing makes size CONSISTENT by construction. A per-champion RELATIVE
 * multiplier (`content/models/_standin-overrides.json`) then intentionally
 * shrinks lore-small creatures / enlarges giants. ~1.8u ≈ a standing human
 * (夏娜 = the normal case).
 */
export const TARGET_HEIGHT = 1.8;

/**
 * Below this the measured native height is noise, not a body: a geometry-less
 * WC3 dummy, or a hierarchy Babylon could not bound. Dividing by it would
 * produce a nonsense normalization factor (a 0.001u dummy would be scaled
 * 1800×), so those fall back to the doc's declared scale instead.
 */
export const MIN_NATIVE_HEIGHT = 0.05;

/**
 * The uniform scale to apply to a freshly-mounted champion .glb.
 *
 * @param nativeHeight  the glb's own bounding-box height, measured at scale 1
 *                      (`getHierarchyBoundingVectors(true, …).max.y - min.y`).
 *                      ⚠️ Measure with the same enabled-mesh predicate the
 *                      caller renders with — hidden gore geometry that still
 *                      counts here silently shrinks the whole champion.
 * @param docScale      the model doc's `scale`, used ONLY as the degenerate
 *                      fallback (see {@link MIN_NATIVE_HEIGHT}).
 * @param relativeScale the champion's INTENTIONAL size multiplier from
 *                      `_standin-overrides.json` (1 = the common height,
 *                      0.65 = 小叮噹, 1.55 = 初號機). Non-positive ⇒ 1.
 */
export function normalizedModelScale(
  nativeHeight: number,
  docScale: number,
  relativeScale = 1,
): number {
  const rel = Number.isFinite(relativeScale) && relativeScale > 0 ? relativeScale : 1;
  const base =
    Number.isFinite(nativeHeight) && nativeHeight > MIN_NATIVE_HEIGHT
      ? TARGET_HEIGHT / nativeHeight
      : docScale;
  return base * rel;
}

/**
 * WHICH of the sidecar's two multipliers applies to the body that actually
 * loaded (#77).
 *
 * A stand-in champion's `modelKey` always names one of the four shared bodies,
 * but the mesh that reaches `assets.load()` may be its own Warcraft III model
 * (GH#31) or — when the overlay is disabled/absent — the generated box-man.
 * Both normalize to the same {@link TARGET_HEIGHT}, but「how much to multiply
 * after that」is a different number for each: the box-man's silhouette IS the
 * body (× usca), a WC3 rig's is not (× height-ratio × usca). So the question is
 *「who is this MESH」, never「who is this champion」 — and it is answered here,
 * once, rather than re-derived by each scene.
 *
 * The arena reaches the same answer by a different route: `EntityViewRegistry`
 * hands `ChampionView` BOTH numbers and it picks with the same predicate, so
 * that call site does not need this helper.
 */
export function bodyRelativeScale(
  glbPath: string | null | undefined,
  override: StandinScaleFields | null | undefined,
): number {
  if (!override) return 1;
  return isStandinBodyGlb(glbPath)
    ? standinRelativeScaleOf(override)
    : (positive(override.relativeScale) ?? 1);
}

function positive(n: number | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

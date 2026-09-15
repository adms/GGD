/**
 * standIn — is a champion wearing a generic STAND-IN model rather than its own
 * imported one? (task #76 profile block; the underlying data debt is task #77.)
 *
 * 43 of the 114 champions point their `modelKey` at one of four generic meshes
 * instead of an `imported.*` mesh extracted from the w3x (re-measured on the
 * v0.5.16 tree; earlier notes said 42/113, then 44 — the 44 counted 喪標麥可,
 * which #217 has since moved onto its own `champ.godie-zombiex` zombie mesh).
 * Since #226 those four are the GENERATED blocky humanoids (`tools/voxel-gen`),
 * not the retired KayKit characters:
 *
 *     champ.sela            → blocky-mage.glb      (18 champions)
 *     champ.thorne          → blocky-knight.glb    (10)
 *     champ.skin.barbarian  → blocky-barbarian.glb ( 9)
 *     champ.skin.rogue      → blocky-rogue.glb     ( 6)
 *
 * A generated box-man is still a stand-in — arguably more honestly so, since it
 * makes no claim to be the champion's own art — so the label below stays. The
 * per-champion palette/proportions #226 applies at runtime make the 43 visually
 * distinct from one another, but they are still not the character's real model.
 *
 * TASK #231 CHANGED WHAT THIS MEANS, AND ONLY HALF OF IT.
 * All 43 now have their OWN deterministically generated voxel skin, and
 * `ChampionView` declines the shared glb for them — so IN THE ARENA nobody
 * wears somebody else's face any more. The champ-select / shop / settlement
 * stages, however, still mount the glb through `StorePreview`, which has no
 * procedural path (#226 open question), so on THOSE surfaces the shared mesh is
 * still what renders. The note below therefore stays — narrowed to say what is
 * actually true of the stage the player is looking at, rather than being
 * deleted on the strength of a fix that has not reached it yet.
 *
 * ⛔ …AND THAT PARAGRAPH WENT STALE THE SAME WEEK (GH#224, 第一·五守則).
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-07-28:「請你都先用**暴雪的 3d model**，要替換成體素是我從後台設定
 * 套用才生效」. `defaultPrefersVoxelBody`（`shared/content/voxelSkin/types.ts`）
 * therefore stopped being `isStandIn` alone: a champion takes the procedural
 * voxel figure ONLY when it points at a stand-in AND no WC3 model is reachable
 * for it or its transform counterpart.
 *
 * MEASURED on the shipped content, 2026-08-22: of the 17 champion docs this
 * badge fires on, `defaultPrefersVoxelBody` is true for exactly **two** — `sela`
 * and `thorne`, the two CC0 characters that are not map heroes and are not on
 * the pickable roster at all. For **every pickable champion the badge appears
 * on, the sentence 「戰鬥中已改用本角色專屬體素外觀」 describes something that
 * does not happen**: they get their own Warcraft III mesh through
 * `BlizzardOverlayModels.resolve`, or — when no overlay is installed — the very
 * same shared box-man the preview is showing.
 *
 * That is the exact shape 第一·五守則 names: every part is legal, every test is
 * green, and the card states an outcome the build never produces. The fix taken
 * here is the rule's option ②「把描述改成只講真的會發生的事」 — the badge knows
 * only a `modelKey`, and a `modelKey` structurally cannot answer 「戰鬥中他會穿
 * 什麼」 (that needs the champion id, the overlay probe and the admin override:
 * see `render/views/standinCensus.ts`, which walks the real resolution path).
 * ⛔ Option ①「換成做得到的等效機制」 — feeding the census answer to the badge —
 * needs `ProfileBlock.tsx` and `ValhallaPanel.tsx`, the two files that render
 * it, and both are outside this lane's fence. Recorded on GH#224 instead.
 * `standIn.test.ts` re-derives the measurement above from the shipped roster
 * every run, so the sentence cannot quietly grow the promise back.
 *
 * The `voxel-standin` CONTENT TAG (40 of these 43 docs carry it; sela's and
 * thorne's own three in-house docs do not) is likewise KEPT and re-read: it
 * means "this champion has no imported art of its own", which is still exactly
 * true — its generated look is procedural, not imported. Retiring the tag would
 * lose the only content-side handle on the population #226 is replacing.
 *
 * Node-testable: it reads a modelKey plus that key's MODEL DOC, never the render layer.
 *
 * ⚠️ CORRECTED (GH#1250, 2026-09-15): this paragraph used to say the rule is an
 * EXPLICIT four-key set. ⛔ That set missed `champ.godie-zombiex` (the mob's
 * blocky-undead.glb). The rule now lives in `@ggd/shared/content/standInBody`:
 * the model doc's `glbPath` sits under the in-house generic body pack — so a
 * champion that later gains its OWN mesh (imported/community path) is still not
 * mistaken for a stand-in, which was the reason the explicit set existed.
 */
import { STAND_IN_MODEL_KEYS as SHARED_STAND_IN_MODEL_KEYS } from "@ggd/shared/content/voxelSkin";
import { Models } from "@ggd/shared/content";
import {
  isStandInModel as sharedIsStandInModel,
  isStockBodyGlbPath,
} from "@ggd/shared/content/standInBody";

/**
 * The generic meshes used when a champion has no imported model.
 *
 * ⭐ DERIVED, ⛔ not a second hand-typed copy. It used to be a literal list of
 * four keys sitting a few metres from `shared/content/voxelSkin`'s own list of
 * the same four — and `defaultPrefersVoxelBody` reads THAT one. Two lists mean
 * a fifth fallback added to the content makes the renderer switch bodies while
 * this badge stays silent, with nothing going red. Re-exported as a `Set`
 * because that is the shape this module's callers already use.
 */
export const STAND_IN_MODEL_KEYS: ReadonlySet<string> = new Set(SHARED_STAND_IN_MODEL_KEYS);

/**
 * True when `modelKey` points at a generic stand-in body (never a real model).
 *
 * ⭐ GH#1250：轉呼叫 `@ggd/shared/content/standInBody`（唯一住處，看 glb 是否在通用身體包底下）。
 * ⛔ 在此之前這裡只查上面那 4 顆 key ⇒ `champ.godie-zombiex`（殭屍小怪的 blocky-undead.glb）沒有徽章。
 * ⚠️ 上面的 `STAND_IN_MODEL_KEYS` **不是**這裡的判準（它是四具體素 rig 的名單，身體規則在讀）。
 *
 * 資料來源＝`Models` registry。查不到那份文件（骨架退路沒有模型文件、內容還沒到）⇒ 明說 `null`
 * ⇒ 不亮徽章 —— ⛔ 不讓 shared 那一支的「registry 沒載入就丟錯」把大廳整個卡掉
 * （內容載入失敗在 console 與 /healthz 已經是 fail-loud，徽章不是那個訊號）。
 */
export function isStandInModel(modelKey: string | null | undefined): boolean {
  return sharedIsStandInModel(modelKey, typeof modelKey === "string" ? (Models.tryGet(modelKey) ?? null) : null);
}

/**
 * 🎭 替身徽章要不要亮（GH#1250）。
 * ⭐ 舞台**已經載入**的模型文件知道了 ⇒ 看它（overlay 可能已經換成原作模型）；
 * 還不知道（載入中／失敗）⇒ 看出貨的 `modelKey`。
 */
export function standInBadgeFor(
  modelKey: string | null | undefined,
  loaded: { glbPath: string } | null | undefined,
): boolean {
  return loaded ? isStockBodyGlbPath(loaded.glbPath) : isStandInModel(modelKey);
}

/**
 * The honest one-line label the stage shows over a stand-in, so nobody reads a
 * generic mage/knight as the champion. Trilingual-adjacent (zh load-bearing).
 *
 * ⛔ IT MAY NOT NAME A COMBAT BODY. See this file's header: the only input the
 * badge has is a `modelKey`, and the body a champion really wears in the arena
 * is decided two layers later by `BlizzardOverlayModels.resolve` and the admin
 * `preferVoxelBody` override. The previous wording promised the voxel figure
 * and was false for every pickable champion it appeared on (GH#224). What is
 * true of ALL of them — and is the thing a player actually needs to know while
 * looking at a shared box-man on the preview stage — is that the SHARED MESH IS
 * A PREVIEW ARTEFACT, not this character's art.
 */
export const STAND_IN_NOTE_ZH =
  "替身模型 · 僅本頁預覽：這位角色沒有自己的匯入模型，戰鬥中的實際外觀另行決定";
export const STAND_IN_NOTE_EN =
  "stand-in model — preview only; this champion has no imported model of its own, and what it wears in combat is decided separately";

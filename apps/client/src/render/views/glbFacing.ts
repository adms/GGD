/**
 * glbFacing — THE single authoritative source of the .glb yaw-facing
 * convention. ChampionView, StorePreview, the intermission scene and the model
 * audition page all derive their glbRoot yaw from {@link glbYawOffset}; there
 * is no other place a facing offset is defined.
 *
 * ⚠️ THIS HEADER WAS REWRITTEN 2026-08-02 BECAUSE IT WAS LYING (CLAUDE.md 第三
 * 守則). Everything below is re-measured off the shipped .glb bytes by
 * `modelFacing.test.ts`, which recomputes it on every run — so if this text
 * ever drifts from the files again, that test goes red rather than this comment
 * quietly becoming fiction. What the old header got wrong:
 *
 *   1. 「w3x-imported … bake forward = local -X」 — FALSE. Measured +X, from
 *      three independent cues (left/right skeleton chirality, the toe-vs-ankle
 *      offset of foot-weighted vertices, and the head/chest forward lean). The
 *      old header even contradicted itself: its own second measurement line
 *      ("imported + Math.PI → world +X") is only true if forward is +X.
 *   2. 「KayKit / native glTF」 — STALE. #226 deleted the KayKit characters;
 *      the native family is now the procedurally baked box-men from
 *      packages/shared/src/voxel/bake.ts. Their forward is +Z (measured).
 *   3. 「Only `imported.heroryuk` is genuinely flipped … corroborated by its
 *      hand cue」 — INCOMPLETE, and the corroboration was invented. The set
 *      missed `imported.linkstik`, which IS 180° off and IS shipped, on
 *      `godie-h00l 時空勇者 - 林克`.
 *   4. 「`imported.heropika` … its hand attach-nodes are mislabeled ONLY」 —
 *      right verdict, wrong reason. heropika's whole SKELETON is L/R-swapped
 *      (Bone_Ear_L sits on the geometric right), not just the hands. Its true
 *      forward is +X — proved by its tail bone, which sits at -X, and a tail
 *      points backwards. It correctly takes the family default.
 *
 * THE LAW, stated so it is falsifiable
 * ---------------------------------------------------------------------------
 * A model's .glb bakes a "forward" axis. Let φ be that axis's yaw on disk,
 * φ = atan2(forward.x, forward.z). Then:
 *
 *       required glbRoot yaw offset  ≡  φ   (mod 360°)
 *
 * Babylon's glTF loader inserts a `__root__` carrying rotationQuaternion
 * [0,1,0,0] (180° about Y) AND scaling (1,1,-1); the two compose to a pure X
 * mirror (Z is preserved). Push each family through that and the law falls out:
 *
 *   native   φ=  0° → mirror → +Z → offset   0° → renders world +Z  ✓
 *   imported φ= 90° → mirror → -X → offset  90° → renders world +Z  ✓
 *   flipped  φ=-90° → mirror → +X → offset 270° → renders world +Z  ✓
 *
 * and world +Z is exactly the sim facing the test drives in. The law is not
 * asserted, it is CHECKED per model against real geometry in modelFacing.test.ts.
 *
 * WHY A PER-FAMILY DEFAULT AT ALL. The two shipped families really are 90°
 * apart, because tools/w3x-import preserves the MDX forward (+X) while the
 * voxel baker authors +Z. A single global offset cannot serve both.
 *
 * WHY THE EXCEPTIONS ARE CONTENT, NOT A Set HERE (CLAUDE.md 第一守則).
 * The per-model correction now lives on the model doc as `yawOffsetDeg`
 * (`content/models/*.json`). `content/` is a live bind-mount and the client is
 * baked into its image, so as a doc field a mis-baked model is a file edit
 * instead of a rebuild + redeploy. The old hardcoded Set was also keyed by
 * `modelKey`, which could not express an override for the 40 Blizzard-overlay
 * champions at all — they share stand-in modelKeys, so one entry would have
 * rotated ~18 unrelated champions.
 *
 * ⚠️ Callers used to pass `this.modelKey` (ChampionView, IntermissionScene) or
 * `doc.id` (StorePreview, the audition page) as the exception key — two
 * different answers for the same mesh, harmless only while the Set was empty of
 * anything either of them used. {@link glbYawOffset} now takes the DOC, so the
 * arena and the shop cannot disagree by construction.
 */
import type { ModelDoc } from "@ggd/shared/content";

/** glbPath prefix identifying a w3x-imported model (baked forward +X). */
// ⭐⭐ Codex 阻塞清單 B（2026-09-02）—— 這一整段**搬到 `@ggd/shared` 去了**，
// 這裡是**門面**（re-export），⛔ 不是第二份。
//
// ⚠️ 為什麼要搬：`resolved-appearance@1`（住 shared）在此之前回的是
// 「文件上寫了什麼」（缺值 ⇒ **0°**），⛔ 而遊戲套的是**家族回退**
// （w3x 匯入的是 **90°**）⇒ ⭐ 外部編輯器拿到的是一個安靜的錯值。
// ⛔ 而 shared **不可以** import client ⇒ 契約那一側**構造上**拿不到出貨的 resolver。
// ⇒ ⭐ 搬到 shared 之後兩邊 import 同一支，⛔ 漂開在結構上不可能發生。
//
// ⭐ 門面保住既有的 9 個 import 端（`ChampionView` / `blizzardOverlay` /
// `IntermissionScene` / `StorePreview` …）—— ⛔ 搬家不逼消費者改一行。
export {
  IMPORTED_GLB_PREFIX,
  BLIZZARD_LOCAL_GLB_PREFIX,
  NATIVE_GLB_YAW_OFFSET,
  IMPORTED_GLB_YAW_OFFSET,
  IMPORTED_FLIPPED_GLB_YAW_OFFSET,
  isImportedGlb,
  familyGlbYawOffset,
  glbYawOffset,
  effectiveYawOffsetDeg,
} from "@ggd/shared/content/glbYaw";

/** The subset of a ModelDoc this module needs (overlay docs are synthesized). */
export type FacingModelDoc = Pick<ModelDoc, "glbPath"> & { yawOffsetDeg?: number };

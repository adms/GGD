/**
 * model@1 — voxel model metadata. Maps a `modelKey` (referenced from
 * champion.modelKey) to a Blockbench-exported .glb under content/assets/**,
 * plus the animation clip map, attach points, and team-tint materials the
 * client's AnimationStateMachine / EntityView need.
 */
import { z } from "zod";
import { zId } from "./common";
import { zVoxelLook } from "../../voxel/look";

export const zClipMap = z
  .object({
    idle: z.string().min(1),
    run: z.string().min(1),
    attack: z.string().min(1),
    cast: z.string().min(1),
    hurt: z.string().min(1),
    death: z.string().min(1),
  })
  .strict();

export const zModelDoc = z
  .object({
    id: zId,
    schema: z.literal("model@1"),
    /** path relative to content/ root; binaries live under assets/** */
    glbPath: z
      .string()
      .min(1)
      .regex(/^assets\//, "glbPath must be relative to content/ and start with assets/"),
    scale: z.number().positive(),
    /** planar collision radius the sim uses for this model's champion */
    collisionRadius: z.number().positive(),
    /** logical state -> AnimationGroup clip name inside the .glb */
    clipMap: zClipMap,
    /** named local-space offsets for vfx/projectile muzzles, overhead UI, … */
    attachPoints: z
      .record(
        z.string().min(1),
        z.object({ x: z.number(), y: z.number(), z: z.number() }).strict(),
      )
      .optional(),
    /** material names that get re-tinted to the owning team's color */
    teamTintMaterials: z.array(z.string().min(1)).optional(),
    /**
     * The generator parameters this model was authored from (task #229's
     * 鑄形工坊 / #226's blocky-humanoid bake). PRESENT ⇒ the .glb at `glbPath`
     * is produced by `pnpm voxel:gen` from these numbers and must not be
     * hand-edited; ABSENT ⇒ the model is an imported/hand-authored mesh and
     * the bake leaves it alone.
     *
     * ADDITIVE AND OPTIONAL ON PURPOSE. `glbPath` stays required and the
     * object stays `.strict()`, so all 121 existing `content/models/*.json`
     * documents remain valid unchanged, and a generated model is still an
     * ordinary model@1 that champions reference by `modelKey` exactly as today.
     */
    voxel: zVoxelLook.optional(),
    /**
     * Yaw correction (DEGREES, CCW about +Y) applied to this model's glbRoot so
     * its rendered facing matches the sim's. ABSENT ⇒ the family default for
     * `glbPath` (see apps/client/src/render/views/glbFacing.ts).
     *
     * WHY THIS IS CONTENT AND NOT A CONSTANT (CLAUDE.md 第一守則).
     * It used to be `FLIPPED_IMPORTED_MODEL_KEYS`, a hardcoded Set in client
     * code, which meant a mis-baked model could only be corrected by editing
     * TypeScript and rebuilding + redeploying the client image. `content/` is a
     * live bind-mount, so as a doc field the same correction is a file edit.
     * That matters because the set was demonstrably INCOMPLETE — measuring the
     * shipped geometry found `imported.linkstik` 180° off and unlisted (see
     * modelFacing.test.ts, which re-derives every value from the .glb itself).
     *
     * It also fixes a hole the Set could not express at all: it was keyed by
     * `modelKey`, but the 40 Blizzard-overlay champions all share a stand-in
     * modelKey (`champ.sela`/`champ.skin.*`), so one entry would have rotated
     * ~18 unrelated champions. Keyed to the model DOC, one doc = one mesh.
     *
     * Range is ±360 so an author can write 270 or -90 for the same rotation.
     */
    yawOffsetDeg: z.number().gte(-360).lte(360).optional(),
    /**
     * glTF `mesh.primitives[i]` indices this model must NOT draw. ABSENT/empty
     * ⇒ draw everything (today's behaviour for all 124 shipped model docs).
     *
     * WHY THIS EXISTS — 「3d model 連著屍體一起」(owner 2026-08-02, 初號機 +
     * 拳四郎). Warcraft III unit models carry a `gutz*` GORE geoset: the pool of
     * blood/entrails the corpse leaves behind. WC3 keeps it invisible until the
     * decay sequence by animating the geoset's alpha (GEOA/KGAO) — and #59
     * established that the mdx→glb converter DROPS geoset visibility animation,
     * so every one of those geosets converts to a permanently-visible primitive.
     * Measured on `data/blizzard-overlay/models/` (see the census tool below):
     * 16 of the 40 extracted unit models ship one, and it is not subtle —
     * `E00R.glb`'s is a flat slab spanning x −0.03…1.64 at y 0.12…0.26 on a body
     * only ~1.7u tall, i.e. a corpse-sized splat lying on the floor beside the
     * champion. `Umal.glb` additionally carries a whole SECOND animated skeleton
     * (`Bone_Root01`, 107 verts) standing ~1.2u away in +Z, driven by all 13
     * clips — it walks, attacks and dies with you.
     *
     * WHY IT IS AN INDEX LIST AND NOT A JOINT-NAME LIST.
     * The obvious spelling is "hide the subtree under joint `gutz00`", but that
     * cannot be implemented in the render layer: the gore is SKINNED geometry
     * inside a shared mesh, so disabling a bone's TransformNode moves nothing —
     * the vertices follow the bone matrices regardless. Hiding has to happen at
     * the drawable, and the drawable is the primitive. A field whose value the
     * renderer silently cannot honour is failure form ② (計算了但從沒送到畫面),
     * so the joint analysis stays in the offline tool where it can actually run
     * (tools/w3x-import/gore_geoset_census.py resolves joint roots → indices)
     * and the doc records the answer.
     *
     * THE COST OF INDICES IS DRIFT — a re-extraction can renumber them, and a
     * wrong index either misses (gore returns) or hits the body (champion
     * vanishes). That is exactly why the census is committed as a fixture and
     * `apps/client/src/render/views/hiddenPrimitives.test.ts` re-derives every
     * declared index from the real .glb bytes: drift goes red, it does not rot.
     *
     * Bounded both ways (CLAUDE.md 第一守則): a glTF mesh with >256 primitives
     * is not a champion body, and 32 hidden primitives is already far more than
     * the worst measured model needs (2, `Ekee.glb`).
     */
    hiddenPrimitives: z.array(z.number().int().gte(0).lte(255)).max(32).optional(),
    /**
     * 這一份 .glb 的**長軸**烘在自己的哪一個座標軸上。ABSENT ⇒ ⛔ 不做任何姿態
     * 修正（今天 124 份出貨文件的行為，逐位元不變）。
     *
     * 它只被 `spawnModelFx` 這一條「模型即特效」的通道讀：那條通道把宣告的長軸
     * **轉到行進方向上**，於是一支沿自己長軸建的光柱會**橫躺**在它飛的那條線上。
     *
     * ── owner 2026-08-22 ────────────────────────────────────────────────────
     * 「翻滾光束應該包含 **90 度橫放的 beam** 吧」「許多角色的**衝擊波特效橫放 beam**」
     *
     * ⚠️ 缺陷長這樣（實測，⛔ 不是推測）：原作的 beam 模型多半沿**自己的長軸**建，
     * 而 `spawnModelFx` 只給了它一個繞世界 Y 的偏航 —— 偏航轉不動「立著的東西」。
     * 量到的兩支正在用的模型：
     *   · `imported.netherstrike`（Saber 約束與勝利之劍的翻滾光束）
     *     rest bbox 26.92 × **30.71** × 26.92 —— 五根 `Cylinder*` 骨頭全部朝 +Y，
     *     ⇒ 它是一根**站著的**柱子，今天在畫面上是一根直立的柱子平移過去。
     *   · `imported.fireblast`（莉娜 龍破斬）
     *     rest bbox **4.03** × 2.67 × 2.56，x 從 −3.33 拖到 +0.71
     *     ⇒ 沿 X 建的火焰，今天**橫著**飛（長軸垂直於行進方向）。
     *
     * ── ⭐ 為什麼它住在 model@1，⛔ 不住在每一支技能上 ─────────────────────
     * 「這一份 mdx 當初朝哪一軸建」是**這份網格自己的性質**，⛔ 不是某一支技能的
     * 選擇：同一份 `netherstrike.glb` 被 `godie-e002.e` 與 `godie-e00l.e` 兩支
     * 技能引用，它們必須拿到同一個答案。寫在技能上就是**同一個事實有 N 個住處**
     * （第〇·四守則），而那 N 份必然分岔 —— 只要有人補第三支技能忘了填。
     * 寫在文件上 ⇒ 每一支引用它的技能**自動**正確，含未來還沒寫的那些。
     *
     * ⭐ 而且它與 `yawOffsetDeg` 是**同一個形狀的兩件事**，⛔ 不是同一件事：
     * `yawOffsetDeg` 修的是「角色的**臉**朝哪」（有正負、要分前後），
     * 這一格講的是「這根東西的**長軸**躺在哪」（是一條**線**，⛔ 沒有正負）。
     * ⭐ 無向這件事讓它免疫 glTF 載入器那個 X 鏡射（`glbFacing.ts` 檔頭記的
     * `__root__` 180°+scale(1,1,−1)）—— 鏡射把 +X 變 −X，而 X 軸還是 X 軸。
     *
     * ⛔ 它也**不是** `spinDegPerSec`：那是持續自轉（翻滾），這一格是**初始姿態**。
     * 兩件事疊起來才是 owner 要的東西 —— 先橫放，再繞著那根長軸滾。
     *
     * ⚠️ **`"z"` 是恆等**（Babylon 的前方就是 +Z）⇒ 量到 z 的模型**不要寫**，
     * 寫了是一句「說了但不會發生」的宣稱（第一·五守則）。ABSENT 就是它的意思。
     *
     * 值由 `tools/beam-orient/scan.py` 從**真的 .glb 位元組**的 bbox 推導，
     * ⛔ 不是逐支目測；`scan.py --check` 比對出貨文件與現場重解的結果。
     * ⚠️ 那支工具**拒絕**替「會走路的模型」提案（glb 裡有 walk/run 動畫 ⇒ 它是
     * 站著的東西）—— 克勞德幻影 / Saber 殘影這一族的長軸也是 Y，把它們放倒
     * 是把一個角色摔在地上，⛔ 不是做出一道光束。
     */
    fxLongAxis: z.enum(["x", "y", "z"]).optional(),

    /**
     * ⭐ 這一份 .glb 當成 `spawnModelFx` 的移動特效時，**離地多高**（世界單位）。
     *
     * ── 為什麼這一格存在（GH#606）─────────────────────────────────────────
     * 客戶端舊碼讀的是 `ev.data.y ?? 0`，而 **sim 從來沒有送過 `y`** ⇒ 每一發
     * 都貼在 **y=0**，也就是光束在地板上拖行。⚠️ 那不是一個決定，是一個
     * 沒有人選過的預設值 —— 而「寫死才需要理由」（第一守則）。
     *
     * ⭐ 它住 `model@1` 的理由與 `fxLongAxis` **逐字相同**：「這根東西該飛多高」
     * 是網格自己的性質（一份胸口高度建的光束 vs 一團貼地滾的火），⛔ 不是引用它
     * 的那支技能的選擇。同一份 glb 被兩支技能引用時兩邊必須拿到同一個答案。
     *
     * ⚠️ **ABSENT ＝ 0 ＝ 今天的行為**（逐位元不變）—— 所以這一格是**純新增**，
     * ⛔ 不改任何一支出貨技能的畫面。owner 覺得哪一根該抬高，在編輯器填一個數字。
     */
    fxSpawnHeight: z.number().min(0).max(20).optional(),

    /**
     * ⭐ 這一份**外觀**的頂點著色（vertex tint），線性 RGB 各 0…1。
     * ABSENT ⇒ ⛔ 不著色 ＝ 今天 129 份出貨文件的行為，**逐位元不變**。
     *
     * ── owner 2026-08-23（逐字）────────────────────────────────────────────
     * 「而且作為**翻轉角度的蝗蟲群單位** **通常大小跟顏色都有再做調整**，務必檢查，
     *  **避免出現很小顏色又不對的氣功砲**」
     *
     * ⚠️ 他點的是一個**具體的失敗形態**，而它量到了：原作把「移動特效」做成
     * locust dummy **單位**，而單位型別自己帶著 `Art - Vertex Colour`（w3u），
     * JASS 再用 `SetUnitVertexColor` 覆寫。⇒ **原作的顏色住在單位型別上**，
     * 而 GGD 這一側**整個欄位不存在** —— 於是每一具移動模型都以素材原色出場。
     *
     * ⭐ 量到的最貴一筆（`tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json`）：
     * 38-002 究極暴走黑龍波的兩具 dummy —— `h02F` 黑龍頭（`Darkraor.mdl`）與
     * `h02E` 黑龍身體（`BlackHole.mdl`）—— 原作的頂點色是 **[0,0,0] 純黑**。
     * ⇒ ⛔ **「黑」龍波在 GGD 裡從第一天起就不是黑的**，而 `content:build` 全綠、
     * 每一條既有守衛全綠（第一·五守則的形狀：每一個零件都對，只有顏色不存在）。
     *
     * ── ⭐ 為什麼它住 `model@1`，⛔ 不住在技能上 ───────────────────────────
     * 與 `fxLongAxis` / `fxSpawnHeight` **同一個理由**：原作把它掛在**單位型別**上，
     * 而 `model@1` 正是那個型別在 GGD 的對應物 —— 一份文件 ＝ 一種**外觀**。
     * 寫在技能上就是同一個事實有 N 個住處（第〇·四守則），而 `imported.darkraor`
     * 今天被 `godie-u010.e` / `.ex` / `godie-uvng.e` / `.ex` **四個**節點引用，
     * 那四份必然分岔。
     *
     * ⚠️ ⭐ **它是「外觀」的性質，⛔ 不是「.glb 檔案」的性質** —— 這兩件事在原作裡
     * 就是分開的：`h00S`（Saber 約束與勝利之劍）與 `h007`（悟空 龜派氣功）**共用**
     * 同一份 `ReviveHuman.mdl`，而頂點色一個是 **[255,100,100] 紅**、一個是白。
     * ⇒ 同一份 .glb 要兩種顏色時，正解是**兩份 `model@1` 文件**（＝原作的兩個單位
     * 型別），⛔ 不是在這一格塞一張「誰引用我就給誰哪個顏色」的表。
     *
     * ⚠️ **值要引用得到來源**（第一守則：出貨數值要能逐項引用）。出貨值一律照抄
     * `UNIT_TINTS.json` 的 `tint`（該檔由 w3u → 基底 → `UnitUI.slk` 的鏈解出），
     * ⛔ 不可以自己挑一個好看的 RGB —— 守衛
     * `apps/client/src/render/modelFxRig.test.ts` 的「tint 有來源」逐份比對它。
     *
     * ⚠️ 著色**只乘進漫反射/反照率**，⛔ 不動自發光與 alpha（見 `modelFxRig.ts`
     * 的 `applyFxTint`）—— 純黑的頂點色在原作裡是「黑色剪影」，⛔ 不是「消失」，
     * 而把 0 乘進一個加法混合層就會讓整具模型從畫面上不見（失敗形態①）。
     *
     * ⭐ **一鍵 rollback**：`content/` 是 live bind-mount ⇒ 在編輯器把這一格清空，
     * 那一具就立刻回到今天的素材原色，⛔ 不必重建映像、⛔ 不必重新部署。
     */
    fxTint: z
      .tuple([z.number().gte(0).lte(1), z.number().gte(0).lte(1), z.number().gte(0).lte(1)])
      .optional(),
  })
  .strict();

export type ModelDoc = z.infer<typeof zModelDoc>;

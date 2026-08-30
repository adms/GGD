/**
 * `config.voxel-look@1` —— **哪些 tag 可以決定英雄的外觀**（GH#881）。
 *
 * ⭐ 這份文件存在的理由是一個量到的缺陷：
 * > `#817`（`f8622ec56`）為了**武器機制**在 `godie-edem`（宇智波佐助，**忍者**）
 * > 的 tags 加了 `"katana"` ⇒ `voxelSkin/rules.ts:96` 的
 * > `/劍士|劍客|武士|浪人|katana|居合|Samurai|…/` 命中 ⇒ ⭐ **他被換上和服**。
 *
 * ⇒ ⭐ **一個詞彙被兩個系統當成不同的意思**：
 * `katana` 在機制側是「這隻拿的是刀」，在外觀側被讀成「這隻是武士」。
 * ⚠️ 而 `content/champions/*.json` 的 `tags` **只有一個陣列**在服務兩者。
 *
 * ── 量到的（2026-08-31，全 71 位）────────────────────────────────────────
 * · 受影響：**9 隻**（夏娜 · 佐助 · 一護 ×2 · 殺生丸 · KYO · 賽菲洛斯 · 飛影 ×2）
 * · 全部由 `katana` 造成，⭐ 而且**只動 `top` 一軸**
 * · ⭐ 濾掉武器 tag 與**完全不讀 tags** 的結果**逐格相同**
 *   ⇒ 量到的事實：`tags` 對外觀**除了這個缺陷之外零貢獻**
 * · 全部詞彙：武器 7 種（54 筆）· 來源（`godie`/`wc3-import`/`original`/`voxel-standin`）
 *   · 玩法（`magic`/`tank`/`mage`…）—— ⛔ **沒有一個是描述外觀的**
 *
 * ── ⛔ 為什麼是 config doc，⛔ 不是 `models/_voxel-skins.json` 的一格 ──────
 * ⭐ `voxelBodies.ts:18` 已經逐字記過同一個問題的答案：
 * > 「That file is a sidecar **baked into the image**. Had the console written to it,
 * >  every `docker compose build` would have restored the repo's copy and
 * >  **SILENTLY DISCARDED** the operator's choices」
 * ⇒ ⛔ 那個檔不是可寫面。⭐ 後台改得到的只有 `content/config/`。
 *
 * ── ⭐ 為什麼一定要有這一格（⛔ 不是「順手做個開關」）────────────────────
 * owner 常設指令逐字：「別問我了自己判斷 **但是留後台開關可以簡易 rollback**」。
 * ⇒ 我在這裡替他做了一個**玩家看得到**的決定（9 隻英雄的上衣）。
 * ⭐ 他不同意的成本必須是「清空一格清單」，⛔ 不是一次 PR ＋ 重跑全套 ＋ 一次部署。
 */
import { z } from "zod";

export const VOXEL_LOOK_DOC_ID = "voxel-look";

/**
 * ⭐ 出貨的忽略清單 —— **武器機制詞彙**，量出來的（⛔ 不是憑印象列的）。
 *
 * 這 7 個是 `content/champions/*.json` 的 `tags` 裡**全部**的武器詞彙
 * （2026-08-31 逐檔統計：katana 13 · sword 12 · fist 12 · claw 5 ·
 *  greatsword 4 · bow 4 · thrown 4）。
 *
 * ⚠️ ⭐ **清空它 ＝ rollback 回 2026-08-31 之前的行為**（9 隻穿和服）。
 */
export const SHIPPED_LOOK_IGNORED_TAGS: readonly string[] = Object.freeze([
  "katana",
  "sword",
  "greatsword",
  "fist",
  "claw",
  "bow",
  "thrown",
]);

export const zConfigVoxelLookDoc = z
  .object({
    id: z.literal(VOXEL_LOOK_DOC_ID),
    schema: z.literal("config.voxel-look@1"),
    note: z.string().optional(),
    /**
     * ⭐ 外觀關鍵字規則**看不到**的 tag。
     *
     * ⚠️ 它管的是**輸入**，⛔ 不是規則本身 —— 規則（`rules.ts`）仍然讀
     * 稱號／本名／`modelHint`，那三個都是**描述這個角色是誰**的字串。
     * ⇒ ⭐ 判準：一個 tag 如果回答的是「**它拿什麼／它怎麼玩**」，它就該在這裡。
     *
     * ⛔ **空陣列不是中立** —— 它是 rollback（回到武器決定上衣的那個行為）。
     */
    ignoredLookTags: z.array(z.string().min(1)).max(64),
  })
  .strict();

export type ConfigVoxelLookDoc = z.infer<typeof zConfigVoxelLookDoc>;

export const DEFAULT_VOXEL_LOOK: ConfigVoxelLookDoc = {
  id: VOXEL_LOOK_DOC_ID,
  schema: "config.voxel-look@1",
  ignoredLookTags: [...SHIPPED_LOOK_IGNORED_TAGS],
};

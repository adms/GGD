/**
 * `config.voxel-look@1` —— 哪些 tag 可以決定英雄的外觀（GH#881）。
 *
 * ⭐ 這一頁存在的理由是一個**玩家看得到**的缺陷：
 * `#817` 為了**武器機制**在宇智波佐助（**忍者**）的 tags 加了 `"katana"`
 * ⇒ 外觀規則把它讀成「武士」⇒ ⭐ 他被換上和服。
 * ⇒ ⭐ 一個詞彙被兩個系統當成不同的意思，而 `tags` 只有一個陣列在服務兩者。
 */
import { zConfigVoxelLookDoc } from "@ggd/shared/content/schema/config";
import type { ConfigDocSpec } from "../engine";

export const VOXEL_LOOK_SPEC: ConfigDocSpec<"voxelLook"> = {
  page: "voxelLook",
  collection: "config",
  docId: "voxel-look",
  schemaTag: "config.voxel-look@1",
  zod: zConfigVoxelLookDoc,
  title: "外觀關鍵字：忽略哪些 tag",
  intro: [
    "英雄的體素外觀是**從文字推導**出來的：稱號、本名、`modelHint`，還有 **tags**。這一頁決定 **tags 裡哪些字不算數**。",
    "⚠️ ⭐ **這一頁是為了一個真的看得到的缺陷而存在的**：2026-08-29 有人為了**武器機制**在宇智波佐助（**忍者**）身上加了 `katana` 這個 tag，而外觀規則的正則寫著「劍士｜劍客｜武士｜浪人｜**katana**｜居合…→ 和服」⇒ ⭐ **他當場被換上和服**。",
    "⭐ 逐檔量過（2026-08-31，全 71 位）：受影響 **9 隻** —— 夏娜 · 佐助 · 黑崎一護 ×2 · 殺生丸 · 鬼畜狂刀KYO · 賽菲洛斯 · 飛影 ×2，**全部**由 `katana` 造成，而且**只動上衣一軸**。",
    "⚠️ **清空這一格是 rollback，⛔ 不是「全部都算數」的中立選項** —— 清空就是把那 9 件和服放回去。",
  ],
  consumer:
    "apps/client/src/content/ContentDb.ts 的 load() 把 ignoredLookTags 交給 " +
    "packages/shared/src/content/voxelSkin/generate.ts 的 generateVoxelSkin(opts.ignoredLookTags) " +
    "→ haystackOf() 把清單裡的 tag 從關鍵字輸入濾掉 → matchRules() 因此看不到它們",
  // ⭐ 這份文件唯一那一格是**字串清單** ⇒ 它走 `tables` 的 `stringList`
  //   （與 `audio.castLayerCap.whitelist` 同型），⛔ 不是 `fields`（那是純量葉）、
  //   ⛔ 也不是 `preserved`（那是「引擎畫不出來、原封不動帶著走」的東西）。
  //   ⚠️ 我前兩版各猜錯一次，兩次都是閘指名的。
  preserved: [],
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（外觀在客戶端載內容時重新推導）。已經在場上的英雄不會中途換衣服。",
  fields: [],
  tables: [
    {
      path: "ignoredLookTags",
      shape: "stringList",
      title: "外觀規則看不到的 tag",
      intro: [
        "⭐ 判準：這個 tag 回答的是「**它拿什麼／它怎麼玩**」還是「**它是誰**」？前者就該列在這裡。",
        "出貨的 7 個是 `content/champions/*.json` 的 `tags` 裡**全部**的武器詞彙（2026-08-31 逐檔統計：katana 13 · sword 12 · fist 12 · claw 5 · greatsword 4 · bow 4 · thrown 4）。",
        "⚠️ ⭐ 量到的事實：濾掉它們與**完全不讀 tags** 的結果**逐格相同** —— 也就是說 `tags` 對外觀除了 GH#881 那個缺陷之外**零貢獻**。",
        "⛔ **拿掉某一列 ＝ 讓那個武器詞彙重新有權決定英雄的上衣。** 清空整張 ＝ rollback 回 9 隻穿和服的舊行為。",
      ],
      key: {
        zh: "標籤（tag）字串",
        note: "`champion@1` 的 `tags` 裡逐字出現的字串（例：`katana`）。⛔ 大小寫要一致 —— 填錯的那一列不會報錯，它只是不生效，而那隻英雄會繼續穿錯衣服。",
        maxLen: 32,
      },
      minRows: 0,
      maxRows: 64,
    },
  ],
};

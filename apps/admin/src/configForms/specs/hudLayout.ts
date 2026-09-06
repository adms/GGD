/**
 * `config.hud-layout@1` —— HUD 底部叢集的版面（GH#873）。
 *
 * ⭐ 這一頁存在的理由是**一條被複驗推翻的宣稱**：
 * 「開關 `goldLevelTouchLayout` 滿足 #873 的 AC3『一格後台開關』」——
 * ⛔ 而 2026-08-30 量到 `applyHudClusterOverride` 的**生產呼叫端是零**。
 * ⇒ ⭐ **一格轉不到的旋鈕，不是 rollback 開關。**
 */
import { zConfigHudLayoutDoc } from "@ggd/shared/content/schema/config";
import type { ConfigDocSpec } from "../engine";

import { derivedFields } from "../schemaToForm";
export const HUD_LAYOUT_SPEC: ConfigDocSpec<"hudLayout"> = {
  page: "hudLayout",
  collection: "config",
  docId: "hud-layout",
  schemaTag: "config.hud-layout@1",
  zod: zConfigHudLayoutDoc,
  title: "HUD 底部版面",
  intro: [
    "畫面**底部那一叢**東西的位置：血魔條、技能列、右下角頭像，以及手機上的金錢／等級讀數。",
    "⚠️ ⭐ **這一頁的第一格是為了一個真的看得到的缺陷而存在的**：2026-08-29 以前，手機橫向時右下角那一疊金錢／等級**蓋住了攻擊鈕的 97.7%**（88×86，三個橫向 viewport 全中）—— 玩家按得到那顆鈕，但看不到它。現在它改成攻擊鈕**底下的一條**。",
    "⚠️ **`column` 是 rollback，⛔ 不是一個對等的選項。** 選回去就是把那個遮擋放回來。",
    "⚠️ ⭐ 而 `strip` 只在**預設 HUD 縮放（中／100%）**下完全歸零：右下角讀數的保留高度是固定 30px，而觸控矩形會跟著縮放走 ⇒ 小尺寸下仍有殘留（實測 small 70.4×8 · xsmall 44×20 · min 44×30）。⭐ **每一格都比 `column` 少**（那一疊是 44×44 ~ 70.4×70.4），⛔ 但不是零。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/hud-layout.json`**。線上存過一次之後，改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/content/ContentDb.ts 的 load() 呼叫 applyHudClusterOverride() → apps/client/src/ui/hud/hudBottomCluster.ts 的 resolveClusterTuning()（夾上下界並回報被夾掉的格）→ 版面由 hudLayout.ts 的 hudSlotRect()／applyGoldLevelTouchLayout() 消費（它算 gold-level 的保留矩形）",
  // ⭐ 這份 config 的每一格都是**純量**（enum／number／boolean）——
  //   ⛔ 沒有物件或陣列分支 ⇒ preserved 是空的。
  //   ⚠️ 而它**必填**：閘 configForms.test.ts 逐字說「少宣告 ＝ 儲存時把它弄不見」。
  preserved: [],
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時把文件放進登錄表）。已經畫出來的 HUD 不會中途搬家。",
  fields: derivedFields(zConfigHudLayoutDoc, []),
};

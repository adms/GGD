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
  fields: [
    {
      path: "goldLevelTouchLayout",
      zh: "手機橫向時，右下角金錢／等級的形狀",
      optionLabels: {
        strip: "strip 一條（攻擊鈕底下，出貨）",
        column: "column 一疊（2026-08-29 以前，rollback）",
      },
      note: "⭐ `strip`（出貨）＝攻擊鈕**底下**的一條，⛔ 不擋鈕。`column`＝以前那一疊，量到它蓋住攻擊鈕 **88×86 ＝ 97.7%**。⚠️ 這一格是 **rollback**，⛔ 不是對等選項：選 `column` 就是把那個遮擋放回來。",
    },
    {
      path: "barsToAbilitiesGapPx",
      zh: "血魔條與技能列之間的間距（px）",
      note: "0 ＝ 兩個框貼著（相鄰不算重疊）。調大會把血魔條往上推，⚠️ 而它上面就是「施法被拒」那一行的位置。",
    },
    {
      path: "clusterBottomPx",
      zh: "叢集離畫面底緣多遠（px，滑鼠）",
      note: "電腦版（有滑鼠、有技能列的那一種）。⭐ 調 0 ＝ 血魔條貼著畫面最底下那一條邊；調大 ＝ 整叢往上抬，⚠️ 而它上面就是「施法被拒」那一行與技能列，抬太多會把它們推出畫面。⛔ 觸控版⛔不看這一格（見下一格）。",
    },
    {
      path: "clusterTouchBottomPx",
      zh: "叢集離畫面底緣多遠（px，觸控）",
      note: "⭐ 觸控版**沒有技能列**（換成搖桿＋弧形鈕），所以血魔條必須抬得更高，⛔ 否則它會掉到拇指上。這一格比上面那一格大很多是正常的。",
    },
    {
      path: "castNoticeGapPx",
      zh: "叢集與「施法被拒」訊息的間距（px）",
      note: "「施法被拒」那一行字騎在叢集正上方。⭐ 調 0 ＝ 貼著血魔條；調大 ＝ 那行字往上浮，⚠️ 而它與畫面中央的戰鬥區之間沒有其他東西擋著，調太大會蓋到場上的單位。",
    },
    {
      path: "keepClearOfCorners",
      zh: "置中會撞到底部兩角時，把叢集讓開",
      note: "⭐ 開（出貨）＝寧可偏一點也不疊。關 ＝ 一律置中並蓋過角落的東西。⚠️ 關掉是 **rollback**（780×360 那個重疊案例會回來），⛔ 不是對等選項。",
    },
    {
      path: "heroPortrait",
      zh: "右下角頭像顯示哪一位",
      optionLabels: {
        "current-form": "current-form 目前形態（變身後顯示變身）",
        "base-form": "base-form 本體（變身後仍顯示本體）",
        none: "none 不顯示",
      },
      note: "⭐ `current-form`（出貨）—— 變身之後頭像跟著換，玩家一眼知道自己現在是誰。",
    },
    {
      path: "heroPortraitPx",
      zh: "頭像邊長（px）",
      note: "⭐ 右下角那顆頭像的邊長。0 ＝ 畫不出來，⚠️ **但版面仍然替它留位**（叢集的寬度不會變）—— 要真的把那塊空間收回來，請用上面那一格選 `none`。調大會把叢集往左推。",
    },
  ],
};

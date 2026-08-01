/**
 * noChampionNoticeModel — 「這一場你沒有英雄」，說出來而不是讓 HUD 憑空消失。
 *
 * ── 為什麼有這個檔案 (2026-08-02) ─────────────────────────────────────────
 *
 * owner 實戰回報：「shop 介面似乎沒有啟動成功、倒數等介面也都不見了」
 * 以及「戰場上生命、攻擊傷害、殭屍數等數字 提示全部都不見了」。
 *
 * 追出來是**一條因果鏈的三層下游**，不是三個缺陷：
 *
 *   content/bundle.json 被 commit 成過期的（build 產物沒跟著原始檔一起進 commit）
 *     → 客戶端 Zod 驗證失敗 → `main.tsx` 的 fail-open 註冊 sela/thorne 骨架
 *     → 選人畫面空的（白名單 63 隻沒有一隻在骨架裡）→ 玩家選不到英雄
 *     → 入場時沒有英雄 → `localMaxHp` 是 0（`net/RoomStore` 檔頭：
 *       「0 while the seat has no champion」）
 *     → `hasChampion = localMaxHp > 0` 為 false，於是
 *          · `shopGate()` 回 `mounted: false`         → 商店整個不出現
 *          · `useHudPanels` 整批面板不啟用             → 倒數等介面不見
 *          · 沒血、沒輸出、沒交戰                       → 飄字數字沒有東西可畫
 *
 * 上游那個根因已經修掉了（bundle 重生 + `shippedBundleIsCurrent.test.ts` 守著）。
 * **這個檔案修的是為什麼它拖了那麼久才被發現。**
 *
 * ⚠️ `shopGate` 其實早就算出了理由字串 —— `SHOP_DENY_TEXT["no-champion"]`
 * =「尚未選擇英雄」—— 然後在**同一個 return 裡**把 `mounted` 設成 false，
 * 於是那句話被算出來、被丟掉，**永遠不可能被畫出來**。
 * 那是失敗形態 ②（算出來了但從沒送到玩家眼前）。玩家看到的是介面憑空消失，
 * 而不是一句能讓他知道「我這場沒有英雄」的話。
 *
 * ── 這個修法刻意不做的事 ──────────────────────────────────────────────
 *
 * **不動任何既有的閘。** 商店對一個沒有英雄的觀戰者本來就不該開，
 * `useHudPanels` 不掛那些面板也是對的 —— 那些判斷沒有錯，錯的是**沒有人說話**。
 * 所以這是一個純加法的告示，把既有行為一個位元都不改：
 * 改壞它只會讓告示消失，不會讓任何面板跑出來或消失。
 *
 * **也不做成後台開關**（CLAUDE.md 第一守則說寫死才需要理由，這是理由）：
 * 這是「東西壞掉時唯一的訊號」，不是平衡數值。做成可關的開關等於允許有人
 * 把唯一的警報關掉 —— 而「只在遠離現場的地方響的警報不是守衛」正是
 * 這次事故的教訓本身。文案是內容不是決策，改文案改這個檔即可。
 *
 * 純函式、可在 node 直接測：沒有 React、沒有 DOM、沒有 store。
 */

/**
 * 相位。與 `useHud` 的 `phase` 同一組字串（`net/RoomStore` 發佈的那個）。
 * 這裡只關心「選角中」與「其餘」的差別，所以用寬型別而不是複製一份 union ——
 * 複製一份就是第二個答案，而它會漂移。
 */
export type NoChampionPhase = string;

/** 告示的內容。`null` = 不該出現，這是一個真答案而不是缺資料。 */
export interface NoChampionNoticeView {
  /** 主句：玩家一眼要讀到的那一句。 */
  readonly title: string;
  /** 副句：為什麼會這樣、他現在能做什麼。 */
  readonly detail: string;
}

/**
 * 主句。⚠️ 刻意不重複使用 `SHOP_DENY_TEXT["no-champion"]`（「尚未選擇英雄」）：
 * 那句話是**商店按鈕**的停用理由，講的是一個按鈕；這裡要講的是**整場**的狀態。
 * 兩者措辭不同是刻意的，不是漏了共用。
 */
export const NO_CHAMPION_TITLE = "這一場你沒有英雄";

/**
 * 副句。要回答玩家心裡的兩個問題：為什麼、我現在能做什麼。
 * ⚠️ 不要寫成「發生錯誤」—— 那等於沒說。也不要教他跑指令（`HudRoot` 的
 * 「Connecting to match…」有過那個前科：對 ggd.adms.ai 的家人叫出
 * `pnpm --filter …` 既沒用又嚇人，最後只能靠 `import.meta.env.DEV` 藏起來）。
 */
export const NO_CHAMPION_DETAIL =
  "所以商店、倒數與戰鬥數字都不會出現。下一場請在選角畫面選一隻並鎖定；" +
  "如果選角畫面是空的，代表內容沒載入成功，重新整理一次。";

/**
 * 該不該出現這個告示。
 *
 * 兩個條件都要成立：
 *  · `hasChampion` 為 false —— 也就是 `localMaxHp <= 0`（RoomStore 的語意）。
 *  · **不在選角相位** —— 選角當下還沒選是正常的，那時候跳這句話是雜訊。
 *
 * ⚠️ `matchEnd` **要**顯示。玩家最可能在結算畫面才回頭問「剛剛那場怎麼回事」，
 * 而那正是他唯一有空讀字的時候。`HudRoot` 的 `inGame` 把 `matchEnd` 排除掉是
 * 為了別的東西（技能列不該在結算時還在），不要照抄它。
 */
export function noChampionNotice(
  phase: NoChampionPhase,
  hasChampion: boolean,
): NoChampionNoticeView | null {
  if (hasChampion) return null;
  if (phase === "champSelect") return null;
  return { title: NO_CHAMPION_TITLE, detail: NO_CHAMPION_DETAIL };
}

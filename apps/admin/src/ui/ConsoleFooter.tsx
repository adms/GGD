/**
 * 後台每一頁的頁尾版權列（owner 2026-08-28：「後台右側頁面 每一頁都要加上
 * footer copyright」）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼它掛在 **shell 的 `<main>` 裡一處**，⛔ 不是逐頁加
 * ---------------------------------------------------------------------------
 * 後台今天有 **60+ 個頁面元件**，而「每加一頁就要記得補一行頁尾」正是第〇·七守則
 * 點名的「**一行接線**」病 —— 它的正解是「讓那一行自動推導」，⛔ 不是把它抄 60 次。
 * ⇒ 掛在 `App.tsx` 的 `<main>` 尾巴：**現有的每一頁**與**未來每一頁**都自動有，
 * 而且新增頁面的人不必知道這條規則存在。
 *
 * ⚠️ 版權字串本身住 `@ggd/shared/brand`（第〇·四：一個住處）——
 * ⛔ 不在這裡打第二份。客戶端的版權聲明頁讀的是同一個常數。
 *
 * ⚠️ 它在**捲動容器內**（`<main>` 自己捲），⛔ 不是 `position: fixed` 的浮層：
 * 釘住的頁尾會蓋掉長表單的最後一列，而那在畫面上看起來完全正常。
 */
import { COPYRIGHT_LINE } from "@ggd/shared/brand";
import { PANEL_BORDER, TEXT_DIM } from "./theme";

export function ConsoleFooter(): JSX.Element {
  return (
    <footer
      data-testid="console-footer"
      style={{
        marginTop: 32,
        paddingTop: 12,
        borderTop: PANEL_BORDER,
        color: TEXT_DIM,
        fontSize: 12,
        textAlign: "center",
        // 長內容捲到底時不要黏在視窗邊緣。
        paddingBottom: 8,
      }}
    >
      {COPYRIGHT_LINE}
    </footer>
  );
}

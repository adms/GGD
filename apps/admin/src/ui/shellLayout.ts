/**
 * 後台外框的**捲動版型** —— GH#493。
 *
 * owner 2026-08-21：
 *   「後台左邊選單點選後，右邊自動回到最上面，並且右邊內容要正常顯示
 *    （目前超過一個螢幕畫面長度外會被吃掉）」
 *
 * ## 被吃掉的真正原因（量到的，⛔ 不是猜的）
 *
 * 左欄導覽現在有 **105 列**，全部展開時它自己就 **4634px** 高。它和右欄是同一個
 * grid **列**的兩個項目，而那一列是 `auto` —— 於是**文件**被撐成 4634px 高，
 * 而 `<main>` 卻被 `maxHeight: 100vh` 釘成一個 800px 的盒子，貼在文件的**最上面**。
 *
 * 結果：視窗右邊那條捲軸捲的是**導覽列**，不是內容。使用者一捲，`<main>` 整個滑出
 * 螢幕上緣，右半邊變成空白背景 —— ⛔「超過一個螢幕的部分被吃掉」正是這個。
 * ⚠️ 而且點一列靠下的選單（第 46 列在 y≈2000px）本來就得先把文件捲下去，
 * 換頁之後新的一頁畫在 y=0..800，**開場就在畫面外**。
 *
 * ## 修法：兩欄各自捲，文件本身不捲
 *
 * 外框吃滿一個視窗高（`height: 100vh` + `gridTemplateRows: minmax(0, 1fr)` ——
 * ⚠️ 只寫 `height` 是**不夠的**，`auto` 列照樣會被內容撐開然後溢出），
 * 左右兩欄各自 `minHeight: 0` + `overflow: auto`。於是：
 *   • 導覽再長也只捲它自己，⛔ 不再撐大文件
 *   • `<main>` 永遠整格在畫面上，它自己那條捲軸是畫面上**唯一**的捲軸
 *   • 右欄仍然是一個有界高度的容器 ⇒ 子頁面的 `height: 100%`
 *     （`ContentPage` / `VoxelStudioPage` 的兩欄主從版型）繼續成立
 *
 * ⛔ **右欄永遠不可以是 `overflow: hidden` 或「有界高度但不能捲」** —— 那才是真正
 * 會截斷內容的形狀，而它在畫面上跟正常長得一模一樣（第二守則失敗形態①）。
 * 守衛 `shellLayout.test.ts` 驗的就是這個**關係**，⛔ 不是驗某一個字面值。
 *
 * ⚠️ 手機版（`narrow`）刻意**不套**這一套：那時導覽是內容**上方**的一條橫向
 * 捲動條，整頁一起捲才是對的，把 `<main>` 釘成 100vh 反而會把下半頁關在外面。
 */
import type { CSSProperties } from "react";

/** 一次算好三層的捲動相關樣式；其餘（配色/邊框/內距）留在 `App.tsx`。 */
export interface ShellScrollLayout {
  /** 最外層 grid。 */
  readonly shell: CSSProperties;
  /** 左欄導覽（`<aside>`）。 */
  readonly rail: CSSProperties;
  /** 右欄內容（`<main>`）。 */
  readonly content: CSSProperties;
}

export function shellScrollLayout(narrow: boolean): ShellScrollLayout {
  if (narrow) {
    // 手機：整頁捲。兩欄都不設界，也都不設 overflow。
    return { shell: { minHeight: "100vh" }, rail: {}, content: {} };
  }
  return {
    shell: {
      height: "100vh",
      minHeight: "100vh",
      // ⚠️ 沒有這一行，`auto` 列會被 4634px 的導覽撐開再溢出容器，
      // 等於什麼都沒改。
      gridTemplateRows: "minmax(0, 1fr)",
    },
    rail: { minHeight: 0, overflowY: "auto" },
    content: { minHeight: 0, overflow: "auto" },
  };
}

/**
 * 一個容器「有界高度」嗎（＝它自己不會長到跟內容一樣高）。
 *
 * ⭐ 這是守衛要問的那一半：有界高度**而且不能捲** ⇒ 超出的部分被吃掉。
 */
export function isHeightBounded(s: CSSProperties): boolean {
  return s.height !== undefined || s.maxHeight !== undefined || s.minHeight === 0;
}

/** 這個容器捲得動嗎（`auto` / `scroll`，兩軸任一）。 */
export function isScrollable(s: CSSProperties): boolean {
  const axes = [s.overflow, s.overflowY];
  return axes.some((v) => v === "auto" || v === "scroll");
}

/** 這個容器會**無聲截斷**內容嗎（`overflow: hidden` 那一族）。 */
export function truncates(s: CSSProperties): boolean {
  return [s.overflow, s.overflowY].some((v) => v === "hidden" || v === "clip");
}

/** 換頁時要回到最上面的東西。`null` 都容得下（SSR / 還沒掛上）。 */
export interface ScrollResetTargets {
  readonly pane: { scrollTop: number; scrollLeft: number } | null;
  readonly win: { scrollTo: (x: number, y: number) => void } | null;
}

/**
 * 切頁 ⇒ 右欄回到最上面（owner 2026-08-21 的前半句）。
 *
 * ⚠️ **兩個都要**：桌機版捲的是 `<main>` 自己，手機版捲的是**文件**。
 * 只做其中一個，另一種版型就沿用上一頁的捲動位置 —— 那正是這張票的症狀。
 */
export function resetContentScroll(t: ScrollResetTargets): void {
  if (t.pane) {
    t.pane.scrollTop = 0;
    t.pane.scrollLeft = 0;
  }
  t.win?.scrollTo(0, 0);
}

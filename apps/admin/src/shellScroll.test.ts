/**
 * 後台外框的捲動版型 —— GH#493 的守衛。
 *
 * 缺陷的形狀（量到的）：左欄導覽 105 列 = 4634px 高，它和右欄同在一個 `auto` 的
 * grid 列 ⇒ **文件**被撐成 4634px，而 `<main>` 被 `maxHeight: 100vh` 釘成 800px
 * 貼在文件頂端。視窗那條捲軸捲的是導覽，一捲右欄就滑出畫面 ⇒
 * 「超過一個螢幕的內容被吃掉」。⚠️ 畫面上**看起來完全正常**，沒有任何東西會紅。
 *
 * 所以下面驗的是**關係**，⛔ 不是某一個字面值：
 *   ① 右欄有界高度 ⇒ 一定捲得動，而且永遠不是 hidden
 *   ② 左欄自己捲（否則它會再把文件撐高一次）
 *   ③ 切頁 ⇒ 右欄與文件都回到最上面
 *   ④ ⭐ 出貨的那一棵渲染樹真的套了 ①（失敗形態⑤：被測的不是出貨的那個）
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { Console } from "./ui/App";
import {
  isHeightBounded,
  isScrollable,
  resetContentScroll,
  shellScrollLayout,
  truncates,
} from "./ui/shellLayout";

const TAG = "adminui-shell-scroll";

describe("後台外框 · 捲動版型 (GH#493)", () => {
  it("右欄有界高度 ⇒ 一定捲得動；而且兩種版型都永遠不是 hidden", () => {
    for (const narrow of [false, true]) {
      const { content } = shellScrollLayout(narrow);
      expect(truncates(content)).toBe(false);
      if (isHeightBounded(content)) expect(isScrollable(content)).toBe(true);
    }
    cover(TAG);
  });

  it("左欄自己捲，而且外框的列高是明確的 —— 否則導覽會再把文件撐高一次", () => {
    const wide = shellScrollLayout(false);
    expect(isScrollable(wide.rail)).toBe(true);
    // ⚠️ 只給外框 `height: 100vh` 是不夠的：`auto` 列照樣被 4634px 的導覽撐開
    // 再溢出容器，等於什麼都沒改。
    expect(String(wide.shell.gridTemplateRows)).toMatch(/minmax\(\s*0/);
    // 手機版刻意相反：整頁捲，右欄不設界（釘成 100vh 會把下半頁關在外面）。
    expect(isHeightBounded(shellScrollLayout(true).content)).toBe(false);
    cover(TAG);
  });

  it("切頁 ⇒ 右欄與文件都回到最上面（兩個都要：桌機捲右欄、手機捲文件）", () => {
    const pane = { scrollTop: 873, scrollLeft: 12 };
    const scrolled: number[][] = [];
    resetContentScroll({ pane, win: { scrollTo: (x, y) => void scrolled.push([x, y]) } });
    expect([pane.scrollTop, pane.scrollLeft]).toEqual([0, 0]);
    expect(scrolled).toEqual([[0, 0]]);
    // 還沒掛上（SSR / 第一次 render）不可以炸
    expect(() => resetContentScroll({ pane: null, win: null })).not.toThrow();
    cover(TAG);
  });

  it("出貨的那一棵渲染樹真的套了它（⛔ 不是掃原始碼字串）", () => {
    const tag = /<main\b[^>]*>/.exec(renderToString(createElement(Console)))?.[0] ?? "";
    expect(tag).toContain('data-testid="content-pane"');
    expect(tag).not.toMatch(/overflow[a-z-]*:\s*(hidden|clip)/);
    expect(tag).toMatch(/overflow:\s*auto/);
    cover(TAG);
  });
});

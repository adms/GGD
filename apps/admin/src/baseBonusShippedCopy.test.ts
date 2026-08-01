/**
 * 基礎加成頁 —— 「出貨預設」那句話不可以是寫死的字串 (#279 的第三半).
 *
 * ── 真的發生過的那個謊 ─────────────────────────────────────────────────────
 * 這一頁的抬頭寫死了「出貨預設是生命上限 +300」,而 owner 2026-07-30 把
 * `DEFAULT_BASE_BONUS` 改成 650。改完之後,同一個畫面上:
 *   · 每一列右邊的「出貨預設」欄  → 650(它讀 `DEFAULT_BASE_BONUS`)
 *   · 抬頭                      → +300   ← 謊話
 *   · 「還原出貨版」的確認句      → +300   ← 謊話,而且印在一顆**沒有 undo**的
 *                                          破壞性按鈕上
 * 三個數字兩個錯。操作者要靠那句話決定要不要按下去,而它告訴他會回到 300。
 * CLAUDE.md 第一守則的最後一段:「語意改了,舊文案就是謊話,必須一起改」——
 * 最可靠的「一起改」是**根本不要有第二份**。
 *
 * ── 為什麼要 mock `DEFAULT_BASE_BONUS`,而不是直接斷言畫面上有 650 ─────────
 * 因為「畫面上有 650」對**寫死 650** 的實作也會過 —— 那正是今天這個 bug 的
 * 下一個版本(失敗形態 ④:斷言方向跟缺陷無關)。所以這裡把出貨表換成一個
 * 現實中不存在的數字 777:
 *   · 導出來的實作 → 三處都印 777,測試綠
 *   · 寫死的實作   → 抬頭/確認句還印舊數字,測試紅
 * 這是這個檔案唯一的鑑別力來源,不要拿掉 mock 改成硬斷言。
 *
 * 用 `testkit/headlessUi` 掛**真的頁面**、按**真的按鈕**,理由同
 * baseBonusPage.test.ts:純函式綠 ≠ 操作者看得到(失敗形態 ⑤)。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { BaseBonusPage } from "./ui/BaseBonusPage";
import { BONUS_DOC_ID } from "./baseBonus";
import { mount, type HostNode } from "./testkit/headlessUi";

/**
 * 一個現實中不存在的出貨值 —— 見檔頭。42 是「操作者現在設的值」,兩者要分得開。
 * 走 `vi.hoisted`,因為 `vi.mock` 的 factory 被提到檔案最上面,普通的 top-level
 * const 在那個時間點還沒初始化。
 */
const { FAKE_SHIPPED, OPERATOR_VALUE } = vi.hoisted(() => ({
  FAKE_SHIPPED: 777,
  OPERATOR_VALUE: 42,
}));

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ doc: Record<string, unknown> }>,
  reverts: 0,
  overlayDoc: null as unknown,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

// THE mock that gives this file its discriminating power. Everything else in the
// module is passed through untouched — only the SHIPPED TABLE is swapped.
vi.mock("@ggd/shared/sim/baseBonus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ggd/shared/sim/baseBonus")>();
  return { ...actual, DEFAULT_BASE_BONUS: Object.freeze({ maxHealth: FAKE_SHIPPED }) };
});

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getOverlayDoc: async (): Promise<unknown> => bus.overlayDoc,
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> => ({
      present: false,
      hash: "",
      doc: null,
    }),
    putOverlayDoc: async (
      _c: string,
      _i: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      bus.puts.push({ doc });
      return { generation: 1 };
    },
    revertOverlayDoc: async (): Promise<{ generation: number }> => {
      bus.reverts += 1;
      bus.overlayDoc = null;
      return { generation: 2 };
    },
  };
});

beforeEach(() => {
  bus.puts.length = 0;
  bus.reverts = 0;
  bus.overlayDoc = {
    id: BONUS_DOC_ID,
    schema: "config.base-bonus@1",
    bonus: { maxHealth: OPERATOR_VALUE },
  };
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(BaseBonusPage));
  await h.flush();
  return h;
}

function button(h: ReturnType<typeof mount>, field: string): HostNode {
  const hit = h.hosts().find((n) => n.type === "button" && n.props["data-field"] === field);
  if (!hit) throw new Error(`no button carries data-field="${field}"`);
  return hit;
}
function press(h: ReturnType<typeof mount>, field: string): void {
  (button(h, field).props["onClick"] as () => void)();
}

const COVER = "basebonus-shipped-copy";

describe("基礎加成頁 —— 出貨預設是算出來的,不是文案 (basebonus-shipped-copy)", () => {
  it("抬頭印的是 DEFAULT_BASE_BONUS,不是某個歷史數字", async () => {
    cover(COVER);
    const h = await open();
    const text = h.text();
    expect(text, "抬頭沒有印出真正的出貨值").toContain(String(FAKE_SHIPPED));
    // 鑑別:曾經寫死過的兩個數字,現在一個都不可以出現
    expect(text, "抬頭還留著寫死的 +300").not.toContain("300");
    expect(text, "把 300 換成寫死的 650 —— 同一個 bug 的下一個版本").not.toContain("650");
  });

  it("「還原出貨版」的確認句也是算出來的 —— 那顆按鈕沒有 undo", async () => {
    cover(COVER);
    const h = await open();
    press(h, "revert");
    const text = h.text();
    expect(text, "確認句沒有出現(按鈕沒有進入確認態)").toMatch(/確定/);
    expect(text, "確認句沒有印出真正的出貨值").toContain(String(FAKE_SHIPPED));
    expect(text, "確認句還留著寫死的 +300").not.toContain("300");
    expect(text, "確認句寫死了 650").not.toContain("650");
    // 還沒按「確定還原」之前,一個字都不可以送出去
    expect(bus.reverts).toBe(0);
    expect(bus.puts).toHaveLength(0);
  });

  it("每一列的「出貨預設」欄和抬頭講的是同一個數字", async () => {
    cover(COVER);
    const h = await open();
    // 這一條守的是「三處一致」本身:抬頭、確認句、逐列欄位一起讀同一張表,
    // 所以 owner 下一次動出貨值時,不會有任何一處落後。
    expect(h.text()).toContain(`出貨預設 ${FAKE_SHIPPED}`);
    // 而操作者現在設的值是另一個數字 —— 兩者沒有被混在一起
    expect(h.field("bonus-maxHealth").props["value"]).toBe(String(OPERATOR_VALUE));
  });
});

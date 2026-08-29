/**
 * 兩層同名狀態 ⇒ 兩顆圖示，兩把不同的 key（GH#837）。
 *
 * ⚠️ 讀的是**出貨的 view 真的交給 React 的那些 key**，⛔ 不是我自己再算一次
 * `selfStatusRowKeys()` —— 後者對「helper 加了但 `key={r.id}` 沒改」是瞎的
 * （失敗形態⑤：被測的不是出貨的那個）。key ⛔ 不會出現在 markup 裡，所以這裡
 * 直接把 view 當函式呼叫並讀回 children 的 `.key`。
 */
import { describe, expect, it } from "vitest";
import type { SelfStatusRow } from "./selfStatusModel";
import { SelfStatusBarView, selfStatusRowKeys } from "./SelfStatusBar";

const row = (id: string, secondsLeft: number): SelfStatusRow => ({
  id,
  label: id,
  polarity: "debuff",
  secondsLeft,
  disabling: false,
});

function paintedKeys(rows: readonly SelfStatusRow[]): (string | null)[] {
  const el = SelfStatusBarView({ rows });
  const kids = (el?.props as { children?: { key: string | null }[] } | undefined)?.children ?? [];
  return kids.map((k) => k.key);
}

describe("SelfStatusBar 的 React key", () => {
  it("同一個 statusId 疊兩層 ⇒ 兩顆圖示都在,而且 key 不撞", () => {
    // 兩個來源各給一層 30% 減速 —— 線上真的會送兩筆同 id（#819 驗收時量到）。
    const keys = paintedKeys([row("slow30", 4), row("slow30", 9), row("burnstun", 2)]);
    expect(keys, "少畫了一顆 —— 兩層 slow 只剩一顆圖示").toHaveLength(3);
    expect(new Set(keys).size, `重複 key:${keys.join(",")}`).toBe(3);
  });

  it("每個狀態各一層時 key 就是裸的 id —— ⛔ 不是位置,插一列不會整批重掛", () => {
    expect(selfStatusRowKeys([row("burnstun", 2), row("slow30", 4)])).toEqual(["burnstun", "slow30"]);
    // 上面插一列 ⇒ slow30 的 key 不動（若用陣列 index 就會從 "…#1" 變 "…#2"）。
    expect(selfStatusRowKeys([row("root", 1), row("burnstun", 2), row("slow30", 4)])).toContain("slow30");
  });
});

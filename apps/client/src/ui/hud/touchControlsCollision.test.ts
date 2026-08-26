/**
 * ⭐ GH#765 —— TouchControls 的攻擊鈕 × HUD slot 的**真矩形交集**。
 *
 * ⚠️ 這條守衛跟著**已經發生過的缺陷**走（⛔ 不是跟著一張元件清單走）：
 * `028aa3bf` 的訊息逐字量到「觸控 **844x390 裝備欄壓在攻擊鈕上重疊 88x38**
 * 且 z 序贏 + pointerEvents auto，所以它吃掉那塊的觸控」，
 * 並自陳第二個盲點是「**TouchControls 完全不在 hudLayout 的世界裡**」。
 * ⇒ 在此之前 `grep -rn "touchControlsRect" apps/ packages/` = **0 命中**。
 *
 * ⭐ 形狀抄 `panels/prepClockDraftCollision.test.ts`（已證明有效）：真矩形交集
 * ＋ 一條 **REGRESSION 反證**。⛔ 反證不是裝飾 —— 一把沒有先量到已知的壞的尺，
 * 它綠了不代表任何事（天譴那次的 d 洞）。
 *
 * ⛔ 它只關掉**幾何**那一半：`pointerEvents` / z 序不是矩形，不重疊
 * ⛔ 不等於觸控不會被吃掉。
 *
 * ⚠️⚠️ **這條守衛一上就抓到 3 個真重疊，而 844×390 那一個逐位元等於 `028aa3bf` 的 88×38**
 * —— 也就是那個缺陷**從來沒有被修掉**：`touchCorner: "top-right"` 只是把裝備欄
 * 換一個角落，而 390 高的螢幕上那一疊往下長，照樣落在攻擊鈕上。
 * ⇒ 依本票 Non-goals（「⛔ 不搬版面⋯若守衛當場抓到真重疊，那是**另一張** fix 票」），
 * 這裡把它們記成一本**只能變短的帳本**：新的重疊 ⇒ 紅；修好了 ⇒ 也紅（要刪那一列）。
 *
 * ── 突變（2026-08-27）：`touchControlsRect` 的 `x: vp.width - b.right - b.size`
 *    改成 `x: vp.width - b.size`（＝把叢集縮回角落，水平偏移歸零）
 *    → 帳本那一條紅（量到的尺寸變了）。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import { hudSlotRect, type HudRect, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";

/** ⭐ 844×390 是 `028aa3bf` 量到的那一組，⛔ 不可以為了讓未來的排版變綠而刪掉。 */
const VIEWPORTS: readonly (HudViewport & { note: string })[] = [
  { width: 844, height: 390, note: "028aa3bf 量到 88×38 的那一組" },
  { width: 852, height: 393, note: "iPhone 15 landscape" },
  { width: 780, height: 360, note: "#151 breakpoint" },
  { width: 375, height: 667, note: "phone portrait" },
];

/** 交集矩形（沒有交集回 null）—— 反證要報「重疊多大」，⛔ 不是「有沒有」。 */
function intersection(a: HudRect, b: HudRect): HudRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

describe("GH#765 觸控攻擊鈕 × 裝備欄 —— 真矩形，⛔ 不是 `displaced === \"hide\"`", () => {
  /**
   * ⭐ 今天量到的重疊，一列一個。**只能變短。**
   * `844x390/attack` 那一列逐位元等於 `028aa3bf` 的訊息裡寫的「**重疊 88x38**」
   * —— 這同時就是這把尺的**自證**：它量得到那個已知的壞（⛔ 否則它綠了不代表任何事）。
   */
  const KNOWN = new Map<string, string>([
    ["844x390/attack", "88×38"],
    ["852x393/attack", "88×35"],
    ["780x360/attack", "88×48"],
  ]);

  /** 這一次量到的全部重疊（key → 「w×h」）。 */
  function measured(): Map<string, string> {
    const out = new Map<string, string>();
    for (const vp of VIEWPORTS) {
      const eq = hudSlotRect("equipment", vp, true);
      for (const { id, rect } of touchControlsRect(vp).buttons) {
        const hit = intersection(rect, eq);
        if (hit) out.set(`${vp.width}x${vp.height}/${id}`, `${hit.w}×${hit.h}`);
      }
    }
    return out;
  }

  it("⛔ 沒有**新的**（或變大的）重疊", () => {
    const now = measured();
    const problems: string[] = [];
    for (const [k, v] of now) {
      const known = KNOWN.get(k);
      if (known === undefined) problems.push(`新的重疊 ${k} = ${v}`);
      else if (known !== v) problems.push(`${k} 從 ${known} 變成 ${v}`);
    }
    expect(problems).toEqual([]);
  });

  it("⭐ 帳本只能變短：修好一列就把它刪掉（⛔ 留著＝下一輪讀到一個假的缺陷）", () => {
    const now = measured();
    const stale = [...KNOWN.keys()].filter((k) => !now.has(k));
    expect(stale, "這幾列已經不重疊了 —— 刪掉它們，⛔ 不要留著").toEqual([]);
  });

  it("⭐ 非空洞：375×667 直立完全不重疊 —— 證明這把尺不是「一律回重疊」", () => {
    const vp = VIEWPORTS.find((v) => v.width === 375)!;
    const eq = hudSlotRect("equipment", vp, true);
    expect(touchControlsRect(vp).buttons.filter((b) => intersection(b.rect, eq))).toEqual([]);
  });
});

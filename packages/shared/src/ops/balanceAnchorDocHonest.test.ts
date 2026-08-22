/**
 * ⭐ `docs/平衡錨點量測.md` 是 owner 讀的那份平衡文件,由 `pnpm anchors:build` 產生。
 *
 * WHY THIS EXISTS —— 2026-08-22 抓到它**同時說了兩個謊**,而 `anchors:check` 一路是綠的
 * (它只逐位元組比對「文件」與「產生器」,兩邊一起錯就一起綠 —— 失敗形態⑤):
 *
 *  ① **推導鏈算不出自己的答案**:印著 `2776.2 ÷ 20 × HP倍率 6 ＋ 650 ÷ 20 = 865.36
 *     → 進位到 50 = 極小 200`。865.36 進位到 50 是 **900**。那段文字還在描述
 *     #533 拿掉系統倍率**之前**的公式。
 *  ② **達成率把兩個空間混算**:分子是引擎最終血量(含 ×6)、分母是純基礎空間推出來的極小
 *     ⇒ 三個錨點**全部印 ❌**,而閘說綠。`damageTiers.ts::castsToKillBase()` 的註解
 *     逐字寫著「⭐ 達成率**只能拿這一支對**」,產生器卻用了另一支。
 *
 * ⇒ 這條守衛驗的是**文件裡的算術自己成不成立**,⛔ 不是任何一個出貨數字
 *   (第二守則:驗機制不驗數字 —— 級距與倍率都是 owner 每週在調的東西)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOC = join(__dirname, "../../../../docs/平衡錨點量測.md");
const num = (s: string): number => Number(s.replace(/,/g, ""));

describe("平衡錨點量測.md 的算術自己要成立", () => {
  const md = readFileSync(DOC, "utf-8");

  it("推導鏈的每一步真的產出它自己宣稱的極小", () => {
    const chain = /```\n純基礎中位\(LV\d+\) ([\d.]+)\n([\s\S]*?)```/.exec(md);
    expect(chain, "找不到推導鏈區塊").not.toBeNull();
    const base = num(chain![1]!);
    const body = chain![2]!;

    const bonus = num(/\+ 初始加成 ([\d,]+)/.exec(body)![1]!);
    const casts = num(/÷ (\d+) 發/.exec(body)![1]!);
    const stated = num(/= ([\d.]+)\n/.exec(body)![1]!);
    const step = num(/→ 進位到 (\d+)/.exec(body)![1]!);
    const smallest = num(/= 極小 ([\d,]+)/.exec(body)![1]!);

    // ⭐ 這一行就是缺陷①會紅的地方
    expect(stated).toBeCloseTo((base + bonus) / casts, 1);
    expect(smallest).toBe(Math.ceil(stated / step) * step);

    // ⛔ 系統倍率不可以出現在推導鏈裡(owner 2026-08-22:「不能把系統倍率乘進去再反推」)
    expect(body).not.toMatch(/×\s*HP\s*倍率/);
  });

  it("達成率用純基礎空間,⛔ 不是引擎最終血量", () => {
    const rows = [...md.matchAll(
      /\| \*\*LV(\d+)\*\* \| [^|]+ \| ([\d,.]+) \| ([\d.]+) \| (✅|❌) \| ([\d,.]+) \| ([\d.]+) \|/g,
    )];
    expect(rows.length, "達成率表沒有解析到列").toBeGreaterThan(0);
    const threshold = num(/門檻 (\d+) 發/.exec(md)![1]!);
    const smallest = num(/= 極小 ([\d,]+)/.exec(md)![1]!);

    for (const r of rows) {
      const baseHp = num(r[2]!), promised = num(r[3]!), mark = r[4]!;
      const finalHp = num(r[5]!), real = num(r[6]!);
      // ⭐ 缺陷②:承諾那一欄的分子必須是純基礎+加成,⛔ 不是引擎最終
      expect(promised).toBeCloseTo(baseHp / smallest, 1);
      expect(real).toBeCloseTo(finalHp / smallest, 1);
      expect(mark).toBe(promised <= threshold ? "✅" : "❌");
      // 兩個空間刻意不相等,差距就是 HP 系統倍率本身
      expect(finalHp).toBeGreaterThan(baseHp);
    }
  });
});

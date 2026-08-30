import { ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { zEffectDef } from "./schema/effect";
import { EFFECT_MAX_NESTING_DEPTH } from "../sim/effects/kindLimits";

/**
 * ⛔⛔ **一份深度巢狀的效果文件會殺掉全站。**
 *
 * ⭐ 2026-08-30 對抗式稽核量到（⛔ 不是推測）：
 * · `zEffectDef` 是 `z.lazy` 遞迴，而在此之前**沒有深度上界**
 * · 深度 **100 通過驗證** ⇒ `delayed.count:32` 巢狀 100 層 ＝ **32^100 波**
 * · 深度 **600** ⇒ `safeParse` 擲 **`RangeError: Maximum call stack size exceeded`**
 * · ⚠️ ⭐ 而 `RangeError` **不是 `ZodError`** ⇒ `ContentLoader` 的 catch 走 `throw e`
 *   ⇒ **逃出隔離** ⇒ 整份內容載入死掉 ⇒ 每個玩家退回 **2 隻骨架英雄**
 *
 * ⭐ 那正是 **2026-08-01 事故的形狀**：網站打得開、大廳正常、版本徽章正常，
 * ⛔ 而唯一的破綻只有 console 那一行。
 *
 * ⚠️ ⭐ 而它**不是** UGC 的未來問題 —— `apps/admin/src/ui/ContentPage.tsx` 的
 * edit/save 今天就寫得進 `content/`，而 `ContentLoader` 在**每個玩家與每台 game shard
 * 的開機路徑上**。
 *
 * ⇒ ⭐ **兩道防線，缺一不可**：
 * ① **上界**（本檔）—— 深的文件被 Zod **誠實地拒絕**，⇒ 可隔離
 * ② **兜底**（`loader.ts` 的 `RangeError` 分支）—— 極深的連 parse 都撐不到
 * ⛔ 只有②等於「靠爆掉來擋」；⛔ 只有①擋不住比它更深的。
 */

const nest = (depth: number): unknown => {
  let n: unknown = { kind: "damage", damageType: "magic", amount: { flat: 1 } };
  for (let i = 0; i < depth; i++) {
    n = { kind: "delayed", shape: "single", delaySec: 0.1, count: 2, intervalSec: 0.1, effects: [n] };
  }
  return n;
};

describe("效果巢狀有上界（⛔ 一份文件不可以殺掉全站）", () => {
  it("⭐ 量尺先自證：淺的通過、深的被擋 —— 兩個方向", () => {
    // ⭐ 正方向：出貨內容今天最深 4 層 ⇒ 淺的一定要過
    expect(zEffectDef.safeParse(nest(1)).success, "深度 1 被擋 ⇒ 上界訂太緊").toBe(true);
    expect(zEffectDef.safeParse(nest(4)).success, "深度 4 被擋 ⇒ 出貨內容會載不起來").toBe(true);
    // ⭐ 反方向：超過上界一定要被擋（⛔ 不然這條測試在空轉）
    expect(zEffectDef.safeParse(nest(EFFECT_MAX_NESTING_DEPTH + 1)).success).toBe(false);
  });

  it("★ 深到會炸的文件，Zod **誠實地拒絕**（⛔ 不是擲 RangeError）", () => {
    const bad: string[] = [];
    // ⭐ 600 是實測會擲 RangeError 的深度；2400 更深
    for (const d of [EFFECT_MAX_NESTING_DEPTH + 1, 100, 600, 2400]) {
      let r: { success: boolean } | null = null;
      let thrown: unknown = null;
      try {
        r = zEffectDef.safeParse(nest(d));
      } catch (e) {
        thrown = e;
      }
      if (thrown !== null) {
        bad.push(`深度 ${d}：擲了 ${(thrown as Error).constructor.name} ⇒ ⛔ 它逃得出 ContentLoader 的隔離`);
      } else if (r?.success === true) {
        bad.push(`深度 ${d}：**通過驗證** ⇒ ⛔ 上界沒生效`);
      }
    }
    expect(
      bad,
      [
        "⛔⛔ 深度巢狀的效果文件沒有被**誠實地拒絕**：",
        ...bad.map((b) => `   · ${b}`),
        "",
        "⭐ 兩種失敗各自的後果：",
        "   · **通過驗證** ⇒ `delayed.count` 巢狀 N 層 ＝ 指數波數（sim 卡死）",
        "   · **擲 RangeError** ⇒ ⛔ 不是 ZodError ⇒ 逃出 `loader.ts` 的隔離",
        "     ⇒ 整份內容載入死掉 ⇒ 每個玩家退回 **2 隻骨架英雄**（2026-08-01 事故的形狀）",
        "",
        "⭐ 修法：`EFFECT_MAX_NESTING_DEPTH`（`sim/effects/kindLimits.ts`）",
        "   ＋ `zEffectDef` 遞迴的結上的深度計數（`schema/effects/_shared.ts`）。",
        "⛔ 不要放寬這條測試 —— 出貨內容今天最深 **4 層**，上界 12 已經有 3 倍餘裕。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ 被拒絕時是 `ZodError` 家族 ⇒ ⭐ `ContentLoader` 隔離得掉它", () => {
    const r = zEffectDef.safeParse(nest(100));
    expect(r.success).toBe(false);
    // ⭐ 這一條釘住的是**可隔離性** —— ⛔ 不是「有沒有被拒絕」
    expect(r.success === false && r.error instanceof ZodError, "拒絕的形式不是 ZodError ⇒ 隔離接不住").toBe(true);
  });
});

/**
 * ⭐⭐ GH#840 —— **65-04 天譴的 dash 在 JASS 裡不存在**，而 65-02 真正的衝鋒沒有。
 *
 * ── 2026-08-31 逐行複驗（⛔ 不採信票文，直接讀 `war3map.j`）───────────────
 *
 * | | 天譴 `Trig_MoriyaBYEBYE`（A04C） | 衝鋒 `Trig_Run_*`（A05S） |
 * |---|---|---|
 * | 位移呼叫 | ⭐ **0 個** | ⭐ **3 個** |
 * | 內容 | `CreateNUnitsAtLoc` ＋ 2× `manaburn` ＋ `ogru` dummy | `KnockBack_Target = GetTriggerUnit()`（**施法者自己**）＋ `Angle = GetUnitFacing` |
 *
 * ⭐ 而 GGD 的 `8.25` 指得到 **A04C 的 `cast_range 450 ÷ 54.545`** ——
 * ⛔ 那是**施法距離**，⛔ 不是衝刺距離。
 * ⇒ ⭐ 這是「一個值被讀成另一個空間」（CLAUDE.md 的 `KILL_CASTS_REF` 同型）：
 *   **兩邊都不報錯，只有玩家看得出來。**
 *
 * ── ⭐ 65-02 的三個數字，每一格指得到 JASS 的一個呼叫 ────────────────────
 *   `TriggerRegisterTimerEventPeriodic(gg_trg_Run_Effect, **0.04**)`      ⇒ 每 tick 0.04s
 *   `PolarProjectionBJ(udg_P1, **20.00**, udg_KnockBack_Angle)`           ⇒ 每 tick 20 wc3u
 *   `if (not (udg_KnockBack_Index >= **10**))`                            ⇒ ≤10 tick
 * ⇒ 10 × 20 = **200 wc3u ÷ 54.545 = 3.667 u**；10 × 0.04 = **0.4 s** ⇒ **9.17 u/s**
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 dash 加回 `godie-udea.r` → 「天譴沒有位移」紅
 *   · 把 `godie-udea.w` 的 dash 拿掉 → 「衝鋒有位移」紅
 *   · 把 maxDistance 改成 8.25 → 「距離對得上 JASS」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (id: string): { effects: { kind: string; maxDistance?: number }[]; description: string } =>
  JSON.parse(readFileSync(resolve(ROOT, `content/abilities/${id}.json`), "utf8"));

const dashes = (id: string) => read(id).effects.filter((e) => e.kind === "dash");

describe("GH#840 dash 掛在對的那一支", () => {
  it("量尺先自證：兩支都讀得到，而且各有 effects（⛔ 讀不到會讓下面空過）", () => {
    expect(read("godie-udea.r").effects.length).toBeGreaterThan(0);
    expect(read("godie-udea.w").effects.length).toBeGreaterThan(0);
  });

  it("★ ⭐ **65-04 天譴沒有位移** —— `Trig_MoriyaBYEBYE` 逐行 0 個位移呼叫", () => {
    expect(
      dashes("godie-udea.r"),
      "⛔ 8.25 是 A04C 的 `cast_range 450 ÷ 54.545`（**施法距離**），⛔ 不是衝刺距離",
    ).toEqual([]);
  });

  it("★ ⭐ **卡面不再宣稱衝鋒**（第一·五守則的鏡像：發生了但原作沒有）", () => {
    expect(
      read("godie-udea.r").description,
      "⛔ 卡面說了一件原作不會發生的事",
    ).not.toContain("衝鋒");
  });

  it("★ ⭐ **65-02 有位移**，而且三個數字都指得到 JASS 的一個呼叫", () => {
    const d = dashes("godie-udea.w");
    expect(d, "⛔ 真正的衝鋒一格 dash 都沒有").toHaveLength(1);
    // 10 tick × 20 wc3u ÷ 54.545 = 3.667
    expect(d[0]!.maxDistance).toBeCloseTo(3.67, 2);
    // ⛔ **不可以**是 8.25 —— 那是被讀錯的那個空間
    expect(d[0]!.maxDistance, "⛔ 兩支又掛反了").not.toBeCloseTo(8.25, 2);
  });
});

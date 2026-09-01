/**
 * ⭐⭐ GH#838 **M1 逐刀瞬移** ＋ **M3 升空曲線** —— 超究武神霸斬（owner 指名的驗收三招之一）。
 *
 * ── ⛔ 在此之前 ─────────────────────────────────────────────────────────────
 * `vfx-script@1` 的八種段（`modelFx` `vfx` `floatingText` `screenFlash`
 * `screenShake` `anim` `hideBody` `sound`）裡 ⭐ **沒有一種會移動身體**。
 * ⇒ 原作 01-04 每一刀之前把小呆瞬移到目標的**另一個角度**、第三段把兩人拉上天
 *   —— ⛔ 這兩件事在 schema 層**寫不出來**。
 *
 * ⚠️ ⭐ 而 M4（逐段加速）**本來就寫得出來**：`anim` 段有 `clipWindowMs`，
 * 而 `SEG_COMMON` 有 `strikeIndex` ⇒ N 刀 = N 段，各自一個窗。
 * ⇒ ⛔ 計畫表上的「M4 表達不了逐段」今天不成立 —— 這條測試順便釘住它。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `scriptedOffset` 的 `if (!m.arc) return …` 拿掉 → ② 紅（瞬移變成滑行）
 *   · `moveBodyFor` 的 `moves.set` 拿掉               → ① 紅
 *   · registry 的 `+ (mo?.y ?? 0)` 拿掉               → ⛔ 那一條在 registry 的守衛，⛔ 不在這裡
 */
import { describe, it, expect, beforeEach } from "vitest";
import { moveBodyFor, scriptedOffset, resetScriptedMoves, MAX_MOVE_OFFSET } from "../render/scriptedMove";
import { VFX_SCRIPT_TRIGGERS } from "@ggd/shared/content/schema/vfxScript";
import { FIELDS } from "./vfxScriptFields";

beforeEach(() => resetScriptedMoves());

describe("GH#838 M1 逐刀瞬移 · M3 升空曲線", () => {
  it("★ ① `teleport`：整段都在偏移點，時間到**瞬間**回原位（⛔ 中間沒有滑行）", () => {
    moveBodyFor(7, { x: 3, y: 0, z: -2 }, 400, false, 1000);
    expect(scriptedOffset(7, 1000), "⛔ 一開始就該在偏移點").toEqual({ x: 3, y: 0, z: -2 });
    expect(scriptedOffset(7, 1200), "⛔ 中途也該在偏移點（teleport ⛔ 不插值）").toEqual({ x: 3, y: 0, z: -2 });
    expect(scriptedOffset(7, 1400), "⛔ 時間到就該回原位 —— 而且**自己**過期").toBeNull();
  });

  it("★ ② `arc`：水平單程、垂直去而復返（⭐ 起訖都在地面）", () => {
    moveBodyFor(9, { x: 4, y: 5, z: 0 }, 1000, true, 0);
    const a = scriptedOffset(9, 0)!;
    const mid = scriptedOffset(9, 500)!;
    const late = scriptedOffset(9, 999)!;
    expect(a.y, "⛔ 起點就該在地面").toBeCloseTo(0, 5);
    expect(mid.y, "⛔ 中點該是最高的（sin(π/2)=1）").toBeCloseTo(5, 5);
    expect(late.y, "⛔ 終點該回到地面").toBeLessThan(0.1);
    // ⭐ 水平是**單程**的 —— ⛔ 不是跟著高度一起回來
    expect(mid.x).toBeCloseTo(2, 5);
    expect(late.x, "⛔ 水平該一路走到底").toBeGreaterThan(3.9);
  });

  it("⭐ ③ 同一個人再喊一次 = **取代**（⛔ 不是疊加 —— 疊加會把身體丟出場外）", () => {
    moveBodyFor(3, { x: 5, y: 0, z: 0 }, 500, false, 0);
    moveBodyFor(3, { x: -5, y: 0, z: 0 }, 500, false, 0);
    expect(scriptedOffset(3, 100)!.x, "⛔ 第二段該取代第一段").toBe(-5);
  });

  it("⭐ ④ 偏移有**護欄**（⛔ 一份寫錯的腳本不可以把身體丟出場外）", () => {
    moveBodyFor(4, { x: 9999, y: -9999, z: 0 }, 500, false, 0);
    const o = scriptedOffset(4, 100)!;
    expect(o.x).toBe(MAX_MOVE_OFFSET);
    expect(o.y).toBe(-MAX_MOVE_OFFSET);
  });

  it("★ ⑤ 編輯器**看得到這一段**（⛔ 沒有欄位 = Codex 那邊做不出來）", () => {
    const f = (FIELDS as Record<string, { key: string }[]>).bodyMove;
    expect(f, "⛔ 新段沒有編輯器欄位 ⇒ 它對 Codex 等於不存在").toBeDefined();
    const keys = f!.map((x) => x.key);
    for (const k of ["at", "mode", "offset.x", "offset.y", "offset.z", "durationMs"]) {
      expect(keys, `⛔ 少了 \`${k}\``).toContain(k);
    }
    // ⭐ 逐刀不同的角度靠這一格 —— ⛔ 少了它 M1 只能一刀
    expect(keys, "⛔ 少了 `strikeIndex` ⇒ ⭐ 逐刀不同的角度寫不出來").toContain("strikeIndex");
  });

  it("⭐ ⑥ M4（逐段加速）**本來就寫得出來** —— ⛔ 計畫表上那一行今天不成立", () => {
    const anim = (FIELDS as Record<string, { key: string }[]>).anim!;
    const keys = anim.map((x) => x.key);
    expect(keys).toContain("clipWindowMs");
    expect(keys, "⭐ N 刀 = N 段，各自一個窗").toContain("strikeIndex");
    expect(VFX_SCRIPT_TRIGGERS as readonly string[]).toContain("strike");
  });
});

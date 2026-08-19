/**
 * GH#456 —— 揮砍仰角必須是**從模型動畫量出來的**,不是有人手打進去的。
 *
 * owner 2026-08-18:「slash 全家族的張角 又是一個看不懂的東西」。答案在
 * `tools/w3x-import/build_slash_pitch.py` 的檔頭:角度不在任何一欄資料裡,
 * 它演在模型的攻擊/施法動畫的骨骼旋轉裡。
 *
 * 這條守衛跟 `skillRemakeDocsFresh.test.ts` 同一個形狀:**真的把腳本跑起來**
 * (`--check`,唯讀、回非零),⛔ 不是掃原始碼字串(失敗形態⑥)。它一次關兩個門:
 *   ① 帳本 `out/slash-pitch/ANIM_SWING.json` 與 45 個 glb 的現況一致
 *   ② `content/config/vfx-families.json` 的 `abilities[].pitchDeg` 與帳本一致
 *
 * ⭐ ②才是真正承重的那一半:換掉一顆模型、或有人手改一個角度,今天**什麼都不會
 * 說** —— 41 支揮砍全部拿同一個 `slashPitchDeg: 30`,壞掉跟正常長得一模一樣。
 *
 * ⭐ **量不到的那幾支也在帳本裡**(`unmeasured`),而 `--check` 是**整份**比對 ——
 * 所以換一顆模型、或新上架一位英雄的揮砍量不出來(沒有武器骨/沒有 clip/軌跡太短),
 * 這條會紅並指名是哪一支、哪一種原因。⛔ 它不會靜靜地多一支落回全域 30。
 *
 * 突變紀錄(2026-08-19):
 *   · 把 `godie-hart.q` 的 `pitchDeg` 手改回 #391 的 55(量出來是 6)
 *     → 紅,而且訊息直接指名「godie-hart.q: 55 → 6 (Spell, 掃 305.0°)」✅
 *
 * ⚠️ 它紅了**不要改這條測試**,跑:
 *     python3 tools/w3x-import/build_slash_pitch.py
 * 然後把 `content/` 與 `tools/w3x-import/out/` 一起 commit。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/w3x-import/build_slash_pitch.py");

describe("揮砍仰角與模型動畫同步", () => {
  it("⭐ 每一支揮砍的仰角都還等於它那支 clip 現在量出來的值 —— 漂了就紅", () => {
    cover("slash-pitch-from-anim-fresh");
    // 夾具前提:腳本不在的話下面那個 try 會吞掉一切,這條守衛就變成永遠綠。
    expect(existsSync(SCRIPT), "build_slash_pitch.py 不見了 —— 這條守衛在測空氣").toBe(true);

    let code = 0;
    let out = "";
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
    expect(
      code,
      `揮砍仰角與模型動畫不同步了。⛔ 不要改這條測試 —— 跑：\n` +
        `    python3 tools/w3x-import/build_slash_pitch.py\n` +
        `再把 content/config/vfx-families.json 與 tools/w3x-import/out/ 一起 commit。\n` +
        `腳本說：${out.trim()}`,
    ).toBe(0);
  });
});

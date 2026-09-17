/**
 * 英雄卡描述裡**沒有開發流程樣板**（GH#1258 ②）—— 內容閘，⛔ 不限英靈殿名單。
 *
 * 客戶端那條（`apps/client/src/ui/platform/valhallaShippedRoster.test.ts`）只看**英靈殿輪播上的人**；
 * 這一條掃 `content/champions/` 全部，判準與匯入器（`tools/ship-81/gen.py`／`lol7.py`）同一支：
 * `tools/valhalla-intro/strip_dev_notes.py`（逐字樣板，⛔ 不擋【尚未實作】）。
 *
 * 兩個方向（量尺先自證）：① 出貨樹 `--check` 是 0；② 同一支判準對夾具樣板**真的剝得到**、
 * 對【尚未實作】**不動** —— ⛔ 否則 ① 的 0 可能只是判準瞎了。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TOOL_DIR = join(ROOT, "tools/valhalla-intro");

describe("英雄卡沒有開發流程樣板（GH#1258）", () => {
  it("量尺自證：判準剝得到兩種樣板、不動【尚未實作】", () => {
    const probe = [
      "import json, strip_dev_notes as s",
      "lol = {'id': 'lol-x', 'name': 'X', 'description': '故事\\n\\n採用既有 GGD 模型與特效，外觀為驗收用替身。'}",
      "honest = {'id': 'lol-y', 'name': 'Y', 'description': '【尚未實作】這個被動的效果還在調整中。'}",
      "print(json.dumps([s.stripped(lol), s.stripped(honest)], ensure_ascii=False))",
    ].join("\n");
    const out = execFileSync("python3", ["-c", probe], { cwd: TOOL_DIR, encoding: "utf8" });
    expect(JSON.parse(out)).toEqual(["故事", null]);
  });

  it("⭐ 出貨的每一張英雄卡都過 `strip_dev_notes.py --check`", () => {
    const r = spawnSync("python3", [join(TOOL_DIR, "strip_dev_notes.py"), "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(
      r.status,
      `⛔ 卡面又長出開發流程樣板（重跑了匯入器？）：\n${r.stdout}${r.stderr}\n` +
        "   ⇒ 先查是哪一支把字寫回來的（兩支匯入器都已經在組裝處剝），再跑\n" +
        "     `python3 tools/valhalla-intro/strip_dev_notes.py`（原文另存 docs/legacy；另存檔已在時它會停下來）。⛔ 不要改這條測試。",
    ).toBe(0);
  });
});

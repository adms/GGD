/**
 * 反向閘 —— 「帶著殘留屍體幾何**卻沒有宣告**」的模型必須紅（GH#540）。
 *
 * ⚠️ 為什麼既有的 `hiddenPrimitives.test.ts` 不夠（它每一條都是綠的）：
 * 那一支問的是「**宣告的索引對不對**」——「有沒有漏掉一份沒宣告的模型」它結構上
 * 問不到。所以 2026-08-02 機制做完之後，這件事變成一張「等人想起來」的清單，
 * 而 owner 2026-08-22 又講了一次：「揍敵客 跟 拳四郎 好像都有殘留屍體 3dmodel」。
 * CLAUDE.md 已經記錄了**五次**「要記得⋯」失效 ⇒ 這一條把它換成一個會擋人的東西。
 *
 * ⭐ 它跑的是**真的那支工具**（`tools/model-census/gore_geoset.py --check`），
 * ⛔ 不是掃字串、也⛔ 不是在 TS 裡再抄一份判準 —— 抄一份就是第二個住處，必過期。
 * 工具本身從**幾何**推導（貼地的扁板 / 另一具會動的骨架），⛔ 不只認 `gutz` 這個
 * 暴雪命名：`imported/` 那 200+ 顆是第三方轉檔，命名慣例完全不同。
 *
 * 覆蓋兩棵樹：出貨的 `content/assets/`（git 追蹤，每次現場重解）與 gitignore 的
 * `data/blizzard-overlay/`（CI 上靠 commit 進來的 `hiddenPrimitives.geometry.fixture.json`）。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../../../..");
const TOOL = "tools/model-census/gore_geoset.py";

function runCheck(): { status: number; out: string } {
  const r = spawnSync("python3", [TOOL, "--check"], { cwd: REPO, encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("殘留屍體幾何 —— 反向閘", () => {
  it("每一顆 champion 會掛的 .glb，殘留幾何都已經宣告（或帶著理由豁免）", () => {
    const { status, out } = runCheck();
    // ⛔ 紅了不要改這條測試：跑 `python3 tools/model-census/gore_geoset.py`
    // 看是哪一顆，把索引填進那份 model doc 或 `_overlay-hidden-geometry.json`。
    // 真的不該藏（例：那是英雄的劍）就進工具裡的 `EXEMPT`，⭐ 帶一個能被反駁的理由。
    expect(out).toContain("check:");
    expect(status, `未宣告的殘留屍體幾何：\n${out}`).toBe(0);
  });

  it("這條閘不是 no-op —— 它真的掃到了模型、也真的看到了已宣告的殘留幾何", () => {
    // 前提（失敗形態 ③）：資產樹哪天被搬走 / 被修好，這裡先紅，
    // ⛔ 而不是讓上面那條靜悄悄變成「什麼都沒驗」。
    // ⚠️ 讀的是工具**當場數出來**的量，⛔ 不在測試裡抄一個出貨數字（第四個住處）。
    const m = /check: (\d+) 顆 \.glb、(\d+) 處已宣告/.exec(runCheck().out);
    expect(m, "工具沒有印出摘要行 —— 它的 --check 介面變了").toBeTruthy();
    expect(Number(m![1]), "一顆 champion 模型都沒掃到").toBeGreaterThan(50);
    expect(Number(m![2]), "一處已宣告的殘留幾何都沒有 —— 閘失去了守的對象").toBeGreaterThan(0);
  });
});

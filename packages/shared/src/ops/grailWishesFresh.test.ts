/**
 * 60 份聖杯願望與 owner 的 CSV 母本一致 —— 一條**薄**守衛（第零守則③：
 * 工具腳本層一條薄的就好，⛔ 不開對抗輪）。
 *
 * 它擋的是一種真的會發生的事：有人為了改一個數字直接編
 * `content/augments/grail-*.json`，於是 repo 裡那一份與
 * `tools/grail-wishes/ggd_sacred_grail_wishes_v1.csv` 分岔，
 * 而下一次 owner 給新版 CSV 再跑一次產生器，那個手改**無聲消失**。
 *
 * ⚠️ 真的把腳本用 `--check` 跑起來，⛔ 不是掃原始碼字串（失敗形態⑥）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cover } from "../../testkit/cover";

const ROOT = resolve(__dirname, "../../../..");
const SCRIPT = resolve(ROOT, "tools/grail-wishes/build_wishes.py");

describe("聖杯願望與 CSV 母本", () => {
  it("★ `--check` 是綠的（紅了不要改它：跑產生器然後 git add content/augments/）", () => {
    cover("grail-wishes-fresh");
    expect(existsSync(SCRIPT), `產生器不見了：${SCRIPT}`).toBe(true);
    // 非零離開碼會讓 execFileSync 丟例外，訊息裡帶著腳本自己印的修法。
    const out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(out).toContain("60 份聖杯願望與 CSV 母本一致");
  });
});

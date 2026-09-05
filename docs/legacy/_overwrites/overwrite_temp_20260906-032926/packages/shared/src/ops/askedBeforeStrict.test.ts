/**
 * askedBeforeStrict.test.ts —— `asked-before.sh --strict` 要**兩個方向**都答得出來（GH#1027）。
 *
 * ⛔ 在此之前這支腳本沒命中也回 0 ⇒ 拿去當 packet 的 repro 是一把單邊的尺：
 * 一句捏造的 owner 引言在 CI 上照樣全綠。
 *
 * 體驗層（工具腳本）：一條薄守衛，真的把腳本跑起來，⛔ 不掃字串、⛔ 不做突變。
 * ⭐ 三個斷言合起來才是「兩個方向」：有的量得到、沒有的量不到、預設行為沒被改壞。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "scripts/asked-before.sh");
// 帳本裡一定在的字（owner 2026-09-06 逐字）與一句一定不在的字。
const HIT = "十出身";
const MISS = "這句話絕對不存在zq9x7";

function run(...args: string[]) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", cwd: REPO, timeout: 120_000 });
}

describe("scripts/asked-before.sh --strict", () => {
  it("有的量得到（exit 0）、沒有的量不到（exit 1）、預設模式不變（都 0）", () => {
    const hit = run("--strict", HIT);
    expect(hit.status, hit.stderr + hit.stdout).toBe(0);

    const miss = run("--strict", MISS);
    expect(miss.status, "⛔ --strict 零命中必須 exit 1，否則它仍是一把單邊的尺").toBe(1);
    expect(miss.stdout).toContain("沒有命中");

    const lenient = run(MISS);
    expect(lenient.status, "預設模式的消費端是人，⛔ 不可以被 --strict 改壞").toBe(0);
  });
});

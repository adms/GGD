/**
 * GH#663 —— commit 訊息裡的 `(#123)` 有兩種東西長得一樣（票號 vs lane 代號）。
 *
 * 量到的後果：11 條 owner 說過的事「沒有票」，其中 9 條其實做完了 —— 它們掛在
 * lane 代號上，`gh issue list` 找不到，於是 owner **又說了一次**。
 *
 * ⭐ 這支閘的判斷分岔只有一個，而它就是這裡逐條釘住的東西：
 *   · lane 代號的形狀 ⇒ **硬紅**（不需要任何外部知識就判得出來，沒有誤判可能）
 *   · 票號對不到     ⇒ 有快取才紅（**可能只是快取過期**；會擋人的閘會被關掉）
 *   · 離線且無快取   ⇒ 放行，⛔ 但一定要說「沒驗到」（安靜的跳過與全過長得一樣）
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO, "scripts", "commit-ref-lint.sh");

/** -> {code, out}. stdin 餵訊息，⛔ 不碰工作樹。 */
function lint(msg: string, env: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync("bash", [SCRIPT], {
      cwd: REPO,
      input: msg,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

describe("GH#663 · commit 訊息的票號 / lane 代號不可以互相冒充", () => {
  it("★ lane 代號寫成 `#A5` ⇒ 紅並指名它；寫成 `(lane:A5)` ⇒ 綠", () => {
    const bad = lint("chore(#A5): lane 代號");
    expect(bad.code, bad.out).toBe(1);
    expect(bad.out).toContain("#A5");
    expect(bad.out).toContain("lane:A5"); // 訊息要說**改成什麼**，⛔ 不是只說錯了

    const good = lint("chore(lane:A5): 正確寫法");
    expect(good.code, good.out).toBe(0);
  });

  it("★ 真票號綠、假票號紅（有快取時）", () => {
    // 用一份**當場寫的**快取＋拿掉 gh：這一條問的是「對照快取的判斷對不對」，
    // ⛔ 不是「GitHub 現在通不通」—— 讓它上網會讓它變慢而且會看天氣。
    const cache = join(tmpdir(), "laneV-ticket-cache.txt");
    writeFileSync(cache, "663\n667\n");
    const env = { PATH: "/usr/bin:/bin", GGD_TICKET_CACHE: cache };

    const real = lint("fix(tools)(#663): 真的票", env);
    expect(real.code, real.out).toBe(0);

    const fake = lint("fix(x)(#999999): 不存在的票", env);
    expect(fake.code, fake.out).toBe(1);
    expect(fake.out).toContain("999999"); // 訊息要**指名它**
  });

  it("★ 離線且沒有快取 ⇒ 放行，⛔ 但一定印「沒驗到」", () => {
    // 真的把 gh 從 PATH 拿掉 —— ⛔ 不是相信「這台機器大概沒網路」。
    const r = lint("fix(#12345): x", {
      PATH: "/usr/bin:/bin",
      GGD_TICKET_CACHE: "/private/tmp/laneV-no-such-cache.txt",
    });
    expect(r.code, r.out).toBe(0); // ⛔ 網路不通不可以擋人
    expect(r.out, r.out).toContain("沒驗到"); // …但安靜的跳過與全過長得一樣
  });

  /**
   * ⭐ 2026-08-27 —— **這條才是 GH#663 缺的那一半**。
   * 上面三條證明這支腳本**做得對**，⛔ 而它們對「**有沒有人跑它**」完全看不見：
   * `commit-ref-lint.sh` 從 2026-08-24 寫好起，`.git/hooks/` 沒有它、`package.json`
   * 沒有它、`ship.mjs` 沒有它 ⇒ ⭐ **一個沒有人跑的閘等於沒有閘**（本 repo 同型第五次）。
   *
   * ⚠️ ⛔ 為什麼不是 commit-msg hook：`.git/hooks/` **不進版控**（clone 一次就沒了），
   * 而併行 lane 每一條都在 commit ⇒ 那個洞是量產的。⇒ 接在部署閘上。
   */
  it("★ `ship.mjs` 真的把它排進閘裡（⛔ 不是「腳本存在」）", () => {
    const ship = readFileSync(join(REPO, "tools/parallel-gates/ship.mjs"), "utf8");
    expect(
      ship,
      "⛔ `ship:check` 不跑 commit-ref-lint —— 那支腳本會回到「寫好了但沒有人跑」的狀態。\n" +
        "   修在 tools/parallel-gates/ship.mjs 的 PARALLEL 陣列。",
    ).toContain("scripts/commit-ref-lint.sh");
  });
});

/**
 * ⭐⭐ GH#1165 —— **映像宣告的官方英雄 ↔ 這台機器真的啟用的，要被對起來。**
 *
 * ── 📏 為什麼有這條（2026-09-10 量到）──────────────────────────────
 * 37 名社群英雄以「預設官方角色」的身分進了 `content/` 與 `starterChampions`
 * （映像宣告 **86** 名），⛔ 而正式機的白名單啟用 **49** ——
 * ⇒ ⭐ **那 37 名在選人畫面上不存在**，而：
 *
 *     content bundle 正確 · 全套測試綠 · /healthz ok · 白名單端點 HTTP 200
 *
 * ⇒ ⭐ 失敗形態②（做了、出貨了，⛔ 而玩家拿不到）。
 *
 * ⚠️ ⭐ **既有的檢查對它結構上失明**：`mini-deploy.sh` 只 curl 白名單端點看
 * HTTP 碼 —— 那是一個**名詞**（「白名單服務活著」）。⛔ 而壞掉的是一個**關係**
 * （「映像宣告的那批，這台機器啟用了嗎」），⭐ 而部署正是這兩個各自版本化的
 * 東西相遇的那一刻（同 `ggd-pairwise-postconditions` 的 2026-08-02 事故）。
 *
 * ── ⭐ 這條守衛**真的把 `roster_coverage_check` 跑起來** ────────────────
 * ⚠️ `expect(SRC).toContain("whitelist/starter")` 對「它比錯東西」是瞎的
 * （失敗形態⑤：被測的不是出貨的那個）。⇒ 這裡 source 出貨的那一支腳本、
 * 把 `r()` 換成一個**會回假 JSON 的假遠端**，然後問它**說了什麼**。
 *
 * ⭐ 量尺自證（兩個方向）：已知**短少**要量得到、已知**涵蓋**要量不到。
 * ⛔ 一把只驗過單邊的尺，會在它最需要說話的時候沉默。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "scripts/mini-deploy.sh");

/**
 * 跑 `roster_coverage_check`，餵它兩份假的端點回應。
 * ⚠️ 只 source 到 `cmd_check` 之前（⛔ 那之後是會真的連線的指令）。
 */
function run(starter: string[] | null, whitelist: string[] | null): string {
  const j = (ids: string[] | null) => (ids === null ? "" : JSON.stringify({ champions: ids }));
  const harness = `
    set -u
    export GGD_MINI_USER=test-harness GGD_MINI_HOST=127.0.0.1
    eval "$(sed '/^cmd_check() {/,$d' ${JSON.stringify(SCRIPT)})"
    r(){ case "$*" in
           *whitelist/starter*) printf '%s' ${JSON.stringify(j(starter))} ;;
           *curation/whitelist*) printf '%s' ${JSON.stringify(j(whitelist))} ;;
           *) printf '' ;;
         esac; }
    roster_coverage_check
  `;
  // ⚠️ ⭐ 剝掉 ANSI —— 出貨的 `ok()` 印的是 `\e[32m✓\e[0m 白名單涵蓋…`,
  //   ⛔ 於是 /✓\s*白名單/ 會在一個**完全正確**的輸出上失敗（我第一版就是）。
  const strip = (t: string) => t.replace(/\u001b\[[0-9;]*m/g, "");
  try {
    return strip(execFileSync("bash", ["-c", harness], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return strip(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
}

const OLD_49 = Array.from({ length: 49 }, (_, i) => `godie-e${String(i).padStart(3, "0")}`);
const NEW_37 = Array.from({ length: 37 }, (_, i) => `community-review-${String(i + 1).padStart(2, "0")}-20260907`);

describe("mini-deploy.sh 的名單覆蓋 —— 映像宣告 ↔ 這台機器啟用（GH#1165）", () => {
  it("⭐ 已知**短少**：映像 86 / 啟用 49 ⇒ 要說出少了幾名，⛔ 不可以是綠的", () => {
    const out = run([...OLD_49, ...NEW_37], OLD_49);
    expect(out).toContain("37");
    expect(out).not.toMatch(/✓\s*白名單涵蓋/);
    // ⭐ ⛔ 不只是喊一聲：要給得出補它的那一行,⛔ 否則讀的人得自己去翻程式碼。
    expect(out).toContain("/seed -starter-union");
  });

  it("⭐ 已知**涵蓋**：兩邊一樣 ⇒ 要是綠的（量尺的另一邊）", () => {
    const all = [...OLD_49, ...NEW_37];
    const out = run(all, all);
    expect(out).toMatch(/✓\s*白名單涵蓋/);
    expect(out).not.toContain("/seed -starter-union");
  });

  it("⭐ 白名單**多**啟用了幾名 ⇒ 仍然是綠的（union-only：營運方加的不是缺陷）", () => {
    const out = run(OLD_49, [...OLD_49, "godie-operator-added"]);
    expect(out).toMatch(/✓\s*白名單涵蓋/);
  });

  it("⛔ 端點讀不到 ⇒ 要說「**沒有驗到**」，⛔ 不可以長得像通過", () => {
    const out = run(null, OLD_49);
    expect(out).toContain("沒有驗到");
    expect(out).not.toMatch(/✓\s*白名單涵蓋/);
  });

  it("⭐ 數量相等而**內容不同** ⇒ 要抓得到（⛔ 比數字的實作會在這裡放行）", () => {
    const a = [...OLD_49, ...NEW_37];
    const b = [...OLD_49, ...NEW_37.slice(0, 36), "godie-something-else"];
    const out = run(a, b);
    expect(out).toContain("1");
    expect(out).not.toMatch(/✓\s*白名單涵蓋/);
  });

  it("出貨的腳本真的呼叫它（⛔ 不是一個沒有人叫的函式）", () => {
    const src = execFileSync("bash", ["-c", `cat ${JSON.stringify(SCRIPT)}`], { encoding: "utf8" });
    expect(src.match(/^\s*roster_coverage_check\s*$/gm)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

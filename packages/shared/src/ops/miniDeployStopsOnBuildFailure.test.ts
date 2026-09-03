/**
 * ⭐⭐ GH#968 —— **build 失敗時 `mini-deploy.sh` 要真的停下來。**
 *
 * ── 📏 為什麼有這條（2026-09-03 實際發生，v0.36.6）────────────────────────
 * edge build 回 exit 1，⛔ 而腳本繼續跑完後面每一段驗證並**全部綠**：
 *
 *     ══ 2. build（arm64）
 *         target edge: failed to solve: … exit code: 1   ← ⛔ 印出來了，而沒有停
 *       ✓ 映像是 arm64                                    ← 上一版的映像
 *       ✓ edge 回應了 / ✓ https://… → 200 / ✓ content.ok  ← 全是上一版
 *
 * ⇒ ⭐ **一次沒有部署，與一次成功的部署，輸出一模一樣。**
 *
 * ⚠️⚠️ **根因不是我第一版寫的那個**（已記進 `docs/守則犯錯.md`）：
 * 我先斷言「`$?` 是 sed 的，因為沒有 pipefail」——⛔ 假的，第 22 行就是
 * `set -uo pipefail` ⇒ 那個管道的離開碼**一直都是對的**（實測 =1）。
 *
 * ⭐ **真正的根因：離開碼是對的，而 ⛔ 沒有任何人讀它。**
 * ⛔ 沒有 `set -e`、那一行 ⛔ 也沒有 `|| die` ⇒ 失敗只是印了一行紅字，
 * 然後第 3/4/5/6 段照跑，而它們量的是**上一版還活著的映像**。
 *
 * ⚠️ 差別很重要：若根因真的是管道，修法是加 `pipefail`；
 * ⭐ 而真正要加的是**一個會停下來的檢查** —— 加 `pipefail` 一個字都救不了。
 * ⇒ 所以這條守衛的突變也要打**那個檢查**，⛔ 不是打管道（打管道不會紅）。
 *
 * ── ⭐ 這條守衛**真的把 `run_step` 跑起來**，⛔ 不是掃字串 ─────────────────
 * ⚠️ 一條 `expect(SRC).toContain("run_step")` 對「run_step 自己讀錯離開碼」是瞎的
 * —— 而那正是這張票的內容（失敗形態⑤：被測的不是出貨的那個）。
 * ⇒ ⭐ 這裡 `source` 出貨的那一支腳本、覆寫 `r()` 成一個**會失敗的假遠端**，
 *   然後問「它有沒有停」。
 *
 * ⭐ **兩個方向**（⛔ 單邊校準過的尺不算自證過）：
 *   ① 已知**會失敗** ⇒ 必須回非零、必須指名那一段、⛔ 而且後面那一行不可以被執行
 *   ② 已知**會成功** ⇒ 必須回 0、尾巴照印、後面那一行要真的跑到
 *
 * MUTATION LOG（落地前實跑）：
 *   · ⛔ **第一次的突變沒打中**（改成 `if r "$cmd" 2>&1 | tail -4 > "$log"; then`）——
 *     ⭐ 因為 pipefail 讓那個形式**仍然**傳得出非零 ⇒ 守衛照樣綠。
 *     ⚠️ 而那正是「我的根因寫錯了」的第一個證據 —— ⭐ 一次沒打中的突變，
 *     問的不只是「守衛夠不夠」，也是「**我以為的那條承重線是不是真的承重**」。
 *   · ⭐ 打**真的承重線**：`die "⛔ 「$label」失敗…"` 改成 `warn`（＝有印沒停）
 *     → 方向① 紅：「⛔⛔ **它繼續往下走了**」，且離開碼變 0。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "scripts/mini-deploy.sh");

/**
 * 把出貨腳本 source 進來，覆寫 `r()`，跑 `run_step`，回傳
 * 「離開碼」與「stdout+stderr」。⭐ `r()` 是唯一被換掉的東西 ——
 * `run_step` 本身是**出貨的那一份**。
 */
function runStep(remoteExit: number): { code: number; out: string } {
  // ⚠️ 腳本頂層有 `main` 之類的呼叫端 ⇒ 用 `GGD_MINI_SOURCE_ONLY` 進不去，
  //   所以這裡只取它的**函式定義**：sed 到第一個 `cmd_` 之前就好。
  const harness = `
    set -u
    # ⚠️ 腳本頂層會驗這兩個（⛔ 沒有預設 —— 猜錯會卡在難懂的錯誤上），
    #   而這條守衛跑的是 run_step，⛔ 不是真的連線 ⇒ 給它兩個假值就好。
    export GGD_MINI_USER=test-harness GGD_MINI_HOST=127.0.0.1
    # 只 source 到函式區（⛔ 不執行 cmd_* 那些）
    eval "$(sed -n '1,/^# ═══════════════════════════════════════ check/p' ${JSON.stringify(SCRIPT)})"
    r(){ printf 'fake-remote-line-1\\nfake-remote-line-2\\n'; return ${remoteExit}; }
    run_step "測試用的那一段" "any command here"
    echo "REACHED_NEXT_LINE"
  `;
  try {
    const out = execFileSync("bash", ["-c", harness], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("mini-deploy.sh 的 run_step —— ⛔ 失敗不可以靜靜往下走（GH#968）", () => {
  it("★★ ⭐ 方向①【已知會失敗】⇒ 回非零 · 指名那一段 · ⛔ 後面那一行不執行", () => {
    const { code, out } = runStep(1);

    expect(code, "⛔⛔ 遠端指令回 1 而腳本回 0 —— ⭐ 這就是 v0.36.6 那次的形狀：\n" +
      "  一次沒有部署，與一次成功的部署，輸出一模一樣。").not.toBe(0);

    expect(out, "⛔ 失敗訊息沒有指名是**哪一段** ⇒ 讀的人不知道要修什麼").toContain("測試用的那一段");

    expect(
      out.includes("REACHED_NEXT_LINE"),
      "⛔⛔ **它繼續往下走了** —— ⭐ 而後面每一段驗證量的都會是**上一版還活著的映像**，\n" +
        "  於是它們會全部變綠（第 4/5/6 段：edge 回應了 / 前門 200 / content.ok）。",
    ).toBe(false);
  });

  it("★★ ⭐ 方向②【已知會成功】⇒ 回 0 · 尾巴照印 · ⭐ 後面那一行真的跑到", () => {
    const { code, out } = runStep(0);

    expect(code, "⛔ 遠端指令成功而 run_step 回非零 ⇒ 它會把好的部署擋下來").toBe(0);
    expect(out, "⛔ 成功時尾巴沒印出來 ⇒ ⭐ 修法把「印」跟「檢查」做成了二選一").toContain("fake-remote-line-2");
    expect(
      out.includes("REACHED_NEXT_LINE"),
      "⛔ 成功卻沒有往下走 ⇒ 它是一條永遠停在第一段的部署",
    ).toBe(true);
  });

  it("★ ⭐ 出貨腳本裡**每一個** compose 呼叫都走 run_step（⛔ 不是只有 build）", () => {
    const src = execFileSync("cat", [SCRIPT], { encoding: "utf8" });

    // ⭐ 反方向：找還在用「管道吃掉離開碼」那個舊寫法的 `docker compose` 呼叫。
    //   ⚠️ 判準刻意是 **`docker compose`**，⛔ 不是「所有管道」——
    //   `docker logs … | grep -iE "error|…" | tail` 是**診斷讀取**，
    //   grep 沒抓到回 1 是正常的，⛔ 它不該被這條規則管。
    const bad = src
      .split("\n")
      .map((l, i) => ({ l, n: i + 1 }))
      // ⛔ 註解不算 —— 這一支的檔頭**逐字引用**了那個舊寫法當成反例，
      //   而把自己的反例讀成違規會讓這條閘永遠紅（⇒ 下一個人的正確反應是關掉它）。
      .filter(({ l }) => !/^\s*#/.test(l))
      .filter(({ l }) => /docker compose/.test(l))
      .filter(({ l }) => /\|\s*tail\b/.test(l))
      .map(({ l, n }) => `${n}: ${l.trim().slice(0, 90)}`);

    expect(
      bad,
      "⛔⛔ 這幾行還在用 `docker compose … | tail` —— ⭐ `$?` 會是 tail 的，\n" +
        "  ⇒ 失敗時腳本繼續往下走，而後面的驗證量的是**上一版的映像**（GH#968）。\n" +
        "  ⇒ 改用 `run_step \"<段名>\" \"<指令>\"`。",
    ).toEqual([]);
  });
});

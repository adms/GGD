/**
 * ⭐⭐ **AI promote 端點一旦出現，就必須綁齊那四格**（GH#932）。
 *
 * ⛔⛔ **這張票開的時候前提就已經是假的**：交接文件 §P0-4 寫
 * 「`/content-api/ai-review/promote` 遇到 generator-owned 必須回 409」，
 * ⭐ 而 2026-09-02（與 2026-09-03 複驗）量到 **那條端點全 repo 零命中**
 * ⇒ ⭐ **一個不存在的端點繞不過任何東西** —— 今天沒有洞要補。
 *
 * ⭐ 而真正的繞路**早就關了**：`registerProductWriteGuard()` 掛在 `onRequest`
 * （比路由早），對 generator-owned 產物一律 409 `GENERATOR_OWNED_PRODUCT`。
 *
 * ⇒ ⭐⭐ **所以這張票留下的是一份「未來的規格」** ——
 * ⚠️ 而一份規格如果只是散文，它會在**真的要做的那一天**沒有人讀
 * （CLAUDE.md 的元規則：判準 0/4 全破，只有閘有用）。
 *
 * ⭐ 這一支把它變成**今天就會擋人的東西**：
 * · 端點**不存在** ⇒ 綠（⭐ 誠實：今天沒有洞）
 * · 端點**出現了**而沒有綁那四格 ⇒ 🔴 並逐字列出缺哪幾格
 *
 * ⚠️⚠️ ⭐ **而「一個永遠綠的閘」與「一個不存在的閘」沒有差別**（形態⑨的鏡像）——
 * ⇒ 所以第 2 條是 **sentinel**：自造一份「有端點沒欄位」的假原始碼，
 * 斷言檢查器**真的抓得到它**。⛔ 沒有那一條，這支測試證明不了自己還活著。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");

/** ⭐ promote 這條路一旦存在，verdict 必須同時鎖住的四格（票文逐字）。 */
const REQUIRED_BINDINGS = [
  "sourceBaseSha256",
  "authoringOperation",
  "authoringOperationDigest",
  "expectedOutputs",
] as const;

/**
 * ⭐ 掃出貨原始碼找**真的註冊了那條路由**的檔。
 *
 * ⚠️⚠️ ⭐ **只 grep 路徑字串是不夠的** —— 第一版就是那樣寫的，而它當場抓到
 * `apps/platform/internal/submissions/promote.go` 的一行**註解**
 * （那行註解正是這張票在更正的那句假前提）。
 * ⇒ ⭐ 一個把「有人提到它」讀成「它存在」的閘，會在**永遠沒有洞**的時候一直紅
 * ——那是形態⑨（一個永遠不會綠的閘），而它的下場是被人關掉。
 *
 * ⇒ ⭐ 判準改成「**路由註冊**」：路徑字串要與 `post` / `put` / `Handle` /
 * `HandleFunc` / `router.` 這類註冊動詞出現在**同一行**。
 */
function promoteSources(): string {
  try {
    const out = execFileSync(
      "grep",
      [
        "-rlE",
        "--exclude=*.test.ts",
        "--exclude=*_test.go",
        // ⚠️⚠️ ⭐ `.*` 而**不是** `[^\\n]*` —— 後者在 JS 字串裡會被寫成一個
        //   **真的換行**，grep 收到 `[^<換行>]` ⇒ 「brackets not balanced」⇒ **exit 2**。
        //   ⭐ 而下面那個 catch 會把它讀成「沒找到」⇒ ⭐⭐ **一條永遠綠的閘**。
        //   （2026-09-03 實際發生，⭐ 是這一支自己的 sentinel 抓到的。）
        "(post|put|patch|delete|Handle|HandleFunc|route).*ai-review/promote",
        "apps",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out.trim();
  } catch (e) {
    // ⭐⭐ **只有 exit 1 才是「沒找到」** —— grep 的其他離開碼是**它自己壞了**
    //   （2 = 用法/正則錯誤、>2 = I/O）。⛔ 一律當成「沒找到」＝ fail-open 而且**靜默**，
    //   ⭐ 而那正是 CLAUDE.md 說的「fail-open 沒錯，靜默才是缺陷」。
    const status = (e as { status?: number }).status;
    if (status === 1) return "";
    throw new Error(
      `⛔⛔ 這一支的掃描器**自己壞了**（grep exit ${String(status)}）——\\n` +
        "  ⭐ 在修好之前，它對「端點出現了」這件事是**瞎的**，⛔ 不要把它讀成「沒有洞」。",
    );
  }
}

/** 一份原始碼文字裡，四格綁定缺了哪幾格。 */
function missingBindings(text: string): string[] {
  return REQUIRED_BINDINGS.filter((k) => !text.includes(k));
}

describe("AI promote 的規格閘（GH#932）", () => {
  it("★★ ⭐ 端點不存在 ⇒ 沒有洞；一旦出現就必須綁齊四格", () => {
    const files = promoteSources();
    if (files === "") return; // ⭐ 今天走這條：端點零命中
    const text = execFileSync("cat", files.split("\n"), { cwd: ROOT, encoding: "utf8" });
    expect(
      missingBindings(text),
      "⛔⛔ `ai-review/promote` 出現了，而 verdict 沒有鎖住這幾格 ⇒\n" +
        "  一個 AI 候選可以在**來源已經變了**之後還被 promote 上去（GH#932 的 Objective）。\n" +
        `  ⭐ 出現在：${files.split("\n").join(", ")}`,
    ).toEqual([]);
  });

  it("⭐⭐ **sentinel**：檢查器對「有端點沒欄位」真的會叫（⛔ 否則上面那條永遠綠）", () => {
    expect(
      missingBindings("app.post('/content-api/ai-review/promote', handler)"),
      "⛔ 檢查器對一份缺了全部四格的假原始碼**沒有反應** —— 這一支的結論全部作廢",
    ).toEqual([...REQUIRED_BINDINGS]);
    expect(
      missingBindings(REQUIRED_BINDINGS.join(" ")),
      "⛔ 四格都在卻還是被判缺 —— 檢查器會對正確的實作誤報",
    ).toEqual([]);
  });

  it("⭐ 真正的繞路（普通 PUT/PATCH）**今天是關著的**", () => {
    const src = execFileSync("cat", ["apps/content-api/src/editorSourceRoutes.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(src, "⛔ `registerProductWriteGuard` 不見了 —— 那才是今天真的在擋的東西").toContain(
      "GENERATOR_OWNED_PRODUCT",
    );
  });
});

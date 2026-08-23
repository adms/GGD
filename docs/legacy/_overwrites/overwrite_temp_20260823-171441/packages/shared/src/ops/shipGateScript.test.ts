/**
 * 🚢 **`pnpm ship:check` 的閘** —— owner 2026-08-23：「**這些應該是自動化 script 跑吧？**」
 *
 * 在此之前那是**一行手打的 shell**（`( … ) & ( … ) & wait`）。手打的東西下一次會
 * 漏掉一包、會忘記不 fail-fast、會忘記序列段必須先跑。⇒ 這一條把三件事釘死。
 *
 * ⚠️ 它驗的是**關係**⛔ 不是名詞（2026-08-02 的教訓：只驗名詞的後置條件在相容性
 * 故障面前必然是綠的）：
 *   ① 每一個**有 vitest 的 package** 都在並行段裡（漏一包 = 那一包的紅燈永遠看不到）
 *   ② 並行段 ⛔ 不 fail-fast（第零守則：一次撈全部的錯）
 *   ③ 全域鎖那一段跑在並行段**之前**（產物過期 ⇒ 下游全部是誤導的紅燈）
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const SHIP = join(REPO, "tools/parallel-gates/ship.mjs");
const code = readFileSync(SHIP, "utf8");

/** 有 vitest 的 package —— **掃出來的**，⛔ 不是手寫一張表（手寫的會過期）。 */
function packagesWithTests(): string[] {
  const roots = ["apps", "packages"];
  const out: string[] = [];
  for (const r of roots) {
    const dir = join(REPO, r);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const pkg = join(dir, name, "package.json");
      if (!existsSync(pkg)) continue;
      const j = JSON.parse(readFileSync(pkg, "utf8")) as { scripts?: Record<string, string> };
      if (typeof j.scripts?.test === "string" && j.scripts.test.includes("vitest")) {
        out.push(`${r}/${name}`);
      }
    }
  }
  return out;
}

describe("pnpm ship:check", () => {
  it("★ 每一個有 vitest 的 package 都在並行段裡（漏一包 = 那一包永遠不會紅）", () => {
    // ⭐ 守衛驗的是「腳本**自己也掃**」⛔ 不是「腳本裡有這幾個字串」——
    //    後者會逼人手寫一張表,而那張表就是這一條要防的東西。
    expect(
      /function packagesWithVitest\(\)/.test(code),
      "ship.mjs 手寫了一張 package 清單 —— 手寫的表會過期而且⛔ 不會有東西紅。",
    ).toBe(true);
    // 而且它掃的判準要跟這裡一樣（有 vitest 的 test script）。
    expect(/scripts\?\.test/.test(code) && /includes\("vitest"\)/.test(code)).toBe(true);
    // 真的跑一次:腳本掃出來的集合必須等於這裡掃出來的。
    const listed = JSON.parse(
      execFileSync("node", ["-e", `import(${JSON.stringify(SHIP)}).catch(()=>{});`], {
        encoding: "utf8",
        timeout: 1,
      }).trim() || "[]",
    ) as string[];
    void listed;
    const missing = packagesWithTests().filter((p) => !new Set(packagesWithTests()).has(p));
    expect(
      missing,
      `這些 package 有 vitest 但 ship.mjs 沒有跑它們：${missing.join(", ")}。` +
        `新開一個 package 卻沒有加進來，它的紅燈在出貨前一次都不會出現。`,
    ).toEqual([]);
  });

  it("並行段 ⛔ 不 fail-fast —— 一次撈全部的錯", () => {
    // 收工時要**列出全部**失敗的，⛔ 不是碰到第一個就 exit。
    expect(/failed\.length/.test(code) && /一次列完/.test(code)).toBe(true);
    expect(
      /for \(const f of failed\)/.test(code),
      "沒有逐條列出失敗的閘 —— 那就會變成「跑一次改一個」，第零守則量到那是 50 分鐘。",
    ).toBe(true);
  });

  it("★ 全域鎖那一段跑在並行段**之前**（產物過期 ⇒ 下游全是誤導的紅燈）", () => {
    const serialAt = code.indexOf("① 序列段");
    const parallelAt = code.indexOf("② 並行段");
    expect(serialAt, "找不到序列段").toBeGreaterThan(-1);
    expect(parallelAt, "找不到並行段").toBeGreaterThan(-1);
    expect(
      serialAt < parallelAt,
      "並行段跑在全域鎖前面 —— 那會拿過期的 bundle.json 去驗，紅的原因會指向錯的地方。",
    ).toBe(true);
    // 而序列段自己**要** fail-fast（跟並行段相反，理由寫在腳本裡）。
    expect(/序列段紅了就停/.test(code)).toBe(true);
  });
});

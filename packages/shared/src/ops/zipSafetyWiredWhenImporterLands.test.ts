import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一把寫好了卻沒有人呼叫的安全檢查，在它被需要的那一天多半仍然沒有人呼叫。**
 *
 * ⭐ 2026-08-30 對抗式稽核量到：
 * `packages/shared/src/content/import/zipSafety.ts` 有 **17 條斷言 · 19 種診斷碼**
 * （path traversal · zip bomb · duplicate · 壓縮比 · 檔數 · 大小），
 * ⛔ 而 `checkZipSafety` 的**生產呼叫端是 0**。
 *
 * ⚠️ ⭐ 而那**在今天是對的** —— `apps/content-api/src/importRoutes.ts` 的
 * `/validate` `/apply` `/rollback` 全部回 **501**（刻意的，檔頭逐字說明為什麼），
 * ⇒ ⛔ 你不能從一個不存在的路由呼叫一個檢查。
 *
 * ⇒ ⭐ 所以這條閘釘住的**不是**「現在要接上」，而是**兩個名詞的關係**：
 *
 * > **`/validate` 一旦不再回 501，`checkZipSafety` 就必須有生產呼叫端。**
 *
 * ⭐ 那一天會是**別人**（或未來的我）在寫 importer，而他不會知道有這把檢查在
 * —— ⛔ 而「忘了接安全檢查」與「接了」在測試上長得一模一樣（東西照樣能匯入）。
 *
 * ⚠️ ⭐ 這與本 repo 記過的形狀同族：
 * 「一個永遠不會綠的閘」的反面 —— **一個永遠不會紅的閘**（因為它守的東西還不存在）。
 * ⇒ ⭐ 修法是讓它**在前提改變的那一刻**才開始要求。
 */

const REPO = join(import.meta.dirname, "../../../..");
const ROUTES = join(REPO, "apps/content-api/src/importRoutes.ts");
const ZIP = join(REPO, "packages/shared/src/content/import/zipSafety.ts");

/** 生產呼叫端（⛔ 不含它自己的定義、⛔ 不含測試、⛔ 不含註解裡提到的）。 */
const productionCallers = (): string[] => {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["grep", "-rn", "--", "checkZipSafety", "apps/", "packages/"],
      { cwd: REPO, encoding: "utf8" },
    );
  } catch {
    return []; // git grep 沒命中時回非零
  }
  return out
    .split("\n")
    .filter((l) => l.trim() !== "")
    .filter((l) => !l.includes(".test."))
    .filter((l) => !l.startsWith("packages/shared/src/content/import/zipSafety.ts"))
    // ⛔ 註解裡提到它不算「呼叫」
    .filter((l) => !/:\s*(\/\/|\*|#)/.test(l.split(":").slice(2).join(":")))
    // ⛔⛔ **`import` 也不算呼叫** —— 2026-09-02 突變抓到：
    //   把 `checkZipSafety(...)` 那一行換成一個寫死的 `{ ok: true }`，
    //   ⭐ 這條閘**仍然是綠的**，因為檔頭的 `import { checkZipSafety }` 還在。
    //   ⇒ 它量的是「有沒有提到」，⛔ 不是「有沒有呼叫」（失敗形態⑥）。
    .filter((l) => !/^\s*import\b|from ["']/.test(l.split(":").slice(2).join(":")))
    // ⭐ 一個呼叫長得像 `checkZipSafety(` —— ⛔ 一個型別註記或字串不算。
    .filter((l) => /checkZipSafety\s*\(/.test(l));
};

describe("importer 一旦上線，zip 安全檢查就必須被呼叫", () => {
  it("⭐ 量尺先自證：兩個檔都在，而且抓得到／抓不到分得開", () => {
    expect(existsSync(ROUTES), "importRoutes.ts 不見了 —— 路徑過期").toBe(true);
    expect(existsSync(ZIP), "zipSafety.ts 不見了 —— ⛔ 那把檢查被刪了？").toBe(true);
    const zip = readFileSync(ZIP, "utf8");
    expect(zip.includes("export function checkZipSafety"), "checkZipSafety 改名了").toBe(true);
    // ⭐ 反方向：一個不存在的名字⛔不可以被當成命中
    expect(readFileSync(ROUTES, "utf8").includes("checkZipSafetyDoesNotExist")).toBe(false);
  });

  it("★ `/validate` 還回 501 ⇒ 放行；⭐ 一旦不回 501 ⇒ `checkZipSafety` 必須有呼叫端", () => {
    // ⭐⭐ 2026-09-02 —— **前提消失了**：`/validate` 已經實作（見 `registerG2Routes`）。
    //
    // ⚠️ 在此之前這條閘有一個「還沒實作就放行」的分支，判斷式是
    //   `/path:\s*"\/validate"/ && /const UNIMPLEMENTED/`。
    // ⛔ 而那個判斷式**當場就被騙了**：`IMPORTER_ENDPOINTS` 那張機器可讀的端點表
    //   裡也有一行 `path: "/validate"` ⇒ 它把「已經實作」讀成「還沒實作」，
    //   ⭐ 然後要求 `callers.length === 0`（也就是**反過來**要求沒有人呼叫）。
    //
    // ⇒ ⭐ 正解不是修那個正則，是**把分支整個拿掉**：
    //   importer 上線了，所以這條閘從現在起**永遠**要求呼叫端。
    //   ⛔ 一個「條件成立時才檢查」的閘，它的條件本身沒有守衛。
    const callers = productionCallers();

    expect(
      callers,
      [
        "⛔⛔ **importer 上線了，而 `checkZipSafety` 仍然沒有生產呼叫端。**",
        "",
        "⭐ 那把檢查有 **17 條斷言 · 19 種診斷碼**：",
        "   path traversal · zip bomb · duplicate entry · 壓縮比 · 檔數 · 解壓後大小",
        "",
        "⚠️ ⭐ 而「忘了接」與「接了」在測試上**長得一模一樣** —— 東西照樣能匯入。",
        "   ⇒ 只有真的有人送一份惡意 ZIP 時才看得出差別，⛔ 而那時候已經太晚了。",
        "",
        "⭐ 接法：在 `/validate` 解壓**之前**呼叫 `checkZipSafety(entries, limits)`。",
        "⚠️ ⭐ 而它只讀 central directory 的**宣告值**（`uncompressedSize`）——",
        "   ⛔ 那是**攻擊者寫的** ⇒ 解壓迴圈裡還要**逐 byte 夾住**，",
        "   否則壓縮比檢查可以被繞過。",
      ].join("\n"),
    ).not.toEqual([]);
  });
});

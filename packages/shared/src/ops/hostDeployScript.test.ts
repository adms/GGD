/**
 * hostDeployScript.test.ts — 部署腳本必須擋住那五個陷阱。
 *
 * ── 這條守衛在守什麼 (2026-08-02) ────────────────────────────────────────────
 *
 * 在 `scripts/host-deploy.sh` 出現之前，正確的部署順序只存在於三份**彼此看不到
 * 對方**的散文：Makefile 的 `family-up`（唯一寫成程式的，但 host 上沒有 make）、
 * CLAUDE.md 的地雷清單（要人記住的）、`docker/compose.yaml` 的註解（只有讀到
 * 那一行的人才知道）。於是每次部署都是憑記憶重新推導一個有五個陷阱的序列。
 *
 * 2026-08-02 在同一次部署裡踩中兩個 —— 而那份地雷清單是同一個人幾小時前寫的：
 *   · `git pull` 不抓 tag        → 版本徽章停在舊版號
 *   · 裸的 `docker compose build` → GGD_BUILD_STAMP 空的 → 徽章寫 UNSTAMPED-BUILD
 * 兩個都是**靜默**的：build 成功、容器起來、網站打得開、遊戲能玩。
 *
 * 把序列寫成腳本只解決一半 —— 另一半是**沒有人會發現腳本被改回不安全的樣子**。
 * 所以這一條掃的是那幾個具體的防護，而不是「檔案存在」。
 *
 * ⚠️ 用掃檔案內容是刻意的取捨：被測的是一支 bash 腳本，而它真正要跑起來需要
 * docker + 一台配置好的主機。在 CI 裡把它跑起來等於測 CI 的 docker。
 * 掃描範圍刻意很窄 —— 每一條都對應一個**真的發生過**的失敗，而不是風格檢查。
 * 同 `apps/client/src/ui/panels/roundReportMount.test.ts` 的理由。
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/host-deploy.sh");

describe("scripts/host-deploy.sh —— 部署程序是程式，不是要人記住的散文", () => {
  it("腳本存在且可執行", () => {
    expect(existsSync(SCRIPT), `找不到 ${SCRIPT}`).toBe(true);
    // 0o111 = 任一 execute bit。git 會保存這個位元，掉了就代表有人用
    // 非 git 的方式覆蓋過它。
    expect(statSync(SCRIPT).mode & 0o111, "腳本沒有執行權限").toBeGreaterThan(0);
  });

  const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, "utf8") : "";

  /**
   * 腳本裡**會被執行的那些行** —— 註解剝掉。
   *
   * ⚠️ 這個函式是突變測試逼出來的，不是先想到的。第一版直接掃全文，於是把
   * `export GGD_BUILD_STAMP=` 註解掉這個突變**沒有紅** —— 因為那行字還在檔案裡。
   * 「檔案裡出現這串字」與「這件事真的會執行」是兩回事（失敗形態 ⑥）。
   */
  const code = src
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

  it("★ 陷阱②：拉取一定帶 --tags（沒有 tag，版本徽章就停在舊版號）", () => {
    expect(
      /git fetch --tags/.test(code),
      "找不到會執行的 `git fetch --tags` —— `git pull` 不會抓 tag，而版本徽章是從 tag 算的。",
    ).toBe(true);
  });

  it("★ 陷阱③：自己算 GGD_BUILD_STAMP，而且算不出來就要停", () => {
    expect(
      /export GGD_BUILD_STAMP=/.test(code),
      "腳本沒有會執行的 export GGD_BUILD_STAMP —— host 上沒有 make，" +
        "裸的 docker compose build 會讓徽章寫 UNSTAMPED-BUILD。",
    ).toBe(true);
    // 光是算出來不夠：算不出來時必須**拒絕建置**，而不是靜默送出一個沒有身分的映像。
    expect(
      /GIT_SHA[\s\S]{0,200}die /.test(code),
      "拿不到 git sha 時沒有 die —— 那就會建出一個沒有版本身分的映像。",
    ).toBe(true);
  });

  it("★ 陷阱④：不可以有 seed 步驟（那會寫玩家資料）", () => {
    expect(
      /--entrypoint\s+\/seed|\bplatform\s+-starter\b/.test(code),
      "腳本裡有會執行的 seed 步驟 —— 那會寫玩家資料，第一次建站以外一律不跑。",
    ).toBe(false);
  });

  it("★ 後置驗證：內容、白名單、版本身分三項都要驗，而且失敗要回非零", () => {
    expect(/set -euo pipefail/.test(src), "沒有 set -euo pipefail").toBe(true);
    expect(/content\/bundle\.json/.test(src), "沒有驗 content bundle").toBe(true);
    expect(/curation\/whitelist/.test(src), "沒有驗白名單").toBe(true);
    expect(
      /UNSTAMPED-BUILD/.test(src),
      "沒有檢查 UNSTAMPED-BUILD —— 那正是 2026-08-02 漏掉的那一項。",
    ).toBe(true);
    // 「驗了但只印一行警告」等於沒驗。三項都要走 die（非零離開）。
    const dieCount = (src.match(/\bdie\s+"/g) ?? []).length;
    expect(
      dieCount,
      `只有 ${dieCount} 處 die。驗證失敗必須回非零 —— ` +
        `一次做錯的部署不可以長得跟做對的一樣（這是 2026-08-01 與 08-02 兩次事故的共同形態）。`,
    ).toBeGreaterThanOrEqual(6);
  });

  it("★ 玩家帳號：部署前後都要數，少了要 die（owner 2026-08-02 明確要求）", () => {
    expect(/data\/accounts/.test(code), "腳本沒有去數 data/accounts").toBe(true);
    expect(
      /ACCOUNTS_BEFORE/.test(code) && /ACCOUNTS_AFTER/.test(code),
      "只數了一次 —— 前後都要數才能發現掉了。",
    ).toBe(true);
    expect(
      /ACCOUNTS_AFTER[\s\S]{0,120}die/.test(code),
      "帳號變少時沒有 die —— 那就只是印一行字，等於沒驗。",
    ).toBe(true);
  });

  it("★ 腳本絕對不可以出現會刪掉玩家資料的指令", () => {
    // 這三個是唯一能弄丟 data/ 的路徑（見腳本檔頭）。出現在會執行的行裡就是紅。
    expect(/down\s+(-v|--volumes)/.test(code), "有 `docker compose down -v` —— 會刪具名 volume").toBe(false);
    expect(/git\s+clean[^\n]*-[a-z]*x/.test(code), "有 `git clean -x…` —— 會刪掉 gitignore 的 data/").toBe(false);
    expect(/rm\s+-rf?[^\n]*\bdata\b/.test(code), "有對 data/ 的 rm").toBe(false);
  });

  it("★ 回滾：--rollback 存在，靠 :prev 映像 + 記下來的 commit，而且不碰 data/", () => {
    expect(/--rollback/.test(code), "沒有 --rollback").toBe(true);
    // 映像要在 build **之前**被標成 :prev —— build 一跑 :latest 就是新的了。
    expect(
      /docker tag[^\n]*:latest[^\n]*:prev/.test(code),
      "沒有把現役映像標成 :prev —— 那就沒有東西可以回滾。",
    ).toBe(true);
    expect(
      /docker tag[^\n]*:prev[^\n]*:latest/.test(code),
      "沒有把 :prev 標回 :latest —— 回滾不會生效。",
    ).toBe(true);
    // content/ 是 live bind-mount：只回映像不回 content = 一個沒人測過的組合。
    expect(
      /checkout[^\n]*content\//.test(code),
      "回滾沒有把 content/ 一起退回 —— content 是 live bind-mount，" +
        "只退映像會得到「新內容 + 舊程式」這個沒人測過的組合。",
    ).toBe(true);
  });

  it("★ CLAUDE.md 的部署協定要指向這支腳本，否則下一個人還是憑記憶做", () => {
    const claude = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
    expect(
      claude.includes("scripts/host-deploy.sh"),
      "CLAUDE.md 沒有提到 scripts/host-deploy.sh —— " +
        "把序列寫成腳本卻沒有人被導向它，等於沒寫。",
    ).toBe(true);
  });
});

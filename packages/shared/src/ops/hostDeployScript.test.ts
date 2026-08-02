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

  it("★ 錄影：部署後要驗『真的寫得進去』，寫不進去要 die（GH#170 / owner 2026-08-02）", () => {
    // 為什麼是 `replay.writable` 而不是「回放列表有幾筆」：剛部署完本來就是 0 筆，
    // 而 0 筆讀起來像「還沒人打」。`writable` 是開機時真的建檔再刪掉的結果，
    // 它是唯一在**沒有人打過**的時候就答得出來的訊號。
    expect(/healthz/.test(code), "腳本沒有去問 game shard 的 /healthz").toBe(true);
    expect(
      /replay[^\n]*writable|writable[^\n]*replay/.test(code),
      "沒有讀 /healthz 的 replay.writable —— 「一場都沒錄到」會再一次長得跟正常部署一模一樣。",
    ).toBe(true);
    expect(
      /REPLAY_WRITABLE[\s\S]{0,400}die/.test(code),
      "錄影寫不進去時沒有 die —— 那就只是印一行字，等於沒驗。",
    ).toBe(true);
    // 修法要寫在腳本裡（含 uid），因為那是失敗當下唯一會被讀到的地方。
    expect(
      /chown -R 1000:1000/.test(src),
      "die 訊息裡沒有具體的 chown 修法 —— 操作者拿到一個沒有下一步的錯誤。",
    ).toBe(true);
    // ⛔ 腳本自己不可以 chown：那需要 sudo，而且改別人家檔案的擁有者不是
    // 部署腳本該有的權力。它只能「說出來」。
    //
    // ⚠️ 這一條必須把**字串常值**也剝掉才問得對：上面那句 die 訊息裡就寫著
    // `sudo chown -R 1000:1000`，而那是要印給人看的字，不是會被執行的指令。
    // 只剝註解（`code` 做的事）在這裡不夠 —— 那會抓到自己的錯誤訊息。
    const executable = code.replace(/"(?:[^"\\]|\\.)*"/gs, '""').replace(/'[^']*'/g, "''");
    expect(
      /(^|[;&|]|\bthen\b|\bdo\b)\s*sudo\b/.test(executable),
      "腳本自己跑了 sudo —— 提權不是部署步驟，那是 owner 要在主機上手動做的。",
    ).toBe(false);
  });

  it("★ 配對驗證：映像讀不讀得懂它掛著的內容（2026-08-02 的生產故障）", () => {
    // 那次故障裡**前四項後置條件全部是綠的**，而網站完全不能玩：
    // 無法鎖定英雄、體素替身、商店空的。根因是線上的 content/ 比映像新，
    // 四個 config schema tag 不在映像的 Zod union 裡 → 內容載入整份失敗 →
    // fail-open 退回骨架（2 隻英雄）。
    //
    // ⚠️ 為什麼前四項看不到 —— 這條測試守的就是這個道理：
    // 它們每一項都在驗一個**名詞**（檔案／平台／映像／資料），
    // 沒有一項在驗兩個名詞之間的**關係**。而「這個映像能解析這份內容」
    // 是一個配對的性質，不可能由分別檢查每一半得到。
    expect(src, "後置驗證沒有讀 game shard 的 /healthz —— 拿不到登錄表的真相").toMatch(
      /healthz/,
    );
    expect(src, "沒有檢查 healthz 的 content 區塊").toMatch(/\.get\("content"\)|"content"/);
    // 失敗要 die，不可以只印一行。
    const block = src.slice(src.indexOf("CONTENT_JSON="), src.indexOf("CONTENT_JSON=") + 1600);
    expect(block, "登錄表是骨架時沒有 die —— 一次做錯的部署又會長得跟做對的一樣").toMatch(
      /die "映像的登錄表是骨架/,
    );
    // 舊映像拿不到這一格時要 warn，不可以 die（那會讓正確的部署看起來像壞的）
    // 也不可以 ok（那會讓沒驗到的看起來像驗過）。
    expect(block, "舊映像沒有 content 區塊時應該 warn").toMatch(/warn "/);
    expect(src, "warn() 沒有定義").toMatch(/^warn\(\)/m);
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

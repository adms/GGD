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
    // ⚠️ 這個 `{0,1600}` 是一個**距離啟發式**，2026-08-03 從 400 放寬到 1600。
    // 放寬的是啟發式，**不是要求** —— 要求還是原來那一句：「寫不進去絕對不可以
    // 只印一行字就走人」。die 只是離得更遠了，因為中間多了 GH#269 的自動修
    // （chown → restart → sleep → 重讀 /healthz），而那段本身是下面那條在守。
    expect(
      /REPLAY_WRITABLE[\s\S]{0,1600}die/.test(code),
      "錄影寫不進去時沒有 die —— 那就只是印一行字，等於沒驗。",
    ).toBe(true);
    // 修法要寫在腳本裡（含 uid），因為那是失敗當下唯一會被讀到的地方。
    expect(
      /chown -R 1000:1000/.test(src),
      "腳本裡沒有具體的 chown 修法（含 uid）—— 操作者拿到一個沒有下一步的錯誤。",
    ).toBe(true);
    // ⛔ 保留下來的要求只有一條：**腳本自己不可以提權**。
    //
    // ⚠️ 這裡原本還寫著「腳本自己不可以 chown：**那需要 sudo**」。
    // 那句話今天是假的（第三守則），而且它在這個檔裡躺了一整天：
    // `docker exec -u root ggd-game-1 chown …` 只需要 **docker 權限**
    // （跑得動 compose 的人本來就有），是容器自己的 root 改容器自己的掛載點 ——
    // 那不是主機提權。所以「不可以 chown」從來就不是「不可以 sudo」的推論。
    //
    // 為什麼非拆開不可：owner 2026-08-03 對「請你在主機上跑一次 sudo」的回覆是
    // 「**無法**」。在那個前提下，「腳本只能說出來」＝「這件事永遠不會被修」，
    // 而它已經復發過（目錄擁有者是 65532 —— 更早的映像用的 uid）。
    // 於是 GH#269 讓腳本自己修，而下面這一條**一個字都沒放寬**。
    //
    // ⚠️ 這一條必須把**字串常值**也剝掉才問得對：die 訊息裡會出現要印給人看的
    // 指令字串，那是字，不是會被執行的指令。只剝註解（`code` 做的事）不夠。
    const executable = code.replace(/"(?:[^"\\]|\\.)*"/gs, '""').replace(/'[^']*'/g, "''");
    expect(
      /(^|[;&|]|\bthen\b|\bdo\b)\s*sudo\b/.test(executable),
      "腳本自己跑了 sudo —— 提權不是部署步驟。容器內的 root（docker exec -u root）才是。",
    ).toBe(false);
  });

  it("★ 錄影寫不進去時腳本要**自己修 + 重驗**（GH#269 / owner 2026-08-03 對 sudo 說「無法」）", () => {
    // 舊版這裡只印一行「請 owner 用 sudo chown」。它治不了這個缺陷，因為：
    //   · 根因是**擁有者**（線上量到 65532 —— 更早的映像用的 uid，現在的映像跑
    //     node=1000），手動 chown 一次只治那一次，換映像／重建目錄它就回來；
    //   · owner 對「請你跑一次 sudo」的回覆是「無法」。
    // 兩件事合起來 = 這件事永遠不會被修。守的是「腳本自己動手」這個機制。
    //
    // 範圍限定在錄影那一段，免得抓到腳本別處的 curl / die。
    const from = code.indexOf("REPLAY_WRITABLE=");
    const to = code.indexOf("JS=$(curl");
    expect(from >= 0 && to > from, "找不到錄影檢查那一段").toBe(true);
    const block = code.slice(from, to);

    // ① 真的去修 —— 而且要看**會被執行的**那一版。
    //    ⚠️ 舊的 die 訊息裡就印著一模一樣的 chown 指令，掃全文會把「說出來」
    //    誤判成「做了」（失敗形態 ⑥）。所以這裡把字串常值剝掉再問。
    const blockExec = block.replace(/"(?:[^"\\]|\\.)*"/gs, '""').replace(/'[^']*'/g, "''");
    expect(
      /docker exec[^\n]*-u root[^\n]*\bchown\b[^\n]*1000:1000/.test(blockExec),
      "腳本沒有真的去修擁有者（容器內 root 的 chown）—— 在 owner 說「無法」跑 sudo 之後，" +
        "只把修法印出來等於這件事永遠不會被修。",
    ).toBe(true);

    // ② 修完要**重讀 /healthz 重驗**。這一項才是重點，不是 ①：
    //    只修不驗＝把一個沒驗證的修法當成成功，那正是這個專案一再踩到的形態。
    const chownAt = block.indexOf("chown");
    const recheckAt = block.search(/curl[^\n]*healthz/);
    expect(
      chownAt >= 0 && recheckAt > chownAt,
      "修完沒有再讀一次 /healthz —— 那是把一個沒驗證的修法當成成功，比原本只印一行更糟：" +
        "它會讓一台一場都不會錄到的 shard 通過部署。",
    ).toBe(true);

    // ③ 重驗還是不過，仍然要 die。自動修不可以變成把失敗吞掉。
    //
    // ⚠️ 問的是「**重驗之後有沒有** die」，不是「第一個 die 在不在重驗後面」。
    // 原本寫 `block.indexOf('die "') > recheckAt`，那在 2026-08-04 變成假紅：
    // 自動修前面多了一個 `--verify-only` 專用的 die（煙霧測試不可以重啟 shard，
    // 那會踢掉正在打的人），於是 `indexOf` 先撈到那一個。
    // 兩個 die 都是對的，而這條守衛只該管**後面那一個存不存在**。
    expect(
      block.indexOf('die "', recheckAt) > -1,
      "重驗失敗時沒有 die —— 自動修就變成了一個會吃掉失敗的 fail-open。",
    ).toBe(true);

    // ④ `--verify-only` **不可以**觸發自動修 —— 修法含 `docker restart ggd-game-1`，
    // 而煙霧測試正是你在**有人在線上時**最可能跑的東西。「跑一次檢查可能中斷一場
    // 比賽」不是一個檢查該有的權力；完整部署本來就會重啟，那時候順手修沒有代價。
    //
    // ⚠️ 這一條是 2026-08-04 補的，因為當時實測**把那個閘整段拿掉，12 條測試
    // 照樣全綠** —— 一個可以刪掉而沒有東西會紅的保護，就不是保護（失敗形態 ③）。
    const gateAt = block.indexOf('MODE" = "verify"');
    expect(
      gateAt > -1 && gateAt < block.indexOf("docker exec -u root"),
      "自動修前面沒有 --verify-only 的閘 —— 跑一次煙霧測試會重啟 shard，把正在打的人踢掉。",
    ).toBe(true);

    // ⛔ 不可以用 chmod 777 —— 錄影檔帶著每一位玩家的顯示名稱。
    expect(/chmod\s+0?777\b/.test(code), "用了 chmod 777 —— 錄影檔帶著玩家顯示名稱。").toBe(false);
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

  it("★ 磁碟閘：build 開始**之前**就要說得出「這台機器建不完」（2026-08-16 的 502）", () => {
    // 那次一支被 SIGPIPE 打斷的 build 把 build cache 養到 80GB → docker 的碟撞 100%
    // → 之後每一次 build 都必定失敗 → edge 容器消失、game 進重啟迴圈 → 網站 502。
    //
    // ⚠️ 這一條守的**不是**「有沒有清快取」。清快取只是手段，而且清完隔天照樣會長回來。
    // 守的是三個關係，每一個都對應那次事故的一個環節：

    // ① 上限是**位元組**，不是天數。
    //    `--filter until=<天數>` 是對「一天發幾版」的假設，而 2026-08-05 發過 5 版 ——
    //    同一個 168h 在那一天什麼都擋不住。位元組上限不管頻率都成立。
    expect(
      /--max-used-space/.test(code),
      "build cache 沒有位元組上限 —— 只用天數過濾是在假設部署頻率，那個假設破過。",
    ).toBe(true);

    // ② 量的是 **docker 自己的碟**，不是 `/`。
    //    這台的 data-root 是 /data/docker（sdb），而 / 是另一顆。2026-08-16 我第一次
    //    回報就讀了 `/` —— 那顆碟從頭到尾都是 11%，於是我對 owner 講了一個假的根因。
    //    ⭐ 突變點：把 `$DOCKER_ROOT` 換成 `/` 這一條就要紅。
    expect(
      /DockerRootDir/.test(code) && /df\s+-Pk\s+"\$DOCKER_ROOT"/.test(code),
      "剩餘空間量的不是 docker 的 data-root —— 量錯一顆碟等於沒量。",
    ).toBe(true);

    // ③ ⭐ 閘在 **pull 之前**。這一條是這整段的承重點：
    //    `content/` 是 live bind-mount。先 pull 成功、再讓 build 死在沒空間，
    //    得到的是「新內容 + 舊映像」—— 那正是 2026-08-02 那次生產故障的組合。
    //    磁碟不夠的時候，線上那一版必須**一個位元組都沒被動到**。
    const gateAt = code.indexOf("MIN_FREE_GB");
    const pullAt = code.indexOf("git fetch --tags");
    const buildAt = code.indexOf("--env-file \"$ENV_FILE\" build");
    expect(gateAt > -1, "找不到磁碟閘").toBe(true);
    expect(
      gateAt < pullAt && gateAt < buildAt,
      "磁碟閘跑在 pull／build 後面 —— 那就會先把 content/ 換成新的再讓 build 失敗，" +
        "留下「新內容 + 舊映像」這個沒人測過、而且已經害網站掛過一次的組合。",
    ).toBe(true);

    // 空間不夠要 die。印一行警告然後照樣 build = 這個閘不存在。
    expect(
      /FREE_GB[\s\S]{0,300}die "磁碟不夠/.test(code),
      "空間不夠時沒有 die —— 那就只是印一行字，等於沒驗。",
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

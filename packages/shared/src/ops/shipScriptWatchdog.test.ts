/**
 * ⏲️ **`ship:check` 的看門狗守衛** —— GH#858
 *
 * > 票文：「ship:check 併行段穩定卡死 shared/client，而序列跑 100% 綠
 * >  —— ⭐ 而卡死遮住過真紅」
 *
 * ⭐ **這一條的價值不在「讓它不卡」,在「卡死不可以看起來像綠燈」。**
 * 一個卡住的閘與一個綠的閘,在「我等不下去所以 kill 掉」之後**長得一模一樣** ——
 * 而被 Ctrl-C 掉的那一次,帳本上**什麼都沒有**。
 *
 * ── 量到的基線（2026-08-30,`docs/_data/deploy-timings.json` 60 次上架）──────
 *   · 正常:`vitest packages/shared` 225–283s（且在長大）· `apps/client` 229–283s
 *   · 08-28 11:40 / 11:51 / 12:04 / 12:18 **連續四次**兩支一起在 300s 地板被砍記 `hung`
 *   · 而同一支在 05:37 / 05:46 / 06:56 是 `code 1` —— ⭐ **真的有測試在紅,
 *     然後那個紅被「hung」蓋掉了**（它根本沒跑到自己的結論）
 *
 * ── ⛔ 三個缺陷（⛔ 不是一個）───────────────────────────────────────────────
 *   ① `estMs` 是死參數 ⇒ 上限永遠是 5 分鐘地板 ⇒ 健康的 283s suite 被誤殺
 *   ② `p.kill()` 只殺直屬子（`npm exec`）⇒ 孫（`node (vitest)`）握著 pipe
 *      ⇒ `'close'` 不來 ⇒ Promise 不 resolve ⇒ **看門狗開火之後 ship.mjs 靜靜卡死**
 *   ③ 開火的訊息只進 log 不進終端 ⇒ 卡死期間跟「還在跑」長得一樣
 *
 * ⚠️ ⭐ **這一條跑的是出貨的那一支 `ship.mjs`**（失敗形態⑤：⛔ 不自己重寫一份 `run()`
 *    再對著它斷言 —— 那是一個虛構的通道）。把地板調到極小,讓看門狗**真的**開火。
 *
 * 🚨 承重那一條 ＝ **「它會結束」**。突變:把 `run()` 裡的寬限收尾拿掉
 *    (`grace = setTimeout(() => settle(124, …))`) ⇒ `close` 不來 ⇒ 這一條逾時而紅。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const SHIP = join(REPO, "tools/parallel-gates/ship.mjs");
const code = readFileSync(SHIP, "utf8");

describe("ship:check 看門狗（GH#858）", () => {
  it(
    "★★ 逾時 ⇒ **會結束** · 非零離開碼 · 輸出裡指名那一支（⛔ 不可以看起來像綠燈）",
    () => {
      // ⭐⭐ **地板 4 秒，⛔ 不是 1 毫秒** —— 這一格是這條守衛的成敗。
      //     ⚠️ 第一版寫 1ms，於是每一支都在 `npm exec` **還沒生出 `node (vitest)` 之前**
      //     就被殺掉 ⇒ **根本沒有孫行程可以變孤兒** ⇒ 缺陷原樣的版本也是綠的
      //     （CLAUDE.md 失敗形態⑩：夾具用了一個極端值，正好落在門檻的另一邊）。
      //     ⇒ 4 秒讓整棵樹（`npm exec` → `node (vitest)` → forks）**先長出來**，再開火。
      // ⭐ `--no-sync` ⇒ ⛔ 不碰序列段（那一段寫 bundle.json,全域只能一條）。
      const t0 = Date.now();
      const r = spawnSync("node", [SHIP, "--no-sync", "--no-typecheck", "--suites", "apps/test-dashboard"], {
        cwd: REPO,
        encoding: "utf8",
        env: {
          ...process.env,
          GGD_SHIP_WATCHDOG_FLOOR_MS: "4000",
          GGD_SHIP_WATCHDOG_MULT: "0", // ⭐ 估時仍然會被印出來 ⇒ 第⑤條照樣驗得到
          GGD_SHIP_WATCHDOG_GRACE_MS: "3000",
          GGD_SHIP_LOGDIR: "/private/tmp/ggd-ship-watchdog-test",
          GGD_SHIP_NO_LEDGER: "1", // ⛔ 乾跑不寫帳本 —— KEEP_RUNS=60,每跑一次守衛就會擠掉一筆真的部署紀錄
        },
        timeout: 90_000,
        killSignal: "SIGKILL",
      });

      // ① ⭐⭐ 承重：**它結束了**。`signal` 非空 ＝ spawnSync 自己逾時把它殺掉 ＝ ship.mjs 卡死了。
      expect(
        r.signal,
        "⛔ ship.mjs 沒有自己結束（被 spawnSync 逾時殺掉）—— 看門狗開火之後仍然在等 'close'，" +
          "而那正是 GH#858 的症狀：卡死與綠燈長得一模一樣。",
      ).toBeNull();

      // ①b ⭐⭐ **而且要「馬上」結束** —— ⛔ 不是「等孤兒自己跑完」。
      //     ⚠️ 這一句是這條守衛真正的刀口：只斷言「它結束了」是**驗不出缺陷的** ——
      //     缺陷原樣的版本最後也會結束（孤兒 `go test`／`skills:check` 自己跑完 ⇒ pipe 關 ⇒
      //     `close` 才來），只是要等 40–120s。⭐ 那正是 GH#858：**看門狗開火了而它還在等**。
      //     ⇒ 判準是**開火到收工的距離**，⛔ 不是「有沒有收工」。
      //     實測：殺得掉整組 ⇒ 全程 ~1.4s；殺不掉（只殺直屬子）⇒ 被 `go test (platform)`
      //     的孤兒綁住 40–120s（帳本量到 121.8s）。
      const elapsed = Date.now() - t0;
      expect(elapsed, "整支 ship.mjs 還在等孤兒").toBeLessThan(30_000);

      // ⭐⭐ 真正的刀口：**逐支**「開火 → 收工」的距離。
      //    看門狗在 4.0s 開火 ⇒ 殺得掉整組的話,每一支記錄到的時間就是 ~4.0s;
      //    殺不掉的話,它要**等孤兒自己跑完**才等得到 `close`。
      //    ⭐ 這正是帳本上的指紋：**300s 開火,而記錄到 416s / 426s**。
      //    量到的兩個點（2026-08-30）：修好 ~4.1s · GH#858 原樣 **7.5s / 9.0s**。
      const jobSecs = [...`${r.stdout}`.matchAll(/^ {3}[✓✗] .+? (\d+\.\d)s$/gm)].map((m) => Number(m[1]));
      expect(jobSecs.length, "解析不到逐支耗時 —— ship.mjs 的輸出格式變了").toBeGreaterThan(2);
      const worst = Math.max(...jobSecs);
      expect(
        worst,
        `⛔ 有一支在看門狗開火(4.0s)之後又拖了 ${(worst - 4).toFixed(1)}s 才收工 —— ` +
          "它在**等孤兒**（SIGKILL 只打到 `npm exec`，孫還握著 stdout pipe）。" +
          "⭐ 這就是帳本上「300s 開火而記錄 416s」的形狀，也是 GH#858 卡死的來源。",
      ).toBeLessThanOrEqual(6.5);

      // ② 非零離開碼（⛔ 逾時不可以是 0）
      expect(r.status, "逾時卻回 0 —— 那就是「卡死看起來像綠燈」").not.toBe(0);

      const all = `${r.stdout}\n${r.stderr}`;
      // ③ 開火的訊息要出現在**終端輸出**（⛔ 不是只寫進 log 檔）
      expect(all, "看門狗開火了卻沒有印到終端 —— 卡死期間跟『還在跑』長得一樣").toContain("看門狗");
      // ④ 逐支指名：失敗表裡要有帶 hung 標記的那一支
      expect(all, "沒有指名是哪一支 hung").toMatch(/hung,看門狗殺的/);
      // ⑤ ⭐ 估時**真的**是從帳本讀的（缺陷①）：訊息要印得出一個非零的估時。
      //    ⛔ `estMs` 沒接上時這裡永遠是 `帳本估 0s`。
      const est = [...all.matchAll(/帳本估 (\d+)s/g)].map((m) => Number(m[1]));
      expect(est.length, "訊息裡沒有帳本估時 —— estMs 沒有被印出來").toBeGreaterThan(0);
      expect(
        Math.max(...est),
        "每一支的帳本估時都是 0 —— `estimateMs()` 沒有真的讀到 deploy-timings.json（缺陷①原樣還在）",
      ).toBeGreaterThan(0);
    },
    120_000,
  );

  it("★ 殺的是**整個 process group**（⛔ 只殺直屬子 ＝ 孫握著 pipe ⇒ close 不來）", () => {
    // 2026-08-30 在真的跑裡量到的樹：ship.mjs → `npm exec vitest`（直屬子）→ `node (vitest)` → forks。
    expect(
      /detached: true/.test(code),
      "spawn 沒有 detached ⇒ 子行程不自成 process group ⇒ 殺不到孫 ⇒ 孤兒握著 pipe 而 'close' 永遠不來。",
    ).toBe(true);
    expect(
      /process\.kill\(-pid/.test(code),
      "沒有用負號 pid 殺整組 —— `p.kill()` 只殺得到 `npm exec` 那一層。",
    ).toBe(true);
    // 而 detached 之後 Ctrl-C 不再自動傳下去 ⇒ 必須自己收（⛔ 不然會留一地孤兒 vitest 吃 CPU）。
    expect(/SIGINT/.test(code), "detached 之後沒有接 SIGINT —— Ctrl-C 會留下一堆孤兒 vitest").toBe(true);
  });

  it("★ 估時真的傳進 run()（⛔ 兩個呼叫點都只傳三個引數 ＝ 缺陷①）", () => {
    // ⚠️ 這是掃字串,但它守的是**接線**（一行沒接 ⇒ 整個功能靜默消失,失敗形態③）——
    //    行為那一層由上面第一條真的跑起來驗。
    const calls = [...code.matchAll(/await run\(([^;]*?)\);/g)].map((m) => m[1]);
    expect(calls.length, "找不到 run() 的呼叫點").toBeGreaterThan(1);
    for (const c of calls) {
      expect(c, `run() 的呼叫點沒有傳估時: run(${c}) —— 上限會永遠停在地板`).toContain("estimateMs(");
    }
  });

  it("★ 帳本只有一個住處 —— ship.mjs 讀的與 run.mjs 寫的是同一個檔", () => {
    // ⭐ 第〇·四守則：`estimateMs()` 自己開了一條讀路徑,那條路徑⛔ 不可以跟寫入端漂掉。
    const runMjs = readFileSync(join(REPO, "tools/deploy-timing/run.mjs"), "utf8");
    const rel = "docs/_data/deploy-timings.json";
    expect(code, "ship.mjs 沒有指向帳本").toContain(rel);
    expect(
      runMjs,
      `帳本的寫入端已經不在 ${rel} 了 —— ship.mjs 的 estimateMs() 會靜靜讀到一個不存在的檔,` +
        "然後每一支的估時都回 0（＝退回缺陷①的地板行為，⛔ 而且不會有東西紅）。",
    ).toContain(rel);
    expect(existsSync(join(REPO, rel))).toBe(true);
  });

  it("★ 地板抬高了 —— 一支正常 283s 的 suite ⛔ 不可以被判死", () => {
    // ⭐ 從**帳本**推導,⛔ 不抄一個字面值（那會是第二個住處,而且它一定過期）。
    const led = JSON.parse(readFileSync(join(REPO, "docs/_data/deploy-timings.json"), "utf8")) as {
      runs: { stages: { name: string; ms: number }[] }[];
    };
    const healthy: number[] = [];
    for (const r of led.runs) {
      for (const s of r.stages) {
        // ⚠️ 被砍過的那幾筆名字帶「hung」⇒ 它們是另一個 key,⛔ 不算進「正常要多久」。
        if (/^ship:vitest /.test(s.name) && !s.name.includes("hung")) healthy.push(s.ms);
      }
    }
    expect(healthy.length, "帳本裡沒有 vitest 的紀錄").toBeGreaterThan(5);
    const worstHealthy = Math.max(...healthy);
    const floor = Number(/GGD_SHIP_WATCHDOG_FLOOR_MS \?\? (\d+) \* 60 \* 1000/.exec(code)?.[1] ?? 0) * 60_000;
    expect(floor, "找不到看門狗地板").toBeGreaterThan(0);
    expect(
      floor,
      `地板 ${(floor / 60000).toFixed(0)}m 低於帳本量到的最慢一支健康 suite ` +
        `${(worstHealthy / 1000).toFixed(0)}s —— 那就是 08-28 連續四次誤殺的形狀（假紅蓋掉真紅）。`,
    ).toBeGreaterThan(worstHealthy);
  });
  it("★ `scripts/watchdog.sh` 的 wall 上限也要大於帳本裡最慢的**健康**整跑", () => {
    // ⭐ 同一個病的第二個住處（GH#858 順手量到）：一個寫死的上限坐在一個會長大的
    //    實測值旁邊。8 分鐘（480s）vs 健康最慢 463s ⇒ 餘裕只有 3.5%
    //    ⇒ `bash scripts/watchdog.sh -- pnpm ship:check` 遲早在**健康的跑**上開火,
    //      而 exit 124 跟「閘紅了」⛔ 分不出來。
    // ⚠️ 從帳本推導,⛔ 不抄字面值（抄了就是第三個住處,而它一定過期）。
    const sh = readFileSync(join(REPO, "scripts/watchdog.sh"), "utf8");
    const limitMin = Number(/^LIMIT_MIN=(\d+)$/m.exec(sh)?.[1] ?? 0);
    expect(limitMin, "找不到 watchdog.sh 的 LIMIT_MIN").toBeGreaterThan(0);
    const led = JSON.parse(readFileSync(join(REPO, "docs/_data/deploy-timings.json"), "utf8")) as {
      runs: { stages: { name: string; ms: number }[] }[];
    };
    const totals: number[] = [];
    for (const r of led.runs) {
      // ⚠️ 被看門狗砍過的那幾次整跑,長度是「假的」（它們是被截斷的）⇒ ⛔ 不算進「健康」。
      const hung = r.stages.some((x) => x.name.includes("hung"));
      for (const x of r.stages) if (x.name === "ship:total" && !hung) totals.push(x.ms);
    }
    expect(totals.length, "帳本裡沒有健康的 ship:total").toBeGreaterThan(5);
    const worst = Math.max(...totals);
    expect(
      limitMin * 60_000,
      `watchdog.sh 的 ${limitMin} 分鐘上限 ≤ 帳本量到最慢的健康整跑 ${(worst / 1000).toFixed(0)}s ` +
        "—— 它會在健康的跑上開火,而那個假紅跟真紅長得一模一樣（＝GH#858 的病）。",
    ).toBeGreaterThan(worst);
  });
});

/**
 * ⏲️ GH#1257 —— vitest 卡死（整棵樹 CPU≈0）時，**從出貨入口啟動**也要自己停下來。
 *
 * 09-13 背景全套在 0% CPU 卡了 4 小時 48 分：`scripts/watchdog.sh` 早就有了，⛔ 但沒有入口預設經過它。
 * 這一條真的把入口跑起來（⛔ 不自己重寫偵測邏輯 —— 失敗形態⑤），**兩個方向**都驗：
 *   · 閒置卡死夾具（worker 同步阻塞＋一個孫行程）經 `npx vitest run` 與 `pnpm --dir packages/shared test`
 *     ⇒ 離開碼 125、輸出指名那個檔、整棵樹收乾淨、開火到收工夠短（只斷言「它結束了」驗不出看門狗還握著 pipe）；
 *   · 燒 CPU 而且跑得比判死門檻還久的夾具 ⇒ ⛔ 不被殺（一把只驗單邊的尺不算自證過）。
 * 設定是出貨的 `packages/shared/vitest.config.ts`；門檻用 `GGD_WATCHDOG_IDLE_SEC` 縮短，⛔ 不抄預設值。
 * 突變（2026-09-15）：刪掉 attach 模式「先 SIGKILL 子孫」⇒ 只有殘留斷言紅。修正輪：離開碼原本只斷言 ≠0／≠1，
 *   審查拿掉 globalSetup 的 SIGUSR2→exit(125) 仍綠 ⇒ 改成直接斷言 125。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHARED = join(REPO, "packages/shared");
const FIXTURES = ["--config", join(REPO, "tools/vitest-watchdog/fixtures/vitest.config.ts")];
const IDLE_SEC = 10;

/** 外層的開關⛔ 不可以漏進來：ship.mjs 底下是「只記錄」，那樣夾具就不會被殺。 */
const env = (extra: Record<string, string>) => {
  const e: NodeJS.ProcessEnv = { ...process.env, GGD_WATCHDOG_IDLE_SEC: String(IDLE_SEC), ...extra };
  for (const k of ["GGD_VITEST_WATCHDOG_OFF", "GGD_VITEST_WATCHDOG_RECORD_ONLY", "GGD_VITEST_WATCHDOG_PID"]) delete e[k];
  return e;
};

function run(cmd: string, args: string[], extra: Record<string, string>) {
  return new Promise<{ code: number | null; out: string; fireToClose: number }>((done) => {
    const p = spawn(cmd, args, { cwd: SHARED, env: env(extra) });
    let out = "";
    let firedAt = Number.NaN; // 看門狗第一行訊息到達的那一刻（沒開火 ⇒ NaN ⇒ 距離斷言也紅）
    const take = (d: Buffer) => {
      out += d;
      if (Number.isNaN(firedAt) && out.includes("⏲️ 看門狗：")) firedAt = Date.now();
    };
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    p.on("close", (code) => done({ code, out, fireToClose: Date.now() - firedAt }));
  });
}

const alive = (pid: number) => {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
};

it("閒置卡死從兩個入口都會被收掉；燒 CPU 的慢測試不會", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-vitest-watchdog-"));
  const hang = async (cmd: string, args: string[], tag: string) => {
    const pidFile = join(dir, tag);
    const r = await run(cmd, [...args, ...FIXTURES, "idleHang"], { GGD_WATCHDOG_FIXTURE_PIDS: pidFile });
    const pids = readFileSync(pidFile, "utf8").split(" ").map(Number);
    // 殺掉的 worker 要等主行程走了才被收屍 ⇒ 給兩秒；沒被殺的（Atomics.wait／sleep 600）等多久都還在
    for (let i = 0; i < 20 && pids.some(alive); i++) await new Promise((ok) => setTimeout(ok, 100));
    return { ...r, tag, residual: pids.filter(alive) };
  };
  const [viaNpx, viaPnpm, busy] = await Promise.all([
    hang("npx", ["vitest", "run"], "npx"),
    hang("pnpm", ["--dir", SHARED, "test", "--"], "pnpm"),
    run("npx", ["vitest", "run", ...FIXTURES, "busySlow"], { GGD_WATCHDOG_FIXTURE_BURN_MS: String((IDLE_SEC + 5) * 1000) }),
  ]);
  console.info(`開火→收工：npx ${viaNpx.fireToClose}ms · pnpm ${viaPnpm.fireToClose}ms`); // CI 上的時序證據
  for (const r of [viaNpx, viaPnpm]) {
    expect(r.code, `${r.tag}：卡死要回 125（globalSetup 收到 SIGUSR2 的 exit；⛔ 與「測試紅」的 1、被訊號殺的 137 分得開）\n${r.out}`).toBe(125);
    expect(r.out, `${r.tag}：輸出要指名卡住的檔`).toContain("idleHang.fixture.ts");
    expect(r.residual, `${r.tag}：看門狗開火之後這次執行的 worker／孫行程還活著`).toEqual([]);
    // fire() 等主行程走最多 2 秒才硬收 ⇒ 到 2 秒就是主行程沒理 SIGUSR2，或看門狗還握著 stdout 沒放（shipScriptWatchdog 的刀口）
    expect(r.fireToClose, `${r.tag}：開火之後拖了 ${r.fireToClose}ms 才收工`).toBeLessThan(2000);
  }
  expect(busy.code, `燒 CPU 的慢夾具被當成卡死殺掉了\n${busy.out}`).toBe(0);
}, 240_000);

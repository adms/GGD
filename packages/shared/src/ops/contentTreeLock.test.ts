/**
 * ⭐⭐ **內容樹的讀寫鎖真的互斥**（GH#950）。
 *
 * ── 它在防什麼（2026-09-02 量到，⛔ 不是推測）──────────────────────────────
 *
 * | 怎麼跑 | 結果 |
 * |---|---|
 * | `pnpm -s speedlists:check` 直接跑 | ⭐ **EXIT=0** |
 * | `npx vitest run --dir apps/admin` | ⭐ 1305 全綠 |
 * | `npx vitest run --dir apps` | ⛔ **紅** —— 「speedlists:check 過期」 |
 *
 * ⭐ 干擾源（指名）：`apps/content-api/src/editorSourceSurvivesSync.test.ts`
 * 真的改一份來源檔，然後真的跑 `skillremake:json` · `tiers:apply` ·
 * `skillremake:provenance` —— ⭐ 它們**成批重寫 `content/abilities/*.json`**。
 * ⚠️ 而 vitest **檔案之間是並行的** ⇒ 另一支測試的 `--check` 可能正好讀到
 * 一棵寫到一半的樹 ⇒ ⭐ 一個**假的「過期」**。
 *
 * ⛔ 而那個訊息指著錯方向（「跑 build 然後 git add」——照做會產出**位元組相同**的檔）。
 *
 * ── ⭐ 這條守衛為什麼跑真的 process ──────────────────────────────────────
 *
 * ⛔ 「腳本裡有沒有提到 flock」是掃字串（失敗形態⑥）。
 * ⭐ 互斥是一個**兩個 process 之間的關係** ⇒ 只有真的開兩個才量得到。
 */
import { describe, it, expect } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOCK = join(ROOT, "scripts/content-tree-lock.py");

/** 拿著鎖睡 `ms` 毫秒的 child。 */
function holder(mode: "read" | "write", ms: number) {
  return spawn("python3", [LOCK, mode, "--", "python3", "-c", `import time;time.sleep(${ms / 1000})`], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

/** 試著拿鎖並馬上離開，回傳等了多久（毫秒）。 */
function timeToAcquire(mode: "read" | "write"): number {
  const t0 = Date.now();
  const r = spawnSync("python3", [LOCK, mode, "--", "true"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GGD_CONTENT_LOCK_TIMEOUT: "30" },
  });
  expect(r.status, `拿 ${mode} 鎖失敗：${r.stderr}`).toBe(0);
  return Date.now() - t0;
}

describe("內容樹的讀寫鎖（GH#950）", () => {
  it("⭐ 儀器：沒有人持鎖時，拿鎖幾乎不用等（⛔ 否則下面量的是啟動時間）", () => {
    const solo = timeToAcquire("write");
    expect(solo, `⛔ 沒有競爭卻等了 ${solo}ms —— 這條測的基線就是壞的`).toBeLessThan(2000);
  });

  it("⭐⭐ **寫**的時候，另一個**寫**必須等（⛔ 這就是那個 race 的形狀）", async () => {
    const h = holder("write", 1200);
    await new Promise((r) => setTimeout(r, 300)); // 讓 holder 真的拿到
    const waited = timeToAcquire("write");
    h.kill();
    expect(
      waited,
      `⛔ 另一個寫者**沒有等**（${waited}ms）⇒ 兩支產生器可以同時重寫 content/**`,
    ).toBeGreaterThan(400);
  });

  it("⭐⭐ **寫**的時候，**讀**（`--check`）也必須等 —— ⭐ 這是假紅燈的直接成因", async () => {
    const h = holder("write", 1200);
    await new Promise((r) => setTimeout(r, 300));
    const waited = timeToAcquire("read");
    h.kill();
    expect(
      waited,
      `⛔ \`--check\` **沒有等**（${waited}ms）⇒ 它會讀到一棵寫到一半的樹 ⇒ 假的「過期」`,
    ).toBeGreaterThan(400);
  });

  it("⭐ 兩個**讀**可以同時（⛔ 否則 36 支 --check 會被串成一列）", async () => {
    const h = holder("read", 1200);
    await new Promise((r) => setTimeout(r, 300));
    const waited = timeToAcquire("read");
    h.kill();
    expect(
      waited,
      `⛔ 兩個唯讀的 check 互相擋住了（${waited}ms）⇒ 共享鎖退化成獨佔`,
    ).toBeLessThan(400);
  });

  it("⭐ 逃生口關掉鎖時**不會靜默** —— 它就是直接跑（⛔ 不是假裝拿到了）", () => {
    const r = spawnSync("python3", [LOCK, "write", "--", "echo", "ok"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GGD_CONTENT_LOCK_OFF: "1" },
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("ok");
  });

  it("⭐⭐ 包裝器**不吞離開碼** —— ⛔ 這才是「假紅燈換成假綠燈」的真風險", () => {
    // ⚠️ 這一條取代了「蓄意讓產物過期」那個驗收：genguard **正確地**擋下了
    // 手改產物（⭐ 而我沒有繞過它）。⇒ 改驗**等價且更承重**的性質 ——
    // ⭐ 一個會把 `--check` 的非零吃掉的包裝器，會讓**每一個**真的過期都變成綠的。
    for (const wrapper of [
      ["python3", [LOCK, "read", "--", "bash", "-c", "exit 3"]] as const,
      ["bash", [join(ROOT, "scripts/gencheck.sh"), "bash", "-c", "exit 3"]] as const,
    ]) {
      const r = spawnSync(wrapper[0], wrapper[1] as unknown as string[], {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(
        r.status,
        `⛔ ${wrapper[0]} 把子指令的離開碼 3 吃掉了（得到 ${r.status}）⇒ ` +
          "⭐ 每一個真的過期都會變成綠的。",
      ).toBe(3);
    }
  });

  it("⭐ `genrun.sh` 與 `gencheck.sh` 真的走這把鎖（⛔ 不是各自實作一份）", () => {
    const read = (p: string): string =>
      spawnSync("cat", [join(ROOT, p)], { encoding: "utf8" }).stdout;
    expect(read("scripts/genrun.sh")).toContain("content-tree-lock.py write");
    expect(read("scripts/gencheck.sh")).toContain("content-tree-lock.py read");
    // ⚠️ ⛔ 巢狀時不可以再拿一次 —— flock 是 per-fd，第二次獨佔會**死鎖**。
    expect(read("scripts/genrun.sh")).toContain("GGD_CONTENT_LOCK_HELD");
  });
});

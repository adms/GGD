/**
 * 守衛：`--check` 在交付物過期時必須回**非零**。
 *
 * 這條在防的是唯一會真正傷到人的失敗：能力清單跨到另一個專案之後**靜悄悄地過期**，
 * 對面照著舊清單做了一批技能，上線才發現 capability 不存在。
 *
 * ⚠️ 刻意**執行那支腳本**（`npx tsx export.ts`）而不是掃它的原始碼 ——
 * 掃字串是 CLAUDE.md 失敗形態 ⑥：有人把比對拿掉、把 `process.exit` 留著，掃描照樣綠。
 * 突變點：把 `run()` 裡 `--check` 的 `stale` 分支改成永遠 `code: 0`，第 3 條必紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "export.ts");
const JSON_NAME = "ggd-runtime-capabilities.json";

let box: string;
beforeAll(() => (box = mkdtempSync(join(tmpdir(), "ggd-caps-"))));
afterAll(() => rmSync(box, { recursive: true, force: true }));

function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", SCRIPT, ...args], {
      cwd: HERE,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("能力清單匯出 (capability-export)", () => {
  it("交付物不存在時 --check 就回非零 —— 缺席也是一種過期", () => {
    expect(run("--check", "--out-dir", box).code).not.toBe(0);
  });

  it("匯出之後 --check 是綠的 —— 沒有這條,下一條可能只是它永遠都紅", () => {
    expect(run("--out-dir", box).code).toBe(0);
    expect(run("--check", "--out-dir", box).code).toBe(0);
  });

  it("★ 交付物過期時 --check 回非零,而且訊息指名那個檔", () => {
    const victim = join(box, JSON_NAME);
    const good = readFileSync(victim, "utf8");
    // 模擬「引擎變了但沒重新匯出」：磁碟上那份跟現在算出來的不一樣。
    writeFileSync(victim, good.replace(/"fingerprint": "[^"]+"/, '"fingerprint": "deadbeef"'));

    const r = run("--check", "--out-dir", box);
    expect(r.code, "交付物已經跟引擎不一致,--check 仍然說 OK").not.toBe(0);
    // 斷言訊息指名那個檔而不只是「有失敗」—— 過期的是哪一份是修它的第一個資訊。
    expect(r.out).toContain(JSON_NAME);

    writeFileSync(victim, good);
    expect(run("--check", "--out-dir", box).code, "還原之後應該恢復綠燈").toBe(0);
  });

  it("★ 出貨的那一份（repo 預設路徑）必須是最新的 —— 這就是 CI 閘", () => {
    const r = run("--check");
    expect(r.code, `${r.out}\n→ 跑 npx tsx tools/capability-export/export.ts 並 commit 產物`).toBe(0);
  });

  it("⭐ #467 交件形狀那一節不可以被刪掉 —— --check 對「整節消失」是綠的", async () => {
    // ⚠️ `--check` 只問「產出 == 磁碟」。把 `parallelOutputSection()` 的呼叫拿掉，
    //    重新匯出之後兩者仍然一致 ⇒ 整節無聲消失而所有測試全綠（失敗形態③）。
    //    ⛔ 所以這裡釘的是**那句規則本身**，不是「有沒有第 10 節」。
    const { renderMarkdown } = await import("./export");
    const { buildCapabilityManifest } = await import("../../packages/shared/src/content/editorCapabilities");
    expect(renderMarkdown(buildCapabilityManifest())).toContain("一個產物只能有一個產生器寫");
  });

  it("內部字串外洩會被擋下 —— 對方讀不懂我們的交接文件與部署主機", async () => {
    const { assertNoInternalLeaks } = await import("./export");
    expect(assertNoInternalLeaks("見 docs/_execution-batches.md", "x")).toHaveLength(1);
    expect(assertNoInternalLeaks("見計畫 §12 G4 與 issue #284", "x")).toHaveLength(0);
  });
});

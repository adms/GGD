/**
 * `pnpm content:build` 必須先驗證再寫入 (build-indexes-validates).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條守衛在防哪一件事
 *
 * CLAUDE.md 對每一個貢獻者的要求是「每一次 content/ 編輯都要跑 pnpm content:build」。
 * 在 2026-08-01 之前，那個指令**完全不驗證** —— `scripts/buildIndexes.ts` 只重建索引，
 * 對 schema 拒絕的內容照樣 EXIT 0。Zod 的上下界是真的，但只在 `ContentLoader.load()`
 * 執行時才跑，也就是等到某條剛好用嚴格載入器的測試才會踩到。
 *
 * 於是流程變成：寫爆 authoringNote 的 2000 字上限 → content:build 說沒事 → 幾分鐘後
 * 一條無關的測試爆掉，而且**第一行錯誤指的是別的道具**（參照不到那份載入失敗的文件）。
 * 同一個下午有兩位作者踩到同一個坑，兩次都要反向追。**只在遠離現場的地方響的警報
 * 不是守衛。**
 *
 * ⚠️ 這條測試刻意**執行那支腳本**而不是掃它的原始碼。掃 `grep ContentLoader`
 * 是 CLAUDE.md 失敗形態 ⑥（用掃字串代替跑行為）—— 有人把 import 留著、把 try/catch
 * 拿掉，掃描照樣綠。
 *
 * ⚠️ 也刻意斷言「索引沒有被重寫」。只斷言離開碼非 0 的話，一個「先寫入、再抱怨」的
 * 實作會過 —— 而那正是把不可載入的文件烘進 bundle、送進容器的那條路。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(PKG, "scripts/buildIndexes.ts");
const REAL_CONTENT = join(PKG, "../../content");

/** A doc whose `authoringNote` ceiling is the one that actually bit, twice. */
const VICTIM = "items/godie-i016.json";

let sandbox: string;

beforeAll(() => {
  // 一份真的 content/ 拷貝。用出貨樹而不是手捏 fixture:失敗形態 ⑤ —— 被測的必須是
  // 出貨的那一個,包括它真正的參照網,因為串連錯誤正是原本讓人追錯方向的東西。
  sandbox = mkdtempSync(join(tmpdir(), "ggd-buildidx-"));
  cpSync(REAL_CONTENT, sandbox, { recursive: true });
});
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function runBuild(dir: string): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", SCRIPT], {
      cwd: PKG,
      env: { ...process.env, GGD_CONTENT_DIR: dir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("pnpm content:build 先驗證再寫入 (build-indexes-validates)", () => {
  it("乾淨的樹會通過 —— 沒有這一條,下面那條可能只是它永遠都失敗", () => {
    cover("build-indexes-validates");
    expect(runBuild(sandbox).code, "出貨的 content/ 本身就過不了驗證").toBe(0);
  });

  it("★ 超過上界的欄位讓 build 失敗,而且訊息指名那個檔與那個欄位", () => {
    cover("build-indexes-validates");
    const victim = join(sandbox, VICTIM);
    const doc = JSON.parse(readFileSync(victim, "utf8")) as { authoringNote: string };
    const original = doc.authoringNote;
    doc.authoringNote = original + "x".repeat(400); // 2000 字上限
    writeFileSync(victim, JSON.stringify(doc, null, 2) + "\n");

    const r = runBuild(sandbox);
    // 突變點就是 buildIndexes.ts 的那個 try/catch:拿掉它,這一行就會拿到 0。
    expect(r.code, "寫爆上界之後 content:build 仍然回報成功").not.toBe(0);
    // 斷言訊息指名 VICTIM 與欄位,而不只是「有失敗」—— 原本讓人追錯方向的,
    // 正是第一行錯誤指著別的道具 (失敗形態 ④:斷言方向跟缺陷無關)。
    expect(r.out).toContain("godie-i016");
    expect(r.out).toContain("authoringNote");

    writeFileSync(victim, JSON.stringify({ ...doc, authoringNote: original }, null, 2) + "\n");
    expect(runBuild(sandbox).code, "還原之後應該恢復綠燈").toBe(0);
  });

  it("★ 驗證失敗時索引與 bundle 完全沒有被改動", () => {
    cover("build-indexes-validates");
    const bundle = join(sandbox, "bundle.json");
    expect(existsSync(bundle), "sandbox 沒有 bundle.json,這條測不到東西").toBe(true);
    const before = readFileSync(bundle, "utf8");

    const victim = join(sandbox, VICTIM);
    const doc = JSON.parse(readFileSync(victim, "utf8")) as { authoringNote: string };
    const original = doc.authoringNote;
    writeFileSync(
      victim,
      JSON.stringify({ ...doc, authoringNote: original + "x".repeat(400) }, null, 2) + "\n",
    );

    expect(runBuild(sandbox).code).not.toBe(0);
    // 「先寫入再抱怨」會讓上面那條過、這一條紅。不可載入的文件烘進 bundle
    // 就是它進到容器的那條路。
    expect(readFileSync(bundle, "utf8"), "驗證失敗了,bundle 還是被重寫了").toBe(before);

    writeFileSync(victim, JSON.stringify({ ...doc, authoringNote: original }, null, 2) + "\n");
  });
});

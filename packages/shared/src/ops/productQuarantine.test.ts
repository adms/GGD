/**
 * 🔒 產物隔離區（owner 2026-08-24：「這個問題發生上百次了…只能靠產生器去操作修改
 * 產物內容」）。
 *
 * ⭐ 真的跑腳本、真的 chmod、真的用檔案 API 寫 —— ⛔ 不是掃字串（第三守則）。
 * 它守的正是 genguard hook 的盲區：python/node 檔案 API 直寫（上百次事故的通道）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("產物隔離區", () => {
  const dir = mkdtempSync(join(tmpdir(), "pq-"));
  const product = join(dir, "generated.json");
  const io = join(dir, "io.json");
  writeFileSync(product, "{}\n");
  writeFileSync(io, JSON.stringify({ steps: [{ name: "fake:build", writes: [product] }] }));
  const run = (args: string[]): string =>
    execFileSync("bash", ["scripts/product-quarantine.sh", ...args], {
      cwd: REPO, encoding: "utf8", env: { ...process.env, GGD_QUARANTINE_IO: io },
    });

  it("lock 之後：檔案 API 直寫吃 EACCES；unlock 之後寫得回去", () => {
    run(["lock"]);
    // ⭐ 這一刀就是上百次事故的形狀 —— hook 看不見的那條路。
    expect(() => {
      closeSync(openSync(product, "w"));
    }, "鎖了還寫得進去 ⇒ 隔離區沒有真的隔離").toThrow(/EACCES|permission/i);

    run(["unlock"]);
    writeFileSync(product, "{\"ok\":true}\n"); // 不擲 = 解鎖真的解了
    chmodSync(product, 0o644);
  });

  it("--step 只動那一支的產物", () => {
    const other = join(dir, "other.json");
    writeFileSync(other, "{}\n");
    writeFileSync(io, JSON.stringify({ steps: [
      { name: "fake:build", writes: [product] },
      { name: "other:build", writes: [other] },
    ] }));
    run(["lock", "--step", "fake:build"]);
    expect(() => closeSync(openSync(product, "w"))).toThrow();
    closeSync(openSync(other, "w")); // 不擲 —— 別支的產物不受波及
    run(["unlock", "--step", "fake:build"]);
  });
});

import { expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { heroWorkerTsxCacheParent, runHeroPackageJob } from "./heroPackageWorkerClient";

const repo = resolve(import.meta.dirname, "../../..");

/**
 * ⭐ 英雄 worker 的 tsx 快取住自己的目錄（理由與量到的數字在 `heroWorkerTsxCacheParent`）。
 * 兩個方向一起讀：專用目錄**有**轉譯檔，而 worker 繼承到的共用位置（`$TMPDIR/tsx-*`）**沒有**。
 * MUTATION LOG：eval 片段拿掉 `process.env.TMPDIR = workerData.tsxCacheParent` ⇒ 🔴（專用目錄是空的、共用位置長出 tsx-*）。
 */
it("英雄 worker 把 tsx 轉譯快取寫進專用目錄，⛔ 不讀寫整台機器共用的那一份", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "ggd-hero-tsx-cache-"));
  const inherited = process.env.TMPDIR;
  process.env.TMPDIR = fresh;
  try {
    const parent = heroWorkerTsxCacheParent()!;
    expect(parent.startsWith(fresh)).toBe(true);
    const bogus = { gameRevision: "x", contentVersion: "cv_not_current", migrationFingerprint: "x", processorFingerprint: "x" };
    await expect(runHeroPackageJob(join(repo, "content"), { kind: "build", repoRoot: repo, target: bogus })).rejects.toThrow("遊戲內容已在檢查期間變更");
    const dedicated = readdirSync(parent).filter((name) => name.startsWith("tsx-"));
    expect(dedicated).toHaveLength(1);
    expect(readdirSync(join(parent, dedicated[0]!)).filter((name) => /^\d+-/.test(name)).length).toBeGreaterThan(50);
    expect(readdirSync(fresh).filter((name) => name.startsWith("tsx-"))).toEqual([]);
  } finally {
    if (inherited === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = inherited;
    if (existsSync(fresh)) rmSync(fresh, { recursive: true, force: true });
  }
}, 60_000);

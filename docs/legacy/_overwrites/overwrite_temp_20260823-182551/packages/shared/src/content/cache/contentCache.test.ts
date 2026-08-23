/**
 * 快取層的**承重**守衛，三條：
 *  ① 還原出來的東西跟真的讀內容樹**逐份相同**（快取說謊 = 產生器全部說謊）
 *  ② 工作樹改一個位元組，鍵就變（⭐ 突變點：`gitParts` 的 `git status` 那一半）
 *  ③ 兩支「抓產物過期／來源沒進版控」的閘⛔ 不可以 import 這一層
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTION_NAMES } from "../schema/index";
import { loadContentCached, REPO_ROOT } from "./contentCache";
import { __resetFingerprintMemo, computeFingerprint } from "./fingerprint";

const cacheDir = mkdtempSync(join(tmpdir(), "ggd-content-cache-"));

/**
 * `JSON.stringify(-0) === "0"` ⇒ 快取那條路的 `-0` 一定變 `0`。
 * ⭐ 出貨的 `bundle.json` 也一樣（裡面 `-0` 出現 0 次），所以這是**已知且唯一**
 * 允許的差別 —— 把它從「讀檔案樹」那一側正規化掉，其餘任何差別都要紅。
 */
function neg0(v: unknown): unknown {
  if (Object.is(v, -0)) return 0;
  if (Array.isArray(v)) return v.map(neg0);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, neg0(x)]));
  }
  return v;
}
const env = (mode: string): NodeJS.ProcessEnv => ({
  ...process.env,
  GGD_CONTENT_CACHE: mode,
  GGD_CONTENT_CACHE_DIR: cacheDir,
  // ⛔ 這支測試不碰 Redis:它量的是「還原出來的東西對不對」,不是傳輸層。
  REDIS_ADDR: "127.0.0.1:1",
});

describe("內容樹快取", () => {
  it("還原出來的 store / manifest / 隔離清單,與讀內容樹逐份相同", async () => {
    const fresh = await loadContentCached({ env: env("off") });
    const write = await loadContentCached({ env: env("file") }); // miss ⇒ 寫回
    const cached = await loadContentCached({ env: env("file") }); // hit

    expect(write.cache.hit).toBe("miss");
    expect(cached.cache.hit).toBe("file");
    expect(cached.store.totalCount()).toBe(fresh.store.totalCount());
    for (const c of COLLECTION_NAMES) {
      // ⭐ toStrictEqual 分得出 `{a: undefined}` 與 `{}` —— JSON 來回最會弄丟的正是那個
      expect(cached.store.ids(c).sort()).toStrictEqual(fresh.store.ids(c).sort());
      for (const id of fresh.store.ids(c)) {
        expect(cached.store.get(c, id)).toStrictEqual(neg0(fresh.store.get(c, id)));
      }
    }
    expect(cached.manifest).toStrictEqual(fresh.manifest);
    expect(cached.policyUsed).toBe(fresh.policyUsed);
    expect(cached.quarantined).toStrictEqual(fresh.quarantined);
    expect(cached.warnings.map(String).sort()).toStrictEqual(fresh.warnings.map(String).sort());
  }, 60_000);

  it("工作樹改一個位元組,鍵就變(⛔ 沒 commit 也算)", () => {
    const repo = mkdtempSync(join(tmpdir(), "ggd-fp-"));
    const run = (...a: string[]): void => {
      execFileSync("git", a, { cwd: repo, stdio: "ignore" });
    };
    run("init", "-q");
    run("config", "user.email", "t@t");
    run("config", "user.name", "t");
    writeFileSync(join(repo, "doc.json"), '{"id":"a"}\n');
    run("add", "doc.json");
    run("commit", "-qm", "x");
    const fp = (): string => {
      __resetFingerprintMemo();
      return computeFingerprint({ repoRoot: repo, contentPaths: ["."], codePaths: [], salt: "" })
        .key;
    };
    const before = fp();
    writeFileSync(join(repo, "doc.json"), '{"id":"b"}\n'); // ⛔ 沒 add、沒 commit
    const after = fp();
    writeFileSync(join(repo, "doc.json"), '{"id":"a"}\n'); // 改回來 ⇒ 鍵也要回來
    const back = fp();
    rmSync(repo, { recursive: true, force: true });

    expect(after).not.toBe(before);
    expect(back).toBe(before);
  }, 30_000);

  it("⛔ 抓『產物過期／來源沒進版控』的兩支閘,不可以走快取", () => {
    for (const f of ["shippedBundleIsCurrent.test.ts", "shippedBundleHasTrackedSources.test.ts"]) {
      const src = readFileSync(join(REPO_ROOT, "packages/shared/src/content", f), "utf8");
      expect(src).not.toMatch(/loadContentCached|content\/cache/);
    }
  });
});

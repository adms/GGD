/**
 * GH#717 —— 驗的是**出貨容器那條路**，⛔ 不是本機那條。
 *
 * ⭐ 為什麼要一支新的：`content/cache/contentCache.test.ts` 每一條都跑在
 * `rootDir === SHIPPED_CONTENT_DIR` ＋ 有 `.git` 的**本機**佈局上 —— 而 2026-08-30
 * 量到的缺陷**只發生在另一個佈局**（`CONTENT_DIR=/srv/content`、`/app` 底下沒有
 * `.git`、shared 住 `node_modules/@ggd/shared`）。⇒ 那一支對這三個缺陷結構性失明。
 *
 * ⛔⛔ **而這一支的第一版只守住了三層裡的一層**（2026-08-30 複驗，量到的）：
 * ⓶（manifest 指紋）與 ⓷（`PARSER_SRC_DIR`）當時是**自己造 `computeFingerprint`
 * 的參數**再斷言 —— 失敗形態⑤「被測的不是出貨的那個」。把 `contentCacheKey()` 裡的
 * `contentDigestFile:` 或 `PARSER_SRC_DIR` 改回壞掉的那一版，六條測試**全綠**。
 * ⇒ 現在 ③ 改成**在真的出貨佈局裡跑真的 `loadContentCached()`**。
 *
 * ⚠️ ⭐ **為什麼 ③ 一定要「實體拷貝 + 子行程」，⛔ symlink 不行**：node 預設把模組
 * 路徑解析回**真實路徑**，所以 symlink 過去的 `@ggd/shared` 其 `import.meta.url`
 * 仍然是 repo 佈局 ⇒ `REPO_ROOT` / `PARSER_SRC_DIR` 兩個常數量不到出貨的那個值。
 *
 * ⭐ 三個突變（全部驗過，⛔ 不是宣稱）：
 *  ⓵ `isDeclaredContentRoot()` 第二個 return → `false`     ⇒ ① 紅（`hit` 停在 miss）
 *  ⓶ `contentCacheKey()` 刪掉 `contentDigestFile:` 那一行  ⇒ ③ 紅（`source` 變 `read-all`）
 *  ⓷ `PARSER_SRC_DIR` 改回 `join(REPO_ROOT,"packages/shared/src")` ⇒ ③ 紅（`paths` 586→1）
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { contentCacheKey, loadContentCached, SHIPPED_CONTENT_DIR, REPO_ROOT } from "../content/cache/contentCache";
import { __resetFingerprintMemo } from "../content/cache/fingerprint";

/** 容器的形狀：內容掛在**別的路徑**（`/srv/content`），⛔ 不在 app 根底下。 */
const box = mkdtempSync(join(tmpdir(), "ggd717-"));
const srvContent = join(box, "srv-content");
symlinkSync(SHIPPED_CONTENT_DIR, srvContent);
const env = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  GGD_CONTENT_CACHE: "file",
  GGD_CONTENT_CACHE_DIR: join(box, "cache"),
  GGD_CONTENT_CACHE_FINGERPRINT: "",
  CONTENT_DIR: srvContent, // ⭐ 部署宣告「這就是內容樹」——與 compose 同一格
  REDIS_ADDR: "127.0.0.1:1",
  ...over,
});

describe("GH#717 出貨容器那條路", () => {
  it("① 承重：CONTENT_DIR 宣告的樹**會**進快取（在此之前它保證 miss 而且靜默）", async () => {
    const first = await loadContentCached({ rootDir: srvContent, env: env(), log: () => {} });
    const second = await loadContentCached({ rootDir: srvContent, env: env(), log: () => {} });
    expect(resolve(srvContent)).not.toBe(SHIPPED_CONTENT_DIR); // 夾具真的走到那一行
    expect(second.cache.hit).toBe("file");
    expect(second.store.totalCount()).toBe(first.store.totalCount());
  }, 120_000);

  it("② 沒有宣告過的樹仍然退回,而且**說得出來**(fail-open 沒錯,靜默才是缺陷)", async () => {
    const r = await loadContentCached({ rootDir: srvContent, env: env({ CONTENT_DIR: "" }), log: () => {} });
    expect(r.cache.hit).toBe("miss");
    expect(r.cache.notes.join()).toContain("CONTENT_DIR");
  }, 120_000);

  it("③ 真的用**出貨映像的佈局**跑一次 loadContentCached（⓶⓷ 的守衛）", () => {
    // `pnpm deploy /out` + `COPY /out/ /app` ⇒ shared 在 <app>/node_modules/@ggd/shared，
    // 而 <box> 底下沒有 .git、沒有 packages/。⛔ 必須是實體拷貝（見檔頭）。
    const app = join(box, "app");
    const pkg = join(app, "node_modules/@ggd/shared");
    mkdirSync(join(app, "node_modules/@ggd"), { recursive: true });
    cpSync(join(REPO_ROOT, "packages/shared"), pkg, {
      recursive: true,
      filter: (src) => !src.endsWith(`${sep}node_modules`),
    });
    const deps = join(REPO_ROOT, "packages/shared/node_modules");
    if (existsSync(deps)) symlinkSync(deps, join(pkg, "node_modules"));

    const probe = join(box, "probe.mjs");
    writeFileSync(
      probe,
      `const cc = await import(${JSON.stringify(join(pkg, "src/content/cache/contentCache.ts"))});
const env = { CONTENT_DIR: ${JSON.stringify(srvContent)}, GGD_CONTENT_CACHE: "file",
  GGD_CONTENT_CACHE_DIR: ${JSON.stringify(join(box, "boxcache"))} };
const a = await cc.loadContentCached({ rootDir: ${JSON.stringify(srvContent)}, env, log: () => {} });
const b = await cc.loadContentCached({ rootDir: ${JSON.stringify(srvContent)}, env, log: () => {} });
console.log("@@" + JSON.stringify({ repoRoot: cc.REPO_ROOT, parserSrc: cc.PARSER_SRC_DIR,
  hit: b.cache.hit, source: b.cache.fingerprint.source, paths: b.cache.fingerprint.paths,
  docs: b.store.totalCount() }));`,
    );
    const out = execFileSync(process.execPath, ["--import", "tsx", probe], {
      cwd: join(REPO_ROOT, "packages/shared"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 180_000,
    });
    const r = JSON.parse(out.split("@@").pop()!) as Record<string, unknown>;

    // ⭐ 先驗**行為**（三層各一條），⛔ 常數擺後面 —— 突變時要先看到症狀不是路徑字串。
    expect(r.hit).toBe("file"); // ⓵ 在出貨佈局下真的命中
    expect(r.source).toBe("manifest"); // ⓶ 內容那一半 1 次開檔,⛔ 不是 read-all 的 2,368
    expect(r.paths).toBeGreaterThan(100); // ⓷ 程式碼那一半**不是空的**（壞掉時是 1）
    expect(r.docs).toBeGreaterThan(100);
    // ⭐ 更正 #1：上五層是 cache→content→src→shared→@ggd→node_modules，⛔ 不是 <app>。
    // ⚠️ 用 realpath 比：macOS 的 tmpdir 是 /var → /private/var 的 symlink，
    //    而 node 解析模組路徑時會把它攤開（⛔ 這正是 ③ 要用實體拷貝的同一個機制）。
    const real = realpathSync(app);
    expect(r.repoRoot).toBe(join(real, "node_modules"));
    expect(r.parserSrc).toBe(join(real, "node_modules/@ggd/shared/src"));
  }, 300_000);

  it("④ manifest 只在**真的沒有 git** 時取代 git —— 有 git 的樹一律 read-all", () => {
    // ⛔ 第一版的檔頭寫「只在 git 缺席時才走」,而分岔點其實是 insideRepo（路徑在不在
    //    repoRoot 底下）⇒ 有 git 的機器把 CONTENT_DIR 指到 repo 外就會走 manifest,
    //    而那裡「編了 doc 卻沒跑 content:build」鍵不會變 —— 正是 08-01/08-02 的形狀。
    __resetFingerprintMemo();
    expect(contentCacheKey(env(), "content", srvContent).source).toBe("read-all");
    __resetFingerprintMemo();
    // 一鍵回頭（compose 的 GGD_CONTENT_CACHE_FINGERPRINT）：兩個方向都要能到達。
    expect(contentCacheKey(env({ GGD_CONTENT_CACHE_FINGERPRINT: "manifest" }), "content", srvContent).source).toBe(
      "manifest",
    );
  }, 120_000);
});

process.on("exit", () => rmSync(box, { recursive: true, force: true }));

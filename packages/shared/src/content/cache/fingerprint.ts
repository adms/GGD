/**
 * 內容樹 + 解析它的那份程式碼的**內容雜湊**（＝快取鍵）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼**不可以**用 mtime，也不可以用 manifest 裡的 `contentVersion`
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-08-23：「快取失效必須是不可能出錯的：鍵含內容雜湊 ⇒ 內容一動鍵就變」。
 *
 * | 候選鍵 | 為什麼不行 |
 * |---|---|
 * | mtime | 產生器把一份 config **原樣重寫**（位元組一個都沒變）mtime 也會跳 ⇒ 永遠 miss；反過來 `git checkout` 退回舊版可能讓 mtime 比快取新卻是**別的內容** |
 * | `manifest.json` 的 `contentVersion` | 它是**產物**。lane 編了一份 doc 卻還沒跑 `content:build` ⇒ manifest 沒動 ⇒ **鍵沒變而內容變了** = 拿舊快取當真理，正是 08-01／08-02 兩次事故的形狀 |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 用得起的內容雜湊：**git 已經替我們算好了**
 * ─────────────────────────────────────────────────────────────────────────────
 * `git ls-files -s` 直接從 index 印出每一個追蹤檔的 **blob SHA-1**，
 * ⛔ 一個工作樹檔案都不開。剩下的只有「工作樹跟 index 不一樣的那幾份」，
 * 由 `git status --porcelain` 指名（⭐ 它是**內容真理**不是 mtime 真理：
 * stat 變了的檔 git 會**真的讀出來比雜湊**，位元組沒變就回報乾淨），
 * 而那幾份我們自己 sha256 它的**現在的位元組**。
 *
 * ⇒ 任何一個位元組變了，鍵一定變。
 *
 * ⭐ 而且是**兩個** git 子行程，⛔ 不是每組 pathspec 各兩個：一次 `ls-files`
 * 一次 `status`，兩組 pathspec 一起問，回來再依前綴分堆。量到的（2026-08-23）：
 * 每一個 git 呼叫 ≈ 45 ms（幾乎全是行程啟動 + 讀 `.git/index`，⛔ 與輸出大小
 * 幾乎無關）⇒ 分開問是 190 ms，合起來問是 **~100 ms**。
 *
 * ⚠️ 沒有 git（tarball / 容器）時退回 `read-all`：真的把每一份讀出來雜湊。
 * 慢，但**答案一模一樣** —— 這是「同一份資料的另一條讀法」，⛔ 不是別的語意。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ 而 `read-all` 在**出貨容器**裡讓快取變成負收益（GH#717，2026-08-30 量到）
 * ─────────────────────────────────────────────────────────────────────────────
 * 容器裡沒有 `.git` ⇒ 每一次都走 `read-all`。而量到的母體是
 * （⚠️ **2026-08-30 複驗更正**：第一版這三格寫的是 1,763 / 1,783 / 2,367，三個都不對。
 * 重量法：包一層 `ContentSource` 數 `readManifest`/`readIndex`/`readObject` 三支的呼叫次數，
 * 指紋那一半直接讀 `Fingerprint.paths`。⭐ 方向不變 —— read-all 仍然比不用快取多開檔）：
 *
 *   | 路徑 | 開檔數 |
 *   |---|---:|
 *   | `ContentLoader.load()`（＝**不用快取**） | **1,778**（1 manifest ＋ **15** `_index.json` ＋ 1,762 份文件） |
 *   | `read-all` 指紋（內容 1,783 ＋ 程式碼 **585**） | **2,368** |
 *
 * ⇒ ⭐ **快取「命中」那條路開的檔比不用快取還多。** 它只省得到 Zod，
 *   ⛔ 而 owner 要的正是 IO：「不要每次都去大量抓檔案造成 storage 瓶頸與壽命縮短」。
 *
 * ⭐ 所以沒有 git 時**先試 `manifest`**：`content/manifest.json` 的每一格
 * `collections[c].hash` ＝ `hashCollection([{id, hash}…])`，而每個 `hash`
 * ＝ `hashDoc(doc)`（見 `../hash.ts`）⇒ **那一份檔的位元組本身就是全樹的內容雜湊**，
 * 而且它是 loader 無論如何都要讀的第一個檔 ⇒ **1 次開檔**。
 *
 * ⚠️ ⭐ **為什麼這不牴觸上面那張「⛔ 不可以用 contentVersion」的表**：
 * 那張表反對的情境是「**lane 編了一份 doc 卻還沒跑 `content:build`**」——
 * 而那需要一棵**編得動的**樹，也就是一棵有 git 的工作樹；那裡 git 仍然贏。
 *
 * ⛔⛔ **而 2026-08-30 第一版把這件事寫錯了，⭐ 而且是量出來的**（GH#717 複驗）：
 * 那一版逐字寫著「這一條**只在 git 缺席時**才走」，⛔ 但程式從來不是這樣分岔的 ——
 * 分岔點是下面的 `gitUsable`（`insideRepo`），而 `insideRepo` 問的是
 * 「**內容/程式碼在不在 `repoRoot` 底下**」，⛔ 與 git 在不在**完全無關**。
 * ⇒ ⭐ 量到：在一棵**有 `.git` 的工作樹**上，`contentCacheKey(env,"content",<repo 外的內容樹>)`
 *   回的是 `source=manifest` —— 也就是那張表明文反對的情境**在有 git 的機器上是可達的**
 *   （`CONTENT_DIR` 指到 repo 外的一棵樹就會發生）。
 * ⇒ ⭐ 所以現在它**真的**只在 git 缺席時才走：`gitAvailable(repoRoot)` 直接問 git
 *   （容器的 runtime 映像連 `git` 執行檔都沒有 ⇒ 一次失敗的 spawn ⇒ false）。
 *   ⛔ 這一格是「**更正也是一個宣稱**」的落地：⛔ 不是只把散文改對，
 *   是讓程式走完那句話原本承諾的那條路。
 *
 * ⛔ 誠實的殘餘風險：一棵**沒有 git 而 manifest 過期**的樹（有人在 tarball 裡就地改 doc）。
 * 出貨容器是 `../content:/srv/content:**ro**` 的唯讀掛載，改不動；
 * 而一鍵回頭是 `GGD_CONTENT_CACHE_FINGERPRINT`：`read-all` = 逐份讀出來雜湊、
 * `manifest` = 回到 2026-08-30 那一版（有 git 也走 manifest）。
 * `Fingerprint.source` 會在 `/healthz` 上指名這一次用了哪一種，⛔ 不是靜默地換一個語意。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 鍵裡為什麼要有**程式碼**
 * ─────────────────────────────────────────────────────────────────────────────
 * 快取存的是 **Zod `.parse()` 之後**的文件（那正是省下來的 169 ms）。
 * ⇒ 它是「內容 × schema」的函數，⛔ 不只是內容。schema 加一個 `.default()`
 *   而鍵沒變 = 產生器讀到一份**缺欄位**的內容而且完全看不出來。
 * ⇒ 所以 `packages/shared/src`（`*.test.ts` 除外 —— 測試檔改不了 parse 結果）
 *   整棵樹的 blob SHA 也折進同一個鍵。
 *   ⚠️ schema 的 import 早就跨出 `content/`（`../../sim/**`、`../../voxel/**`、
 *   `../../ids`…），所以範圍必須是整個 `packages/shared/src`，
 *   ⛔ 不是 `content/schema/`。
 *
 * ⛔⛔ 而「那份程式碼在哪」**⛔ 不可以寫死成 `packages/shared/src`**（GH#717）：
 * 出貨映像是 `pnpm deploy /out` ⇒ shared 住 `/app/node_modules/@ggd/shared/src`
 * ⇒ `REPO_ROOT`（模組自己的位置往上五層）落在 **`/app/node_modules`**
 * （⚠️ **2026-08-30 複驗更正**：第一版四個檔都寫「`repoRoot` 是 `/app`」——⛔ 錯，
 * 上五層是 `cache→content→src→shared→@ggd→node_modules`。閘見
 * `ops/contentCacheShippedPath.test.ts` 的「真的用出貨佈局跑一次」）
 * ⇒ `readAllParts(/app/node_modules, ["packages/shared/src"])`
 * 走到一個**不存在的目錄**、`statSync` 擲例外、`return` ⇒ **程式碼那一組是空的**。
 * ⭐ 量到（2026-08-30，出貨佈局的沙箱）：`paths` 從 586 掉到 **1** ——
 * 也就是這一段檔頭在講的那件事（「schema 改了而鍵沒變」）**在容器裡是必然發生的**，
 * 而它長得跟正常一模一樣（正是 `groupOf` 那一段警告的「空集合的雜湊」）。
 * ⇒ 呼叫端改成傳 `codeRoot`（從模組**自己的位置**推導），⛔ 不是一個字面路徑。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** 鍵的格式版本。⭐ 改了序列化格式就 +1 —— 舊的快取自然全部 miss。 */
export const CACHE_FORMAT = 5;

export interface Fingerprint {
  /** 64-hex sha256：內容位元組 × 解析它的程式碼 × 格式版本。 */
  key: string;
  /**
   * ⭐ **內容那一組**的真理從哪來（⛔ 不是程式碼那一組 —— 沒有 git 時它一律 `read-all`）。
   * `git` = git index ＋ `git status` · `manifest` = `manifest.json` 的雜湊鏈（容器）
   * · `read-all` = 逐份讀出來雜湊。
   */
  source: "git" | "manifest" | "read-all";
  /** 工作樹與 git index 不同的檔數（這幾份是我們自己讀出來雜湊的）。 */
  dirty: number;
  /** 折進鍵的路徑數。 */
  paths: number;
  ms: number;
}

/** 這些檔改了也改不動 Zod 的輸出 ⇒ 折進鍵只會白白 miss。 */
function isCodeNoise(path: string): boolean {
  return (
    path.endsWith(".test.ts") ||
    path.endsWith(".test.tsx") ||
    path.includes(".baseline") ||
    path.endsWith(".md")
  );
}

function git(repoRoot: string, args: string[]): string[] | null {
  try {
    const out = execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\0").filter((s) => s.length > 0);
  } catch {
    return null;
  }
}

/**
 * ⭐⭐ 這棵樹**有沒有 git 可以回答內容真理** —— ⛔ 不是「這一次有沒有用到 git」。
 *
 * ⚠️ 這兩件事在 2026-08-30 第一版被混為一談（GH#717 複驗量到）：分岔點是
 * `gitUsable`（＝路徑在不在 `repoRoot` 底下），而檔頭卻寫成「git 缺席」。
 * ⇒ 一棵**有 git** 而 `CONTENT_DIR` 指到 repo 外的樹會走 `manifest`，
 *   於是「編了 doc 卻沒跑 `content:build`」在那裡**鍵不會變** —— 正是
 *   檔頭第一張表明文反對的那件事。
 *
 * ⭐ 成本：一次 `git rev-parse --git-dir`。出貨的 runtime 映像**連 `git` 執行檔都沒有**
 * （`docker/game.Dockerfile` 逐字：build stage 才 `apk add git`）⇒ spawn 直接 ENOENT，
 * 而且 `computeFingerprint` 整個結果有 memo ⇒ 一個行程最多問一次。
 */
function gitAvailable(repoRoot: string): boolean {
  return git(repoRoot, ["rev-parse", "--git-dir"]) !== null;
}

function fileHash(abs: string): string {
  try {
    return createHash("sha256").update(readFileSync(abs)).digest("hex");
  } catch {
    return "<absent>";
  }
}

/**
 * `git status --porcelain -z` 的記錄拆成路徑。
 *
 * ⚠️ 格式：`XY <path>NUL`，而 X/Y 是 `R`/`C` 時**後面緊接一筆裸的舊路徑**。
 * 那一筆沒有狀態前綴，所以必須跟著上一筆一起吃掉，⛔ 不能當成新記錄。
 */
function porcelainPaths(recs: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]!;
    if (rec.length < 4) continue;
    const x = rec[0]!;
    const y = rec[1]!;
    out.push(rec.slice(3));
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      const orig = recs[++i];
      if (orig !== undefined) out.push(orig);
    }
  }
  return out;
}

/**
 * `p` 落在哪一組 pathspec 底下？回傳組別索引，⛔ 沒有就 -1。
 *
 * ⚠️ `.` / `""` 代表**整個 repo**（git 自己的語意）—— 少了這一行，
 * `contentPaths: ["."]` 會讓每一筆都落到 -1，於是**鍵變成空集合的雜湊**：
 * 內容怎麼改它都不動，而且看起來完全正常。
 */
function groupOf(path: string, groups: readonly (readonly string[])[]): number {
  for (let g = 0; g < groups.length; g++) {
    for (const spec of groups[g]!) {
      if (spec === "." || spec === "") return g;
      if (path === spec || path.startsWith(spec + "/")) return g;
    }
  }
  return -1;
}

/**
 * ⭐ 沒有 git 時的**便宜**內容真理：`manifest.json` 的位元組。
 *
 * 它為什麼夠：`collections[c].hash = hashCollection([{id, hash}…])` 而
 * `hash = hashDoc(doc)`（`../hash.ts`）⇒ ⭐ **任何一份文件的位元組變了，
 * 這一份檔就會變**。而 loader 本來就要開它 ⇒ 這一組的成本是 **1 次開檔**。
 *
 * ⛔ 回 null（＝退回 `read-all`）的三種：讀不到 · 不是 JSON ·
 * 沒有 `contentVersion`／`collections`。⚠️ **這三種都必須退回**，⛔ 不可以
 * 拿一份殘缺的 manifest 當鍵 —— 那正是「空集合的雜湊」那一族。
 */
function manifestPart(manifestFile: string | undefined): string[] | null {
  if (manifestFile === undefined) return null;
  let raw: Buffer;
  try {
    raw = readFileSync(manifestFile);
  } catch {
    return null;
  }
  try {
    const m = JSON.parse(raw.toString("utf8")) as { contentVersion?: unknown; collections?: unknown };
    if (typeof m.contentVersion !== "string" || m.contentVersion === "") return null;
    const cols = m.collections;
    if (typeof cols !== "object" || cols === null || Object.keys(cols).length === 0) return null;
  } catch {
    return null;
  }
  // ⭐ 折進去的是**原始位元組**的雜湊，⛔ 不是解析後的物件 —— 解析會丟掉未知欄位。
  return [`manifest.json ${createHash("sha256").update(raw).digest("hex")}`];
}

/** 沒有 git 時的退路：把每一份**真的**讀出來雜湊。慢，但答案相同。 */
function readAllParts(repoRoot: string, pathspecs: readonly string[], codeFilter: boolean): string[] {
  const parts: string[] = [];
  const walk = (abs: string): void => {
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(join(abs, name));
      }
      return;
    }
    const rel = relative(repoRoot, abs).split(sep).join("/");
    if (codeFilter && isCodeNoise(rel)) return;
    parts.push(`${rel} ${fileHash(abs)}`);
  };
  for (const p of [...pathspecs].sort()) walk(resolve(repoRoot, p));
  return parts;
}

export interface FingerprintInput {
  repoRoot: string;
  /** 內容樹裡真的會被讀到的東西（相對 repoRoot）。 */
  contentPaths: readonly string[];
  /** 解析內容的那份程式碼（相對 repoRoot）。⛔ `*.test.ts` 會被濾掉。 */
  codePaths: readonly string[];
  /** 折進鍵的額外常數（政策、collection 名單…）。 */
  salt: string;
  /**
   * ⭐ 內容樹**真的**住在哪（絕對路徑）。⛔ **不必**在 `repoRoot` 底下 ——
   * 出貨容器是 `/srv/content` 而 `repoRoot` 是 `/app`（GH#717）。
   */
  contentRoot?: string;
  /**
   * ⭐ 內容那一組在 `contentRoot` **底下**的子路徑（`champions` / `manifest.json` …）。
   * ⚠️ 少了它，沒有 git 的那條路會走遍**整棵** `contentRoot`（含 `bundle.json`、
   * `assets/`、`_legacy/` —— loader 一份都不讀）⇒ 折進鍵的母體與 git 那條路不一樣。
   */
  contentSubpaths?: readonly string[];
  /** ⭐ 解析內容的程式碼**真的**住在哪（絕對路徑）。容器裡是 `…/node_modules/@ggd/shared/src`。 */
  codeRoot?: string;
  /** ⭐ 沒有 git 時優先讀的內容雜湊清單（`<contentRoot>/manifest.json` 的絕對路徑）。 */
  contentDigestFile?: string;
  /** ⛔ 一鍵回頭：`true` ⇒ 跳過 `manifest`，逐份讀（`GGD_CONTENT_CACHE_FINGERPRINT=read-all`）。 */
  forceReadAll?: boolean;
  /**
   * ⛔ 另一格一鍵回頭：`true` ⇒ **即使這棵樹有 git** 也走 `manifest`
   * （`GGD_CONTENT_CACHE_FINGERPRINT=manifest`）＝ 2026-08-30 那一版的行為。
   *
   * ⚠️ ⭐ 預設是 `false`，而那是**這一次更正的整個重點**：manifest 是
   * 「git 缺席時的替代真理」，⛔ 不是「路徑落在 repo 外時的替代真理」——
   * 後者在有 git 的機器上是可達的（`CONTENT_DIR` 指到 repo 外），
   * 而在那裡「lane 編了 doc 卻沒跑 `content:build`」會讓鍵**不動**。
   */
  forceManifest?: boolean;
}

/**
 * ⭐ 這一組的檔案在不在 `repoRoot` 底下 —— ⛔ 不在就**不可以問 git**。
 *
 * ⚠️ 這一行是必要的，⛔ 不是保險：`git ls-files -- content/champions` 在 `/app`
 * 底下會**成功並回傳零列**（那個 pathspec 在那個 repo 裡沒有東西）⇒
 * 分組後那一組是空的 ⇒ ⭐ **鍵變成空集合的雜湊，而內容怎麼改它都不動。**
 */
function insideRepo(repoRoot: string, abs: string | undefined): boolean {
  if (abs === undefined) return true;
  const root = resolve(repoRoot);
  const p = resolve(abs);
  return p === root || p.startsWith(root + sep);
}

/**
 * ⭐ 兩個 git 子行程（⛔ 不是四個），兩組 pathspec 一起問。
 * 回傳 `[內容那一堆, 程式碼那一堆]`，各自已排序。
 */
function gitParts(
  repoRoot: string,
  groups: readonly (readonly string[])[],
): { parts: string[][]; dirty: number } | null {
  const all = groups.flat();
  const tracked = git(repoRoot, ["ls-files", "-s", "-z", "--", ...all]);
  if (tracked === null) return null;

  const parts: string[][] = groups.map(() => []);
  for (const rec of tracked) {
    const tab = rec.indexOf("\t"); // "<mode> <sha1> <stage>\t<path>"
    if (tab === -1) continue;
    const path = rec.slice(tab + 1);
    const g = groupOf(path, groups);
    if (g === -1) continue;
    if (g === 1 && isCodeNoise(path)) continue; // 組 1 = 程式碼
    parts[g]!.push(`${path} ${rec.slice(0, tab)}`);
  }

  const changed =
    git(repoRoot, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...all]) ?? [];
  let dirty = 0;
  for (const path of porcelainPaths(changed)) {
    const g = groupOf(path, groups);
    if (g === -1) continue;
    if (g === 1 && isCodeNoise(path)) continue;
    parts[g]!.push(`~${path} ${fileHash(resolve(repoRoot, path))}`);
    dirty++;
  }
  for (const p of parts) p.sort();
  return { parts, dirty };
}

const memo = new Map<string, Fingerprint>();

export function computeFingerprint(input: FingerprintInput): Fingerprint {
  const memoKey = JSON.stringify([
    input.repoRoot,
    input.contentPaths,
    input.codePaths,
    input.salt,
    input.contentRoot ?? "",
    input.contentSubpaths ?? [],
    input.codeRoot ?? "",
    input.contentDigestFile ?? "",
    input.forceReadAll === true,
    input.forceManifest === true,
  ]);
  const hitMemo = memo.get(memoKey);
  if (hitMemo) return hitMemo;

  const t0 = performance.now();
  const groups = [input.contentPaths, input.codePaths] as const;
  // ⭐ 兩組**都**要在 repoRoot 底下才問得了 git（見 `insideRepo` 的檔頭：
  //    一個問錯地方的 `ls-files` 會安靜地回零列，而那比沒有指紋更糟）。
  const gitUsable =
    insideRepo(input.repoRoot, input.contentRoot) && insideRepo(input.repoRoot, input.codeRoot);
  const g = gitUsable ? gitParts(input.repoRoot, groups) : null;

  let source: Fingerprint["source"] = g === null ? "read-all" : "git";
  let contentParts: string[];
  let codeParts: string[];
  if (g !== null) {
    [contentParts, codeParts] = g.parts as [string[], string[]];
  } else {
    // ⭐ 便宜那條先試（1 次開檔），⛔ 拿不到才逐份讀 1,783 個檔。
    // ⚠️ ⭐ 但**只有 git 真的缺席時**才可以（見 `gitAvailable` 的檔頭）——
    //    走到這裡有兩種原因：git 問不出來（`gitParts` 回 null）或路徑落在 repo 外
    //    （`gitUsable` 為 false），⛔ 而只有第一種才代表「git 沒有答案」。
    const mayUseManifest =
      input.forceReadAll !== true && (input.forceManifest === true || !gitAvailable(input.repoRoot));
    const digest = mayUseManifest ? manifestPart(input.contentDigestFile) : null;
    if (digest !== null) {
      contentParts = digest;
      source = "manifest";
    } else {
      const base = input.contentRoot ?? input.repoRoot;
      const subs = input.contentRoot ? (input.contentSubpaths ?? ["."]) : input.contentPaths;
      contentParts = readAllParts(base, subs, false);
    }
    const codeBase = input.codeRoot ?? input.repoRoot;
    codeParts = readAllParts(codeBase, input.codeRoot ? ["."] : input.codePaths, true);
  }

  const h = createHash("sha256");
  h.update(`ggd-content-cache v${CACHE_FORMAT}\n${input.salt}\n--content--\n`);
  for (const p of contentParts!) h.update(p + "\n");
  h.update("--code--\n");
  for (const p of codeParts!) h.update(p + "\n");

  const fp: Fingerprint = {
    key: h.digest("hex"),
    source,
    dirty: g?.dirty ?? 0,
    paths: contentParts!.length + codeParts!.length,
    ms: performance.now() - t0,
  };
  memo.set(memoKey, fp);
  return fp;
}

/** ⛔ 只給測試：把行程內的記憶忘掉。 */
export function __resetFingerprintMemo(): void {
  memo.clear();
}

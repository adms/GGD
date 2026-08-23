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
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** 鍵的格式版本。⭐ 改了序列化格式就 +1 —— 舊的快取自然全部 miss。 */
export const CACHE_FORMAT = 4;

export interface Fingerprint {
  /** 64-hex sha256：內容位元組 × 解析它的程式碼 × 格式版本。 */
  key: string;
  /** 工作樹真理從哪來。`read-all` = 沒有 git，只好逐份讀。 */
  source: "git" | "read-all";
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
  ]);
  const hitMemo = memo.get(memoKey);
  if (hitMemo) return hitMemo;

  const t0 = performance.now();
  const groups = [input.contentPaths, input.codePaths] as const;
  const g = gitParts(input.repoRoot, groups);
  const source: Fingerprint["source"] = g === null ? "read-all" : "git";
  const [contentParts, codeParts] =
    g?.parts ??
    ([
      readAllParts(input.repoRoot, input.contentPaths, false),
      readAllParts(input.repoRoot, input.codePaths, true),
    ] as string[][]);

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

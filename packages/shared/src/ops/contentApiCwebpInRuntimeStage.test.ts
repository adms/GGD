import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * ⭐⭐ GH#967 —— **`cwebp` 要住在 content-api 映像的 runtime stage**。
 *
 * ── ⛔ 這個缺陷的形狀（本 repo 記錄最多的那一種）────────────────────────────
 * `tools/icon-gen/convert-webp.mjs:130` 用 `execFileSync("cwebp", …)` 轉檔，
 * 而 `docker/content-api.Dockerfile` 的 runtime stage **在此之前只裝 `tini`**
 * ⇒ ⭐ **開發者本機 `pnpm dev` 全綠**（他自己的 Mac 上有 `cwebp`），
 *    ⛔ 而 `docker compose --profile dev up content-api` 一轉檔就 ENOENT。
 *
 * ── ⭐ 為什麼這條閘**只讀檔案**，⛔ 不跑 `docker build` ────────────────────
 * 前例 `composeLogCap.test.ts` 逐字寫過同一個理由：
 * 「CI 上不一定有 docker，而一條**環境不對就跳過**的閘等於沒有閘」。
 * ⇒ ⭐ 「`libwebp-tools` 真的提供 `cwebp`」那一半由 **Dockerfile 自己**保證：
 *    runtime stage 跑 `cwebp -version` ⇒ 套件改名／被拿掉 ⇒ **build 當場回非零**。
 *    ⛔ 不是一行沒有人讀的 log，⛔ 也不是等到第一次轉檔才靜默失敗。
 *
 * ── ⭐ 需求是**推導**的，⛔ 不是手寫「要裝 libwebp-tools」 ──────────────────
 * 手寫的常數會在 #966 把轉檔抽成 `packages/shared/src/content/icons/encodeIcon.ts`
 * 之後**繼續綠**，而它已經不知道自己在守什麼。
 * ⇒ 本檔從 **icon 轉檔那條路的出貨原始碼**掃 `execFileSync("<bin>")`，
 *   再要求 runtime stage 裝得起那個 bin。⭐ 掃不到任何 bin ⇒ **紅**
 *   （⛔ 一個推導出空集合的閘 ＝ 一個永遠會綠的閘，本文件 ⑨ 記過）。
 *
 * ── ⭐ 兩個方向都走（本文件 ⑫）────────────────────────────────────────────
 * ① bin → 套件：每一支被執行的外部程式都要有人裝。
 * ② 套件 → bin：`APK_PACKAGE_FOR` 裡**沒有人要**的列也要紅（⛔ 不讓表變墳場）。
 *
 * ⚠️ 內建 sentinel：把套件搬到 build stage 的合成 Dockerfile 餵進同一支檢查器，
 * 斷言它**抓得到** —— ⛔ 一把只驗過單邊的尺不算自證過（CLAUDE.md 逐字）。
 */

const REPO = resolve(__dirname, "../../../..");
const DOCKERFILE = join(REPO, "docker/content-api.Dockerfile");

/** icon 轉檔那條路今天／未來可能的住處（⛔ 不含測試檔 —— 測試跑在宿主上，不在容器裡）。 */
const ICON_PATH_ROOTS = [
  "tools/icon-gen",
  "packages/shared/src/content/icons", // ⭐ #966 要把 encodeIcon 放這裡
  "apps/content-api/src",
];

/** `node:22-alpine` 本身就帶的，⛔ 不需要 `apk add`。 */
const BASE_IMAGE_BINS = new Set(["node", "npm", "npx", "corepack", "pnpm", "sh", "env", "which"]);

/** bin → Alpine 套件名。⚠️ Alpine 上 `cwebp` 來自 `libwebp-tools`（⛔ 不是 `webp`／`cwebp`）。 */
const APK_PACKAGE_FOR: Record<string, string> = { cwebp: "libwebp-tools" };

// ── Dockerfile 解析 ────────────────────────────────────────────────────────

type Stage = { from: string; body: string };

/** 一份 Dockerfile → 逐個 stage。每一個 `FROM` 開一段（⭐ 最後一段就是 runtime）。 */
function stagesOf(src: string): Stage[] {
  const lines = src.split("\n");
  const out: Stage[] = [];
  for (const line of lines) {
    if (/^\s*FROM\s+/i.test(line)) out.push({ from: line.trim(), body: "" });
    else if (out.length > 0) out[out.length - 1]!.body += `${line}\n`;
  }
  return out;
}

/** 把 `\` 續行接起來，一個 `RUN` 一條字串（⛔ 逐行 grep 會被續行騙過去）。 */
function runBlocksOf(body: string): string[] {
  const joined = body.replace(/\\\s*\n/g, " ");
  return joined
    .split("\n")
    .filter((l) => /^\s*RUN\s+/i.test(l))
    .map((l) => l.replace(/^\s*RUN\s+/i, "").trim());
}

/** 一段 `RUN` 裡 `apk add` 裝了哪些套件（⛔ 略過 `-x` / `--flag`）。 */
function apkPackagesOf(runBlocks: string[]): string[] {
  const pkgs: string[] = [];
  for (const block of runBlocks) {
    for (const seg of block.split("&&")) {
      const m = /^\s*apk\s+(?:--\S+\s+)*add\s+(.*)$/.exec(seg.trim());
      if (!m) continue;
      for (const tok of m[1]!.trim().split(/\s+/)) {
        if (tok.startsWith("-") || tok === "") continue;
        if (tok === ">" || tok.startsWith(">")) break;
        pkgs.push(tok);
      }
    }
  }
  return pkgs;
}

/** 一段 `RUN` 裡「被當成指令執行」的第一個字（⭐ 用來認出 `cwebp -version` 這種自證）。 */
function commandWordsOf(runBlocks: string[]): string[] {
  const words: string[] = [];
  for (const block of runBlocks) {
    for (const seg of block.split(/&&|\|\||;/)) {
      const first = seg.trim().split(/\s+/)[0];
      if (first) words.push(first);
    }
  }
  return words;
}

// ── 需求推導 ───────────────────────────────────────────────────────────────

type Need = { bin: string; where: string };

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(abs);
  }
}

/** icon 轉檔路徑上的出貨原始碼**真的執行**了哪些外部程式。 */
function iconPathBinaries(): Need[] {
  const files: string[] = [];
  for (const root of ICON_PATH_ROOTS) walk(join(REPO, root), files);
  const needs: Need[] = [];
  const re = /\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*["'`]([A-Za-z0-9_.+-]+)["'`]/g;
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    for (const m of src.matchAll(re)) {
      const bin = m[1]!;
      if (BASE_IMAGE_BINS.has(bin)) continue;
      needs.push({ bin, where: relative(REPO, abs) });
    }
  }
  return needs;
}

// ── 檢查器（⭐ sentinel 餵的是同一支）─────────────────────────────────────

/** 回傳問題清單（空 ＝ 過）。⭐ 兩個方向都走。 */
function audit(dockerfileSrc: string, needs: Need[]): string[] {
  const problems: string[] = [];
  const stages = stagesOf(dockerfileSrc);
  if (stages.length === 0) return ["⛔ Dockerfile 裡一個 FROM 都沒有"];

  const runtime = stages[stages.length - 1]!;
  const runtimeRuns = runBlocksOf(runtime.body);
  const runtimePkgs = new Set(apkPackagesOf(runtimeRuns));
  const runtimeCmds = new Set(commandWordsOf(runtimeRuns));
  const earlierPkgs = new Set(stages.slice(0, -1).flatMap((s) => apkPackagesOf(runBlocksOf(s.body))));

  const wanted = new Set<string>();
  for (const { bin, where } of needs) {
    const pkg = APK_PACKAGE_FOR[bin];
    if (!pkg) {
      problems.push(
        `⛔ \`${where}\` 執行外部程式 \`${bin}\`，而 APK_PACKAGE_FOR 沒有它的 Alpine 套件名` +
          ` —— 補一列，⛔ 不要讓這條閘對它失明`,
      );
      continue;
    }
    wanted.add(pkg);
    if (runtimePkgs.has(pkg)) continue;
    problems.push(
      earlierPkgs.has(pkg)
        ? `⛔ \`${pkg}\`（提供 \`${bin}\`，${where} 要用）裝在**前面的 stage**，` +
          `而 runtime stage（${runtime.from}）沒有 —— ⭐ 裝錯 stage 等於沒裝：` +
          `\`COPY --from=build\` 只搬 /out，症狀是 build 過、跑起來 ENOENT`
        : `⛔ runtime stage（${runtime.from}）沒裝 \`${pkg}\`，而 ${where} 會執行 \`${bin}\``,
    );
  }

  // ⭐ fail-loud：光裝上還不夠，runtime stage 要**真的跑一次**那支程式。
  //    套件改名／上游拿掉 ⇒ build 回非零，⛔ 不是等到第一次轉檔才靜默失敗。
  for (const bin of new Set(needs.map((n) => n.bin))) {
    if (!APK_PACKAGE_FOR[bin]) continue;
    if (runtimeCmds.has(bin)) continue;
    problems.push(
      `⛔ runtime stage 沒有跑過一次 \`${bin}\`（例 \`${bin} -version\`）—— ` +
        `⭐ 選 fail-open 就要有一個**會回非零**的東西喊，⛔ 一行沒人讀的 log 不算`,
    );
  }

  // ⭐ 方向②：表裡沒有人要的列（⛔ 不讓 APK_PACKAGE_FOR 變墳場）。
  for (const [bin, pkg] of Object.entries(APK_PACKAGE_FOR)) {
    if (wanted.has(pkg)) continue;
    problems.push(
      `⛔ APK_PACKAGE_FOR 有 \`${bin}\` → \`${pkg}\`，而 icon 轉檔那條路已經沒有人執行 \`${bin}\`` +
        ` —— 刪掉它，或把這條閘指向新的住處（${ICON_PATH_ROOTS.join(" / ")}）`,
    );
  }
  return problems;
}

// ── 測試 ───────────────────────────────────────────────────────────────────

describe("GH#967 content-api 映像要帶得動 icon 轉檔", () => {
  const needs = iconPathBinaries();

  it("⭐ icon 轉檔那條路**真的**執行了外部程式（⛔ 推導出空集合 ＝ 永遠會綠的閘）", () => {
    expect(
      needs.length,
      `⛔ 在 ${ICON_PATH_ROOTS.join(" / ")} 底下掃不到任何 execFileSync("<bin>") —— ` +
        "⭐ 要嘛轉檔搬家了（把 ICON_PATH_ROOTS 指過去），要嘛換了純 JS 編碼器（那就刪掉這條閘）。" +
        "⛔ 不要留著一個推導出空集合的閘：它會永遠綠。",
    ).toBeGreaterThan(0);
    expect(needs.map((n) => n.bin)).toContain("cwebp");
  });

  it("⭐⭐ 出貨的 `docker/content-api.Dockerfile` 的 **runtime stage** 帶得起它們", () => {
    const problems = audit(readFileSync(DOCKERFILE, "utf8"), needs);
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("⚠️ sentinel：同一支檢查器要抓得到「裝在 build stage」（⛔ 只 grep 會被騙過去）", () => {
    const misplaced = [
      "FROM node:22-alpine AS build",
      "RUN apk add --no-cache libwebp-tools",
      "RUN cwebp -version > /dev/null",
      "FROM node:22-alpine",
      "RUN apk add --no-cache tini",
      'CMD ["node", "dist/index.js"]',
    ].join("\n");

    // ⭐ 一個只 grep `libwebp-tools` 的閘會對它說「過」——
    expect(misplaced).toContain("libwebp-tools");
    // ⛔ 而它是壞的，檢查器必須指名 stage。
    const problems = audit(misplaced, needs);
    expect(problems.join("\n")).toMatch(/裝在\*\*前面的 stage\*\*/);
  });

  it("⚠️ sentinel：runtime stage 只裝不跑（沒有 `cwebp -version`）也要紅", () => {
    const silent = ["FROM node:22-alpine AS build", "FROM node:22-alpine", "RUN apk add --no-cache tini libwebp-tools"].join("\n");
    expect(audit(silent, needs).join("\n")).toMatch(/會回非零/);
  });
});

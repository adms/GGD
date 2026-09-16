/**
 * ⏲️ GH#1257 —— 每一個 `test` script 跑 vitest 的工作區套件，vitest **真正讀到的那份設定**都要掛上看門狗。
 *
 * 這是一行接線病（CLAUDE.md 第〇·七）：新開一份 vitest／vite 設定而沒展開 `VITEST_WATCHDOG`
 * ⇒ 那一包卡死又回到「等到有人剛好回頭看」。⛔ 靠記得不行 —— 09-13 那 4 小時 48 分就是記得失效的樣子。
 *
 * ⭐ 讀的是**載入後的設定物件**（vite 的 `loadConfigFromFile`，vitest 啟動時用的同一支），
 *   ⛔ 不是掃原始碼有沒有寫那個字（失敗形態⑥）。找設定照 vitest 的 findUp：套件目錄沒有就是 repo 根那份。
 *   workspace 檔（`vitest.workspace.ts`）裡的每一個 project 也要各自帶著。
 *
 * 突變（2026-09-15）：把 `tools/voxel-gen/vitest.config.ts` 的 `...VITEST_WATCHDOG,` 刪掉 ⇒ 紅並指名它。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
/** vitest 2.1.9 `configFiles` 的順序：同一層 `vitest.config.*` 全部排在 `vite.config.*` 前面。 */
const EXTS = ["ts", "mts", "cts", "js", "mjs", "cjs"];
const CONFIG_NAMES = [...EXTS.map((e) => `vitest.config.${e}`), ...EXTS.map((e) => `vite.config.${e}`)];
/** 真的不該被看住的套件 —— 要寫一個能被反駁的理由。今天是空的。 */
const EXEMPT: Record<string, string> = {};

type TestBlock = { globalSetup?: string | string[]; reporters?: unknown };

function vitestPackages(): string[] {
  const globs = readFileSync(join(REPO, "pnpm-workspace.yaml"), "utf8").match(/^\s*-\s*(\S+)\/\*\s*$/gm) ?? [];
  return globs.flatMap((line) => {
    const base = line.replace(/^\s*-\s*/, "").replace(/\/\*\s*$/, "");
    return readdirSync(join(REPO, base))
      .map((name) => `${base}/${name}`)
      .filter((p) => existsSync(join(REPO, p, "package.json")))
      .filter((p) => /\bvitest\b/.test(JSON.parse(readFileSync(join(REPO, p, "package.json"), "utf8")).scripts?.test ?? ""));
  });
}

it("每一包 vitest 讀到的設定（含 workspace 的每個 project）都掛著看門狗", async () => {
  const vitestReq = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
  const vite = await import(pathToFileURL(join(dirname(vitestReq.resolve("vite/package.json")), "dist/node/index.js")).href);
  // ⚠️ 用執行期路徑 import：靜態 import 會讓 packages/shared 的 tsc 抱怨檔案不在 rootDir 底下（TS6059）
  const { VITEST_WATCHDOG } = (await import(pathToFileURL(join(REPO, "vitest.shared.ts")).href)) as {
    VITEST_WATCHDOG: { globalSetup: [string]; reporters: string[] };
  };
  const packages = vitestPackages();
  expect(packages.length, "一包都沒找到 —— 推導壞了，⛔ 不是全部都看住了").toBeGreaterThan(10);

  const owners = new Map<string, string[]>();
  for (const pkg of packages.filter((p) => !(p in EXEMPT))) {
    const own = CONFIG_NAMES.find((n) => existsSync(join(REPO, pkg, n)));
    const dir = own ? pkg : ".";
    const file = own ?? CONFIG_NAMES.find((n) => existsSync(join(REPO, n)));
    const key = join(dir, String(file));
    owners.set(key, [...(owners.get(key) ?? []), pkg]);
  }
  const unwatched: string[] = [];
  const watched = (t: TestBlock | undefined) =>
    [t?.globalSetup ?? []].flat().includes(VITEST_WATCHDOG.globalSetup[0]) &&
    JSON.stringify(t?.reporters ?? []).includes(JSON.stringify(String(VITEST_WATCHDOG.reporters.slice(-1)[0])));
  const load = async (file: string) =>
    (await vite.loadConfigFromFile({ command: "serve", mode: "test" }, join(REPO, file), join(REPO, dirname(file)), "silent"))?.config;
  for (const [file, pkgs] of owners) {
    if (!watched((await load(file))?.test)) unwatched.push(`${file}（${pkgs.join("、")}）`);
    const ws = join(dirname(file), "vitest.workspace.ts");
    if (!existsSync(join(REPO, ws))) continue;
    // ⚠️ workspace 檔預設匯出的是陣列，`loadConfigFromFile` 只收物件 ⇒ 直接 import（同一個 vite-node 解析）
    const projects = ((await import(pathToFileURL(join(REPO, ws)).href)) as { default: unknown[] }).default;
    for (const project of projects.filter((p): p is { test?: TestBlock } => typeof p === "object"))
      if (!watched(project.test)) unwatched.push(`${ws} 的 project「${String((project.test as { name?: string })?.name)}」`);
  }
  expect(unwatched, "這些設定沒有展開 VITEST_WATCHDOG（或 withVitestWatchdog）—— 卡死時不會自己停").toEqual([]);
}, 60_000);

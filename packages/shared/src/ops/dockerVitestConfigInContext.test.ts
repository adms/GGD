/**
 * ⏲️ GH#1257 修正輪 —— Dockerfile 在映像裡跑 vitest 時，vitest **真的會讀到的那份設定**、它打包進去的每一個檔、
 * 以及它指名的 globalSetup／setupFiles，都要在**那一行之前、同一個 stage** 的 COPY 範圍內（封閉世界，照 clientContentImports.test.ts）。
 *
 * c360c754d 在 apps/editor 新增 `vitest.config.ts`（vitest 的 findUp 同層優先於 vite.config.ts），而它 import `../../vitest.shared`
 * ⇒ `docker/edge.Dockerfile` 的 `pnpm --filter @ggd/editor exec vitest run …` 在映像裡 `Could not resolve` ⇒ edge build 死
 * （本機永遠綠；那份 Dockerfile 的 GH#935 段落記過：edge build 死掉時部署靜默出貨舊映像）。
 * ⛔ clientContentImports.test.ts 只問 app／shared 原始碼的 import，看不見「設定檔」這條路（審查量到它在那個 commit 上是綠的）。
 *
 * ⭐ 依賴清單取自 vite `loadConfigFromFile().dependencies`（vitest 載設定用的同一支打包器），⛔ 不掃原始碼字串（失敗形態⑥）；
 *   findUp 只在「映像裡真的有的檔」之中找（vitest 2.1.9 configFiles 的順序）。
 * 突變（2026-09-15）：拿掉 edge.Dockerfile 那一行的 `--config vite.config.ts` ⇒ 紅，指名 vitest.shared.ts 與 globalSetup.mjs。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXTS = ["ts", "mts", "cts", "js", "mjs", "cjs"];
const CONFIG_NAMES = [...EXTS.map((e) => `vitest.config.${e}`), ...EXTS.map((e) => `vite.config.${e}`)];
/** 工作區套件名 → 目錄（`pnpm --filter <名>` 跑起來的 cwd）。 */
const PKG_DIR = new Map(
  ["apps", "packages", "tools"].flatMap((base) =>
    readdirSync(join(REPO, base))
      .filter((d) => existsSync(join(REPO, base, d, "package.json")))
      .map((d) => [String(JSON.parse(readFileSync(join(REPO, base, d, "package.json"), "utf8")).name), `${base}/${d}`] as const),
  ),
);

it("Dockerfile 裡每一行 vitest 讀到的設定與它的依賴，都在那一行之前被 COPY 進同一個 stage", async () => {
  const vitestReq = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
  const vite = await import(pathToFileURL(join(dirname(vitestReq.resolve("vite/package.json")), "dist/node/index.js")).href);
  const problems: string[] = [];
  let runs = 0;
  for (const df of readdirSync(join(REPO, "docker")).filter((f) => f.endsWith(".Dockerfile"))) {
    let copied: string[] = [];
    for (const line of readFileSync(join(REPO, "docker", df), "utf8").replace(/\\\n/g, " ").split("\n")) {
      if (/^FROM\s/i.test(line)) copied = []; // 新的 stage：前一個 stage 的檔不在這裡
      const copy = /^COPY\s+(?!--from)(.+)$/i.exec(line);
      if (copy) copied.push(...copy[1]!.split(/\s+/).filter((t) => t && !t.startsWith("--")).slice(0, -1));
      if (!/^RUN\s/i.test(line) || !/\bvitest\s+run\b|\bpnpm\b[^&;|]*\s(?:run\s+)?test\b/.test(line)) continue;
      runs++;
      const inImage = (rel: string) =>
        rel.includes("node_modules/") || // pnpm install 裝的
        (existsSync(join(REPO, rel)) && copied.some((c) => (c.endsWith("/") ? rel.startsWith(c) : rel === c)));
      const cwd = PKG_DIR.get(/--filter[=\s]+"?([^\s"]+)"?/.exec(line)?.[1] ?? "") ?? ".";
      const explicit = /\s(?:--config|-c)[=\s]+(\S+)/.exec(line)?.[1];
      let config = explicit ? relative(REPO, resolve(REPO, cwd, explicit)) : undefined;
      for (let d = cwd; !config; d = dirname(d)) {
        config = CONFIG_NAMES.map((n) => join(d, n)).find(inImage);
        if (d === ".") break;
      }
      if (!config) continue; // 映像裡一份設定都找不到 ⇒ vitest 用預設值，沒有東西要驗
      const loaded = await vite.loadConfigFromFile({ command: "serve", mode: "test" }, join(REPO, config), join(REPO, cwd), "silent");
      const t = loaded?.config?.test ?? {};
      const needed = [
        join(REPO, config),
        ...(loaded?.dependencies ?? []).map((p: string) => resolve(p)), // esbuild metafile：相對於 process.cwd()
        ...[t.globalSetup ?? [], t.setupFiles ?? []].flat().map((p: string) => resolve(REPO, cwd, p)),
      ];
      for (const p of new Set(needed.map((abs) => relative(REPO, abs))))
        if (!inImage(p)) problems.push(`docker/${df}「${line.trim().slice(0, 60)}…」讀 ${config} ⇒ 映像裡沒有 ${p}`);
    }
  }
  expect(runs, "Dockerfile 裡一行 vitest 都沒找到 —— 解析壞了，⛔ 不是全部都綠").toBeGreaterThan(0);
  expect(problems, "映像裡的 vitest 會死在載入設定（本機永遠綠）⇒ 補 COPY，或讓那一行用 --config 指一份映像裡解析得到的設定").toEqual([]);
}, 60_000);

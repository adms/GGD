import { fileURLToPath } from "node:url";
import { mergeConfig, type ConfigEnv, type ViteUserConfig } from "vitest/config";

/**
 * Shared module-resolution settings for the repo's vitest projects.
 *
 * WHY THIS EXISTS — the dual-instance registry trap:
 *
 * Vite's default `resolve.extensions` tries `.js` BEFORE `.ts`. A stray
 * compiled `foo.js` sitting next to its `foo.ts` source therefore wins every
 * EXTENSIONLESS relative import — and a bare `tsc some/file.ts` emits exactly
 * that, right beside the source, because naming a file on the command line
 * makes tsc ignore the project tsconfig (and its `noEmit`).
 *
 * Bare `@ggd/shared/*` specifiers do NOT go that route: they resolve through
 * the package's `exports` map, which names the `.ts` file explicitly. So the
 * two routes load the SAME module twice, and the module-level singletons in
 * src/sim/content/registry.ts exist twice over — `registerAll()` fills one
 * copy while `Champions.get()` reads the other, empty one and throws
 * `content not registered: <id>`. That is a silent, confusing failure: the
 * content loads perfectly, it just lands in the wrong instance.
 *
 * Putting TypeScript ahead of JavaScript makes the source win both routes, so
 * a stray artifact can no longer split a singleton in half. The companion
 * guard is packages/shared/src/staleArtifacts.test.ts, which fails loudly if
 * such a file appears at all — it protects the dev-server and production build
 * paths, whose resolution this file deliberately leaves alone.
 */
export const RESOLVE_TS_FIRST = {
  extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
};

/**
 * ⏲️ GH#1257 —— **每一份 vitest 設定都展開這一格**（`test: { ...VITEST_WATCHDOG, … }`）。
 *
 * 09-13 背景全套在 0% CPU 卡了 4 小時 48 分：看門狗 `scripts/watchdog.sh` 早就寫好了，
 * ⛔ 但它是 opt-in，沒有任何入口預設經過它。這一格讓 vitest **自己**在啟動時掛上它：
 *   · `globalSetup` —— 把主行程 pid 交給 `watchdog.sh --attach`（判死準則只住那支）；
 *   · `reporters` —— 多一個只記錄「還沒跑完的檔」的 reporter，開火時印出來。
 * ⚠️ 設定裡寫了 `reporters` 就不會再套 vitest 的預設（`default` ＋ GitHub 上的 `github-actions`，
 *   `resolveConfig` 裡 `if (!resolved.reporters.length)` 那段）⇒ 這裡照它的樣子補回來。
 * ⛔ 新增一份 vitest／vite 設定而沒展開它 ⇒ `packages/shared/src/ops/everyVitestPackageIsWatched.test.ts` 紅。
 * 🔙 `GGD_VITEST_WATCHDOG_OFF=1` 整隻不掛（讀的地方：`tools/vitest-watchdog/globalSetup.mjs`）。
 */
const WATCHDOG_DIR = fileURLToPath(new URL("./tools/vitest-watchdog/", import.meta.url));
export const VITEST_WATCHDOG = {
  globalSetup: [`${WATCHDOG_DIR}globalSetup.mjs`],
  reporters: [
    "default",
    ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : []),
    `${WATCHDOG_DIR}pendingReporter.mjs`,
  ],
};

/**
 * ⏲️ GH#1257 —— 測試設定寫在 `vite.config.ts` 裡、**又會被 docker 正式 build** 的 app
 * （`apps/{admin,client,editor}`）用這一支，住在旁邊一份 `vitest.config.ts`：
 *
 *   export default withVitestWatchdog(viteConfig);
 *
 * ⛔ 不可以直接在 `vite.config.ts` 裡 import 這個檔：`docker/edge.Dockerfile` 只 COPY `apps/<app>/` 與
 *   `packages/shared/`，⇒ `vite build` 解析 `../../vitest.shared` 會在**正式 build** 死掉，而本機永遠綠
 *   （同一個形狀的前科寫在那份 Dockerfile 的 GH#437／#935 註解裡）。
 * ⭐ vitest 找設定是 findUp，同一層 `vitest.config.*` 贏 `vite.config.*` ⇒ 這一份把 vite 設定整份吃進來，
 *   只多展開 `VITEST_WATCHDOG` 一格（`mergeConfig` 對陣列是串接，⛔ 不會蓋掉原本的 include／setupFiles）。
 */
export function withVitestWatchdog(
  viteConfig: ViteUserConfig | ((env: ConfigEnv) => ViteUserConfig | Promise<ViteUserConfig>),
) {
  return async (env: ConfigEnv) =>
    mergeConfig(typeof viteConfig === "function" ? await viteConfig(env) : viteConfig, { test: VITEST_WATCHDOG });
}

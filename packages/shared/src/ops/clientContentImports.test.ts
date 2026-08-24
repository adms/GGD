/**
 * edge 建置的三個 app **靜態 import** 進 `content/` 的每一份檔案，都要在 edge 建置脈絡裡（GH#437）。
 *
 * 這一條擋的是一個**只在正式建置時才響**的故障：
 * `content/` 是 live bind-mount，`docker/edge.Dockerfile` 的 build stage ⛔ 刻意
 * 只 COPY `packages/shared/` 與 `apps/{client,editor,admin}/`。所以 client 原始碼裡
 * 一句 `import x from "../../../../../content/…"` 在**本機**永遠是綠的（vite 看得到
 * 整棵樹），而在映像裡是 rollup 的 `Could not resolve` —— build 直接死。
 *
 * 2026-08-19 就是這樣：`blizzardVfxCredits.ts` 匯入 `PROVENANCE.json`，
 * 3,678 + 5,360 條測試全綠、`pnpm typecheck` EXIT=0、本機 build 也過，
 * 而**線上部署死在 docker build**，留下「新內容 + 舊映像」那個組合。
 *
 * ⚠️ 兩個方向都關：
 *   · import 了但沒 COPY → 紅（正式 build 會死）
 *   · COPY 了但沒人 import → 紅（映像裡多一份沒人用、而且會與 bind-mount 漂開的副本）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 遞迴收集 apps/client/src 底下的 .ts/.tsx（⛔ 不含測試）。 */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

describe("客戶端跨界 import 進 content/ 的檔案（GH#437）", () => {
  it("每一份都在 edge 的建置脈絡裡，且沒有多餘的 COPY", () => {
    // ① 原始碼真的 import 了哪幾份
    // edge 的 build stage 建三個 app，⛔ 不是只有 client —— 三個都要掃。
    const imported = new Set<string>();
    const APPS = ["apps/client/src", "apps/admin/src", "apps/editor/src"];
    for (const f of APPS.flatMap((a) => sources(join(REPO, a)))) {
      const src = readFileSync(f, "utf8");
      // ⚠️ ⛔ 不可以只看字面上的 `../content/` —— client **自己**有一個
      // `apps/client/src/content/`（ContentDb / bootContent / assetVersion），
      // 那些是模組不是內容檔。要**真的解析**出絕對路徑再問「它有沒有跑出 repo 根的
      // content/」（我第一版就漏了這一步，三個誤報）。
      for (const m of src.matchAll(/from\s+"((?:\.\.\/)+[^"]+)"/g)) {
        const abs = resolve(dirname(f), m[1]!);
        // ⭐ 2026-08-25:`tools/` 也算 —— lane L 的 SkillListsPage 靜態 import
        //    `tools/skill-lists/lists.json`,而這條閘當時只掃 content/ ⇒ 綠著上線,
        //    死在正式 build 的 rollup(v0.26.4 部署第一次失敗的根因)。
        //    跨出 apps/**+packages/** 的靜態 import 一律要有成對的 COPY。
        if (
          abs.startsWith(join(REPO, "content") + "/") ||
          abs.startsWith(join(REPO, "tools") + "/")
        ) {
          imported.add(abs.slice(REPO.length + 1));
        }
      }
    }
    // ② Dockerfile 真的 COPY 了哪幾份（⛔ 只認指名到檔案的那種，目錄式的不算）
    const dockerfile = readFileSync(join(REPO, "docker/edge.Dockerfile"), "utf8");
    const copied = new Set<string>();
    // ⚠️ 只認 vite **靜態 import 得進來**的副檔名 —— `tools/deploy/ggd-assets.sh`
    //    是 runtime 工具的 COPY,⛔ 不是建置脈絡的成對義務(第一版擴到 tools/ 時
    //    誤把它算成孤兒)。
    for (const m of dockerfile.matchAll(/^COPY\s+((?:content|tools)\/\S+\.(?:json|ts|tsx|js|css))\s+\S+$/gm)) {
      copied.add(m[1]!);
    }

    const missing = [...imported].filter((p) => !copied.has(p));
    expect(
      missing,
      "這些檔案被 client 原始碼靜態 import，但 docker/edge.Dockerfile 沒把它們帶進建置脈絡 ⇒ " +
        "正式 build 會死在 rollup 的 Could not resolve（而本機全綠）。" +
        "補一行 COPY，或把它改成 `contentAssetUrl` 在執行期抓:\n  " + missing.join("\n  "),
    ).toEqual([]);

    const orphan = [...copied].filter((p) => !imported.has(p));
    expect(
      orphan,
      "Dockerfile 把這些 content/ 檔帶進映像，但沒有任何 client 原始碼 import 它們 ⇒ " +
        "映像裡多一份沒人用、而且會與 bind-mount 漂開的副本。拿掉那行 COPY:\n  " + orphan.join("\n  "),
    ).toEqual([]);
  });
});

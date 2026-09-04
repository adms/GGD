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
 * ⚠️ 三個方向都關：
 *   · import 了但沒 COPY → 紅（正式 build 會死）
 *   · COPY 了但沒人 import → 紅（映像裡多一份沒人用、而且會與 bind-mount 漂開的副本）
 *   · COPY 有寫但檔案仍被 `.dockerignore` 排除 → 紅（BuildKit 算 checksum 時就會死）
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
    // ⭐⭐ `packages/shared/src` 也要掃（2026-09-03）—— ⛔ 在此之前只掃三個 app，
    //   而 rollup **會遞移跟進 shared**：GH#935 把
    //   `import … from "../../../../../docs/editor-contract/ggd-presentation-token-manifest.json"`
    //   放進 `packages/shared/src/content/import/descriptionTokens.ts`
    //   ⇒ 三個 app 的原始碼裡一個字都看不到它 ⇒ 閘綠 ⇒ edge build 死在 rollup。
    //   ⭐ 判準是「**誰會被 bundle 進 client**」，⛔ 不是「這一行寫在哪個資料夾」。
    const APPS = ["apps/client/src", "apps/admin/src", "apps/editor/src", "packages/shared/src"];
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
        // ⭐⭐ **封閉世界的問法**（2026-09-03，第三次同型故障之後改的）——
        //   ⛔ 在此之前這裡是一張**白名單**（`content/` ＋ `tools/`），
        //   而白名單的失敗模式是**沉默**：import 進一個沒列到的目錄 ⇒ 閘看不見 ⇒
        //   本機綠、正式 build 死在 rollup。⭐ 已經發生**三次**：
        //     ① v1 只掃 `content/` ⇒ 漏 `tools/skill-lists/lists.json`（v0.26.4 部署失敗）
        //     ② 2026-08-25 補上 `tools/`
        //     ③ 2026-09-03 GH#935 import 進 `docs/editor-contract/…` ⇒ 又是隱形的，
        //        而 edge build 從它落地起就一直在失敗、每次部署靜默出貨舊映像。
        //   ⇒ ⭐ 改成問這一支自己的註解早就寫對的那一題：
        //     「**跨出 `apps/**` ＋ `packages/**` 的靜態 import 一律要有成對的 COPY**」。
        //   ⛔ 白名單要記得加，封閉世界不用 —— 第四個目錄出現時它自己就會紅。
        const inRepo = abs.startsWith(REPO + "/");
        const isSource =
          abs.startsWith(join(REPO, "apps") + "/") || abs.startsWith(join(REPO, "packages") + "/");
        if (inRepo && !isSource) {
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
    // ⭐ 這一邊也是**封閉世界**（2026-09-03）—— ⛔ 在此之前這個正則寫死
    //   `(?:content|tools)`，於是就算有人補了 `COPY docs/…` 這一格也**看不見它**，
    //   ⇒ 上面那半紅著、而修法明明已經落地 ⇒ 讀起來像「補了沒用」。
    //   ⭐ 兩邊的白名單必須一起拆，⛔ 只拆一邊會得到一條永遠紅的閘。
    for (const m of dockerfile.matchAll(/^COPY\s+([\w.-]+\/\S+\.(?:json|ts|tsx|js|css))\s+\S+$/gm)) {
      // ⭐ 與 import 那一側**同一條線**：`apps/**` 與 `packages/**` 是原始碼，
      //   它們的 `package.json` 是 pnpm 安裝的鷹架（Dockerfile 55-59 行），
      //   ⛔ 不是「跨界 import 的成對義務」⇒ 這條規則不管它們。
      //   ⚠️ 少了這一格，反方向會把那 4 行鷹架讀成「多餘的 COPY」。
      const p = m[1]!;
      if (p.startsWith("apps/") || p.startsWith("packages/")) continue;
      copied.add(p);
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

    // ③ `COPY` 字面存在仍不代表檔案進得了 build context。docs/ 預設被
    // `.dockerignore` 排除，每個機器契約都必須有逐檔否定規則；2026-09-05
    // 真實 edge build 正是在 COPY checksum 階段抓到這個第三種故障。
    const dockerignore = readFileSync(join(REPO, ".dockerignore"), "utf8");
    const explicitlyIncluded = new Set(
      [...dockerignore.matchAll(/^!([^\s#]+)$/gm)].map((match) => match[1]!),
    );
    const excludedCopies = [...copied].filter((path) =>
      path.startsWith("docs/") && !explicitlyIncluded.has(path),
    );
    expect(
      excludedCopies,
      "Dockerfile 雖有 COPY，但這些 docs 檔仍被 .dockerignore 排除 ⇒ 正式 build 會死在 checksum not found。" +
        "請逐檔加入 !path，⛔ 不得開放整個 docs/：\n  " + excludedCopies.join("\n  "),
    ).toEqual([]);
  });
});

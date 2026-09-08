/**
 * 🚦 GH#1122 —— CI 的每一個必跑步驟，要嘛 `ship:check` 也跑、要嘛帶著理由豁免。
 *
 * ## ⛔ 為什麼要這一條（量到的，⛔ 不是假設）
 *
 * 2026-09-09 合併 PR 1118 時，我在本機宣告「全綠」之後被 **CI 連續打回六輪**，
 * ⭐ 而**每一輪紅的都落在我沒跑過的那一格**：
 *
 * | 輪 | CI 紅在哪 | 本機為什麼沒看到 |
 * |---|---|---|
 * | 3 | `go vet` / `go build` | ⛔ 我只跑了 vitest 與 tsc |
 * | 5 | `eslint`（一個真的 `no-undef`） | ⛔ `ship:check` 從來沒跑過 lint |
 * | 5 | Go 測試 | ⭐ 本機**命中快取**回 ok；`-count=1` 才紅 |
 * | 6 | `docker build` | ⭐ 只有真的 build 一次才看得到 |
 *
 * ⇒ ⭐ 這不是「我粗心」——是**兩份清單各自漂**，而沒有任何東西在對帳。
 *
 * ## ⭐ 這一條與 `skillsSyncCoversGenerators.test.ts` 是同一個形狀
 *
 * 那一支守的是「每一支產生器都在聚合指令裡」，這一支守的是
 * 「每一個 CI 必跑步驟都在出貨閘裡」。⛔ 兩者都不是「要記得」。
 *
 * ## ⛔ 豁免要寫得出**為什麼本機不跑它**
 *
 * 一個能被反駁的理由（成本？要 docker daemon？要 root？），
 * ⛔ 不是「還沒排到」。
 *
 * 突變驗證（2026-09-09）：把 `pnpm lint` 從 `ship.mjs` 的 PARALLEL 拿掉 → 紅並指名它。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf-8");
const SHIP = readFileSync(join(ROOT, "tools", "parallel-gates", "ship.mjs"), "utf-8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { scripts: Record<string, string> };

/**
 * ⭐ CI 裡跑的每一個 `pnpm <script>`。
 *
 * ⚠️ 只收 **pnpm 腳本**：`run:` 底下也有 `sudo apt-get`、`touch`、`go test` 這些，
 * 而它們不是「本機該不該跑同一支」的問題（前兩者是 runner 的環境準備）。
 * ⭐ Go 那一條由 `go-test-or-skip.sh` 單獨守著（它在 PARALLEL 裡）。
 */
function ciPnpmScripts(): string[] {
  const out = new Set<string>();
  for (const m of CI.matchAll(/\bpnpm (?:run --if-present |-r --if-present |-s )?([a-z][a-z0-9:_-]*)/g)) {
    const name = m[1]!;
    if (name in PKG.scripts) out.add(name);
  }
  return [...out].sort();
}

/**
 * ⭐ 豁免：**為什麼本機的 `ship:check` 不跑它**。
 * ⛔ 每一列都要能被反駁。
 */
const EXEMPT: Record<string, string> = {
  typecheck: "⭐ **它在 PARALLEL 裡**（`--no-typecheck` 才關掉）—— 這一列只是說明那個旗標的存在。",
  "editor:accept:release":
    "⭐ 它要**編輯器的驗收包 ＋ 畫面證據**（framebuffer 批次），本機沒有那些產物時會誤紅。" +
    "⚠️ 而它讀的那份 `editor-skill-acceptance-42x46.json` **已經在 `skills:check` 裡**驗新鮮度 " +
    "⇒ ⭐ 過期會被抓到，⛔ 只有「跑一次真的驗收」不在本機。" +
    "反駁法：哪天它不再需要畫面證據就加進 PARALLEL。",
  "todo:runtime":
    "⭐ **順序相依,⛔ 不是漏掉** —— 它吃 vitest 的**覆蓋率產物**當參數：" +
    "CI 是 `find …/coverage -name '*.ndjson' -exec cat + > merged` 之後才 " +
    "`pnpm todo:runtime <merged>`。⇒ 塞進 `ship.mjs` 的**並行段**會在覆蓋率還沒寫出來時跑," +
    "而它會回 exit 2（實測 2026-09-09：`--runtime requires a path to the coverage NDJSON file`）。" +
    "⚠️ 那會是一個**永遠紅的閘**,而本文件記過那種閘等於沒有閘。" +
    "⭐ 反駁法：把它接成 ship 的**序列尾段**（vitest 之後）就刪掉這一列 —— " +
    "⛔ 而那要先讓 ship 的 vitest 開覆蓋率信標,那是另一張票的大小。",
  "todo:check":
    "⭐ 它掃的是**原始碼裡的 TODO 標記**，而那件事 `pnpm lint` 與 code review 都會碰到；" +
    "⚠️ 它在 CI 是**秒級**的靜態閘，本機加進去只是讓地板多一格。" +
    "反駁法：它抓到過一次真缺陷 ⇒ 就加進 PARALLEL。",
};

describe("ship:check 涵蓋 CI 的必跑步驟（GH#1122）", () => {
  it("CI 裡的每一個 pnpm 腳本，要嘛 ship 也跑、要嘛在豁免表裡帶理由", () => {
    const missing: string[] = [];
    for (const name of ciPnpmScripts()) {
      if (name in EXEMPT) continue;
      // ⭐ 判準是 `ship.mjs` 的原始碼**提到那個腳本名**（PARALLEL / SERIAL 都算）。
      const inShip = SHIP.includes(`"${name}"`);
      if (!inShip) missing.push(name);
    }
    expect(
      missing,
      `⛔ CI 會跑而 ship:check 不跑，也沒有豁免理由：${missing.join(" · ")}\n` +
        `⭐ 修法二選一：加進 tools/parallel-gates/ship.mjs 的 PARALLEL，` +
        `或在這一條的 EXEMPT 裡寫下**為什麼本機不跑它**（⛔ 不是「還沒排到」）。`,
    ).toEqual([]);
  });

  it("豁免表裡沒有**已經被涵蓋**的死列（⭐ 反方向）", () => {
    const stale = Object.keys(EXEMPT).filter((n) => !ciPnpmScripts().includes(n));
    expect(stale, `⛔ 這幾列豁免的腳本 CI 根本不跑了 ⇒ 刪掉：${stale.join(" · ")}`).toEqual([]);
  });

  it("Go 測試帶 -count=1（⭐ 本機快取會讓它在最需要說話時沉默）", () => {
    const sh = readFileSync(join(ROOT, "scripts", "go-test-or-skip.sh"), "utf-8");
    expect(sh, "⛔ go-test-or-skip.sh 沒有 -count=1 —— 本機命中快取回 ok 而 CI 紅（2026-09-09 實際發生）").toMatch(
      /go .*test .*-count=1/,
    );
  });
});

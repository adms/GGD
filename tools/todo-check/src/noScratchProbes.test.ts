/**
 * noScratchProbes.test.ts — 探測檔不可以住在 `src/` 樹裡。
 *
 * ── 為什麼有這個檔案 (2026-08-02) ─────────────────────────────────────────
 *
 * CLAUDE.md 寫著：「不要 `git add -A`。暫存/探測檔寫 `/private/tmp`，不要留在 repo。」
 *
 * 這條規則**被違反了四次，而且四次都被 commit 進來，零偵測**：
 *
 *   apps/client/src/vfx/probe.scratch.test.ts              (b50373c3)
 *   apps/game-server/src/match/__mana_probe.test.ts        (4d5ecdb7)
 *   apps/game-server/src/match/__autoattack_probe.test.ts  (4d5ecdb7)
 *   apps/game-server/src/match/__pacing_probe.test.ts      (c4ef6372)
 *
 * 而且同一個下午又差點多兩支（`zzprobe1.test.ts` / `zzprobe2.test.ts`，其中一支
 * 讓 `apps/client` 全套變紅，是複驗者發現的，不是任何機制）。
 *
 * ── 為什麼這是缺陷不是潔癖 ───────────────────────────────────────────────
 *
 * 寫進 `src/` 就會命中 vitest 的 glob，於是它們**每一次跑套件都真的執行**：
 *   · 四支合計 14 個 `console.log`，把診斷傾印混進測試輸出
 *   · 兩支（`__mana_probe` / `__pacing_probe`）**`expect()` 次數是 0** ——
 *     它們不是測試，是會自動執行的診斷腳本。永遠不會紅，也永遠不會告訴任何人任何事。
 *   · `__mana_probe` 跑真的 bot 比賽（267 行），成本掛在每一個人的每一次 `pnpm test` 上
 *
 * 「一條把實作關鍵行刪掉還是綠的測試不是守衛」（第二守則）—— 一個 0 個 expect
 * 的檔案連那個標準都談不上。
 *
 * ── 這條守衛的形狀 ───────────────────────────────────────────────────────
 *
 * 現存的四支放進 {@link KNOWN_PROBE_DEBT}，**每一列帶來源 commit 與該不該留的判斷**。
 * 那不是免死金牌，是帳單：清單的長度被釘死，所以
 *   · 多一支新的 → 紅（這是它存在的理由）
 *   · 刪掉一支舊的 → 也紅，強迫把那一列從清單拿掉（帳單不會自己過期成永久豁免）
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** 檔名長這樣就是探測檔，不是測試。 */
// ⚠️ `\d*` 不是裝飾：第一版沒有它，`zzprobe1.test.ts`（真的出現過的那一支）
// **認不出來**，而它正是這條守衛的動機之一。守衛自己的 GUARD-THE-GUARD 抓到的。
const PROBE_NAME = /(^|[._-])(probe|scratch|zzprobe|tmp|junk)\d*([._-]|$)|\.scratch\./i;

interface ProbeDebt {
  readonly path: string;
  /** 它是哪一次 commit 帶進來的。 */
  readonly commit: string;
  /** 為什麼還在（以及它到底有沒有在驗東西）。 */
  readonly why: string;
}

/**
 * 已經在版控裡的探測檔。**這是帳單，不是豁免。**
 *
 * ⚠️ 每一列都要說出「它有沒有 expect()」——因為那才是「它是不是測試」的判準。
 * 兩支 0 expect 的應該直接刪掉，只是那要由知道那次調查還需不需要它的人來按。
 */
const KNOWN_PROBE_DEBT: readonly ProbeDebt[] = [
  {
    path: "apps/client/src/vfx/probe.scratch.test.ts",
    commit: "b50373c3",
    why: "檔頭自稱 scratch probe（VfxSystem 的池子跨回合會不會單調成長）。1 個 expect、1 個 console.log。#262 特效洩漏那條線的取證，那條還沒結案，所以先留著。",
  },
  {
    path: "apps/game-server/src/match/__mana_probe.test.ts",
    commit: "4d5ecdb7",
    why: "#265「魔力倍率太高用不完」的取證，跑真的 bot 比賽逐 tick 取樣。**expect() 次數 0、console.log 8 次** —— 它不是測試，是掛在每個人每次 pnpm test 上的診斷腳本。#265 已結案，這一支該刪。",
  },
  {
    path: "apps/game-server/src/match/__autoattack_probe.test.ts",
    commit: "4d5ecdb7",
    why: "#265「Saber 不會自動攻擊」的活路徑取證。1 個 expect、4 個 console.log。#221 已上線並有正規守衛，這一支的內容應該併進那些守衛再刪。",
  },
  {
    path: "apps/game-server/src/match/__pacing_probe.test.ts",
    commit: "c4ef6372",
    why: "回合節奏取證，讀 combat-env 算 TTK。**expect() 次數 0** —— 純傾印。它的結論已經寫進 docs，這一支該刪。",
  },
];

/**
 * 掃哪些根。
 *
 * ⚠️ **`tools/` 刻意不掃**，而這不是偷懶：`tools/uptime-probe/` 是一個正當的
 * 套件，它的名字裡就有 probe。第一版把 tools 掃進來，守衛第一次跑就對它誤報兩筆。
 * 一條會誤報的守衛三個月後沒有人會讀 —— 而這條守衛要守的東西（「調查用的暫存檔
 * 混進出貨樹」）只發生在 `apps/` 與 `packages/`，`tools/` 本來就是開發工具，
 * 不會被打包進客戶端或伺服器。
 */
const SRC_ROOTS = ["apps", "packages"];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/** `apps/<pkg>/src` 與 `packages/<pkg>/src` 底下遞迴的每一個檔（相對 repo 根）。 */
function sourceTreeFiles(): string[] {
  const out: string[] = [];
  for (const root of SRC_ROOTS) {
    let pkgs: string[];
    try {
      pkgs = readdirSync(join(REPO, root));
    } catch {
      continue;
    }
    for (const pkg of pkgs) {
      const src = join(REPO, root, pkg, "src");
      try {
        if (!statSync(src).isDirectory()) continue;
      } catch {
        continue;
      }
      walk(src, out);
    }
  }
  return out.map((f) => relative(REPO, f));
}

function probeFiles(): string[] {
  return sourceTreeFiles().filter((f) => {
    const base = f.slice(f.lastIndexOf("/") + 1);
    return PROBE_NAME.test(base.replace(/\.test\.tsx?$/, ""));
  });
}

describe("探測檔不可以住在 src/ 樹裡（CLAUDE.md：暫存檔寫 /private/tmp）", () => {
  it("GUARD THE GUARD：真的掃到東西了（不是空目錄、不是壞路徑）", () => {
    // 一條掃到 0 個檔的守衛，對任何新增的探測檔都會是綠的。
    // 這個專案的前例：bundle.test.ts 驗的是打包器而不是出貨那一份，
    // 759 條全綠的情況下推了一份過期的 bundle 上線。
    const all = sourceTreeFiles();
    // 門檻是**量到的值往下抓**，不是猜的：2026-08-02 實際掃到 1808 個檔。
    // ⚠️ 第一版我憑印象寫 2000，守衛第一次跑就自己紅給我看 —— 這正是
    // GUARD-THE-GUARD 該有的行為，記在這裡當範例。
    expect(all.length, "掃到的原始碼檔數量異常少 —— 路徑或 walk 壞了，這條守衛已經是真空").toBeGreaterThan(
      1200,
    );
    expect(all.some((f) => f.endsWith(".ts"))).toBe(true);
    // 正規式本身也要被驗一次：它認得出典型的探測檔名。
    for (const name of ["probe.scratch.test", "__mana_probe.test", "zzprobe1.test", "x.scratch.ts"]) {
      expect(PROBE_NAME.test(name.replace(/\.test$/, "")), `正規式認不出 ${name}`).toBe(true);
    }
    // 而且不會誤傷正常檔名（`legendary` 曾經因為含 `legend` 誤中另一條守衛）。
    for (const name of ["probeless", "approbation", "itemCardText", "HudRoot"]) {
      expect(PROBE_NAME.test(name), `正規式誤傷 ${name}`).toBe(false);
    }
  });

  it("★ 沒有新的探測檔溜進 src/ 樹", () => {
    const known = new Set(KNOWN_PROBE_DEBT.map((d) => d.path));
    const strays = probeFiles().filter((f) => !known.has(f));
    expect(
      strays,
      "有探測檔住在 src/ 樹裡而且不在已知帳單上。\n" +
        "CLAUDE.md：「暫存/探測檔寫 /private/tmp，不要留在 repo」。\n" +
        "寫進 src/ 會命中 vitest 的 glob —— 它會在每一個人的每一次 pnpm test 上執行。\n" +
        `新出現的：${strays.join(", ")}`,
    ).toEqual([]);
  });

  it("★ 帳單不會自己長大，也不會自己過期成永久豁免", () => {
    // 長度釘死：多一列要有人明著改這個數字（＝有人看過那一列的理由）。
    expect(
      KNOWN_PROBE_DEBT.length,
      "帳單長度變了。多一支 = 這條守衛正在被繞過；少一支 = 有人刪了檔案，請一起刪那一列。",
    ).toBe(4);
    for (const d of KNOWN_PROBE_DEBT) {
      expect(d.why.length, `${d.path} 的理由太短，寫不出「它有沒有在驗東西」`).toBeGreaterThan(40);
      expect(d.commit).toMatch(/^[0-9a-f]{7,40}$/);
    }
  });

  it("★ 帳單上的檔案真的存在（刪掉了就該把那一列拿掉）", () => {
    const onDisk = new Set(probeFiles());
    const gone = KNOWN_PROBE_DEBT.filter((d) => !onDisk.has(d.path)).map((d) => d.path);
    expect(
      gone,
      "帳單指到不存在的檔案 —— 有人刪了探測檔（很好），請把那一列也刪掉並把上面的長度改掉。",
    ).toEqual([]);
  });

  it("★ 帳單有記錄「哪幾支根本沒有 expect()」—— 那些不是測試", () => {
    // ⚠️ 這一條驗的是**事實**不是文字：真的去數那些檔案裡的 expect(。
    // 一支 0 expect 的 .test.ts 永遠不會紅，它只是一個會自動執行的 console.log 腳本。
    const zeroExpect = KNOWN_PROBE_DEBT.filter((d) => {
      const src = readFileSync(join(REPO, d.path), "utf8");
      return !/\bexpect\s*\(/.test(src);
    }).map((d) => d.path);
    expect(zeroExpect.length, "帳單裡應該有 0-expect 的檔（目前兩支）").toBeGreaterThan(0);
    for (const p of zeroExpect) {
      const row = KNOWN_PROBE_DEBT.find((d) => d.path === p)!;
      expect(
        row.why,
        `${p} 的 expect() 是 0，但帳單的理由沒有講出這件事 —— ` +
          "「它不是測試」是決定該不該刪的關鍵事實，不能漏掉。",
      ).toMatch(/expect\(\) 次數 0|沒有 expect|純傾印/);
    }
  });
});

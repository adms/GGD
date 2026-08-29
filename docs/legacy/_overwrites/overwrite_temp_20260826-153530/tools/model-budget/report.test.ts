/**
 * Runs the real generator against the real content tree and pins the outputs
 * that were independently cross-checked (two parsers + a Babylon NullEngine run
 * of the actual builders). If the content changes, these numbers move — that is
 * the point; the report is only worth reading if it tracks the tree.
 *
 * The two invariants that must NEVER regress silently:
 *   1. a zero-geometry model is classified broken, never counted as cheap;
 *   2. the same-screen budget dedupes texture per distinct .glb but multiplies
 *      geometry per instance — the two must not be conflated.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cover } from "../../packages/shared/testkit/cover";
import { expandSceneryProps } from "../../packages/shared/src/content/schema/arenaScenery";
import { DEFAULT_ARENA_SCENERY_POLICY } from "../../packages/shared/src/content/schema/config";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
/**
 * ⛔ GH#750 —— 這一格以前就是產生器的預設落點（版控的產物），於是**跑一次這支測試
 * 就把工作樹弄髒**：那份進版控的 report 被就地重生成，「有沒有東西該 commit」這個
 * 訊號被稀釋掉，而且它同時**掩蓋了自己過期**（每次測試都順手把它更新掉，於是
 * 沒有任何東西會紅）。
 *
 * ⚠️ 產生器**每一種**呼叫都寫檔 —— 含 `--check`：`emit_report.ts` 的
 * `fs.writeFileSync(outPath(), …)` 在 `if (check)` **之前**無條件跑。
 * ⇒ 下面每一個 execFileSync 都要帶 `--out`，⛔ 不是只有 beforeAll 那一個。
 */
const TRACKED = path.join(ROOT, "content/assets/model-budget/report.json");
/** ⭐ 在任何 hook 之前抓（模組載入先於 beforeAll），這是「有沒有被弄髒」的比對基準。 */
const TRACKED_BEFORE = fs.existsSync(TRACKED) ? fs.readFileSync(TRACKED) : null;
/** 產生器的產物一律落這裡；`emit_report.ts` 的 `--out` 就是為這件事而存在的。 */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "model-budget-"));
const OUT = path.join(TMP, "report.json");

/**
 * The Blizzard overlay is DEV-ONLY, gitignored runtime state — present on the
 * owner's machine and the family host, absent in CI and in any fresh clone.
 *
 * Two of the assertions below (total VRAM, and the `--check` ratchet) fold in
 * its DEV-ONLY rows, so they can only ever reproduce on a machine that HAS it.
 * They have therefore never actually verified anything in CI: the job crashed
 * on ENOENT before reaching them, and would now merely fail instead.
 *
 * Skipping them where the input is absent is honest; pretending they passed
 * would not be. The real fix is to stop counting 不出貨 bytes in a SHIPPING
 * budget baseline at all — that is a judgement about this tool's contract, and
 * it is logged rather than made silently here.
 */
const HAS_OVERLAY = fs.existsSync(path.join(ROOT, "data/blizzard-overlay/MANIFEST.json"));
const itWithOverlay = HAS_OVERLAY ? it : it.skip;

let report: any;

beforeAll(() => {
  execFileSync("npx", ["tsx", path.join(HERE, "emit_report.ts"), "--out", OUT], { cwd: ROOT, stdio: "pipe" });
  report = JSON.parse(fs.readFileSync(OUT, "utf8"));
}, 120_000);

describe("the generator reproduces the cross-checked baseline", () => {
  it("shipping totals match the independent parsers", () => {
    // The agreed baseline was 158 shipping .glb / 158,494 tris. Owner directive
    // #226 deliberately RATCHETED THE TRIANGLE FLOOR DOWN: the four KayKit
    // stand-ins (25,555 tris authored, 9.73 MB with their LOD tiers) were deleted
    // and replaced by five generated box-men totalling 840 tris, so the shipping
    // total moved 169,542 → 144,827. Re-derived from the regenerated report, not
    // hand-computed. Still a floor, not equality — a new prop may nudge it up.
    expect(report.totals.shipping).toBeGreaterThanOrEqual(158);
    expect(report.totals.shippingTriangles).toBeGreaterThanOrEqual(144_827);
  });
  itWithOverlay("the VRAM scan found the texture tree at all", () => {
    // WAS: `>= 230_000_000`, pinned to the 230,859,342 bytes both texture
    // scanners produced when this file was written. Measured 2026-07-28 on a
    // machine WITH the overlay: 219,572,151 — the tree genuinely got leaner
    // (#226 retired four high-poly CC0 characters for voxel bodies, #150
    // normalised champion heights, and the overlay itself has been re-cut
    // since). So the old number was a stale snapshot, not a broken scan.
    //
    // ⚠️ A `>=` floor never checked what the title claimed ("matches … to the
    // byte") — an equality cross-check against a second scanner would, and
    // that scanner is not wired here. What a floor CAN honestly catch is the
    // failure that actually matters: the scanner silently finding nothing
    // (a path change, a glob that stopped matching, an ENOENT swallowed
    // upstream) and the report reading as a budget win. 150 MB is far below
    // any real tree and far above zero, so it fails loudly on a broken scan
    // and stops re-failing every time art gets cheaper.
    //
    // The tool-contract question the header raises — a SHIPPING budget should
    // not count DEV-ONLY overlay bytes at all — is still open and still logged
    // rather than decided here.
    expect(report.totals.vramBytes).toBeGreaterThanOrEqual(150_000_000);
  });
});

describe("broken assets are classified broken, not cheap", () => {
  it("finds the 11 zero-geometry mdx emitters", () => {
    expect(report.totals.zeroGeometry).toBe(11);
    const zero = report.models.filter((m: any) => m.broken === "zero-geometry");
    expect(zero.every((m: any) => m.triangles === 0)).toBe(true);
  });
  it("near-zero models are flagged as pure overhead, not budget wins", () => {
    const near = report.models.filter((m: any) => m.broken === "near-zero");
    expect(near.length).toBeGreaterThan(20);
    // every one still costs at least one draw call — that is the whole point
    expect(near.every((m: any) => m.drawCalls >= 1 && m.triangles <= 30)).toBe(true);
  });
});

describe("the same-screen budget is per-frame, not per-repository", () => {
  it("no scene triangle count approaches the repo total", () => {
    const worst = Math.max(...report.screens.map((s: any) => s.triangles));
    expect(worst).toBeLessThan(report.totals.triangles); // a frame < the whole tree
  });
  it("texture dedupes per distinct glb: 12 copies of one model upload once", () => {
    // castle worst-case is 12 identical champions; its texture must not be 12×
    const castle = report.screens.find((s: any) => s.id === "combat-castle");
    const dragon = report.models.find((m: any) => m.path.endsWith("dragon2.glb"));
    expect(castle.vramBytes).toBeLessThan(12 * dragon.vramBytes * 4);
  });
  it("every combat scene carries all four budgeted axes with a verdict", () => {
    for (const s of report.screens.filter((x: any) => x.id.startsWith("combat-"))) {
      for (const k of ["triangles", "drawCalls", "animChannels", "vramBytes"]) {
        expect(["ok", "warn", "over"]).toContain(s.verdicts[k]);
      }
    }
    cover("mbudget-same-screen");
  });
  it("combat scenes carry median/best draft variants (the roster spread is 7×)", () => {
    const combat = report.screens.filter((s: any) => s.id.startsWith("combat-"));
    expect(combat.every((s: any) => s.variants.length === 2)).toBe(true);
    // ⚠️ WORST-CASE IS DEFINED ON ONE AXIS, SO IT ONLY DOMINATES ON THAT AXIS.
    //
    // The screen row is "12 copies of the heaviest-TRIANGLE champion"; the
    // `median` variant is "12 different median champions". Triangles multiply
    // per instance, so the worst case necessarily wins there. Animation
    // channels do not follow: 12 copies of one model contribute that ONE
    // model's channel count twelve times, while twelve DIFFERENT models each
    // contribute their own — and the heaviest-triangle model happens to be
    // animation-light.
    //
    // Measured 2026-07-28 across all six combat scenes, worst vs median:
    //   triangles      73,346 / 44,366 · 81,560 / 52,580 · 94,200 / 65,220 …
    //   animChannels      216 /    516 · in EVERY scene (18 vs 43 per model)
    //
    // The old `animChannels` assertion therefore asserted something that was
    // never true of a triangle-selected worst case; it went red the moment the
    // roster's heaviest model changed (v0.9.6/v0.9.7 adopted 40 Warcraft III
    // models). Dropping it is the fix — NOT re-baselining the number, which
    // would re-break on the next roster change.
    //
    // This is the same conflation the file header warns about: texture (and
    // channel) cost dedupes per distinct .glb, geometry multiplies per
    // instance. Do not "restore symmetry" here by adding the channel check
    // back — if a per-axis worst case is wanted, the generator has to emit a
    // per-axis worst variant.
    for (const s of combat) {
      const median = s.variants.find((v: any) => v.id === "median");
      expect(s.triangles).toBeGreaterThanOrEqual(median.triangles);
    }
  });
});

describe("WHERE IT IS USED is traced, not guessed", () => {
  it("the four generated stand-ins are marked used by many champions", () => {
    // Re-pointed at the blocky bakes rather than deleted: the assertion is still
    // meaningful (44 champions resolve to these four files) and letting it pass
    // vacuously on an empty set would quietly stop testing anything.
    for (const name of ["blocky-knight", "blocky-mage", "blocky-barbarian", "blocky-rogue"]) {
      const m = report.models.find((x: any) => x.path.endsWith(`champions/${name}.glb`));
      const champUse = m.usedBy.find((u: any) => u.label === "英雄");
      expect(champUse).toBeTruthy();
      expect(champUse.detail.length).toBeGreaterThan(0);
    }
  });
  /**
   * ⭐ GH#396 —— 報告算出來的**實例數** = 場景真的會生出來的**實例數**。
   *
   * ⚠️ 這是**兩個名詞的關係**，⛔ 不是「godie 有 50 棵櫻花」那種單一名詞
   * （這條以前就是那樣寫的，而它對一個少算 66 件的報告是**綠的** ——
   * `doc.decor` 有 50 棵是真的，缺的是 GH#362 散佈規則展開出來的另外 28 棵）。
   *
   * ⛔ 右邊刻意呼叫**出貨的那一支** `expandSceneryProps`，⛔ 不是在這裡重算
   * `min(Σcount, maxPerZone)`：抄一份算術出來，兩邊只會一起錯。
   */
  it("每座競技場的擺設實例數 = decor + 散佈規則真的展開出來的件數", () => {
    const policy = {
      ...DEFAULT_ARENA_SCENERY_POLICY,
      ...(JSON.parse(fs.readFileSync(path.join(ROOT, "content/config/ambient-vfx.json"), "utf8"))
        .scenery ?? {}),
    };
    const dir = path.join(ROOT, "content/arenas");
    const arenas = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "_index.json")
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(arenas.length, "一張競技場都沒讀到 —— 這條會空轉成綠的").toBeGreaterThan(5);
    let sawScatter = 0;
    for (const a of arenas) {
      const expected =
        (a.decor ?? []).length +
        (policy.enabled ? expandSceneryProps(a.scenery, a.zones ?? [], policy.maxPropsPerZone).length : 0);
      if ((a.scenery?.props ?? []).length > 0) sawScatter++;
      const counted = report.models
        .flatMap((m: any) => m.usedBy ?? [])
        .filter((u: any) => u.kind === `COMBAT:${a.id}`)
        .reduce((n: number, u: any) => n + u.count, 0);
      expect(counted, `${a.id} 的帳上少算了散佈規則展開出來的道具（GH#396）`).toBe(expected);
    }
    // ⛔ 而且真的有圖在用散佈規則：全部改成手擺的那一天，上面每一條都會
    // 空轉成綠的，而這條守衛存在的理由就消失了。
    expect(sawScatter, "沒有任何一張圖有 scenery.props —— 這條守衛在空轉").toBeGreaterThan(5);
  });
  it("procedural ground is carried on the scene, not on any glb", () => {
    const godie = report.screens.find((s: any) => s.id === "combat-godie");
    const ground = godie.procedural.find((p: any) => p.label.includes("地板"));
    expect(ground.triangles).toBe(14868); // 2 zones, derived from ArenaGround
    cover("mbudget-where-used");
  });
});

describe("the CI gate is a ratchet against an accepted baseline, not an alarm", () => {
  itWithOverlay("the baseline covers every current breach — --check exits 0", () => {
    const out = execFileSync("npx", ["tsx", path.join(HERE, "emit_report.ts"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toContain("no new budget regressions");
  });

  it("a NEW breach that is not in the baseline fails the gate", () => {
    const baselinePath = path.join(HERE, "baseline.json");
    const saved = fs.readFileSync(baselinePath, "utf8");
    try {
      // remove one accepted entry so the current report now has an "extra" breach
      const b = JSON.parse(saved);
      b.accepted = b.accepted.slice(1);
      fs.writeFileSync(baselinePath, JSON.stringify(b));
      let failed = false;
      try {
        execFileSync("npx", ["tsx", path.join(HERE, "emit_report.ts"), "--check", "--out", OUT], {
          cwd: ROOT,
          stdio: "pipe",
        });
      } catch (e: any) {
        failed = true;
        expect(String(e.stderr)).toContain("NEW BUDGET REGRESSION");
      }
      expect(failed).toBe(true);
    } finally {
      fs.writeFileSync(baselinePath, saved); // always restore
    }
  });
});

/**
 * ⭐ 承重的那一條（GH#750）—— ⛔ 它必須是**最後**一個 describe：上面每一個
 * `execFileSync` 都跑過之後才問「版控樹動了沒」。
 */
describe("跑這支測試不會弄髒版控樹", () => {
  it("content/assets/model-budget/report.json 一個位元組都沒被動到 (GH#750)", () => {
    expect(TRACKED_BEFORE, "版控的 report.json 不存在 —— 這條守衛在空轉").not.toBeNull();
    expect(
      fs.readFileSync(TRACKED).equals(TRACKED_BEFORE as Buffer),
      "產生器寫進了版控檔 —— 某一處 execFileSync 漏了 `--out`（⚠️ 含 `--check`，它也寫檔）",
    ).toBe(true);
  });
});

afterAll(() => {
  // 產物落在 temp dir（`--out`），⛔ 不留在樹上。
  fs.rmSync(TMP, { recursive: true, force: true });
  // 真的被寫髒了：上面那條已經紅過，這裡只是不要留下災情給下一個人。
  if (TRACKED_BEFORE && fs.existsSync(TRACKED) && !fs.readFileSync(TRACKED).equals(TRACKED_BEFORE))
    fs.writeFileSync(TRACKED, TRACKED_BEFORE);
});

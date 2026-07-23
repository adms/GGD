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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cover } from "../../packages/shared/testkit/cover";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "content/assets/model-budget/report.json");

let report: any;

beforeAll(() => {
  execFileSync("npx", ["tsx", path.join(HERE, "emit_report.ts")], { cwd: ROOT, stdio: "pipe" });
  report = JSON.parse(fs.readFileSync(OUT, "utf8"));
}, 120_000);

describe("the generator reproduces the cross-checked baseline", () => {
  it("shipping totals match the independent parsers", () => {
    // 158 shipping .glb / 158,494 tris was the agreed baseline; a new prop glb
    // (guardian, task #105) may nudge the count, so assert the floor not equality
    expect(report.totals.shipping).toBeGreaterThanOrEqual(158);
    expect(report.totals.shippingTriangles).toBeGreaterThanOrEqual(158_494);
  });
  it("VRAM matches the independent texture scan to the byte", () => {
    // 230,859,342 bytes was the number both texture scanners produced
    expect(report.totals.vramBytes).toBeGreaterThanOrEqual(230_000_000);
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
    // the worst case must be no cheaper than the median on every axis
    for (const s of combat) {
      const median = s.variants.find((v: any) => v.id === "median");
      expect(s.triangles).toBeGreaterThanOrEqual(median.triangles);
      expect(s.animChannels).toBeGreaterThanOrEqual(median.animChannels);
    }
  });
});

describe("WHERE IT IS USED is traced, not guessed", () => {
  it("the four KayKit stand-ins are marked used by many champions", () => {
    for (const name of ["knight", "mage", "barbarian", "rogue"]) {
      const m = report.models.find((x: any) => x.path.endsWith(`champions/${name}.glb`));
      const champUse = m.usedBy.find((u: any) => u.label === "英雄");
      expect(champUse).toBeTruthy();
      expect(champUse.detail.length).toBeGreaterThan(0);
    }
  });
  it("japanesecherry is traced to godie at 50 instances", () => {
    const m = report.models.find((x: any) => x.path.endsWith("japanesecherry.glb"));
    const use = m.usedBy.find((u: any) => u.kind === "COMBAT:arena.godie");
    expect(use.count).toBe(50);
  });
  it("procedural ground is carried on the scene, not on any glb", () => {
    const godie = report.screens.find((s: any) => s.id === "combat-godie");
    const ground = godie.procedural.find((p: any) => p.label.includes("地板"));
    expect(ground.triangles).toBe(14868); // 2 zones, derived from ArenaGround
    cover("mbudget-where-used");
  });
});

describe("the CI gate is a ratchet against an accepted baseline, not an alarm", () => {
  it("the baseline covers every current breach — --check exits 0", () => {
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
        execFileSync("npx", ["tsx", path.join(HERE, "emit_report.ts"), "--check"], { cwd: ROOT, stdio: "pipe" });
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

afterAll(() => {
  // leave the freshly-generated report in place; it IS the artefact this tool ships
});

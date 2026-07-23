/**
 * mbudget-worklist — the offline batch-optimiser entrypoint classifies the
 *                    report's verdicts into the only buckets a batch pass can
 *                    act on: an oversized texture or too much geometry becomes
 *                    an ACTION with a concrete target; a draw-call / anim-channel
 *                    breach is named as re-authoring, never dressed up as
 *                    "optimise"; a broken emitter is set aside. The queue is
 *                    ordered heaviest-first and each item carries a real .glb
 *                    path the optimiser can consume.
 * mbudget-worklist-real — the same builder run over the SHIPPED report produces
 *                    a valid, non-empty worklist whose every item is a real file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "../../packages/shared/testkit/cover";

import { WORKLIST_SCHEMA, buildWorklist, type BudgetReportLike } from "./worklist";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const GATES = [
  { role: "champion", tris: { warn: 16000, limit: 28000 }, meshes: { warn: 3, limit: 5 }, texEdge: { warn: 512, limit: 1024 }, channels: { warn: 35, limit: 55 } },
  { role: "hero-prop", tris: { warn: 20000, limit: 40000 }, meshes: { warn: 12, limit: 20 }, texEdge: { warn: 1024, limit: 1024 }, channels: { warn: 120, limit: 200 } },
  { role: "arena-decor", tris: { warn: 4000, limit: 8000 }, meshes: { warn: 1, limit: 2 }, texEdge: { warn: 512, limit: 1024 }, channels: { warn: 0, limit: 0 } },
];

/** A representative report: a texture-heavy champion, a geometry-heavy prop,
 *  an asset that is over only on axes nothing can auto-fix, a broken emitter,
 *  a clean model, and a scene over its cap. */
const REPORT: BudgetReportLike = {
  schema: "model-budget@1",
  generatedAt: "2026-07-22T00:00:00Z",
  gates: GATES,
  screens: [
    { id: "combat-castle", label: "城堡", verdicts: { triangles: "ok", drawCalls: "warn", animChannels: "over", vramBytes: "over" } },
    { id: "login", label: "登入", verdicts: { triangles: "ok", drawCalls: "warn", vramBytes: "ok" } },
  ],
  models: [
    // champion: texture at warn (1024→512) AND over on draw calls + anim channels
    {
      id: "champ.big", path: "assets/models/champions/big.glb", role: "champion",
      triangles: 6000, drawCalls: 13, animChannels: 120, maxTextureEdge: 1024, vramBytes: 5_592_405, worstCount: 12,
      verdicts: { triangles: "ok", drawCalls: "over", maxTextureEdge: "warn", animChannels: "over" },
    },
    // prop: geometry over (needs decimation, #115) — lighter VRAM than the champion
    {
      id: "prop.statue", path: "assets/models/props/statue.glb", role: "hero-prop",
      triangles: 55000, drawCalls: 4, animChannels: 0, maxTextureEdge: 512, vramBytes: 1_000_000, worstCount: 1,
      verdicts: { triangles: "over", drawCalls: "ok", maxTextureEdge: "ok", animChannels: "ok" },
    },
    // over ONLY on anim channels — no automated pass fixes this → needsReauthor
    {
      id: "champ.dancer", path: "assets/models/champions/dancer.glb", role: "champion",
      triangles: 5000, drawCalls: 2, animChannels: 90, maxTextureEdge: 256, vramBytes: 400_000, worstCount: 12,
      verdicts: { triangles: "ok", drawCalls: "ok", maxTextureEdge: "ok", animChannels: "over" },
    },
    // broken emitter — pure overhead, nothing to optimise
    {
      id: "vfx.spark", path: "assets/models/vfx/spark.glb", role: "vfx-model",
      triangles: 0, drawCalls: 1, animChannels: 0, maxTextureEdge: 0, vramBytes: 0, worstCount: 8,
      broken: "zero-geometry", verdicts: { triangles: "ok" },
    },
    // clean
    {
      id: "prop.rock", path: "assets/models/props/rock.glb", role: "arena-decor",
      triangles: 200, drawCalls: 1, animChannels: 0, maxTextureEdge: 256, vramBytes: 200_000, worstCount: 50,
      verdicts: { triangles: "ok", drawCalls: "ok", maxTextureEdge: "ok", animChannels: "ok" },
    },
  ],
};

describe("mbudget-worklist", () => {
  it("queues only what the optimiser can act on, and names the rest honestly", () => {
    const w = buildWorklist(REPORT, { now: "2026-07-22T01:00:00Z" });
    expect(w.schema).toBe(WORKLIST_SCHEMA);
    expect(w.threshold).toBe("warn");
    expect(w.totals.scanned).toBe(5);

    const ids = w.items.map((i) => i.id);
    // the champion (texture) and the prop (geometry) are the two actionable items
    expect(ids).toEqual(["champ.big", "prop.statue"]);
    // heaviest first: champion VRAM (5.3 MB) outranks the prop (1 MB)
    expect(w.items[0]!.id).toBe("champ.big");

    // over-only on anim channels → re-author, never queued as "optimise"
    expect(w.needsReauthor.map((r) => r.id)).toEqual(["champ.dancer"]);
    expect(w.needsReauthor[0]!.metrics).toContain("animChannels");
    // broken set aside, never in items
    expect(w.broken.map((b) => b.id)).toEqual(["vfx.spark"]);
    expect(ids).not.toContain("vfx.spark");
    // clean model appears nowhere
    expect([...ids, ...w.needsReauthor.map((r) => r.id)]).not.toContain("prop.rock");
    cover("mbudget-worklist");
  });

  it("derives the concrete action + target for each axis from the role gate", () => {
    const w = buildWorklist(REPORT);
    const champ = w.items.find((i) => i.id === "champ.big")!;
    const tex = champ.actions.find((a) => a.kind === "texture-resize");
    expect(tex).toMatchObject({ kind: "texture-resize", fromEdge: 1024, targetEdge: 512 });
    // 1024→512 quarters the image area → ~75% of the model's VRAM is recoverable
    if (tex && tex.kind === "texture-resize") {
      expect(tex.estVramSavedBytes).toBe(Math.round(5_592_405 * (1 - 0.25)));
    }
    // and the champion still carries its un-fixable breaches as manual work
    expect(champ.manual.sort()).toEqual(["animChannels", "drawCalls"]);

    const prop = w.items.find((i) => i.id === "prop.statue")!;
    const geo = prop.actions.find((a) => a.kind === "geometry-decimate");
    expect(geo).toMatchObject({ kind: "geometry-decimate", fromTris: 55000, targetTris: 20000 });
    if (geo && geo.kind === "geometry-decimate") expect(geo.requires).toContain("#115");

    // the total VRAM estimate is the sum of the texture savings only
    expect(w.totals.estVramSavedBytes).toBe(Math.round(5_592_405 * 0.75));
    cover("mbudget-worklist");
  });

  it("--over-only drops warning-line candidates (the champion's texture is only a warning)", () => {
    const over = buildWorklist(REPORT, { threshold: "over" });
    const ids = over.items.map((i) => i.id);
    // the champion's texture sat at WARN, so with over-only it has no action and
    // falls to re-authoring (its draw-calls/channels are over); the prop stays.
    expect(ids).toEqual(["prop.statue"]);
    expect(over.needsReauthor.map((r) => r.id).sort()).toEqual(["champ.big", "champ.dancer"]);
    cover("mbudget-worklist");
  });

  it("carries the scenes that are over their same-screen cap", () => {
    const w = buildWorklist(REPORT);
    expect(w.screensOverCap.map((s) => s.id)).toEqual(["combat-castle"]);
    expect(w.screensOverCap[0]!.over.sort()).toEqual(["animChannels", "vramBytes"]);
    expect(w.totals.screensOverCap).toBe(1);
    cover("mbudget-worklist");
  });
});

describe("mbudget-worklist-real", () => {
  it("produces a valid, actionable worklist from the shipped report", () => {
    const reportPath = path.join(ROOT, "content/assets/model-budget/report.json");
    if (!fs.existsSync(reportPath)) return; // report is generated by report.test.ts's beforeAll
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as BudgetReportLike;
    const w = buildWorklist(report);

    expect(w.schema).toBe(WORKLIST_SCHEMA);
    expect(w.items.length).toBeGreaterThan(0);
    // every queued item is a real file with at least one concrete action
    for (const it of w.items) {
      expect(it.actions.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(ROOT, "content", it.path))).toBe(true);
    }
    // heaviest-first ordering holds across the real set
    for (let i = 1; i < w.items.length; i++) {
      expect(w.items[i - 1]!.vramBytes ?? 0).toBeGreaterThanOrEqual(w.items[i]!.vramBytes ?? 0);
    }
    // the shipped combat scenes are over cap (VRAM/anim), so the worklist says so
    expect(w.screensOverCap.length).toBeGreaterThan(0);
    cover("mbudget-worklist-real");
  });
});

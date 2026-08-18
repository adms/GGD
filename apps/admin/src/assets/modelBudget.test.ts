/**
 * adminui-model-budget — 模型預算 reads task #99's measurement report and
 *                        NEVER produces a measurement of its own. Pins the
 *                        tolerant reader (alternate field spellings, absent
 *                        metrics staying null rather than 0), the report ↔
 *                        live-content reconciliation, and the staleness verdict
 *                        — including the case that matters most today, where
 *                        the report does not exist at all and the page has to
 *                        say so instead of rendering a convincing zero.
 * adminui-model-budget-limits — a value is only "within budget" when a limit
 *                        actually came with the report; a missing limit or a
 *                        missing measurement is `unknown`, never `ok`.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BUDGET_CANDIDATE_URLS,
  OPTIMISE_WORKLIST_SCHEMA,
  ageText,
  buildOptimiseWorklist,
  budgetHealth,
  fmtBytes,
  fmtInt,
  isOverThreshold,
  limitFor,
  overThresholdModels,
  parseBudgetReport,
  parseModelIndex,
  reconcile,
  sortModelsHeavyToLight,
  verdictFor,
  type BudgetReport,
} from "./modelBudget";

const REPORT = {
  schema: "model-budget/report@1",
  sourcesDigest: "aaaabbbbccccdddd",
  generatedBy: "tools/model-budget/measure.py",
  limits: [
    { key: "triangles", label: "三角面", limit: 20000, warn: 15000 },
    { key: "vramBytes", label: "VRAM", limit: 8 * 1024 * 1024 },
  ],
  screens: [
    {
      id: "arena-6v6",
      label: "競技場 6 人同框",
      models: [{ id: "champ.sela", count: 3 }, "imported.heropika"],
      triangles: 90000,
      limits: [{ key: "triangles", limit: 120000, warn: 100000 }],
    },
  ],
  models: [
    {
      id: "champ.sela",
      path: "assets/models/champions/blocky-mage.glb",
      triangles: 12000,
      vertices: 6100,
      textureBytes: 1048576,
      textures: ["a.png", "b.png"],
      vramBytes: 2097152,
      drawCalls: 3,
      usedBy: [{ kind: "champion", id: "godie-sela" }, "arena.preview"],
    },
    // deliberately sparse + alternate spellings: only `tris` and `draws`
    { model: "imported.heropika", tris: 34000, draws: 9 },
  ],
};

describe("adminui-model-budget", () => {
  it("parses a report, tolerating alternate spellings and sparse rows", () => {
    const r = parseBudgetReport(REPORT, "/x.json") as BudgetReport;
    expect(r).not.toBeNull();
    expect(r.url).toBe("/x.json");
    expect(r.schema).toBe("model-budget/report@1");
    expect(r.models).toHaveLength(2);

    const sela = r.models[0]!;
    expect(sela.triangles).toBe(12000);
    expect(sela.textureCount).toBe(2); // derived from the textures ARRAY length
    expect(sela.usedBy).toEqual(["champion/godie-sela", "arena.preview"]);

    const pika = r.models[1]!;
    expect(pika.id).toBe("imported.heropika");
    expect(pika.triangles).toBe(34000); // `tris`
    expect(pika.drawCalls).toBe(9); // `draws`
    // THE POINT: an unmeasured metric is null, never 0.
    expect(pika.textureBytes).toBeNull();
    expect(pika.vramBytes).toBeNull();
    expect(fmtBytes(pika.textureBytes)).toBe("未量測");
    expect(fmtInt(pika.vertices)).toBe("未量測");
  });

  it("refuses anything that is not a report (404 body, unrelated json, no rows)", () => {
    expect(parseBudgetReport(null, "/a")).toBeNull();
    expect(parseBudgetReport("not found", "/a")).toBeNull();
    expect(parseBudgetReport({ schema: "model-budget/report@1", models: [] }, "/a")).toBeNull();
    expect(parseBudgetReport({ hello: "world" }, "/a")).toBeNull();
  });

  it("accepts object-keyed limits as well as a list", () => {
    const r = parseBudgetReport(
      { models: [{ id: "m" }], limits: { triangles: { limit: 9, warn: 5 }, drawCalls: 4 } },
      "/a",
    ) as BudgetReport;
    expect(limitFor(r, null, "triangles")).toMatchObject({ limit: 9, warn: 5 });
    expect(limitFor(r, null, "drawCalls")).toMatchObject({ limit: 4, warn: null });
  });

  it("reconciles the report against the live model index in both directions", () => {
    const live = parseModelIndex({
      entries: [
        { id: "champ.sela", path: "models/champ.sela.json", hash: "aa" },
        { id: "champ.thorne", path: "models/champ.thorne.json", hash: "bb" },
        { id: "prop.flower", path: "models/prop.flower.json", hash: "cc" },
      ],
    });
    expect(live).toHaveLength(3);

    const report = parseBudgetReport(REPORT, "/x.json");
    const rec = reconcile(live, report);
    expect(rec.measured).toEqual(["champ.sela"]);
    // never measured → the honest work list
    expect(rec.unmeasured).toEqual(["champ.thorne", "prop.flower"]);
    // measured but the doc is gone → the report predates a deletion
    expect(rec.orphaned).toEqual(["imported.heropika"]);
    expect(rec.liveTotal).toBe(3);
    expect(rec.percent).toBeCloseTo(33.33, 1);
  });

  it("declares itself unpublished rather than rendering an empty budget", () => {
    const rec = reconcile([{ id: "a", path: "models/a.json", hash: "h" }], null);
    const notes = budgetHealth({ report: null, recon: rec, tried: BUDGET_CANDIDATE_URLS, indexFailed: false });
    const missing = notes.find((n) => n.id === "no-report");
    expect(missing?.level).toBe("missing");
    // it must name where it looked and what to run
    expect(missing?.fix).toContain(BUDGET_CANDIDATE_URLS[0]);
    expect(rec.measured).toHaveLength(0);
  });

  it("flags a stale report, and only says 'ok' when nothing is off", () => {
    const live = [
      { id: "champ.sela", path: "models/champ.sela.json", hash: "aa" },
      { id: "champ.thorne", path: "models/champ.thorne.json", hash: "bb" },
    ];
    const report = parseBudgetReport(REPORT, "/x.json");
    const stale = budgetHealth({ report, recon: reconcile(live, report), tried: [], indexFailed: false });
    expect(stale.map((n) => n.id)).toContain("unmeasured");
    expect(stale.map((n) => n.id)).toContain("orphaned");
    expect(stale.every((n) => n.level !== "ok")).toBe(true);

    const exact = parseBudgetReport(
      {
        models: [{ id: "only", triangles: 1 }],
        limits: [{ key: "triangles", limit: 10 }],
        screens: [{ id: "s", triangles: 1 }],
      },
      "/y.json",
    );
    const ok = budgetHealth({
      report: exact,
      recon: reconcile([{ id: "only", path: "models/only.json", hash: "h" }], exact),
      tried: [],
      indexFailed: false,
    });
    expect(ok).toHaveLength(1);
    expect(ok[0]!.level).toBe("ok");
  });

  it("says 'cannot tell' when the content index itself is unreachable", () => {
    const notes = budgetHealth({
      report: null,
      recon: reconcile([], null),
      tried: ["/a"],
      indexFailed: true,
    });
    expect(notes[0]!.id).toBe("index-unreachable");
    expect(notes[0]!.level).toBe("unknown");
  });

  it("renders an age an operator can act on", () => {
    const now = Date.parse("2026-07-22T12:00:00Z");
    expect(ageText("2026-07-22T11:30:00Z", now)).toBe("30 分鐘前");
    expect(ageText("2026-07-21T12:00:00Z", now)).toBe("24 小時前");
    expect(ageText("nonsense", now)).toBe("");
    cover("adminui-model-budget");
  });
});

describe("adminui-model-budget-limits", () => {
  it("never calls a value 'within budget' without a real limit or a real measurement", () => {
    const lim = { key: "triangles", label: "t", unit: "", limit: 100, warn: 80 };
    expect(verdictFor(120, lim)).toBe("over");
    expect(verdictFor(90, lim)).toBe("warn");
    expect(verdictFor(10, lim)).toBe("ok");
    // no measurement → unknown, NOT ok
    expect(verdictFor(null, lim)).toBe("unknown");
    // no limit → unknown, NOT ok
    expect(verdictFor(10, undefined)).toBe("unknown");
    // a "limit" carrying neither bound proves nothing
    expect(verdictFor(10, { key: "t", label: "t", unit: "", limit: null, warn: null })).toBe("unknown");
  });

  it("prefers a per-screen limit over the report-wide one, and invents neither", () => {
    const r = parseBudgetReport(REPORT, "/x.json") as BudgetReport;
    const screen = r.screens[0]!;
    expect(limitFor(r, screen, "triangles")?.limit).toBe(120000); // screen wins
    expect(limitFor(r, null, "triangles")?.limit).toBe(20000); // report-wide
    expect(limitFor(r, screen, "drawCalls")).toBeUndefined(); // nobody set one
    // and the screen's own reading is judged against its own limit
    expect(verdictFor(screen.triangles, limitFor(r, screen, "triangles"))).toBe("ok");
    expect(verdictFor(screen.triangles, limitFor(r, null, "triangles"))).toBe("over");
    cover("adminui-model-budget-limits");
  });
});

// A report carrying the report's OWN per-model verdicts, roles and gates — the
// shape #99 actually publishes and the over-threshold panel + queue button read.
const SCORED = {
  schema: "model-budget@1",
  sourcesDigest: "aaaabbbbccccdddd",
  gates: [
    { role: "champion", tris: { warn: 16000, limit: 28000 }, texEdge: { warn: 512, limit: 1024 } },
    { role: "arena-decor", tris: { warn: 4000, limit: 8000 }, texEdge: { warn: 512, limit: 1024 } },
  ],
  screens: [{ id: "combat", label: "戰鬥", triangles: 1, verdicts: { drawCalls: "over" } }],
  models: [
    // heavy champion: texture at warn (queued) + over on draw calls/anim (manual)
    { id: "champ.big", path: "champions/big.glb", role: "champion", triangles: 6000, vramBytes: 5_592_405,
      drawCalls: 13, animChannels: 120, maxTextureEdge: 1024, worstCount: 12,
      verdicts: { triangles: "ok", drawCalls: "over", maxTextureEdge: "warn", animChannels: "over" } },
    // decor with too much geometry (queued for decimation), lighter VRAM
    { id: "decor.tower", path: "hex/tower.glb", role: "arena-decor", triangles: 5659, vramBytes: 1_000_000,
      drawCalls: 1, maxTextureEdge: 256, worstCount: 2,
      verdicts: { triangles: "over", drawCalls: "ok", maxTextureEdge: "ok" } },
    // over ONLY on draw calls — not queueable, but still over threshold
    { id: "champ.busy", path: "champions/busy.glb", role: "champion", triangles: 5000, vramBytes: 800_000,
      drawCalls: 20, maxTextureEdge: 256, worstCount: 12,
      verdicts: { triangles: "ok", drawCalls: "over", maxTextureEdge: "ok" } },
    // broken emitter — never queued
    { id: "vfx.spark", path: "vfx/spark.glb", role: "vfx-model", triangles: 0, vramBytes: 0, broken: "zero-geometry",
      verdicts: {} },
    // unmeasured metrics stay null and sink to the bottom of a heavy→light sort
    { id: "prop.mystery", path: "props/mystery.glb", role: "arena-decor" },
  ],
};

describe("adminui-model-budget-optimise", () => {
  it("sorts heavy→light with unmeasured models sinking to the bottom", () => {
    const r = parseBudgetReport(SCORED, "/s.json") as BudgetReport;
    const order = sortModelsHeavyToLight(r.models).map((m) => m.id);
    expect(order[0]).toBe("champ.big"); // 5.3 MB VRAM
    expect(order[order.length - 1]).toBe("prop.mystery"); // both metrics null → last
    // strictly non-increasing VRAM among the measured ones
    const vrams = sortModelsHeavyToLight(r.models).map((m) => m.vramBytes ?? -1);
    for (let i = 1; i < vrams.length; i++) expect(vrams[i - 1]).toBeGreaterThanOrEqual(vrams[i]!);
    cover("adminui-model-budget-optimise");
  });

  it("lists over-threshold assets from the report's OWN verdicts, not a re-score", () => {
    const r = parseBudgetReport(SCORED, "/s.json") as BudgetReport;
    expect(isOverThreshold(r.models.find((m) => m.id === "champ.big")!)).toBe(true);
    const over = overThresholdModels(r).map((m) => m.id);
    // every asset the report scored `over` on any axis, heaviest first
    // (champ.big 5.3 MB > decor.tower 1.0 MB > champ.busy 0.8 MB)
    expect(over).toEqual(["champ.big", "decor.tower", "champ.busy"]);
    cover("adminui-model-budget-optimise");
  });

  it("queues only what the optimiser can shrink, and names manual work separately", () => {
    const r = parseBudgetReport(SCORED, "/s.json") as BudgetReport;
    const wl = buildOptimiseWorklist(r, { now: "2026-07-22T10:00:00Z" });
    expect(wl.schema).toBe(OPTIMISE_WORKLIST_SCHEMA);
    // champion (texture) + decor (geometry) queue; draw-call-only + broken do not
    expect(wl.items.map((i) => i.id)).toEqual(["champ.big", "decor.tower"]);

    const champ = wl.items[0]!;
    expect(champ.actions[0]).toMatchObject({ kind: "texture-resize", fromEdge: 1024, targetEdge: 512 });
    expect((champ.actions[0] as { estVramSavedBytes: number }).estVramSavedBytes).toBe(Math.round(5_592_405 * 0.75));
    expect([...champ.manual].sort()).toEqual(["animChannels", "drawCalls"]);

    const decor = wl.items[1]!;
    expect(decor.actions[0]).toMatchObject({ kind: "geometry-decimate", fromTris: 5659, targetTris: 4000 });
    expect(wl.totals.queued).toBe(2);
    expect(wl.totals.estVramSavedBytes).toBe(Math.round(5_592_405 * 0.75));
    expect(wl.source).toMatchObject({ sourcesDigest: "aaaabbbbccccdddd", schema: "model-budget@1" });
    cover("adminui-model-budget-optimise");
  });

  it("--over-only drops warning-line textures, and an id filter narrows the queue", () => {
    const r = parseBudgetReport(SCORED, "/s.json") as BudgetReport;
    // champion texture was WARN → gone under over-only; decor geometry was over → stays
    expect(buildOptimiseWorklist(r, { threshold: "over" }).items.map((i) => i.id)).toEqual(["decor.tower"]);
    // an explicit selection queues only the chosen model
    expect(buildOptimiseWorklist(r, { ids: ["champ.big"] }).items.map((i) => i.id)).toEqual(["champ.big"]);
    // a null report yields an empty, still-valid worklist (page never crashes)
    const empty = buildOptimiseWorklist(null);
    expect(empty.items).toHaveLength(0);
    expect(empty.schema).toBe(OPTIMISE_WORKLIST_SCHEMA);
    cover("adminui-model-budget-optimise");
  });
});

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
  ageText,
  budgetHealth,
  fmtBytes,
  fmtInt,
  limitFor,
  parseBudgetReport,
  parseModelIndex,
  reconcile,
  verdictFor,
  type BudgetReport,
} from "./modelBudget";

const REPORT = {
  schema: "model-budget/report@1",
  generatedAt: "2026-07-22T09:00:00Z",
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
      path: "assets/models/champions/mage.glb",
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

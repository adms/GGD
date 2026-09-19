/**
 * mbudget-worklist — the offline batch-optimiser entrypoint classifies the
 *                    report's verdicts into the only buckets a batch pass can
 *                    act on: an oversized texture, too much geometry, or too many
 *                    draw calls becomes an ACTION with a concrete target; an
 *                    anim-channel breach is named as re-authoring, never dressed
 *                    up as "optimise"; a broken emitter is set aside. The queue is
 *                    ordered heaviest-first and each item carries a real .glb
 *                    path the optimiser can consume.
 * mbudget-worklist-real — the same builder run over the SHIPPED report produces
 *                    a valid, non-empty worklist whose every item is a real file.
 *
 * ⭐ GH#1198／#1175 —— **跨住處**的那一條在最底下：「哪些軸修得了」同時住在
 * `worklist.ts` 的 `AXIS` 與 `apps/admin/src/assets/modelBudget.ts` 的
 * `OPTIMISABLE`／`MANUAL_AXES`（後台在瀏覽器跑同一份分類，⛔ import 不到這一支）。
 * ⇒ 它們在 2026-09-19 之前**互相矛盾都不會有東西紅**。這條守衛把兩張表逐軸比。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "../../packages/shared/testkit/cover";

import { MANUAL_AXES as ADMIN_MANUAL_AXES, OPTIMISABLE as ADMIN_OPTIMISABLE } from "../../apps/admin/src/assets/modelBudget";
import { GATES as LIVE_GATES } from "./limits";
import {
  AXIS,
  WORKLIST_SCHEMA,
  buildWorklist,
  optimiserFlags,
  type BudgetReportLike,
  type WorklistAction,
  type WorklistItem,
} from "./worklist";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const live = (role: string) => structuredClone(LIVE_GATES.find((gate) => gate.role === role)!);
// Keep the fixture derived from the live contract. The champion texture row is
// widened by one pixel only to exercise worklist's warning-only branch, which
// cannot occur when a production gate deliberately has warn === limit.
const championGate = live("champion");
championGate.texEdge.limit = championGate.texEdge.warn + 1;
const propGate = live("hero-prop");
const decorGate = live("arena-decor");
const GATES = [championGate, propGate, decorGate];

/** A representative report: a texture-heavy champion, a geometry-heavy prop,
 *  an asset that is over only on axes nothing can auto-fix, a broken emitter,
 *  a clean model, and a scene over its cap. */
const REPORT: BudgetReportLike = {
  schema: "model-budget@1",
  sourcesDigest: "aaaabbbbccccdddd",
  gates: GATES,
  screens: [
    { id: "combat-castle", label: "城堡", verdicts: { triangles: "ok", drawCalls: "warn", animChannels: "over", vramBytes: "over" } },
    { id: "login", label: "登入", verdicts: { triangles: "ok", drawCalls: "warn", vramBytes: "ok" } },
  ],
  models: [
    // champion: texture just above warn AND over on draw calls + anim channels
    {
      id: "champ.big", path: "assets/models/champions/big.glb", role: "champion",
      triangles: 6000, drawCalls: championGate.meshes.limit + 1, animChannels: championGate.channels.limit + 1,
      maxTextureEdge: championGate.texEdge.warn + 1, vramBytes: 5_592_405, worstCount: 12,
      verdicts: { triangles: "ok", drawCalls: "over", maxTextureEdge: "warn", animChannels: "over" },
    },
    // prop: geometry over (needs decimation, #115) — lighter VRAM than the champion
    {
      id: "prop.statue", path: "assets/models/props/statue.glb", role: "hero-prop",
      triangles: propGate.tris.limit + 1, drawCalls: 4, animChannels: 0, maxTextureEdge: 256, vramBytes: 1_000_000, worstCount: 1,
      verdicts: { triangles: "over", drawCalls: "ok", maxTextureEdge: "ok", animChannels: "ok" },
    },
    // over ONLY on anim channels — no automated pass fixes this → needsReauthor
    {
      id: "champ.dancer", path: "assets/models/champions/dancer.glb", role: "champion",
      triangles: 5000, drawCalls: 2, animChannels: championGate.channels.limit + 1, maxTextureEdge: 256, vramBytes: 400_000, worstCount: 12,
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
    expect(tex).toMatchObject({
      kind: "texture-resize",
      fromEdge: championGate.texEdge.warn + 1,
      targetEdge: championGate.texEdge.warn,
    });
    if (tex && tex.kind === "texture-resize") {
      const ratio = championGate.texEdge.warn / (championGate.texEdge.warn + 1);
      expect(tex.estVramSavedBytes).toBe(Math.round(5_592_405 * (1 - ratio * ratio)));
    }
    // GH#1198／#1175：draw call 現在是**可自動處理的候選**（合併畫法相同的 primitive）
    const draws = champ.actions.find((a) => a.kind === "draw-merge");
    expect(draws).toMatchObject({
      kind: "draw-merge",
      fromDraws: championGate.meshes.limit + 1,
      targetDraws: championGate.meshes.warn,
    });
    // ⭐ 而它要說得出「可能接不動」—— ⛔ 一句只講做得到的話會被讀成「已解決」
    if (draws && draws.kind === "draw-merge") expect(draws.requires).toContain("候選");
    // 只剩動畫通道是真的沒有自動解（批次沒有 trim stage）
    expect(champ.manual.sort()).toEqual(["animChannels"]);

    const prop = w.items.find((i) => i.id === "prop.statue")!;
    const geo = prop.actions.find((a) => a.kind === "geometry-decimate");
    expect(geo).toMatchObject({
      kind: "geometry-decimate",
      fromTris: propGate.tris.limit + 1,
      targetTris: propGate.tris.warn,
    });
    if (geo && geo.kind === "geometry-decimate") expect(geo.requires).toContain("#115");

    // the total VRAM estimate is the sum of the texture savings only
    const ratio = championGate.texEdge.warn / (championGate.texEdge.warn + 1);
    expect(w.totals.estVramSavedBytes).toBe(Math.round(5_592_405 * (1 - ratio * ratio)));
    cover("mbudget-worklist");
  });

  it("--over-only drops warning-line candidates (the champion's texture is only a warning)", () => {
    const over = buildWorklist(REPORT, { threshold: "over" });
    const ids = over.items.map((i) => i.id);
    // the champion's texture sat at WARN so it loses the resize, ⭐ but its draw
    // calls are OVER ⇒ it stays queued on the merge candidate alone; the prop stays.
    expect(ids).toEqual(["champ.big", "prop.statue"]);
    expect(over.items[0]!.actions.map((a) => a.kind)).toEqual(["draw-merge"]);
    // only the anim-channel-only model is left with nothing a batch pass can try
    expect(over.needsReauthor.map((r) => r.id).sort()).toEqual(["champ.dancer"]);
    cover("mbudget-worklist");
  });

  /**
   * ⭐ 跨住處的承重守衛（GH#1198／#1175）。⛔ 它⛔ 不比對「兩邊都寫了 drawCalls」
   * 這種名詞，⭐ 它比對的是**關係**：每一個軸在兩處的**歸類**要一樣 ——
   * 一邊說「修得了」而另一邊說「只能重做」就紅，⛔ 兩個方向都紅。
   *
   * ⚠️ 這正是 2026-09-19 之前的實況：CLI 把 drawCalls 歸在 `fix: null`，
   * 後台把它歸在 `MANUAL_AXES` —— 兩邊**一起**是錯的，⛔ 而「一致」本身
   * 從來沒有被任何東西量過（CLAUDE.md：同步之後兩邊一致⛔ 不是成功的證據）。
   */
  it("CLI 與後台的『哪些軸修得了』逐軸一致（兩處，⛔ 沒有第三個住處）", () => {
    const cliAutomated = Object.entries(AXIS).filter(([, s]) => s.fix !== null).map(([k]) => k);
    const cliManual = Object.entries(AXIS).filter(([, s]) => s.fix === null).map(([k]) => k);

    expect(cliAutomated.sort()).toEqual(Object.keys(ADMIN_OPTIMISABLE).sort());
    expect(cliManual.sort()).toEqual([...ADMIN_MANUAL_AXES].sort());
    // 每一個軸剛好屬於其中一邊 —— ⛔ 不可以同時是兩邊,也⛔ 不可以兩邊都不是
    for (const axis of Object.keys(AXIS)) {
      expect((axis in ADMIN_OPTIMISABLE) !== (ADMIN_MANUAL_AXES as readonly string[]).includes(axis)).toBe(true);
    }
    // ⭐ 而修法本身也要對得上（texture/geometry/draws 三種,⛔ 不是只有名字一樣）
    for (const [axis, spec] of Object.entries(AXIS)) {
      if (spec.fix !== null) expect(ADMIN_OPTIMISABLE[axis]).toBe(spec.fix);
    }
    // 這一天的事實：draw call 修得了（合併）,動畫通道還沒有（批次沒有 trim stage）
    expect(AXIS["drawCalls"]!.fix).toBe("draws");
    expect(AXIS["animChannels"]!.fix).toBeNull();
    cover("mbudget-worklist");
  });

  /**
   * ⭐ 接線守衛：排了合併候選就**一定**要把 `--merge` 交給優化器。
   * ⚠️ **兩個方向都驗** —— 只驗「該有的時候有」的尺，在它最需要說話的時候是瞎的。
   */
  it("排了 draw-merge 就把 --merge 交給優化器；沒排就⛔ 不帶", () => {
    const item = (kind: WorklistAction["kind"]): WorklistItem =>
      ({ actions: [{ kind }] }) as unknown as WorklistItem;
    // 該有的時候有
    expect(optimiserFlags([item("draw-merge")], { apply: false, geometry: false })).toEqual(["--merge"]);
    expect(optimiserFlags([item("texture-resize"), item("draw-merge")], { apply: true, geometry: false }))
      .toEqual(["--apply", "--merge"]);
    // ⛔ 不該有的時候沒有（⛔ 否則每一批都白花一次 python 探針）
    expect(optimiserFlags([item("texture-resize"), item("geometry-decimate")], { apply: true, geometry: true }))
      .toEqual(["--apply", "--geometry"]);
    expect(optimiserFlags([], { apply: false, geometry: false })).toEqual([]);
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

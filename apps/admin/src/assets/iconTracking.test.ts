/**
 * adminui-icon-tracking — ICON 生成追蹤 consumes tasks #97 / #72 / #101 rather
 *                        than re-deriving them. This suite drives the ADMIN
 *                        page's numbers through #97's own `computeIconCoverage`
 *                        and #97's own plan reader, so a divergence between the
 *                        admin console and the in-game codex would fail here.
 * adminui-icon-tracking-notes — the one thing this page owns: the verdict on
 *                        whether its feeds AGREE. Every way the numbers can be
 *                        wrong (no plan, stale plan, no style spec, drifted
 *                        spec, mismatched content digests, dead platform,
 *                        unscanned bytes) produces a note; "ok" is only reached
 *                        when nothing is off.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  computeIconCoverage,
  coverageEntryFromDoc,
  parseIndexRows,
  type CoverageEntry,
} from "@ggd/shared/codex/codexCoverage";
import { parsePlan } from "@ggd/shared/codex/codexPlan";
import { parseStyleSpec, type Freshness, type ProviderProbe } from "@ggd/shared/assetConsole/assetConsoleData";
import {
  KIND_LABEL,
  declaredIconPaths,
  tierCounts,
  trackingNotes,
  worstLevel,
  type ScanPhase,
} from "./iconTracking";

const READY: ScanPhase = { state: "ready", loaded: 3, total: 3, missingKinds: [] };
const FRESH: Freshness = { state: "fresh", drifted: [], note: "" };
const PROBE_OK: ProviderProbe = {
  state: "ok",
  at: 0,
  readiness: {
    version: 1,
    loopback: true,
    enabled: true,
    imageReady: true,
    textReady: true,
    ttsReady: false,
    musicReady: false,
    reason: "ready",
    imageModel: "gpt-image-1",
    imageHost: "api.openai.com",
    updatedAt: "",
  },
};

const PLAN_DOC = {
  schema: "config.icon-plan@1",
  templateVersion: "icon-gen/1",
  contentDigest: "deadbeef",
  counts: { total: { docs: 3, have: 1, drop: 1, blocked: 1, generate: 1, tier1: 1, tier2: 0 } },
  dropped: { "empty-imported-champion": { label: "匯入的空白英雄", note: "", ids: ["c.empty"] } },
  blocked: { "third-party-ip": { label: "第三方版權角色", note: "", ids: ["c.ip"] } },
};

const SPEC_DOC = {
  schema: "icon-console/style-spec@1",
  templateVersion: "icon-gen/1",
  contentDigest: "deadbeef",
  sources: [{ path: "tools/icon-gen/src/prompt.py", sha256: "aa", bytes: 1, mtime: "" }],
  template: { prefix: "P", negative: "N", shape: "S", example: "E" },
  textMode: { field: "", instruction: "", note: "" },
  lexicon: {},
  rules: [{ id: "name-first", text: "名稱優先比對。" }],
  contactSheet: { size: 1, runCommand: "cmd", note: "", slots: [] },
  pricing: { quotedAsOf: "2026-01", image: { "gpt-image-1": { low: 0.011 } }, text: { perCall: 0.0002 } },
};

/** Three champions: one with art, one dropped by the plan, one blocked by it. */
function entries(): CoverageEntry[] {
  const rows = parseIndexRows("champion", {
    entries: [
      { id: "c.art", path: "champions/c.art.json", hash: "1" },
      { id: "c.empty", path: "champions/c.empty.json", hash: "2" },
      { id: "c.ip", path: "champions/c.ip.json", hash: "3" },
    ],
  });
  const docs: Record<string, unknown> = {
    "c.art": { name: "有圖", description: "d", icon: "assets/icons/champions/c.art.png" },
    "c.empty": { name: "c.empty" },
    "c.ip": { name: "版權", description: "d" },
  };
  return rows.map((r) => coverageEntryFromDoc(r.kind, r.id, docs[r.id]));
}

describe("adminui-icon-tracking", () => {
  it("counts through #97's own arithmetic — no second implementation here", () => {
    const plan = parsePlan(PLAN_DOC);
    expect(plan).not.toBeNull();
    const coverage = computeIconCoverage({ entries: entries(), plan });

    expect(coverage.all.total).toBe(3);
    expect(coverage.all.excluded).toBe(1); // DROPPED is a decision, leaves the denominator
    expect(coverage.all.needed).toBe(2);
    expect(coverage.all.covered).toBe(1);
    expect(coverage.all.blocked).toBe(1); // held gate: needed, but not workable
    expect(coverage.all.backlog).toBe(0); // nothing anyone can actually do right now
    expect(coverage.exclusionSource).toBe("plan");
    expect(coverage.planStale).toBe(false);
  });

  it("demotes a declared icon the mount cannot serve (the byte scan's `failed`)", () => {
    const plan = parsePlan(PLAN_DOC);
    const broken = computeIconCoverage({
      entries: entries(),
      plan,
      failedIcons: new Set(["assets/icons/champions/c.art.png"]),
    });
    expect(broken.all.covered).toBe(0);
    expect(broken.all.broken).toBe(1);
  });

  it("feeds the byte scan exactly the distinct declared paths", () => {
    expect(declaredIconPaths(entries())).toEqual(["assets/icons/champions/c.art.png"]);
    expect(declaredIconPaths([])).toEqual([]);
  });

  it("takes tier counts from #72's plan, and refuses to invent tier1 without one", () => {
    const plan = parsePlan(PLAN_DOC);
    const coverage = computeIconCoverage({ entries: entries(), plan });
    expect(tierCounts(plan, coverage)).toEqual({ tier1: 1, tier2: 0 });

    const noPlan = computeIconCoverage({ entries: entries() });
    // no classification exists → nothing is authorised as tier1; the operator
    // still gets the whole backlog costed as tier2
    expect(tierCounts(null, noPlan)).toEqual({ tier1: 0, tier2: noPlan.all.backlog });
    expect(noPlan.all.backlog).toBe(2);
  });

  it("labels the three families the way the user named them", () => {
    expect(KIND_LABEL["champion"]).toBe("英雄");
    expect(KIND_LABEL["ability"]).toBe("技能");
    expect(KIND_LABEL["item"]).toBe("武器道具");
    cover("adminui-icon-tracking");
  });
});

describe("adminui-icon-tracking-notes", () => {
  const spec = parseStyleSpec(SPEC_DOC);
  const plan = parsePlan(PLAN_DOC);
  const coverage = computeIconCoverage({ entries: entries(), plan });

  it("is silent only when every feed agrees", () => {
    const notes = trackingNotes({
      scan: READY,
      coverage,
      plan,
      spec,
      freshness: FRESH,
      probe: PROBE_OK,
      bytesScanned: true,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.level).toBe("ok");
    expect(worstLevel(notes)).toBe("ok");
  });

  it("reports a missing plan, a missing spec and an unscanned byte pass", () => {
    const notes = trackingNotes({
      scan: READY,
      coverage: computeIconCoverage({ entries: entries() }),
      plan: null,
      spec: null,
      freshness: FRESH,
      probe: PROBE_OK,
      bytesScanned: false,
    });
    const ids = notes.map((n) => n.id);
    expect(ids).toContain("no-plan");
    expect(ids).toContain("no-spec");
    expect(ids).toContain("bytes-unscanned");
    expect(notes.find((n) => n.id === "no-plan")!.fix).toContain("plan.py --write");
    expect(notes.find((n) => n.id === "no-spec")!.fix).toContain("emit_style_spec.py");
    expect(worstLevel(notes)).toBe("stale");
  });

  it("catches a plan generated against a different content set", () => {
    // the plan claims 3 docs; measure 4 and it is provably stale
    const more = [...entries(), coverageEntryFromDoc("item", "i.new", { name: "新" })];
    const stale = computeIconCoverage({ entries: more, plan });
    expect(stale.planStale).toBe(true);
    const notes = trackingNotes({
      scan: READY,
      coverage: stale,
      plan,
      spec,
      freshness: FRESH,
      probe: PROBE_OK,
      bytesScanned: true,
    });
    expect(notes.map((n) => n.id)).toContain("plan-stale");
  });

  it("distinguishes a drifted style spec from one it cannot verify", () => {
    const drifted = trackingNotes({
      scan: READY,
      coverage,
      plan,
      spec,
      freshness: {
        state: "stale",
        drifted: [
          { path: "tools/icon-gen/src/prompt.py", specSha: "aa", liveSha: "bb", liveMtime: "", missing: false },
        ],
        note: "",
      },
      probe: PROBE_OK,
      bytesScanned: true,
    });
    const d = drifted.find((n) => n.id === "spec-stale")!;
    expect(d.level).toBe("stale");
    expect(d.text).toContain("prompt.py");

    const unknown = trackingNotes({
      scan: READY,
      coverage,
      plan,
      spec,
      freshness: { state: "unknown", drifted: [], note: "此組建沒有即時來源檢查端點" },
      probe: PROBE_OK,
      bytesScanned: true,
    });
    expect(unknown.find((n) => n.id === "spec-unknown")!.level).toBe("unknown");
  });

  it("catches a spec and a plan describing different content", () => {
    const otherPlan = parsePlan({ ...PLAN_DOC, contentDigest: "0000" });
    const notes = trackingNotes({
      scan: READY,
      coverage: computeIconCoverage({ entries: entries(), plan: otherPlan }),
      plan: otherPlan,
      spec,
      freshness: FRESH,
      probe: PROBE_OK,
      bytesScanned: true,
    });
    expect(notes.map((n) => n.id)).toContain("digest-mismatch");
  });

  it("separates 'cannot ask' from 'no provider', and blocks outright on a dead index", () => {
    const down = trackingNotes({
      scan: READY,
      coverage,
      plan,
      spec,
      freshness: FRESH,
      probe: { state: "unreachable", error: "fetch failed", status: null, at: 0 },
      bytesScanned: true,
    });
    const p = down.find((n) => n.id === "platform-down")!;
    expect(p.level).toBe("unknown");
    expect(p.text).toContain("問不到");
    expect(p.fix).toContain("正在執行");

    // 404 is NOT the same failure: the platform is up, its build is just old.
    // Telling the operator to start a running service would be a wrong fix.
    const old = trackingNotes({
      scan: READY,
      coverage,
      plan,
      spec,
      freshness: FRESH,
      probe: { state: "unreachable", error: "HTTP 404", status: 404, at: 0 },
      bytesScanned: true,
    });
    expect(old.find((n) => n.id === "platform-down")!.fix).toContain("重新建置");

    const blocked = trackingNotes({
      scan: { state: "failed", loaded: 0, total: 0, missingKinds: ["champions"] },
      coverage,
      plan,
      spec,
      freshness: FRESH,
      probe: PROBE_OK,
      bytesScanned: true,
    });
    // a broken content read short-circuits: nothing else on the page is credible
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.id).toBe("scan-failed");
    expect(worstLevel(blocked)).toBe("blocked");
    cover("adminui-icon-tracking-notes");
  });

  it("never handles key material: no note, label or fix mentions a key value", () => {
    const all = [
      ...trackingNotes({ scan: READY, coverage, plan, spec, freshness: FRESH, probe: PROBE_OK, bytesScanned: true }),
      ...trackingNotes({
        scan: READY,
        coverage,
        plan: null,
        spec: null,
        freshness: FRESH,
        probe: { state: "unreachable", error: "x", status: null, at: 0 },
        bytesScanned: false,
      }),
    ];
    const text = all.map((n) => `${n.text} ${n.fix}`).join(" ");
    expect(text).not.toMatch(/sk-|apiKey|api_key|Bearer/i);
  });
});

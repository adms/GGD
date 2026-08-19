/**
 * assetConsole.test — the asset console's claims, checked.
 *
 * The page exists because the user wants to VERIFY rather than trust. That
 * standard applies to the page itself, so the properties it advertises are
 * tested here rather than asserted in a comment:
 *
 *   • a malformed / missing provider answer never reads as "a provider is live"
 *   • "cannot tell" is a distinct outcome from "no provider" and from "fresh"
 *   • the cost estimate is the runner's formula, and an unknown rate stays unknown
 *   • the freshness check actually notices a changed source file
 *   • the two lists of style-spec source files (the Python emitter's and the dev
 *     server's) cannot drift apart, which would create a silent blind spot
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STAMP_SOURCES } from "../../../dev/iconConsoleStamp";
import {
  authorisation,
  canGenerateImages,
  compareFreshness,
  digestsAgree,
  estimateCost,
  imageRate,
  operatorAction,
  parseReadiness,
  parseStamp,
  parseStyleSpec,
  pricedQualities,
  usd,
  type PricingTable,
  type ProviderProbe,
  type SpecSource,
  type StampEntry,
} from "@ggd/shared/assetConsole/assetConsoleData";

const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));

const PRICING: PricingTable = {
  quotedAsOf: "2026-01",
  image: {
    "gpt-image-1": { note: "1024x1024.", low: 0.011, medium: 0.042, high: 0.167 },
    "dall-e-3": { standard: 0.04, hd: 0.08 },
  },
  text: { perCall: 0.0002 },
};

const okProbe = (over: Partial<ReturnType<typeof parseReadiness>> = {}): ProviderProbe => ({
  state: "ok",
  at: 0,
  readiness: { ...parseReadiness({}), ...over },
});

// ------------------------------------------------------------- provider ---

describe("provider readiness", () => {
  it("defaults every capability to NOT ready when the answer is junk", () => {
    for (const junk of [null, undefined, 0, "yes", [], { imageReady: "true" }]) {
      const r = parseReadiness(junk);
      expect(r.imageReady).toBe(false);
      expect(r.enabled).toBe(false);
      expect(r.reason).toBe("");
    }
  });

  it("only accepts reason codes the platform actually defines", () => {
    expect(parseReadiness({ reason: "no-key" }).reason).toBe("no-key");
    expect(parseReadiness({ reason: "profit" }).reason).toBe("");
  });

  it("treats an unreachable platform as UNKNOWN, never as 'no provider'", () => {
    const unreachable: ProviderProbe = {
      state: "unreachable",
      error: "boom",
      status: null,
      at: 0,
    };
    expect(canGenerateImages(unreachable)).toBe(false);
    const a = operatorAction(unreachable);
    // The fix for "platform is down" is not the fix for "no key configured";
    // conflating them would send the operator to the wrong page.
    expect(a.headline).toContain("platform");
    expect(a.steps.join("")).not.toContain("金鑰");
    expect(a.where).toBe("");
  });

  it("separates an OLD BUILD (404) from a dead platform — different fixes", () => {
    const stale: ProviderProbe = {
      state: "unreachable",
      error: "HTTP 404",
      status: 404,
      at: 0,
    };
    const dead: ProviderProbe = { state: "unreachable", error: "fail", status: null, at: 0 };
    expect(operatorAction(stale).steps.join("")).toContain("重新啟動");
    expect(operatorAction(dead).steps.join("")).toContain("正在執行");
    expect(operatorAction(stale).headline).not.toBe(operatorAction(dead).headline);
    // Neither may ever read as "a provider is live".
    expect(canGenerateImages(stale)).toBe(false);
    expect(canGenerateImages(dead)).toBe(false);
  });

  it("names the exact missing piece for each reason", () => {
    expect(operatorAction(okProbe({ reason: "disabled" })).steps.join("")).toContain("啟用");
    expect(operatorAction(okProbe({ reason: "no-key" })).steps.join("")).toContain("金鑰");
    expect(operatorAction(okProbe({ reason: "no-endpoint" })).steps.join("")).toContain("端點");
    expect(operatorAction(okProbe({ reason: "no-model" })).steps.join("")).toContain("模型");
  });

  it("says nothing needs doing once images are ready", () => {
    const p = okProbe({ imageReady: true, imageModel: "gpt-image-1", reason: "ready" });
    expect(canGenerateImages(p)).toBe(true);
    expect(operatorAction(p).steps).toHaveLength(0);
  });

  it("explains the withheld detail off-loopback instead of inventing a cause", () => {
    const steps = operatorAction(okProbe({ enabled: true, reason: "" })).steps.join("");
    expect(steps).toContain("開發機");
  });

  it("never mentions a key VALUE anywhere in the operator copy", () => {
    for (const reason of ["disabled", "no-key", "no-endpoint", "no-model"] as const) {
      const a = operatorAction(okProbe({ reason }));
      const text = a.headline + a.steps.join("") + a.where;
      expect(text).not.toMatch(/sk-|Bearer|apiKey/i);
    }
  });
});

// ----------------------------------------------------------- freshness ---

describe("freshness", () => {
  const sources: SpecSource[] = [
    { path: "a.py", sha256: "aaa", bytes: 1 },
    { path: "b.py", sha256: "bbb", bytes: 2 },
  ];
  const stamp = (over: Partial<StampEntry>[] = []): StampEntry[] =>
    sources.map((s, i) => ({
      path: s.path,
      sha256: s.sha256,
      bytes: s.bytes,
      // ⭐ GH#395 —— mtime 只活在 LIVE stamp 上；已發布的快照不再帶它。
      mtime: "t",
      exists: true,
      ...(over[i] ?? {}),
    }));

  it("is fresh when every digest matches", () => {
    expect(compareFreshness(sources, stamp()).state).toBe("fresh");
  });

  it("is STALE when a source changed, and names which one", () => {
    const f = compareFreshness(sources, stamp([{}, { sha256: "zzz", mtime: "later" }]));
    expect(f.state).toBe("stale");
    expect(f.drifted.map((d) => d.path)).toEqual(["b.py"]);
    expect(f.drifted[0]?.liveSha).toBe("zzz");
  });

  it("is STALE when a source vanished", () => {
    const f = compareFreshness(sources, stamp([{ exists: false, sha256: "" }]));
    expect(f.state).toBe("stale");
    expect(f.drifted[0]?.missing).toBe(true);
  });

  it("is UNKNOWN — not fresh — when there is no live stamp at all", () => {
    // This is the production-build case. Reading it as "fresh" would be exactly
    // the silent-staleness bug the console was asked to eliminate.
    const f = compareFreshness(sources, null);
    expect(f.state).toBe("unknown");
    expect(f.note).not.toBe("");
  });

  it("is UNKNOWN when the spec recorded no sources", () => {
    expect(compareFreshness([], stamp()).state).toBe("unknown");
  });

  it("flags a spec built against a different content set", () => {
    const spec = parseStyleSpec({
      schema: "icon-console/style-spec@1",
      contentDigest: "old",
    });
    expect(digestsAgree(spec, "old")).toBe(true);
    expect(digestsAgree(spec, "new")).toBe(false);
    // Nothing to contradict yet → do not cry wolf.
    expect(digestsAgree(spec, null)).toBe(true);
    expect(digestsAgree(null, "new")).toBe(true);
  });

  it("parses a stamp payload and rejects a non-stamp", () => {
    expect(parseStamp({ sources: [{ path: "a", sha256: "b", exists: true }] })).toHaveLength(1);
    expect(parseStamp({})).toBeNull();
    expect(parseStamp(null)).toBeNull();
  });
});

// ---------------------------------------------------------------- cost ---

describe("cost estimate", () => {
  const base = {
    tier1: 166,
    tier2: 494,
    model: "gpt-image-1",
    quality: "low",
    subject: "derived" as const,
    pricing: PRICING,
  };

  it("uses the runner's formula: rate x images", () => {
    const e = estimateCost({ ...base, tier: "tier1" });
    expect(e.images).toBe(166);
    expect(e.rate).toBe(0.011);
    expect(e.totalUsd).toBeCloseTo(166 * 0.011, 6);
  });

  it("sums both tiers for a full run", () => {
    expect(estimateCost({ ...base, tier: "both" }).images).toBe(660);
  });

  it("adds one text call per image in --subject=text mode", () => {
    const e = estimateCost({ ...base, tier: "tier1", subject: "text" });
    expect(e.textCalls).toBe(166);
    expect(e.totalUsd).toBeCloseTo(166 * 0.011 + 166 * 0.0002, 6);
  });

  it("reports an UNKNOWN rate rather than guessing one", () => {
    const e = estimateCost({ ...base, tier: "tier1", quality: "ultra" });
    expect(e.known).toBe(false);
    expect(e.rate).toBeNull();
    expect(e.totalUsd).toBeNull();
    expect(usd(e.totalUsd)).toBe("—");
  });

  it("survives a missing price table", () => {
    const e = estimateCost({ ...base, tier: "both", pricing: null });
    expect(e.known).toBe(false);
    expect(e.images).toBe(660);
  });

  it("lists only numeric quality tiers, not the prose note field", () => {
    expect(pricedQualities(PRICING, "gpt-image-1")).toEqual(["low", "medium", "high"]);
    expect(imageRate(PRICING, "gpt-image-1", "note")).toBeNull();
  });
});

describe("authorisation", () => {
  const est = estimateCost({
    tier1: 166,
    tier2: 494,
    tier: "tier1",
    model: "gpt-image-1",
    quality: "low",
    subject: "derived",
    pricing: PRICING,
  });

  it("states that nothing can be billed while there is no provider", () => {
    const a = authorisation({ state: "loading" }, est);
    expect(a.billable).toBe(false);
    expect(a.detail).toContain("佔位");
  });

  it("demands explicit approval once a provider is live", () => {
    const a = authorisation(okProbe({ imageReady: true }), est);
    expect(a.billable).toBe(true);
    expect(a.command).toContain("--i-have-confirmed-pricing");
    expect(a.command).toContain("--max-spend");
  });
});

// --------------------------------------------------------- the contract ---

describe("style spec contract", () => {
  it("rejects a document that is not a style spec", () => {
    expect(parseStyleSpec(null)).toBeNull();
    expect(parseStyleSpec({ schema: "icon-console/style-spec@99" })).toBeNull();
    expect(parseStyleSpec({})).toBeNull();
  });

  /**
   * THE BLIND-SPOT GUARD. The Python emitter records digests for one list of
   * files; the dev server hashes another. If they drift apart, a source could
   * change without the page ever noticing — the page would show a green "fresh"
   * badge over stale art direction, which is worse than showing nothing.
   */
  it("hashes exactly the files the emitter derives from", () => {
    const py = readFileSync(`${REPO}/tools/icon-console/emit_style_spec.py`, "utf8");
    const block = /SOURCE_FILES\s*=\s*\[([\s\S]*?)\]/.exec(py);
    expect(block, "SOURCE_FILES not found in emit_style_spec.py").not.toBeNull();
    const fromPython = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(fromPython.length).toBeGreaterThan(0);
    expect([...STAMP_SOURCES].sort()).toEqual([...fromPython].sort());
  });

  /** The published spec must actually parse with the reader the page uses. */
  it("parses the spec currently published in the repo", () => {
    const raw = JSON.parse(
      readFileSync(`${REPO}/content/assets/icon-console/style-spec.json`, "utf8"),
    );
    const spec = parseStyleSpec(raw);
    expect(spec).not.toBeNull();
    expect(spec?.template.prefix.length).toBeGreaterThan(100);
    expect(spec?.template.negative).toContain("no border");
    expect(spec?.contactSheet.slots).toHaveLength(16);
    // Every slot carries the FULL string that would be sent, assembled by
    // prompt.build_prompt — not a summary of it.
    for (const s of spec?.contactSheet.slots ?? []) {
      if (!s.found) continue;
      expect(s.prompt.startsWith(spec?.template.prefix ?? "")).toBe(true);
      expect(s.prompt).toContain(s.subject);
      expect(s.prompt.endsWith(spec?.template.negative ?? "")).toBe(true);
    }
  });

  /** The sheet is a set of PROBES; the hard cases must really be present. */
  it("keeps the four hard cases on the contact sheet", () => {
    const raw = JSON.parse(
      readFileSync(`${REPO}/content/assets/icon-console/style-spec.json`, "utf8"),
    );
    const spec = parseStyleSpec(raw);
    const probes = (spec?.contactSheet.slots ?? []).map((s) => s.probe);
    expect(probes).toContain("vague-description");
    expect(probes).toContain("longest-description");
    expect(probes).toContain("siblings-same-kit-a");
    expect(probes).toContain("identical-subject-a");

    const collide = (spec?.contactSheet.slots ?? []).filter((s) =>
      s.probe.startsWith("identical-subject"),
    );
    // If both resolved, their derived subjects must genuinely be identical —
    // that is the failure the slot pair exists to make visible.
    if (collide.length === 2 && collide.every((s) => s.found)) {
      expect(collide[0]?.subject).toBe(collide[1]?.subject);
      expect(collide[0]?.id).not.toBe(collide[1]?.id);
    }
  });

  /** No Chinese mechanics prose may ride along into the image prompt. */
  it("never forwards raw description prose into a prompt", () => {
    const raw = JSON.parse(
      readFileSync(`${REPO}/content/assets/icon-console/style-spec.json`, "utf8"),
    );
    const spec = parseStyleSpec(raw);
    for (const s of spec?.contactSheet.slots ?? []) {
      if (!s.found || s.descriptionChars < 30) continue;
      // The name survives inside 「」; the description body must not appear.
      const body = s.description.replace(/^\[[^\]]*\]/, "").trim();
      expect(s.prompt).not.toContain(body);
    }
  });
});

/**
 * vfx-gore-style (task #39): config.gore@1 — the 濺血 style knob.
 *
 * The one property worth a schema rather than a convention: a per-champion
 * entry may only ever make a hit LESS bloody. "blood" is not an accepted
 * per-champion value, so no content edit can re-introduce blood for a player
 * who chose "stylized" or "off". The SHIPPED doc is loaded from disk and held
 * to the same contract, including that its champion keys resolve.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { zConfigGoreDoc, zConfigDoc } from "./schema/config";

const CONTENT_DIR = fileURLToPath(new URL("../../../../content/", import.meta.url));

const SAMPLE = {
  id: "gore",
  schema: "config.gore@1" as const,
  style: "blood" as const,
  intensity: 0.85,
  championStyles: { "godie-hlgr": "stylized" as const },
};

describe("config.gore@1 schema (vfx-gore-style)", () => {
  it("round-trips through the config discriminated union", () => {
    cover("vfx-gore-style");
    const direct = zConfigGoreDoc.parse(SAMPLE);
    const viaUnion = zConfigDoc.parse(SAMPLE);
    expect(direct).toEqual(viaUnion);
    expect(direct.style).toBe("blood");
    expect(direct.championStyles["godie-hlgr"]).toBe("stylized");
  });

  it("REJECTS a per-champion entry that would ADD blood", () => {
    cover("vfx-gore-style");
    expect(() =>
      zConfigGoreDoc.parse({ ...SAMPLE, championStyles: { "godie-hlgr": "blood" } }),
    ).toThrow();
  });

  it("rejects an out-of-range intensity, an unknown style and unknown keys", () => {
    cover("vfx-gore-style");
    expect(() => zConfigGoreDoc.parse({ ...SAMPLE, intensity: 1.5 })).toThrow();
    expect(() => zConfigGoreDoc.parse({ ...SAMPLE, intensity: -0.1 })).toThrow();
    expect(() => zConfigGoreDoc.parse({ ...SAMPLE, style: "gushing" })).toThrow();
    expect(() => zConfigGoreDoc.parse({ ...SAMPLE, splatter: true })).toThrow();
  });

  it("the SHIPPED doc parses, defaults to 濺血, and only ever reduces gore", () => {
    cover("vfx-gore-style");
    const raw: unknown = JSON.parse(readFileSync(CONTENT_DIR + "config/gore.json", "utf8"));
    const doc = zConfigGoreDoc.parse(raw);
    expect(doc.style).toBe("blood"); // the user asked for 濺血 — it ships on
    expect(doc.intensity).toBeGreaterThan(0.5);
    const champions: unknown = JSON.parse(
      readFileSync(CONTENT_DIR + "champions/_index.json", "utf8"),
    );
    const known = new Set(
      ((champions as { entries: { id: string }[] }).entries ?? []).map((e) => e.id),
    );
    for (const [championId, style] of Object.entries(doc.championStyles)) {
      // an override on a champion that does not exist is dead weight
      expect(known.has(championId)).toBe(true);
      expect(style === "stylized" || style === "off").toBe(true);
    }
  });
});

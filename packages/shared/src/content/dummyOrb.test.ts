/**
 * Task #9 — WC3 dummy-effect-unit + orb/attachment wiring (化繁為簡).
 *   do-schema-parse   — the additive `spawnVfx` EffectDef parses through the
 *                       shared union and `.strict()` rejects bad shapes.
 *   do-placeholder-wire — the 3 dummy placeholders gained a spawnVfx to an
 *                       EXISTING vfx doc while keeping their real damage, in
 *                       BOTH the embedded champion copy and the standalone doc.
 *   do-ambient-bind   — ambient-vfx.json parses and every bound vfx resolves
 *                       on disk; the 3 new ribbon bindings carry a real bone.
 *   do-no-dangle      — spawnVfx.vfxId is a SOFT vfx ref (walker + validate).
 * Fixtures are the REAL content docs this task edited.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { zEffectDef, zConfigAmbientVfxDoc } from "./schema/index";
import { validateDoc } from "./loader";
import { extractRefs, validateReferences } from "./refs";
import { ContentStore } from "./store";

const CONTENT = join(__dirname, "../../../../content");
const readJson = (rel: string): any => JSON.parse(readFileSync(join(CONTENT, rel), "utf8"));
const vfxExists = (id: string): boolean => existsSync(join(CONTENT, "vfx", `${id}.json`));

/** the 3 placeholders wired this task: champ file, slot, standalone id, vfxId. */
const WIRED = [
  { champ: "godie-e00x", slot: "R", ability: "godie-e00x.r", vfx: "godie-lightningtornado-p0" },
  { champ: "godie-h01o", slot: "E", ability: "godie-h01o.e", vfx: "godie-deathwave-p0" },
  { champ: "godie-hvwd", slot: "R", ability: "godie-hvwd.r", vfx: "godie-aquaspikeversion2-p0" },
] as const;

describe("spawnVfx EffectDef (do-schema-parse)", () => {
  it("parses at self/target/point + optional durationSec; strict rejects bad shapes", () => {
    cover("do-schema-parse");
    // valid: minimal (at defaults on the runner side, omitted here)
    expect(zEffectDef.parse({ kind: "spawnVfx", vfxId: "godie-deathwave-p0" })).toEqual({
      kind: "spawnVfx",
      vfxId: "godie-deathwave-p0",
    });
    for (const at of ["self", "target", "point"] as const) {
      const d = zEffectDef.parse({ kind: "spawnVfx", vfxId: "godie-deathwave-p0", at, durationSec: 2 });
      expect(d).toMatchObject({ kind: "spawnVfx", at, durationSec: 2 });
    }
    // invalid: unknown `at`
    expect(zEffectDef.safeParse({ kind: "spawnVfx", vfxId: "x", at: "overhead" }).success).toBe(false);
    // invalid: missing vfxId
    expect(zEffectDef.safeParse({ kind: "spawnVfx", at: "self" }).success).toBe(false);
    // invalid: extra key (.strict)
    expect(
      zEffectDef.safeParse({ kind: "spawnVfx", vfxId: "x", bone: "hand" }).success,
    ).toBe(false);
    // invalid: negative duration
    expect(zEffectDef.safeParse({ kind: "spawnVfx", vfxId: "x", durationSec: -1 }).success).toBe(false);
  });
});

describe("dummy placeholders wired to real VFX (do-placeholder-wire)", () => {
  it("each of the 3 keeps real damage AND gained a spawnVfx to an existing vfx doc — embedded + standalone", () => {
    cover("do-placeholder-wire");
    for (const w of WIRED) {
      // referenced vfx@1 doc must exist on disk (no dangle)
      expect(vfxExists(w.vfx), `${w.vfx} must exist`).toBe(true);

      // standalone ability doc validates + carries damage + the spawnVfx
      const abilityRaw = readJson(`abilities/${w.ability}.json`);
      const abRes = validateDoc("abilities", abilityRaw);
      expect(abRes.ok, `${w.ability} must validate`).toBe(true);
      const abEffects: any[] = abilityRaw.effects;
      expect(abEffects.some((e) => e.kind === "damage")).toBe(true);
      const sv = abEffects.find((e) => e.kind === "spawnVfx");
      expect(sv, `${w.ability} must have a spawnVfx`).toBeDefined();
      expect(sv.vfxId).toBe(w.vfx);

      // embedded champion copy (the one the sim registers) mirrors it
      const champRaw = readJson(`champions/${w.champ}.json`);
      const chRes = validateDoc("champions", champRaw);
      expect(chRes.ok, `${w.champ} must validate`).toBe(true);
      const embEffects: any[] = champRaw.abilities[w.slot].effects;
      expect(embEffects.some((e) => e.kind === "damage")).toBe(true);
      const embSv = embEffects.find((e) => e.kind === "spawnVfx");
      expect(embSv, `${w.champ}.${w.slot} must have a spawnVfx`).toBeDefined();
      expect(embSv.vfxId).toBe(w.vfx);
    }
  });
});

describe("orb/attachment ambient bindings (do-ambient-bind)", () => {
  it("ambient-vfx.json parses; every bound vfx resolves on disk; the 3 new ribbon bindings carry a real bone", () => {
    cover("do-ambient-bind");
    const raw = readJson("config/ambient-vfx.json");
    expect(validateDoc("config", raw).ok).toBe(true);
    const doc = zConfigAmbientVfxDoc.parse(raw);

    // no dangling ambient ref anywhere
    for (const [key, binds] of Object.entries(doc.bindings)) {
      for (const b of binds) {
        expect(vfxExists(b.vfx), `${key} -> ${b.vfx} must exist`).toBe(true);
      }
    }

    // the 3 champion weapon-trail ribbons added this task
    const NEW = {
      "imported.mfls": ["godie-mfls-r0", "godie-mfls-r1"],
      "imported.heromusashimiyamoto": ["godie-heromusashimiyamoto-r0", "godie-heromusashimiyamoto-r1"],
      "imported.sesshomaru": ["godie-sesshomaru-r0"],
    } as const;
    for (const [key, ids] of Object.entries(NEW)) {
      const bound = (doc.bindings[key] ?? []).map((b) => b.vfx);
      expect(bound, `${key} must be bound`).toEqual(ids);
      for (const id of ids) {
        const vdoc = readJson(`vfx/${id}.json`);
        expect(vdoc.schema).toBe("ribbon@1");
        expect(typeof vdoc.anchorBone === "string" && vdoc.anchorBone.length > 0).toBe(true);
      }
    }
  });
});

describe("spawnVfx is a soft vfx ref (do-no-dangle)", () => {
  it("the ref-graph walker registers spawnVfx.vfxId as a soft vfx ref; present → 0 errors, absent → warning not error", () => {
    cover("do-no-dangle");
    const abilityRaw = readJson("abilities/godie-e00x.r.json");
    const parsed = validateDoc("abilities", abilityRaw);
    expect(parsed.ok).toBe(true);
    const doc = (parsed as { ok: true; doc: any }).doc;

    const edges = extractRefs("abilities", doc);
    const vfxEdge = edges.find((e) => e.targetCollection === "vfx" && e.targetId === "godie-lightningtornado-p0");
    expect(vfxEdge, "spawnVfx.vfxId must appear as a vfx edge").toBeDefined();
    expect(vfxEdge!.soft).toBe(true);
    expect(vfxEdge!.field).toMatch(/effects\.\d+\.vfxId/);

    // absent target → SOFT warning (never a hard error)
    const store = new ContentStore();
    store.add("abilities", doc.id, doc);
    const rep = validateReferences(store);
    expect(rep.errors.some((e) => e.targetCollection === "vfx")).toBe(false);
    expect(rep.warnings.some((e) => e.targetId === "godie-lightningtornado-p0")).toBe(true);
  });
});

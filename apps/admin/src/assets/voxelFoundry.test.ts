/**
 * 體素鑄造廠's pure half — what the page can and cannot claim.
 *
 * The one that matters is `forge()`: it must produce, in one step, the BYTES an
 * operator downloads and the DOCUMENT that gets written, so a save can never
 * describe a file the operator did not get. Everything else here is the budget
 * arithmetic #226 was raised about.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { bakeLook, lookFromArchetype, toModelDoc } from "@ggd/shared/voxel";
import {
  ARCHETYPE_LOOKS,
  RETIRED_MODELS,
  baselineModel,
  budgetVerdict,
  canForge,
  fmtBytes,
  forge,
  foundryDocId,
  foundryFileName,
  foundryGlbPath,
  foundryIssues,
  foundrySlug,
  lookForSource,
  saveNotice,
} from "./voxelFoundry";

const KNIGHT = lookFromArchetype("knight");

describe("forge — one step from a look to the bytes AND the doc", () => {
  it("produces real .glb bytes, not a stub", () => {
    cover("adminui-voxel-foundry");
    const r = forge("Test Guy", KNIGHT)!;
    expect(r).not.toBeNull();
    expect(r.bytes.length).toBeGreaterThan(10_000);
    // glTF magic, little-endian: "glTF"
    const dv = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(4, true)).toBe(2); // version
    expect(dv.getUint32(8, true)).toBe(r.bytes.length); // total length
  });

  it("is a plain Uint8Array — a node Buffer would not be a valid BlobPart", () => {
    cover("adminui-voxel-foundry");
    const r = forge("test", KNIGHT)!;
    expect(Object.getPrototypeOf(r.bytes) === Uint8Array.prototype).toBe(true);
  });

  it("the doc it would save points at the file it just produced", () => {
    cover("adminui-voxel-foundry");
    // The property that makes 下載 + 寫入 safe as two separate buttons.
    const r = forge("拳四郎 Test", KNIGHT)!;
    expect(r.doc.glbPath).toBe(r.glbPath);
    expect(r.doc.id).toBe(r.id);
    expect(r.glbPath).toContain(r.fileName);
    expect(r.doc).toEqual(toModelDoc(r.id, KNIGHT));
  });

  it("is deterministic and matches the shared bake exactly", () => {
    cover("adminui-voxel-foundry");
    const a = forge("same-name", KNIGHT)!;
    const b = forge("same-name", KNIGHT)!;
    expect(a.stats.sha256).toBe(b.stats.sha256);
    expect(a.stats.sha256).toBe(bakeLook(a.id, KNIGHT).stats.sha256);
  });

  it("refuses an id it cannot legally write", () => {
    cover("adminui-voxel-foundry");
    expect(forge("", KNIGHT)).toBeNull();
    expect(forge("   ", KNIGHT)).toBeNull();
    expect(forge("!!!", KNIGHT)).toBeNull();
  });
});

describe("id + path derivation", () => {
  it("slugs to something an operator can type into a shell", () => {
    cover("adminui-voxel-foundry");
    expect(foundrySlug("  Thorne  the Knight ")).toBe("thorne-the-knight");
    expect(foundrySlug("拳四郎")).toBe("");
    expect(foundrySlug("a--b__c")).toBe("a-b-c");
    expect(foundrySlug("-lead-and-trail-")).toBe("lead-and-trail");
    expect(foundrySlug("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });

  it("derives the id, the path and the download name from ONE source", () => {
    cover("adminui-voxel-foundry");
    const id = foundryDocId("Blocky Bob");
    expect(id).toBe("voxel.blocky-bob");
    expect(foundryGlbPath(id)).toBe("assets/models/voxel/voxel.blocky-bob.glb");
    // the download name is the PATH's basename, so the file an operator saves
    // is the file the doc asks the loader for
    expect(foundryFileName(id)).toBe("voxel.blocky-bob.glb");
    expect(foundryGlbPath(id).endsWith(foundryFileName(id))).toBe(true);
  });
});

describe("the budget verdict — #226's own definition of success", () => {
  it("compares against the LIGHTEST retired character, not the heaviest", () => {
    cover("adminui-voxel-foundry");
    const base = baselineModel();
    for (const m of RETIRED_MODELS) expect(base.triangles).toBeLessThanOrEqual(m.triangles);
    expect(base.key).toBe("barbarian");
  });

  it("passes a real bake, with room to spare on both axes", () => {
    cover("adminui-voxel-foundry");
    const r = forge("budget-check", KNIGHT)!;
    expect(r.budget.ok).toBe(true);
    const [tris, bytes] = r.budget.rows;
    expect(tris!.ratio).toBeLessThan(0.05); // 168 tris vs 5,683
    expect(bytes!.ratio).toBeLessThan(0.06); // ~52 KB vs ~1.28 MB
    expect(r.budget.summary).toContain("比");
  });

  it("FAILS a model heavier than what it replaces", () => {
    cover("adminui-voxel-foundry");
    // The whole point: this outcome must be an error, not a note. Synthesised
    // stats, because the real generator cannot currently produce them — which
    // is exactly why the check has to exist independently of it.
    const base = baselineModel();
    const heavy = budgetVerdict(
      {
        triangles: base.triangles + 1,
        vertices: 0,
        bytes: base.bytes + 1,
        joints: 15,
        clips: 7,
        channelsPerFrame: 8,
        materials: 1,
        meshes: 1,
        texEdge: 16,
        textureBytes: 1000,
        sha256: "",
      },
      base,
    );
    expect(heavy.ok).toBe(false);
    expect(heavy.summary).toContain("#226");
    const issues = foundryIssues("heavy", {
      id: "voxel.heavy",
      bytes: new Uint8Array(0),
      stats: {
        triangles: base.triangles + 1,
        vertices: 0,
        bytes: base.bytes + 1,
        joints: 15,
        clips: 7,
        channelsPerFrame: 8,
        materials: 1,
        meshes: 1,
        texEdge: 16,
        textureBytes: 1000,
        sha256: "",
      },
      budget: heavy,
      glbPath: "assets/models/voxel/heavy.glb",
      fileName: "heavy.glb",
      doc: {},
    });
    expect(issues.some((i) => i.level === "error")).toBe(true);
    expect(canForge("heavy", null)).toBe(false);
  });

  it("prints byte counts the way the model-budget page does", () => {
    cover("adminui-voxel-foundry");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(52_120)).toBe("50.9 KB");
    expect(fmtBytes(1_622_000)).toBe("1.55 MB");
  });
});

describe("look sources", () => {
  it("an archetype preset is the SHIPPED look, with no seed jitter", () => {
    cover("adminui-voxel-foundry");
    for (const key of Object.keys(ARCHETYPE_LOOKS)) {
      expect(lookForSource({ kind: "archetype", key })).toEqual(lookFromArchetype(key));
    }
    // and the bake of a preset is byte-identical to the shipped blocky-*.glb
    const knight = bakeLook("knight", ARCHETYPE_LOOKS.knight!);
    expect(knight.stats.sha256).toBe(
      "b572e756dcfc88e4e7e234b74f2178bef7ad1b46479dc2eef49aa10eaf6c0810",
    );
  });

  it("a champion source is seeded by its id and differs from the bare archetype", () => {
    cover("adminui-voxel-foundry");
    const look = lookForSource({
      kind: "champion",
      championId: "godie-umal",
      modelKey: "champ.skin.barbarian",
      archetype: "barbarian",
    });
    expect(look).not.toEqual(lookFromArchetype("barbarian"));
    // deterministic
    expect(
      lookForSource({
        kind: "champion",
        championId: "godie-umal",
        modelKey: "champ.skin.barbarian",
        archetype: "barbarian",
      }),
    ).toEqual(look);
  });

  it("an unknown archetype degrades to the default rather than throwing", () => {
    cover("adminui-voxel-foundry");
    expect(() => lookForSource({ kind: "archetype", key: "nope" })).not.toThrow();
  });
});

describe("the save notice tells the operator the half the overlay does NOT do", () => {
  it("names the path and the digest of the file that still has to be placed", () => {
    cover("adminui-voxel-foundry");
    const r = forge("notice-test", KNIGHT)!;
    const n = saveNotice(r);
    expect(n).toContain(r.id);
    expect(n).toContain(r.glbPath);
    expect(n).toContain(r.stats.sha256.slice(0, 12));
  });
});

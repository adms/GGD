/**
 * voxel-studio (task #229) — 鑄形工坊's own tests, in the repo's admin style:
 * PURE HELPERS plus SOURCE SCANS. The admin vitest env is plain node with no
 * DOM, so nothing here mounts a component; what is asserted instead is the two
 * things a component test could not prove anyway —
 *
 *   1. the page drives the SHARED generator and no admin-local look-alike, and
 *   2. the page opens no new write path.
 *
 * Both are properties of the IMPORT GRAPH and the source text, which is exactly
 * what a scan can check and a render cannot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { COLLECTIONS, zModelDoc } from "@ggd/shared/content";
import {
  ARCHETYPE_KEYS,
  DEFAULT_LOOK,
  lookFromArchetype,
  toModelDoc,
  withJointScale,
  type VoxelLook,
} from "@ggd/shared/voxel";
import { EDIT_COLLECTIONS, isEditCollection } from "@ggd/shared/content/editModel";
import { COLLECTION_DIR, COLLECTION_LABEL, allFields, fieldSpec } from "../../contentFields";
import {
  BAKE_COMMAND,
  STUDIO_COLLECTION,
  bakeNotice,
  canSave,
  isStudioDocId,
  studioDocId,
  studioGlbPath,
  studioIssues,
  studioReadout,
  studioSlug,
  studioWritePlan,
} from "./studioModel";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Strip comments so prose in a doc block cannot satisfy (or break) a scan. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function studioSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  for (const name of readdirSync(HERE)) {
    const p = join(HERE, name);
    if (statSync(p).isDirectory()) continue;
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    out.push({ file: name, src: readFileSync(p, "utf8") });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A. ONE generator, shared with #226 — the owner's central requirement
// ---------------------------------------------------------------------------

describe("A: the studio drives the SHARED generator, not a second look-alike", () => {
  it("every shape/pose/doc decision is imported from @ggd/shared/voxel", () => {
    cover("voxel-studio-shared-core");
    const byFile = new Map(studioSources().map((s) => [s.file, code(s.src)]));
    // the page and the Babylon adapter must both source the figure from shared
    expect(byFile.get("VoxelStudioPage.tsx")).toMatch(/from "@ggd\/shared\/voxel"/);
    expect(byFile.get("VoxelCanvas.tsx")).toMatch(/from "@ggd\/shared\/voxel"/);
    expect(byFile.get("voxelMeshes.ts")).toMatch(/from "@ggd\/shared\/voxel"/);
    expect(byFile.get("studioModel.ts")).toMatch(/from "@ggd\/shared\/voxel"/);
  });

  it("no module under ui/voxel/ re-declares the part table, the joints or the clips", () => {
    cover("voxel-studio-shared-core");
    // A forked generator would show up as a local copy of these tables. Naming
    // them here is what makes "we did not fork it" checkable rather than
    // asserted — a second BOXES/JOINTS/CLIPS in this folder fails the build.
    for (const { file, src } of studioSources()) {
      const s = code(src);
      for (const decl of ["const BOXES", "const JOINTS", "const CLIPS", "const ARCHETYPES"]) {
        expect(s.includes(decl), `${file} must not declare its own ${decl}`).toBe(false);
      }
    }
  });

  it("the Babylon adapter derives every mesh from a VoxelFigure", () => {
    cover("voxel-studio-shared-core");
    const s = code(readFileSync(join(HERE, "voxelMeshes.ts"), "utf8"));
    // positions/sizes come from the figure, never from literals in this file
    expect(s).toMatch(/figure\.boxes/);
    expect(s).toMatch(/figure\.joints/);
    expect(s).toMatch(/box\.localSize\[0\]/);
    // and the #64 outline renderer side-effect import is present, or the hit
    // flash silently does nothing while looking wired up
    expect(s).toMatch(/@babylonjs\/core\/Rendering\/outlineRenderer/);
  });

  it("does NOT depend on @babylonjs/loaders — the studio cannot load a file", () => {
    cover("voxel-studio-noassets");
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toContain("@babylonjs/core");
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@babylonjs/loaders");
    for (const { file, src } of studioSources()) {
      const s = code(src);
      expect(s.includes("@babylonjs/loaders"), file).toBe(false);
      // no file-ingest control anywhere: a generator that can import a skin is
      // a generator that can import someone else's skin
      expect(s.includes('type="file"'), file).toBe(false);
      expect(s.includes("FileReader"), file).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// B. the save opens NO new write path
// ---------------------------------------------------------------------------

describe("B: the save rides the existing gate and adds nothing", () => {
  it("no module under ui/voxel/ names the content-api mount", () => {
    cover("voxel-studio-save");
    // contentGate.test.ts walks all of apps/admin/src for this; asserting it
    // here too means a regression names the studio in the failure, not a
    // 300-file walk.
    for (const { file, src } of studioSources()) {
      expect(/\/content-api\//.test(code(src)), file).toBe(false);
    }
  });

  it("the page never calls fetch — it goes through createContentEditApi", () => {
    cover("voxel-studio-save");
    const page = code(readFileSync(join(HERE, "VoxelStudioPage.tsx"), "utf8"));
    expect(page).toMatch(/createContentEditApi\(\)/);
    expect(page).not.toMatch(/\bfetch\(/);
    // and it renders the OFF message rather than a dead button
    expect(page).toMatch(/api\.offMessage/);
    expect(page).toMatch(/api\.enabled/);
  });

  it("plans exactly ONE write, into `models`, with reason `edit`", () => {
    cover("voxel-studio-save");
    const steps = studioWritePlan("voxel.test", DEFAULT_LOOK);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.collection).toBe("models");
    expect(steps[0]?.reason).toBe("edit");
    expect(STUDIO_COLLECTION).toBe("models");
  });

  it("`models` is a recognised edit collection, registered end to end", () => {
    cover("voxel-studio-save");
    expect(isEditCollection("models")).toBe(true);
    expect(EDIT_COLLECTIONS).toContain("models");
    expect(COLLECTION_LABEL.models).toBe("模型");
    expect(COLLECTION_DIR.models).toBe("models");
    expect(allFields("models").length).toBeGreaterThan(3);
    // the two fields that must never be hand-typed
    expect(fieldSpec("models", "glbPath")?.readOnly).toBe(true);
    expect(fieldSpec("models", "scale")?.readOnly).toBe(true);
    expect(fieldSpec("models", "id")?.readOnly).toBe(true);
  });

  it("the two-phase save is stated to the operator, with the exact command", () => {
    cover("voxel-studio-save");
    const notice = bakeNotice("voxel.zombie", "cv_abc123");
    expect(notice).toContain(BAKE_COMMAND);
    expect(notice).toContain("cv_abc123");
    expect(notice).toContain("assets/models/voxel/voxel.zombie.glb");
    // the page shows it
    expect(readFileSync(join(HERE, "VoxelStudioPage.tsx"), "utf8")).toContain("bakeNotice");
  });
});

// ---------------------------------------------------------------------------
// C. what the studio emits is a valid model@1
// ---------------------------------------------------------------------------

describe("C: a save emits a schema-valid model@1", () => {
  it("validates through COLLECTIONS.models for every archetype", () => {
    cover("voxel-studio-save");
    for (const key of ARCHETYPE_KEYS) {
      const doc = studioWritePlan(`voxel.${key}`, lookFromArchetype(key))[0]!.doc;
      expect(COLLECTIONS.models.schema.safeParse(doc).success, key).toBe(true);
      expect(zModelDoc.safeParse(doc).success, key).toBe(true);
    }
  });

  it("derives the glb path and keeps it off the yaw-offset prefixes", () => {
    cover("voxel-studio-save");
    const p = studioGlbPath("voxel.zombie");
    expect(p).toBe("assets/models/voxel/voxel.zombie.glb");
    expect(p.startsWith("assets/models/imported/")).toBe(false);
    expect(p.startsWith("assets/blizzard-local/models/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. the pure page logic
// ---------------------------------------------------------------------------

describe("D: id minting", () => {
  it("slugifies to a filename an operator can also type into a shell", () => {
    cover("voxel-studio-core");
    expect(studioSlug("Zombie Grunt")).toBe("zombie-grunt");
    expect(studioSlug("  ---A_B--  ")).toBe("a-b");
    expect(studioSlug("殭屍")).toBe("");
    expect(studioDocId("Zombie Grunt")).toBe("voxel.zombie-grunt");
    expect(studioDocId("   ")).toBe("");
  });

  it("recognises its own ids and rejects everything else", () => {
    cover("voxel-studio-core");
    expect(isStudioDocId("voxel.zombie-grunt")).toBe(true);
    expect(isStudioDocId("voxel.")).toBe(false);
    expect(isStudioDocId("champ.sela")).toBe(false);
    expect(isStudioDocId("voxel.Bad Name")).toBe(false);
  });
});

describe("D: the readout and the pre-flight issues", () => {
  it("reports #150's normalisation rather than letting the operator break it", () => {
    cover("voxel-studio-core");
    const r = studioReadout(DEFAULT_LOOK);
    expect(r.docScale).toBeCloseTo(1, 6);
    expect(r.height * r.docScale).toBeCloseTo(1.8, 6);
    expect(r.triCount).toBeGreaterThan(0);
  });

  it("blocks a save with no name and one with no visible geometry", () => {
    cover("voxel-studio-core");
    expect(canSave("", DEFAULT_LOOK)).toBe(false);
    expect(canSave("ok-name", DEFAULT_LOOK)).toBe(true);
    let flat: VoxelLook = DEFAULT_LOOK;
    for (const j of ["hips", "chest", "head", "handLeft", "handRight", "footLeft", "footRight"] as const) {
      flat = withJointScale(flat, j, [0, 0, 0]);
    }
    expect(studioIssues("ok-name", flat).some((i) => i.level === "error")).toBe(true);
  });

  it("WARNS about a collision radius that no longer contains the silhouette", () => {
    cover("voxel-studio-core");
    // authored, never derived — the page must say so rather than silently
    // resizing a hitbox because someone widened a shoulder pad
    const wide = withJointScale({ ...DEFAULT_LOOK, collisionRadius: 0.2 }, "chest", [2.4, 1, 2.4]);
    expect(studioIssues("ok-name", wide).some((i) => i.level === "warn")).toBe(true);
    expect(canSave("ok-name", wide)).toBe(true); // a warning is not a veto
  });

  it("studioReadout is pure", () => {
    cover("voxel-studio-core");
    const before = JSON.stringify(DEFAULT_LOOK);
    studioReadout(DEFAULT_LOOK);
    expect(JSON.stringify(DEFAULT_LOOK)).toBe(before);
    expect(studioReadout(DEFAULT_LOOK)).toEqual(studioReadout(DEFAULT_LOOK));
  });
});

describe("D: the doc the page shows is the doc it saves", () => {
  it("toModelDoc is the only document builder in play", () => {
    cover("voxel-studio-save");
    const look = lookFromArchetype("undead");
    expect(studioWritePlan("voxel.u", look)[0]!.doc).toEqual(
      toModelDoc("voxel.u", look) as unknown as Record<string, unknown>,
    );
  });
});

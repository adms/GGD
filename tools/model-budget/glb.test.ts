/**
 * glb.test — pins the shared parser to the SAME cross-checked numbers
 * emit_report/report.test use, so the guard and the optimiser can never measure
 * a model differently from the page. Also proves the rebuild invariant the
 * texture stage depends on: rebuilding a glb (with or without swapped image
 * bytes) leaves every geometry/skin/animation byte untouched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { geometryDiff, measureGlb, readGlb, readImages, rebuildGlb } from "./glb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MODELS = path.join(ROOT, "content/assets/models");
const BLOCKY_KNIGHT = path.join(MODELS, "champions/blocky-knight.glb");
/** A model that still carries a real texture + rig, for the rebuild tests. */
const TOWER = path.join(MODELS, "hex/tower_blue.glb");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glb-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("measureGlb reproduces the cross-checked numbers", () => {
  it("blocky-knight.glb matches the pinned measurement (tris/edge/vram/rig)", () => {
    // WAS knight.glb: 6,952 tris / 1024² albedo / 5,592,405 B VRAM / 41 joints /
    // 16 clips. Owner directive #226 retired the four KayKit stand-ins as too
    // high-poly and replaced them with generated box-men (tools/voxel-gen), so
    // the whole measurement moves by two orders of magnitude. Every number below
    // is produced by the generator and pinned there too (gen.test.ts).
    const m = measureGlb(BLOCKY_KNIGHT);
    expect(m.triangles).toBe(168); // 14 boxes × 12
    expect(m.maxTextureEdge).toBe(16); // 16² palette, NEAREST-sampled
    expect(m.vramBytes).toBe(1365); // 16² RGBA8 × 4/3
    expect(m.skins).toBe(1);
    expect(m.joints).toBe(15);
    expect(m.clips).toBe(7); // idle/run/attack/cast/hurt/death + cheer
    expect(m.materials).toBe(1); // ONE draw call
  });

  it("shipping triangle total across content/assets/models matches the baseline", () => {
    const glbs: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".glb")) glbs.push(p);
      }
    };
    walk(MODELS);
    const total = glbs.reduce((n, f) => n + measureGlb(f).triangles, 0);
    // report.test pins the SHIPPING floor (144,827 since #226 deleted 9.73 MB /
    // 46,687 tris of KayKit stand-ins + their LOD tiers). This walk counts every
    // .glb under content/assets/models INCLUDING tier files, so it is a strictly
    // larger number and stays a loose sanity floor, not an equality pin.
    expect(total).toBeGreaterThanOrEqual(144_827);
  });
});

describe("rebuildGlb preserves everything but the swapped image bytes", () => {
  it("an empty rebuild is geometry-identical and reloadable", () => {
    const { json, bin } = readGlb(TOWER);
    const out = path.join(tmp, "rebuilt-noop.glb");
    fs.writeFileSync(out, rebuildGlb(json, bin!, new Map()));
    expect(geometryDiff(TOWER, out)).toBeNull();
    // still a valid glb the parser accepts, with the same measurement
    expect(measureGlb(out).triangles).toBe(5659);
  });

  it("swapping an image's bytes leaves geometry/skin/animation untouched", () => {
    const glb = readGlb(TOWER);
    const img = readImages(glb)[0]!;
    // replace the image bytes with a different-length dummy buffer
    const replacements = new Map([[img.bufferView, Buffer.alloc(123, 0x7f)]]);
    const out = path.join(tmp, "rebuilt-swap.glb");
    fs.writeFileSync(out, rebuildGlb(glb.json, glb.bin!, replacements));
    // geometry invariant holds even though an image view changed size
    expect(geometryDiff(TOWER, out)).toBeNull();
    // and the replaced view really did change
    const after = readGlb(out);
    expect(after.json.bufferViews[img.bufferView].byteLength).toBe(123);
  });
});

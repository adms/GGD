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
const KNIGHT = path.join(MODELS, "champions/knight.glb");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glb-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("measureGlb reproduces the cross-checked numbers", () => {
  it("knight.glb matches the pinned measurement (tris/edge/vram/rig)", () => {
    const m = measureGlb(KNIGHT);
    expect(m.triangles).toBe(6952);
    expect(m.maxTextureEdge).toBe(1024);
    expect(m.vramBytes).toBe(5592405); // 1024² RGBA8 × 4/3
    expect(m.skins).toBe(1);
    expect(m.joints).toBe(41);
    expect(m.clips).toBe(76);
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
    // report.test pins the shipping floor at 158,494; a new prop may nudge it up
    expect(total).toBeGreaterThanOrEqual(158_494);
  });
});

describe("rebuildGlb preserves everything but the swapped image bytes", () => {
  it("an empty rebuild is geometry-identical and reloadable", () => {
    const { json, bin } = readGlb(KNIGHT);
    const out = path.join(tmp, "rebuilt-noop.glb");
    fs.writeFileSync(out, rebuildGlb(json, bin!, new Map()));
    expect(geometryDiff(KNIGHT, out)).toBeNull();
    // still a valid glb the parser accepts, with the same measurement
    expect(measureGlb(out).triangles).toBe(6952);
  });

  it("swapping an image's bytes leaves geometry/skin/animation untouched", () => {
    const glb = readGlb(KNIGHT);
    const img = readImages(glb)[0]!;
    // replace the image bytes with a different-length dummy buffer
    const replacements = new Map([[img.bufferView, Buffer.alloc(123, 0x7f)]]);
    const out = path.join(tmp, "rebuilt-swap.glb");
    fs.writeFileSync(out, rebuildGlb(glb.json, glb.bin!, replacements));
    // geometry invariant holds even though an image view changed size
    expect(geometryDiff(KNIGHT, out)).toBeNull();
    // and the replaced view really did change
    const after = readGlb(out);
    expect(after.json.bufferViews[img.bufferView].byteLength).toBe(123);
  });
});

/**
 * optimize.test — the offline optimiser's non-negotiables:
 *   • DRY RUN plans a real texture resize without writing anything;
 *   • APPLY writes to a SEPARATE tree, leaves the original byte-identical,
 *     keeps geometry byte-identical, and is idempotent on rerun;
 *   • the rig-survival check rejects a candidate whose skeleton/animation
 *     changed or that did not actually shrink (checkRig, unit-tested).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { cover } from "../../packages/shared/testkit/cover";

import { geometryDiff, readGlb, rebuildGlb, sha256File } from "./glb";
import { checkRig } from "./rig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OPT = path.join(HERE, "optimize.ts");
const CHAMPS = path.join(ROOT, "content/assets/models/champions");
const KNIGHT = path.join(CHAMPS, "knight.glb");
const MAGE = path.join(CHAMPS, "mage.glb");

const hasFfmpeg = (() => {
  try {
    execFileSync("which", ["ffmpeg"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opt-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", OPT, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (e: any) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? "") };
  }
}

describe("checkRig is the rig-survival gate", () => {
  it("rejects a candidate that did not actually shrink", () => {
    const r = checkRig(KNIGHT, KNIGHT);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/did not decrease/);
  });

  it("rejects a candidate that lost an animation clip", () => {
    // craft a broken candidate: same geometry bytes, one animation dropped
    const glb = readGlb(KNIGHT);
    const broken = { ...glb.json, animations: (glb.json.animations ?? []).slice(1) };
    const out = path.join(tmp, "broken-clip.glb");
    fs.writeFileSync(out, rebuildGlb(broken, glb.bin!, new Map()));
    const r = checkRig(KNIGHT, out);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/animation clip count/);
    cover("mbudget-optimise-safety");
  });
});

describe.skipIf(!hasFfmpeg)("the optimiser texture stage", () => {
  it("dry run plans a 1024→512 resize and writes nothing", () => {
    const { status, stdout } = run([KNIGHT, "--role", "champion", "--json", "--out", path.join(tmp, "never")]);
    expect(status).toBe(0);
    expect(fs.existsSync(path.join(tmp, "never"))).toBe(false); // dry run touches nothing
    const out = JSON.parse(stdout.slice(stdout.indexOf("{")));
    const tex = out.plans[0].textures[0];
    expect(Math.max(tex.from.w, tex.from.h)).toBe(1024);
    expect(Math.max(tex.to.w, tex.to.h)).toBe(512);
    expect(out.plans[0].vramAfter).toBeLessThan(out.plans[0].vramBefore);
  });

  it("apply writes to a separate tree, never in place, geometry byte-identical, idempotent", () => {
    const out = path.join(tmp, "applied");
    const before = sha256File(KNIGHT);
    const r1 = run([KNIGHT, "--role", "champion", "--apply", "--out", out]);
    expect(r1.status).toBe(0);

    // original is byte-identical — NEVER in place
    expect(sha256File(KNIGHT)).toBe(before);

    // output + sidecar exist
    const outGlb = path.join(out, "assets/models/champions/knight.glb");
    expect(fs.existsSync(outGlb)).toBe(true);
    expect(fs.existsSync(`${outGlb}.opt.json`)).toBe(true);

    // texture stage changed only image bytes
    expect(geometryDiff(KNIGHT, outGlb)).toBeNull();
    const side = JSON.parse(fs.readFileSync(`${outGlb}.opt.json`, "utf8"));
    expect(side.textureStageGeometryIdentical).toBe(true);
    expect(side.after.vramBytes).toBeLessThan(side.before.vramBytes);

    // rerun is idempotent (hash sidecar)
    const r2 = run([KNIGHT, "--role", "champion", "--apply", "--out", out]);
    expect(r2.stdout).toMatch(/up.?to.?date|0 written/i);
  });
});

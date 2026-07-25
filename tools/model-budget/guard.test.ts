/**
 * guard.test — the import gate's contract:
 *   • it scores a model against its role's gate (the four axes),
 *   • it exits non-zero on a real breach and stays quiet under --warn-only,
 *   • it refuses to guess a role it cannot resolve (exit 2).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const GUARD = path.join(HERE, "guard.ts");
/** A generated blocky champion — the post-#226 shape of the stand-in roster. */
const BLOCKY = path.join(ROOT, "content/assets/models/champions/blocky-knight.glb");
/**
 * A model that STILL breaches the champion gate, so the failure path stays
 * covered now that no champion does. `guardian_skeleton.glb` reproduces the
 * retired knight.glb profile almost exactly: 1024² albedo (over the 512 warn),
 * 9 draw calls (over the limit of 5) and 123 animation channels (over 55).
 */
const OVERSIZED = path.join(ROOT, "content/assets/models/props/guardian_skeleton.glb");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Run guard; return {status, stdout}. Never throws on non-zero exit. */
function run(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", GUARD, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (e: any) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? "") };
  }
}

describe("the import guard scores against the role gate", () => {
  it("passes the generated blocky champion clean on every axis", () => {
    // This test used to assert knight.glb's BREACHES (1024² texture warn, draw
    // calls and animation channels over). #226 replaced that mesh with a
    // 168-triangle / 1-material / 16²-texture box-man, and the point of the
    // change was precisely to clear those breaches — so the assertion is
    // inverted rather than deleted, and now pins that they STAY cleared.
    const { status, stdout } = run([BLOCKY, "--role", "champion", "--json"]);
    expect(status).toBe(0); // nothing over the gate → exit 0
    const out = JSON.parse(stdout);
    const r = out.results[0];
    expect(r.role).toBe("champion");
    const axis = (k: string) => r.axes.find((a: any) => a.key === k);
    expect(axis("maxTextureEdge").verdict).toBe("ok");
    expect(axis("triangles").verdict).toBe("ok");
    expect(axis("drawCalls").verdict).toBe("ok");
    expect(axis("animChannels").verdict).toBe("ok");
  });

  it("still flags a real breach, and --warn-only downgrades it (exit 0)", () => {
    // The failure path must stay covered now that no champion breaches: a 1024²
    // arena prop scored against the champion gate reproduces the old shape.
    const { status, stdout } = run([OVERSIZED, "--role", "champion", "--json"]);
    expect(status).toBe(1);
    const out = JSON.parse(stdout);
    const axis = (k: string) => out.results[0].axes.find((a: any) => a.key === k);
    expect(axis("maxTextureEdge").verdict).toBe("warn");
    expect(axis("drawCalls").verdict).toBe("over");
    expect(axis("animChannels").verdict).toBe("over");
    expect(run([OVERSIZED, "--role", "champion", "--warn-only"]).status).toBe(0);
  });

  it("refuses to guess a role it cannot resolve (exit 2)", () => {
    // a copy outside content/ with no --role: not in the report, unresolved
    const orphan = path.join(tmp, "orphan.glb");
    fs.copyFileSync(BLOCKY, orphan);
    const { status, stdout } = run([orphan]);
    expect(status).toBe(2);
    expect(stdout).toContain("UNRESOLVED");
  });
});

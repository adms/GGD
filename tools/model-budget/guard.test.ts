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
const KNIGHT = path.join(ROOT, "content/assets/models/champions/knight.glb");

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
  it("flags the KayKit champion's real breaches and names the texture action", () => {
    const { status, stdout } = run([KNIGHT, "--role", "champion", "--json"]);
    expect(status).toBe(1); // a real breach exits non-zero
    const out = JSON.parse(stdout);
    const r = out.results[0];
    expect(r.role).toBe("champion");
    const axis = (k: string) => r.axes.find((a: any) => a.key === k);
    // 1024² texture is over the 512 warn (a resize job), triangles are fine,
    // and the stand-in genuinely over-spends draw calls and channels (#81 debt).
    expect(axis("maxTextureEdge").verdict).toBe("warn");
    expect(axis("triangles").verdict).toBe("ok");
    expect(axis("drawCalls").verdict).toBe("over");
    expect(axis("animChannels").verdict).toBe("over");
  });

  it("--warn-only downgrades the breach to advisory (exit 0)", () => {
    const { status } = run([KNIGHT, "--role", "champion", "--warn-only"]);
    expect(status).toBe(0);
  });

  it("refuses to guess a role it cannot resolve (exit 2)", () => {
    // a copy outside content/ with no --role: not in the report, unresolved
    const orphan = path.join(tmp, "orphan.glb");
    fs.copyFileSync(KNIGHT, orphan);
    const { status, stdout } = run([orphan]);
    expect(status).toBe(2);
    expect(stdout).toContain("UNRESOLVED");
  });
});

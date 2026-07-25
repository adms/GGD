/**
 * Determinism purity gate (sim-06): the simulation must never use wall-clock,
 * ambient randomness, or trigonometry (float-differs-across-platform risk).
 * Scans every source file under src/sim/ for banned tokens.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";

const BANNED = [
  /\bMath\.random\b/,
  /\bMath\.sin\b/,
  /\bMath\.cos\b/,
  /\bMath\.tan\b/,
  /\bMath\.atan2?\b/,
  /\bMath\.asin\b/,
  /\bMath\.acos\b/,
  // TRANSCENDENTALS (task #195). These are NOT correctly-rounded in IEEE-754 —
  // implementations differ between engines and CPUs, so an "eased" curve is the
  // one thing that would pass every other gate here and still make two replicas
  // disagree by an ulp that then flips a `<=` comparison. The fire ring's
  // shrink law is therefore deliberately linear: subtract, divide, multiply,
  // add. If a sim system ever genuinely needs a power, it needs a rational
  // approximation, not Math.pow.
  /\bMath\.pow\b/,
  /\bMath\.exp\b/,
  /\bMath\.log\b/,
  /\bMath\.hypot\b/,
  /\bMath\.cbrt\b/,
  /\*\*/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bperformance\.now\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("sim purity (sim-06)", () => {
  it("no wall-clock / Math.random / trig anywhere in sim source", () => {
    cover("sim-lint-purity");
    const simDir = join(__dirname);
    const files = walk(simDir);
    expect(files.length).toBeGreaterThan(5);
    const violations: string[] = [];
    for (const f of files) {
      // strip block + line comments so prose ABOUT banned tokens doesn't trip the gate
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const re of BANNED) {
        if (re.test(src)) violations.push(`${f}: ${re}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

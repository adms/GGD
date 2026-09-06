/**
 * GH#1013 — `findPython()` must be a two-direction instrument
 * (CLAUDE.md 「一把只驗過單邊的尺不算自證過」). Before this file the probe was
 * green on a machine with NO python: busybox `arch -arm64 python3` exits 0
 * without running anything, so `pyOk` said yes and the suites ran a command
 * that never executed a python script.
 *
 * Every direction here is an EXECUTION, not a source-string scan:
 *   ① real PATH  → a python that actually ran our program is found;
 *   ② empty PATH → null;
 *   ③ a PATH holding only impostors that exit 0 without running python
 *     (the busybox `arch` shape, reproduced with two shell stubs) → null.
 * ③ is the ticket's mutation run on this machine instead of a Linux
 * container: drop the sentinel comparison from findPython and ③ goes red.
 *
 * The bare-command candidate list (no absolute paths) is deliberate for ②/③:
 * an absolute `/usr/bin/python3` ignores PATH, and PATH is the whole world
 * these two directions are simulating.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findPython, PYTHON_SENTINEL, pythonProbeProgram } from "../../testkit/findPython";

const BARE_CANDIDATES = [["python3"], ["arch", "-arm64", "python3"]] as const;

const dirs: string[] = [];
function scratch(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A `bin/` whose `arch` and `python3` print a machine name and exit 0 — busybox's `arch`. */
function impostorBin(): string {
  const bin = scratch("findpython-impostor-");
  for (const name of ["arch", "python3"]) {
    const p = join(bin, name);
    writeFileSync(p, "#!/bin/sh\necho aarch64\nexit 0\n");
    chmodSync(p, 0o755);
  }
  return bin;
}

describe("findPython — both directions (GH#1013)", () => {
  it("① real PATH: finds a python that really ran the probe program", () => {
    const py = findPython({ imports: "import sys" });
    expect(py, "no working python3 on this machine — this gate must not skip, install one").not.toBeNull();
    // The argv it returned is usable: it runs OUR program, not just "exits 0".
    const echoed = execFileSync(py![0]!, [...py!.slice(1), "-c", pythonProbeProgram("", "ECHO_1013")], {
      encoding: "utf8",
    });
    expect(echoed.trim()).toBe("ECHO_1013");
    expect(PYTHON_SENTINEL).not.toBe("ECHO_1013"); // the two tokens are independent
  });

  it("② empty PATH: null (bare commands only — PATH is the world)", () => {
    const empty = scratch("findpython-empty-");
    const py = findPython({
      candidates: BARE_CANDIDATES,
      env: { ...process.env, PATH: empty, GGD_PYTHON: "" },
    });
    expect(py).toBeNull();
  });

  it("③ impostors that exit 0 without running python (busybox `arch` shape): null", () => {
    const bin = impostorBin();
    const py = findPython({
      candidates: BARE_CANDIDATES,
      env: { ...process.env, PATH: bin, GGD_PYTHON: "" },
    });
    expect(py, "an `arch`/`python3` that exits 0 without running our program was accepted").toBeNull();
  });

  it("SWITCH GGD_PYTHON: an override is honoured, but an override that is not a python is still null", () => {
    const bin = impostorBin();
    const bogus = findPython({ env: { ...process.env, GGD_PYTHON: join(bin, "python3") } });
    expect(bogus, "GGD_PYTHON pointing at a stub must not become a false positive").toBeNull();
    const real = findPython({ imports: "import sys" });
    if (real === null) return; // ① already failed loudly above
    const honoured = findPython({ env: { ...process.env, GGD_PYTHON: real.join(" ") } });
    expect(honoured).toEqual(real);
  });
});

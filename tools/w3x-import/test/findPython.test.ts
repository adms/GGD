/**
 * GH#1013 — `findPython()` is a two-direction instrument (CLAUDE.md
 * 「一把只驗過單邊的尺不算自證過」). Before this file the probe was green on a
 * machine with NO python: busybox `arch -arm64 python3` exits 0 without
 * running anything. Every direction below is an execution, not a string scan:
 *   ① real PATH  → a python that actually ran our program is found;
 *   ② empty PATH → null;
 *   ③ a PATH holding only exit-0 impostors (the busybox `arch` shape) → null,
 *     and the same impostor named through the GGD_PYTHON switch → null.
 * ③ is the ticket's "no-python container" mutation run locally: drop the
 * sentinel comparison in findPython and it goes red. Bare-command candidates
 * (no absolute paths) are deliberate — in ②/③ PATH is the whole world.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findPython, pythonProbeProgram } from "../../testkit/findPython";

const BARE = [["python3"], ["arch", "-arm64", "python3"]] as const;
const dirs: string[] = [];
const scratch = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("findPython — both directions (GH#1013)", () => {
  it("① real PATH: finds a python that really ran the probe program", () => {
    const py = findPython({ imports: "import sys" });
    expect(py, "no working python3 on this machine — this gate must not skip, install one").not.toBeNull();
    const echoed = execFileSync(py![0]!, [...py!.slice(1), "-c", pythonProbeProgram("", "ECHO_1013")], {
      encoding: "utf8",
    });
    expect(echoed.trim()).toBe("ECHO_1013"); // it runs OUR program, not merely "exits 0"
  });

  it("② empty PATH: null", () => {
    const empty = scratch("findpython-empty-");
    expect(findPython({ candidates: BARE, env: { ...process.env, PATH: empty, GGD_PYTHON: "" } })).toBeNull();
  });

  it("③ impostors that exit 0 without running python (busybox `arch` shape): null — also via GGD_PYTHON", () => {
    const bin = scratch("findpython-impostor-");
    for (const name of ["arch", "python3"]) {
      writeFileSync(join(bin, name), "#!/bin/sh\necho aarch64\nexit 0\n");
      chmodSync(join(bin, name), 0o755);
    }
    const viaPath = findPython({ candidates: BARE, env: { ...process.env, PATH: bin, GGD_PYTHON: "" } });
    expect(viaPath, "an `arch`/`python3` that exits 0 without running our program was accepted").toBeNull();
    const viaSwitch = findPython({ env: { ...process.env, GGD_PYTHON: join(bin, "python3") } });
    expect(viaSwitch, "GGD_PYTHON pointing at a stub must not become a false positive").toBeNull();
    const real = findPython({ imports: "import sys" });
    if (real) expect(findPython({ env: { ...process.env, GGD_PYTHON: real.join(" ") } })).toEqual(real);
  });
});

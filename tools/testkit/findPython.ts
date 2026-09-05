/**
 * tools/testkit/findPython.ts — the ONE python probe for the tool-suite gates
 * (GH#1013). Imported relatively (`../../testkit/findPython`) because neither
 * tools/icon-gen nor this directory is a workspace package, and a bare
 * specifier would have no node_modules to resolve through from the repo root.
 *
 * WHY THIS FILE EXISTS — a gate that was green on a machine with no python:
 *
 *   Six test files each carried their own `findPython()`, five of them probing
 *   `arch -arm64 python3` and trusting "exit 0" as "python is here". On
 *   busybox (node:22-alpine — the testrunner image) `arch` ignores its
 *   arguments, prints the machine name and exits 0. So on a container with NO
 *   python the probe returned ["arch","-arm64","python3"], `pyOk` flipped to
 *   true, and the suite ran a command that never executed a python script.
 *   (GNU coreutils `arch` rejects the operand with exit 1, so the Ubuntu CI
 *   runner was never fooled — the hole is the container path.)
 *
 * THE FIX IS A SENTINEL, NOT A LONGER CANDIDATE LIST. Each candidate is asked
 * to run a `-c` program that writes a token; only a process that wrote EXACTLY
 * that token counts. An impostor that exits 0 without running our program
 * (busybox arch, a stub script, a wrapper that swallows `-c`) cannot know the
 * token and is rejected. That makes the probe a two-direction instrument
 * (CLAUDE.md 「一把只驗過單邊的尺不算自證過」), pinned by
 * tools/w3x-import/test/findPython.test.ts:
 *   · a real python on PATH                          → found;
 *   · an empty PATH                                  → null;
 *   · a PATH holding only exit-0 impostors           → null.
 *
 * SWITCH — `GGD_PYTHON="<argv prefix>"` (e.g. `/opt/homebrew/bin/python3` or
 * `arch -arm64 python3`) replaces the candidate list with that one command.
 * It still has to pass the sentinel + import check: an override that does not
 * work yields null, never a false positive. Default: unset → probe the list.
 */
import { execFileSync } from "node:child_process";

/** The token a real interpreter has to echo back. Not guessable by an impostor. */
export const PYTHON_SENTINEL = "GGD_FINDPYTHON_OK_7f3c";

/**
 * Argv prefixes, in probe order. The `arch` entries exist for macOS only: a
 * node running under Rosetta launches universal python binaries as x86_64,
 * which cannot load arm64 wheels (Pillow's `_imaging`), so the arm64 slice is
 * asked for explicitly. On Linux they are harmless now — see the sentinel.
 */
export const DEFAULT_PYTHON_CANDIDATES: readonly (readonly string[])[] = [
  ["python3"],
  ["arch", "-arm64", "python3"],
  ["arch", "-x86_64", "python3"],
  ["/opt/homebrew/bin/python3"],
  ["/usr/bin/python3"],
];

export interface FindPythonOptions {
  /** Python statements that must import cleanly first, e.g. "import mpyq; from PIL import Image". */
  imports?: string;
  /** Argv prefixes to try, in order. Default: DEFAULT_PYTHON_CANDIDATES (or `GGD_PYTHON`). */
  candidates?: readonly (readonly string[])[];
  /** Environment for the probe — its PATH is what resolves bare commands. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Per-candidate timeout in ms. A hung interpreter is not a usable python. Default 30 s. */
  timeoutMs?: number;
}

/** The `-c` program: run the caller's imports, then write the sentinel and nothing else. */
export function pythonProbeProgram(imports = "", sentinel: string = PYTHON_SENTINEL): string {
  const prelude = imports.trim() ? `${imports.trim()}; ` : "";
  return `${prelude}import sys; sys.stdout.write(${JSON.stringify(sentinel)})`;
}

/**
 * Returns the first argv prefix that (a) launches, (b) exits 0, and (c) wrote
 * the sentinel — i.e. really is a python that ran our program with the
 * requested imports available. `null` when none does; callers gate on that
 * with describe.runIf / skipIf exactly as before.
 */
export function findPython(opts: FindPythonOptions = {}): string[] | null {
  const env = opts.env ?? process.env;
  const override = env.GGD_PYTHON?.trim();
  const candidates = override ? [override.split(/\s+/)] : (opts.candidates ?? DEFAULT_PYTHON_CANDIDATES);
  const program = pythonProbeProgram(opts.imports);
  for (const c of candidates) {
    if (c.length === 0) continue;
    let out: string;
    try {
      out = execFileSync(c[0]!, [...c.slice(1), "-c", program], {
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: opts.timeoutMs ?? 30_000,
      });
    } catch {
      continue; // ENOENT, non-zero exit, timeout — all mean "not this one"
    }
    // ⭐ The load-bearing line: exit 0 is not evidence, the token is.
    if (out.trim() === PYTHON_SENTINEL) return [...c];
  }
  return null;
}

/**
 * GH#744 — `content/assets/audio/sfx/fx/GENERATE.sh` and the directory it writes
 * must agree about the CONTAINER.
 *
 * For about a year the script's header opened with "WHY .wav and not .mp3" while
 * the directory held 32 .mp3 and zero .wav, and `audio-map.json` named .mp3
 * paths. Re-running it emitted 27 files no code path can load. Measured
 * 2026-08-27, before the fix: exit 1, 24 of 31 clips written — because a stale
 * mid-file `ls -l "$OUT"/*.wav` summary aborted the run under `set -e`, and the
 * 8 recipes after it (including a block that wrote raw PCM under an .mp3 name)
 * had therefore never executed at all. Two dead lines hiding each other.
 *
 * This is a PAIRING guard, which is the only kind that could have caught it: the
 * script alone was self-consistent and the directory alone was self-consistent.
 * ⛔ It deliberately does not re-run ffmpeg (~90 s); it asserts the relationship
 * between what the script SAYS it writes, what is on disk, and what the audio
 * map asks for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const CONTENT = resolve(fileURLToPath(new URL("../../../../content", import.meta.url)));
const FX_DIR = resolve(CONTENT, "assets/audio/sfx/fx");
const SCRIPT = readFileSync(resolve(FX_DIR, "GENERATE.sh"), "utf8");

/** Every file the script writes: `synth <name>` recipes plus literal $OUT paths. */
function declaredOutputs(): string[] {
  const out = new Set<string>();
  for (const m of SCRIPT.matchAll(/^synth[a-z_0-9]* +([A-Za-z0-9_.-]+)/gm)) out.add(`${m[1]}.mp3`);
  // literal writes (the inline ui-hover-cyber recipe). The trailing `ls` summary
  // is a glob, not a write, so it is excluded by requiring a non-`*` basename.
  for (const m of SCRIPT.matchAll(/"\$OUT\/([A-Za-z0-9_.-]+\.[a-z0-9]+)"/g)) out.add(m[1]!);
  return [...out];
}

describe("fx GENERATE.sh ↔ the directory it writes (GH#744)", () => {
  it("declares exactly the clips that are shipped, all as .mp3", () => {
    cover("fx-generate-outputs-match-disk");
    const onDisk = readdirSync(FX_DIR).filter((f) => f.endsWith(".mp3"));
    const declared = declaredOutputs();
    // ⛔ Any `$OUT/*.wav` write is a silent 404 — audio-map names .mp3 only.
    expect(declared.filter((f) => !f.endsWith(".mp3"))).toEqual([]);
    expect(declared.sort()).toEqual(onDisk.sort());
  });

  it("does not encode raw PCM into an .mp3 name", () => {
    cover("fx-generate-encoder-matches-extension");
    // `-c:a pcm_*` writing to "$OUT/<x>.mp3" makes ffmpeg refuse the file
    // outright ("Exactly one MP3 audio stream is required") and, under `set -e`,
    // kills the rest of the run. Join backslash continuations so a codec flag and
    // its output path land on the same logical command.
    const commands = SCRIPT.replace(/\\\n\s*/g, " ").split("\n");
    const offenders = commands.filter(
      (c) => /-c:a\s+pcm_/.test(c) && /"\$OUT\/[^"]+\.mp3"/.test(c),
    );
    expect(offenders, "raw PCM written under an .mp3 name").toEqual([]);
  });

  it("gives audio-map every fx clip it asks for", () => {
    cover("fx-generate-audio-map-resolvable");
    const map = JSON.parse(readFileSync(resolve(CONTENT, "config/audio-map.json"), "utf8")) as {
      sfx: Record<string, { files?: string[] }>;
    };
    const wanted = new Set<string>();
    for (const entry of Object.values(map.sfx)) {
      for (const f of entry.files ?? []) {
        if (f.includes("assets/audio/sfx/fx/")) wanted.add(f.split("/").at(-1)!);
      }
    }
    expect(wanted.size).toBeGreaterThan(0);
    const declared = new Set(declaredOutputs());
    expect([...wanted].filter((f) => !declared.has(f))).toEqual([]);
  });
});

#!/usr/bin/env python3
"""Extract the STOCK ability-cast sounds out of the retail WC3 MPQs.

Worklist: every distinct gg_snd that some ability in
out/GoDieEX22s-src/SFX_BINDINGS.json `abilities` references and that the raw w3x
dump did NOT already produce (`extracted_file` is null) — the sound refs the
per-ability `sfxKey` port (task #78 follow-up) needs.

⛔ THE WORKLIST DELIBERATELY DOES NOT READ `kind` (GH#554). That field is a
SECOND HOME for something the `wc3_path` already says, and it demonstrably lies:
two rows carry `kind: "stock"` while pointing at a map-author import —

    gg_snd_sawch  war3mapImported\sawch.mp3   kind: "stock"
    gg_snd_gy2    war3mapImported\gy2.Mp3     kind: "stock"

Reading `kind` to decide which archives to search would send both to the retail
MPQs, where they can never be. So both the worklist ("do we still need it?" →
`extracted_file`) and the routing ("where does it live?" → the `war3mapImported\`
prefix on `wc3_path`) are DERIVED from facts, and the label is ignored. Measured:
the derived worklist is byte-identical to the old `kind == "stock"` one (61
entries), so this removes a liar without moving the output.

WHERE THE FILES GO — THE COPYRIGHT GATE. These clips are owned by Blizzard
Entertainment and are NOT redistributable, so they follow the exact convention
content/assets/blizzard-local/README.md documents for every other MPQ asset:
they are written to the git-ignored runtime store

    data/blizzard-overlay/ability-sfx/<name>.<ext>

which dev serving mounts at /content/assets/blizzard-local/ability-sfx/** and
prod never serves at all (exclusion by construction — see the README). They are
never committed, never baked into a build. `content/config/audio-map.json`
references them under `assets/blizzard-local/ability-sfx/` and the client only
asks for them on full-asset builds (combatSfx WC3_OVERLAY_ABILITY_SFX gates on
config/fullAssets); a public bundle falls back to the element whoosh it always
played.

<name> is the gg_snd basename lowercased (gg_snd_FlareTarget3 →
flaretarget3.wav), which is also the audio-map key: `wc3.flaretarget3`.

Archive priority mirrors build_vfx_bindings.load_stock_ability_func: read
oldest-first so the newest archive wins — war3.mpq, War3x.mpq, War3xLocal.mpq
(localized voice files live there), War3Patch.mpq. A couple of "stock" bindings
actually point at `war3mapImported\\...` (map-author imports the binding scan
could not extract); those are pulled from the map archives at the repo root
instead, and land in the same dev-only store — their provenance is unknown
(anime/game quotes), so they get the SAME never-ship treatment as Blizzard's.

TWO KINDS OF MISS, AND ONLY ONE OF THEM IS A BUG (GH#554). Before this, every
failure printed the same `MISS` line, landed in the same `missing` list, and the
script returned 0 — so "the archive does not contain this file" and "the archive
contains it and we failed to decode it" were indistinguishable. That ambiguity
shipped: `content/audio-manifests/ability-sfx-cues.json` carried the reason
「補它要先跑 tools/w3x-import 的抽取」 for gg_snd_sawch, which is advice that can
never work — the JASS declares

    set gg_snd_sawch = CreateSound("war3mapImported\\sawch.mp3", ...)   (war3map.j:3555)
    call PlaySoundBJ(gg_snd_sawch)                                      (war3map.j:40249)

but neither map archive holds that file, while control imports (4die.mp3,
87joke.Mp3) resolve from the same archives. ⇒ THE ORIGINAL MAP IS ITSELF SILENT
HERE. That is a fact about the source, not a task on our side.

So each miss is now probed with `has_file` across the archives it could live in
and recorded as `absent_from_archive: true|false`, and the exit code splits:

    absent  → recorded, exit 0   (a dangling ref in the source map; re-running
                                  the extraction will never change it)
    present but unreadable → exit 1 (a real regression in the MPQ decoder)

⚠️ The fail-open half stays fail-open on purpose — one dangling ref must not
block the other 60 clips — but it is no longer SILENT, which is the half that
CLAUDE.md 第二守則 says is the actual defect.

Idempotent: re-running overwrites deterministically and rewrites MANIFEST.json.
The MPQs live at the MAIN checkout root; a git worktree does not carry them, so
the script walks up from the repo root until it finds war3.mpq.

Usage:  python3 tools/w3x-import/extract_stock_sfx.py
"""

from __future__ import annotations

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from w3xlib.mpqaudio import AudioArchive  # noqa: E402

BINDINGS = os.path.join(HERE, "out", "GoDieEX22s-src", "SFX_BINDINGS.json")
OUT_REL = os.path.join("data", "blizzard-overlay", "ability-sfx")

# oldest → newest; the newest archive that has the file wins.
RETAIL_ARCHIVES = ["war3.mpq", "War3x.mpq", "War3xLocal.mpq", "War3Patch.mpq"]
# for `war3mapImported\\` paths (map-author imports the source scan missed)
MAP_ARCHIVES = ["src_gogodieEX227s.w3x", "GoDieEX22s.w3x"]


def find_mpq_root() -> str | None:
    """The MPQs sit at the MAIN checkout root; a worktree has to walk up."""
    probe = REPO
    while True:
        if os.path.exists(os.path.join(probe, "war3.mpq")):
            return probe
        parent = os.path.dirname(probe)
        if parent == probe:
            return None
        probe = parent


def clip_name(gg_snd: str) -> str:
    base = gg_snd[len("gg_snd_"):] if gg_snd.startswith("gg_snd_") else gg_snd
    return base.lower()


def main() -> int:
    with open(BINDINGS, encoding="utf-8") as f:
        doc = json.load(f)

    # Distinct gg_snds referenced by some ability that the raw w3x dump did not
    # already produce. ⛔ `kind` is NOT consulted — see the module docstring: it
    # is a second home for what `wc3_path` already says, and it lies twice.
    work: dict[str, str] = {}
    for ab in doc["abilities"]:
        for s in ab["sounds"]:
            if not s.get("extracted_file"):
                work[s["gg_snd"]] = s["wc3_path"].replace("\\\\", "\\")

    mpq_root = find_mpq_root()
    if not mpq_root:
        print("ERROR: war3.mpq not found at the repo root or any parent", file=sys.stderr)
        return 1

    archives: list[tuple[str, AudioArchive]] = []
    for name in RETAIL_ARCHIVES + MAP_ARCHIVES:
        full = os.path.join(mpq_root, name)
        if os.path.exists(full):
            archives.append((name, AudioArchive(full)))
    print(f"archives @ {mpq_root}: {', '.join(n for n, _ in archives)}")

    out_dir = os.path.join(REPO, OUT_REL)
    os.makedirs(out_dir, exist_ok=True)

    manifest_clips: dict[str, dict] = {}
    misses: list[dict] = []
    total_bytes = 0
    hit_by_archive: dict[str, int] = {}

    for gg_snd in sorted(work):
        wc3_path = work[gg_snd]
        name = clip_name(gg_snd)
        ext = wc3_path.rsplit(".", 1)[-1].lower() if "." in wc3_path else "wav"
        fname = f"{name}.{ext}"
        is_map_import = wc3_path.lower().startswith("war3mapimported\\")
        pool = MAP_ARCHIVES if is_map_import else RETAIL_ARCHIVES

        data: bytes | None = None
        won: str | None = None
        for arc_name, arc in archives:
            if arc_name not in pool:
                continue
            try:
                blob = arc.read_file(wc3_path)
            except Exception:
                blob = None
            if blob:  # oldest-first: keep reading so the newest archive wins
                data, won = blob, arc_name

        if data is None or won is None:
            # Which miss is this? Probe the hash table of every archive the file
            # could live in. `has_file` answers "is it in there at all", which is
            # exactly the question `read_file` returning None cannot answer.
            holders = [
                arc_name
                for arc_name, arc in archives
                if arc_name in pool and arc.has_file(wc3_path)
            ]
            absent = not holders
            verdict = "ABSENT" if absent else f"UNREADABLE in {','.join(holders)}"
            print(f"MISS  {gg_snd:<32} {wc3_path}   [{verdict}]")
            misses.append(
                {
                    "gg_snd": gg_snd,
                    "wc3_path": wc3_path,
                    "absent_from_archive": absent,
                    "archives_probed": [a for a, _ in archives if a in pool],
                    "holders": holders,
                }
            )
            continue

        with open(os.path.join(out_dir, fname), "wb") as f:
            f.write(data)
        total_bytes += len(data)
        hit_by_archive[won] = hit_by_archive.get(won, 0) + 1
        print(f"HIT   {gg_snd:<32} {won:<24} {len(data):>8} B  -> {fname}")
        manifest_clips[name] = {
            "file": fname,
            "sfx_key": f"wc3.{name}",
            "gg_snd": gg_snd,
            "wc3_path": wc3_path,
            "archive": won,
            "bytes": len(data),
            "map_import": is_map_import,
        }

    manifest = {
        "generated": time.strftime("%Y-%m-%d"),
        "generator": "tools/w3x-import/extract_stock_sfx.py",
        "license": (
            "Blizzard Entertainment (retail MPQ) / unknown map-author imports — "
            "LOCAL DEV ONLY, never ship. See content/assets/blizzard-local/README.md."
        ),
        "clips": manifest_clips,
        "missing": misses,
    }
    with open(os.path.join(out_dir, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(
        f"\n{len(manifest_clips)}/{len(work)} clips extracted, {total_bytes} bytes "
        f"-> {os.path.relpath(out_dir, REPO)}"
    )
    for arc_name in RETAIL_ARCHIVES + MAP_ARCHIVES:
        if arc_name in hit_by_archive:
            print(f"  {arc_name}: {hit_by_archive[arc_name]}")
    absent = [m for m in misses if m["absent_from_archive"]]
    unreadable = [m for m in misses if not m["absent_from_archive"]]
    if absent:
        print(
            f"  ABSENT FROM SOURCE ({len(absent)}): "
            f"{', '.join(m['gg_snd'] for m in absent)}\n"
            "    ⇒ the original map declares these sounds but never shipped the file;"
            " re-running this script cannot change that."
        )
    if unreadable:
        # fail LOUD: the bytes are right there and we could not decode them.
        print(
            f"  ERROR: {len(unreadable)} clip(s) are PRESENT in an archive but could"
            f" not be decoded: {', '.join(m['gg_snd'] for m in unreadable)}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

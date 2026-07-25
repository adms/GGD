#!/usr/bin/env python3
"""Extract the STOCK ability-cast sounds out of the retail WC3 MPQs.

Worklist: every distinct `kind: "stock"` gg_snd that some ability in
out/GoDieEX22s-src/SFX_BINDINGS.json `abilities` actually references — the 123
stock sound refs the per-ability `sfxKey` port (task #78 follow-up) needs.

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

    # distinct stock gg_snds actually referenced by some ability (the worklist)
    work: dict[str, str] = {}
    for ab in doc["abilities"]:
        for s in ab["sounds"]:
            if s["kind"] == "stock":
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
            print(f"MISS  {gg_snd:<32} {wc3_path}")
            misses.append({"gg_snd": gg_snd, "wc3_path": wc3_path})
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
    if misses:
        print(f"  MISSING ({len(misses)}): {', '.join(m['gg_snd'] for m in misses)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

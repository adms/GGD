#!/usr/bin/env python3
"""src_extract.py — extract EVERY (listfile)-named file from the UNPROTECTED
source map (src_gogodieEX227s.w3x) into out/GoDieEX22s-src/raw/.

The source map carries an INTACT (listfile) of 467 entries, so unlike the
protected-map extractor (w3xlib/extract.py) we do not need to reverse hashes or
scavenge names from object data / JASS.  We simply enumerate the listfile and
extract each entry, using the same flattened naming convention the old
extractor used: every '\\' in the internal MPQ name becomes '__' on disk.

Also emits, into out/GoDieEX22s-src/:
  - raw_inventory.json : per-file status/size/sha256/on-disk-name
  - EXTRACT_LOG.txt    : human-readable per-file success/failure log
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

SELF = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SELF)

from w3xlib.mpq import W3XArchive  # noqa: E402

MAP_PATH = "/Users/Takuro/GGD/src_gogodieEX227s.w3x"
OUT_DIR = os.path.join(SELF, "out", "GoDieEX22s-src")
RAW_DIR = os.path.join(OUT_DIR, "raw")

# Extra hash-only names that may exist as block-table entries but are not in the
# (listfile). We still try them so the extraction is exhaustive.
EXTRA_NAMES = [
    "(listfile)", "(attributes)", "(signature)",
    "war3map.wai", "war3map.imp", "war3mapImported\\war3map.j",
    "war3mapMap.b00", "war3mapMap.tga", "war3mapPath.tga",
    "war3mapPreview.tga", "war3mapMisc.txt", "war3mapSkin.txt",
    "war3mapExtra.txt", "conversation.json", "war3mapPreview.blp",
]


def flatten(name: str) -> str:
    return name.replace("\\", "__")


def read_listfile(archive: W3XArchive) -> list[str]:
    data = archive.read_file("(listfile)")
    if not data:
        return []
    text = data.decode("utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(";", "\n")
    seen: dict[str, None] = {}
    for line in text.split("\n"):
        line = line.strip()
        if line:
            seen[line] = None
    return list(seen.keys())


def main() -> int:
    os.makedirs(RAW_DIR, exist_ok=True)
    archive = W3XArchive(MAP_PATH)

    listfile = read_listfile(archive)
    # Order: listfile entries first (as authored), then any extra names not
    # already covered.
    lower_seen = {n.lower() for n in listfile}
    names = list(listfile)
    for n in EXTRA_NAMES:
        if n.lower() not in lower_seen:
            names.append(n)
            lower_seen.add(n.lower())

    inventory: dict[str, dict] = {}
    log_lines: list[str] = []
    ok = err = absent = 0

    for name in names:
        block = archive.get_block(name)
        if block is None:
            inventory[name] = {"status": "absent", "in_listfile": name in listfile}
            log_lines.append(f"ABSENT  {name}")
            absent += 1
            continue
        try:
            data = archive.read_file(name)
        except Exception as exc:  # noqa: BLE001
            inventory[name] = {
                "status": "error",
                "error": str(exc),
                "block_size": block.size,
                "in_listfile": name in listfile,
            }
            log_lines.append(f"ERROR   {name}  ({exc})")
            err += 1
            continue
        if data is None:
            inventory[name] = {"status": "absent", "in_listfile": name in listfile}
            log_lines.append(f"ABSENT  {name}")
            absent += 1
            continue
        safe = flatten(name)
        path = os.path.join(RAW_DIR, safe)
        with open(path, "wb") as f:
            f.write(data)
        sha = hashlib.sha256(data).hexdigest()
        inventory[name] = {
            "status": "ok",
            "size": len(data),
            "sha256": sha,
            "file": safe,
            "in_listfile": name in listfile,
        }
        log_lines.append(f"OK      {len(data):>9d}  {safe}")
        ok += 1

    total_blocks = len(archive.a.block_table)
    summary = {
        "map": os.path.basename(MAP_PATH),
        "map_bytes": os.path.getsize(MAP_PATH),
        "listfile_entries": len(listfile),
        "block_table_entries": total_blocks,
        "extracted_ok": ok,
        "errors": err,
        "absent": absent,
        "files": inventory,
    }

    with open(os.path.join(OUT_DIR, "raw_inventory.json"), "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    header = (
        f"map={summary['map']} bytes={summary['map_bytes']}\n"
        f"listfile_entries={len(listfile)} block_table_entries={total_blocks}\n"
        f"extracted_ok={ok} errors={err} absent={absent}\n"
        + "=" * 60 + "\n"
    )
    with open(os.path.join(OUT_DIR, "EXTRACT_LOG.txt"), "w") as f:
        f.write(header + "\n".join(log_lines) + "\n")

    archive.close()
    print(header + f"wrote {ok} files to {RAW_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

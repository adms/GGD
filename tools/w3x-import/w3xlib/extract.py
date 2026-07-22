"""Stage 1 — extract every recoverable file from the .w3x into out/<map>/raw/.

Name recovery strategy for protected maps (no (listfile), no war3map.imp):
  1. the fixed set of known war3map.* names
  2. every string mod value in the object data files (w3u/w3t/w3b/w3a/w3h/w3q)
     that looks like an asset path (.mdx/.mdl/.blp/.tga/.wav/.mp3), split on
     commas, tried with prefix/extension/slash variants
  3. every quoted asset path inside scripts\\war3map.j (JASS)
  4. texture paths referenced by TEXS chunks of every extracted .mdx (repeat
     until fixpoint)
Unmatched block-table entries are counted (MPQ hashes cannot be reversed).
"""

from __future__ import annotations

import os
import re
import struct

from .mpq import W3XArchive
from .objdata import parse_object_file, all_entries

KNOWN_NAMES = [
    "(listfile)", "(attributes)", "(signature)",
    "war3map.w3e", "war3map.w3i", "war3map.wtg", "war3map.wct", "war3map.wts",
    "war3map.j", "scripts\\war3map.j", "war3map.shd", "war3mapMap.blp",
    "war3mapMap.b00", "war3mapMap.tga", "war3mapPreview.tga", "war3map.mmp",
    "war3mapPath.tga", "war3map.wpm", "war3map.doo", "war3mapUnits.doo",
    "war3map.w3r", "war3map.w3c", "war3map.w3s", "war3map.w3u", "war3map.w3t",
    "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3q", "war3map.w3h",
    "war3map.wai", "war3map.imp", "war3mapMisc.txt", "war3mapSkin.txt",
    "war3mapExtra.txt", "conversation.json", "war3mapImported\\war3map.j",
]

OBJ_FILES = [
    ("war3map.w3u", False), ("war3map.w3t", False), ("war3map.w3b", False),
    ("war3map.w3h", False), ("war3map.w3a", True), ("war3map.w3q", True),
    ("war3map.w3d", True),
]

ASSET_EXTS = (".mdx", ".mdl", ".blp", ".tga", ".wav", ".mp3")


def _variants(path: str) -> list[str]:
    path = path.strip().replace("/", "\\")
    outs = [path]
    base = path.rsplit("\\", 1)[-1]
    if base != path:
        outs.append(base)
    outs.append("war3mapImported\\" + base)
    more = []
    for p in outs:
        low = p.lower()
        if low.endswith(".mdl"):
            more.append(p[:-4] + ".mdx")
        elif low.endswith(".mdx"):
            more.append(p[:-4] + ".mdl")
    return outs + more


def _texs_paths(mdx: bytes) -> list[str]:
    """Texture file names out of an MDX TEXS chunk (no full parse needed)."""
    out = []
    pos = mdx.find(b"TEXS")
    if pos < 0:
        return out
    size = struct.unpack_from("<I", mdx, pos + 4)[0]
    data = mdx[pos + 8 : pos + 8 + size]
    for off in range(0, len(data) - 267, 268):
        name = data[off + 4 : off + 264].split(b"\x00", 1)[0]
        if name:
            out.append(name.decode("latin-1"))
    return out


def _atch_paths(mdx: bytes) -> list[str]:
    """Separate attachment-model paths referenced by ATCH nodes, so weapons/
    orbs attached to a hero model are discovered and extracted too."""
    try:
        from .mdx import parse_mdx
        m = parse_mdx(mdx)
    except Exception:
        return []
    return [n.attachment_path for n in m.nodes.values()
            if n.kind == "attachment" and n.attachment_path]


def collect_candidates(archive: W3XArchive) -> set[str]:
    cands: set[str] = set()
    for fn, has_levels in OBJ_FILES:
        try:
            data = archive.read_file(fn)
        except Exception:
            data = None
        if not data:
            continue
        parsed = parse_object_file(data, has_levels)
        for e in all_entries(parsed):
            for m in e.mods:
                if isinstance(m.value, str):
                    for part in m.value.split(","):
                        if part.strip().lower().endswith(ASSET_EXTS):
                            cands.add(part.strip())
    for jname in ("scripts\\war3map.j", "war3map.j"):
        try:
            j = archive.read_file(jname)
        except Exception:
            j = None
        if j:
            text = j.decode("utf-8", errors="replace")
            for m in re.finditer(
                r'"((?:[^"\\]|\\.)*?\.(?:mdx|mdl|blp|tga|wav|mp3))"', text, re.I
            ):
                cands.add(m.group(1).replace("\\\\", "\\"))
    return cands


def run(map_path: str, out_raw: str) -> dict:
    """Extract everything; returns the inventory dict."""
    os.makedirs(out_raw, exist_ok=True)
    archive = W3XArchive(map_path)
    inventory: dict[str, dict] = {}
    seen_lower: set[str] = set()

    def try_extract(name: str, how: str) -> bool:
        if name.lower() in seen_lower:
            return True
        block = archive.get_block(name)
        if block is None:
            return False
        try:
            data = archive.read_file(name)
        except Exception as exc:
            inventory[name] = {"status": "error", "how": how, "error": str(exc),
                               "size": block.size}
            seen_lower.add(name.lower())
            return False
        if data is None:
            return False
        safe = name.replace("\\", "__")
        with open(os.path.join(out_raw, safe), "wb") as f:
            f.write(data)
        inventory[name] = {"status": "ok", "how": how, "size": len(data),
                           "file": safe}
        seen_lower.add(name.lower())
        return True

    for name in KNOWN_NAMES:
        try_extract(name, "known-name")

    frontier = collect_candidates(archive)
    tried: set[str] = set()
    while frontier:
        next_frontier: set[str] = set()
        for cand in frontier:
            for var in _variants(cand):
                low = var.lower()
                if low in tried:
                    continue
                tried.add(low)
                if try_extract(var, "object-data-path"):
                    if low.endswith(".mdx"):
                        safe = var.replace("\\", "__")
                        with open(os.path.join(out_raw, safe), "rb") as f:
                            raw_mdx = f.read()
                        for tex in _texs_paths(raw_mdx):
                            next_frontier.add(tex)
                        for att in _atch_paths(raw_mdx):  # attachment models
                            next_frontier.add(att)
                    break
        frontier = next_frontier

    total_blocks = len(archive.a.block_table)
    recovered_blocks = len([v for v in inventory.values() if v["status"] == "ok"])
    inv = {
        "map": os.path.basename(map_path),
        "files": inventory,
        "block_table_entries": total_blocks,
        "recovered": recovered_blocks,
        "unrecovered_blocks": total_blocks - len(inventory),
    }
    archive.close()
    return inv

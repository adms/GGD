#!/usr/bin/env python3
"""
extract_sfx_bindings.py — the 音效 axis of the ability audit (owner directive:
every ability port must include VFX + damage + SFX).

Resolves each `gg_snd_*` the JASS plays into its actual sound source:
  - CreateSound("<path>", …) bindings from the InitSounds section of war3map.j
  - `war3mapImported\\…` paths → the extracted file in out/GoDieEX22s-src/raw/
    (PORTABLE NOW — the mp3 is on disk)
  - stock Blizzard paths (Abilities\\Spells\\…) → STOCK (needs a stock-MPQ pull,
    same channel as the item-rawcode work)

Then joins EFFECT_AUDIT.json's per-ability `sfx.jass_sounds` to those bindings,
emitting the per-ability porting worklist. Content has no per-ability sound
field yet — this artifact is the input for that surface.

Usage: python3 tools/w3x-import/extract_sfx_bindings.py
Reads: out/GoDieEX22s-src/{raw/war3map.j, EFFECT_AUDIT.json, raw/*}
Writes: out/GoDieEX22s-src/SFX_BINDINGS.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "w3x-import" / "out" / "GoDieEX22s-src"
RAW = SRC / "raw"
OUT = SRC / "SFX_BINDINGS.json"

jass = (RAW / "war3map.j").read_text(errors="replace")

# set gg_snd_X = CreateSound( "path\\file.wav", ... )
BIND_RE = re.compile(r"set\s+(gg_snd_\w+)\s*=\s*CreateSound\(\s*\"([^\"]+)\"")
bindings: dict[str, dict] = {}
# extracted raw files, lowercased basename → actual filename on disk
raw_files = {p.name.lower(): p.name for p in RAW.iterdir() if p.is_file()}

for m in BIND_RE.finditer(jass):
    snd, path = m.group(1), m.group(2)
    base = path.replace("\\", "/").split("/")[-1]
    # imported files land as war3mapImported__<name> in the extraction
    candidates = [base.lower(), f"war3mapimported__{base.lower()}"]
    on_disk = next((raw_files[c] for c in candidates if c in raw_files), None)
    bindings[snd] = {
        "wc3_path": path,
        "kind": "imported" if on_disk else "stock",
        "extracted_file": on_disk,
    }

audit = json.loads((SRC / "EFFECT_AUDIT.json").read_text())
abilities = []
for r in audit["abilities"]:
    snds = r["sfx"]["jass_sounds"]
    if not snds:
        continue
    abilities.append(
        {
            "ability": r["ability"],
            "name": r["name"],
            "champion": r["champion"],
            "sounds": [
                {"gg_snd": s, **bindings.get(s, {"wc3_path": None, "kind": "UNBOUND", "extracted_file": None})}
                for s in snds
            ],
        }
    )

portable = sum(1 for a in abilities for s in a["sounds"] if s["kind"] == "imported")
stock = sum(1 for a in abilities for s in a["sounds"] if s["kind"] == "stock")
summary = {
    "gg_snd_bindings_total": len(bindings),
    "abilities_with_wc3_sound": len(abilities),
    "ability_sound_refs": {"imported_portable_now": portable, "stock_needs_mpq": stock},
    "note": "content has no per-ability sound field yet — this is the porting worklist for that surface",
}
OUT.write_text(json.dumps({"summary": summary, "bindings": bindings, "abilities": abilities}, ensure_ascii=False, indent=1))
print(json.dumps(summary, ensure_ascii=False, indent=1))
print(f"wrote {OUT.relative_to(ROOT)}")

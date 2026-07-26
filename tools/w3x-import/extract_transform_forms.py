"""extract_transform_forms.py — the 變身 (transform) census, task #249.

WHAT THIS RECOVERS
------------------
26 abilities in the UNPROTECTED source map carry the WC3 **Metamorphosis** field
pair on ability level 1:

    Eme1  the NORMAL-form unit rawcode      (data column 1)
    Emeu  the ALTERNATE-form unit rawcode   (data column 0)

Every champion transform in GoDieEX22s uses that one pattern, so each second
form is a COMPLETE second unit definition in war3map.w3u — its own model, scale,
movement speed, ability list and stat block — not a buff on the first.

THE IMPORTER NEVER SAW THIS. `w3xlib/stats.py` / `src_objects.py` read a
WHITELIST of ~30 of the map's 180 w3u field codes (task #56), and `Eme1`/`Emeu`
are not on it, so the base⇄alt relationship was dropped on import. The
consequence shipped: 10 of the 50 first-open-roster slots were the ALTERNATE
body, offered as if it were the hero (see apps/platform/internal/curation/
starter.go and docs/todo/champion-transform-forms.md).

WHY LEVEL 1 IS THE AUTHORITY, and reading any other level is a BUG
------------------------------------------------------------------
`Eme1`/`Emeu` are LEVELED ability fields. The map author cloned abilities freely
and only ever re-pointed level 1, so levels 2-4 of a cloned entry still hold the
DONOR's rawcodes:

    A10N 11-002 武裝色霸氣   lvl1 Udre->U01U  (correct: 索隆)
                             lvl2..4 E00K->E00Z  (leftovers from 安云's A0SZ)
    A0LN 79-04 卍解         lvl1 H01N->H01O  (correct: 黑崎一護)
                             lvl4 H01L->H01M  (a stale pair)

A "last writer wins" read of the mod list therefore produces a table that is
wrong on ~9 of the 26 pairs and silently cross-links unrelated heroes. Always
`entry.get("Eme1", 1)`.

THE DIRECTION PROOF (26/26)
---------------------------
Which of the two is the base is not inferred from the field names alone — the
map states it. Every hero unit carries a `unsf` sub-name: the base unit's is the
bare 編號 「(NN)」 and the alternate's names the form 「(NN變身名)」, e.g.
Hgam「(90)」 -> H02R「(90 妙蛙花)」, H02V「(92)」 -> H02U「(92 臥草)」. This holds
for all 26 pairs, so `Eme1` = base and `Emeu` = alternate is corroborated, not
assumed. The emitted JSON carries both sub-names so the pin test can re-check it.

DURATION comes from `ahdu` (HERO duration), not `adur`. Three abilities carry no
`ahdu` at all and that is a RECOVERED FACT, not missing data:
A0DZ 20-01 風王結界 and A0O6 70-00 紮根 are toggles (the form persists until
re-cast), and Aphx 61-00 百連我殺 is a death-state morph (its `adur` is 0.01s,
an instant swap).

Output: out/GoDieEX22s-src/TRANSFORM_FORMS.json — the fixture
packages/shared/src/content/championForms.test.ts pins the shipped table
against. Re-run after any re-extract; it reads only raw/war3map.{w3a,w3u,wts}.
"""

from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from w3xlib.objdata import parse_object_file  # noqa: E402
from src_text import parse_wts_full, resolve, strip_codes  # noqa: E402

RAW_DIR = os.path.join(HERE, "out", "GoDieEX22s-src", "raw")
OUT_PATH = os.path.join(HERE, "out", "GoDieEX22s-src", "TRANSFORM_FORMS.json")

# WC3 Metamorphosis: the normal-form unit and the alternate-form unit.
NORMAL_FIELD = "Eme1"
ALTERNATE_FIELD = "Emeu"

_SUB_NAME_NUMBER = re.compile(r"\(\s*(\d{2,3})")


def _entries(path: str, has_levels: bool) -> list:
    with open(path, "rb") as fh:
        tables = parse_object_file(fh.read(), has_levels)
    return tables["original"] + tables["custom"]


def _levels(entry, code: str) -> dict[str, float]:
    """`{levelString: value}` for a leveled numeric field, dropping zeros."""
    out: dict[str, float] = {}
    for level, value in sorted(entry.levels(code).items()):
        if not isinstance(value, (int, float)) or value <= 0:
            continue
        out[str(level)] = round(float(value), 4)
    return out


def build() -> dict:
    abilities = _entries(os.path.join(RAW_DIR, "war3map.w3a"), True)
    units = _entries(os.path.join(RAW_DIR, "war3map.w3u"), False)
    with open(os.path.join(RAW_DIR, "war3map.wts"), "rb") as fh:
        strings = parse_wts_full(fh.read())[0]

    by_rawcode = {u.obj_id.upper(): u for u in units}

    def text(value) -> str | None:
        if not isinstance(value, str):
            return None
        return strip_codes(resolve(value, strings)).strip() or None

    def unit_view(rawcode: str) -> dict:
        unit = by_rawcode.get(rawcode)
        champion_id = f"godie-{rawcode.lower()}"
        return {
            "rawcode": rawcode,
            "championId": champion_id,
            "subName": text(unit.get("unsf")) if unit else None,
            "properName": text(unit.get("upro")) if unit else None,
            "model": unit.get("umdl") if unit else None,
            "scale": unit.get("usca") if unit else None,
            "moveSpeed": unit.get("umvs") if unit else None,
            "inW3u": unit is not None,
        }

    pairs: list[dict] = []
    for entry in abilities:
        # LEVEL 1 ONLY — see the module docstring; higher levels hold donor data.
        normal = entry.get(NORMAL_FIELD, 1)
        alternate = entry.get(ALTERNATE_FIELD, 1)
        if not normal or not alternate:
            continue
        base = unit_view(str(normal).upper())
        alt = unit_view(str(alternate).upper())
        sub = base["subName"] or ""
        match = _SUB_NAME_NUMBER.search(sub)
        pairs.append(
            {
                "heroNumber": match.group(1) if match else None,
                "abilityRawcode": entry.obj_id,
                "abilityBase": entry.base_id,
                "abilityName": text(entry.get("anam")),
                "normalUnit": base,
                "alternateUnit": alt,
                # ahdu = HERO duration, the field that governs a hero's morph.
                "durationSecByLevel": _levels(entry, "ahdu"),
                "cooldownSecByLevel": _levels(entry, "acdn"),
                "manaCostByLevel": _levels(entry, "amcs"),
                # adur is the non-hero duration; kept for the 3 no-ahdu entries.
                "unitDurationSecByLevel": _levels(entry, "adur"),
            }
        )

    pairs.sort(key=lambda p: (p["heroNumber"] or "zz", p["abilityRawcode"]))
    return {
        "schema": "w3x-transform-forms@1",
        "source": "src_gogodieEX227s.w3x — war3map.w3a Eme1/Emeu (level 1) + war3map.w3u",
        "generatedBy": "tools/w3x-import/extract_transform_forms.py",
        "mechanism": (
            "WC3 Metamorphosis family: ability field Eme1 = normal-form unit rawcode, "
            "Emeu = alternate-form unit rawcode. Read at LEVEL 1 only — cloned abilities "
            "keep the donor's rawcodes on levels 2-4."
        ),
        "directionProof": (
            "every normal unit's `unsf` sub-name is the bare 編號 「(NN)」 and every "
            "alternate's names the form 「(NN變身名)」 — 26/26."
        ),
        "count": len(pairs),
        "pairs": pairs,
    }


def main() -> None:
    doc = build()
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"{doc['count']} transform pairs -> {OUT_PATH}")


if __name__ == "__main__":
    main()

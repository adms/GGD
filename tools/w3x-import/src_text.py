"""src_text.py — war3map.wts access for the UNPROTECTED source map.

⚠️ THE PARSER NO LONGER LIVES HERE. `parse_wts_full` is now a thin adapter over
`w3xlib.wts.parse_wts_blocks`, which holds the one line-based implementation.

It used to be a private copy, written because the library's regex recognised
only WTS blocks whose header had no comment (or an old-style ``--`` one) and so
recovered 330 of this map's 11,337 strings. Keeping a corrected copy up here
fixed the extractors that imported it and left every consumer of the library —
`w3xlib/stats.py`, and the whole `import_w3x.py` pipeline under it — reading the
broken table and emitting literal ``TRIGSTR_1234`` where names belong. Two
parsers for one file format is the bug; the library is now the only one.

Run as a script to emit  out/GoDieEX22s-src/STRINGS.json  = { "<id>": "<text>" }.
"""

from __future__ import annotations

import json
import os
import re
import sys

_STRING_RE = re.compile(r"^STRING\s+(\d+)\b")

# WC3 inline formatting helpers (kept OUT of STRINGS.json, which stores raw text)
_COLOR_OPEN = re.compile(r"\|c[0-9a-fA-F]{8}")


def parse_wts_full(data: bytes) -> tuple[dict[int, str], dict[int, str]]:
    """`(strings, comments)` — see `w3xlib.wts.parse_wts_blocks`, which does it.

    Kept as a name because ~4 extractors import it; it must stay byte-identical
    to the library call, so it delegates rather than reimplements.
    """
    from w3xlib.wts import parse_wts_blocks

    return parse_wts_blocks(data)


# ---- TRIGSTR resolution -----------------------------------------------------
_TRIGSTR_RE = re.compile(r"TRIGSTR_0*(\d+)")


def resolve(value, table: dict[int, str]):
    """Resolve a TRIGSTR_### reference (or embedded refs) to its string text.

    Object-data string fields hold exactly ``TRIGSTR_5314`` (sometimes with
    leading zeros).  Non-string values pass through untouched.
    """
    if not isinstance(value, str):
        return value

    def repl(m: re.Match) -> str:
        return table.get(int(m.group(1)), m.group(0))

    return _TRIGSTR_RE.sub(repl, value)


def strip_codes(s) -> str:
    """Drop WC3 inline colour codes and convert |n pipe-newlines to \n."""
    if not isinstance(s, str):
        return s
    s = _COLOR_OPEN.sub("", s)
    s = s.replace("|r", "").replace("|R", "")
    s = s.replace("|n", "\n").replace("|N", "\n")
    return s


def load_strings(src_map: str) -> tuple[dict[int, str], dict[int, str]]:
    """Read war3map.wts from a .w3x archive and parse it."""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    from w3xlib.mpq import W3XArchive

    a = W3XArchive(src_map)
    try:
        blob = a.read_file("war3map.wts")
    finally:
        a.close()
    if blob is None:
        raise SystemExit("war3map.wts not found in " + src_map)
    return parse_wts_full(blob)


SRC_MAP = "/Users/Takuro/GGD/src_gogodieEX227s.w3x"
OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "out", "GoDieEX22s-src"
)


def main() -> None:
    strings, comments = load_strings(SRC_MAP)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {str(k): strings[k] for k in sorted(strings)}
    with open(os.path.join(OUT_DIR, "STRINGS.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    # provenance comments are handy for auditing which object each id belongs to
    cout = {str(k): comments[k] for k in sorted(comments) if comments[k]}
    with open(
        os.path.join(OUT_DIR, "STRINGS_comments.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(cout, f, ensure_ascii=False, indent=0)
    nonempty = sum(1 for v in strings.values() if v.strip())
    print(f"STRINGS.json: {len(strings)} ids ({nonempty} non-empty)")
    print(f"STRINGS_comments.json: {len(cout)} provenance comments")


if __name__ == "__main__":
    main()

"""src_text.py — full war3map.wts parser for the UNPROTECTED source map.

The stock w3xlib/wts.py regex only recognises WTS blocks whose header has no
comment line (or an old-style ``--`` comment).  The source map's WTS uses
``//`` provenance comments (``// 能力: A0VJ (52-01 狂戰士之怒), ...``) on almost
every entry, so that regex recovers only 330 of the 11,337 strings.  This module
parses the block format line-by-line and recovers all of them, preserving CJK
text and WC3 inline colour codes (``|cAARRGGBB ... |r``) verbatim.

Block grammar (one per string id):

    STRING <int id>
    // optional provenance comment(s)          (0 or more, start with //)
    {
    <body line 1>
    <body line 2 ...>                          (may be empty; keeps colour codes)
    }

The closing ``}`` is on its own line — the canonical World Editor emitter never
puts a bare ``}`` line inside a body, so a line whose strip() == '}' terminates.

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
    """Parse a war3map.wts blob.

    Returns (strings, comments):
      strings  : { id -> raw body text (colour codes preserved, internal
                   newlines kept, no trailing newline) }
      comments : { id -> the // provenance comment (without leading //), or "" }
    """
    text = data.decode("utf-8-sig", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    strings: dict[int, str] = {}
    comments: dict[int, str] = {}

    i = 0
    n = len(lines)
    while i < n:
        m = _STRING_RE.match(lines[i])
        if not m:
            i += 1
            continue
        sid = int(m.group(1))
        i += 1
        comment_parts: list[str] = []
        # consume optional comment lines / blank lines until the opening brace
        while i < n and lines[i].strip() != "{":
            stripped = lines[i].strip()
            if stripped.startswith("//"):
                comment_parts.append(stripped[2:].strip())
            elif _STRING_RE.match(lines[i]):
                # malformed block with no body — bail without consuming header
                break
            i += 1
        if i >= n or lines[i].strip() != "{":
            # no opening brace found; record empty and continue
            strings.setdefault(sid, "")
            comments.setdefault(sid, " ".join(comment_parts))
            continue
        i += 1  # skip '{'
        body: list[str] = []
        while i < n and lines[i].strip() != "}":
            body.append(lines[i])
            i += 1
        i += 1  # skip '}'
        strings[sid] = "\n".join(body)
        comments[sid] = " ".join(comment_parts)
    return strings, comments


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

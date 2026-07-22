"""Random-hero-pool extraction from the (obfuscated) JASS map script.

GoDie-style maps drive their random-hero mode from a rawcode array filled in
`main`:

    set Zv=78set zv[1]='Hart'
    set zv[2]='Hvwd'
    ...
    set zv[$A]='Udre'      (JASS hex literal — $A == 10)
    ...
    set zv[78]='O02P'

The variable names are obfuscator-mangled, so extraction is generic: every
`set <name>[<index>]='<4-char rawcode>'` assignment in the script is grouped
by array name and the array with the most distinct indices wins.  Indices may
be decimal or JASS hex (`$A`..`$F`, arbitrary width).  A `set <var>=<count>`
scalar assignment whose value equals the array's max index (the classic
`set Zv=78` size variable) is picked up as corroboration when present.
"""

from __future__ import annotations

import re

# set <arr>[<idx>]='cccc'   — idx decimal or $hex; rawcode exactly 4 chars
_ASSIGN = re.compile(
    r"set\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\$[0-9A-Fa-f]+|\d+)\s*\]"
    r"\s*=\s*'([^']{4})'"
)
# no \b after the digits: obfuscated scripts run statements together
# ("set Zv=78set zv[1]=..."), leaving no word boundary after the number
_SCALAR = re.compile(r"set\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)")


def _index(tok: str) -> int:
    return int(tok[1:], 16) if tok.startswith("$") else int(tok, 10)


def extract_random_pool(script: str) -> dict | None:
    """Return {var, count, count_var, codes, gaps} for the largest rawcode
    array in the script, or None when no such array exists."""
    arrays: dict[str, dict[int, str]] = {}
    for m in _ASSIGN.finditer(script):
        var, idx_tok, code = m.group(1), m.group(2), m.group(3)
        arrays.setdefault(var, {})[_index(idx_tok)] = code
    if not arrays:
        return None
    var = max(arrays, key=lambda v: len(arrays[v]))
    entries = arrays[var]
    hi = max(entries)
    lo = min(entries)
    # corroborating size variable (e.g. `set Zv=78` right before the fills)
    count_var = None
    for m in _SCALAR.finditer(script):
        if int(m.group(2)) == hi and m.group(1).lower() == var.lower():
            count_var = m.group(1)
            break
    codes = [entries[i] for i in range(lo, hi + 1) if i in entries]
    gaps = [i for i in range(lo, hi + 1) if i not in entries]
    return {
        "var": var,
        "count": len(codes),
        "count_var": count_var,
        "first_index": lo,
        "last_index": hi,
        "codes": codes,
        "gaps": gaps,
    }


def read_roster_file(path: str) -> list[str]:
    """--roster override: whitespace/comma separated rawcodes, '#' comments."""
    codes: list[str] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0]
            for tok in re.split(r"[\s,]+", line):
                if tok:
                    codes.append(tok)
    return codes

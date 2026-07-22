"""war3map.wts string table + TRIGSTR resolution."""

from __future__ import annotations

import re

_BLOCK_RE = re.compile(r"STRING\s+(\d+)\s*(?:--[^\r\n]*)?\s*\{\r?\n(.*?)\r?\n\}", re.S)
_TRIGSTR_RE = re.compile(r"TRIGSTR_(\d+)")


def parse_wts(data: bytes) -> dict[int, str]:
    text = data.decode("utf-8-sig", errors="replace")
    return {int(num): body for num, body in _BLOCK_RE.findall(text)}


def resolve(value, table: dict[int, str]):
    """Resolve TRIGSTR_n references inside a string value (leading int form)."""
    if not isinstance(value, str):
        return value

    def repl(m: re.Match) -> str:
        return table.get(int(m.group(1)), m.group(0))

    return _TRIGSTR_RE.sub(repl, value)


def strip_codes(s: str) -> str:
    """Drop WC3 inline color codes |cffrrggbb ... |r and pipe-newlines."""
    s = re.sub(r"\|c[0-9a-fA-F]{8}", "", s)
    s = s.replace("|r", "").replace("|R", "")
    s = s.replace("|n", "\n").replace("|N", "\n")
    return s

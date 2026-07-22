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


# ---------------------------------------------------------------------------
# description colour ROLES (task #114)
#
# The w3x tooltips colour numbers inline with |cAARRGGBB…|r codes, but the
# source is wildly inconsistent — the same "damage" number appears in a dozen
# near-identical reds. Rather than ship raw hex, classify each colour into a
# SEMANTIC ROLE and re-emit the text as `[c=role]…[/c]` markup; the client then
# renders role → one normalised colour everywhere. This is the AUTHORING half:
# it must stay byte-for-byte in sync with `classifyRole` / `parseRoleMarkup` in
# apps/client/src/ui/components/abilityText.ts (same override table, same hue
# cutoffs, same markup grammar).
# ---------------------------------------------------------------------------

# Exact-hex overrides for the neutral "name"/highlight tints whose hue would
# otherwise mis-read as physical/mana. Keyed by lowercase RRGGBB (alpha dropped).
_ROLE_OVERRIDES = {
    "ffdead": "generic",  # navajo-white — item/keyword names
    "c3dbff": "generic",  # pale blue highlight
    "ffffff": "generic",
    "c0c0c0": "generic",
}

_COLOR_SPAN_RE = re.compile(r"\|c([0-9a-fA-F]{8})", re.I)


def classify_role(hex_code: str) -> str:
    """Classify a WC3 colour (RRGGBB or AARRGGBB) into a semantic role.

    TOTAL — never returns "unknown": an override table handles the neutral
    tints, then a deterministic HSV rule maps every remaining colour by hue,
    with low-saturation / near-grey folding to ``generic``. Mirror of
    ``classifyRole`` in abilityText.ts.
    """
    h = re.sub(r"[^0-9a-f]", "", hex_code.lower())
    rgb = h[2:] if len(h) == 8 else h[-6:]
    if len(rgb) < 6:
        return "generic"
    if rgb in _ROLE_OVERRIDES:
        return _ROLE_OVERRIDES[rgb]
    r = int(rgb[0:2], 16) / 255
    g = int(rgb[2:4], 16) / 255
    b = int(rgb[4:6], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    sat = 0.0 if mx == 0 else d / mx
    if d < 0.06 or sat < 0.18:
        return "generic"
    if mx == r:
        hue = ((g - b) / d) % 6
    elif mx == g:
        hue = (b - r) / d + 2
    else:
        hue = (r - g) / d + 4
    hue *= 60
    if hue < 0:
        hue += 360
    if hue < 20 or hue >= 330:
        return "damage"
    if hue < 45:
        return "physical"
    if hue < 70:
        return "duration"
    if hue < 165:
        return "heal"
    if hue < 255:
        return "mana"
    return "magic"


def to_role_markup(s: str) -> str:
    """Convert WC3 colour codes into `[c=role]…[/c]` semantic role markup.

    Each `|cAARRGGBB … |r` span becomes `[c=role]inner[/c]` (role from
    ``classify_role``, `|n` inside converted to newline). Pipe-newlines outside
    spans and any stray `|r` are handled like ``strip_codes``, so the result is
    the same text as ``strip_codes(s)`` with only role tags added. An unclosed
    span runs to the next colour code or end of string. Not a string → returned
    unchanged.
    """
    if not isinstance(s, str):
        return s
    out: list[str] = []
    i = 0
    n = len(s)
    open_role: str | None = None
    while i < n:
        m = _COLOR_SPAN_RE.match(s, i)
        if m:
            if open_role is not None:
                out.append("[/c]")
            open_role = classify_role(m.group(1))
            out.append("[c=%s]" % open_role)
            i = m.end()
            continue
        ch = s[i]
        if ch == "|" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in "rR":
                if open_role is not None:
                    out.append("[/c]")
                    open_role = None
                i += 2
                continue
            if nxt in "nN":
                out.append("\n")
                i += 2
                continue
        out.append(ch)
        i += 1
    if open_role is not None:
        out.append("[/c]")
    return "".join(out)

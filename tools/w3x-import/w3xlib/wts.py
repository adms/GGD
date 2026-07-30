"""war3map.wts string table + TRIGSTR resolution.

WHY THIS IS A LINE PARSER AND NOT A REGEX
-----------------------------------------
It used to be one regex::

    STRING\\s+(\\d+)\\s*(?:--[^\\r\\n]*)?\\s*\\{\\r?\\n(.*?)\\r?\\n\\}

whose only concession to a header comment was the old-style ``--`` form. The
UNPROTECTED source map writes ``//`` provenance comments
(``// 能力: A0VJ (52-01 狂戰士之怒), ...``) on nearly every entry, so that regex
matched **330 of the map's 11,337 strings** — and the miss was SILENT. `resolve`
simply left every unresolved reference as the literal text ``TRIGSTR_1234``, so
`w3xlib/stats.py` (and every importer stage built on it) shipped rawcode-shaped
placeholders where hero names, ability names and tooltips belong, with nothing
anywhere reporting a failure.

`src_text.py` had already worked around this with a private copy of the correct
parser, which is why the newer extractors are unaffected; the fix moves that
algorithm down here so the LIBRARY is right and `src_text.parse_wts_full` is a
thin adapter over it, instead of two parsers drifting apart.

The block grammar the World Editor emits::

    STRING <int id>
    // optional provenance comment(s)     (0 or more, each starting with //)
    {
    <body line 1>
    <body line 2 ...>                     (may be empty; colour codes kept)
    }

A line whose ``strip()`` is ``}`` terminates the body — the canonical emitter
never puts a bare ``}`` line inside one.

⚠️ Line endings are NORMALISED: bodies come back with ``\\n``, never ``\\r\\n``.
Measured against `out/GoDieEX22s-src/raw/war3map.wts`: of the 330 ids the old
regex did find, 0 are LOST and 23 change text — all 23 by exactly that
substitution, nothing else. So the fix is additive plus that normalisation.

Guarded by `test/unit_swap_census_checks.py` (`w3x-wts-*`), which pins the
11,337 exactly and names the old 330 beside it, because a ">300" pin would have
passed on the broken parser. `test/fixture_checks.py` separately exercises this
on a synthetic CRLF fixture (`w3x-trigstr-resolve`).
"""

from __future__ import annotations

import re

_STRING_RE = re.compile(r"^STRING\s+(\d+)\b")
_TRIGSTR_RE = re.compile(r"TRIGSTR_(\d+)")


def parse_wts_blocks(data: bytes) -> tuple[dict[int, str], dict[int, str]]:
    """Parse a war3map.wts blob into ``(strings, comments)``.

    ``strings``  : ``{id -> raw body text}`` — WC3 colour codes preserved,
                   internal newlines kept as ``\\n``, no trailing newline.
    ``comments`` : ``{id -> the // provenance comment without the slashes}``,
                   ``""`` when the entry carries none. Handy for auditing which
                   object each id belongs to.
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
        # consume optional comment / blank lines up to the opening brace
        while i < n and lines[i].strip() != "{":
            stripped = lines[i].strip()
            if stripped.startswith("//"):
                comment_parts.append(stripped[2:].strip())
            elif _STRING_RE.match(lines[i]):
                # malformed block with no body — bail without eating the header
                break
            i += 1
        if i >= n or lines[i].strip() != "{":
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


def parse_wts(data: bytes) -> dict[int, str]:
    """The string table alone. See `parse_wts_blocks` for the whole story."""
    return parse_wts_blocks(data)[0]


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

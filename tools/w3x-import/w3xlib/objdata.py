"""Warcraft III object-data parsers (war3map.w3u/w3t/w3b/w3h  and  w3a/w3d/w3q).

All share one binary layout (version 1/2, pre-Reforged):

  int32 version
  original-table:  int32 count, then entries
  custom-table:    int32 count, then entries
  entry: char4 baseId, char4 newId, int32 modCount, mods...
  mod:   char4 rawcode, int32 varType,
         [files WITH levels (w3a/w3d/w3q): int32 level, int32 dataColumn]
         value (varType 0=int32, 1/2=float32, 3=cstring),
         char4 endToken (ignored)

Values keep their Python type; strings are decoded UTF-8 (fallback latin-1).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field


@dataclass
class Mod:
    code: str
    var_type: int
    level: int  # 0 for non-leveled files
    data_col: int
    value: object


@dataclass
class ObjEntry:
    base_id: str
    new_id: str  # "" for original-table entries
    mods: list[Mod] = field(default_factory=list)

    @property
    def obj_id(self) -> str:
        return self.new_id or self.base_id

    def get(self, code: str, level: int | None = None, default=None):
        """Last-writer-wins single value; if level given, exact level match."""
        result = default
        for m in self.mods:
            if m.code == code and (level is None or m.level == level):
                result = m.value
        return result

    def levels(self, code: str) -> dict[int, object]:
        out: dict[int, object] = {}
        for m in self.mods:
            if m.code == code:
                out[m.level] = m.value
        return out


def _data_col_of(m: Mod, numeric_only: bool = False) -> int | None:
    """The 1-based data column of a mod, or None if it is not a data column.

    Factored out of data_columns() so raw_mods() can recognise the EXACT same
    mods and avoid echoing them into the passthrough (they already have a typed
    home in the `data` view). `data_col` from the file header is authoritative
    when set; otherwise the legacy 4th-char-digit fallback for non-'a' codes.
    """
    if numeric_only and m.var_type not in (0, 1, 2):
        return None
    col = m.data_col
    if col < 1:
        # legacy fallback: infer from the code's 4th char. The `a****`
        # codes are the generic per-ability fields (anam/acdn/aran/...),
        # never data columns.
        if len(m.code) == 4 and m.code[3].isdigit() and not m.code.startswith("a"):
            return int(m.code[3])
        return None
    return col


def data_columns(entry: ObjEntry, numeric_only: bool = False) -> dict[int, dict[int, object]]:
    """An ability's data columns as {column: {level: value}}, 1-based columns.

    THE COLUMN INDEX COMES FROM THE FILE, not from the shape of the mod code.
    Both callers used to infer it from the 4th character of the code, which
    holds for the spell families ('Ocr1', 'Ndr1', 'Osh1', 'Hbh3') but NOT for
    the item family, whose data fields are mnemonic: 'Iatt' (attack damage),
    'Iagi'/'Istr'/'Iint' (attribute points), 'Ilif' (max life), 'Iarm' (armour).
    Every item-ability magnitude in the map was therefore parsed away — 斬龍刀
    kept its 一擊斬 crit ('Ocr1'/'Ocr2', digit-suffixed) but silently lost the
    `Iatt 55` and `Iagi 20` its own tooltip advertises. 86 imported items ship
    short 139 modifiers between them because of this, which then let the task
    #82 AEP rescale scale the surviving stats far past where the author put
    them (two legendaries reached a guaranteed 100% crit).

    `data_col` is authoritative WHEN SET. A minority of leveled entries write a
    digit-suffixed code with data_col 0 (73 of them in the GoDieEX22s map, e.g.
    ACpa/'Npa6'), so the old rule is kept as a FALLBACK rather than replaced —
    dropping those would trade one silent loss for another.
    """
    cols: dict[int, dict[int, object]] = {}
    for m in entry.mods:
        col = _data_col_of(m, numeric_only)
        if col is None:
            continue
        cols.setdefault(col, {})[m.level] = m.value
    return cols


def raw_mods(entry: ObjEntry, known, resolve=None,
             skip_data_columns: bool = False, numeric_only: bool = False) -> dict:
    """Every field code on `entry` that has NO dedicated typed field — the
    passthrough that stops the record builders from silently dropping data.

    The builders (w3xlib/stats.py, src_objects.py) read a fixed WHITELIST of
    4-char codes into named fields; historically every OTHER code vanished. In
    the GoDieEX22s map the w3u carries 180 distinct field codes but only 27 had
    a typed home, so 153 were dropped per object. This returns the remainder,
    keyed by the raw 4-char code, so nothing is lost:

      - a code seen only at level 0 (non-leveled w3u/w3t) -> its scalar value
      - a code seen across levels (w3a)                    -> {str(level): value}

    `known` is the builder's whitelist; those codes are skipped (they already
    map to a typed field). `skip_data_columns` additionally skips mods the file
    marks as ability data columns — they are captured in the typed `data` view,
    so echoing them here would just duplicate them. `resolve` (optional) is
    applied to every value, e.g. to expand TRIGSTR string references.
    """
    if resolve is None:
        def resolve(v):  # noqa: E731 — identity default
            return v
    seen: dict[str, dict[int, object]] = {}
    for m in entry.mods:
        if m.code in known:
            continue
        if skip_data_columns and _data_col_of(m, numeric_only) is not None:
            continue
        seen.setdefault(m.code, {})[m.level] = resolve(m.value)
    out: dict[str, object] = {}
    for code, levels in seen.items():
        if set(levels) == {0}:
            out[code] = levels[0]
        else:
            out[code] = {str(lv): v for lv, v in sorted(levels.items())}
    return out


def _rawcode(b: bytes) -> str:
    return b.decode("latin-1")


def _cstring(data: bytes, pos: int) -> tuple[str, int]:
    end = data.index(b"\x00", pos)
    raw = data[pos:end]
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        s = raw.decode("latin-1")
    return s, end + 1


def parse_object_file(data: bytes, has_levels: bool) -> dict:
    version = struct.unpack_from("<i", data, 0)[0]
    pos = 4
    tables = {}
    for table_name in ("original", "custom"):
        count = struct.unpack_from("<i", data, pos)[0]
        pos += 4
        entries: list[ObjEntry] = []
        for _ in range(count):
            base = _rawcode(data[pos : pos + 4])
            new = _rawcode(data[pos + 4 : pos + 8])
            if new == "\x00\x00\x00\x00":
                new = ""
            mod_count = struct.unpack_from("<i", data, pos + 8)[0]
            pos += 12
            entry = ObjEntry(base_id=base, new_id=new)
            for _ in range(mod_count):
                code = _rawcode(data[pos : pos + 4])
                var_type = struct.unpack_from("<i", data, pos + 4)[0]
                pos += 8
                level = data_col = 0
                if has_levels:
                    level, data_col = struct.unpack_from("<ii", data, pos)
                    pos += 8
                if var_type == 0:
                    value = struct.unpack_from("<i", data, pos)[0]
                    pos += 4
                elif var_type in (1, 2):
                    value = struct.unpack_from("<f", data, pos)[0]
                    pos += 4
                elif var_type == 3:
                    value, pos = _cstring(data, pos)
                else:
                    raise ValueError(f"bad varType {var_type} at {pos}")
                pos += 4  # end token
                entry.mods.append(Mod(code, var_type, level, data_col, value))
            entries.append(entry)
        tables[table_name] = entries
    return {"version": version, **tables}


def all_entries(parsed: dict) -> list[ObjEntry]:
    return list(parsed["original"]) + list(parsed["custom"])

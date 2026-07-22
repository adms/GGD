"""Parser for the Warcraft III trigger-editor files war3map.wtg / war3map.wct.

This targets the *classic* (pre-Reforged) WTG format:

    "WTG!"  int version   (4 = RoC, 7 = TFT)

The trigger editor's folder hierarchy is the highest-value artifact in a GGD map:
the per-hero categories map directly to heroes, and each trigger's parent category
tells us which hero (or system) a piece of logic belongs to.

Difficulty: the classic WTG stores each trigger as

    cstring  name
    cstring  description
    int      isComment          (TFT only)
    int      isEnabled
    int      isCustomText        (trigger body lives in war3map.wct)
    int      isInitiallyOff
    int      runOnMapInit
    int      parentCategoryId
    int      ecaCount
    ECA[ecaCount]  ...           <-- variable-length, NOT self-delimiting

The ECA (event/condition/action) tree is only decodable with the World Editor's
TriggerData.txt argument counts, which we do not have. We therefore do NOT decode
the ECA bodies; instead we recover exact trigger boundaries structurally:

  * an ECA blob always begins with  int type in {0,1,2}  +  an ASCII function name,
    which strongly anchors any eca>0 trigger header;
  * an eca==0 trigger has no blob, so the next trigger header follows immediately;
  * real trigger names are never empty and are always sane UTF-8/CJK.

Given the exact trigger count from the header and the known file length, these
constraints admit exactly one valid segmentation, which we find with a memoised
DFS. The result is cross-validated by the caller against war3map.wct (one body
entry per trigger, in order) and against war3map.j's InitCustomTriggers order.
"""

from __future__ import annotations

import struct
import sys


class WtgError(Exception):
    pass


def _cstring(data: bytes, off: int) -> tuple[bytes, int]:
    end = data.index(b"\x00", off)
    return data[off:end], end + 1


def _decode_txt(raw: bytes, allow_nl: bool, max_len: int) -> str | None:
    """Decode a WE string field; reject control chars / over-long garbage."""
    if len(raw) > max_len:
        return None
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    for ch in s:
        if ord(ch) < 0x20 and not (allow_nl and ch in "\r\n\t"):
            return None
    return s


def _is_ascii_ident(raw: bytes) -> bool:
    if not raw or len(raw) > 256:
        return False
    b0 = raw[0]
    if not (65 <= b0 <= 90 or 97 <= b0 <= 122 or b0 == 95):
        return False
    for b in raw:
        if not (48 <= b <= 57 or 65 <= b <= 90 or 97 <= b <= 122 or b == 95):
            return False
    return True


def parse_wtg(data: bytes, want_variables: bool = False) -> dict:
    """Parse war3map.wtg. Returns:

    {
      'version': int,
      'categories': [{'id', 'name', 'isComment'}],      # file (tree) order
      'variableCount': int,
      'variables': [...]            # only if want_variables
      'triggers': [{'name','description','isComment','isEnabled','isCustomText',
                    'isInitiallyOff','runOnInit','categoryId','ecaCount','offset'}],
    }
    """
    if data[:4] != b"WTG!":
        raise WtgError("not a WTG! file (bad magic)")
    N = len(data)

    def i32(off: int) -> int:
        return struct.unpack_from("<i", data, off)[0]

    version = i32(4)
    if version not in (4, 7):
        raise WtgError(f"unsupported WTG version {version}")
    tft = version >= 7

    p = 8
    # ---- categories ----
    ncat = i32(p)
    p += 4
    categories = []
    catset: set[int] = set()
    for _ in range(ncat):
        cid = i32(p)
        p += 4
        nameb, p = _cstring(data, p)
        is_comment = 0
        if tft:
            is_comment = i32(p)
            p += 4
        categories.append(
            {"id": cid, "name": nameb.decode("utf-8", "replace"),
             "isComment": is_comment}
        )
        catset.add(cid)

    # ---- (unknown int, always 1 or 2) then variables ----
    p += 4  # unknown / trig-def format tag
    nvar = i32(p)
    p += 4
    variables = []
    for _ in range(nvar):
        nameb, p = _cstring(data, p)
        typeb, p = _cstring(data, p)
        p += 4  # unknown (=1)
        is_array = i32(p); p += 4
        array_size = 0
        if tft:
            array_size = i32(p); p += 4
        is_init = i32(p); p += 4
        initb, p = _cstring(data, p)
        if want_variables:
            variables.append(
                {"name": nameb.decode("utf-8", "replace"),
                 "type": typeb.decode("utf-8", "replace"),
                 "isArray": is_array, "arraySize": array_size,
                 "isInitialized": is_init,
                 "initialValue": initb.decode("utf-8", "replace")}
            )

    ntrig = i32(p); p += 4
    trigstart = p

    # number of int32 fields in a trigger header after (name, desc)
    nints = 7 if tft else 6   # RoC has no isComment field

    def parse_header(off: int):
        """Read a trigger header. Non-empty sane name required; eca>0 anchored.
        Returns (hdr, blob_off) or None."""
        if off + 2 > N:
            return None
        try:
            raw, o = _cstring(data, off)
        except ValueError:
            return None
        name = _decode_txt(raw, allow_nl=False, max_len=400)
        if name is None or len(raw) == 0:
            return None
        try:
            raw2, o = _cstring(data, o)
        except ValueError:
            return None
        desc = _decode_txt(raw2, allow_nl=True, max_len=20000)
        if desc is None:
            return None
        if o + 4 * nints > N:
            return None
        vals = struct.unpack_from("<%di" % nints, data, o)
        if tft:
            is_comment, is_enabled, is_ct, init_off, run_init, cat, eca = vals
        else:
            is_comment = 0
            is_enabled, is_ct, init_off, run_init, cat, eca = vals
        for b in (is_comment, is_enabled, is_ct, init_off, run_init):
            if b not in (0, 1):
                return None
        if cat not in catset:
            return None
        if eca < 0 or eca > 100000:
            return None
        o += 4 * nints
        if eca > 0:
            # an ECA blob must start with  int type in {0,1,2}  +  ASCII func name
            if o + 4 > N:
                return None
            if i32(o) not in (0, 1, 2):
                return None
            try:
                fraw, _ = _cstring(data, o + 4)
            except ValueError:
                return None
            if not _is_ascii_ident(fraw):
                return None
        return (
            {"name": name, "description": desc, "isComment": is_comment,
             "isEnabled": is_enabled, "isCustomText": is_ct,
             "isInitiallyOff": init_off, "runOnInit": run_init,
             "categoryId": cat, "ecaCount": eca, "offset": off},
            o,
        )

    def candidates(o: int):
        # every valid header offset in a bounded window (the true next start is
        # somewhere past the current blob); increasing order, DFS disambiguates.
        limit = min(N, o + 400000)
        scan = o
        while scan < limit:
            if parse_header(scan) is not None:
                yield scan
            scan += 1

    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, ntrig + 10000))
    # memo/choice keyed on (offset, index): whether a given offset can start
    # exactly (ntrig-idx) triggers that fill [offset, N) depends on idx.
    memo: dict[tuple[int, int], bool] = {}
    choice: dict[tuple[int, int], int] = {}
    try:
        def solve(off: int, idx: int) -> bool:
            key = (off, idx)
            cached = memo.get(key)
            if cached is not None:
                return cached
            r = parse_header(off)
            if r is None:
                memo[key] = False
                return False
            hdr, blob = r
            if idx == ntrig - 1:
                memo[key] = True   # last trigger; its blob runs to EOF
                return True
            if hdr["ecaCount"] == 0:
                ok = solve(blob, idx + 1)
                if ok:
                    choice[key] = blob
                memo[key] = ok
                return ok
            for cand in candidates(blob):
                if solve(cand, idx + 1):
                    choice[key] = cand
                    memo[key] = True
                    return True
            memo[key] = False
            return False

        if ntrig == 0:
            triggers = []
        elif not solve(trigstart, 0):
            raise WtgError(
                f"could not segment {ntrig} triggers from offset {trigstart}"
            )
        else:
            triggers = []
            off = trigstart
            for idx in range(ntrig):
                hdr, _ = parse_header(off)
                triggers.append(hdr)
                if idx < ntrig - 1:
                    off = choice[(off, idx)]
    finally:
        sys.setrecursionlimit(old_limit)

    out = {
        "version": version,
        "categories": categories,
        "variableCount": nvar,
        "triggers": triggers,
    }
    if want_variables:
        out["variables"] = variables
    return out


def parse_wct(data: bytes) -> dict:
    """Parse war3map.wct (custom-text trigger bodies).

    Returns { 'version', 'headerComment', 'mapHeaderScript', 'entries': [str,...] }
    where entries[i] is the custom JASS body of trigger i (empty if the trigger is
    not a custom-text trigger). Entry order matches war3map.wtg trigger order.
    """
    N = len(data)

    def i32(off: int) -> int:
        return struct.unpack_from("<i", data, off)[0]

    p = 0
    version = i32(p); p += 4
    header_b, p = _cstring(data, p)
    header_comment = header_b.decode("utf-8", "replace")

    # map-header custom script (int length + raw text)
    hlen = i32(p); p += 4
    map_header = data[p:p + hlen]; p += hlen
    map_header_script = map_header.split(b"\x00", 1)[0].decode("utf-8", "replace")

    count = i32(p); p += 4
    entries = []
    for _ in range(count):
        blen = i32(p); p += 4
        body = data[p:p + blen]; p += blen
        text = body.split(b"\x00", 1)[0].decode("utf-8", "replace") if blen else ""
        entries.append(text)

    return {
        "version": version,
        "headerComment": header_comment,
        "mapHeaderScript": map_header_script,
        "entries": entries,
    }

#!/usr/bin/env python3
r"""L1 — the VFX model census, done by a method that does not lie.

    python3 tools/w3x-import/build_model_usage.py
    -> tools/w3x-import/out/vfx-census/MODEL_USAGE.json   (reverse index)
    -> tools/w3x-import/out/vfx-census/MODEL_USAGE.md     (human report)
    -> tools/w3x-import/out/stock/STOCK_ART.json          (MPQ cache, so a
                                                           machine without the
                                                           retail archives can
                                                           still re-run this)

WHAT A "REFERENCE" IS
---------------------
One place in the source map where a model file is named. Five channels, and
the count is wrong if you skip any of them:

  w3a-override   the ability's own art cell (atat/amat/acat/asat/aeat/aaea)
  w3h-override   the BUFF's art cell (ftat/fsat/feat) — a passive or an aura
                 shows through its buff record, not through the ability
  w3u-override   a unit's own art (umdl/ua1m/ua2m/uspa) — this is where the
                 dummy/蝗蟲群 effect units live
  stock-inherited  the cell is ABSENT, so WC3 falls through to the Blizzard
                 base record. Ability + buff art comes from
                 `Units\*AbilityFunc.txt`; unit models from `Units\UnitUI.slk`
                 (`file` column); unit missile/special art from
                 `Units\*UnitFunc.txt`
  jass-literal   the author typed the path into war3map.j

THREE METHOD BUGS THIS FILE FIXES
---------------------------------
1. `Units\AbilityData.slk` HAS NO ART COLUMNS. Measured: the string
   "Casterart" / "Targetart" / "Missileart" / "EffectSound" does not occur
   anywhere in that file's 537,348 bytes. Ability art lives in the eight
   `Units\<Race>AbilityFunc.txt` INI files, which also carry the BUFF records
   (`[Bblo] targetart=...`). An inheritance pass pointed at the SLK finds
   nothing and silently reports "the map set nothing".

2. AN EMPTY ART CELL IS A DELIBERATE CLEAR, NOT AN ABSENCE. `A0D5
   20-03 約束與勝利之劍` stores `amat = ""`. Its base `AOsh` (Shockwave) does
   name `ShockwaveMissile.mdl` — but the author erased it, so WC3 draws no
   missile. Treating "" as "unspoken" and inheriting invents a reference that
   the map explicitly deleted. 154 w3a + 32 w3h + 18 w3u cells are clears; this
   file counts them as `*-cleared` and inherits NOTHING for them.
   (`out/vfx-bindings/VFX_BINDINGS.json` gets exactly this wrong today: it
   reports A0D5's missile slot as `stock-inherited` with
   `why: "the map stores no override for this slot"`.)

3. A MODEL PATH DOES NOT HAVE TO END IN .mdl/.mdx. Eight cells name
   `…\TalkToMe\TalkToMe`, `…\Waterfall\Waterfall`, `…\CameraProp\CameraProp`
   with no extension, and `UnitUI.slk`'s `file` column is extension-less for
   EVERY row. A scanner that greps for the extension drops all of them.

PER-INVOCATION PARAMETERS
-------------------------
The point of the census is not the count, it is deciding how many knobs one
reusable prototype needs. So every reference site carries whatever the map
said about THAT site:

  from w3u   `usca` scale, `uclr/uclg/uclb` tint, `umvh` fly height,
             `ussc` selection scale, `Aloc` (is it a locust/effect-only unit)
  from w3a/w3h  the attach point (`acap`/`aspt`/`ata0..5`, `fspt`/`feft`/`fta0..5`)
  from stock    the same attach keys out of the *AbilityFunc.txt record
  from JASS  the attach-point literal of AddSpecialEffectTargetUnitBJ, and —
             for a dummy unit spawned by CreateNUnitsAtLoc — the
             SetUnitScalePercent / SetUnitVertexColorBJ / SetUnitTimeScalePercent
             / SetUnitFlyHeightBJ that follow it in the same function.

DETERMINISM. Same inputs, same bytes out: every collection is sorted before
it is written, and no clock/rng/filesystem-order value enters the output.

READS ONLY. Writes nothing outside tools/w3x-import/out/.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from stock_unit_data import parse_slk  # noqa: E402
from w3xlib.mpq import W3XArchive  # noqa: E402
from w3xlib.objdata import all_entries, parse_object_file  # noqa: E402
from w3xlib.wts import parse_wts, resolve, strip_codes  # noqa: E402

RAW = os.path.join(HERE, "out", "GoDieEX22s-src", "raw")
OUTDIR = os.path.join(HERE, "out", "vfx-census")
STOCK_CACHE = os.path.join(HERE, "out", "stock", "STOCK_ART.json")

ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]  # oldest first; newest wins
RACES = ["Human", "Orc", "NightElf", "Undead", "Neutral", "Common", "Item", "Campaign"]

# --------------------------------------------------------------------------
# field contracts
# --------------------------------------------------------------------------

ABILITY_ART = {
    "atat": "ability.targetArt",
    "amat": "ability.missileArt",
    "acat": "ability.casterArt",
    "asat": "ability.specialArt",
    "aeat": "ability.effectArt",
    "aaea": "ability.areaEffectArt",
}
# w3a attach-point codes -> the art channel they anchor.
ABILITY_ATTACH = {
    "acap": ("ability.casterArt", 0),
    "aspt": ("ability.specialArt", 0),
    **{f"ata{i}": ("ability.targetArt", i) for i in range(6)},
}
BUFF_ART = {
    "ftat": "buff.targetArt",
    "fsat": "buff.specialArt",
    "feat": "buff.effectArt",
}
BUFF_ATTACH = {
    "fspt": ("buff.specialArt", 0),
    "feft": ("buff.effectArt", 0),
    **{f"fta{i}": ("buff.targetArt", i) for i in range(6)},
}
UNIT_ART = {
    "umdl": "unit.model",
    "ua1m": "unit.attack1Missile",
    "ua2m": "unit.attack2Missile",
    "uspa": "unit.specialArt",
}

# *AbilityFunc.txt keys (lower-cased) -> the same canonical channels. `buffart`
# is a .blp icon, deliberately absent. Buff records live in these same files,
# so the ability keys double as the buff keys and are mapped per-record-kind.
STOCK_ABILITY_ART = {
    "targetart": "targetArt",
    "missileart": "missileArt",
    "casterart": "casterArt",
    "specialart": "specialArt",
    "effectart": "effectArt",
    "areaeffectart": "areaEffectArt",
}
STOCK_ABILITY_ATTACH = {
    "casterattach": ("casterArt", 0),
    "specialattach": ("specialArt", 0),
    "effectattach": ("effectArt", 0),
    "areaeffectattach": ("areaEffectArt", 0),
    "targetattach": ("targetArt", 0),
    **{f"targetattach{i}": ("targetArt", i) for i in range(1, 6)},
}
# *UnitFunc.txt keys -> canonical unit channels.
STOCK_UNIT_ART = {
    "missileart": "unit.attack1Missile",
    "specialart": "unit.specialArt",
}

# Lightning ids are Lightning.slk rows, not models. Never counted.
LIGHTNING_IDS = {
    "AFOD", "AFOx", "CHIM", "CLPB", "CLSB", "DRAB", "DRAL", "DRAM",
    "FORK", "HWPB", "HWSB", "LEAS", "MBUR", "MFPB", "SPLK",
}

# Not a model: WC3 accepts a handful of sentinel words in art cells.
NOT_A_MODEL = {"", "_", "-", "none", "nomodel"}

# --------------------------------------------------------------------------
# the owner's 21 priority families — 33 models, given, not guessed
# --------------------------------------------------------------------------

FAMILIES: list[tuple[str, str, list[str]]] = [
    ("shockwaveRing", "衝擊波環", ["warstompcaster", "thunderclapcaster"]),
    ("blink", "閃現", ["blinktarget", "blinkcaster"]),
    ("burst", "爆裂", ["stampedemissiledeath", "neutralbuildingexplosion", "steamtankimpact",
                       "abominationexplosion", "firelorddeathexplode", "doomdeath"]),
    ("dissipate", "消散", ["nagadeath", "hcanceldeath", "undeaddissipate"]),
    ("missile", "飛彈", ["phoenix_missile", "ancientprotectormissile"]),
    ("groundDust", "地面塵土", ["impaletargetdust"]),
    ("boltStrike", "雷擊", ["monsoonbolttarget"]),
    ("mark", "印記", ["markofchaostarget"]),
    ("mirrorImage", "分身", ["mirrorimagecaster"]),
    ("flamePillar", "火柱", ["flamestriketarget"]),
    ("resurrect", "復活光", ["resurrecttarget", "resurrectcaster"]),
    ("tornado", "龍捲", ["tornadoelemental", "tornadoelementalsmall"]),
    ("lightColumn", "書/光柱", ["tomeofretrainingcaster"]),
    ("breath", "吐息", ["bloodbreathstream"]),
    ("cloud", "雲", ["herocloudcyd"]),
    ("portal", "傳送門", ["darkportaltarget"]),
    ("shine", "閃光", ["supershinythingy"]),
    ("blood", "血", ["herobloodelfblood"]),
    ("levelUp", "升級光", ["levelupcaster"]),
    ("starfall", "星墜", ["starfalltarget"]),
    ("uncategorised", "未分類（自訂匯入）", ["boomnl"]),
]
FAMILY_OF = {stem: fid for fid, _, stems in FAMILIES for stem in stems}
PRIORITY_STEMS = sorted(FAMILY_OF)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def stem_of(path: str) -> str:
    """Lower-cased basename without extension. `A\\B\\WarStompCaster.mdl` -> warstompcaster."""
    base = path.replace("/", "\\").rsplit("\\", 1)[-1]
    if "." in base:
        base = base.rsplit(".", 1)[0]
    return base.strip().lower()


def split_art(value) -> list[str]:
    """An art cell may hold a comma-separated LIST of models (WC3 layers them).

    Returns [] for a cleared cell, a lightning id, or a sentinel. The extension
    is NOT required — `…\\TalkToMe\\TalkToMe` and every UnitUI.slk `file` value
    are real model references with none.
    """
    if not isinstance(value, str):
        return []
    out = []
    for part in value.split(","):
        p = part.strip().strip('"')
        if p.lower() in NOT_A_MODEL or p in LIGHTNING_IDS:
            continue
        out.append(p)
    return out


def form_of(path: str) -> str:
    """map-imported models sit at the archive root with no directory."""
    return "blizzard-stock" if ("\\" in path or "/" in path) else "map-imported"


def read(name: str) -> bytes:
    with open(os.path.join(RAW, name), "rb") as fh:
        return fh.read()


# --------------------------------------------------------------------------
# stock tables (retail MPQs, cached)
# --------------------------------------------------------------------------


def load_stock() -> tuple[dict, dict]:
    """(tables, provenance). Reads the MPQs when present, else the cache."""
    present = [a for a in ARCHIVES if os.path.exists(os.path.join(REPO, a))]
    if not present:
        if not os.path.exists(STOCK_CACHE):
            raise SystemExit(
                "FATAL: no retail MPQ at the repo root and no "
                f"{os.path.relpath(STOCK_CACHE, REPO)} cache. The stock-inheritance "
                "channel cannot be computed, and a census without it under-counts "
                "by roughly half — refusing to write a number that would be wrong."
            )
        with open(STOCK_CACHE, encoding="utf-8") as fh:
            cached = json.load(fh)
        return cached["tables"], {"source": "cache", "archives": cached["meta"]["archives"]}

    ability: dict[str, dict[str, str]] = {}
    unit_func: dict[str, dict[str, str]] = {}
    unit_ui: dict[str, dict[str, str]] = {}
    files_read: list[str] = []

    def ini(blob: bytes, sink: dict[str, dict[str, str]]) -> None:
        cur = None
        for line in blob.decode("utf-8-sig", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            if line.startswith("[") and line.endswith("]"):
                cur = line[1:-1].strip()
                sink.setdefault(cur, {})
                continue
            if cur is None or "=" not in line:
                continue
            k, v = line.split("=", 1)
            sink[cur][k.strip().lower()] = v.strip().strip('"')

    for arc in ARCHIVES:
        full = os.path.join(REPO, arc)
        if not os.path.exists(full):
            continue
        a = W3XArchive(full)
        try:
            for race in RACES:
                for table, sink in ((f"Units\\{race}AbilityFunc.txt", ability),
                                    (f"Units\\{race}UnitFunc.txt", unit_func)):
                    blob = a.read_file(table)
                    if blob:
                        files_read.append(f"{arc}:{table}")
                        ini(blob, sink)
            blob = a.read_file("Units\\UnitUI.slk")
            if blob:
                files_read.append(f"{arc}:Units\\UnitUI.slk")
                for uid, row in parse_slk(blob).items():
                    unit_ui.setdefault(uid, {}).update(row)
        finally:
            a.close()

    tables = {"abilityFunc": ability, "unitFunc": unit_func, "unitUI": unit_ui}
    os.makedirs(os.path.dirname(STOCK_CACHE), exist_ok=True)
    with open(STOCK_CACHE, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "meta": {
                    "generator": "tools/w3x-import/build_model_usage.py",
                    "archives": present,
                    "filesRead": sorted(files_read),
                    "note": (
                        "Blizzard stock ART only. `Units\\AbilityData.slk` is NOT here "
                        "because it carries no art columns — ability AND buff art live "
                        "in Units\\<Race>AbilityFunc.txt, unit models in "
                        "Units\\UnitUI.slk `file`, unit missile/special art in "
                        "Units\\<Race>UnitFunc.txt. *.mpq is gitignored, so this cache "
                        "is what lets the census re-run without the retail install."
                    ),
                    "abilityFuncRecords": len(ability),
                    "unitFuncRecords": len(unit_func),
                    "unitUIRecords": len(unit_ui),
                },
                "tables": {
                    "abilityFunc": {k: dict(sorted(v.items())) for k, v in sorted(ability.items())},
                    "unitFunc": {k: dict(sorted(v.items())) for k, v in sorted(unit_func.items())},
                    "unitUI": {k: dict(sorted(v.items())) for k, v in sorted(unit_ui.items())},
                },
            },
            fh,
            ensure_ascii=False,
            indent=1,
        )
        fh.write("\n")
    return tables, {"source": "mpq", "archives": present, "files": len(files_read)}


# --------------------------------------------------------------------------
# the index
# --------------------------------------------------------------------------

REFS: list[dict] = []
# (objectId, channel) of every art cell the author explicitly EMPTIED. These
# must never acquire a stock-inherited reference — that is method bug #2.
CLEARED: set[tuple[str, str]] = set()


def add(model: str, **kw) -> None:
    path = model.strip().strip('"')
    REFS.append({"path": path, "stem": stem_of(path), "form": form_of(path), **kw})


def main() -> int:
    stock, stock_prov = load_stock()
    ability_func = stock["abilityFunc"]
    unit_func = stock["unitFunc"]
    unit_ui = stock["unitUI"]

    # STRING TABLE. `w3xlib.wts.parse_wts` recovers only 330 of the map's 11,337
    # entries: its block regex tolerates a `--` comment between `STRING n` and
    # `{`, but this map writes `// 能力: ANso (30-03 痴漢火焰)`, so almost every
    # block fails to match and every ability name comes back as the literal
    # "TRIGSTR_2663". `out/GoDieEX22s-src/STRINGS.json` (from src_extract.py) has
    # the full table, so that is the primary and the wts is only the fallback.
    # Left as a finding rather than patched here: parse_wts is shared with the
    # other importers and changing it mid-flight would move their outputs too.
    strings = {int(k): v for k, v in json.load(
        open(os.path.join(HERE, "out", "GoDieEX22s-src", "STRINGS.json"), encoding="utf-8")
    ).items()}
    for k, v in parse_wts(read("war3map.wts")).items():
        strings.setdefault(k, v)

    def name_of(entry, code) -> str | None:
        v = entry.get(code)
        if not isinstance(v, str) or not v:
            return None
        return strip_codes(resolve(v, strings)).strip() or None

    w3a = all_entries(parse_object_file(read("war3map.w3a"), True))
    w3h = all_entries(parse_object_file(read("war3map.w3h"), False))
    w3u = all_entries(parse_object_file(read("war3map.w3u"), False))

    counters = Counter()

    # ---------------------------------------------------------------- w3a
    ability_names: dict[str, str] = {}
    ability_base: dict[str, str] = {}
    for e in w3a:
        oid = e.obj_id
        ability_base[oid] = e.base_id
        nm = name_of(e, "anam")
        if nm:
            ability_names[oid] = nm

        # attach points first — they annotate the art cells below
        attach: dict[tuple[str, int], str] = {}
        for code, (chan, idx) in ABILITY_ATTACH.items():
            v = e.get(code)
            if isinstance(v, str) and v.strip():
                attach[(chan, idx)] = v.strip()

        spoken: set[str] = set()
        for code, chan in ABILITY_ART.items():
            cells = e.levels(code)
            if not cells:
                continue
            spoken.add(chan)
            # one binding per DISTINCT value; remember which levels said it.
            by_value: dict[str, list[int]] = defaultdict(list)
            for lvl, val in sorted(cells.items()):
                by_value[val if isinstance(val, str) else ""].append(lvl)
            for val, levels in sorted(by_value.items()):
                paths = split_art(val)
                if not paths:
                    counters["clearedCells"] += 1
                    counters[f"cleared:{chan}"] += 1
                    CLEARED.add((oid, chan))
                    continue
                for layer, path in enumerate(paths):
                    add(
                        path,
                        channel=chan,
                        provenance="w3a-override",
                        objectKind="ability",
                        objectId=oid,
                        baseId=e.base_id,
                        objectName=ability_names.get(oid),
                        levels=levels,
                        layer=layer,
                        anchor=attach.get((chan, layer)),
                    )
        # base inheritance for every channel the map left UNSPOKEN
        base = ability_func.get(e.base_id) or {}
        for key, short in sorted(STOCK_ABILITY_ART.items()):
            chan = f"ability.{short}"
            if chan in spoken or not base.get(key):
                continue
            for layer, path in enumerate(split_art(base[key])):
                anchor = None
                for akey, (ashort, aidx) in STOCK_ABILITY_ATTACH.items():
                    if ashort == short and aidx == layer and base.get(akey):
                        anchor = base[akey]
                add(
                    path,
                    channel=chan,
                    provenance="stock-inherited",
                    objectKind="ability",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=ability_names.get(oid),
                    levels=[0],
                    layer=layer,
                    anchor=anchor,
                )

    # ---------------------------------------------------------------- w3h
    for e in w3h:
        oid = e.obj_id
        nm = name_of(e, "fnam")
        attach: dict[tuple[str, int], str] = {}
        for code, (chan, idx) in BUFF_ATTACH.items():
            v = e.get(code)
            if isinstance(v, str) and v.strip():
                attach[(chan, idx)] = v.strip()
        spoken = set()
        for code, chan in BUFF_ART.items():
            v = e.get(code)
            if v is None:
                continue
            spoken.add(chan)
            paths = split_art(v)
            if not paths:
                counters["clearedCells"] += 1
                counters[f"cleared:{chan}"] += 1
                CLEARED.add((oid, chan))
                continue
            for layer, path in enumerate(paths):
                add(
                    path,
                    channel=chan,
                    provenance="w3h-override",
                    objectKind="buff",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=nm,
                    levels=[0],
                    layer=layer,
                    anchor=attach.get((chan, layer)),
                )
        base = ability_func.get(e.base_id) or {}
        for key, short in sorted(STOCK_ABILITY_ART.items()):
            chan = f"buff.{short}"
            if chan not in BUFF_ART.values() or chan in spoken or not base.get(key):
                continue
            for layer, path in enumerate(split_art(base[key])):
                anchor = None
                for akey, (ashort, aidx) in STOCK_ABILITY_ATTACH.items():
                    if ashort == short and aidx == layer and base.get(akey):
                        anchor = base[akey]
                add(
                    path,
                    channel=chan,
                    provenance="stock-inherited",
                    objectKind="buff",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=nm,
                    levels=[0],
                    layer=layer,
                    anchor=anchor,
                )

    # ---------------------------------------------------------------- w3u
    unit_params: dict[str, dict] = {}
    unit_names: dict[str, str] = {}
    for e in w3u:
        oid = e.obj_id
        nm = name_of(e, "unam")
        if nm:
            unit_names[oid] = nm
        ui = unit_ui.get(e.base_id) or {}

        def numeric(code, fallback_key=None):
            v = e.get(code)
            if isinstance(v, (int, float)):
                return round(float(v), 4)
            if fallback_key and ui.get(fallback_key):
                try:
                    return round(float(ui[fallback_key]), 4)
                except ValueError:
                    return None
            return None

        def tint(code, ui_key):
            v = e.get(code)
            if isinstance(v, (int, float)):
                return int(v)
            try:
                return int(float(ui[ui_key])) if ui.get(ui_key) else None
            except ValueError:
                return None

        abil = " ".join(str(e.get(c) or "") for c in ("uabi", "uhab"))
        params = {
            "scale": numeric("usca", "modelScale"),
            "selectionScale": numeric("ussc"),
            "flyHeight": numeric("umvh"),
            "tint": [tint("uclr", "red"), tint("uclg", "green"), tint("uclb", "blue")],
            "isLocust": "Aloc" in abil,
            "moveType": e.get("umvt") if isinstance(e.get("umvt"), str) else None,
        }
        if params["tint"] == [None, None, None]:
            params["tint"] = None
        unit_params[oid] = params

        spoken = set()
        for code, chan in UNIT_ART.items():
            v = e.get(code)
            if v is None:
                continue
            spoken.add(chan)
            paths = split_art(v)
            if not paths:
                counters["clearedCells"] += 1
                counters[f"cleared:{chan}"] += 1
                CLEARED.add((oid, chan))
                continue
            for layer, path in enumerate(paths):
                add(
                    path,
                    channel=chan,
                    provenance="w3u-override",
                    objectKind="unit",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=nm,
                    levels=[0],
                    layer=layer,
                    anchor=None,
                    params=params,
                )
        # stock unit model. `UnitUI.slk`'s `file` is extension-less for EVERY row,
        # so it goes through the SAME `split_art` gate as every other channel —
        # routing it around the gate would hide an extension filter from the
        # guard that exists to catch one.
        if "unit.model" not in spoken and ui.get("file"):
            for layer, path in enumerate(split_art(ui["file"])):
                add(
                    path,
                    channel="unit.model",
                    provenance="stock-inherited",
                    objectKind="unit",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=nm,
                    levels=[0],
                    layer=layer,
                    anchor=None,
                    params=params,
                )
        base_uf = unit_func.get(e.base_id) or {}
        for key, chan in sorted(STOCK_UNIT_ART.items()):
            if chan in spoken or not base_uf.get(key):
                continue
            for layer, path in enumerate(split_art(base_uf[key])):
                add(
                    path,
                    channel=chan,
                    provenance="stock-inherited",
                    objectKind="unit",
                    objectId=oid,
                    baseId=e.base_id,
                    objectName=nm,
                    levels=[0],
                    layer=layer,
                    anchor=None,
                    params=params,
                )

    # ---------------------------------------------------------------- JASS
    # A dummy unit spawned from JASS is a reference to the unit's OWN model, and
    # the SetUnit* calls after the spawn are that invocation's parameters. So the
    # spawn has to resolve unitId -> model stem, or the参數 land on nothing.
    unit_model: dict[str, tuple[str, str]] = {}
    for r in REFS:
        if r["channel"] == "unit.model" and r["objectId"] not in unit_model:
            unit_model[r["objectId"]] = (r["stem"], r["path"])
    # a spawn may name a pure stock unit the w3u never touches
    for uid, row in unit_ui.items():
        if uid not in unit_model and row.get("file"):
            unit_model[uid] = (stem_of(row["file"]), row["file"])

    jass_sites, jass_stats = scan_jass(
        read("war3map.j").decode("utf-8", errors="replace"),
        ability_names, ability_base, unit_params, unit_names, unit_model,
    )

    # ---------------------------------------------------------- reverse index
    models: dict[str, dict] = {}
    for r in REFS:
        m = models.setdefault(
            r["stem"],
            {
                "stem": r["stem"],
                "paths": set(),
                "form": r["form"],
                "family": FAMILY_OF.get(r["stem"]),
                "refs": [],
            },
        )
        m["paths"].add(r["path"])
        m["refs"].append({k: v for k, v in r.items() if k not in ("stem", "form")})

    for site in jass_sites:
        m = models.setdefault(
            site["stem"],
            {
                "stem": site["stem"],
                "paths": set(),
                "form": site["form"],
                "family": FAMILY_OF.get(site["stem"]),
                "refs": [],
            },
        )
        m["paths"].add(site["path"])
        m["refs"].append({k: v for k, v in site.items() if k not in ("stem", "form")})

    def sort_key(ref: dict) -> tuple:
        return (
            ref.get("provenance", ""),
            ref.get("channel", ""),
            str(ref.get("objectId") or ""),
            ref.get("line") or 0,
            ref.get("layer") or 0,
        )

    out_models: dict[str, dict] = {}
    for stem in sorted(models):
        m = models[stem]
        refs = sorted(m["refs"], key=sort_key)
        prov = Counter(r["provenance"] for r in refs)
        chan = Counter(r["channel"] for r in refs)
        anchors = Counter(r["anchor"] for r in refs if r.get("anchor"))
        buckets: dict[str, list[float]] = {
            k: [] for k in ("scale", "scalePercent", "effectiveScale", "flyHeight",
                            "timeScalePercent", "alphaPercent")
        }
        tints = []
        for r in refs:
            p = r.get("params") or {}
            for src, sink in buckets.items():
                v = p.get(src)
                if isinstance(v, (int, float)):
                    sink.append(round(float(v), 4))
            if p.get("tint") and any(c is not None for c in p["tint"]):
                tints.append(tuple(p["tint"]))
        out_models[stem] = {
            "stem": stem,
            "paths": sorted(m["paths"]),
            "form": m["form"],
            "family": m["family"],
            "isPriority": stem in FAMILY_OF,
            "refCount": len(refs),
            "byProvenance": dict(sorted(prov.items())),
            "byChannel": dict(sorted(chan.items())),
            "anchors": dict(sorted(anchors.items())),
            # `scale` is the carrier unit's own w3u `usca`; `scalePercent` is the
            # per-invocation SetUnitScalePercent; `effectiveScale` is the product
            # — the number a reusable prototype's scale knob has to span.
            "params": {
                **{k: spread(v) for k, v in buckets.items()},
                "tint": [list(t) for t in sorted(set(tints))],
            },
            "refs": refs,
        }

    total_refs = sum(m["refCount"] for m in out_models.values())
    by_prov = Counter()
    by_chan = Counter()
    for m in out_models.values():
        by_prov.update(m["byProvenance"])
        by_chan.update(m["byChannel"])

    families = []
    for fid, label, stems in FAMILIES:
        members = []
        for s in stems:
            mm = out_models.get(s)
            members.append(
                {
                    "stem": s,
                    "found": mm is not None,
                    "refCount": mm["refCount"] if mm else 0,
                    "paths": mm["paths"] if mm else [],
                    "scale": mm["params"]["scale"] if mm else None,
                    "effectiveScale": mm["params"]["effectiveScale"] if mm else None,
                    "scalePercent": mm["params"]["scalePercent"] if mm else None,
                    "tintVariants": len(mm["params"]["tint"]) if mm else 0,
                    "anchors": mm["anchors"] if mm else {},
                }
            )
        families.append(
            {
                "id": fid,
                "label": label,
                "models": members,
                "refCount": sum(x["refCount"] for x in members),
                "missing": sorted(x["stem"] for x in members if not x["found"]),
            }
        )

    missing_priority = sorted(s for s in PRIORITY_STEMS if s not in out_models)

    # ------------------------------------------------------------ invariants
    # One guard per method bug. Each was mutation-verified: the fix was reverted,
    # the guard was seen to fail, and the fix was put back. A census that quietly
    # degrades is worse than no census, so these RAISE — they do not warn.
    inv: dict[str, object] = {}

    # G1 — stock inheritance actually happened. Goes to 0 the moment the
    # inheritance pass is aimed at `Units\AbilityData.slk` (which has no art
    # columns) instead of `Units\<Race>AbilityFunc.txt`.
    inherited_ability = sum(
        1 for m in out_models.values() for r in m["refs"]
        if r["provenance"] == "stock-inherited" and r["channel"].startswith("ability.")
    )
    inv["stockInheritedAbilityArt"] = inherited_ability
    assert inherited_ability > 300, (
        f"only {inherited_ability} inherited ability-art references. The stock table "
        "is empty or aimed at the wrong file — ability art lives in "
        "Units\\<Race>AbilityFunc.txt, NOT in Units\\AbilityData.slk."
    )

    # G2 — an explicitly emptied cell never inherits. Goes red if `split_art`
    # stops distinguishing "" from "absent".
    leaked = sorted(
        f"{r['objectId']}/{r['channel']}"
        for m in out_models.values() for r in m["refs"]
        if r["provenance"] == "stock-inherited" and (r.get("objectId"), r["channel"]) in CLEARED
    )
    inv["clearedCellsThatLeakedIntoInheritance"] = leaked
    assert not leaked, (
        f"{len(leaked)} cells the author EMPTIED were given inherited art anyway: "
        f"{leaked[:5]} — an empty art cell is a deliberate erase, not an absence."
    )

    # G3 — extension-less model paths survive. Goes red if a `.mdl/.mdx` filter
    # creeps back in; every UnitUI.slk `file` value has no extension.
    extensionless = sum(
        1 for m in out_models.values() for r in m["refs"]
        if not r["path"].lower().endswith((".mdl", ".mdx"))
    )
    inv["extensionlessReferences"] = extensionless
    assert extensionless > 100, (
        f"only {extensionless} extension-less model references — a `.mdl/.mdx` filter "
        "is dropping every stock unit model and the map's 8 extension-less art cells."
    )

    # G4 — the JASS channel is complete, recounted independently of the scanner.
    jass_literal_refs = sum(
        1 for m in out_models.values() for r in m["refs"] if r["provenance"] == "jass-literal"
    )
    # counted with a DIFFERENT expression from the scanner's own MODEL_RE on
    # purpose — a recount that reuses the scanner's regex agrees with the scanner
    # even when the regex is the thing that broke.
    raw_literals = len(re.findall(
        r'(?i)\.mdl"|\.mdx"', read("war3map.j").decode("utf-8", errors="replace")))
    inv["jassLiteralReferences"] = jass_literal_refs
    inv["jassLiteralsInSource"] = raw_literals
    assert jass_literal_refs == raw_literals, (
        f"scanner produced {jass_literal_refs} JASS literals but war3map.j contains "
        f"{raw_literals} — the JASS channel is lossy."
    )

    # G5 — the owner's 33 priority models are all present.
    inv["priorityModelsMissing"] = missing_priority
    assert not missing_priority, f"priority models with zero references: {missing_priority}"

    # G6 — the buff channel exists at all. It was absent from the previous census
    # entirely, which is where 175 references went missing.
    buff_refs = sum(
        1 for m in out_models.values() for r in m["refs"] if r["channel"].startswith("buff.")
    )
    inv["buffReferences"] = buff_refs
    assert buff_refs > 100, f"only {buff_refs} buff-art references — war3map.w3h was skipped."

    # G7 — the per-invocation parameters really land on a reference site, checked
    # against an INDEPENDENT recount of the source rather than a round number.
    # war3map.j has 35 SetUnitScalePercent calls; 21 target GetLastCreatedUnit()
    # (harvestable by a per-function scanner) and 14 target a udg_ global assigned
    # in a different function, which this scanner cannot follow and does not claim.
    jass_text = read("war3map.j").decode("utf-8", errors="replace")
    harvestable = len(re.findall(
        r"SetUnitScalePercent\s*\(\s*GetLastCreatedUnit\(\)", jass_text))
    with_scale = sum(
        1 for m in out_models.values() for r in m["refs"]
        if isinstance((r.get("params") or {}).get("scalePercent"), (int, float))
    )
    inv["scalePercentCallsInSource"] = len(re.findall(r"SetUnitScalePercent\s*\(", jass_text))
    inv["scalePercentHarvestable"] = harvestable
    inv["scalePercentHarvested"] = with_scale
    assert with_scale == harvestable, (
        f"harvested {with_scale} of {harvestable} SetUnitScalePercent calls that target "
        "GetLastCreatedUnit() — the per-invocation parameter harvest regressed, and the "
        "parameters are the entire point of the census."
    )

    # G8 — the JASS tint channel. war3map.j makes 57 SetUnitVertexColorBJ calls;
    # 9 target GetLastCreatedUnit() directly and the rest a udg_ alias, so the
    # harvest must reach at least the 9 a naive scanner could see. (Most tint in
    # the index does NOT come from here at all — it is authored on the dummy unit
    # as `uclr/uclg/uclb`, which is why the w3u channel carries the colour knob.)
    direct_tint = len(re.findall(
        r"SetUnitVertexColou?r(?:BJ)?\s*\(\s*GetLastCreatedUnit\(\)", jass_text))
    harvested_tint = sum(
        1 for m in out_models.values() for r in m["refs"]
        if (r.get("params") or {}).get("vertexColorPercent")
    )
    inv["vertexColorCallsInSource"] = len(re.findall(r"SetUnitVertexColou?r", jass_text))
    inv["vertexColorTargetingLastCreated"] = direct_tint
    inv["vertexColorHarvested"] = harvested_tint
    assert harvested_tint >= direct_tint > 0, (
        f"harvested {harvested_tint} JASS vertex-colour params but {direct_tint} calls "
        "target GetLastCreatedUnit() outright — the tint harvest regressed."
    )

    result = {
        "schema": "w3x-model-usage@1",
        "task": "L1 — model -> every reference point, with that point's own art parameters",
        "generatedBy": "python3 tools/w3x-import/build_model_usage.py",
        "sources": {
            "objectData": ["war3map.w3a", "war3map.w3h", "war3map.w3u"],
            "script": "war3map.j",
            "strings": "war3map.wts",
            "stock": stock_prov,
            "stockTables": {
                "abilityAndBuffArt": "Units\\<Race>AbilityFunc.txt",
                "unitModel": "Units\\UnitUI.slk (`file`, extension-less)",
                "unitMissileAndSpecialArt": "Units\\<Race>UnitFunc.txt",
                "notUsed": (
                    "Units\\AbilityData.slk — MEASURED: it contains no Casterart / "
                    "Targetart / Missileart / EffectSound column at all"
                ),
            },
        },
        "counting": {
            "referencePoint": "one place in the map that names one model file",
            "levelDedup": (
                "a w3a art cell repeated across ability levels with the SAME value is "
                "ONE reference (`levels` lists the levels); a different value per level "
                "is a different reference"
            ),
            "clearedCells": (
                "an art cell present but EMPTY is a deliberate erase: counted as a clear, "
                "and it BLOCKS stock inheritance for that channel"
            ),
            "extensionOptional": "a model path need not end in .mdl/.mdx",
            "lightningExcluded": "Lightning.slk ids carry no model and are not counted",
        },
        "totals": {
            "distinctModels": len(out_models),
            "referencePoints": total_refs,
            "byProvenance": dict(sorted(by_prov.items())),
            "byChannel": dict(sorted(by_chan.items())),
            "clearedCells": counters["clearedCells"],
            "clearedByChannel": {k.split(":", 1)[1]: v for k, v in sorted(counters.items())
                                 if k.startswith("cleared:")},
            "priorityModelsFound": len(PRIORITY_STEMS) - len(missing_priority),
            "priorityModelsTotal": len(PRIORITY_STEMS),
            "priorityModelsMissing": missing_priority,
            "priorityReferencePoints": sum(
                out_models[s]["refCount"] for s in PRIORITY_STEMS if s in out_models
            ),
            "jass": jass_stats,
        },
        "invariants": inv,
        "families": families,
        "models": out_models,
    }

    os.makedirs(OUTDIR, exist_ok=True)
    with open(os.path.join(OUTDIR, "MODEL_USAGE.json"), "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1, sort_keys=False)
        fh.write("\n")

    write_markdown(result)

    print(f"distinct models {len(out_models)}   reference points {total_refs}")
    print("by provenance:", dict(sorted(by_prov.items())))
    print(f"cleared cells (blocked inheritance): {counters['clearedCells']}")
    print(f"priority models found {len(PRIORITY_STEMS) - len(missing_priority)}/{len(PRIORITY_STEMS)}"
          f"  missing {missing_priority}")
    return 0


def spread(values: list[float]) -> dict | None:
    if not values:
        return None
    uniq = sorted(set(values))
    return {"n": len(values), "distinct": len(uniq), "min": uniq[0], "max": uniq[-1],
            "values": uniq[:24]}


# --------------------------------------------------------------------------
# JASS
# --------------------------------------------------------------------------

FUNC_RE = re.compile(r"^\s*function\s+([A-Za-z0-9_]+)\b")
ENDFUNC_RE = re.compile(r"^\s*endfunction\b")
MODEL_RE = re.compile(r'"((?:[^"\\]|\\.)*?\.(?:mdl|mdx|MDL|MDX))"')
CALL_RE = re.compile(r"\b(AddSpecialEffect[A-Za-z]*)\s*\(")
ATTACH_RE = re.compile(r'AddSpecialEffectTargetUnitBJ\s*\(\s*"([^"]*)"')
SPAWN_RE = re.compile(r"\bCreateNUnits?AtLoc[A-Za-z]*\s*\(\s*([^,]+?)\s*,\s*'([^']{4})'")
UNITREF = r"(?:GetLastCreatedUnit\(\)|%s)"
SCALE_RE = r"\bSetUnitScalePercent\s*\(\s*%s\s*,\s*\(?\s*([0-9.]+)"
TIMESCALE_RE = r"\bSetUnitTimeScalePercent\s*\(\s*%s\s*,\s*\(?\s*([0-9.]+)"
FLY_RE = r"\bSetUnitFlyHeight(?:BJ)?\s*\(\s*%s\s*,\s*\(?\s*([0-9.\-]+)"
VERTEX_RE = (r"\bSetUnitVertexColou?r(?:BJ)?\s*\(\s*%s\s*,\s*"
             r"([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?")
ALIAS_RE = re.compile(r"^\s*set\s+(udg_[A-Za-z0-9_]+)(?:\[[^\]]*\])?\s*=\s*GetLastCreatedUnit\(\)")
SPELLID_RE = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([^']{4})'")
RAWCODE_RE = re.compile(r"'([A-Za-z0-9]{4})'")
TRIG_FUNC_RE = re.compile(r"^Trig_(.+?)_(?:Actions|Conditions|Func\w*)$")


def scan_jass(text: str, ability_names: dict, ability_base: dict, unit_params: dict,
              unit_names: dict, unit_model: dict) -> tuple[list[dict], dict]:
    """Every model literal in war3map.j, attributed to a function / trigger / ability.

    Two passes. The first learns which trigger gates on which ability rawcode
    (`GetSpellAbilityId() == 'A0D5'` inside any `Trig_<Name>_*` function), so
    the second can name the ability behind a spawn call that mentions no id.

    A `CreateNUnitsAtLoc(n, 'h008', …)` is ALSO a reference — to whatever model
    that unit wears — and the `SetUnitScalePercent` / `SetUnitVertexColorBJ` /
    `SetUnitTimeScalePercent` / `SetUnitFlyHeight` that follow it in the same
    function are the per-invocation parameters for THAT reference. A spawn's
    parameter block runs until the next spawn or the end of the function.
    """
    lines = text.splitlines()

    trigger_abilities: dict[str, set[str]] = defaultdict(set)
    trigger_mentions: dict[str, set[str]] = defaultdict(set)
    known_abilities = set(ability_names) | set(ability_base)
    cur_func = None
    for line in lines:
        m = FUNC_RE.match(line)
        if m:
            cur_func = m.group(1)
        elif ENDFUNC_RE.match(line):
            cur_func = None
        if not cur_func:
            continue
        tm = TRIG_FUNC_RE.match(cur_func)
        key = tm.group(1) if tm else cur_func
        # CONFIRMED: the trigger gates on this ability id
        for rc in SPELLID_RE.findall(line):
            trigger_abilities[key].add(rc)
        # WEAK: the trigger merely names an ability rawcode somewhere
        for rc in RAWCODE_RE.findall(line):
            if rc in known_abilities:
                trigger_mentions[key].add(rc)

    sites: list[dict] = []
    stats = Counter()
    cur_func = None
    last_unit: dict | None = None
    aliases: set[str] = set()

    def flush(pending):
        if pending is None:
            return
        stats["spawnCalls"] += 1
        made = _spawn_sites(pending, unit_params, unit_names, unit_model)
        if made:
            sites.extend(made)
        else:
            stats["spawnWithNoResolvableModel"] += 1

    for idx, line in enumerate(lines, start=1):
        m = FUNC_RE.match(line)
        if m:
            flush(last_unit)
            cur_func = m.group(1)
            last_unit = None
            continue
        if ENDFUNC_RE.match(line):
            flush(last_unit)
            cur_func = None
            last_unit = None
            continue

        tm = TRIG_FUNC_RE.match(cur_func) if cur_func else None
        trigger = tm.group(1) if tm else None
        key = trigger or cur_func or ""
        abilities = sorted(trigger_abilities.get(key, ()))
        weak = sorted(set(trigger_mentions.get(key, ())) - set(abilities))

        # --- a dummy-unit spawn: the unit's own umdl is the model, and the
        # --- SetUnit* calls that follow are that invocation's parameters.
        sm = SPAWN_RE.search(line)
        if sm:
            flush(last_unit)
            count = sm.group(1).strip()
            last_unit = {
                "count": int(count) if count.isdigit() else None,
                "countExpr": None if count.isdigit() else count,
                "unitId": sm.group(2),
                "line": idx,
                "function": cur_func,
                "trigger": trigger,
                "abilityIds": abilities,
                "abilityIdsWeak": weak,
                "params": {},
            }
            aliases = set()
            continue
        if last_unit is not None:
            # `set udg_X = GetLastCreatedUnit()` makes udg_X another name for the
            # unit just spawned — 14 of the map's 35 SetUnitScalePercent calls
            # target such a global, and a GetLastCreatedUnit()-only rule loses
            # every one of them.
            am = ALIAS_RE.match(line)
            if am:
                aliases.add(re.escape(am.group(1)))
            ref = UNITREF % ("|".join(sorted(aliases)) if aliases else r"(?!)")
            v = re.search(SCALE_RE % ref, line)
            if v:
                last_unit["params"]["scalePercent"] = float(v.group(1))
            v = re.search(TIMESCALE_RE % ref, line)
            if v:
                last_unit["params"]["timeScalePercent"] = float(v.group(1))
            v = re.search(FLY_RE % ref, line)
            if v:
                last_unit["params"]["flyHeight"] = float(v.group(1))
            v = re.search(VERTEX_RE % ref, line)
            if v:
                last_unit["params"]["vertexColorPercent"] = [float(v.group(i)) for i in (1, 2, 3)]
                if v.group(4) is not None:
                    last_unit["params"]["alphaPercent"] = float(v.group(4))

        for raw in MODEL_RE.findall(line):
            path = raw.replace("\\\\", "\\")
            call = None
            cm = CALL_RE.search(line)
            if cm:
                call = cm.group(1)
            attach = None
            am = ATTACH_RE.search(line)
            if am:
                attach = am.group(1)
            sites.append(
                {
                    "path": path,
                    "stem": stem_of(path),
                    "form": form_of(path),
                    "channel": f"jass.{call or 'literal'}",
                    "provenance": "jass-literal",
                    "objectKind": "trigger",
                    "objectId": ",".join(abilities) or None,
                    "objectName": " / ".join(
                        ability_names.get(a, a) for a in abilities) or None,
                    "line": idx,
                    "function": cur_func,
                    "trigger": trigger,
                    "abilityIds": abilities,
                    "abilityIdsWeak": weak,
                    "attribution": ("gated-on-GetSpellAbilityId" if abilities
                                    else ("names-the-rawcode" if weak else "none")),
                    "layer": 0,
                    "anchor": attach,
                }
            )

    flush(last_unit)
    return sites, dict(sorted(stats.items()))


def _spawn_sites(spawn, unit_params, unit_names, unit_model) -> list[dict]:
    uid = spawn["unitId"]
    resolved = unit_model.get(uid)
    if resolved is None:
        # a spawn of a unit the w3u never defines and UnitUI.slk has no row for
        return []
    stem, path = resolved
    params = dict(unit_params.get(uid) or {})
    params.update(spawn["params"])
    # a percent is relative to the unit's own w3u scale; record both
    if "scalePercent" in params and isinstance(params.get("scale"), (int, float)):
        params["effectiveScale"] = round(params["scale"] * params["scalePercent"] / 100.0, 4)
    return [
        {
            "path": path,
            "stem": stem,
            "form": form_of(path),
            "channel": "jass.unitSpawn",
            "provenance": "jass-spawn",
            "objectKind": "unit",
            "objectId": uid,
            "objectName": unit_names.get(uid),
            "line": spawn["line"],
            "function": spawn["function"],
            "trigger": spawn["trigger"],
            "abilityIds": spawn["abilityIds"],
            "abilityIdsWeak": spawn["abilityIdsWeak"],
            "attribution": ("gated-on-GetSpellAbilityId" if spawn["abilityIds"]
                            else ("names-the-rawcode" if spawn["abilityIdsWeak"] else "none")),
            "spawnCount": spawn["count"],
            "layer": 0,
            "anchor": None,
            "params": params,
        }
    ]


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------


def write_markdown(result: dict) -> None:
    t = result["totals"]
    L: list[str] = []
    L.append("# MODEL_USAGE — 模型 → 引用點反向索引\n")
    L.append(f"`{result['generatedBy']}`\n")
    L.append(f"**{t['distinctModels']} 種模型 / {t['referencePoints']} 個引用點**"
             f"（其中 {t['clearedCells']} 個被作者清空的欄位不算引用，也**擋掉**繼承）\n")
    L.append("## 依來源\n")
    L.append("| provenance | 引用點 |")
    L.append("| --- | ---: |")
    for k, v in result["totals"]["byProvenance"].items():
        L.append(f"| `{k}` | {v} |")
    L.append("\n## 依欄位\n")
    L.append("| channel | 引用點 |")
    L.append("| --- | ---: |")
    for k, v in result["totals"]["byChannel"].items():
        L.append(f"| `{k}` | {v} |")

    L.append(f"\n## owner 指定的 21 個家族（{t['priorityModelsFound']}/{t['priorityModelsTotal']} 個模型有引用）\n")
    for fam in sorted(result["families"], key=lambda f: -f["refCount"]):
        L.append(f"### {fam['label']} `{fam['id']}` — {fam['refCount']} 個引用點\n")
        L.append("| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |")
        L.append("| --- | ---: | --- | ---: | --- |")
        for mem in fam["models"]:
            if not mem["found"]:
                L.append(f"| `{mem['stem']}` | **0 — 找不到** | | | |")
                continue
            sc = mem["scale"]
            sc_txt = (f"{sc['distinct']} 種 {sc['min']}–{sc['max']}" if sc else "—")
            ef = mem.get("effectiveScale")
            if ef:
                sc_txt += f" · 實效 {ef['distinct']} 種 {ef['min']}–{ef['max']}"
            anchors = ", ".join(f"{k}×{v}" for k, v in mem["anchors"].items()) or "—"
            L.append(f"| `{mem['stem']}` | {mem['refCount']} | {sc_txt} | {mem['tintVariants']} | {anchors} |")
        L.append("")

    L.append("## 引用最多的 40 個模型\n")
    L.append("| 模型 | 家族 | 來源 | 引用點 | scale 種數 | tint 種數 |")
    L.append("| --- | --- | --- | ---: | ---: | ---: |")
    ranked = sorted(result["models"].values(), key=lambda m: (-m["refCount"], m["stem"]))
    for m in ranked[:40]:
        sc = m["params"]["scale"]
        L.append(
            f"| `{m['stem']}` | {m['family'] or '—'} | {m['form']} | {m['refCount']} | "
            f"{sc['distinct'] if sc else 0} | {len(m['params']['tint'])} |"
        )

    with open(os.path.join(OUTDIR, "MODEL_USAGE.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""build_ability_w3a.py — the w3a OBJECT-DATA half of "JASS → 編輯器 JSON".

    python3 tools/w3x-import/build_ability_w3a.py            # build
    python3 tools/w3x-import/build_ability_w3a.py --check    # byte-compare, exit 1 if stale
    python3 tools/w3x-import/build_ability_w3a.py --refresh-meta   # re-read the MPQs

  -> tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json   (the product)
  -> tools/w3x-import/out/stock/ABILITY_METADATA.json   (MPQ-derived cache, --refresh-meta)

WHY THIS EXISTS  (owner 2026-08-26)
-----------------------------------
> 「你應該做的事情是 翻譯 JASS to 編輯器JSON，如果 JSON 沒支援的標籤或邏輯則去實作才對阿」
> 「這個的做法還會缺一個部分就是 w3x 原始技能的設定特效與機制包含傷害方式，也請一起考慮翻譯進去」

The翻譯 source is TWO layers.  `extract_jass_spells.py` owns layer ① (the
trigger script: timing, spawns, cleanup).  This file owns layer ② — the w3a
object data, which is where the BASE MECHANIC (`base`), the 傷害方式, the art
slots and the 特效音效 actually live.  Nothing in the repo carried layer ② into
a translatable shape before this script:

  · `OBJECTS.json` names 21 typed fields and drops the rest into `rawMods` …
    except the CHECKED-IN copy predates `rawMods` (generator commit 3e9634e8,
    2026-07-31; file mtime 2026-07-21) so it carries ZERO of them.  Every art
    code, `acas` (cast time), `aefs` (effect sound) and 416 other field codes
    are absent from the file every downstream reader actually opens.
  · `VFX_BINDINGS.json` does read the art codes, but only to answer "which
    MODEL" — it drops cooldown/mana/data columns, i.e. the mechanic.
  · `data` columns were emitted as bare integers (`"3": {"1": 200.0}`) with no
    statement of what column 3 MEANS.  The semantics are per-BASE-ability
    (`AOsh` col 3 = 距離; `AHtb` col 1 = 傷害), so an integer alone is unreadable.

DERIVED, NEVER HAND-WRITTEN
---------------------------
The field contract and the data-column semantics come from Blizzard's own
`Units\\AbilityMetaData.slk` (`useSpecific` + `data` + `displayName` resolved
through `UI\\WorldEditStrings.txt`).  A hand-written "col 3 means 距離" table is
a flag defended by prose: it outlives its expiry date and nothing goes red.

THE ARCHIVES ARE NOT IN VERSION CONTROL (`.gitignore`: `*.mpq`), which is why
the metadata CACHE is.  Same contract as `stock_ability_data.py`: a missing
archive is a hard error and NOTHING is written — a silently-empty metadata
table would make every data column unreadable again, but with a green pipeline.

WHAT THIS FILE DOES **NOT** DO
------------------------------
⛔ It does not touch a single shipped number.  owner's standing ruling is
「公式已定好，只要公式本身自洽，我們只調系統倍率」.  The job here is to make
the gap VISIBLE (`ggd.scalingAxis.verdict`), not to adjudicate it.
⛔ It applies no WC3→GGD distance factor.  The repo carries three competing
ones (1/36, 11/600, 1/85); `raw` is the only unambiguous field.  The candidates
are recorded in `unitContract` so the consumer converts deliberately.

READ-ONLY except for its own two outputs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from w3xlib.objdata import _data_col_of, parse_object_file  # noqa: E402

SCHEMA = "ggd-w3a-extract@1"
RAW_W3A = os.path.join(HERE, "out", "GoDieEX22s-src", "raw", "war3map.w3a")
OBJECTS = os.path.join(HERE, "out", "GoDieEX22s-src", "OBJECTS.json")
META_CACHE = os.path.join(HERE, "out", "stock", "ABILITY_METADATA.json")
OUT = os.path.join(HERE, "out", "GoDieEX22s", "ABILITY_W3A.json")
CONTENT_ABILITIES = os.path.join(REPO, "content", "abilities")

ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
META_TABLE = "Units\\AbilityMetaData.slk"
WESTRINGS = "UI\\WorldEditStrings.txt"


# ---------------------------------------------------------------------------
# ① metadata cache — Blizzard's field dictionary, pulled out of the MPQs once
# ---------------------------------------------------------------------------
def refresh_meta() -> dict:
    """Re-read AbilityMetaData.slk + WorldEditStrings from the retail archives.

    NEVER writes a partial/empty file: a missing archive exits non-zero.
    """
    from w3xlib.mpq import W3XArchive  # local import: only this path needs it
    from stock_unit_data import parse_slk

    rows: dict[str, dict] = {}
    strings: dict[str, str] = {}
    read: list[str] = []
    for name in ARCHIVES:
        path = os.path.join(REPO, name)
        if not os.path.exists(path):
            continue
        arc = W3XArchive(path)
        blob = arc.read_file(META_TABLE)
        if blob:
            rows.update(parse_slk(blob))
            read.append(f"{name}:{META_TABLE}")
        txt = arc.read_file(WESTRINGS)
        if txt:
            if isinstance(txt, bytes):
                txt = txt.decode("utf-8", errors="replace")
            strings.update(
                {k: v.strip() for k, v in re.findall(r"^(WESTRING_[A-Z0-9_]+)=(.*)", txt, re.M)}
            )
            read.append(f"{name}:{WESTRINGS}")
    if not rows or not strings:
        sys.exit(
            "FATAL: could not read %s / %s from any of %s in %s.\n"
            "The retail MPQs are gitignored; run this on a machine that has them.\n"
            "NOTHING was written (an empty metadata table would make every data\n"
            "column unreadable again, but with a green pipeline)."
            % (META_TABLE, WESTRINGS, ARCHIVES, REPO)
        )

    fields: dict[str, dict] = {}
    data_cols: dict[str, list] = defaultdict(list)
    for code, r in rows.items():
        name = strings.get(r.get("displayName") or "", r.get("displayName"))
        rec = {
            "field": r.get("field"),
            "name": name,
            "type": r.get("type"),
            "category": r.get("category"),
        }
        fields[code] = rec
        col = r.get("data")
        if col not in ("0", "", None):
            for base in (r.get("useSpecific") or "").split(","):
                base = base.strip()
                if base:
                    data_cols[base].append(
                        {"col": int(col), "code": code, "name": name, "type": r.get("type")}
                    )
    for base in data_cols:
        data_cols[base].sort(key=lambda d: d["col"])

    doc = {
        "schema": "ggd-w3a-metadata@1",
        "generatedBy": "tools/w3x-import/build_ability_w3a.py --refresh-meta",
        "filesRead": sorted(set(read)),
        "note": (
            "Blizzard's own field dictionary. `fields` = every w3a 4-char code -> "
            "its editor name/type. `dataColumns` = per BASE ability, what DataA..I "
            "mean (AOsh col1=傷害, col3=距離; AHtb col1=傷害). DERIVED from "
            "AbilityMetaData.slk `useSpecific`+`data`, never hand-written."
        ),
        "fields": dict(sorted(fields.items())),
        "dataColumns": dict(sorted(data_cols.items())),
    }
    os.makedirs(os.path.dirname(META_CACHE), exist_ok=True)
    _write(META_CACHE, doc)
    return doc


def load_meta(allow_refresh: bool = True) -> dict:
    if os.path.exists(META_CACHE):
        with open(META_CACHE, encoding="utf-8") as fh:
            return json.load(fh)
    if not allow_refresh:
        sys.exit(f"FATAL: {META_CACHE} missing. Run with --refresh-meta on a machine with the MPQs.")
    return refresh_meta()


# ---------------------------------------------------------------------------
# ② tooltip normalisation + 傷害方式 parser
# ---------------------------------------------------------------------------
_COLOUR = re.compile(r"\|c[0-9a-fA-F]{8}", re.I)
_RESET = re.compile(r"\|[rR]")
_DIALOGUE = re.compile(r"「[^」]*」")
_NUM = r"[0-9]+(?:\.[0-9]+)?"

# 第〇·六守則細則②:「」裡面是角色對白,不是效果。剝掉整段(含跨行、含行中),
# ⛔ 不是「行首是「的那幾行」—— 後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。
# 剝之前先數:一段帶數字的引言被剝掉是**可能的資訊損失**,所以它要被記下來
# (`dialogueWithDigits`),⛔ 不是靜默丟掉。


def clean_tip(s: str) -> str:
    """Strip WC3 colour codes and line escapes. Nothing else."""
    if not s:
        return ""
    s = _COLOUR.sub("", s)
    s = _RESET.sub("", s)
    return s.replace("|n", "\n").replace("|N", "\n")


# 「這個字接在 * 前面」-> GGD 的哪一條軸。longest-first,所以 '生命上限' 贏過 '生命'。
# `kind`: "stat"  -> Scaling.ratios[{stat,coeff}]      (sim/stats/statTypes.ts 的詞彙)
#         "attr"  -> Scaling.attrRatios[{attr,coeff}]  (力/敏/智)
#         "unsupported" -> 翻不過去的軸,要 owner 決定或去實作(⛔ 不要拿現有參數湊)
STAT_WORDS: list[tuple[str, str, str]] = [
    ("生命上限", "stat", "maxHealth"),
    ("最大生命", "stat", "maxHealth"),
    ("血量上限", "stat", "maxHealth"),
    ("損失的血量", "unsupported", "missingHealth"),
    ("失的血量", "unsupported", "missingHealth"),
    ("現有金錢", "unsupported", "gold"),
    ("英雄等級", "unsupported", "heroLevel"),
    ("技能等級", "unsupported", "abilityRank"),
    ("攻擊力", "stat", "ad"),
    ("魔力", "stat", "maxMana"),
    ("法力", "stat", "maxMana"),
    ("力量", "attr", "str"),
    ("敏捷", "attr", "agi"),
    ("智慧", "attr", "int"),
    ("智力", "attr", "int"),
    ("護甲", "stat", "armor"),
    ("血量", "stat", "maxHealth"),
    ("生命", "stat", "maxHealth"),
    ("等級", "unsupported", "heroLevel"),
]
_STAT_ALT = "|".join(re.escape(w) for w, _, _ in STAT_WORDS)
_MUL = re.compile(rf"({_STAT_ALT})\s*[\*xX×]\s*({_NUM})")
# 「造成/受到/附加 … N 點 … 傷害」。⚠️ 動詞是必要的:少了它,「承受額外10%傷害」
# 與「攻擊速度提昇50%」這種**修正值**會被讀成傷害量。`%` 也直接排除。
_PLAIN_DMG = re.compile(
    rf"(?:造成|受到|承受|附加|加上|共)[^。]{{0,18}}?(?<![0-9.])({_NUM})\s*(?:點)?(?![%％])[^0-9\n%％]{{0,4}}?傷害"
)
# 一段沒被解開的算式(「200+75*9點傷害」)。抓到就降信心,⛔ 不是假裝讀懂了。
_ARITH = re.compile(r"[0-9]\s*[+\*×x]\s*[0-9]")
# WC3 內建的欄位參照(`<hrtt,mindmg2>`)—— 值在 unit 表裡,不在文案裡。
_UNITREF = re.compile(r"<[A-Za-z0-9]{4},[A-Za-z0-9_]+>")
_PER_SEC = re.compile(r"每\s*([0-9.]*)\s*秒")
# 「傷害444」—— 數字寫在 傷害 後面的少數寫法。放在主樣式之後當備援。
_TRAILING_DMG = re.compile(rf"傷害\s*(?<![0-9.])({_NUM})(?![%％])")


def parse_damage(tips: dict[str, str]) -> dict | None:
    """傷害方式 out of the ubertip, per level. Honest `null` when unreadable.

    Returns {stat|attr, id, coeff, flat[], raw[], confidence, ...} or None.
    """
    levels = sorted(tips, key=lambda x: int(x))
    if not levels:
        return None
    hits: list[dict | None] = []
    dialogue_digits = 0
    notes: set[str] = set()
    for lv in levels:
        text = clean_tip(tips[lv])
        for span in _DIALOGUE.findall(text):
            if re.search(r"[0-9]", span):
                dialogue_digits += 1
        text = _DIALOGUE.sub("", text)  # 對白不是效果
        if _UNITREF.search(text):
            notes.add("unitStatReference")
        if _PER_SEC.search(text) and "傷害" in text:
            notes.add("perSecondCadence")
        m = _MUL.search(text)
        if m:
            word, coeff = m.group(1), float(m.group(2))
            kind, ident = next((k, i) for w, k, i in STAT_WORDS if w == word)
            # `+flat` immediately after, or `flat+` immediately before.
            tail = re.match(rf"\s*\+\s*({_NUM})", text[m.end():])
            head = re.search(rf"({_NUM})\s*\+\s*$", text[: m.start()])
            flat = float(tail.group(1)) if tail else (float(head.group(1)) if head else 0.0)
            span = (m.start(), (m.end() + tail.end()) if tail else m.end())
            if head:
                span = (m.start() - len(head.group(0)), span[1])
            # ⚠️ arithmetic INSIDE the formula we just read is not "unparsed" —
            # only a leftover expression elsewhere degrades the reading.
            if _ARITH.search(text[: span[0]] + " " + text[span[1]:]):
                notes.add("arithmeticExpression")
            hits.append(
                {"kind": kind, "id": ident, "coeff": coeff, "flat": flat, "raw": m.group(0)}
            )
            continue
        p = _PLAIN_DMG.search(text) or _TRAILING_DMG.search(text)
        if not p:
            hits.append(None)
            continue
        residual = text[: p.start()] + " " + text[p.end():]
        broken = bool(_ARITH.search(p.group(0)) or _ARITH.search(residual))
        if broken:
            notes.add("arithmeticExpression")
        # ⭐ 一個沒被解開的算式(「200+75*9點傷害」= 875)給出的單一數字是**謊話** ——
        # 誠實標 null 並留下原文,⛔ 不要送出 9。
        hits.append(
            {
                "kind": "flat",
                "id": None,
                "coeff": 0.0,
                "flat": None if broken else float(p.group(1)),
                "raw": p.group(0),
            }
        )
    real = [h for h in hits if h]
    if not real:
        return None
    kinds = {h["kind"] for h in real}
    ids = {h["id"] for h in real}
    coeffs = {h["coeff"] for h in real}
    scaled = [h for h in real if h["kind"] != "flat"]
    out = {
        "kind": scaled[0]["kind"] if scaled else "flat",
        "id": scaled[0]["id"] if scaled else None,
        "coeff": scaled[0]["coeff"] if scaled else 0.0,
        "flat": [h["flat"] if h else None for h in hits],
        "raw": [h["raw"] if h else None for h in hits],
        "levelsParsed": len(real),
        "levelsTotal": len(levels),
    }
    if dialogue_digits:
        # ⚠️ fail-loud, ⛔ not silent: a 「…」 span carrying digits was removed
        # before parsing. A03K-style tooltips put the WHOLE mechanic in quotes.
        out["dialogueWithDigits"] = dialogue_digits
    if notes:
        out["notes"] = sorted(notes)
    if len(kinds) > 1 or len(ids) > 1 or len(coeffs) > 1:
        out["inconsistentAcrossLevels"] = True
    degraded = "arithmeticExpression" in notes or "unitStatReference" in notes
    if out.get("inconsistentAcrossLevels") or degraded or len(real) != len(levels):
        out["confidence"] = "low"
    elif out["kind"] == "flat":
        out["confidence"] = "medium"  # a number, but no stated axis
    else:
        out["confidence"] = "high"
    if out["kind"] == "unsupported":
        out["needsEngineWork"] = (
            "軸不在 GGD 的 Stat 詞彙裡 —— owner: 「JSON 沒支援的標籤或邏輯則去實作」"
        )
    return out


# ---------------------------------------------------------------------------
# ③ GGD bridge — join on the w3x display-name prefix "NN-SS"
# ---------------------------------------------------------------------------
_NNSS = re.compile(r"^(\d{2,3})-(\d{2,3})")


def nnss(name: str | None) -> str | None:
    m = _NNSS.match((name or "").strip())
    return f"{m.group(1)}-{m.group(2)}" if m else None


def collect_scaling(node, out: list) -> None:
    """Every Scaling axis anywhere in a GGD ability doc (recursive)."""
    if isinstance(node, dict):
        for r in node.get("ratios") or []:
            if isinstance(r, dict) and "stat" in r:
                out.append({"kind": "stat", "id": r["stat"], "coeff": r.get("coeff")})
        for r in node.get("attrRatios") or []:
            if isinstance(r, dict) and "attr" in r:
                out.append({"kind": "attr", "id": r["attr"], "coeff": r.get("coeff")})
        for v in node.values():
            collect_scaling(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_scaling(v, out)


def load_ggd() -> dict[str, list[dict]]:
    by_key: dict[str, list[dict]] = defaultdict(list)
    if not os.path.isdir(CONTENT_ABILITIES):
        return by_key
    for fn in sorted(os.listdir(CONTENT_ABILITIES)):
        if not fn.endswith(".json") or fn == "_index.json":
            continue
        with open(os.path.join(CONTENT_ABILITIES, fn), encoding="utf-8") as fh:
            doc = json.load(fh)
        key = nnss(doc.get("name"))
        if not key:
            continue
        axes: list[dict] = []
        collect_scaling(doc.get("effects"), axes)
        collect_scaling(doc.get("passive"), axes)
        seen, uniq = set(), []
        for a in axes:
            sig = (a["kind"], a["id"])
            if sig not in seen:
                seen.add(sig)
                uniq.append(a)
        by_key[key].append(
            {
                "abilityId": doc.get("id"),
                "name": doc.get("name"),
                "cooldown": doc.get("cooldown"),
                "manaCost": doc.get("manaCost"),
                "range": doc.get("range"),
                "maxRank": doc.get("maxRank"),
                "castTimeSec": doc.get("castTimeSec"),
                "scalingAxes": uniq,
            }
        )
    return by_key


def verdict(w3x: dict | None, ggd: dict) -> dict:
    """⭐ 讓落差看得見 —— ⛔ 不是替 owner 裁決。無論結論是什麼,一個數字都不動。"""
    axes = ggd["scalingAxes"]
    if not w3x:
        return {"verdict": "w3x-unreadable", "w3x": None, "ggd": axes}
    src = {"kind": w3x["kind"], "id": w3x["id"], "coeff": w3x["coeff"]}
    if w3x["kind"] == "flat":
        return {"verdict": "w3x-flat-only", "w3x": src, "ggd": axes}
    if not axes:
        return {"verdict": "ggd-has-no-axis", "w3x": src, "ggd": axes}
    if any(a["kind"] == w3x["kind"] and a["id"] == w3x["id"] for a in axes):
        return {"verdict": "match", "w3x": src, "ggd": axes}
    return {"verdict": "axis-mismatch", "w3x": src, "ggd": axes}


# ---------------------------------------------------------------------------
# ④ build
# ---------------------------------------------------------------------------
def _lv(entry, code):
    return {str(l): v for l, v in sorted(entry.levels(code).items()) if v not in (None, "")}


def build(meta: dict) -> dict:
    with open(OBJECTS, encoding="utf-8") as fh:
        objects = json.load(fh)
    resolved = objects["abilities"]  # TRIGSTR-resolved names/tooltips live here
    with open(RAW_W3A, "rb") as fh:
        w3a = parse_object_file(fh.read(), True)

    fields = meta["fields"]
    datacols = meta["dataColumns"]
    ggd_by_key = load_ggd()

    art_codes = [c for c, r in fields.items() if r.get("category") == "art"]
    model_slots = {
        c: r["field"] for c, r in fields.items() if r.get("type") in ("modelList", "lightningList")
    }
    sound_slots = {c: r["field"] for c, r in fields.items() if r.get("category") == "sound"}
    attach_slots = {
        c: r["field"]
        for c, r in fields.items()
        if r.get("type") == "stringList" and "attach" in (r.get("field") or "").lower()
    }

    abilities: dict[str, dict] = {}
    stats = Counter()
    unsupported_axes = Counter()
    mismatches: list[dict] = []
    unknown_codes = Counter()

    for table in ("original", "custom"):
        for e in w3a[table]:
            oid = e.obj_id
            src = resolved.get(oid, {})
            base = e.base_id
            rec: dict = {
                "id": oid,
                "base": base,
                "table": table,
                "name": src.get("name"),
                "editorSuffix": src.get("editor_suffix"),
                "levels": src.get("levels"),
                "icon": src.get("icon"),
            }
            # ---- typed stat fields (raw WC3 units / seconds, unconverted) ----
            rec["stats"] = {
                key: src.get(key) or _lv(e, code)
                for key, code in (
                    ("cooldown", "acdn"),
                    ("mana", "amcs"),
                    ("cast_range", "aran"),
                    ("area", "aare"),
                    ("duration", "adur"),
                    ("hero_duration", "ahdu"),
                    ("targets_allowed", "atar"),
                    ("buffs", "abuf"),
                )
            }
            cast = _lv(e, "acas")
            if cast:
                rec["stats"]["castTime"] = cast  # ⚠️ absent from OBJECTS.json entirely

            # ---- data columns, WITH the semantics of this ability's base ----
            # ⭐ The column index alone is unreadable ("col 3 = 200.0" means what?).
            # The MOD CARRIES ITS OWN FIELD CODE (`Osh3`), so read the semantics off
            # that first — `useSpecific` only lists a base for SOME columns (Aegr
            # authors cols 1–5 while the dictionary only claims 6–8 for it), and a
            # base-keyed lookup silently loses those.
            cols: dict[int, dict] = {}
            for m in e.mods:
                col = _data_col_of(m, numeric_only=True)
                if col is None:
                    continue
                c = cols.setdefault(col, {"code": m.code, "values": {}})
                c["values"][str(m.level)] = m.value
            sem = {d["col"]: d for d in datacols.get(base, [])}
            rec["data"] = {}
            for col in sorted(set(cols) | set(sem)):
                got = cols.get(col)
                code = (got or {}).get("code") or (sem.get(col) or {}).get("code")
                info = fields.get(code or "", {})
                name = info.get("name") or (sem.get(col) or {}).get("name")
                rec["data"][str(col)] = {
                    "field": code,
                    "name": name,
                    "type": info.get("type") or (sem.get(col) or {}).get("type"),
                    "values": dict(sorted((got or {}).get("values", {}).items())),
                    "authored": col in cols,
                    "inheritedSemantics": got is None,
                }
                if got is not None and not name:
                    stats["data_col_without_semantics"] += 1

            # ---- art / sound / attach: the layer OBJECTS.json drops entirely ----
            art: dict[str, dict] = {}
            for m in e.mods:
                if m.code in model_slots:
                    art.setdefault("models", {}).setdefault(model_slots[m.code], {})[
                        str(m.level)
                    ] = m.value
                elif m.code in sound_slots:
                    art.setdefault("sounds", {}).setdefault(sound_slots[m.code], {})[
                        str(m.level)
                    ] = m.value
                elif m.code in attach_slots:
                    art.setdefault("attach", {}).setdefault(attach_slots[m.code], {})[
                        str(m.level)
                    ] = m.value
                elif m.code not in fields:
                    unknown_codes[m.code] += 1
            if art:
                rec["art"] = art
                stats["with_art"] += 1

            # ---- 傷害方式 ----
            dmg = parse_damage(src.get("ubertip") or {})
            rec["damage"] = dmg
            if dmg:
                stats[f"damage_{dmg['confidence']}"] += 1
                if dmg["kind"] == "unsupported":
                    unsupported_axes[dmg["id"]] += 1
            elif src.get("ubertip"):
                stats["damage_unparsed_with_ubertip"] += 1

            # ---- GGD bridge ----
            key = nnss(src.get("name"))
            if key and key in ggd_by_key:
                cands = ggd_by_key[key]
                rec["ggd"] = {
                    "joinKey": key,
                    "candidates": [c["abilityId"] for c in cands],
                    "scalingAxis": verdict(dmg, cands[0]),
                    "shipped": {
                        k: cands[0][k]
                        for k in ("abilityId", "cooldown", "manaCost", "range", "maxRank")
                    },
                }
                stats["joined_to_ggd"] += 1
                v = rec["ggd"]["scalingAxis"]["verdict"]
                stats[f"verdict_{v}"] += 1
                if v in ("axis-mismatch", "ggd-has-no-axis") and dmg and dmg[
                    "confidence"
                ] == "high":
                    mismatches.append(
                        {
                            "w3a": oid,
                            "name": src.get("name"),
                            "ggd": cands[0]["abilityId"],
                            "verdict": v,
                            "w3xAxis": rec["ggd"]["scalingAxis"]["w3x"],
                            "ggdAxes": rec["ggd"]["scalingAxis"]["ggd"],
                            "w3xFlat": dmg["flat"],
                        }
                    )
            abilities[oid] = rec
            stats["abilities"] += 1

    base_hist = Counter(r["base"] for r in abilities.values())

    return {
        "schema": SCHEMA,
        "generatedBy": "tools/w3x-import/build_ability_w3a.py",
        "generatedFrom": {
            "objectData": "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3a",
            "resolvedStrings": "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json",
            "fieldDictionary": "tools/w3x-import/out/stock/ABILITY_METADATA.json",
            "ggdContent": "content/abilities/*.json (READ ONLY)",
        },
        "purpose": (
            "翻譯來源的第②層:w3a 物件資料(base 機制 · 傷害方式 · 特效欄 · 音效欄 · "
            "Data 欄位)。第①層(JASS 觸發器)由 extract_jass_spells.py 擁有。"
        ),
        "unitContract": {
            "distance": (
                "RAW WC3 world units — NO conversion applied. The repo carries three "
                "competing WC3->GGD factors (1/36 mesh default, 11/600 the ability "
                "port's distance factor, 1/85 in gen_ex_content.py). Convert deliberately."
            ),
            "time": "seconds (cooldown/duration/castTime), WC3 native.",
            "mana": "flat points, WC3 native.",
        },
        "damageContract": {
            "source": "ubertip per level, colour codes + |n stripped, 「…」 removed (對白不是效果).",
            "kind": (
                "'stat' -> Scaling.ratios[{stat,coeff}] · 'attr' -> Scaling.attrRatios[{attr,coeff}] "
                "· 'flat' -> a number with no stated axis · 'unsupported' -> the axis has NO GGD "
                "vocabulary yet (owner: 「JSON 沒支援的標籤或邏輯則去實作」)"
            ),
            "confidence": "high = axis+coeff on every level, consistent · medium = flat only · low = partial/inconsistent",
            "null": "HONEST null — the tooltip states no damage this parser can read. ⛔ Not 0.",
            "notAdjudicated": (
                "⛔ This file changes no shipped number. owner standing ruling: "
                "「公式已定好,只要公式本身自洽,我們只調系統倍率」. `ggd.scalingAxis.verdict` "
                "makes the gap visible; the decision is owner's."
            ),
        },
        "joinContract": {
            "key": "the w3x display-name prefix NN-SS (hero 編號 - slot), shared by both sides",
            "ambiguity": "`candidates` lists every GGD ability sharing the key; [0] is the compared one",
        },
        "summary": {
            **{k: v for k, v in sorted(stats.items())},
            "artCodesInDictionary": len(art_codes),
            "modelSlotCodes": len(model_slots),
            "distinctBases": len(base_hist),
            "topBases": base_hist.most_common(12),
            "unsupportedDamageAxes": dict(unsupported_axes.most_common()),
            "fieldCodesNotInDictionary": dict(unknown_codes.most_common(20)),
        },
        "axisMismatches": sorted(mismatches, key=lambda m: m["w3a"]),
        "abilities": dict(sorted(abilities.items())),
    }


# ---------------------------------------------------------------------------
def _write(path: str, doc: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 產物隔離區:寫入點自解鎖(chmod 444 的產物要先開再寫,收工重鎖)。
    if os.path.exists(path):
        os.chmod(path, 0o644)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(_serialise(doc))
    os.chmod(path, 0o444)


def _serialise(doc: dict) -> str:
    # ⛔ NO generated-at timestamp. A clock field makes byte-comparison impossible,
    # which forces --check to be loosened, and a loosened gate is no gate.
    return json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="byte-compare the product; exit 1 if stale")
    ap.add_argument("--refresh-meta", action="store_true", help="re-read AbilityMetaData from the MPQs")
    args = ap.parse_args()

    if args.refresh_meta:
        meta = refresh_meta()
        print(f"metadata cache -> {META_CACHE} ({len(meta['fields'])} field codes, "
              f"{len(meta['dataColumns'])} bases with data columns)")
        if not args.check:
            return 0
    meta = load_meta(allow_refresh=not args.check)
    doc = build(meta)
    text = _serialise(doc)

    if args.check:
        if not os.path.exists(OUT):
            print(f"STALE: {OUT} does not exist. Run: python3 tools/w3x-import/build_ability_w3a.py")
            return 1
        with open(OUT, encoding="utf-8") as fh:
            on_disk = fh.read()
        if on_disk != text:
            print(f"STALE: {OUT} differs from a fresh build ({len(on_disk)} vs {len(text)} bytes).")
            print("Run: python3 tools/w3x-import/build_ability_w3a.py && git add tools/w3x-import/out/")
            return 1
        print(f"OK: {OUT} is current ({doc['summary']['abilities']} abilities).")
        return 0

    _write(OUT, doc)
    s = doc["summary"]
    print(f"{OUT}\n  abilities={s['abilities']} with_art={s.get('with_art',0)} "
          f"joined_to_ggd={s.get('joined_to_ggd',0)}\n"
          f"  damage: high={s.get('damage_high',0)} medium={s.get('damage_medium',0)} "
          f"low={s.get('damage_low',0)} unparsed={s.get('damage_unparsed_with_ubertip',0)}\n"
          f"  axis mismatches (high-confidence): {len(doc['axisMismatches'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

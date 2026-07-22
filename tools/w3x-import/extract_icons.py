#!/usr/bin/env python3
"""Extract the ORIGINAL w3x icons for champions / abilities (incl. EX) / items.

Task #33 (docs/todo/icons.md), EXTRACTION half. The parsed/*.json inventory
dropped the icon fields for units and abilities (stats.py never read `uico` /
`aart`), so this script re-reads the RAW object files itself (standalone —
stats.py/objdata.py untouched, w3xlib readers reused as libraries):

  war3map.w3u  `uico` (Art - Icon Game Interface)   -> champion portraits
  war3map.w3a  `aart` (Art - Icon Normal)           -> ability buttons
  war3map.w3t  `iico` (Art - Icon)                  -> item buttons

MAPPING (verified 428/428 embedded defs by name against parsed/abilities.json):
  champion godie-<raw>       -> w3u/heroes row <RAW> (case-insensitive)
  embedded Q/W/E/R           -> hero_abilities minus "Aamk", first four in order
                                (exactly how drafts.hero_to_champion assigned them)
  standalone godie-<raw>.<s> -> same table (s in q/w/e/r), godie-<raw>.ex via
                                EX_MAP.json heroes[cid].exAbility
  item godie-<raw>           -> w3t row <RAW> (case-insensitive)

RESOLUTION: a WC3 icon path counts as ORIGINAL art only when the file exists
INSIDE the map archive (custom imports often sit at stock-looking
ReplaceableTextures\\CommandButtons\\ paths — membership, not the prefix, is
the test; W3XArchive hashing is case-insensitive). Blizzard STOCK paths (absent
from the archive) get NO icon: the client keeps its fallback rendering, we
never fabricate or hotlink stock art.

OUTPUT (idempotent, re-runnable):
  content/assets/icons/{champions,abilities,items}/<doc-id>.png  (per-id files;
      many docs share one BLP — per-id copies keep every ref trivially resolvable)
  "icon": "assets/icons/..." patched ADDITIVELY into champion docs (top-level),
      their embedded Q/W/E/R defs, standalone ability docs, and item docs
      (2-space JSON, ensure_ascii=False, per-file trailing-newline preserved)
  out/GoDieEX22s/ICON_MAP.json   machine-readable doc-id -> resolution table
  out/GoDieEX22s/ICONS.md        human report: coverage, top stock paths, failures

Run:  python3 tools/w3x-import/extract_icons.py
"""
from __future__ import annotations

import io
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from w3xlib.objdata import parse_object_file, all_entries  # noqa: E402
from w3xlib.mpq import W3XArchive  # noqa: E402
from w3xlib.blp import decode_blp  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out", "GoDieEX22s")
RAW = os.path.join(OUT, "raw")
MAP_W3X = os.path.join(ROOT, "GoDieEX22s.w3x")
CONTENT = os.path.join(ROOT, "content")
ICON_ROOT = os.path.join(CONTENT, "assets", "icons")

SLOTS = ["Q", "W", "E", "R"]


# ---------------------------------------------------------------- helpers ----

def load_json(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save_json_preserving_tail(path: str, doc) -> None:
    """2-space JSON, ensure_ascii=False; keep the file's trailing-newline state."""
    had_nl = False
    if os.path.exists(path):
        with open(path, "rb") as fh:
            data = fh.read()
        had_nl = data.endswith(b"\n")
    text = json.dumps(doc, ensure_ascii=False, indent=2)
    if had_nl:
        text += "\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def icon_map(parsed: dict, code: str) -> dict[str, str]:
    """rawcode(lower) -> icon path (last-writer-wins, custom over original)."""
    out: dict[str, str] = {}
    for e in all_entries(parsed):
        v = e.get(code)
        if isinstance(v, str) and v.strip():
            out[e.obj_id.lower()] = v.strip()
    return out


# ------------------------------------------------------- archive resolver ----

class IconResolver:
    """WC3 icon path -> PNG bytes when the file lives INSIDE the map archive."""

    def __init__(self, archive: W3XArchive):
        self.ar = archive
        self._png_cache: dict[str, bytes | None] = {}
        self.failures: list[tuple[str, str]] = []  # (path, error)

    def _candidates(self, path: str) -> list[str]:
        p = path.replace("/", "\\")
        stem, ext = os.path.splitext(p)
        cands = [p]
        for alt in (".blp", ".tga"):
            if ext.lower() != alt:
                cands.append(stem + alt)
        return cands

    def canonical(self, path: str) -> str | None:
        """The in-archive variant of `path`, or None (stock / absent)."""
        for cand in self._candidates(path):
            if self.ar.has_file(cand):
                return cand
        return None

    def png_bytes(self, canonical_path: str) -> bytes | None:
        key = canonical_path.lower()
        if key in self._png_cache:
            return self._png_cache[key]
        png: bytes | None = None
        try:
            data = self.ar.read_file(canonical_path)
            if data is None:
                raise ValueError("archive read returned None")
            if data[:4] == b"BLP1":
                img = decode_blp(data)
            else:  # .tga (or any other Pillow-readable) import
                from PIL import Image

                img = Image.open(io.BytesIO(data))
                img.load()
            buf = io.BytesIO()
            img.save(buf, "PNG")
            png = buf.getvalue()
        except Exception as exc:  # record, keep going — reported in ICONS.md
            self.failures.append((canonical_path, f"{type(exc).__name__}: {exc}"))
        self._png_cache[key] = png
        return png


# ------------------------------------------------------------- extraction ----

def main() -> None:
    w3u = parse_object_file(open(os.path.join(RAW, "war3map.w3u"), "rb").read(), has_levels=False)
    w3a = parse_object_file(open(os.path.join(RAW, "war3map.w3a"), "rb").read(), has_levels=True)
    w3t = parse_object_file(open(os.path.join(RAW, "war3map.w3t"), "rb").read(), has_levels=False)
    uico = icon_map(w3u, "uico")
    aart = icon_map(w3a, "aart")
    iico = icon_map(w3t, "iico")

    heroes = load_json(os.path.join(OUT, "parsed", "heroes.json"))
    heroes_o = load_json(os.path.join(OUT, "parsed", "heroes_original.json"))
    hero_ci = {k.lower(): v for k, v in heroes.items()}
    for k, v in heroes_o.items():
        hero_ci.setdefault(k.lower(), v)
    ex_map = load_json(os.path.join(OUT, "EX_MAP.json"))

    archive = W3XArchive(MAP_W3X)
    res = IconResolver(archive)

    for kind in ("champions", "abilities", "items"):
        os.makedirs(os.path.join(ICON_ROOT, kind), exist_ok=True)

    # doc-id -> {"wc3": rawcode|None, "art": path|None, "resolution": kind, "icon": rel|None}
    table: dict[str, dict] = {}
    by_kind: dict[str, list[str]] = {"champions": [], "abilities": [], "items": []}
    stock_counter: Counter[str] = Counter()
    patched_files = 0

    def resolve(doc_id: str, kind: str, rawcode: str | None, art: str | None) -> str | None:
        """Resolve one doc's icon; write the PNG; fill `table`. Returns rel path."""
        row = {"wc3": rawcode, "art": art, "resolution": None, "icon": None}
        table[doc_id] = row
        by_kind[kind].append(doc_id)
        if rawcode is None:
            row["resolution"] = "no-wc3-source"
            return None
        if not art:
            row["resolution"] = "no-art-field"  # inherits its base's stock default
            return None
        canon = res.canonical(art)
        if canon is None:
            row["resolution"] = "stock"
            stock_counter[art] += 1
            return None
        png = res.png_bytes(canon)
        if png is None:
            row["resolution"] = "convert-failed"
            return None
        rel = f"assets/icons/{kind}/{doc_id}.png"
        dest = os.path.join(CONTENT, rel)
        if not (os.path.exists(dest) and open(dest, "rb").read() == png):
            with open(dest, "wb") as fh:
                fh.write(png)
        row["resolution"] = "archive"
        row["icon"] = rel
        return rel

    def qwer_rawcodes(champ_raw: str) -> list[str | None]:
        h = hero_ci.get(champ_raw)
        if not h:
            return [None] * 4
        learn = [x for x in h.get("hero_abilities", []) if x != "Aamk"][:4]
        return [learn[i] if i < len(learn) else None for i in range(4)]

    # ---- champions (portrait + embedded Q/W/E/R) ----------------------------
    champ_dir = os.path.join(CONTENT, "champions")
    champ_ids = sorted(
        f[:-5] for f in os.listdir(champ_dir)
        if f.startswith("godie-") and f.endswith(".json")
    )
    for cid in champ_ids:
        raw = cid.split("godie-", 1)[1]
        path = os.path.join(champ_dir, f"{cid}.json")
        doc = load_json(path)
        changed = False

        rel = resolve(cid, "champions", raw, uico.get(raw))
        if rel and doc.get("icon") != rel:
            doc["icon"] = rel
            changed = True

        for slot, aid in zip(SLOTS, qwer_rawcodes(raw)):
            sub_id = f"{cid}.{slot.lower()}"
            art = aart.get(aid.lower()) if aid else None
            rel = resolve(sub_id, "abilities", aid, art)
            if rel and doc["abilities"][slot].get("icon") != rel:
                doc["abilities"][slot]["icon"] = rel
                changed = True

        if changed:
            save_json_preserving_tail(path, doc)
            patched_files += 1

    # ---- standalone ability docs (q/w/e/r mirrors + ex) ---------------------
    abil_dir = os.path.join(CONTENT, "abilities")
    for f in sorted(os.listdir(abil_dir)):
        if not (f.startswith("godie-") and f.endswith(".json")):
            continue
        doc_id = f[:-5]  # godie-<raw>.<slot>
        base, _, slot = doc_id.rpartition(".")
        if slot not in ("q", "w", "e", "r", "ex"):
            continue
        raw = base.split("godie-", 1)[1]
        if slot == "ex":
            info = ex_map["heroes"].get(base)
            aid = info["exAbility"] if info else None
        else:
            aid = qwer_rawcodes(raw)[SLOTS.index(slot.upper())]
        art = aart.get(aid.lower()) if aid else None
        # embedded twins already resolved the champions' q/w/e/r ids — reuse the row
        rel = (table[doc_id]["icon"] if doc_id in table
               else resolve(doc_id, "abilities", aid, art))
        if rel:
            path = os.path.join(abil_dir, f)
            doc = load_json(path)
            if doc.get("icon") != rel:
                doc["icon"] = rel
                save_json_preserving_tail(path, doc)
                patched_files += 1

    # ---- items --------------------------------------------------------------
    item_dir = os.path.join(CONTENT, "items")
    for f in sorted(os.listdir(item_dir)):
        if not (f.startswith("godie-") and f.endswith(".json")):
            continue
        doc_id = f[:-5]
        raw = doc_id.split("godie-", 1)[1]
        rel = resolve(doc_id, "items", raw, iico.get(raw))
        if rel:
            path = os.path.join(item_dir, f)
            doc = load_json(path)
            if doc.get("icon") != rel:
                doc["icon"] = rel
                save_json_preserving_tail(path, doc)
                patched_files += 1

    archive.close()

    # ---- reports ------------------------------------------------------------
    with open(os.path.join(OUT, "ICON_MAP.json"), "w", encoding="utf-8") as fh:
        json.dump(table, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    kinds = {
        "champions (portraits)": by_kind["champions"],
        "abilities (Q/W/E/R + EX)": by_kind["abilities"],
        "items": by_kind["items"],
    }
    lines = [
        "# w3x icon extraction — GoDieEX22s (task #33, docs/todo/icons.md)",
        "",
        "`extract_icons.py` re-read raw/war3map.{w3u,w3a,w3t} (`uico`/`aart`/`iico`) —",
        "the parsed/*.json inventory had dropped unit+ability icon fields. An icon is",
        "ORIGINAL only when its path resolves INSIDE GoDieEX22s.w3x (membership test,",
        "not path prefix — custom art sits at stock-looking CommandButtons\\ paths).",
        "Stock paths get NO `icon` field: the client keeps its fallback rendering.",
        "",
        "## Coverage",
        "",
        "| kind | docs | with icon (archive art) | stock fallback | no art field | no wc3 source | convert failed |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for label, keys in kinds.items():
        n = Counter(table[k]["resolution"] for k in keys)
        lines.append(
            f"| {label} | {len(keys)} | {n.get('archive', 0)} | {n.get('stock', 0)} "
            f"| {n.get('no-art-field', 0)} | {n.get('no-wc3-source', 0)} | {n.get('convert-failed', 0)} |"
        )
    lines += [
        "",
        "- `no art field`: the WC3 object never overrides its base ability/unit icon →",
        "  Blizzard stock default → fallback (same client treatment as `stock`).",
        "- PNGs are written PER DOC ID under `content/assets/icons/…` even when several",
        "  docs share one source BLP — every `icon` ref resolves by construction.",
        "",
        "## Most-referenced STOCK paths (not in archive — intentionally not shipped)",
        "",
    ]
    for p, n in stock_counter.most_common(15):
        lines.append(f"- `{p}` × {n}")
    lines += ["", "## BLP/TGA conversion failures", ""]
    if res.failures:
        for p, err in res.failures:
            lines.append(f"- `{p}` — {err}")
    else:
        lines.append("(none)")
    lines.append("")
    with open(os.path.join(OUT, "ICONS.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    for label, keys in kinds.items():
        n = Counter(table[k]["resolution"] for k in keys)
        print(f"{label:28s} total {len(keys):4d}  archive {n.get('archive', 0):4d}  "
              f"stock {n.get('stock', 0):4d}  no-art {n.get('no-art-field', 0):4d}  "
              f"failed {n.get('convert-failed', 0):3d}")
    print(f"patched {patched_files} content docs; "
          f"{len(res.failures)} conversion failures; reports in {OUT}/ICONS.md")


if __name__ == "__main__":
    main()

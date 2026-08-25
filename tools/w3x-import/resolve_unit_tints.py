#!/usr/bin/env python3
"""Resolve the w3x VERTEX TINT of every unit in the map (task #263).

    python3 tools/w3x-import/resolve_unit_tints.py            # rebuild the JSON
    python3 tools/w3x-import/resolve_unit_tints.py --check     # CI guard, no writes
    python3 tools/w3x-import/resolve_unit_tints.py --apply     # write missing
                                                               # champion tints

WHY THIS EXISTS (and why #49 was incomplete).
`uclr` / `uclg` / `uclb` — Art Red/Green/Blue Tint, 0..255, WC3 default 255 —
were never in the importer's typed whitelist, so they never reached
`OBJECTS.json` at all (`grep -c uclr OBJECTS.json` -> 0: the file predates the
`rawMods` passthrough, so the fields are not merely null there, they are
ABSENT). #49 recovered 20 champion tints by hand and its ledger
`content/config/unit-tints.json` is a hand-written audit document, not a
generator output — which is exactly how `U00L` (北斗之鼠 - 拳四郎) was lost.

THE INHERITANCE CHAIN — the whole point of this file.
A missing `uclr` is NOT 255. It means "inherit", and WC3 resolves it in this
order. #49 implemented steps 1 and 3 but skipped step 2:

  1. the entry's own `uclr/uclg/uclb` mod in `war3map.w3u`
  2. its `base_id`, IF that base is itself an entry in `war3map.w3u`
     (custom OR original table) -> that entry's value.  <-- the #49 gap.
     `U00L` sets no colour of its own; its base `Umal` is an ORIGINAL-table
     entry that sets 200/200/200, so `U00L` is grey too. Its champion doc
     shipped untinted while its transform counterpart `godie-umal` shipped
     `[0.7843]x3`, so 拳四郎 got BRIGHTER when he transformed.
  3. Blizzard's stock `Units\\UnitUI.slk` `red`/`green`/`blue` columns, walking
     the base chain to whichever ancestor has a row (837 rows; 193 of them are
     NOT 255 — `Ecen` is 255/200/255, `Nman` 255/100/100, `Othr` 255/255/0).
  4. only if none of the above -> 255 (untinted). NEVER 0.

Channels resolve INDEPENDENTLY: `E00V` (百畝森林的霸主 - 維尼) sets only
`uclg=200 uclb=0`, and its red comes from the SLK row of its base `Ewrd`
(255). Treating a missing channel as 0 would paint the roster black; treating
the SLK as 255 would drop 6 champions that are coloured purely by inheritance.

WHAT IT DOES NOT DO. It never invents a colour: a unit that resolves to
(255,255,255) is reported UNTINTED and no `tint` field is written. Model
TEXTURE colour (`umdl`, e.g. `N00B` 小叮噹 = the stock blue StormPandaren
mesh) is a different mechanism entirely and is out of scope here — see
`docs/todo/w3x-tint-263.md` class 3.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from w3xlib.mpq import W3XArchive  # noqa: E402
from w3xlib.objdata import parse_object_file  # noqa: E402
from stock_unit_data import parse_slk  # noqa: E402  (same SLK reader as #248)

REPO = HERE.parents[1]
W3U = HERE / "out" / "GoDieEX22s-src" / "raw" / "war3map.w3u"
STOCK_UI = HERE / "out" / "stock" / "STOCK_UNIT_UI.json"
OUT = HERE / "out" / "GoDieEX22s-src" / "UNIT_TINTS.json"
CHAMPIONS = REPO / "content" / "champions"

ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
UNIT_UI = "Units\\UnitUI.slk"

# The three art-tint codes, in channel order.
TINT_CODES = ("uclr", "uclg", "uclb")
# The matching stock SLK columns.
SLK_COLS = ("red", "green", "blue")

WHITE = (255, 255, 255)


def mpq_root() -> Path:
    """Where the stock archives live.

    The MPQs are gitignored, so a git WORKTREE (every background agent runs in
    one) has none at its own root — fall back to the primary checkout the
    worktree was cut from, and let an env var override both.
    """
    env = os.environ.get("GGD_MPQ_ROOT")
    if env:
        return Path(env)
    if (REPO / ARCHIVES[0]).exists():
        return REPO
    git_dir = REPO / ".git"
    if git_dir.is_file():
        # "gitdir: /path/to/main/.git/worktrees/<name>"
        text = git_dir.read_text(encoding="utf-8", errors="replace").strip()
        m = re.match(r"gitdir:\s*(.+)", text)
        if m:
            p = Path(m.group(1).strip())
            for parent in p.parents:
                if parent.name == ".git" and (parent.parent / ARCHIVES[0]).exists():
                    return parent.parent
    return REPO


# ---------------------------------------------------------------------------
# stage A — Blizzard's stock unit-UI table (red/green/blue + the art siblings)
# ---------------------------------------------------------------------------
UI_COLS = {
    "red": "red",
    "green": "green",
    "blue": "blue",
    "teamColor": "teamColor",
    "customTeamColor": "customTeamColor",
    "scale": "scale",
}


def build_stock_ui() -> dict[str, dict]:
    """Read `Units\\UnitUI.slk` across the archives (later archives win)."""
    root = mpq_root()
    merged: dict[str, dict[str, str]] = {}
    for name in ARCHIVES:
        path = root / name
        if not path.exists():
            print(f"  (skip {name} — not at {root})", file=sys.stderr)
            continue
        arc = W3XArchive(str(path))
        try:
            raw = arc.read_file(UNIT_UI)
        finally:
            arc.close()
        if not raw:
            continue
        rows = parse_slk(raw)
        print(f"  {name}:{UNIT_UI} -> {len(rows)} rows", file=sys.stderr)
        merged.update(rows)
    out: dict[str, dict] = {}
    for uid, row in merged.items():
        rec: dict = {}
        for col, field in UI_COLS.items():
            v = row.get(col)
            if v is None:
                continue
            v = v.strip().strip('"')
            if v in ("", "-", "_"):
                continue
            try:
                f = float(v)
                rec[field] = int(f) if f == int(f) else f
            except ValueError:
                rec[field] = v
        if rec:
            out[uid] = rec
    return out


def load_stock_ui(rebuild: bool) -> dict[str, dict]:
    if not rebuild and STOCK_UI.exists():
        return json.loads(STOCK_UI.read_text(encoding="utf-8"))["units"]
    units = build_stock_ui()
    if not units:
        if STOCK_UI.exists():
            print("  (no MPQs — reusing the committed STOCK_UNIT_UI.json)", file=sys.stderr)
            return json.loads(STOCK_UI.read_text(encoding="utf-8"))["units"]
        raise SystemExit(f"FATAL: no {UNIT_UI} rows and no {STOCK_UI}")
    STOCK_UI.parent.mkdir(parents=True, exist_ok=True)
    STOCK_UI.write_text(
        json.dumps(
            {
                "meta": {
                    "generator": "tools/w3x-import/resolve_unit_tints.py",
                    "archives": ARCHIVES,
                    "table": UNIT_UI,
                    "note": (
                        "Blizzard STOCK unit art row. `red`/`green`/`blue` are "
                        "the 0..255 vertex tint a w3u entry INHERITS when it "
                        "sets no uclr/uclg/uclb of its own — absent means 255, "
                        "never 0."
                    ),
                    "count": len(units),
                },
                "units": units,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {STOCK_UI} ({len(units)} stock rows)", file=sys.stderr)
    return units


# ---------------------------------------------------------------------------
# stage B — the map's own entries
# ---------------------------------------------------------------------------
def load_map_units() -> dict[str, dict]:
    """{objId: {base, table, name, model, tint: {uclr|uclg|uclb: int}}}."""
    data = parse_object_file(W3U.read_bytes(), False)
    out: dict[str, dict] = {}
    for table in ("original", "custom"):
        for e in data[table]:
            mods = {}
            for code in TINT_CODES:
                v = e.get(code)
                if v is not None:
                    mods[code] = int(v)
            out[e.obj_id] = {
                "base": e.base_id,
                "table": table,
                "name": e.get("unam"),
                "model": e.get("umdl"),
                "mods": mods,
            }
    return out


# ---------------------------------------------------------------------------
# stage C — the resolution chain
# ---------------------------------------------------------------------------
def resolve_tint(
    uid: str, units: dict[str, dict], stock: dict[str, dict]
) -> tuple[tuple[int, int, int], list[str], list[str]]:
    """Effective (r,g,b) for `uid`, plus per-channel source + the base chain.

    Channels resolve INDEPENDENTLY (維尼 takes green/blue from the map entry
    and red from the stock SLK). Cycle-safe: a base chain that loops stops at
    the first repeat instead of hanging.
    """
    rgb: list[int | None] = [None, None, None]
    src: list[str] = ["default-255", "default-255", "default-255"]
    chain: list[str] = []
    seen: set[str] = set()
    cur = uid
    while cur and cur not in seen:
        seen.add(cur)
        chain.append(cur)
        rec = units.get(cur)
        if rec:
            for i, code in enumerate(TINT_CODES):
                if rgb[i] is None and code in rec["mods"]:
                    rgb[i] = rec["mods"][code]
                    src[i] = f"w3u:{cur}({rec['table']})"
        # the stock row of THIS id is consulted before walking further up, so
        # an ancestor's SLK colour never shadows a nearer one
        row = stock.get(cur)
        if row:
            for i, col in enumerate(SLK_COLS):
                if rgb[i] is None and isinstance(row.get(col), int):
                    rgb[i] = int(row[col])
                    src[i] = f"slk:{cur}"
        if all(v is not None for v in rgb):
            break
        nxt = rec["base"] if rec else None
        if not nxt or nxt == cur:
            break
        cur = nxt
    return (
        tuple(255 if v is None else v for v in rgb),  # type: ignore[return-value]
        src,
        chain,
    )


def to_unit_interval(v: int) -> float:
    """0..255 -> 0..1, rounded to 4dp — the precision the ledger already uses."""
    return round(v / 255.0, 4)


# ---------------------------------------------------------------------------
# content cross-check
# ---------------------------------------------------------------------------
def champion_path(uid: str) -> Path:
    return CHAMPIONS / f"godie-{uid.lower()}.json"


def read_champion_tint(path: Path) -> list[float] | None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    t = doc.get("tint")
    return list(t) if isinstance(t, list) else None


def insert_tint(path: Path, tint: list[float]) -> None:
    """Insert a `tint` array into a champion doc WITHOUT a JSON round-trip.

    A parse+dump would reformat the whole file, so the edit is LINE BY LINE.
    ⚠️ 2026-08-25: content/champions/*.json 已是**產生器的產物**（skillremake:json /
    tiers:apply —— 先 `bash scripts/genguard.sh content/champions/<id>.json` 查擁有者）。
    這支是 #248 時代的一次性 importer,留著是為了 provenance;要再跑之前先確認
    sync 擁有權,⛔ 直接改產物會被下一次 sync 打回來。
    The new block is placed right after the TOP-LEVEL `"icon"` line, matching
    where every other tinted champion already carries it. The indent is matched
    exactly (2 spaces) because every ability in the doc has an `"icon"` of its
    own, nested deeper — anchoring on the wrong one would inject the tint INTO
    an ability object.
    """
    indent = "  "
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    anchor = None
    for i, line in enumerate(lines):
        if line.startswith(f'{indent}"icon"'):
            anchor = i
    if anchor is None:
        raise SystemExit(f"{path.name}: no top-level `icon` line to anchor the tint after")
    body = [f'{indent}"tint": [\n']
    for j, v in enumerate(tint):
        comma = "," if j < len(tint) - 1 else ""
        body.append(f"{indent}  {v}{comma}\n")
    body.append(f"{indent}],\n")
    # the anchor line must end with a comma now that a sibling follows it
    if not lines[anchor].rstrip().endswith(","):
        lines[anchor] = lines[anchor].rstrip("\n").rstrip() + ",\n"
    lines[anchor + 1 : anchor + 1] = body
    path.write_text("".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify content, write nothing")
    ap.add_argument("--apply", action="store_true", help="insert missing champion tints")
    ap.add_argument("--rebuild-stock", action="store_true", help="re-read UnitUI.slk from the MPQs")
    args = ap.parse_args()

    stock = load_stock_ui(rebuild=args.rebuild_stock and not args.check)
    units = load_map_units()

    records: dict[str, dict] = {}
    for uid in sorted(units):
        rgb, src, chain = resolve_tint(uid, units, stock)
        rec = {
            "name": units[uid]["name"],
            "base": units[uid]["base"],
            "table": units[uid]["table"],
            "model": units[uid]["model"],
            "rgb255": list(rgb),
            "tint": [to_unit_interval(c) for c in rgb],
            "neutral": rgb == WHITE,
            "channelSource": src,
            "baseChain": chain,
        }
        cp = champion_path(uid)
        if cp.exists():
            rec["championId"] = cp.stem
        records[uid] = rec

    tinted = {k: v for k, v in records.items() if not v["neutral"]}
    champs = {k: v for k, v in tinted.items() if "championId" in v}

    if not args.check:
        OUT.write_text(
            json.dumps(
                {
                    "meta": {
                        "generator": "tools/w3x-import/resolve_unit_tints.py",
                        "source": "out/GoDieEX22s-src/raw/war3map.w3u + Units\\UnitUI.slk",
                        "chain": "w3u entry -> w3u base (custom OR original) -> stock UnitUI.slk -> 255",
                        "units": len(records),
                        "tinted": len(tinted),
                        "taggedChampions": len(champs),
                    },
                    "units": records,
                },
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"wrote {OUT} ({len(records)} units, {len(tinted)} tinted)", file=sys.stderr)

    # ---- cross-check content -------------------------------------------------
    missing: list[tuple[str, str, list[float]]] = []
    mismatched: list[tuple[str, list[float], list[float]]] = []
    stale: list[tuple[str, list[float]]] = []
    for uid, rec in sorted(records.items()):
        cid = rec.get("championId")
        if not cid:
            continue
        have = read_champion_tint(champion_path(uid))
        want = rec["tint"]
        if rec["neutral"]:
            if have is not None:
                stale.append((cid, have))
            continue
        if have is None:
            missing.append((uid, cid, want))
        elif any(abs(a - b) > 0.002 for a, b in zip(have, want)):
            mismatched.append((cid, have, want))

    for uid, cid, want in missing:
        print(f"MISSING  {cid} ({uid}) should carry tint {want}")
    for cid, have, want in mismatched:
        print(f"MISMATCH {cid} content={have} w3x={want}")
    for cid, have in stale:
        print(f"STALE    {cid} carries tint {have} but the w3x unit is untinted")

    if args.apply:
        for uid, cid, want in missing:
            insert_tint(champion_path(uid), want)
            print(f"applied  {cid} tint={want}")
        missing = []

    if args.check and (missing or mismatched or stale):
        return 1
    if not (missing or mismatched or stale):
        print(f"OK — {len(champs)} tinted champions agree with the w3x")
    return 0


if __name__ == "__main__":
    sys.exit(main())

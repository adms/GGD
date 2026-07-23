#!/usr/bin/env python3
"""Resumable LOCAL two-pass icon batch driver for GGD (#72 coverage, #97 progress).

Generates the MANDATORY missing icons on-device (Apple-Silicon MPS) with a
TWO-PASS method and saves each to the content path the app already serves,
setting that doc's `icon` field (champions / items). Icons ship as 128x128 WebP
(see ICON_EXT below and tools/icon-gen/convert-webp.mjs). IDEMPOTENT + RESUMABLE:
every finished icon carries a `ggd_iconmethod` marker in a `<icon>.method`
sidecar, so a re-run skips anything already produced by the CURRENT method and
can be stopped and resumed freely.

────────────────────────────────────────────────────────────────────────────
WHY TWO PASSES
────────────────────────────────────────────────────────────────────────────
A single text2img pass with the heavy game-icon STYLE prompt smothered the
subject — every icon came back an unrecognisable abstract blob. So:

  PASS 0  ../local/keywords.py turns the doc's Chinese name/description into a
          SHORT English prompt naming a CONCRETE, RECOGNISABLE subject + its REAL
          dominant colour (champions: the character's own features/colour;
          items: the FUNCTION mapped to a concrete object).
  PASS 1  text2img renders that subject CLEARLY (minimal style, plain bg).
  PASS 2  img2img re-paints it in JAPANESE-ANIME style at a moderate denoise
          `--strength`, so the subject's shape + colour survive while the anime
          finish is applied. Tune strength: too high -> abstract again, too low
          -> unstyled.

────────────────────────────────────────────────────────────────────────────
SCOPE (the #72 rescope) — read from the committed content/config/icon-plan.json
────────────────────────────────────────────────────────────────────────────
  champions  the plan's `generate` (sela, thorne) + `third-party-ip` blocked
             bucket = 24 portraits. (The committed plan is the stable source of
             truth; it is independent of whatever `icon` fields a prior run set.)
  items      the plan's `generate` items = 142 objects.
  abilities  the DRAFT-offered 3-choose-1 pool == the augments/ collection. Note
             the augment@1 schema is `.strict()` with NO `icon` field and lives
             in a do-not-touch package, so augment PNGs are written but the doc
             field is NOT (a separate owner's one-line change).

  # eyeball recognisability first (~20 icons across all 3 categories -> grid):
  .venv/bin/python local/batch.py --contact-sheet

  # the full mandatory run, resumable, overwriting any old single-pass icons:
  .venv/bin/python local/batch.py --force

Flags: --category champions|items|abilities|all, --limit N, --contact-sheet,
       --dry-run, --force (ignore the method marker), --strength F (img2img
       denoise, default 0.45), --no-blocked-champions, --size PX (default 128),
       --seed N (else a stable per-id seed), --no-write-icon-field.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import sys
import time
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)
sys.path.insert(0, HERE)

import pipeline  # noqa: E402
import keywords  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CONTENT = os.path.join(ROOT, "content")
ICONS_DIR = os.path.join(CONTENT, "assets", "icons")
PLAN_PATH = os.path.join(CONTENT, "config", "icon-plan.json")
CONTACT_SHEET = os.path.join(ROOT, "docs", "_icon-contact-sheet.png")

FAMILY_DIR = {"champions": "champions", "items": "items", "augments": "augments"}
MARKER_KEY = "ggd_iconmethod"

# Shipped icon format. WebP at 128² is ~5% of the 256² PNG it replaced and is
# still oversampled for every surface in the app (largest is the 54 CSS px login
# marquee portrait = 108 device px at DPR 2). See tools/icon-gen/convert-webp.mjs.
ICON_EXT = ".webp"
ICON_QUALITY = 90


# --------------------------------------------------------------- worklist ----

def _icon_rel(family: str, doc_id: str) -> str:
    return f"assets/icons/{FAMILY_DIR[family]}/{doc_id}{ICON_EXT}"


def _icon_abs(family: str, doc_id: str) -> str:
    return os.path.join(ICONS_DIR, FAMILY_DIR[family], f"{doc_id}{ICON_EXT}")


def _marker_path(icon_path: str) -> str:
    """Sidecar holding the method version for `icon_path`.

    The marker used to live in a PNG tEXt chunk, but Pillow cannot round-trip an
    arbitrary text key through WebP, so it moved to a sidecar — the same
    format-neutral convention tools/icon-gen/src/generate.py already uses.
    """
    return icon_path + ".method"


def _stable_seed(doc_id: str) -> int:
    return int(hashlib.sha256(doc_id.encode()).hexdigest(), 16) % (2 ** 31)


def _load_doc(family: str, doc_id: str) -> dict | None:
    path = os.path.join(CONTENT, FAMILY_DIR[family], f"{doc_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def build_worklist(category: str, include_blocked: bool) -> list[dict]:
    """-> ordered list of {family, id, doc}. Scope comes from the COMMITTED
    icon-plan.json so it does not drift as this driver writes `icon` fields."""
    with open(PLAN_PATH, encoding="utf-8") as fh:
        plan = json.load(fh)
    gen = plan["generate"]["tier1"] + plan["generate"]["tier2"]
    work: list[dict] = []

    if category in ("all", "champions"):
        ids = [g["id"] for g in gen if g["family"] == "champions"]
        if include_blocked:
            ids += plan.get("blocked", {}).get("third-party-ip", {}).get("ids", [])
        for doc_id in ids:
            doc = _load_doc("champions", doc_id)
            if doc:
                work.append({"family": "champions", "id": doc_id, "doc": doc})

    if category in ("all", "items"):
        for g in gen:
            if g["family"] != "items":
                continue
            doc = _load_doc("items", g["id"])
            if doc:
                work.append({"family": "items", "id": g["id"], "doc": doc})

    if category in ("all", "abilities", "augments"):
        for path in sorted(glob.glob(os.path.join(CONTENT, "augments", "*.json"))):
            if os.path.basename(path) == "_index.json":
                continue
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
            if isinstance(doc, dict) and doc.get("id"):
                work.append({"family": "augments", "id": doc["id"], "doc": doc})

    return work


def _is_done(path: str) -> bool:
    """True iff an icon produced by the CURRENT method is already on disk."""
    if not os.path.exists(path):
        return False
    marker = _marker_path(path)
    if os.path.exists(marker):
        try:
            with open(marker, encoding="utf-8") as fh:
                return fh.read().strip() == keywords.METHOD_VERSION
        except Exception:
            return False
    # Back-compat: icons written before the sidecar switch carry the marker in a
    # PNG tEXt chunk. Read it and adopt the sidecar so this runs once per file.
    try:
        from PIL import Image
        with Image.open(path) as im:
            done = im.info.get(MARKER_KEY) == keywords.METHOD_VERSION
    except Exception:
        return False
    if done:
        _write_marker(path)
    return done


def _write_marker(icon_path: str) -> None:
    with open(_marker_path(icon_path), "w", encoding="utf-8") as fh:
        fh.write(keywords.METHOD_VERSION + "\n")


# --------------------------------------------------------------- doc edit ----

def set_icon_field(family: str, doc_id: str, rel_path: str) -> bool:
    """Set the doc's top-level `icon` field (after `name`), preserving 2-space /
    ensure_ascii formatting + trailing newline. Augments are NEVER written — the
    augment@1 schema is .strict() with no icon field and is a do-not-touch file."""
    if family == "augments":
        return False
    path = os.path.join(CONTENT, FAMILY_DIR[family], f"{doc_id}.json")
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh, object_pairs_hook=OrderedDict)
    if doc.get("icon") == rel_path:
        return False
    new = OrderedDict()
    inserted = False
    for k, v in doc.items():
        new[k] = v
        if k == "name" and "icon" not in doc:
            new["icon"] = rel_path
            inserted = True
    if not inserted and "icon" not in new:
        new["icon"] = rel_path
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(new, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return True


# ---------------------------------------------------------------- render -----

def _save(img, path: str) -> None:
    """Write the shipped icon as WebP + its method sidecar.

    These icons are opaque RGB; keeping an alpha channel would only cost bytes.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, "WEBP", quality=ICON_QUALITY, method=6)
    _write_marker(path)


def render_two_pass(item: dict, args):
    """PASS 1 (subject) -> PASS 2 (anime style). Returns (base, styled, signal)."""
    fam, doc = item["family"], item["doc"]
    p1_pos, p1_neg, signal = keywords.pass1_prompt(fam, doc)
    p2_pos, p2_neg = keywords.pass2_prompt(fam, doc)
    seed = args.seed if args.seed is not None else _stable_seed(item["id"])
    base = pipeline.generate(p1_pos, p1_neg, size=pipeline.NATIVE,
                             steps=args.pass1_steps, guidance=args.pass1_guidance,
                             seed=seed)
    styled = pipeline.stylize(base, p2_pos, p2_neg, strength=args.strength,
                              steps=args.pass2_steps, guidance=args.pass2_guidance,
                              size=args.size, seed=seed)
    return base, styled, signal


def run_batch(work: list[dict], args) -> dict:
    total = len(work)
    made = skipped = failed = fields = capped = 0
    render_cap = args.limit
    t_start = time.time()
    print(f"batch: model {os.environ.get('ICON_GEN_MODEL', pipeline.DEFAULT_MODEL)}")
    print(f"batch: two-pass, {total} in worklist, size {args.size}px, "
          f"img2img strength {args.strength}"
          + (f", render cap {render_cap}" if render_cap is not None else ""))
    for i, item in enumerate(work, 1):
        fam, doc_id = item["family"], item["id"]
        out = _icon_abs(fam, doc_id)
        rel = _icon_rel(fam, doc_id)
        if _is_done(out) and not args.force:
            skipped += 1
            if not args.no_write_icon_field and set_icon_field(fam, doc_id, rel):
                fields += 1
                print(f"  [{i}/{total}] {fam}/{doc_id}  done -> wired icon field")
            continue
        if render_cap is not None and made >= render_cap:
            capped += 1
            continue
        try:
            t0 = time.time()
            _base, styled, signal = render_two_pass(item, args)
            extrema = styled.convert("RGB").getextrema()
            spread = sum(hi - lo for lo, hi in extrema)
            if spread < 30:
                raise RuntimeError(f"blank/solid image (spread {spread})")
            _save(styled, out)
            dt = time.time() - t0
            wired = ""
            if not args.no_write_icon_field and set_icon_field(fam, doc_id, rel):
                fields += 1
                wired = " +field"
            elif fam == "augments":
                wired = " (png-only; schema has no icon field)"
            made += 1
            print(f"  [{i}/{total}] {fam}/{doc_id}  [{signal}]  "
                  f"{styled.size[0]}px {os.path.getsize(out)}b {dt:.1f}s{wired}")
        except Exception as exc:
            failed += 1
            print(f"  [{i}/{total}] {fam}/{doc_id}  FAILED: {exc}", file=sys.stderr)
    dt = time.time() - t_start
    print(f"\nbatch done in {dt/60:.1f} min: {made} rendered, {skipped} already-done, "
          f"{fields} icon fields set, {failed} failed"
          + (f", {capped} left (render cap)" if capped else "") + f", of {total}.")
    return {"total": total, "made": made, "skipped": skipped,
            "fields": fields, "failed": failed, "capped": capped}


# ------------------------------------------------------------ contact sheet --

def contact_sheet(args) -> None:
    """~20 final (two-pass) icons across champions + items + draft abilities into
    one labelled grid at docs/_icon-contact-sheet.png. Writes the real icon files
    (idempotent cache) but touches NO doc field or index — look before committing."""
    from PIL import Image, ImageDraw

    champ = build_worklist("champions", include_blocked=True)
    items = build_worklist("items", include_blocked=False)
    augs = build_worklist("abilities", include_blocked=False)

    def stride(seq, n):
        if not seq:
            return []
        step = max(1, len(seq) // n)
        return seq[::step][:n]

    picks = (stride(champ, 8) + stride(items, 9) + augs[:3])[:20]

    cell, pad, label_h, cols = args.size, 12, 26, 5
    rows = -(-len(picks) // cols)
    W = cols * cell + (cols + 1) * pad
    H = rows * (cell + label_h) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (12, 14, 22))
    draw = ImageDraw.Draw(sheet)

    print(f"contact-sheet: two-pass rendering {len(picks)} icons "
          f"(strength {args.strength})...")
    for idx, item in enumerate(picks):
        fam, doc_id = item["family"], item["id"]
        out = _icon_abs(fam, doc_id)
        try:
            if _is_done(out) and not args.force:
                img = Image.open(out).convert("RGB").resize((cell, cell))
                tag = "cache"
            else:
                _base, styled, signal = render_two_pass(item, args)
                _save(styled, out)
                img = styled.convert("RGB")
                tag = signal
            r, c = divmod(idx, cols)
            x = pad + c * (cell + pad)
            y = pad + r * (cell + label_h + pad)
            sheet.paste(img, (x, y))
            draw.text((x + 2, y + cell + 6), f"{fam[:4]}/{doc_id}",
                      fill=(200, 205, 220))
            print(f"  [{idx+1}/{len(picks)}] {fam}/{doc_id} ({tag})")
        except Exception as exc:
            print(f"  [{idx+1}/{len(picks)}] {fam}/{doc_id} FAILED: {exc}",
                  file=sys.stderr)

    os.makedirs(os.path.dirname(CONTACT_SHEET), exist_ok=True)
    sheet.save(CONTACT_SHEET, "PNG", optimize=True)
    print(f"\ncontact-sheet: wrote {CONTACT_SHEET} "
          f"({W}x{H}, {os.path.getsize(CONTACT_SHEET)} bytes)")


# --------------------------------------------------------------------- cli ---

def main() -> None:
    ap = argparse.ArgumentParser(description="resumable local two-pass icon driver")
    ap.add_argument("--category", choices=["all", "champions", "items", "abilities"],
                    default="all")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--contact-sheet", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="re-render even if a current-method icon exists")
    ap.add_argument("--no-blocked-champions", action="store_true")
    ap.add_argument("--no-write-icon-field", action="store_true")
    ap.add_argument("--strength", type=float, default=0.45,
                    help="PASS-2 img2img denoise strength (0.4-0.55)")
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--pass1-steps", type=int, default=26)
    ap.add_argument("--pass1-guidance", type=float, default=7.5)
    ap.add_argument("--pass2-steps", type=int, default=30)
    ap.add_argument("--pass2-guidance", type=float, default=8.0)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.contact_sheet:
        contact_sheet(args)
        return

    work = build_worklist(args.category, include_blocked=not args.no_blocked_champions)

    if args.dry_run:
        from collections import Counter
        pending = [w for w in work if args.force or not _is_done(
            _icon_abs(w["family"], w["id"]))]
        by = Counter(w["family"] for w in pending)
        print(f"dry-run: {len(pending)} pending / {len(work)} in scope "
              f"(champions {by['champions']}, items {by['items']}, "
              f"augments {by['augments']}); category={args.category}")
        for w in pending:
            print(f"  {w['family']}/{w['id']}")
        return

    run_batch(work, args)


if __name__ == "__main__":
    main()

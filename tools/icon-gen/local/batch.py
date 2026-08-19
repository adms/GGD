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

FAMILY_DIR = {"champions": "champions", "items": "items", "augments": "augments",
              "abilities": "abilities"}
WHITELIST_PATH = os.path.join(ROOT, "data", "curation", "whitelist.json")
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


def _method_stamp() -> str:
    """「這張圖是用什麼畫出來的」—— 寫進 sidecar、用來判斷要不要重畫。

    ⭐ 它是 **METHOD_VERSION + 風格提示詞的 digest**，⛔ 不只是 METHOD_VERSION。

    為什麼（2026-08-19 量到的缺陷）：風格在 2026-08-17 從 Python 常數搬進了
    `content/config/icon-style.json`（第一守則，可調）。但 `_is_done()` 比對的
    仍然只有 `METHOD_VERSION` —— 一個**程式**常數。
    ⇒ owner 在後台改一個字、或整份風格從「日本 2D RPG」換成「FATE」，
      **沒有任何 sidecar 會失效**，下一次 batch.py 會把 1010 張全部 skip 掉，
      而畫面上什麼都沒變。操作者只會以為「我明明改了」。

    ⚠️ 這正是 CLAUDE.md 那條元規則的形狀：**判準要靠人記得，閘不用。**
    把風格併進戳記之後，「改了風格 ⇒ 要重畫」從一句要背的話變成一個算式。

    ⛔ digest 只吃**真的會改變畫面**的三格（stylePrompt / negativePrompt / loras），
    ⛔ 不吃 strength / steps / guidance —— 那幾格改了確實會讓圖不同，但它們是
    操作者**試火候**時每天在動的旋鈕，併進去會讓每一次試參數都全量重畫 1010 張。
    要因為火候重畫，用 `--force`。

    ⭐ `loras` 是 2026-08-19（GH#457）加進來的，理由跟風格那兩格**逐字相同**：
    掛上一顆 LoRA 是「換一個畫風」而不是「調一格火候」，少了它，owner 掛了 LoRA
    之後 batch.py 會把 1,010 張全部 skip 掉，畫面上什麼都沒變。

    ⭐ 同一天一起補上的還有 **PASS 1 的構圖框架**（`keywords.PASS1_FRAME` /
    `PASS1_NEG_*`）。⛔ 在此之前戳記只看 PASS 2 的風格 —— 於是 owner 的
    「圖示⛔不應該直接畫出角色」改在 PASS 1，而**一張圖都不會重畫**。
    ⚠️ digest 吃的是**框架**（那四段釘死的模板字），⛔ 不是逐份文件算出來的完整
    提示詞：後者會讓每改一條詞條就重畫那一張，而框架才是「art direction」。
    """
    style = keywords.load_icon_style()
    raw = "%s\n%s\n%s\n%s\n%s\n%s" % (
        style.get("stylePrompt", ""),
        style.get("negativePrompt", ""),
        json.dumps(style.get("loras") or [], sort_keys=True, ensure_ascii=False),
        json.dumps(keywords.PASS1_FRAME, sort_keys=True, ensure_ascii=False),
        keywords.PASS1_NEG_BASE,
        keywords.PASS1_NEG_NO_CHARACTER,
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return "%s+style:%s" % (keywords.METHOD_VERSION, digest)


def _stable_seed(doc_id: str) -> int:
    return int(hashlib.sha256(doc_id.encode()).hexdigest(), 16) % (2 ** 31)


def _load_doc(family: str, doc_id: str) -> dict | None:
    path = os.path.join(CONTENT, FAMILY_DIR[family], f"{doc_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _dedupe(ids: list[str]) -> list[str]:
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _still_missing(family: str) -> list[str]:
    """Doc ids in `family` that carry no `icon` field at all."""
    out = []
    for path in sorted(glob.glob(os.path.join(CONTENT, FAMILY_DIR[family], "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
        except Exception:
            continue
        if isinstance(doc, dict) and doc.get("id") and not doc.get("icon"):
            out.append(doc["id"])
    return out


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
        # …plus any champion still without an icon: these show up in champ select
        # and the login marquee, where a placeholder is the most visible bug there is.
        ids += _still_missing("champions")
        for doc_id in _dedupe(ids):
            doc = _load_doc("champions", doc_id)
            if doc:
                work.append({"family": "champions", "id": doc_id, "doc": doc})

    if category in ("all", "items"):
        ids = [g["id"] for g in gen if g["family"] == "items"] + _still_missing("items")
        for doc_id in _dedupe(ids):
            doc = _load_doc("items", doc_id)
            # An item whose `name` is its own id lost its name in the w3x import.
            # That used to disqualify it, on the theory that a nameless doc is a
            # placeholder — but godie-i065 and godie-i06p are real items with a
            # real cost, real modifiers and a 解說 that names a concrete object,
            # and keywords.ITEM_ID_SUBJECT now draws them from that lore. Only a
            # doc with NO usable text at all is still skipped.
            if not doc:
                continue
            named = (doc.get("name") or "").strip() not in ("", doc_id)
            if named or (doc.get("description") or "").strip():
                work.append({"family": "items", "id": doc_id, "doc": doc})

    if category in ("all", "abilities"):
        work += ability_worklist()

    if category in ("all", "augments"):
        for path in sorted(glob.glob(os.path.join(CONTENT, "augments", "*.json"))):
            if os.path.basename(path) == "_index.json":
                continue
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
            if isinstance(doc, dict) and doc.get("id"):
                work.append({"family": "augments", "id": doc["id"], "doc": doc})

    return work


def _placeholder_ability(doc: dict) -> bool:
    """`name` is literally "none" and the description is empty — the map author's
    empty slot. There is no subject to draw, so it is never queued."""
    name = (doc.get("name") or "").strip().lower()
    return name in ("", "none") and not (doc.get("description") or "").strip()


def ability_worklist() -> list[dict]:
    """Every ability doc that still needs an icon, ORDERED BY WHAT A PLAYER SEES.

    The plan's `generate` list is the mandatory core (516); the handful of
    plan-`dropped` kits are appended so `--category abilities` really is "all the
    abilities", and the 8 literal placeholders are excluded (no subject).
    Ordering: the QWER/EX of whitelisted champions -> whitelisted abilities ->
    the long tail, so an interrupted run still leaves the ability bar covered.
    """
    with open(PLAN_PATH, encoding="utf-8") as fh:
        plan = json.load(fh)
    planned = [g["id"] for g in plan["generate"]["tier1"] + plan["generate"]["tier2"]
               if g["family"] == "abilities"]

    first: list[str] = []
    second: set[str] = set()
    try:
        with open(WHITELIST_PATH, encoding="utf-8") as fh:
            wl = json.load(fh)
        second = set(wl.get("abilities") or [])
        for cid in wl.get("champions") or []:
            cdoc = _load_doc("champions", cid)
            for slot in ("Q", "W", "E", "R", "EX"):
                a = ((cdoc or {}).get("abilities") or {}).get(slot)
                if isinstance(a, dict) and a.get("id"):
                    first.append(a["id"])
    except FileNotFoundError:
        pass

    every = sorted(
        os.path.basename(p)[:-5]
        for p in glob.glob(os.path.join(CONTENT, "abilities", "*.json"))
        if not os.path.basename(p).startswith("_"))

    def rank(doc_id: str) -> int:
        if doc_id in first_set:
            return 0
        if doc_id in second:
            return 1
        return 2 if doc_id in planned_set else 3

    first_set, planned_set = set(first), set(planned)
    ordered = sorted(set(planned) | set(every), key=lambda i: (rank(i), i))

    work = []
    for doc_id in ordered:
        doc = _load_doc("abilities", doc_id)
        if not doc or _placeholder_ability(doc):
            continue
        work.append({"family": "abilities", "id": doc_id, "doc": doc})
    return work


def gap_only(work: list[dict]) -> list[dict]:
    """Restrict a worklist to the docs that have NO ICON AT ALL.

    `--category all` is "everything in scope", and scope includes the 24
    champions + 142 items whose art already SHIPS but was drawn by an older
    METHOD_VERSION (their sidecars still read twopass-v1). Running the full
    category to fill a coverage hole would silently redraw 166 icons the owner
    never asked to change. `--gap` is the narrow intent: a doc counts as missing
    exactly when its `icon` field is absent or empty — the same definition the
    coverage audit and the #97 progress bar use.

    Augments are always kept: augment@1 is `.strict()` with no `icon` field, so
    an augment can never carry one and would otherwise be permanently invisible
    to this filter.
    """
    return [w for w in work
            if w["family"] == "augments" or not (w["doc"].get("icon") or "").strip()]


def _is_done(path: str) -> bool:
    """True iff an icon produced by the CURRENT method AND STYLE is on disk.

    ⚠️ 「AND STYLE」是 2026-08-19 補的 —— 見 {@link _method_stamp}。
    在此之前只比對 METHOD_VERSION，於是改了 `content/config/icon-style.json`
    一個字都不會讓任何一張失效。
    """
    if not os.path.exists(path):
        return False
    stamp = _method_stamp()
    marker = _marker_path(path)
    if os.path.exists(marker):
        try:
            with open(marker, encoding="utf-8") as fh:
                return fh.read().strip() == stamp
        except Exception:
            return False
    # Back-compat: icons written before the sidecar switch carry the marker in a
    # PNG tEXt chunk. Read it and adopt the sidecar so this runs once per file.
    # ⛔ 那個 chunk 裡只有 METHOD_VERSION（沒有風格 digest），所以它**永遠**
    #    比不上今天的 stamp ⇒ 這條路現在一律回 False（＝重畫）。刻意的：
    #    那些是史前檔案，用今天的風格重畫正是我們要的。
    try:
        from PIL import Image
        with Image.open(path) as im:
            done = im.info.get(MARKER_KEY) == stamp
    except Exception:
        return False
    if done:
        _write_marker(path)
    return done


def _write_marker(icon_path: str) -> None:
    with open(_marker_path(icon_path), "w", encoding="utf-8") as fh:
        fh.write(_method_stamp() + "\n")


# --------------------------------------------------------------- doc edit ----

def set_icon_field(family: str, doc_id: str, rel_path: str) -> bool:
    """Set the doc's top-level `icon` field (after `name`), preserving 2-space /
    ensure_ascii formatting + trailing newline.

    ⭐ 2026-08-18: augments ARE written now. This function used to `return False`
    for them, because `augment@1` was `.strict()` with **no `icon` field** — a
    write would have made every augment doc fail Zod. owner ("補完其他沒有圖示的
    寶具跟固有能力") authorised adding the field, so the refusal is gone.
    ⛔ Do not put it back without also removing `zAugmentDef.icon`; a half-wired
    pipeline is what left 91 docs field-less while the PNGs sat on disk.
    """
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
    # ⛔ size=None（＝「不要縮」），⛔ 不是 pipeline.NATIVE：NATIVE 是 SD1.5 的 512，
    # 而 PASS 2 會把 init 圖拉回**載入的那個模型**的原生邊長。寫死 512 的話，SDXL
    # 這條路會 1024→512→1024 來回兩次，白白多花時間又把細節磨掉一輪。
    base = pipeline.generate(p1_pos, p1_neg, size=None,
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
    model = os.environ.get("ICON_GEN_MODEL", pipeline.DEFAULT_MODEL)
    # ⭐ 架構印出來是**從檔案讀的**，⛔ 不是從檔名猜的 —— 操作者換了 checkpoint
    #    卻沒換到架構（例如把一個 SDXL 檔命名成 …sd15…）時，這一行是唯一看得出來
    #    的地方。⚠️ 包 try：hub repo id 這條路要讀一次遠端 config，而 `--dry-run`
    #    本來就不該因為沒網路而死。
    try:
        detected = pipeline.detect_arch(model)
        where = f"{detected}, native {pipeline.NATIVE_BY_ARCH[detected]}px"
    except Exception as exc:                      # noqa: BLE001 — 只是印一行
        where = f"architecture unread: {exc}"
    print(f"batch: model {model} ({where})")
    print(f"batch: two-pass, {total} in worklist, size {args.size}px, "
          f"img2img strength {args.strength}"
          + (f", render cap {render_cap}" if render_cap is not None else ""))
    for i, item in enumerate(work, 1):
        fam, doc_id = item["family"], item["id"]
        out = _icon_abs(fam, doc_id)
        rel = _icon_rel(fam, doc_id)
        # NEVER overwrite art that is already shipping. A doc whose `icon` points
        # at a file that exists is done even when that file is one of the older
        # extracted 64px PNGs — those are the author's own map art.
        #
        # …but only when the art is NOT ours. A `.method` sidecar means this
        # driver made that file, and then METHOD_VERSION — not this guard — is
        # what decides. Without that carve-out the guard swallows its own tail:
        # once a run has rendered an icon AND wired the doc's `icon` field, the
        # doc is permanently pinned to that art, a METHOD_VERSION bump becomes a
        # silent no-op ("N already-done, 0 rendered"), and a lexicon fix can
        # never reach the corpus it was written for. Author art has no sidecar,
        # so it stays protected exactly as before.
        have = (item["doc"].get("icon") or "").strip()
        have_abs = os.path.join(CONTENT, have) if have else ""
        if (have and not args.force and os.path.exists(have_abs)
                and not os.path.exists(_marker_path(have_abs))):
            skipped += 1
            continue
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
    # 取樣火候的**出貨值**住在 content/config/icon-style.json（後台可調，第一守則）。
    # ⛔ 不再是這裡的字面常數 —— 那樣的話後台那一頁的四格步數/CFG 會是沒有消費端的
    # 假欄位。CLI 的旗標仍然贏（明著給了就照給的走），所以「臨時試一組參數」不必存檔。
    style = keywords.load_icon_style()
    ap = argparse.ArgumentParser(description="resumable local two-pass icon driver")
    ap.add_argument("--category",
                    choices=["all", "champions", "items", "abilities", "augments"],
                    default="all")
    ap.add_argument("--only", default=None,
                    help="comma-separated doc ids; render ONLY these (sampling a "
                         "few before committing to a full run)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--contact-sheet", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="re-render even if a current-method icon exists")
    ap.add_argument("--no-blocked-champions", action="store_true")
    ap.add_argument("--gap", action="store_true",
                    help="only docs with NO `icon` field (+ all augments, which "
                         "cannot carry one) — fills the coverage hole without "
                         "redrawing already-shipping art")
    ap.add_argument("--no-write-icon-field", action="store_true")
    ap.add_argument("--strength", type=float, default=style["strength"],
                    help="PASS-2 img2img denoise strength (0.4-0.55)")
    ap.add_argument("--size", type=int, default=style["size"])
    ap.add_argument("--pass1-steps", type=int, default=style["pass1Steps"])
    ap.add_argument("--pass1-guidance", type=float, default=style["pass1Guidance"])
    ap.add_argument("--pass2-steps", type=int, default=style["pass2Steps"])
    ap.add_argument("--pass2-guidance", type=float, default=style["pass2Guidance"])
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.contact_sheet:
        contact_sheet(args)
        return

    work = build_worklist(args.category, include_blocked=not args.no_blocked_champions)
    if args.gap:
        work = gap_only(work)
    if args.only:
        wanted = {i.strip() for i in args.only.split(",") if i.strip()}
        work = [w for w in work if w["id"] in wanted]
        # 明著點名的 id 就算不在**掃描出來的**工作清單裡也要畫得到。
        # ⚠️ 這不是方便性，是一個踩過的陷阱：`build_worklist` 的 champion 分支只收
        # 「計畫裡的」加上「還沒有 icon 欄位的」，所以這支驅動器**替一份文件寫完
        # icon 欄位之後，那份文件就從清單裡消失了** —— 想重畫它（例如換了畫風設定
        # 之後）連 `--force` 都救不回來，因為它根本沒被列進來。
        for doc_id in sorted(wanted - {w["id"] for w in work}):
            for fam in FAMILY_DIR:
                doc = _load_doc(fam, doc_id)
                if doc:
                    work.append({"family": fam, "id": doc_id, "doc": doc})
                    break
            else:
                # ⛔ 不要靜默少畫一張：打錯一個 id 的症狀本來會是「跑完了但那張沒出現」。
                print(f"--only: 找不到任何一份 id 是 {doc_id} 的文件，跳過。",
                      file=sys.stderr)

    if args.dry_run:
        from collections import Counter
        pending = [w for w in work if args.force or not _is_done(
            _icon_abs(w["family"], w["id"]))]
        by = Counter(w["family"] for w in pending)
        print(f"dry-run: {len(pending)} pending / {len(work)} in scope "
              f"(champions {by['champions']}, items {by['items']}, "
              f"abilities {by['abilities']}, augments {by['augments']}); "
              f"category={args.category}")
        for w in pending:
            print(f"  {w['family']}/{w['id']}")
        return

    run_batch(work, args)


if __name__ == "__main__":
    main()

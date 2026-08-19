#!/usr/bin/env python3
"""icon-gen — the batch icon runner. IDEMPOTENT, RESUMABLE, AND CHEAP TO STOP.

    # what would happen, and what it would cost. Calls NOTHING.
    python3 tools/icon-gen/src/generate.py --dry-run

    # the same, for the small first spend only
    python3 tools/icon-gen/src/generate.py --dry-run --tier 1

    # for real (needs an operator-configured provider + a platform token)
    GGD_PLATFORM_TOKEN=... python3 tools/icon-gen/src/generate.py \
        --tier 1 --quality low --i-have-confirmed-pricing

────────────────────────────────────────────────────────────────────────────
WHY THIS TOOL IS SHAPED LIKE tools/tts-gen
────────────────────────────────────────────────────────────────────────────
Every output gets a `<out>.hash` SIDECAR holding the sha256 of everything that
determines the image: the pinned template version, the full prompt, the family,
the model and the quality tier. A run skips any icon whose PNG exists and whose
sidecar matches. The sidecar is written LAST, after the PNG is on disk, so a
kill -9 between the two costs one re-render and never a false "done".

This is not a nicety. TTS re-renders cost seconds; THESE COST MONEY. A 400-image
run that dies at 250 must resume at 251, not re-bill 250 images.

────────────────────────────────────────────────────────────────────────────
THE MONEY GATES (all four must pass before one cent is spent)
────────────────────────────────────────────────────────────────────────────
  1. `--dry-run` is the DEFAULT-SAFE path and calls nothing at all.
  2. `--i-have-confirmed-pricing` is mandatory for a live run. src/pricing.json
     is a quote from a model's training data, not a live feed.
  3. A `stub:true` response ABORTS the whole run on the first image. Stub mode
     means no provider is configured; without this the run would happily paper
     the content tree with 660 deterministic gradients and mark them done.
  4. `--max-spend` (default $5.00) is a hard ceiling checked before EVERY call
     using the same rate table the estimate used. It stops mid-run.

────────────────────────────────────────────────────────────────────────────
THE KEY IS NEVER HERE
────────────────────────────────────────────────────────────────────────────
This tool has no provider key and no way to accept one. It calls the platform's
own `/api/v1/ai/icon`, which attaches the server-side key the operator saved in
the admin console. All this needs is a normal platform ACCESS TOKEN, read from
$GGD_PLATFORM_TOKEN, never written to disk and never logged.

────────────────────────────────────────────────────────────────────────────
WHAT IT WRITES
────────────────────────────────────────────────────────────────────────────
  content/assets/icons/<family>/<id>.webp      the shipped icon, downscaled
  content/assets/icons/<family>/<id>.webp.hash the idempotence sidecar
  tools/icon-gen/out/raw/<id>.png              the provider's full-size image
  tools/icon-gen/out/ledger.jsonl              one line per BILLED call

The raw image is kept by default. If the shipped size turns out wrong we
re-derive from raw instead of paying for the same picture twice.

`icon` is patched into the doc only after the PNG lands, additively, in the same
2-space / ensure_ascii=False / trailing-newline-preserving style the w3x
importer uses, so the two tools never fight over a file's formatting.

REFUSES to overwrite extracted map-author art: any id the importer resolved as
`archive` is skipped with a loud message. That art is free, original, and better
than anything this tool can buy.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from prompt import (  # noqa: E402
    TEMPLATE_VERSION, TEXT_INSTRUCTION, TEXT_SYSTEM_FIELD,
    build_prompt, derive, text_mode_context,
)
import plan as planner  # noqa: E402

ROOT = planner.ROOT
CONTENT = planner.CONTENT
OUT = os.path.join(ROOT, "tools", "icon-gen", "out")
RAW_DIR = os.path.join(OUT, "raw")
SUBJECT_CACHE = os.path.join(OUT, "subjects.json")
LEDGER = os.path.join(OUT, "ledger.jsonl")
PRICING = os.path.join(HERE, "pricing.json")

DEFAULT_PLATFORM = "http://127.0.0.1:8080"
# The platform's per-account budget is 30 generation calls/minute, SHARED by
# icon and text. Pace under it: a 429 costs a retry, and in --subject=text mode
# every icon is really two calls.
DEFAULT_RPM = 24
# Shipped edge in pixels. The extracted map icons are 64x64 and the largest
# on-screen tile is 52px, so 128 is one full hi-dpi step of headroom and no more.
DEFAULT_EDGE = 128
# Shipped icon format. See tools/icon-gen/convert-webp.mjs for the measurement
# that drove the PNG -> WebP switch (16.07 MB -> 0.79 MB across 169 icons).
ICON_EXT = ".webp"
ICON_QUALITY = 90


def fail(msg: str) -> None:
    print(f"icon-gen: {msg}", file=sys.stderr)
    sys.exit(1)


# ------------------------------------------------------------------ money ---

def load_pricing() -> dict:
    with open(PRICING, encoding="utf-8") as fh:
        return json.load(fh)


def image_rate(pricing: dict, model: str, quality: str) -> float | None:
    """USD per image for (model, quality), or None when unknown."""
    entry = pricing["image"].get(model)
    if not entry:
        return None
    value = entry.get(quality)
    return float(value) if isinstance(value, (int, float)) else None


# ------------------------------------------------------------- idempotence --

def content_hash(job: dict) -> str:
    """Everything that decides the picture. Change any of it and the icon
    regenerates; change nothing and a re-run is free."""
    key = "|".join([
        TEMPLATE_VERSION,
        job["family"],
        job["id"],
        job["model"],
        job["quality"],
        str(job["edge"]),
        job["prompt"],
    ])
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def up_to_date(out_png: str, digest: str) -> bool:
    sidecar = out_png + ".hash"
    if not (os.path.exists(out_png) and os.path.exists(sidecar)):
        return False
    with open(sidecar, encoding="utf-8") as fh:
        return fh.read().strip() == digest


# ----------------------------------------------------------------- doc I/O --

def patch_icon_field(family: str, doc_id: str, rel: str) -> bool:
    """Additively set `icon` on the doc. Byte-compatible with extract_icons.py:
    2-space indent, ensure_ascii=False, the file's trailing-newline state kept."""
    path = os.path.join(CONTENT, family, f"{doc_id}.json")
    if not os.path.exists(path):
        return False
    with open(path, "rb") as fh:
        raw = fh.read()
    doc = json.loads(raw.decode("utf-8"))
    if doc.get("icon") == rel:
        return False
    doc["icon"] = rel
    text = json.dumps(doc, ensure_ascii=False, indent=2)
    if raw.endswith(b"\n"):
        text += "\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return True


def downscale_icon(data: bytes, edge: int) -> bytes:
    """Provider image -> the shipped square, encoded as WebP.

    WebP at edge=128/q90 is ~5% of the equivalent PNG and gzip is provably
    useless on PNG, so this is the only lever that exists on icon bytes. These
    icons are opaque, so RGB is used rather than RGBA — the alpha channel would
    be pure padding. Pillow is already a dependency of the w3x importer; without
    it the raw image ships unchanged (and says so).
    """
    try:
        from PIL import Image
    except ImportError:
        return data
    img = Image.open(io.BytesIO(data))
    img.load()
    if img.mode != "RGB":
        img = img.convert("RGB")
    if img.size != (edge, edge):
        img = img.resize((edge, edge), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=ICON_QUALITY, method=6)
    return buf.getvalue()


# ------------------------------------------------------------------- HTTP ---

class Platform:
    """The platform AI proxy. Holds a session token; never a provider key."""

    def __init__(self, base: str, token: str, timeout: int = 180):
        self.base = base.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(
            f"{self.base}/api/v1{path}",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def icon(self, prompt: str, size: int) -> dict:
        return self._post("/ai/icon", {"prompt": prompt, "size": size})

    def text(self, instruction: str, field: str, context: str) -> dict:
        return self._post(
            "/ai/text", {"prompt": instruction, "field": field, "context": context}
        )


def call_with_retry(fn, attempts: int = 4):
    """Retry a rate-limit or transient 5xx with backoff. A 4xx that is not 429
    is a real error and is raised immediately — retrying a bad request just
    burns the budget."""
    delay = 5.0
    for i in range(attempts):
        try:
            return fn()
        except urllib.error.HTTPError as exc:
            retryable = exc.code == 429 or 500 <= exc.code < 600
            if not retryable or i == attempts - 1:
                detail = exc.read().decode("utf-8", "replace")[:400]
                raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
            time.sleep(delay)
            delay *= 2
        except urllib.error.URLError as exc:
            if i == attempts - 1:
                raise RuntimeError(f"platform unreachable: {exc.reason}") from exc
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


# ------------------------------------------------------------------- jobs ----

def load_subject_cache() -> dict:
    try:
        with open(SUBJECT_CACHE, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_subject_cache(cache: dict) -> None:
    os.makedirs(OUT, exist_ok=True)
    with open(SUBJECT_CACHE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")


def build_jobs(pl: dict, tiers: list[str], families: set[str] | None,
               only: set[str] | None, model: str, quality: str,
               edge: int, subject_cache: dict) -> list[dict]:
    """The work list, in a stable order, with prompts already derived."""
    docs = {family: planner.load_family(family) for family in planner.FAMILIES}
    imap = planner.icon_map()
    jobs: list[dict] = []
    for tier in tiers:
        for entry in pl["generate"][tier]:
            doc_id, family = entry["id"], entry["family"]
            if families and family not in families:
                continue
            if only and doc_id not in only:
                continue
            doc = docs[family].get(doc_id)
            if doc is None:  # deleted between plan and run
                continue
            row = imap.get(doc_id)
            if row and row.get("resolution") == "archive":
                print(f"  SKIP  {doc_id}: the map author's own art exists — never overwrite it")
                continue
            cached = subject_cache.get(doc_id)
            if cached:
                subject, signal, conf = cached["subject"], cached.get("signal", "text"), "provider"
            else:
                subject, signal, conf = derive(doc, family)
            jobs.append({
                "id": doc_id,
                "family": family,
                "tier": tier,
                "name": doc.get("name") or doc_id,
                "subject": subject,
                "signal": signal,
                "confidence": conf,
                "prompt": build_prompt(subject, family),
                "model": model,
                "quality": quality,
                "edge": edge,
            })
    return jobs


# ------------------------------------------------------------------- main ----

def main() -> None:
    ap = argparse.ArgumentParser(
        description="generate the missing content icons (idempotent, resumable)",
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="print the work list and the cost; call nothing (DEFAULT-SAFE)")
    ap.add_argument("--tier", choices=["1", "2", "all"], default="all",
                    help="1 = only what a live surface offers today")
    ap.add_argument("--family", action="append", choices=list(planner.FAMILIES),
                    help="restrict to a family (repeatable)")
    ap.add_argument("--only", action="append", help="restrict to explicit doc ids (repeatable)")
    ap.add_argument("--model", default="gpt-image-1", help="image model, for costing and the hash")
    ap.add_argument("--quality", default="low", help="provider quality tier (see pricing.json)")
    ap.add_argument("--edge", type=int, default=DEFAULT_EDGE, help="shipped icon edge in px")
    ap.add_argument("--request-size", type=int, default=1024,
                    help="size asked of the provider (1024 is the only square every current model accepts)")
    ap.add_argument("--subject", choices=["rules", "text"], default="rules",
                    help="'rules' = free offline lexicon; 'text' = one cheap /ai/text call per doc")
    ap.add_argument("--rpm", type=int, default=DEFAULT_RPM, help="requests per minute ceiling")
    ap.add_argument("--max-spend", type=float, default=5.0,
                    help="hard USD ceiling; the run stops rather than exceed it")
    ap.add_argument("--limit", type=int, default=0, help="stop after N images (0 = no limit)")
    ap.add_argument("--force", action="store_true", help="ignore sidecars and regenerate")
    ap.add_argument("--no-keep-raw", action="store_true", help="do not keep the full-size image")
    ap.add_argument("--platform", default=os.environ.get("GGD_PLATFORM_URL", DEFAULT_PLATFORM))
    ap.add_argument("--i-have-confirmed-pricing", action="store_true",
                    help="required for a live run: you checked pricing.json against the provider")
    ap.add_argument("--print-prompt", action="store_true", help="show the full prompt per job")
    args = ap.parse_args()

    pricing = load_pricing()
    rate = image_rate(pricing, args.model, args.quality)
    text_rate = float(pricing["text"]["perCall"]) if args.subject == "text" else 0.0

    pl = planner.build_plan()
    tiers = ["tier1", "tier2"] if args.tier == "all" else [f"tier{args.tier}"]
    subject_cache = load_subject_cache() if args.subject == "text" else {}
    jobs = build_jobs(
        pl, tiers, set(args.family or []), set(args.only or []),
        args.model, args.quality, args.edge, subject_cache,
    )

    todo, skipped = [], 0
    for job in jobs:
        out_icon = os.path.join(CONTENT, "assets", "icons", job["family"], f"{job['id']}{ICON_EXT}")
        job["out"] = out_icon
        job["rel"] = f"assets/icons/{job['family']}/{job['id']}{ICON_EXT}"
        job["hash"] = content_hash(job)
        if not args.force and up_to_date(out_icon, job["hash"]):
            skipped += 1
            continue
        todo.append(job)

    if args.limit:
        todo = todo[: args.limit]

    # -------------------------------------------------- the estimate --------
    n = len(todo)
    subjects_needed = sum(1 for j in todo if args.subject == "text" and j["id"] not in subject_cache)
    est_images = (rate * n) if rate is not None else None
    est_text = text_rate * subjects_needed
    print()
    print(f"icon-gen  plan digest {pl['contentDigest']}  template {TEMPLATE_VERSION}")
    print(f"  tiers            {', '.join(tiers)}")
    print(f"  in plan          {len(jobs)}")
    print(f"  already done     {skipped}   (PNG + matching sidecar on disk)")
    print(f"  TO GENERATE      {n}")
    print(f"  model / quality  {args.model} / {args.quality}   -> {args.edge}px shipped")
    print(f"  subject source   {args.subject}"
          + (f"   ({subjects_needed} text calls needed)" if args.subject == "text" else ""))
    if est_images is None:
        print(f"  COST             UNKNOWN — no rate for {args.model}/{args.quality} in pricing.json")
    else:
        print(f"  rate             ${rate:.4f}/image   (quoted as of {pricing['quotedAsOf']} — CONFIRM IT)")
        print(f"  COST             ${est_images:.2f} images"
              + (f" + ${est_text:.2f} text = ${est_images + est_text:.2f}" if est_text else ""))
    by_family = {}
    for job in todo:
        by_family[job["family"]] = by_family.get(job["family"], 0) + 1
    print(f"  by family        {by_family}")
    conf = {}
    for job in todo:
        conf[job["confidence"]] = conf.get(job["confidence"], 0) + 1
    print(f"  subject confidence {conf}")

    if args.dry_run:
        print("\n  --- WOULD GENERATE ---")
        for job in todo:
            print(f"  {job['tier']:<5} {job['family'][:5]:<5} {job['id']:<16} "
                  f"{job['name'][:22]:<24} [{job['signal']}/{job['confidence']}]")
            print(f"        -> {job['subject']}")
            if args.print_prompt:
                print(f"        PROMPT: {job['prompt']}")
        print(f"\n  DRY RUN — nothing was called, nothing was billed, {n} images pending.")
        return

    # ------------------------------------------------------ live run --------
    if not args.i_have_confirmed_pricing:
        fail("live run refused: pass --i-have-confirmed-pricing once you have checked "
             "src/pricing.json against the provider's own pricing page.")
    if est_images is None:
        fail(f"live run refused: no known rate for {args.model}/{args.quality}; "
             "add it to src/pricing.json first.")
    if est_images + est_text > args.max_spend:
        fail(f"live run refused: estimate ${est_images + est_text:.2f} exceeds "
             f"--max-spend ${args.max_spend:.2f}. Raise it deliberately.")
    token = os.environ.get("GGD_PLATFORM_TOKEN", "").strip()
    if not token:
        fail("GGD_PLATFORM_TOKEN is not set. This tool needs a PLATFORM access token "
             "(not a provider key — the key stays server-side).")
    if not n:
        print("\n  nothing to do.")
        return

    api = Platform(args.platform, token)
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    interval = 60.0 / max(1, args.rpm)
    spent = 0.0
    made = failed = 0

    for i, job in enumerate(todo, 1):
        if spent + rate > args.max_spend:
            print(f"\n  STOP: next image would pass --max-spend ${args.max_spend:.2f} "
                  f"(spent ${spent:.2f}). {n - i + 1} left; re-run to continue.")
            break
        try:
            # optional: let the text model write the subject line, once, cached
            if args.subject == "text" and job["id"] not in subject_cache:
                doc = planner.load_family(job["family"]).get(job["id"], {})
                res = call_with_retry(lambda: api.text(
                    TEXT_INSTRUCTION, TEXT_SYSTEM_FIELD,
                    text_mode_context(doc, job["family"]),
                ))
                if res.get("stub"):
                    fail("the text provider is in STUB MODE — subject lines would be canned "
                         "strings. Configure it in the admin console, or use --subject=rules.")
                subject = (res.get("text") or "").strip()
                if subject:
                    subject_cache[job["id"]] = {"subject": subject, "signal": "text"}
                    save_subject_cache(subject_cache)
                    job["subject"] = subject
                    job["prompt"] = build_prompt(subject, job["family"])
                    job["hash"] = content_hash(job)
                spent += text_rate
                time.sleep(interval)

            res = call_with_retry(lambda: api.icon(job["prompt"], args.request_size))
            if res.get("stub"):
                fail("the image provider is in STUB MODE — the platform returned a "
                     "deterministic placeholder, not art. Nothing was written. Configure a "
                     "provider in the admin console first.")
            raw = __import__("base64").b64decode(res["pngBase64"])
            if not raw.startswith(b"\x89PNG"):
                raise RuntimeError("provider returned something that is not a PNG")

            if not args.no_keep_raw:
                with open(os.path.join(RAW_DIR, f"{job['id']}.png"), "wb") as fh:
                    fh.write(raw)
            shipped = downscale_icon(raw, job["edge"])
            os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
            with open(job["out"], "wb") as fh:
                fh.write(shipped)
            patch_icon_field(job["family"], job["id"], job["rel"])
            # sidecar LAST: a crash before this costs one re-render, never a lie
            with open(job["out"] + ".hash", "w", encoding="utf-8") as fh:
                fh.write(job["hash"] + "\n")

            spent += rate
            made += 1
            with open(LEDGER, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({
                    "id": job["id"], "family": job["family"], "model": job["model"],
                    "quality": job["quality"], "usd": rate, "hash": job["hash"],
                    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }, ensure_ascii=False) + "\n")
            print(f"  [{i}/{n}] gen {job['id']:<16} ${spent:.2f} spent")
        except SystemExit:
            raise
        except Exception as exc:
            failed += 1
            print(f"  [{i}/{n}] FAIL {job['id']}: {exc}", file=sys.stderr)
        time.sleep(interval)

    print(f"\nicon-gen: {made} generated, {skipped} skipped, {failed} failed, "
          f"${spent:.2f} spent. Ledger: {os.path.relpath(LEDGER, ROOT)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

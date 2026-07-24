#!/usr/bin/env python3
"""voice-gen — per-character voice lines, CosyVoice 3 by default.

    「IndexTTS 模型替換成 CosyVoice 3 來生成，除非生成不好才用 IndexTTS」

CosyVoice 3 renders every line. IndexTTS-2 renders a line only when something
measured, authored or ordered says to — see `routing.py` for the precedence
ladder and `qa.py` for the measurement that writes the pins.

Each engine needs its own venv. Planning needs neither, so `--dry-run` works
under bare python3:

    C=/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python   # cosyvoice3
    I=/Users/Takuro/ggd-voice/index-tts/.venv/bin/python    # indextts

    # what would run, for both engines, with no model loaded
    python3 tools/voice-gen/synth.py --manifest lines.jsonl --dry-run

    # one clip
    $C tools/voice-gen/synth.py --ref refs/e001.wav --lang ja \
        --kana "イクゾ！カクゴ シロ！" --text "いくぞ！覚悟しろ！" --out /tmp/a.mp3

    # the corpus, 4 workers, each in its own terminal
    $C tools/voice-gen/synth.py --manifest lines.jsonl --shard 0 --shards 4
    $C tools/voice-gen/synth.py --manifest lines.jsonl --shard 1 --shards 4  # …2, 3

    # measure it, then re-render only what failed, on the fallback engine
    $C tools/voice-gen/qa.py --manifest lines.jsonl --pins-out pins.jsonl
    $I tools/voice-gen/synth.py --manifest lines.jsonl --pins pins.jsonl

Idempotent by default: a clip whose `.method` sidecar still matches the current
engine version AND the current inputs is SKIPPED. The engine, its method
version, its variant and a fingerprint of its checkpoint files are all inside
that identity, so switching engine or variant re-renders exactly what changed
and never keeps a clip the other engine made. `--force` overrides.

MANIFEST — JSONL (one object per line) or a JSON array. Required per entry:

    {"id": "godie-e001.taunt",
     "ref": "refs/godie-e001.wav",         # relative to --ref-root
     "text": "又變強了！",                   # as the game DISPLAYS it
     "out": "godie-e001/taunt.mp3"}         # relative to --out-root

Optional, general: "lang" (zh|en|ja), "category" (else the id's suffix),
"engine", "variant", "seed", "speed".
Optional, Japanese: "kana" — the space-separated katakana reading, REQUIRED by
CosyVoice 3 for lang=ja; "romaji" — the IndexTTS-2 equivalent.
Optional, IndexTTS-2 emotion: "emoAudio", "emoAlpha", "emoVector", "emoText",
"useEmoText".
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import engine as core      # noqa: E402
import routing             # noqa: E402


# --------------------------------------------------------------- manifest ----

def load_manifest(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        raw = fh.read().strip()
    if not raw:
        return []
    if raw.lstrip().startswith("["):
        rows = json.loads(raw)
    else:
        rows = []
        for n, line in enumerate(raw.splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("#"):
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                sys.exit(f"voice-gen: {path}:{n}: {e}")
    out, seen = [], set()
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            sys.exit(f"voice-gen: {path}: entry {i} is not an object")
        for req in ("id", "ref", "out"):
            if not str(r.get(req) or "").strip():
                sys.exit(f"voice-gen: {path}: entry {i} missing required field {req!r}")
        if not str(r.get("text") or "").strip() and not str(r.get("kana") or "").strip():
            sys.exit(f"voice-gen: {path}: entry {i} ({r['id']}) has neither `text` nor `kana`")
        if r["id"] in seen:
            sys.exit(f"voice-gen: {path}: duplicate id {r['id']!r} — ids key the shard "
                     f"split, so they must be unique")
        seen.add(r["id"])
        out.append(r)
    return out


def in_shard(entry_id: str, shard: int, shards: int) -> bool:
    """Partition by a STABLE hash of the id, not by list position: adding a
    champion to the manifest must not reshuffle which shard owns every other
    line, or a resumed multi-terminal run would re-render half the corpus."""
    if shards <= 1:
        return True
    return int(hashlib.sha1(entry_id.encode("utf-8")).hexdigest(), 16) % shards == shard


def resolve(base: str, p: str) -> str:
    return p if os.path.isabs(p) else os.path.abspath(os.path.join(base, p))


def derived_seed(entry_id: str, take: int) -> int:
    """Reproducible per-(line, take) seed, so a re-run of a best-of-N selection
    explores the same N candidates rather than a fresh random N."""
    h = hashlib.sha1(f"{entry_id}#{take}".encode("utf-8")).hexdigest()
    return int(h[:8], 16)


# -------------------------------------------------------------------- plan ----

def get_engine(name: str, variant: str | None, args, cache: dict):
    key = (name, variant)
    if key not in cache:
        cls = core.get_engine_class(name)
        eng = cls(variant=variant, device=args.device, verbose=args.verbose)
        if name == "indextts":
            eng.allow_kana = args.allow_kana
        cache[key] = eng
    return cache[key]


def plan(entries: list[dict], args, router: routing.Router, cache: dict) -> list[dict]:
    """Resolve, route, filter to this shard, prepare text, decide done/pending.

    Everything here runs WITHOUT loading a model, so a manifest that no engine
    can speak fails in the dry run instead of an hour into a batch.
    """
    work = []
    for e in entries:
        if not in_shard(e["id"], args.shard, args.shards):
            continue
        name, variant, reason = router.choose(e)
        item = {"id": e["id"], "entry": e, "engineName": name,
                "engineReason": reason, "category": routing.category_of(e)}
        if args.engine_only and name != args.engine_only:
            continue
        pin = router.pins.get(e["id"])
        if args.only_pinned and not pin:
            continue

        eng = get_engine(name, variant, args, cache)
        item["engine"] = eng
        item["variant"] = eng.variant
        item["ref"] = ref = resolve(args.ref_root, e["ref"])
        item["out"] = out = resolve(args.out_root, e["out"])

        if not os.path.exists(ref):
            item["error"] = f"reference audio not found: {ref}"
            work.append(item)
            continue
        try:
            item["modelText"] = eng.prepare_text(e)
        except core.TextUnsupported as ex:
            item["error"] = f"[{name}] {ex}"
            work.append(item)
            continue

        params = eng.params(e, args)
        # A pin may carry its own best-of-N. qa.py uses this for RETRY: `takes`
        # is part of the idempotency key, so raising it for one clip makes
        # exactly that clip pending again — no --force, nothing else disturbed.
        params["takes"] = int((pin or {}).get("takes") or args.takes)
        if params["takes"] < 1:
            sys.exit(f"voice-gen: {e['id']}: pinned takes must be >= 1")
        if e.get("emoAudio"):
            params["emoAudioPath"] = resolve(args.ref_root, e["emoAudio"])
        item["params"] = params
        item["versionId"] = eng.version_id()
        item["key"] = core.content_key(item["versionId"], ref, item["modelText"], params)
        item["done"] = core.is_done(out, item["versionId"], item["key"])
        work.append(item)
    return work


# --------------------------------------------------------------- rendering ----

def render_one(w: dict, args) -> dict:
    """Render a clip, optionally best-of-N by speaker similarity.

    Best-of-N exists because CosyVoice 3 is stochastic and the weak categories
    are weak *on average*, not always — the proof run's five takes of one battle
    cry differed audibly. Trying N and keeping the closest-to-reference take is
    far cheaper than routing the line to a second 11 GB model, so it happens
    FIRST; `qa.py` only sees the survivor.
    """
    eng, out = w["engine"], w["out"]
    # From the plan, not from args: a pin can raise best-of-N for one clip.
    takes = max(1, int(w["params"].get("takes") or args.takes))
    base_seed = w["params"].get("seed")

    if takes == 1:
        receipt = eng.render(w["ref"], w["modelText"], out, w["params"], seed=base_seed)
        return receipt

    ext = os.path.splitext(out)[1] or ".wav"
    tmp_dir = tempfile.mkdtemp(prefix="voicegen-takes-")
    best = None
    try:
        ref16 = core.normalised_ref(w["ref"])
        import score
        for i in range(takes):
            cand = os.path.join(tmp_dir, f"take{i}{ext}")
            seed = base_seed if base_seed is not None else derived_seed(w["id"], i)
            receipt = eng.render(w["ref"], w["modelText"], cand, w["params"], seed=seed)
            sim = score.speaker_similarity(ref16, cand)
            receipt = {**receipt, "spkSim": sim, "take": i, "seed": seed}
            if args.verbose:
                print(f"    take {i}: spkSim {sim:.3f} ({receipt.get('durationSec')}s)",
                      file=sys.stderr)
            if best is None or sim > best["spkSim"]:
                best = receipt
                best["_path"] = cand
        os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
        shutil.move(best.pop("_path"), out)
        best["takesTried"] = takes
        return best
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def run(work: list[dict], args) -> int:
    pending = [w for w in work if not w.get("error") and (args.force or not w["done"])]

    # An engine this interpreter cannot run is DEFERRED, not failed: a mixed
    # corpus is meant to be finished by running the other venv over the same
    # manifest. Saying so beats a stack trace 40 clips in.
    runnable, deferred = [], []
    for w in pending:
        (runnable if w["engine"].available() else deferred).append(w)
    if deferred:
        by_engine: dict[str, int] = {}
        for w in deferred:
            by_engine[w["engineName"]] = by_engine.get(w["engineName"], 0) + 1
        for name, n in sorted(by_engine.items()):
            hint = core.get_engine_class(name).VENV_HINT
            print(f"voice-gen: {n} clip(s) deferred — engine {name!r} needs its own venv:\n"
                  f"    {hint} tools/voice-gen/synth.py --manifest … --engine-only {name}",
                  file=sys.stderr)

    if args.limit:
        runnable = runnable[:args.limit]
    if not runnable:
        print(f"voice-gen: nothing to render here (shard {args.shard}/{args.shards}: "
              f"{sum(1 for w in work if w.get('done'))} already current, "
              f"{len(deferred)} deferred)")
        return 1 if deferred else 0

    ledger = open(args.ledger, "a", encoding="utf-8") if args.ledger else None
    ok = fail = 0
    t_start = time.time()
    try:
        for i, w in enumerate(runnable, 1):
            label = f"[{i}/{len(runnable)}] {w['id']}"
            try:
                receipt = render_one(w, args)
            except Exception as ex:
                fail += 1
                print(f"{label} FAILED [{w['engineName']}]: {ex}", file=sys.stderr)
                if args.stop_on_error:
                    return 1
                continue
            e = w["entry"]
            core.write_marker(w["out"], w["versionId"], w["key"], {
                "id": w["id"],
                "engine": w["engineName"],
                "variant": w["variant"],
                "engineReason": w["engineReason"],
                "category": w["category"],
                "lang": e.get("lang", "zh"),
                "text": e.get("text"),
                "modelText": w["modelText"],
                "ref": os.path.relpath(w["ref"], args.ref_root)
                       if not os.path.isabs(e["ref"]) else w["ref"],
                "refSha256": core.ref_sha(w["ref"])[:16],
                "device": args.device,
                "params": w["params"],
                **receipt,
            })
            ok += 1
            mem = w["engine"].mem_gb()
            sim = receipt.get("spkSim")
            print(f"{label} [{w['engineName']}/{w['variant']}] -> "
                  f"{os.path.relpath(w['out'], args.out_root)} "
                  f"({receipt.get('durationSec')}s audio in {receipt.get('wallSec')}s, "
                  f"rtf {receipt.get('rtf')}"
                  + (f", spkSim {sim:.3f}" if sim is not None else "")
                  + (f", mps {mem:.1f}GB)" if mem else ")"))
            if ledger:
                ledger.write(json.dumps({"id": w["id"], "out": w["out"],
                                         "engine": w["engineName"],
                                         "variant": w["variant"], **receipt},
                                        ensure_ascii=False) + "\n")
                ledger.flush()
    finally:
        if ledger:
            ledger.close()

    wall = time.time() - t_start
    print(f"voice-gen: {ok} rendered, {fail} failed, {len(deferred)} deferred "
          f"in {wall:.0f}s ({wall / max(ok, 1):.1f}s/clip)")
    return 1 if (fail or deferred) else 0


# -------------------------------------------------------------------- cli ----

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Zero-shot voice cloning: CosyVoice 3 by default, "
                    "IndexTTS-2 where measurement says to. One clip, or a sharded corpus.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("MANIFEST")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--manifest", help="JSONL/JSON corpus (see module docstring)")
    src.add_argument("--ref", help="reference audio for a single clip")
    ap.add_argument("--text", help="line to speak (single-clip mode)")
    ap.add_argument("--kana", help="katakana reading — required by cosyvoice3 for lang=ja")
    ap.add_argument("--out", help="output path, .wav or .mp3 (single-clip mode)")
    ap.add_argument("--lang", default="zh", choices=["zh", "en", "ja"],
                    help="ja needs --kana on cosyvoice3 (or a romaji field on indextts)")

    g = ap.add_argument_group("engine selection (see routing.py for precedence)")
    g.add_argument("--engine", default=core.DEFAULT_ENGINE, choices=core.engine_names(),
                   help=f"this run's default engine (built-in default: {core.DEFAULT_ENGINE})")
    g.add_argument("--variant", default=None,
                   help="cosyvoice3: base|rl. Measured: no clean winner — RL is better "
                        "on hurt (0.531 vs 0.415) and worse on battlecry (0.326 vs 0.635). "
                        "Whichever is used is recorded in every sidecar.")
    g.add_argument("--engine-for", action="append", default=[], metavar="CAT=ENGINE[:VAR]",
                   help="route one category, repeatable, e.g. --engine-for hurt=indextts")
    g.add_argument("--pins", default=None,
                   help="JSONL of per-id engine pins, as written by qa.py --pins-out")
    g.add_argument("--force-engine", default=None, choices=core.engine_names(),
                   help="override everything, including pins")
    g.add_argument("--force-variant", default=None)
    g.add_argument("--engine-only", default=None, choices=core.engine_names(),
                   help="render only the lines routed to this engine (for the "
                        "second pass, under the other venv)")
    g.add_argument("--only-pinned", action="store_true",
                   help="render ONLY the ids named in --pins. This is how qa.py's "
                        "retry and fallback passes touch just the flagged clips "
                        "instead of walking the whole manifest")
    g.add_argument("--explain-routing", action="store_true",
                   help="with --dry-run, print the engine decision and reason per line")

    ap.add_argument("--device", default="mps", choices=["mps", "cpu", "cuda"],
                    help="mps (default); cpu is the control")
    ap.add_argument("--takes", type=int, default=1,
                    help="render N candidates and keep the one closest to the reference "
                         "speaker (needs the CosyVoice venv for scoring). Cheaper than "
                         "falling back to the other engine, so try it first.")
    ap.add_argument("--shard", type=int, default=0, help="this worker's index, 0-based")
    ap.add_argument("--shards", type=int, default=1, help="total workers")
    ap.add_argument("--force", action="store_true",
                    help="re-render even when a current clip exists")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the plan (pending / done / broken) and exit")
    ap.add_argument("--limit", type=int, default=None, help="cap clips this run")
    ap.add_argument("--stop-on-error", action="store_true",
                    help="abort the batch on the first failure (default: skip and continue)")

    ap.add_argument("--ref-root", default=None,
                    help="base for relative `ref` paths (default: the manifest's directory)")
    ap.add_argument("--out-root", default=None,
                    help="base for relative `out` paths (default: the manifest's directory)")
    ap.add_argument("--ledger", default=None, help="append a JSONL receipt per clip")

    e1 = ap.add_argument_group("cosyvoice3")
    e1.add_argument("--max-chars", type=int, default=None,
                    help="split a line longer than this at sentence boundaries (default 60)")
    e2 = ap.add_argument_group("indextts")
    e2.add_argument("--max-text-tokens", type=int, default=None,
                    help="segment length. 40 by default: upstream's 120 walks the MPS "
                         "driver allocation past 70GB on a long line and gets SIGKILLed")
    e2.add_argument("--allow-kana", action="store_true",
                    help="let IndexTTS-2 attempt Japanese. IT HAS NO KANA TOKENS — the "
                         "output will be noise. Use cosyvoice3 for Japanese.")
    ap.add_argument("--interval-silence", type=int, default=None)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if args.shards < 1 or not (0 <= args.shard < args.shards):
        sys.exit(f"voice-gen: --shard must be in [0,{args.shards}), got {args.shard}")
    if args.takes < 1:
        sys.exit("voice-gen: --takes must be >= 1")

    rules = {}
    for spec in args.engine_for:
        cat, name, variant = routing.parse_rule(spec)
        rules[cat] = (name, variant)
    router = routing.Router(default_engine=args.engine, default_variant=args.variant,
                            rules=rules, pins=routing.load_pins(args.pins),
                            force_engine=args.force_engine,
                            force_variant=args.force_variant)

    if args.manifest:
        base = os.path.dirname(os.path.abspath(args.manifest))
        args.ref_root = os.path.abspath(args.ref_root or base)
        args.out_root = os.path.abspath(args.out_root or base)
        entries = load_manifest(args.manifest)
    else:
        if not (args.text or args.kana) or not args.out:
            sys.exit("voice-gen: --ref requires --out and one of --text / --kana")
        args.ref_root = os.path.abspath(args.ref_root or ".")
        args.out_root = os.path.abspath(args.out_root or ".")
        entries = [{"id": os.path.basename(args.out), "ref": args.ref,
                    "text": args.text or args.kana, "kana": args.kana,
                    "out": args.out, "lang": args.lang}]

    cache: dict = {}
    work = plan(entries, args, router, cache)
    broken = [w for w in work if w.get("error")]
    done = [w for w in work if w.get("done")]
    pending = [w for w in work if not w.get("error") and (args.force or not w["done"])]

    if args.dry_run or broken:
        engines = ", ".join(sorted({f"{w['engineName']}/{w['variant']}"
                                    for w in work if w.get("variant")})) or "-"
        print(f"voice-gen: shard {args.shard}/{args.shards} — {len(work)} in scope, "
              f"{len(pending)} pending, {len(done)} current, {len(broken)} broken "
              f"(engines: {engines}; device {args.device}; takes {args.takes})")
        for w in broken:
            print(f"  BROKEN  {w['id']}: {w['error']}")
        if args.dry_run:
            for w in pending:
                extra = (f"   <- {w['engineReason']}" if args.explain_routing else "")
                print(f"  pending [{w['engineName']}/{w.get('variant')}] {w['id']} -> "
                      f"{os.path.relpath(w['out'], args.out_root)}{extra}")
            for w in done:
                print(f"  ok      [{w['engineName']}/{w.get('variant')}] {w['id']} -> "
                      f"{os.path.relpath(w['out'], args.out_root)}")
            return 1 if broken else 0
        if broken:
            print("voice-gen: refusing to start with broken entries; fix them or drop "
                  "them from the manifest", file=sys.stderr)
            return 1

    return run(work, args)


if __name__ == "__main__":
    sys.exit(main())

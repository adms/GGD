#!/usr/bin/env python3
"""icon-gen DAEMON — one icon, on demand, while the console stays responsive (#186).

    .venv/bin/python local/daemon.py [--port 8789] [--warm]

WHY A DAEMON AND NOT A REQUEST HANDLER
──────────────────────────────────────
`batch.py` is the right shape for 600 icons and the wrong shape for one: it is a
CLI that loads a 2 GB checkpoint, renders, and exits. The owner's actual workflow
is 後台 → ＋新增 → keep typing, and a two-pass render is seconds-to-minutes on
MPS. So this is a JOB QUEUE holding a WARM pipeline — exactly the model
`apps/admin/src/voice/voiceApi.ts` documents for the voice daemon on :8788, and
for the same reason. Creating a document must never wait on a GPU.

Everything that decides WHAT to draw is imported, not re-implemented:

    keywords.pass1_prompt / pass2_prompt   the doc → prompt derivation
    batch.render_two_pass                  PASS-1 subject → PASS-2 anime style
    batch._save / _write_marker            128px WebP + the `.method` sidecar
    batch.set_icon_field                   the OrderedDict-preserving field write
                                           (and its augment refusal, untouched)

That import list is the point. A console-created augment gets byte-identically
the same treatment as a batch-generated one — same lexicon, same two passes,
same METHOD_VERSION, same refusal to add an `icon` field to `augment@1`. In
particular the emblem/crest framing that keywords.py A/B-tested and REJECTED
(see its pass1_prompt comment) is not re-litigated here: this file writes no
prompt text of its own at all.

WHAT IT REFUSES TO DO  (every one of these answers 409 with a reason code)
─────────────────────────────────────────────────────────────────────────
  blocked       the id sits in icon-plan.json's `blocked` bucket — today the
                third-party-IP hold. A held gate is not a coverage gap and must
                not be quietly filled by a create-time hook.
  author-art    the doc's `icon` points at a file that EXISTS and has no
                `.method` sidecar ⇒ that art came from the w3x or a human hand.
                The map's own art outranks anything we invent. Same carve-out
                batch.py's run loop makes, same sidecar convention.
  already-done  a current-METHOD_VERSION icon is already on disk. Re-saving an
                entity therefore costs nothing; `force:true` is the only way past.
  no-icons      the collection has no icon convention at all (loot-tables).
  no-engine     torch/diffusers cannot load on this machine. The job FAILS,
                LOUDLY, with that reason — it never writes a placeholder. A
                letter tile the owner can see is honest; a gradient that looks
                finished is not.

It never writes a stub, a gradient, or a solid frame: the blank-image guard
batch.py uses (channel spread < 30) is applied here too, and a blank render is a
FAILED job, not a saved file.

AUTHORISATION IS BY REACHABILITY, exactly as for the content-api and voice
daemon: binds 127.0.0.1, and re-checks the socket peer plus the Origin header on
every mutating verb. It holds no key and reaches no network at generation time.
The admin vite server proxies /icon-api here and itself refuses a non-loopback
--host, so a LAN device has no front door to knock on. This process does not run
on the family host — there is no GPU and no checkpoint there — and that is why
the console degrades to a 說明 rather than a spinner when it cannot be reached.
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import batch  # noqa: E402
import keywords  # noqa: E402

ROOT = batch.ROOT
CONTENT = batch.CONTENT
PLAN_PATH = batch.PLAN_PATH

# Collections the console can ask about, mapped to the icon FAMILY whose lexicon
# and directory they use. `loot-tables` is deliberately absent: a pool is a list
# of item ids, has no art of its own, and asking for one is a caller bug worth
# an explicit answer rather than a silent no-op.
COLLECTION_FAMILY = {
    "champions": "champions",
    "abilities": "abilities",
    "items": "items",
    "augments": "augments",
}

# `augment@1` is `.strict()` and has NO icon field — its art is resolved by
# CONVENTION from assets/icons/augments/<id>.webp. So for this one family we
# write the file and nothing else. batch.set_icon_field enforces the same rule
# from its side; this constant is here so the daemon can SAY so in the job.
FIELDLESS_FAMILIES = {"augments"}

RECENT_CAP = 40

# The two-pass render knobs, byte-identical to batch.py's argparse defaults.
# Named here rather than re-parsed so a tuning change in one place is a visible
# divergence rather than a silent one.
RENDER_ARGS = dict(
    strength=0.45, size=128,
    pass1_steps=26, pass1_guidance=7.5,
    pass2_steps=30, pass2_guidance=8.0,
    seed=None,
)

ALLOWED_ORIGINS = {
    "http://127.0.0.1:60721",
    "http://localhost:60721",
}


# ───────────────────────────────────────────────────────────── eligibility ──

def load_doc(collection: str, doc_id: str):
    family = COLLECTION_FAMILY.get(collection)
    if family is None:
        return None
    return batch._load_doc(family, doc_id)


_plan_cache: dict = {"mtime": None, "ids": frozenset()}


def blocked_ids() -> frozenset:
    """Every id the committed plan holds behind a human decision.

    Re-read when the file changes rather than cached for the process lifetime:
    the plan is regenerated by plan.py while this daemon may be running for
    days, and a stale allow-list here would generate art for something a human
    deliberately excluded.
    """
    try:
        mtime = os.path.getmtime(PLAN_PATH)
    except OSError:
        return frozenset()
    if _plan_cache["mtime"] == mtime:
        return _plan_cache["ids"]
    ids: set[str] = set()
    try:
        with open(PLAN_PATH, encoding="utf-8") as fh:
            plan = json.load(fh)
        for bucket in (plan.get("blocked") or {}).values():
            ids.update(bucket.get("ids") or [])
    except Exception:
        return _plan_cache["ids"]
    _plan_cache["mtime"] = mtime
    _plan_cache["ids"] = frozenset(ids)
    return _plan_cache["ids"]


def preflight(collection: str, doc_id: str, force: bool) -> dict:
    """May we draw this? -> {eligible, reason, message, family, iconPath}.

    Evaluated at enqueue AND again immediately before the render, because a
    queued job can sit behind a long one while the owner hand-picks art for the
    very doc it is about to overwrite.
    """
    family = COLLECTION_FAMILY.get(collection)
    if family is None:
        return {"eligible": False, "reason": "no-icons",
                "message": f"{collection} 沒有圖示慣例，不產圖。"}
    if not doc_id or "/" in doc_id or "\\" in doc_id or doc_id.startswith("."):
        return {"eligible": False, "reason": "bad-id", "message": f"不合法的 id：{doc_id}"}

    doc = batch._load_doc(family, doc_id)
    if doc is None:
        return {"eligible": False, "reason": "no-doc",
                "message": f"找不到 content/{family}/{doc_id}.json。"}

    if doc_id in blocked_ids():
        return {"eligible": False, "reason": "blocked", "family": family,
                "message": "這個 id 在 icon-plan 的暫停名單（第三方版權），"
                           "要先由人決定改成原創或維持文字後備。"}

    # PLACEHOLDER SLOTS ARE NOT A COVERAGE GAP. plan.py DROPS these (its own
    # `placeholder-ability` rule: 「這是原圖的佔位格，沒有任何可以下筆的內容」),
    # but the blocked list carries only the copyright hold, so without this the
    # 補圖示 button would happily draw them — and drawing them is worse than
    # leaving them alone. The 16 such docs today are the Q/W/E/R of four
    # champions (godie-e00u / h02n / u01f / u01q) and they are BYTE-IDENTICAL to
    # each other: name "none", no description, same cooldown/mana/range/damage/
    # vfxKey. Identical input means an identical prompt, so generating would
    # produce 16 interchangeable images — 「根本不知道哪招是哪招」 manufactured
    # on purpose — and would mark four kit-less champions as visually finished.
    # None of the four is in the 48-champion whitelist, so nothing renders them
    # to a player at all. The real fix is authoring the kits, not the art.
    if family == "abilities" and (doc.get("name") or "").strip().lower() == "none" \
            and not (doc.get("description") or "").strip():
        return {"eligible": False, "reason": "placeholder-ability", "family": family,
                "message": "這是原圖的佔位技能（name 是 none、沒有說明），"
                           "沒有東西可以下筆——16 個這種格子的內容完全相同，"
                           "硬畫只會得到 16 張一樣的圖。要補的是技能本身，不是圖示。"}

    out = batch._icon_abs(family, doc_id)
    rel = batch._icon_rel(family, doc_id)

    # AUTHOR ART WINS. A doc pointing at a file that exists with NO `.method`
    # sidecar means the w3x import or a human put it there. Never overwrite it —
    # not even with --force from the console, which is a convenience button and
    # not a licence to destroy the map's own art.
    have = (doc.get("icon") or "").strip()
    if have:
        have_abs = os.path.join(CONTENT, have)
        if os.path.exists(have_abs) and not os.path.exists(batch._marker_path(have_abs)):
            return {"eligible": False, "reason": "author-art", "family": family,
                    "iconPath": have,
                    "message": f"已經有手動／w3x 的圖（{have}），不覆蓋。"}

    if batch._is_done(out) and not force:
        return {"eligible": False, "reason": "already-done", "family": family,
                "iconPath": rel,
                "message": f"已經有這一代方法（{keywords.METHOD_VERSION}）畫好的圖了。"}

    return {"eligible": True, "reason": "ok", "family": family, "iconPath": rel,
            "message": ""}


# ─────────────────────────────────────────────────────────────────── engine ──

def engine_info() -> dict:
    """What this machine can actually do — asked WITHOUT loading the model.

    `ok:false` here is the family-host answer: no torch, no checkpoint, no MPS.
    The console renders that reason verbatim instead of a spinner that never
    finishes, because a feature that fails silently is the exact pathology this
    repo has been digging out of.
    """
    model = os.environ.get("ICON_GEN_MODEL", batch.pipeline.DEFAULT_MODEL)
    info = {"name": model, "device": "none", "warm": batch.pipeline._pipe is not None,
            "method": keywords.METHOD_VERSION, "ok": False, "reason": ""}
    try:
        import torch  # noqa: F401
    except Exception as exc:
        info["reason"] = f"torch 未安裝（{exc}）—— 這台機器不能產圖。"
        return info
    try:
        import torch
        if torch.backends.mps.is_available():
            info["device"] = "mps"
        elif torch.cuda.is_available():
            info["device"] = "cuda"
        else:
            info["device"] = "cpu"
    except Exception:
        info["device"] = "cpu"
    info["ok"] = True
    if info["device"] == "cpu":
        info["reason"] = "沒有 MPS／CUDA，會用 CPU 跑，一張大約好幾分鐘。"
    return info


# ────────────────────────────────────────────────────────────────── jobs ────

class Jobs:
    """A FIFO of one-icon renders served by ONE worker thread.

    One worker, not a pool: the whole point of the warm pipeline is that a
    single checkpoint stays resident, and two concurrent MPS renders on a laptop
    contend for the same memory and finish slower than in series.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}
        self._order: list[str] = []
        self._q: "queue.Queue[str]" = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    # -- reads --------------------------------------------------------------

    def snapshot(self) -> dict:
        with self._lock:
            jobs = [dict(self._jobs[i]) for i in self._order]
        active = [j for j in jobs if j["state"] in ("queued", "running")]
        recent = [j for j in jobs if j["state"] not in ("queued", "running")]
        return {"active": active, "recent": recent[-RECENT_CAP:][::-1]}

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            j = self._jobs.get(job_id)
            return dict(j) if j else None

    def counts(self) -> dict:
        with self._lock:
            jobs = list(self._jobs.values())
        out = {"queued": 0, "running": 0, "done": 0, "failed": 0, "cancelled": 0, "skipped": 0}
        for j in jobs:
            out[j["state"]] = out.get(j["state"], 0) + 1
        return out

    # -- writes -------------------------------------------------------------

    def enqueue(self, collection: str, doc_id: str, family: str, force: bool) -> dict:
        # Coalesce: the console fires on create AND on demand, and the owner may
        # click 補圖 twice. A second request for a doc already in flight returns
        # the SAME job rather than rendering the same icon twice.
        with self._lock:
            for jid in self._order:
                j = self._jobs[jid]
                if (j["collection"] == collection and j["docId"] == doc_id
                        and j["state"] in ("queued", "running")):
                    return dict(j)
            job = {
                "id": uuid.uuid4().hex[:12],
                "collection": collection,
                "docId": doc_id,
                "family": family,
                "force": bool(force),
                "state": "queued",
                "reason": "",
                "message": "",
                "iconPath": None,
                "fieldWritten": False,
                "signal": "",
                "queuedAt": time.time(),
                "startedAt": None,
                "endedAt": None,
                "elapsedMs": 0,
                "error": None,
            }
            self._jobs[job["id"]] = job
            self._order.append(job["id"])
            self._trim()
            self._q.put(job["id"])
            return dict(job)

    def cancel(self, job_id: str) -> bool:
        """Only a QUEUED job can be cancelled. A render already on the GPU runs
        to completion — killing it mid-diffusion would leave the pipeline in an
        unknown state, and it is seconds away anyway."""
        with self._lock:
            j = self._jobs.get(job_id)
            if j is None or j["state"] != "queued":
                return False
            j["state"] = "cancelled"
            j["message"] = "已取消。"
            j["endedAt"] = time.time()
            return True

    def _trim(self) -> None:
        finished = [i for i in self._order
                    if self._jobs[i]["state"] not in ("queued", "running")]
        while len(finished) > RECENT_CAP:
            drop = finished.pop(0)
            self._order.remove(drop)
            self._jobs.pop(drop, None)

    def _set(self, job_id: str, **fields) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j is not None:
                j.update(fields)

    # -- the worker ---------------------------------------------------------

    def _run(self) -> None:
        while True:
            job_id = self._q.get()
            job = self.get(job_id)
            if job is None or job["state"] != "queued":
                continue  # cancelled while waiting
            self._set(job_id, state="running", startedAt=time.time())
            t0 = time.time()
            try:
                result = self._render(job)
                result["elapsedMs"] = int((time.time() - t0) * 1000)
                result["endedAt"] = time.time()
                self._set(job_id, **result)
            except Exception as exc:  # never let the worker thread die
                self._set(job_id, state="failed", reason="error", error=str(exc),
                          message=f"產圖失敗：{exc}",
                          elapsedMs=int((time.time() - t0) * 1000), endedAt=time.time())
            print(f"[icon-daemon] {job['collection']}/{job['docId']} "
                  f"-> {self.get(job_id)['state']}", flush=True)

    def _render(self, job: dict) -> dict:
        collection, doc_id = job["collection"], job["docId"]

        # RE-CHECK. The queue is not instantaneous and the doc may have gained
        # hand-picked art since this was enqueued; that art must win.
        pre = preflight(collection, doc_id, job["force"])
        if not pre["eligible"]:
            return {"state": "skipped", "reason": pre["reason"],
                    "message": pre["message"], "iconPath": pre.get("iconPath")}

        family = pre["family"]
        doc = batch._load_doc(family, doc_id)
        eng = engine_info()
        if not eng["ok"]:
            # NO PLACEHOLDER. Fail with the reason; the letter tile stays and the
            # console says why. Writing a gradient here would look finished.
            return {"state": "failed", "reason": "no-engine", "error": eng["reason"],
                    "message": f"這台機器不能產圖：{eng['reason']}"}

        args = SimpleNamespace(**RENDER_ARGS)
        item = {"family": family, "id": doc_id, "doc": doc}
        _base, styled, signal = batch.render_two_pass(item, args)

        # batch.py's blank guard: a solid or near-solid image means the render
        # collapsed. Saving it would paper the doc with a coloured square and
        # mark it done — worse than no icon, because it looks deliberate.
        extrema = styled.convert("RGB").getextrema()
        spread = sum(hi - lo for lo, hi in extrema)
        if spread < 30:
            return {"state": "failed", "reason": "blank",
                    "error": f"blank/solid image (spread {spread})",
                    "message": "產出是一張空白圖，已丟棄（沒有覆蓋任何檔案）。"}

        out = batch._icon_abs(family, doc_id)
        batch._save(styled, out)  # WebP + `.method` sidecar

        # THE TWO SCHEMA SHAPES. champions/abilities/items get the `icon` field;
        # augments get the file only, because augment@1 is .strict() and has no
        # such field — its art is found by convention.
        field_written = False
        if family not in FIELDLESS_FAMILIES:
            field_written = batch.set_icon_field(family, doc_id, pre["iconPath"])

        note = ("已產圖（augment 依慣例吃檔名，schema 沒有 icon 欄位）"
                if family in FIELDLESS_FAMILIES else "已產圖並寫入 icon 欄位")
        return {"state": "done", "reason": "ok", "iconPath": pre["iconPath"],
                "fieldWritten": field_written, "signal": signal,
                "message": f"{note}｜取材：{signal}"}


JOBS: Jobs | None = None


# ──────────────────────────────────────────────────────────────── transport ──

class Handler(BaseHTTPRequestHandler):
    server_version = "ggd-icon-daemon/1"

    def log_message(self, fmt, *args):  # we print our own lines
        pass

    # -- guards -------------------------------------------------------------

    def _peer_is_loopback(self) -> bool:
        """The real gate. Reads the SOCKET peer and never a forwarded header —
        a header is whatever the caller typed."""
        host = self.client_address[0]
        return host in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        return origin is None or origin in ALLOWED_ORIGINS

    def _json(self, code: int, obj) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return {}

    # The admin vite proxy forwards the mount prefix as-is (`/icon-api/health`),
    # exactly as the content-api and voice daemon see theirs. Strip it here so
    # the same routes answer a direct curl on :8789 and a browser through :60721
    # — an operator debugging with curl must be hitting the same handler the UI
    # does, not a second, subtly different one.
    MOUNT = "icon-api"

    def _parts(self) -> list[str]:
        path = self.path.split("?")[0].rstrip("/")
        parts = [p for p in path.split("/") if p]
        return parts[1:] if parts[:1] == [self.MOUNT] else parts

    # -- routes -------------------------------------------------------------

    def do_GET(self):
        if not self._peer_is_loopback():
            return self._json(403, {"error": "loopback only"})
        parts = self._parts()
        if parts == ["health"]:
            eng = engine_info()
            return self._json(200, {
                "ok": eng["ok"],
                # TRUE ⇒ nothing this service produces would be real art. It is
                # not a mode we enter — it is a refusal to start.
                "stub": not eng["ok"],
                "engine": eng,
                "method": keywords.METHOD_VERSION,
                "blocked": len(blocked_ids()),
                "planPath": os.path.relpath(PLAN_PATH, ROOT),
                "queue": JOBS.counts(),
            })
        if parts == ["jobs"]:
            return self._json(200, JOBS.snapshot())
        if len(parts) == 2 and parts[0] == "jobs":
            job = JOBS.get(parts[1])
            return self._json(200, job) if job else self._json(404, {"error": "no such job"})
        if len(parts) == 3 and parts[0] == "preflight":
            return self._json(200, preflight(parts[1], parts[2], False))
        return self._json(404, {"error": f"unknown route {self.path}"})

    def do_POST(self):
        if not self._peer_is_loopback():
            return self._json(403, {"error": "loopback only"})
        if not self._origin_ok():
            return self._json(403, {"error": f"origin not allowed: {self.headers.get('Origin')}"})
        if self._parts() != ["jobs"]:
            return self._json(404, {"error": f"unknown route {self.path}"})
        body = self._body()
        collection = str(body.get("collection") or "")
        doc_id = str(body.get("id") or "")
        force = bool(body.get("force"))
        pre = preflight(collection, doc_id, force)
        if not pre["eligible"]:
            # 409, not 200-with-a-flag: "we did not draw this and here is why" is
            # a real outcome the caller must render, not an error to swallow.
            code = 404 if pre["reason"] == "no-doc" else 409
            return self._json(code, {"error": pre["message"], "reason": pre["reason"],
                                     "iconPath": pre.get("iconPath")})
        job = JOBS.enqueue(collection, doc_id, pre["family"], force)
        return self._json(202, {"jobId": job["id"], "job": job})

    def do_DELETE(self):
        if not self._peer_is_loopback():
            return self._json(403, {"error": "loopback only"})
        if not self._origin_ok():
            return self._json(403, {"error": "origin not allowed"})
        parts = self._parts()
        if len(parts) == 2 and parts[0] == "jobs":
            return (self._json(200, {"cancelled": True}) if JOBS.cancel(parts[1])
                    else self._json(409, {"error": "只有排隊中的工作可以取消。"}))
        return self._json(404, {"error": f"unknown route {self.path}"})


def main() -> None:
    global JOBS
    ap = argparse.ArgumentParser(description="GGD icon-generation job daemon (#186)")
    ap.add_argument("--port", type=int, default=8789)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--warm", action="store_true",
                    help="load the checkpoint at startup so the first icon is not the slow one")
    args = ap.parse_args()

    if args.host not in ("127.0.0.1", "localhost", "::1"):
        # Same refusal as the admin vite server's loopbackOnly(): this service
        # grants write authority to content/ to any peer that can open the
        # socket, so the bind address IS the authorisation.
        raise SystemExit(f"refusing to bind {args.host}: this daemon is loopback-only")

    JOBS = Jobs()
    eng = engine_info()
    print(f"[icon-daemon] method {keywords.METHOD_VERSION}  model {eng['name']}  "
          f"device {eng['device']}  ok={eng['ok']} {eng['reason']}", flush=True)
    print(f"[icon-daemon] {len(blocked_ids())} blocked id(s) from "
          f"{os.path.relpath(PLAN_PATH, ROOT)}", flush=True)
    if args.warm and eng["ok"]:
        print("[icon-daemon] warming…", flush=True)
        batch.pipeline.load_pipeline()
        print("[icon-daemon] warm.", flush=True)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[icon-daemon] listening on http://{args.host}:{args.port}/  "
          f"(admin proxies /icon-api here)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[icon-daemon] bye", flush=True)


if __name__ == "__main__":
    main()

"""Offline source claims / full-proposal checklist inference; no training or activation."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import signal
import time
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def requests_from(value):
    if isinstance(value, dict) and "resolution" in value:
        if value["resolution"].get("status") != "resolved" or not value.get("request"):
            raise ValueError("UNRESOLVED_HERO_SOURCE")
        rows = [value["request"]]
    elif isinstance(value, dict) and value.get("schema") == "ggd-forge-fidelity-checklist@1":
        body = {k: v for k, v in value.items() if k != "planDigest"}
        if digest(body) != value.get("planDigest"):
            raise ValueError("PLAN_CHANGED")
        rows = value["requests"]
    else:
        rows = value if isinstance(value, list) else [value]
    if not 1 <= len(rows) <= 25:
        raise ValueError("REQUEST_COUNT")
    ids = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"] or row["id"] in ids:
            raise ValueError("REQUEST_ID")
        ids.add(row["id"])
        messages = row.get("messages")
        if not isinstance(messages, list) or len(messages) != 2 or [m.get("role") for m in messages] != ["system", "user"]:
            raise ValueError("MESSAGES")
        if not all(isinstance(m.get("content"), str) for m in messages) or digest(messages) != row.get("requestDigest"):
            raise ValueError("REQUEST_CHANGED")
        payload = json.loads(messages[1]["content"])
        if payload.get("task") not in ["hero-source", "owner-mechanism"]:
            raise ValueError("SOURCE_TASK_ONLY")
        source = payload.get("source", {})
        if not isinstance(source.get("text"), str) or not source["text"].strip():
            raise ValueError("SOURCE_REQUIRED")
        if hashlib.sha256(source["text"].encode()).hexdigest() != source.get("snapshot"):
            raise ValueError("SOURCE_HASH_CHANGED")
        if not isinstance(payload.get("claim"), str) or not payload["claim"].strip():
            raise ValueError("CLAIM_REQUIRED")
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--adapter")
    p.add_argument("--request", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--runtime-root", required=True)
    p.add_argument("--max-memory-gib", type=int, default=12)
    p.add_argument("--timeout-seconds", type=int, default=600)
    args = p.parse_args()
    rows = requests_from(json.loads(Path(args.request).read_text()))
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("MAC_ARM64_ONLY")
    if not 4 <= args.max_memory_gib <= 80 or not 30 <= args.timeout_seconds <= 1800:
        raise ValueError("RESOURCE_LIMIT")
    output = Path(args.output)
    if output.exists() or Path(str(output) + ".partial").exists():
        raise ValueError("REFUSE_OVERWRITE")
    if not Path(args.model).is_dir() or (args.adapter and not Path(args.adapter).is_dir()):
        raise ValueError("LOCAL_MODEL_REQUIRED")
    lock = Path(args.runtime_root) / "gpu.lock"
    with lock.open("x") as f:
        json.dump({"pid": os.getpid(), "kind": "source-inference", "output": str(output)}, f)
    try:
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit("cancelled")))
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError("TOTAL_REQUEST_TIMEOUT")))
        signal.alarm(args.timeout_seconds)
        started = time.monotonic()
        import mlx.core as mx
        from mlx_lm import load, stream_generate
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
        if not mx.metal.is_available():
            raise RuntimeError("METAL_REQUIRED")
        mx.set_memory_limit(args.max_memory_gib * 1024**3)
        mx.set_cache_limit(512 * 1024**2)
        model, tokenizer = load(args.model, adapter_path=args.adapter, tokenizer_config={"trust_remote_code": False})
        model.eval()
        mx.eval(model.parameters())
        metadata = {"modelPath": str(Path(args.model).resolve()), "adapter": args.adapter,
                    "loadSeconds": time.monotonic() - started, "thinking": False,
                    "versions": {k: importlib.metadata.version(k) for k in ["mlx", "mlx-lm", "transformers", "numpy"]},
                    "grammar": "none; same raw generation for A/B", "memoryLimitGiB": args.max_memory_gib,
                    "mac16GB": "not-tested", "activation": False, "releaseQualified": False}
        results = []
        for i, row in enumerate(rows):
            tokens = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=False)
            if len(tokens) + 256 > 4096:
                raise ValueError("INPUT_TOO_LONG:" + row["id"])
            mx.random.seed(20260906 + i)
            t = time.monotonic()
            text, first, finish, count = "", None, None, 0
            error, value = None, None
            try:
                for r in stream_generate(model, tokenizer, tokens, max_tokens=256, sampler=make_sampler(temp=0, top_p=0.8, top_k=20),
                        logits_processors=make_logits_processors(presence_penalty=1.5, presence_context_size=512)):
                    if first is None:
                        first = time.monotonic() - t
                    text += r.text
                    count += 1
                    finish = r.finish_reason
                    if time.monotonic() - t > 90:
                        raise TimeoutError("REQUEST_TIMEOUT")
                value = json.loads(text)
            except (ValueError, TimeoutError) as e:
                error = str(e)
            valid = isinstance(value, dict) and list(value) == ["verdict"] and value["verdict"] in ["supported", "contradicted", "not-stated"]
            results.append({"id": row["id"], "requestDigest": row["requestDigest"], "seed": 20260906+i,
                            "text": text, "value": value, "error": error, "finish": finish, "tokens": count,
                            "seconds": time.monotonic()-t, "firstTokenSeconds": first, "outputContractPass": valid})
            partial = {"metadata": metadata, "results": results, "complete": False}
            from worker import put
            put(str(output) + ".partial", partial)
            mx.clear_cache()
        metadata.update(peakMetalBytes=mx.get_peak_memory(), totalSeconds=time.monotonic()-started)
        put(output, {"metadata": metadata, "results": results, "complete": True,
                     "warning": "Source verdicts are model judgments, not semantic proof. Run source/checklist validation; human review remains required."})
        print(json.dumps({"output": str(output), "requests": len(results), "contractPass": all(r["outputContractPass"] for r in results), "releaseQualified": False}))
    finally:
        signal.alarm(0)
        if lock.exists() and json.loads(lock.read_text()).get("pid") == os.getpid():
            lock.unlink()


if __name__ == "__main__":
    main()

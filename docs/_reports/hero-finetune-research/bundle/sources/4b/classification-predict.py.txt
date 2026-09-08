"""Offline, bounded one-request inference. No publishing or parameter changes."""
import argparse
import hashlib
import json
import os
import platform
import signal
import time
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

def validate_request(request):
    if not isinstance(request, dict) or request.get("task") not in ["vfx", "mechanism"]:
        raise ValueError("TASK")
    messages = request.get("messages")
    if not isinstance(messages, list) or len(messages) != 2 or not all(isinstance(m, dict) for m in messages):
        raise ValueError("MESSAGES")
    if [m.get("role") for m in messages] != ["system", "user"] or not all(isinstance(m.get("content"), str) for m in messages):
        raise ValueError("MESSAGES")
    actual = hashlib.sha256(json.dumps(messages, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    if actual != request.get("requestDigest"):
        raise ValueError("REQUEST_CHANGED")
    payload = json.loads(messages[1]["content"])
    expected = "vfx-semantic" if request["task"] == "vfx" else "mechanism-template"
    if payload.get("task") != expected or not isinstance(payload.get("request"), str) or not payload["request"].strip():
        raise ValueError("TASK_PAYLOAD")
    if payload.get("catalog") != request.get("candidates") or not isinstance(payload.get("catalog"), list) or not payload["catalog"]:
        raise ValueError("CATALOG_CHANGED")
    return request

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--adapter")
    p.add_argument("--request", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--runtime-root", required=True)
    p.add_argument("--max-memory-gib", type=int, default=12)
    args = p.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("MAC_ARM64_ONLY")
    if not Path(args.model).is_dir() or (args.adapter and not Path(args.adapter).is_dir()) or Path(args.output).exists():
        raise RuntimeError("LOCAL_MODEL_AND_NEW_OUTPUT_REQUIRED")
    request = validate_request(json.loads(Path(args.request).read_text()))
    if not 4 <= args.max_memory_gib <= 80:
        raise RuntimeError("MEMORY_LIMIT_RANGE")
    lock = Path(args.runtime_root) / "gpu.lock"
    with lock.open("x") as f:
        f.write(json.dumps({"pid": os.getpid(), "kind": "manual-classification-inference"}))
    try:
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit("cancelled")))
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError("TOTAL_REQUEST_TIMEOUT")))
        signal.alarm(120)
        total_started = time.monotonic()
        import mlx.core as mx
        from mlx_lm import load, stream_generate
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
        if not mx.metal.is_available():
            raise RuntimeError("METAL_REQUIRED")
        mx.set_memory_limit(args.max_memory_gib * 1024**3)
        mx.set_cache_limit(512 * 1024**2)
        model, tokenizer = load(args.model, adapter_path=args.adapter,
                                tokenizer_config={"trust_remote_code": False})
        model.eval()
        mx.eval(model.parameters())
        mx.random.seed(20260906)
        load_seconds = time.monotonic() - total_started
        tokens = tokenizer.apply_chat_template(request["messages"], tokenize=True,
                  add_generation_prompt=True, enable_thinking=False, return_dict=False)
        if len(tokens) + 256 > 4096:
            raise RuntimeError("INPUT_TOO_LONG")
        started = time.monotonic()
        text = ""
        error = None
        try:
            for r in stream_generate(model, tokenizer, tokens, max_tokens=256,
                      sampler=make_sampler(temp=0),
                      logits_processors=make_logits_processors(presence_penalty=1.5, presence_context_size=512)):
                text += r.text
                if time.monotonic() - started > 90:
                    raise TimeoutError("REQUEST_TIMEOUT")
            value = json.loads(text)
        except (ValueError, TimeoutError) as e:
            value = None
            error = str(e)
        output = {"requestDigest": request["requestDigest"], "model": args.model,
                  "adapter": args.adapter, "value": value, "raw": text,
                  "seconds": time.monotonic()-started, "loadSeconds": load_seconds,
                  "totalSeconds": time.monotonic()-total_started,
                  "peakMetalBytes": mx.get_peak_memory(), "memoryLimitGiB": args.max_memory_gib,
                  "error": error, "mac16GB": "not-tested",
                  "thinking": False, "activation": False, "inputIntegrityVerified": True,
                  "status": "unvalidated-recommendation; run classification-client validation"}
        with Path(args.output).open("x") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(json.dumps({"output": args.output, "seconds": output["seconds"]}))
    finally:
        signal.alarm(0)
        if lock.exists() and json.loads(lock.read_text()).get("pid") == os.getpid():
            lock.unlink()

if __name__ == "__main__":
    main()

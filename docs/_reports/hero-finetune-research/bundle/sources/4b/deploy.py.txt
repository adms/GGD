"""Optional local adapter fusion/fixed-precision round trip. Does not select on test."""
import argparse
import atexit
import gc
import json
import os
import signal
import shutil
import time
from datetime import datetime
from pathlib import Path
from worker import put, sha

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    p.add_argument("--policy", required=True)
    p.add_argument("--dev-requests", required=True)
    p.add_argument("--destination", required=True)
    p.add_argument("--report", required=True)
    p.add_argument("--lease-dir", required=True)
    p.add_argument("--bits", type=int, choices=[4, 8], default=4)
    args = p.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    policy = json.loads(Path(args.policy).read_text())
    if any(policy.get(k) is not False for k in ["cloudGpu", "cloudFallback", "externalTeacher", "publish", "activateInEditor"]):
        raise RuntimeError("LOCAL_ONLY")
    remaining = int(datetime.fromisoformat(policy["deadline"].replace("Z", "+00:00")).timestamp()-time.time()-policy["reportReserveSeconds"])
    if remaining <= 0:
        raise TimeoutError("DEADLINE")
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError("DEPLOY_TIMEOUT")))
    signal.alarm(min(remaining, 1800))
    destination = Path(args.destination).resolve()
    if destination.exists():
        raise RuntimeError("REFUSE_OVERWRITE")
    lock = Path(args.lease_dir).resolve()/"gpu.lock"
    with lock.open("x") as f:
        json.dump({"pid": os.getpid(), "root": str(Path(args.report).resolve().parent), "kind": "deployment"}, f)
    def release():
        if lock.exists() and json.loads(lock.read_text()).get("pid") == os.getpid():
            lock.unlink()
    atexit.register(release)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit("cancelled")))
    for f in manifest["adapterArtifacts"]:
        if sha(f["path"]) != f["sha256"]:
            raise RuntimeError("ADAPTER_HASH")
    base = manifest["base"]
    for f in base["files"]:
        if sha(Path(base["path"])/f["name"]) != f["sha256"]:
            raise RuntimeError("BASE_HASH")
    import mlx.core as mx
    from mlx.utils import tree_flatten, tree_unflatten
    from mlx_lm import load
    from mlx_lm.utils import save, quantize_model
    import platform
    if platform.system() != "Darwin" or platform.machine() != "arm64" or not mx.metal.is_available():
        raise RuntimeError("METAL_ARM64_REQUIRED")
    mx.set_memory_limit(policy["maxMemoryGiB"]*1024**3)
    mx.set_cache_limit(1024**3)
    started = time.monotonic()
    model, tokenizer, config = load(base["path"], adapter_path=manifest["adapter"], return_config=True,
                                    tokenizer_config={"trust_remote_code": False})
    model.eval()
    adapter_weights = mx.load(str(Path(manifest["adapter"])/"adapters.safetensors"))
    actual = dict(tree_flatten(model.parameters()))
    if any(k not in actual or not bool(mx.array_equal(v, actual[k]).item()) for k, v in adapter_weights.items()):
        raise RuntimeError("ADAPTER_NOT_LOADED_EXACTLY")
    del actual, adapter_weights
    rows = json.loads(Path(args.dev_requests).read_text())[:2]
    prompts = [tokenizer.apply_chat_template(r["messages"], tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=False) for r in rows]
    def logits(m):
        return [m(mx.array([tokens]))[:, -1, :].astype(mx.float32) for tokens in prompts]
    before = logits(model)
    mx.eval(before)
    modules = [(n, m.fuse()) for n, m in model.named_modules() if hasattr(m, "fuse")]
    if not modules:
        raise RuntimeError("NO_LORA_TO_FUSE")
    model.update_modules(tree_unflatten(modules))
    del modules
    after = logits(model)
    mx.eval(after)
    fusion_diff = max(float(mx.max(mx.abs(a-b)).item()) for a, b in zip(before, after))
    same_top1 = [int(mx.argmax(a).item()) == int(mx.argmax(b).item()) for a, b in zip(before, after)]
    fused = destination / "fused-bf16"
    save(fused, base["path"], model, tokenizer, config, donate_model=False)
    shutil.copyfile(Path(base["path"])/"LICENSE", fused/"LICENSE")
    del model
    gc.collect()
    mx.clear_cache()
    reloaded, tokenizer, config = load(str(fused), return_config=True, tokenizer_config={"trust_remote_code": False})
    reloaded.eval()
    roundtrip = logits(reloaded)
    mx.eval(roundtrip)
    reload_diff = max(float(mx.max(mx.abs(a-b)).item()) for a, b in zip(after, roundtrip))
    if reload_diff > 0.001:
        raise RuntimeError("FUSED_RELOAD_DRIFT:"+str(reload_diff))
    quantized, qconfig = quantize_model(reloaded, config, group_size=64, bits=args.bits)
    quantized.eval()
    q_before = logits(quantized)
    mx.eval(q_before)
    qpath = destination / f"mlx-{args.bits}bit"
    save(qpath, str(fused), quantized, tokenizer, qconfig, donate_model=False)
    shutil.copyfile(Path(base["path"])/"LICENSE", qpath/"LICENSE")
    del quantized, reloaded
    gc.collect()
    mx.clear_cache()
    qmodel, qtokenizer = load(str(qpath), tokenizer_config={"trust_remote_code": False})
    qmodel.eval()
    q_after = logits(qmodel)
    mx.eval(q_after)
    q_diff = max(float(mx.max(mx.abs(a-b)).item()) for a, b in zip(q_before, q_after))
    if q_diff > 0.001:
        raise RuntimeError("QUANTIZED_RELOAD_DRIFT:"+str(q_diff))
    qprompt = qtokenizer.apply_chat_template(rows[0]["messages"], tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=False)
    if qprompt != prompts[0]:
        raise RuntimeError("TOKENIZER_DRIFT")
    files = [{"path": str(f), "bytes": f.stat().st_size, "sha256": sha(f)} for f in sorted(destination.rglob("*")) if f.is_file()]
    put(args.report, {"status": "roundtrip-pass", "baseRevision": base["revision"], "adapter": manifest["adapter"],
                      "adapterLoadedExactly": True, "fusionMaxLogitDifference": fusion_diff, "fusionTop1Equal": same_top1,
                      "fusedReloadMaxLogitDifference": reload_diff, "quantizedReloadMaxLogitDifference": q_diff,
                      "tokenizerExact": True, "devProbeCount": len(prompts), "files": files, "quantizationBits": args.bits,
                      "fusedPath": str(fused), "quantizedPath": str(qpath), "peakMetalBytes": mx.get_peak_memory(),
                      "seconds": time.monotonic()-started, "mac16GB": "not-tested", "qualityQualified": False,
                      "limitations": ["Two dev next-token probes establish only serialization/numerical wiring, not task quality.", f"No test-driven precision selection; fixed affine {args.bits}-bit group64.", "Peak covers fusion/conversion, not standalone 16GB inference."]})
    print(json.dumps({"status": "roundtrip-pass", "report": args.report}), flush=True)


if __name__ == "__main__":
    main()

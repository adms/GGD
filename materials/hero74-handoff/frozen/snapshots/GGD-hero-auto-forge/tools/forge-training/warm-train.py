"""Explicit one-pass LoRA warm-start. Fresh Adam/RNG; NOT exact resume."""
import argparse
import json
import math
import os
import platform
import random
import time
from datetime import datetime
from pathlib import Path
from worker import put, sha


def main():
    p = argparse.ArgumentParser()
    for key in ["model", "adapter", "policy", "data", "output"]:
        p.add_argument("--" + key, required=True)
    args = p.parse_args()
    policy = json.loads(Path(args.policy).read_text())
    if policy.get("schema") != "ggd-contrastive-warmstart-experiment@5":
        raise ValueError("POLICY_SCHEMA")
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("MAC_ARM64_ONLY")
    if any(policy.get(k) is not False for k in ["cloudGpu", "cloudFallback", "externalTeacher", "publish", "activateInEditor", "thinking"]):
        raise ValueError("LOCAL_ONLY_POLICY")
    if policy["cloudGpuSpendLimit"] != 0 or policy["trainingEpochs"] != 1:
        raise ValueError("BOUNDED_ONE_PASS_REQUIRED")
    deadline = datetime.fromisoformat(policy["trainingStopAt"].replace("Z", "+00:00")).timestamp()
    if time.time() >= datetime.fromisoformat(policy["trainingCutoff"].replace("Z", "+00:00")).timestamp():
        raise TimeoutError("TRAINING_START_CUTOFF")
    def check():
        if time.time() >= deadline:
            raise TimeoutError("TRAINING_STOP_RESERVE")
    check()
    out = Path(args.output)
    if out.exists():
        raise ValueError("REFUSE_OVERWRITE")
    source = Path(args.adapter)
    if sha(source / "adapters.safetensors") != policy["initialAdapterSha256"]:
        raise ValueError("INITIAL_ADAPTER_CHANGED")
    config = json.loads((source / "adapter_config.json").read_text())
    if config != {"fine_tune_type": "lora", "num_layers": 8, "lora_parameters": {"rank": 16, "scale": 16.0, "dropout": 0.0}}:
        raise ValueError("UNREVIEWED_LORA_CONFIG")
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten, tree_map
    from mlx_lm import load
    from mlx_lm.tuner.utils import linear_to_lora_layers
    from mlx_lm.tuner.trainer import grad_checkpoint
    if not mx.metal.is_available():
        raise RuntimeError("METAL_REQUIRED")
    mx.set_memory_limit(policy["maxMemoryGiB"] * 1024**3)
    mx.set_cache_limit(2 * 1024**3)
    mx.random.seed(policy["seed"])
    started = time.monotonic()
    model, tokenizer = load(args.model, tokenizer_config={"trust_remote_code": False})
    model.freeze()
    linear_to_lora_layers(model, config["num_layers"], config["lora_parameters"])
    trainable = dict(tree_flatten(model.trainable_parameters()))
    saved = mx.load(str(source / "adapters.safetensors"))
    if set(saved) != set(trainable) or not all("lora_" in k for k in trainable):
        raise ValueError("TRAINABLE_KEYS_MISMATCH")
    model.load_weights(list(saved.items()), strict=False)
    trainable = dict(tree_flatten(model.trainable_parameters()))
    mx.eval(model.parameters())
    if not all(v.shape == saved[k].shape and v.dtype == saved[k].dtype and bool(mx.all(v == saved[k]).item()) for k, v in trainable.items()):
        raise ValueError("WARM_START_NOT_EXACT_WEIGHTS")
    del saved
    out.mkdir()
    put(out / "adapter_config.json", config)
    mx.save_safetensors(str(out / "initial.safetensors"), trainable)
    initial_hash = sha(out / "initial.safetensors")
    examples = []
    for line in Path(args.data).read_text().splitlines():
        row = json.loads(line)
        prompt = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True, enable_thinking=False, return_dict=False)
        target = json.dumps(row["target"], ensure_ascii=False, separators=(",", ":"))
        completion = tokenizer.encode(target, add_special_tokens=False)
        if tokenizer.decode(completion) != target:
            raise ValueError("TARGET_ROUNDTRIP")
        tokens = prompt + completion + [tokenizer.eos_token_id]
        if len(tokens) > policy["maxSequenceTokens"]:
            raise ValueError("INPUT_TOO_LONG:" + row["id"])
        examples.append((tokens, len(prompt)))
    if len(examples) != 628:
        raise ValueError("TRAIN_COUNT")
    grad_checkpoint(model.layers[0])
    model.train()
    optimizer = optim.Adam(learning_rate=5e-6)
    def loss_fn(m, tokens, offset):
        x = mx.array([tokens])
        logits = m(x[:, :-1])
        mask = mx.arange(1, len(tokens)) >= offset
        loss = nn.losses.cross_entropy(logits, x[:, 1:]).astype(mx.float32)
        return (loss * mask).sum() / mask.sum()
    value_and_grad = nn.value_and_grad(model, loss_fn)
    order = list(range(len(examples)))
    random.Random(policy["seed"]).shuffle(order)
    accumulated, step, maximum_gradient, checkpoints = None, 0, 0.0, []
    total_steps = math.ceil(len(examples) / 4)
    for j, index in enumerate(order):
        check()
        t = time.monotonic()
        loss, grads = value_and_grad(model, *examples[index])
        mx.eval(loss, grads)
        scalar = float(loss.item())
        finite = all(bool(mx.all(mx.isfinite(v)).item()) for _, v in tree_flatten(grads))
        if not finite or not math.isfinite(scalar):
            raise RuntimeError("NONFINITE_LOSS_OR_GRADIENT")
        maximum_gradient = max(maximum_gradient, max(float(mx.max(mx.abs(v)).item()) for _, v in tree_flatten(grads)))
        accumulated = grads if accumulated is None else tree_map(lambda a, b: a + b, accumulated, grads)
        count = j % 4 + 1
        if count == 4 or j == len(order)-1:
            optimizer.update(model, tree_map(lambda x: x/count, accumulated))
            mx.eval(model.parameters(), optimizer.state)
            accumulated = None
            step += 1
            if step in [80, total_steps]:
                checkpoint = out / f"step-{step}"
                checkpoint.mkdir()
                put(checkpoint / "adapter_config.json", config)
                mx.save_safetensors(str(checkpoint / "adapters.safetensors"), dict(tree_flatten(model.trainable_parameters())))
                checkpoints.append({"step": step, "examplesSeen": j+1, "adapter": str(checkpoint), "sha256": sha(checkpoint / "adapters.safetensors")})
                put(out / "checkpoints.json", checkpoints)
        record = {"example": j+1, "step": step, "loss": scalar, "seconds": time.monotonic()-t, "peakMetalBytes": mx.get_peak_memory()}
        with (out / "metrics.jsonl").open("a") as f:
            f.write(json.dumps(record)+"\n")
        if j % 4 == 0:
            print(json.dumps(record), flush=True)
        mx.clear_cache()
    if maximum_gradient == 0 or checkpoints[-1]["sha256"] == initial_hash:
        raise RuntimeError("NO_LEARNING_SIGNAL")
    result = {"status": "pass", "modelPath": str(Path(args.model).resolve()), "initialAdapter": str(source.resolve()), "initialAdapterSha256": policy["initialAdapterSha256"], "restoredAllTrainableValuesExactly": True, "initialSerializedSha256": initial_hash, "recipe": {**config, "learningRate": 5e-6, "epochs": 1, "gradientAccumulation": 4, "microBatch": 1}, "examples": len(examples), "optimizerSteps": step, "gradientsFinite": True, "maximumGradient": maximum_gradient, "peakMetalBytes": mx.get_peak_memory(), "totalSeconds": time.monotonic()-started, "checkpoints": checkpoints, "thinking": False, "resume": "Explicit R3 weight warm-start; fresh Adam and RNG, not exact optimizer resume", "releaseQualified": False}
    put(out / "training-run.json", result)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()

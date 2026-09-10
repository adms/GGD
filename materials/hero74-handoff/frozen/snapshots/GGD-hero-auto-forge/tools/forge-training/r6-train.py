"""Bounded joint R3 weight warm-start, fresh Adam. Not optimizer resume.
Save each 16 completed updates and at clean cutoff; never score partial grads.
"""
import argparse
import json
import math
import platform
import random
import signal
import time
from datetime import datetime
from pathlib import Path
from worker import put, sha


def main():
    parser = argparse.ArgumentParser()
    for key in ["model", "adapter", "policy", "data", "output"]:
        parser.add_argument("--" + key, required=True)
    args = parser.parse_args()
    policy = json.loads(Path(args.policy).read_text())
    if policy.get("schema") != "ggd-joint-source-stack-experiment@6":
        raise ValueError("POLICY_SCHEMA")
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("MAC_ARM64_ONLY")
    if any(policy.get(k) is not False for k in ["cloudGpu", "cloudFallback", "externalTeacher", "publish", "activateInEditor", "thinking"]):
        raise ValueError("LOCAL_ONLY_POLICY")
    if policy["cloudGpuSpendLimit"] != 0 or policy["trainingEpochs"] != 1:
        raise ValueError("ONE_LOCAL_PASS_ONLY")
    timestamp = lambda k: datetime.fromisoformat(policy[k].replace("Z", "+00:00")).timestamp()
    if time.time() >= timestamp("trainingCutoff"):
        raise TimeoutError("TRAINING_START_CUTOFF")
    stop_reason = None

    def requested_stop(signum, _frame):
        nonlocal stop_reason
        stop_reason = "SIGNAL_" + str(signum)
    signal.signal(signal.SIGTERM, requested_stop)
    signal.signal(signal.SIGINT, requested_stop)
    source, out = Path(args.adapter), Path(args.output)
    if out.exists():
        raise ValueError("REFUSE_OVERWRITE")
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
    saved = mx.load(str(source / "adapters.safetensors"))
    trainable = dict(tree_flatten(model.trainable_parameters()))
    if set(saved) != set(trainable) or not all("lora_" in k for k in trainable):
        raise ValueError("TRAINABLE_KEYS_MISMATCH")
    model.load_weights(list(saved.items()), strict=False)
    mx.eval(model.parameters())
    if not all(v.shape == saved[k].shape and v.dtype == saved[k].dtype and bool(mx.all(v == saved[k]).item()) for k, v in tree_flatten(model.trainable_parameters())):
        raise ValueError("WARM_START_NOT_EXACT")
    del saved
    examples, ids = [], []
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
        ids.append(row["id"])
    if len(examples) != policy["trainRows"] or len(set(ids)) != len(ids):
        raise ValueError("TRAIN_COUNT_OR_DUPLICATE")
    out.mkdir()
    put(out / "adapter_config.json", config)
    mx.save_safetensors(str(out / "initial.safetensors"), dict(tree_flatten(model.trainable_parameters())))
    initial_hash = sha(out / "initial.safetensors")
    order = list(range(len(examples)))
    random.Random(policy["seed"]).shuffle(order)
    put(out / "training-order.json", [ids[i] for i in order])
    grad_checkpoint(model.layers[0])
    model.train()
    optimizer = optim.Adam(learning_rate=policy["learningRate"])

    def loss_fn(m, tokens, offset):
        x = mx.array([tokens])
        logits = m(x[:, :-1])
        mask = mx.arange(1, len(tokens)) >= offset
        loss = nn.losses.cross_entropy(logits, x[:, 1:]).astype(mx.float32)
        return (loss * mask).sum() / mask.sum()
    value_and_grad = nn.value_and_grad(model, loss_fn)
    accumulated, step, committed_examples, processed = None, 0, 0, 0
    maximum_gradient, checkpoints = 0.0, []

    def save_checkpoint():
        if step == 0 or any(c["step"] == step for c in checkpoints):
            return
        checkpoint = out / f"step-{step}"
        checkpoint.mkdir()
        put(checkpoint / "adapter_config.json", config)
        mx.save_safetensors(str(checkpoint / "adapters.safetensors"), dict(tree_flatten(model.trainable_parameters())))
        checkpoints.append({"step": step, "examplesSeen": committed_examples, "adapter": str(checkpoint), "sha256": sha(checkpoint / "adapters.safetensors"), "weightUpdateComplete": True, "optimizerResumeAvailable": False})
        put(out / "checkpoints.json", checkpoints)
        print(json.dumps({"checkpoint": checkpoints[-1]}), flush=True)

    for j, index in enumerate(order):
        if time.time() >= timestamp("trainingStopAt"):
            stop_reason = stop_reason or "TRAINING_STOP_RESERVE"
        if stop_reason:
            break
        tick = time.monotonic()
        loss, grads = value_and_grad(model, *examples[index])
        mx.eval(loss, grads)
        scalar = float(loss.item())
        if not math.isfinite(scalar) or not all(bool(mx.all(mx.isfinite(v)).item()) for _, v in tree_flatten(grads)):
            raise RuntimeError("NONFINITE_LOSS_OR_GRADIENT")
        maximum_gradient = max(maximum_gradient, max(float(mx.max(mx.abs(v)).item()) for _, v in tree_flatten(grads)))
        accumulated = grads if accumulated is None else tree_map(lambda a, b: a + b, accumulated, grads)
        count = j % policy["gradientAccumulation"] + 1
        if count == policy["gradientAccumulation"] or j == len(order) - 1:
            optimizer.update(model, tree_map(lambda v: v / count, accumulated))
            mx.eval(model.parameters(), optimizer.state)
            accumulated = None
            step += 1
            committed_examples = j + 1
        processed = j + 1
        record = {"example": processed, "id": ids[index], "step": step, "committedExamples": committed_examples, "loss": scalar, "seconds": time.monotonic() - tick, "peakMetalBytes": mx.get_peak_memory()}
        with (out / "metrics.jsonl").open("a") as f:
            f.write(json.dumps(record) + "\n")
        if j % 4 == 0:
            print(json.dumps(record), flush=True)
        if accumulated is None and step % policy["saveEverySteps"] == 0:
            save_checkpoint()
        mx.clear_cache()
    # Partial gradient accumulation is deliberately discarded, never applied.
    accumulated = None
    save_checkpoint()
    if not checkpoints or maximum_gradient == 0 or checkpoints[-1]["sha256"] == initial_hash:
        raise RuntimeError("NO_COMPLETE_LEARNING_CHECKPOINT")
    complete = committed_examples == len(examples)
    result = {"status": "complete" if complete else "partial-checkpoints", "trainingComplete": complete, "stopReason": stop_reason, "modelPath": str(Path(args.model).resolve()), "initialAdapter": str(source.resolve()), "initialAdapterSha256": policy["initialAdapterSha256"], "restoredAllTrainableValuesExactly": True, "initialSerializedSha256": initial_hash, "recipe": {**config, "learningRate": policy["learningRate"], "epochs": 1, "gradientAccumulation": policy["gradientAccumulation"], "microBatch": 1}, "preparedExamples": len(examples), "processedExamples": processed, "committedExamples": committed_examples, "discardedPartialGradientExamples": processed - committed_examples, "optimizerSteps": step, "maximumGradient": maximum_gradient, "peakMetalBytes": mx.get_peak_memory(), "totalSeconds": time.monotonic() - started, "checkpoints": checkpoints, "thinking": False, "optimizerResumeAvailable": False, "releaseQualified": False}
    put(out / "training-run.json", result)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()

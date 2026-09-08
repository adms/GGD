"""Local MLX worker. No network, provider API, or model-generated code execution."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import random
import signal
import time
from datetime import datetime
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def put(file, value):
    p = Path(file)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.with_suffix(p.suffix + ".tmp").write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    p.with_suffix(p.suffix + ".tmp").replace(p)


def sha(file):
    h = hashlib.sha256()
    with open(file, "rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["doctor", "train", "eval"])
    p.add_argument("--model", required=True)
    p.add_argument("--policy", required=True)
    p.add_argument("--data", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--adapter")
    p.add_argument("--kind", choices=["sanity", "formal"], default="sanity")
    p.add_argument("--epochs", type=int, choices=[1, 2, 3], default=3)
    args = p.parse_args()
    policy = json.loads(Path(args.policy).read_text())
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("MAC_ARM64_ONLY")
    if any(policy.get(k) is not False for k in ["cloudGpu", "cloudFallback", "externalTeacher", "publish", "activateInEditor"]) or policy.get("cloudGpuSpendLimit") != 0:
        raise RuntimeError("LOCAL_ONLY_POLICY_VIOLATION")
    deadline = datetime.fromisoformat(policy["deadline"].replace("Z", "+00:00")).timestamp()
    # Always reserve report time; never leave a long worker beyond the deadline.
    cutoff = deadline - policy["reportReserveSeconds"]
    def check():
        if time.time() >= cutoff:
            raise TimeoutError("REPORT_RESERVE_REACHED")
    check()
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten, tree_map
    from mlx_lm import load, stream_generate
    from mlx_lm.sample_utils import make_sampler, make_logits_processors
    from mlx_lm.tuner.utils import linear_to_lora_layers
    from mlx_lm.tuner.trainer import grad_checkpoint
    if not mx.metal.is_available():
        raise RuntimeError("METAL_REQUIRED")
    mx.set_memory_limit(policy["maxMemoryGiB"] * 1024**3)
    mx.set_cache_limit(2 * 1024**3)
    mx.random.seed(policy["seed"])
    started = time.monotonic()
    model, tokenizer = load(args.model, adapter_path=args.adapter,
                            tokenizer_config={"trust_remote_code": False})
    mx.eval(model.parameters())
    load_seconds = time.monotonic() - started
    model.eval()
    metadata = {"platform": platform.platform(), "machine": platform.machine(),
                "device": mx.metal.device_info(), "loadSeconds": load_seconds,
                "modelPath": str(Path(args.model).resolve()), "adapter": args.adapter,
                "versions": {k: importlib.metadata.version(k) for k in ["mlx", "mlx-lm", "transformers", "numpy"]},
                "thinking": False, "grammar": "none; same raw generation for A/B"}
    def prompt_tokens(messages):
        tokens = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                               enable_thinking=False, return_dict=False)
        if not isinstance(tokens, list) or not tokens:
            raise RuntimeError("TOKENIZER_OUTPUT")
        return tokens

    if args.command in ["doctor", "train"]:
        raw = [json.loads(line) for line in Path(args.data).read_text().splitlines() if line]
        examples = []
        for row in raw:
            prompt = prompt_tokens(row["messages"])
            target = json.dumps(row["target"], ensure_ascii=False, separators=(",", ":"))
            completion = tokenizer.encode(target, add_special_tokens=False)
            if tokenizer.decode(completion) != target or not completion:
                raise RuntimeError("TARGET_ROUNDTRIP")
            tokens = prompt + completion + [tokenizer.eos_token_id]
            if len(tokens) > policy["maxSequenceTokens"]:
                raise RuntimeError(f"INPUT_TOO_LONG:{row['id']}:{len(tokens)}")
            examples.append((tokens, len(prompt)))
        metadata["tokens"] = {"count": len(examples), "min": min(len(t) for t, _ in examples),
                              "max": max(len(t) for t, _ in examples),
                              "minCompletion": min(len(t)-o for t, o in examples),
                              "mask": "loss positions >= prompt length; completion plus EOS only",
                              "promptSuffix": tokenizer.decode(examples[0][0][:examples[0][1]])[-100:]}
        if args.command == "doctor":
            metadata.update(status="pass", peakMetalBytes=mx.get_peak_memory())
            put(args.output, metadata)
            print(json.dumps(metadata, ensure_ascii=False), flush=True)
            return

        if time.time() >= datetime.fromisoformat(policy["trainingCutoff"].replace("Z", "+00:00")).timestamp():
            raise TimeoutError("TRAINING_START_CUTOFF")
        if args.adapter:
            raise RuntimeError("FORMAL_MUST_START_CLEAN; no implicit warm restart")
        out = Path(args.output)
        out.mkdir(parents=True, exist_ok=True)
        if (out / "adapter_config.json").exists():
            raise RuntimeError("REFUSE_OVERWRITE_ADAPTER")
        config = {"fine_tune_type": "lora", "num_layers": 8,
                  "lora_parameters": {"rank": 16, "scale": 16.0, "dropout": 0.0}}
        model.freeze()
        linear_to_lora_layers(model, config["num_layers"], config["lora_parameters"])
        trainable = dict(tree_flatten(model.trainable_parameters()))
        if not trainable or not all("lora_" in k for k in trainable):
            raise RuntimeError("INVALID_TRAINABLE_PARAMETERS")
        mx.eval(trainable)
        mx.save_safetensors(str(out / "initial.safetensors"), trainable)
        initial_hash = sha(out / "initial.safetensors")
        put(out / "adapter_config.json", config)
        if args.kind == "sanity":
            # One example per training family, not eight near-copies from
            # the family containing the exact retrieval exemplar.
            examples = examples[::max(1, len(examples)//8)][:8]
        # Gradient checkpointing applies to all blocks of this model class.
        grad_checkpoint(model.layers[0])
        model.train()
        # Two previous train-only probes showed overshoot. Check a small
        # full-probe gradient step before permitting the formal recipe.
        lr = 1e-6 if args.kind == "sanity" else 5e-6
        accumulate = 8 if args.kind == "sanity" else 4
        epochs = 2 if args.kind == "sanity" else args.epochs
        optimizer = optim.Adam(learning_rate=lr)
        def loss_fn(m, tokens, offset):
            x = mx.array([tokens])
            logits = m(x[:, :-1])
            positions = mx.arange(1, len(tokens))
            mask = positions >= offset
            loss = nn.losses.cross_entropy(logits, x[:, 1:]).astype(mx.float32)
            return (loss * mask).sum() / mask.sum()
        value_and_grad = nn.value_and_grad(model, loss_fn)
        probes = examples if args.kind == "sanity" else examples[::max(1, len(examples)//8)][:8]
        before_losses = [float(loss_fn(model, *probe).item()) for probe in probes]
        before = sum(before_losses)/len(before_losses)
        records = []
        accumulated = None
        step = 0
        maximum_gradient = 0.0
        rng = random.Random(policy["seed"])
        completed_epochs = 0
        for epoch in range(epochs):
            if epoch and policy.get("evaluationReserveSeconds"):
                estimate = sum(r["seconds"] for r in records if r["epoch"] == epoch) * 1.3
                if time.time() + estimate + policy["evaluationReserveSeconds"] >= cutoff:
                    print(json.dumps({"trainingStoppedAfterEpoch": epoch, "reason": "reserve_full_evaluation", "estimatedNextEpochSeconds": estimate}), flush=True)
                    break
            indices = list(range(len(examples)))
            rng.shuffle(indices)
            for j, index in enumerate(indices):
                check()
                t = time.monotonic()
                loss, grads = value_and_grad(model, *examples[index])
                mx.eval(loss, grads)
                finite = all(bool(mx.all(mx.isfinite(v)).item()) for _, v in tree_flatten(grads))
                scalar = float(loss.item())
                if not math.isfinite(scalar) or not finite:
                    raise RuntimeError("NONFINITE_LOSS_OR_GRADIENT")
                maximum_gradient = max(maximum_gradient, max(float(mx.max(mx.abs(v)).item()) for _, v in tree_flatten(grads)))
                accumulated = grads if accumulated is None else tree_map(lambda a, b: a+b, accumulated, grads)
                count = j % accumulate + 1
                if count == accumulate or j == len(indices)-1:
                    optimizer.update(model, tree_map(lambda x: x/count, accumulated))
                    mx.eval(model.parameters(), optimizer.state)
                    accumulated = None
                    step += 1
                record = {"epoch": epoch+1, "example": j+1, "step": step, "loss": scalar,
                          "seconds": time.monotonic()-t, "peakMetalBytes": mx.get_peak_memory()}
                records.append(record)
                with (out / "metrics.jsonl").open("a") as f:
                    f.write(json.dumps(record)+"\n")
                if j % 4 == 0:
                    print(json.dumps(record), flush=True)
                mx.clear_cache()
            checkpoint = out / f"epoch-{epoch+1}"
            checkpoint.mkdir()
            put(checkpoint / "adapter_config.json", config)
            mx.save_safetensors(str(checkpoint / "adapters.safetensors"), dict(tree_flatten(model.trainable_parameters())))
            completed_epochs = epoch + 1
        after_losses = [float(loss_fn(model, *probe).item()) for probe in probes]
        after = sum(after_losses)/len(after_losses)
        mx.save_safetensors(str(out / "adapters.safetensors"), dict(tree_flatten(model.trainable_parameters())))
        final_hash = sha(out / "adapters.safetensors")
        metadata.update(status="pass", kind=args.kind, recipe={**config, "learningRate": lr, "epochs": completed_epochs, "plannedEpochs": epochs, "gradientAccumulation": accumulate, "microBatch": 1},
                        trainableParameters=sum(v.size for v in trainable.values()), beforeProbeLoss=before, afterProbeLoss=after,
                        probeLossesBefore=before_losses, probeLossesAfter=after_losses, probeAggregation="mean over 8 family-stratified train probes; not heldout performance",
                        adapterChanged=initial_hash!=final_hash, initialHash=initial_hash, adapterHash=final_hash,
                        gradientsFinite=True, maximumGradient=maximum_gradient, optimizerSteps=step,
                        peakMetalBytes=mx.get_peak_memory(), totalSeconds=time.monotonic()-started,
                        resume="stage resume only; checkpoint loading is warm-restart, not exact optimizer/RNG resume")
        if not metadata["adapterChanged"] or maximum_gradient == 0:
            raise RuntimeError("NO_LEARNING_SIGNAL")
        put(out / "training-run.json", metadata)
        print(json.dumps(metadata, ensure_ascii=False), flush=True)
        return

    rows = json.loads(Path(args.data).read_text())
    results = []
    if Path(args.output).exists():
        raise RuntimeError("REFUSE_OVERWRITE_EVALUATION")
    for index, row in enumerate(rows):
        check()
        tokens = prompt_tokens(row["messages"])
        if len(tokens)+policy["maxOutputTokens"] > policy["maxSequenceTokens"]:
            raise RuntimeError("EVAL_INPUT_TOO_LONG:"+row["id"])
        mx.random.seed(policy["seed"]+index)
        start = time.monotonic()
        first = None
        text = ""
        count = 0
        finish = None
        error = None
        try:
            for response in stream_generate(model, tokenizer, tokens, max_tokens=policy["maxOutputTokens"],
                    sampler=make_sampler(temp=policy["temperature"], top_p=policy["topP"], top_k=policy["topK"]),
                    logits_processors=make_logits_processors(presence_penalty=policy["presencePenalty"], presence_context_size=512)):
                if first is None:
                    first = time.monotonic()-start
                text += response.text
                count += 1
                finish = response.finish_reason
                if time.monotonic()-start > 90:
                    raise TimeoutError("REQUEST_TIMEOUT")
                check()
            value = json.loads(text)
        except (ValueError, TimeoutError) as e:
            value = None
            error = str(e)
        result = {"id": row["id"], "requestDigest": row["requestDigest"], "seed": policy["seed"]+index,
                  "text": text, "value": value, "error": error, "finish": finish, "tokens": count,
                  "seconds": time.monotonic()-start, "firstTokenSeconds": first}
        results.append(result)
        put(args.output+".partial", {"metadata": metadata, "results": results, "complete": False})
        print(json.dumps({k:result[k] for k in ["id", "seconds", "tokens", "error"]}), flush=True)
        mx.clear_cache()
    metadata["peakMetalBytes"] = mx.get_peak_memory()
    put(args.output, {"metadata": metadata, "results": results, "complete": True})


if __name__ == "__main__":
    main()

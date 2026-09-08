"""One optimizer step on a source-anchored, development-exposed technical fixture.
Not a hero-training experiment, learned-quality claim, or deployable adapter.
"""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hero12b_gpu', HERE / 'gpu-smoke.py')
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)
OUT = HERE / 'lora-compat-v2'


def worker(token):
    assert gpu.read(gpu.LOCK)['token'] == token, 'SUPERVISOR_LOCK_REQUIRED'
    data = gpu.read(OUT / 'fixture.json')
    from transformers import AutoTokenizer
    model_path = gpu.read(HERE / 'gpu-preflight-v1.json')['modelDirectory']
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True, trust_remote_code=False)
    messages = [{'role': 'system', 'content': '只依給定原文輸出 JSON，不補上其他遊戲機制。'},
                {'role': 'user', 'content': data['sourceQuote'] + '\n判斷 Q 與 EX 是否獨立，以及 EX 是否需要 Q 命中作為前置条件。'}]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    answer = json.dumps(data['target'], separators=(',', ':'))
    native_history = tokenizer.apply_chat_template(messages + [{'role': 'assistant', 'content': answer}],
                                         tokenize=False, add_generation_prompt=False, enable_thinking=False)
    # The pinned Gemma template omits the empty thought channel when rendering
    # assistant history, but emits it for non-thinking generation. Align SFT to
    # the actual inference prefix; take the answer/end-turn suffix from the
    # native history renderer after checking this exact provider-specific form.
    empty_thought = '<|channel>thought\n<channel|>'
    assert prompt.endswith(empty_thought), 'NONTHINKING_PREFIX_CHANGED'
    history_prefix = prompt[:-len(empty_thought)]
    assert native_history.startswith(history_prefix + answer), 'HISTORY_TEMPLATE_CHANGED'
    assert native_history[len(history_prefix):] == answer + '<turn|>\n', 'ANSWER_SUFFIX_CHANGED'
    full = prompt + native_history[len(history_prefix):]
    prefix_ids = tokenizer.encode(prompt, add_special_tokens=False)
    ids = tokenizer.encode(full, add_special_tokens=False)
    assert ids[:len(prefix_ids)] == prefix_ids and len(prefix_ids) < len(ids) <= 512, 'COMPLETION_MASK_BOUNDARY'
    gpu.atomic(OUT / 'tokenization.json', {'inputTokens': len(ids), 'promptTokens': len(prefix_ids),
        'targetTokens': len(ids) - len(prefix_ids), 'fullTextSha256': gpu.hashlib.sha256(full.encode()).hexdigest(),
        'trainingOnCompletionOnly': True, 'thinking': False,
        'chatAlignment': 'Gemma non-thinking generation prefix + verified native answer/end-turn suffix'})
    preflight = gpu.read(HERE / 'gpu-preflight-v1.json')
    for p in preflight['files']:
        assert gpu.digest(Path(model_path) / p['name']) == p['sha256'], 'MODEL_DRIFT'
    current = gpu.resources()
    assert current['acPower'] and current['availableBytes'] >= preflight['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten
    from mlx_vlm import load
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    mx.set_memory_limit(min(24 * gpu.GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    mx.random.seed(20260908)
    started = time.monotonic()
    model, processor = load(model_path, lazy=True, strict=True, trust_remote_code=False)
    mx.eval(model.parameters())
    load_seconds = time.monotonic() - started
    assert model.model_type == 'gemma4_unified', 'UNEXPECTED_ARCHITECTURE'
    batch = mx.array([ids], dtype=mx.int32)
    targets = batch[:, 1:]
    mask = (mx.arange(len(ids) - 1) >= len(prefix_ids) - 1)[None, :]

    def loss_fn(net):
        # Gemma4 Unified SFT uses mask=None and its native causal mask.
        logits = net(batch[:, :-1], pixel_values=None, mask=None, cache=None).logits.astype(mx.float32)
        assert logits.shape[:2] == targets.shape, 'SHIFTED_LOGIT_ALIGNMENT'
        losses = nn.losses.cross_entropy(logits, targets, reduction='none')
        return (losses * mask).sum() / mask.sum()

    model.eval(); base_loss = loss_fn(model).item()
    model.freeze()
    assert not tree_flatten(model.trainable_parameters()), 'BASE_NOT_FROZEN'
    lora_parameters = {'rank': 4, 'scale': 1.0, 'dropout': 0.0, 'keys': ['self_attn.q_proj', 'self_attn.o_proj']}
    linear_to_lora_layers(model, 1, lora_parameters)
    trainable = dict(tree_flatten(model.trainable_parameters()))
    assert len(trainable) == 4 and all(k.endswith(('lora_a', 'lora_b')) for k in trainable), 'UNEXPECTED_TRAINABLE_PARAMETERS'
    mx.eval(model.trainable_parameters())
    zero_loss = loss_fn(model).item()
    assert abs(base_loss - zero_loss) < 1e-5, 'ZERO_ADAPTER_CHANGED_BASE'
    before = {k: mx.array(v) for k, v in trainable.items()}
    mx.eval(before)
    model.train()
    optimizer = optim.Adam(learning_rate=1e-5)
    gradient_fn = nn.value_and_grad(model, loss_fn)
    mx.reset_peak_memory(); step_started = time.monotonic()
    loss, grads = gradient_fn(model)
    mx.eval(loss, grads)
    flat_grads = dict(tree_flatten(grads))
    assert set(flat_grads) == set(trainable), 'GRADIENT_SCOPE'
    assert all(mx.all(mx.isfinite(v)).item() for v in flat_grads.values()), 'NONFINITE_GRADIENT'
    grad_norm = mx.sqrt(sum(mx.sum(v.astype(mx.float32) ** 2) for v in flat_grads.values())).item()
    assert grad_norm > 0, 'NO_TRAINING_SIGNAL'
    optimizer.update(model, grads); mx.eval(model.trainable_parameters(), optimizer.state)
    step_seconds = time.monotonic() - step_started
    after = dict(tree_flatten(model.trainable_parameters()))
    changes = {k: mx.max(mx.abs(after[k] - before[k])).item() for k in after}
    assert any(v > 0 for v in changes.values()), 'ADAPTER_DID_NOT_CHANGE'
    model.eval(); after_loss = loss_fn(model).item()
    assert mx.isfinite(mx.array(after_loss)).item(), 'NONFINITE_LOSS'
    mx.save_safetensors(str(OUT / 'adapters.safetensors'), after)
    gpu.atomic(OUT / 'adapter_config.json', {'fine_tune_type': 'lora', 'num_layers': 1, 'lora_parameters': lora_parameters})
    saved = mx.load(str(OUT / 'adapters.safetensors'))
    assert set(saved) == set(trainable), 'SAVED_ADAPTER_KEY_MISMATCH'
    model.load_weights(list(before.items()), strict=False)
    assert abs(loss_fn(model).item() - zero_loss) < 1e-5, 'ADAPTER_ROLLBACK_FAILED'
    model.load_weights(list(saved.items()), strict=False)
    reloaded_loss = loss_fn(model).item()
    assert abs(reloaded_loss - after_loss) < 1e-5, 'ADAPTER_ROUNDTRIP_FAILED'
    gpu.atomic(OUT / 'result.json', {'schema': 'ggd-hero12b-lora-compat@1', 'technicalCompatibilityPassed': True,
        'modelDirectory': model_path, 'modelRevision': preflight['modelRevision'], 'modelType': model.model_type,
        'steps': 1, 'learningRate': 1e-5, 'trainableParameters': sum(v.size for v in trainable.values()),
        'trainedKeys': list(trainable), 'loadSeconds': load_seconds, 'stepSeconds': step_seconds,
        'baseLoss': base_loss, 'zeroAdapterLoss': zero_loss, 'stepLoss': loss.item(), 'afterLoss': after_loss,
        'reloadedLoss': reloaded_loss, 'gradientNorm': grad_norm, 'maxAbsoluteParameterChanges': changes,
        'peakMetalBytes': mx.get_peak_memory(), 'adapterSha256': gpu.digest(OUT / 'adapters.safetensors'),
        'fixtureSha256': gpu.digest(OUT / 'fixture.json'), 'workerSha256': gpu.digest(Path(__file__)),
        'fullHeroQualityMeasured': False, 'modelPromotionAllowed': False, 'releaseQualified': False,
        'limitation': 'One exposed, source-anchored technical fixture; loss change is not evidence of hero-generation improvement. Adapter is for compatibility only.'})


def main():
    assert not OUT.exists(), 'REFUSE_RESTART'
    previous = gpu.read(HERE / 'development-smoke-v2/state.json')
    assert previous['status'] == 'completed-inference-only' and previous['workerPid'] is None, 'BASELINE_GPU_NOT_FINISHED'
    start_resource = gpu.resources()
    assert start_resource['acPower'] and start_resource['availableBytes'] >= gpu.read(HERE / 'gpu-preflight-v1.json')['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not gpu.LOCK.exists(), 'GPU_LOCK_PRESENT'
    records = gpu.read(HERE / 'intake-v1/review-queue.private.json')
    source = next(r for r in records if r['id'] == 'community7-leesin')
    quote = '聲波與追擊分為 Q／EX，無二段重施放'
    assert quote in source['originalText'], 'UNANCHORED_FIXTURE'
    OUT.mkdir()
    gpu.atomic(OUT / 'fixture.json', {'scope': 'technical-compatibility-only; not corpus admission',
        'sourceHeroId': source['id'], 'sourceSha256': source['originalSha256'], 'sourceQuote': quote,
        'target': {'qExIndependent': True, 'exRequiresQHit': False}, 'blind': False, 'modelPromotionAllowed': False})
    token = uuid.uuid4().hex
    with gpu.LOCK.open('x') as stream: json.dump({'pid': os.getpid(), 'token': token, 'task': str(OUT)}, stream)
    state = {'status': 'starting', 'startedAt': time.time(), 'stepsMaximum': 1, 'secondsMaximum': 600,
             'preflight': start_resource, 'workerPid': None, 'samples': [],
             'scriptSha256': gpu.digest(Path(__file__)),
             'priorAttempt': 'lora-compat-v1 failed on CPU completion-prefix check before model loading; preserved unchanged'}
    child = None
    def interrupted(signum, frame): raise InterruptedError('INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    try:
        with (OUT / 'worker.log').open('x') as log:
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', token],
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); gpu.atomic(OUT / 'state.json', state)
            while child.poll() is None:
                time.sleep(2)
                sample = gpu.resources(); state['samples'].append(sample)
                violation = gpu.policy_violation(start_resource, sample, {'guard': {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, 'maxBatteryDropPoints': 2}})
                gpu.atomic(OUT / 'state.json', state)
                if (OUT / 'STOP').exists(): raise InterruptedError('USER_STOP')
                if violation: raise RuntimeError(violation)
                if time.time() - state['startedAt'] > 600: raise TimeoutError('COMPAT_TIME_LIMIT')
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            assert gpu.read(OUT / 'result.json')['technicalCompatibilityPassed']
            state['status'] = 'completed-compatibility-only'
    except BaseException as exc: state.update(status='stopped-or-failed', error=repr(exc))
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
        state.update(workerPid=None, finishedAt=time.time()); gpu.atomic(OUT / 'state.json', state)
        if gpu.LOCK.exists() and gpu.read(gpu.LOCK).get('token') == token: gpu.LOCK.unlink()
    print(json.dumps({k: v for k, v in state.items() if k != 'samples'}), flush=True)
    if state['status'] != 'completed-compatibility-only': raise SystemExit(1)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker': worker(sys.argv[2])
    else:
        assert len(sys.argv) == 1, 'USAGE: python lora-compat.py'
        main()

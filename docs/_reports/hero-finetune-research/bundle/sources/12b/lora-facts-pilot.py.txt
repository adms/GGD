"""Bounded auxiliary SFT and cross-task whole-hero transfer experiment.
Never overwrites a base model; no adoption by loss, train score or this tiny dev set.
"""
import argparse
import gc
import importlib.util
import json
import os
from pathlib import Path
import random
import signal
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hero12b_gpu', HERE / 'gpu-smoke.py')
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)
BASE_FACTS = HERE / 'semantic-facts-base-v2'
BASE_IR = HERE / 'ir2-jsonschema-smoke-v1'


def prepare(out):
    assert out.parent == HERE and not out.exists(), 'NEW_RESEARCH_DIRECTORY_REQUIRED'
    state = gpu.read(BASE_FACTS / 'state.json')
    assert state['status'] == 'completed-inference-only' and state['workerPid'] is None
    assessment = gpu.read(HERE / 'semantic-facts-base-v2-assessment/manifest.json')
    assert assessment['train']['strictContractValidHeroes'] < assessment['train']['heroes'], 'NO_OBSERVED_TRAIN_FAILURE'
    protocol = gpu.read(BASE_FACTS / 'manifest.json')
    rows = gpu.read(BASE_FACTS / 'dataset.private.json')
    assert gpu.json_hash(rows) == protocol['datasetSha256'], 'DATASET_DRIFT'
    for name, sha in protocol['checkerPins'].items():
        assert gpu.digest(HERE / name) == sha, 'FACT_CHECKER_DRIFT'
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(protocol['modelDirectory'], local_files_only=True, trust_remote_code=False)
    tokens = []
    for row in rows:
        if row['split'] != 'train':
            continue
        assert row['heroId'].startswith('community37-') and row['heroId'] != 'community37-32'
        messages = row['messages']
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        answer = json.dumps(row['target'], ensure_ascii=False, separators=(',', ':'))
        history = tokenizer.apply_chat_template(messages + [{'role': 'assistant', 'content': answer}], tokenize=False,
            add_generation_prompt=False, enable_thinking=False)
        empty_thought = '<|channel>thought\n<channel|>'
        assert prompt.endswith(empty_thought)
        plain_prefix = prompt[:-len(empty_thought)]
        assert history == plain_prefix + answer + '<turn|>\n', 'NATIVE_ASSISTANT_SUFFIX_CHANGED'
        full = prompt + answer + '<turn|>\n'
        prefix = tokenizer.encode(prompt, add_special_tokens=False)
        ids = tokenizer.encode(full, add_special_tokens=False)
        assert ids[:len(prefix)] == prefix and len(prefix) < len(ids) <= 1536, 'COMPLETION_MASK_BOUNDARY'
        tokens.append({'id': row['id'], 'heroId': row['heroId'], 'sourceFamily': row['sourceFamily'],
            'sourceSha256': row['sourceSha256'], 'ids': ids, 'promptTokens': len(prefix),
            'textSha256': gpu.hashlib.sha256(full.encode()).hexdigest()})
    assert len(tokens) == 12
    evaluation = {}
    for name, base in [('facts', BASE_FACTS), ('whole_hero', BASE_IR)]:
        p, requests, prompts = gpu.prepare(base)
        evaluation[name] = {'baseRun': base.name, 'protocol': p, 'requests': requests, 'prompts': prompts}
    checker_files = sorted(set(protocol['checkerFiles'] + gpu.read(BASE_IR / 'manifest.json')['checkerFiles'] +
        ['source-negative-probes.mts', 'probe-harness.mts', 'evaluate-lora-pilot.mts']))
    manifest = {'schema': 'ggd-hero12b-lora-fact-pilot@1', 'createdAt': time.time(),
        'purpose': 'auxiliary factual-label and citation/serialization SFT; whole-hero transfer is measured, never assumed',
        'steps': 24, 'saveEvery': 6, 'learningRate': 2e-5, 'numLayers': 2,
        'loraParameters': {'rank': 8, 'scale': 8.0, 'dropout': 0.0, 'keys': ['self_attn.q_proj', 'self_attn.o_proj']},
        'seed': 20260908, 'maxSequenceTokens': 1536, 'metalLimitGiB': 28, 'secondsMaximum': 1800,
        'stepSecondsMaximum': 120, 'modelDirectory': protocol['modelDirectory'], 'model': protocol['model'],
        'revision': protocol['revision'], 'datasetSha256': protocol['datasetSha256'],
        'tokenizedTrainingSha256': gpu.json_hash(tokens), 'evaluationSha256': gpu.json_hash(evaluation),
        'workerSha256': gpu.digest(Path(__file__)), 'baseSupervisorSha256': gpu.digest(HERE / 'gpu-smoke.py'),
        'checkerPins': {name: gpu.digest(HERE / name) for name in checker_files},
        'guard': protocol['guard'], 'selection': 'fixed final step 24; intermediate checkpoints retained, no selection by loss/test',
        'trainingScope': {'heroes': 12, 'claims': 72, 'task': 'source entailment, not executable hero mappings',
            'currentFourHeroDevExcluded': True, 'sourceFamilyDevExcluded': True, 'allHistoricallyExposed': True},
        'evaluationScope': {'factTrainHeroes': 12, 'factDevHeroes': 4, 'wholeHeroDevHeroes': 4},
        'fullHeroRecipeTrainingAdmitted': False, 'freshBlind': False, 'canPromoteModel': False,
        'stopPolicy': 'checkpoint every six steps; resource/AC/STOP violation stops only own worker; no automatic restart'}
    out.mkdir()
    gpu.atomic(out / 'manifest.json', manifest)
    gpu.atomic(out / 'tokens.private.json', tokens)
    gpu.atomic(out / 'evaluation.private.json', evaluation)
    gpu.atomic(out / 'preparation.json', {'cpuOnly': True, 'heroes': len(tokens),
        'tokenCounts': [len(x['ids']) for x in tokens], 'completionTokens': [len(x['ids']) - x['promptTokens'] for x in tokens],
        'completionOnly': True, 'trainingStarted': False})
    return manifest


def worker(out, token):
    assert gpu.read(gpu.LOCK)['token'] == token
    p = gpu.read(out / 'manifest.json')
    assert p['workerSha256'] == gpu.digest(Path(__file__))
    data = gpu.read(out / 'tokens.private.json')
    evaluation = gpu.read(out / 'evaluation.private.json')
    assert gpu.json_hash(data) == p['tokenizedTrainingSha256']
    assert gpu.json_hash(evaluation) == p['evaluationSha256']
    for name, expected in p['checkerPins'].items():
        assert gpu.digest(HERE / name) == expected, 'CHECKER_DRIFT'
    preflight = gpu.read(HERE / 'gpu-preflight-v1.json')
    for f in preflight['files']:
        assert gpu.digest(Path(p['modelDirectory']) / f['name']) == f['sha256'], 'MODEL_DRIFT'
    now = gpu.resources()
    assert now['acPower'] and now['availableBytes'] >= preflight['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten
    from mlx_vlm import load, stream_generate
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    mx.set_memory_limit(min(p['metalLimitGiB'] * gpu.GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    mx.random.seed(p['seed'])
    gpu.atomic(out / 'worker-progress.json', {'pid': os.getpid(), 'phase': 'loading', 'startedAt': time.time()})
    started = time.monotonic()
    model, processor = load(p['modelDirectory'], lazy=True, strict=True, trust_remote_code=False)
    mx.eval(model.parameters()); model.freeze()
    assert model.model_type == 'gemma4_unified' and not tree_flatten(model.trainable_parameters())
    linear_to_lora_layers(model, p['numLayers'], p['loraParameters'])
    params = dict(tree_flatten(model.trainable_parameters()))
    assert len(params) == p['numLayers'] * 2 * 2 and all(k.endswith(('lora_a', 'lora_b')) for k in params), 'TRAINABLE_SCOPE'
    mx.eval(model.trainable_parameters())
    initial_adapter = {k: mx.array(v) for k, v in params.items()}
    load_seconds = time.monotonic() - started
    optimizer = optim.Adam(learning_rate=p['learningRate'])

    def loss_fn(net, ids, prefix):
        batch = mx.array([ids], dtype=mx.int32)
        target = batch[:, 1:]
        mask = (mx.arange(len(ids) - 1) >= prefix - 1)[None, :]
        logits = net(batch[:, :-1], pixel_values=None, mask=None, cache=None).logits.astype(mx.float32)
        assert logits.shape[:2] == target.shape
        loss = nn.losses.cross_entropy(logits, target, reduction='none')
        return (loss * mask).sum() / mask.sum()

    model.eval()
    def teacher_losses(phase):
        losses = []
        for row in data:
            if (out / 'STOP').exists(): raise InterruptedError('USER_STOP')
            gpu.atomic(out / 'worker-progress.json', {'pid': os.getpid(), 'phase': phase,
                'id': row['id'], 'startedAt': time.time()})
            losses.append(loss_fn(model, row['ids'], row['promptTokens']).item())
            gc.collect(); mx.clear_cache()
        return losses
    baseline_losses = teacher_losses('zero_adapter_teacher_loss')
    gpu.atomic(out / 'baseline-teacher-loss.json', {'ids': [x['id'] for x in data], 'losses': baseline_losses,
        'selectionMetric': False, 'completionOnly': True, 'zeroInitializedAdapter': True})
    gradient_fn = nn.value_and_grad(model, loss_fn)
    rng = random.Random(p['seed']); order = []
    while len(order) < p['steps']:
        cycle = list(range(len(data))); rng.shuffle(cycle); order.extend(cycle)
    trace = []; checkpoints = []
    model.train()
    for step, index in enumerate(order[:p['steps']], 1):
        if (out / 'STOP').exists(): raise InterruptedError('USER_STOP')
        violation = gpu.policy_violation(now, gpu.resources(), p)
        if violation: raise RuntimeError(violation)
        row = data[index]; start = time.monotonic(); mx.reset_peak_memory()
        gpu.atomic(out / 'worker-progress.json', {'pid': os.getpid(), 'phase': 'training', 'step': step, 'startedAt': time.time()})
        loss, grads = gradient_fn(model, row['ids'], row['promptTokens'])
        mx.eval(loss, grads)
        flat = dict(tree_flatten(grads)); assert set(flat) == set(params), 'GRADIENT_SCOPE'
        assert all(mx.all(mx.isfinite(v)).item() for v in flat.values()), 'NONFINITE_GRADIENT'
        optimizer.update(model, grads); mx.eval(model.trainable_parameters(), optimizer.state)
        trace.append({'step': step, 'id': row['id'], 'loss': loss.item(), 'seconds': time.monotonic() - start,
            'peakMetalBytes': mx.get_peak_memory(), 'tokens': len(row['ids'])})
        gpu.atomic(out / 'training-trace.json', trace)
        if step % p['saveEvery'] == 0:
            checkpoint = out / f'checkpoint-{step:04d}'; checkpoint.mkdir()
            cfg = {'fine_tune_type': 'lora', 'num_layers': p['numLayers'], 'lora_parameters': p['loraParameters']}
            gpu.atomic(checkpoint / 'adapter_config.json', cfg)
            mx.save_safetensors(str(checkpoint / 'adapters.safetensors'), dict(tree_flatten(model.trainable_parameters())))
            checkpoints.append({'step': step, 'path': checkpoint.name, 'sha256': gpu.digest(checkpoint / 'adapters.safetensors')})
            gpu.atomic(out / 'checkpoints.json', checkpoints)
        del grads, flat, loss
        gc.collect(); mx.clear_cache()
    model.eval()
    after_losses = teacher_losses('trained_teacher_loss')
    gpu.atomic(out / 'after-teacher-loss.json', {'ids': [x['id'] for x in data], 'losses': after_losses, 'selectionMetric': False})
    final_checkpoint = checkpoints[-1]
    gpu.atomic(out / 'worker-progress.json', {'pid': os.getpid(), 'phase': 'adapter_roundtrip', 'startedAt': time.time()})
    saved = mx.load(str(out / final_checkpoint['path'] / 'adapters.safetensors'))
    assert set(saved) == set(params), 'ADAPTER_SAVED_SCOPE'
    model.load_weights(list(initial_adapter.items()), strict=False)
    reset_loss = loss_fn(model, data[0]['ids'], data[0]['promptTokens']).item()
    assert abs(reset_loss - baseline_losses[0]) < 1e-5, 'FROZEN_BASE_CHANGED'
    model.load_weights(list(saved.items()), strict=False)
    reload_loss = loss_fn(model, data[0]['ids'], data[0]['promptTokens']).item()
    assert abs(reload_loss - after_losses[0]) < 1e-5, 'ADAPTER_ROUNDTRIP_FAILED'
    gpu.atomic(out / 'adapter-roundtrip.json', {'resetLoss': reset_loss, 'reloadLoss': reload_loss,
        'savedKeys': list(saved), 'baseResetMatches': True, 'trainedReloadMatches': True})
    del optimizer, gradient_fn, saved, initial_adapter
    gc.collect(); mx.clear_cache()
    # All outputs are from the declared final step, not whichever checkpoint looks best.
    for kind, run in evaluation.items():
        results = []; proto = run['protocol']
        for index, (request, prompt) in enumerate(zip(run['requests'], run['prompts'])):
            if (out / 'STOP').exists(): raise InterruptedError('USER_STOP')
            mx.random.seed(proto['seed']); mx.reset_peak_memory(); start = time.monotonic()
            gpu.atomic(out / 'worker-progress.json', {'pid': os.getpid(), 'phase': 'generating', 'kind': kind,
                'index': index, 'id': request['id'], 'startedAt': time.time()})
            text, last, first_token = '', None, None
            stream = stream_generate(model, processor, prompt, max_tokens=proto['maxTokens'], temperature=0,
                top_p=1.0, top_k=0, prefill_step_size=proto['prefillStepSize'], enable_thinking=False,
                seed=proto['seed'], verbose=False)
            try:
                for count, chunk in enumerate(stream):
                    if first_token is None: first_token = time.monotonic() - start
                    text += chunk.text; last = chunk
                    if count % 128 == 0: gpu.atomic(out / 'active-case.partial.json', {'kind': kind, 'id': request['id'], 'text': text})
                    if time.monotonic() - start > proto['caseSeconds']: raise TimeoutError('CASE_TIME_LIMIT')
                    if (out / 'STOP').exists(): raise InterruptedError('USER_STOP')
            finally: stream.close()
            results.append({'id': request['id'], 'requestDigest': request['requestDigest'],
                'envelope': {'channel': 'final', 'text': text, 'finishReason': last.finish_reason if last else None},
                'seconds': time.monotonic() - start, 'firstTokenSeconds': first_token,
                'promptSha256': gpu.hashlib.sha256(prompt.encode()).hexdigest(),
                'promptTokens': last.prompt_tokens if last else None, 'generationTokens': last.generation_tokens if last else None,
                'peakMetalBytes': mx.get_peak_memory(), 'adapterSha256': final_checkpoint['sha256']})
            gpu.atomic(out / f'{kind}-raw.partial.json', {'complete': False, 'results': results})
            gc.collect(); mx.clear_cache()
        gpu.atomic(out / f'{kind}-raw.json', {'complete': True, 'results': results, 'baseRun': run['baseRun'],
            'adapter': final_checkpoint, 'requestSha256': proto['requestSha256']})
    gpu.atomic(out / 'result.json', {'schema': 'ggd-hero12b-lora-fact-pilot-result@1', 'steps': len(trace),
        'trainableParameters': sum(v.size for v in params.values()), 'trainedKeys': list(params),
        'loadSeconds': load_seconds, 'trainingStepSeconds': sum(x['seconds'] for x in trace),
        'peakTrainingMetalBytes': max(x['peakMetalBytes'] for x in trace),
        'checkpoint': final_checkpoint, 'baselineMeanLoss': sum(baseline_losses) / len(baseline_losses),
        'adapterReloadVerified': True,
        'afterMeanLoss': sum(after_losses) / len(after_losses), 'lossIsAdoptionMetric': False,
        'workerSeconds': time.monotonic() - started, 'workerSha256': p['workerSha256'],
        'manifestSha256': gpu.digest(out / 'manifest.json'), 'modelPromoted': False, 'releaseQualified': False})


def supervise(out):
    p = gpu.read(out / 'manifest.json')
    assert not (out / 'state.json').exists() and not (out / 'STOP').exists(), 'REFUSE_RESTART'
    assert p['workerSha256'] == gpu.digest(Path(__file__)) and p['baseSupervisorSha256'] == gpu.digest(HERE / 'gpu-smoke.py')
    start = gpu.resources()
    assert start['acPower'] and start['availableBytes'] >= gpu.read(HERE / 'gpu-preflight-v1.json')['minimumAvailableBytes']
    token = uuid.uuid4().hex
    with gpu.LOCK.open('x') as f: json.dump({'pid': os.getpid(), 'task': str(out), 'token': token}, f)
    state = {'status': 'starting', 'pid': os.getpid(), 'workerPid': None, 'startedAt': time.time(), 'preflight': start,
        'samples': [], 'modelPromotion': False, 'manifestSha256': gpu.digest(out / 'manifest.json')}
    child = None
    def interrupted(signum, frame): raise InterruptedError('INTERRUPTED')
    signal.signal(signal.SIGINT, interrupted); signal.signal(signal.SIGTERM, interrupted)
    try:
        with (out / 'worker.log').open('x') as log:
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), str(out), '--worker', token],
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); gpu.atomic(out / 'state.json', state)
            while child.poll() is None:
                time.sleep(2); sample = gpu.resources(); state['samples'].append(sample); gpu.atomic(out / 'state.json', state)
                violation = gpu.policy_violation(start, sample, p)
                if (out / 'STOP').exists(): violation = 'USER_STOP'
                if time.time() - state['startedAt'] > p['secondsMaximum']: violation = 'PILOT_TIME_LIMIT'
                if (out / 'worker-progress.json').exists():
                    progress = gpu.read(out / 'worker-progress.json'); assert progress['pid'] == child.pid
                    limit = p['stepSecondsMaximum'] if progress['phase'] == 'training' else 610
                    if time.time() - progress['startedAt'] > limit: violation = 'PHASE_TIME_LIMIT'
                if violation: raise RuntimeError(violation)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            assert gpu.read(out / 'result.json')['steps'] == p['steps']
            state['status'] = 'completed-pilot-not-promoted'
    except BaseException as exc: state.update(status='stopped-or-failed', error=repr(exc))
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
        state.update(workerPid=None, finishedAt=time.time()); gpu.atomic(out / 'state.json', state)
        if gpu.LOCK.exists() and gpu.read(gpu.LOCK).get('token') == token: gpu.LOCK.unlink()
    print(json.dumps({k: v for k, v in state.items() if k != 'samples'}), flush=True)
    if state['status'] != 'completed-pilot-not-promoted': raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('directory', type=Path)
    parser.add_argument('--prepare', action='store_true'); parser.add_argument('--worker')
    args = parser.parse_args(); out = args.directory.resolve()
    assert out.parent == HERE
    if args.prepare: print(json.dumps(prepare(out), ensure_ascii=False, indent=2))
    elif args.worker: worker(out, args.worker)
    else: supervise(out)

"""Protected, paired generation using the fixed final one-epoch adapter.

prepare is CPU-only and requires terminal successful training. run executes one
arm only, with exclusive GPU ownership, no restart, no repair and no promotion.
"""
import argparse
from contextlib import contextmanager
import gc
import importlib.util
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import uuid

SCRIPT = Path(__file__).resolve()


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPT.with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


t = module('inference_resource_guards', 'hero-distillation-train.py')
g = module('inference_generation', 'hero-distillation-generation.py')
SOURCES = [SCRIPT, t.SCRIPT, SCRIPT.with_name('hero-distillation-generation.py')]


def public_cases(file):
    import json
    rows = [json.loads(line) for line in Path(file).read_text().splitlines()]
    g.validate_cases(rows)
    return rows


def final_checkpoint(run):
    p = t.read(run / 'manifest.json')
    state = t.read(run / 'train/state.json')
    assert state['status'] == 'completed' and state['workerPid'] is None, 'TRAIN_NOT_TERMINAL_SUCCESS'
    assert state['manifestSha256'] == t.digest(run / 'manifest.json'), 'TRAIN_MANIFEST_DRIFT'
    result = t.read(run / 'train/result.json')
    assert result['steps'] == p['steps'] and p['epochs'] == 1, 'INCOMPLETE_EPOCH'
    assert result['uniqueTrainingTasks'] == p['steps'], 'REPEATED_TRAINING_TASKS'
    receipt = t.read(run / 'train/adapter-roundtrip.json')
    assert receipt['passed'] is True and len(receipt['tensorKeys']) == 8, 'ROUNDTRIP_REQUIRED'
    checkpoint = result['checkpoint']
    assert checkpoint['step'] == p['steps'], 'NOT_FINAL_CHECKPOINT'
    assert checkpoint['path'] == f'checkpoint-{p["steps"]:04d}', 'UNSAFE_CHECKPOINT_PATH'
    folder = run / 'train' / checkpoint['path']
    assert t.digest(folder / 'adapters.safetensors') == checkpoint['sha256'], 'ADAPTER_DRIFT'
    config = t.read(folder / 'adapter_config.json')
    assert config == {'fine_tune_type': 'lora', 'num_layers': p['numLayers'],
                      'lora_parameters': p['loraParameters']}, 'ADAPTER_CONFIG_DRIFT'
    return p, folder, receipt['tensorKeys']


def prepare(run, evaluation, out):
    assert not out.exists(), 'REFUSE_OVERWRITE'
    p, adapter, keys = final_checkpoint(run)
    em = t.read(evaluation / 'manifest.json')
    # Never open the private teacher file, even to hash it.
    for name in ['public-cases.jsonl', 'plan.json']:
        assert t.digest(evaluation / name) == em['outputs'][name], 'EVAL_INPUT_DRIFT'
    plan = t.read(evaluation / 'plan.json')
    assert plan['sourceManifestSha256'] == p['frozenManifestSha256'], 'DATASET_MISMATCH'
    assert plan['arms']['base']['modelRevision'] == p['modelRevision'], 'MODEL_REVISION_MISMATCH'
    rows = public_cases(evaluation / 'public-cases.jsonl')
    assert [r['id'] for r in rows if r['slot'] == 'HERO'] == plan['primaryCaseIds'], 'PRIMARY_CASE_DRIFT'
    assert [r['id'] for r in rows if r['slot'] != 'HERO'] == plan['secondaryCaseIds'], 'SECONDARY_CASE_DRIFT'
    assert len(rows) == plan['counts']['tasks'], 'CASE_COUNT_DRIFT'
    manifest = {'schema': 'ggd-distillation-protected-inference@1',
        'trainingManifestSha256': t.digest(run / 'manifest.json'),
        'trainingResultSha256': t.digest(run / 'train/result.json'),
        'evaluationManifestSha256': t.digest(evaluation / 'manifest.json'),
        'publicCasesSha256': t.digest(evaluation / 'public-cases.jsonl'),
        'evaluationPlanSha256': t.digest(evaluation / 'plan.json'),
        'sources': {f.name: t.digest(f) for f in SOURCES},
        'modelDirectory': p['modelDirectory'], 'modelRevision': p['modelRevision'],
        'baseFiles': p['baseFiles'], 'adapterDirectory': str(adapter),
        'adapterSha256': t.digest(adapter / 'adapters.safetensors'),
        'adapterConfigSha256': t.digest(adapter / 'adapter_config.json'), 'tensorKeys': keys,
        'counts': plan['counts'], 'caseIds': [r['id'] for r in rows],
        'decoding': g.decoding_contract(), 'arithmetic': 'gemma4-native-kv-fp32-sdpa-v1',
        'arithmeticNote': 'Same forward-only inference policy for both arms; not the training custom-VJP or PrefixKV execution path.',
        'guard': p['guard'], 'minimumAvailableBytes': p['minimumAvailableBytes'],
        'metalLimitGiB': p['metalLimitGiB'], 'secondsMaximumPerArm': 7200,
        'phaseSecondsMaximum': 610, 'automaticRestart': False, 'attemptsPerCase': 1,
        'blindTest': False, 'teacherAccess': 'No teacher file copied or opened by generation code; not an OS sandbox claim.',
        'scoring': 'Raw generation only. Schema/compiler/behavior/game checks are separate and still required.',
        'modelPromoted': False, 'fullHeroE2EProven': False}
    out.mkdir(parents=True)
    shutil.copyfile(evaluation / 'public-cases.jsonl', out / 'public-cases.jsonl')
    shutil.copyfile(evaluation / 'plan.json', out / 'evaluation-plan.json')
    (out / 'source').mkdir()
    for file in SOURCES:
        shutil.copyfile(file, out / 'source' / file.name)
    t.atomic(out / 'manifest.json', manifest)
    return manifest


def verify_bundle(directory):
    p = t.read(directory / 'manifest.json')
    assert p['schema'] == 'ggd-distillation-protected-inference@1'
    for file in SOURCES:
        assert t.digest(file) == p['sources'][file.name], 'RUNNER_DRIFT'
        assert t.digest(directory / 'source' / file.name) == p['sources'][file.name], 'SNAPSHOT_DRIFT'
    assert t.digest(directory / 'public-cases.jsonl') == p['publicCasesSha256'], 'PUBLIC_INPUT_DRIFT'
    assert t.digest(directory / 'evaluation-plan.json') == p['evaluationPlanSha256'], 'PLAN_DRIFT'
    assert p['decoding'] == g.decoding_contract(), 'DECODING_DRIFT'
    assert p['arithmetic'] == 'gemma4-native-kv-fp32-sdpa-v1', 'ARITHMETIC_DRIFT'
    rows = public_cases(directory / 'public-cases.jsonl')
    assert [r['id'] for r in rows] == p['caseIds'], 'CASE_ORDER_DRIFT'
    return p, rows


@contextmanager
def fp32_attention(mx, language):
    original = language.scaled_dot_product_attention

    def attention(queries, keys, values, cache, scale, mask, sinks=None):
        assert cache is None or type(cache).__name__ in ['KVCache', 'RotatingKVCache'], 'UNTESTED_KV_CACHE'
        # Preserve native causal/sliding masks and offsets. Only SDPA arithmetic
        # is FP32; projections, native KV storage and returned dtype are unchanged.
        if hasattr(mask, 'dtype') and mx.issubdtype(mask.dtype, mx.floating):
            mask = mask.astype(mx.float32)
        if sinks is not None:
            sinks = sinks.astype(mx.float32)
        return mx.fast.scaled_dot_product_attention(queries.astype(mx.float32), keys.astype(mx.float32),
            values.astype(mx.float32), scale=scale, mask=mask, sinks=sinks).astype(queries.dtype)
    language.scaled_dot_product_attention = attention
    try:
        yield
    finally:
        language.scaled_dot_product_attention = original


def worker(directory, arm, token):
    work = directory / arm
    lock = t.read(t.LOCK)
    assert lock['token'] == token and lock['task'] == str(work), 'OWNED_LOCK_REQUIRED'
    p, cases = verify_bundle(directory)

    def interrupted(signum, frame):
        raise InterruptedError('SUPERVISOR_STOP')
    signal.signal(signal.SIGTERM, interrupted)

    def progress(phase, **fields):
        t.atomic(work / 'worker-progress.json', {'pid': os.getpid(), 'phase': phase,
                                               'startedAt': time.time(), **fields})
    progress('verify-model')
    for entry in p['baseFiles']:
        file = Path(p['modelDirectory']) / entry['name']
        assert file.resolve().is_relative_to(Path(p['modelDirectory']).resolve()), 'UNSAFE_BASE_PATH'
        assert file.stat().st_size == entry['bytes'] and t.digest(file) == entry['sha256'], 'BASE_DRIFT'
    adapter = Path(p['adapterDirectory'])
    assert t.digest(adapter / 'adapters.safetensors') == p['adapterSha256'], 'ADAPTER_DRIFT'
    assert t.digest(adapter / 'adapter_config.json') == p['adapterConfigSha256'], 'ADAPTER_CONFIG_DRIFT'
    import mlx.core as mx
    from mlx.utils import tree_flatten
    from mlx_vlm import load
    from mlx_vlm.models.gemma4 import language
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    mx.set_memory_limit(min(p['metalLimitGiB'] * t.GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    progress('load-model')
    model, processor = load(p['modelDirectory'], lazy=True, strict=True, trust_remote_code=False)
    model.freeze()
    if arm == 'lora':
        config = t.read(adapter / 'adapter_config.json')
        linear_to_lora_layers(model, config['num_layers'], config['lora_parameters'])
        params = dict(tree_flatten(model.trainable_parameters()))
        saved = mx.load(str(adapter / 'adapters.safetensors'))
        assert set(params) == set(saved) == set(p['tensorKeys']), 'ADAPTER_KEYS_MISMATCH'
        assert all(params[k].shape == saved[k].shape for k in params), 'ADAPTER_SHAPE_MISMATCH'
        assert all(mx.all(mx.isfinite(v)).item() for v in saved.values()), 'NONFINITE_ADAPTER'
        model.load_weights(list(saved.items()), strict=False)
        actual = dict(tree_flatten(model.trainable_parameters()))
        assert all(mx.array_equal(actual[k], saved[k]).item() for k in saved), 'ADAPTER_LOAD_MISMATCH'
        t.atomic(work / 'adapter-loaded.json', {'sha256': p['adapterSha256'], 'tensorKeys': sorted(saved), 'passed': True})
    model.eval(); mx.eval(model.parameters()); mx.reset_peak_memory()
    tokenizer = getattr(processor, 'tokenizer', processor)
    records = []

    def emit(record):
        record.update(arm=arm, peakMetalBytes=mx.get_peak_memory())
        t.atomic(work / f'case-{len(records):04d}.json', record)
        records.append({k: record[k] for k in ['id', 'complete', 'outputFormatMatches', 'seconds']})
        t.atomic(work / 'index.json', records)
        gc.collect(); mx.clear_cache(); mx.reset_peak_memory()
    with fp32_attention(mx, language):
        g.generate_cases(cases, tokenizer, g.mlx_stream_factory(model, processor), emit, progress)
    assert [r['id'] for r in records] == p['caseIds'], 'INCOMPLETE_BATCH'
    t.atomic(work / 'result.json', {'arm': arm, 'attempted': len(records),
        'completeOutputs': sum(r['complete'] for r in records),
        'modelPromoted': False, 'fullHeroE2EProven': False})


def supervise(directory, arm):
    assert arm in ['base', 'lora'], 'UNKNOWN_ARM'
    p, _ = verify_bundle(directory)
    work = directory / arm
    assert not work.exists(), 'REFUSE_RESTART_OR_OVERWRITE'
    start = t.resources()
    assert start['acPower'] and start['availableBytes'] >= p['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not t.violation(start, start, p['guard']), 'RESOURCE_GUARD'
    token, child, locked, created = uuid.uuid4().hex, None, False, False
    state = {'status': 'starting', 'pid': os.getpid(), 'workerPid': None, 'arm': arm,
             'startedAt': time.time(), 'manifestSha256': t.digest(directory / 'manifest.json'), 'preflight': start}

    def interrupted(signum, frame):
        raise InterruptedError('INTERRUPTED')
    previous = {sig: signal.getsignal(sig) for sig in [signal.SIGINT, signal.SIGTERM]}
    try:
        t.LOCK.parent.mkdir(parents=True, exist_ok=True)
        with t.LOCK.open('x') as stream:
            locked = True
            stream.write(g.compact({'pid': os.getpid(), 'task': str(work), 'token': token}))
        work.mkdir(); created = True
        for sig in previous:
            signal.signal(sig, interrupted)
        with (work / 'worker.log').open('x') as log, (work / 'resources.jsonl').open('x') as trace:
            child = subprocess.Popen([sys.executable, str(SCRIPT), 'worker', '--run', str(directory),
                        '--arm', arm, '--token', token], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); t.atomic(work / 'state.json', state)
            while child.poll() is None:
                time.sleep(2)
                sample = t.resources(); trace.write(g.compact(sample)+'\n'); trace.flush()
                reason = t.violation(start, sample, p['guard'])
                if (work / 'STOP').exists(): reason = 'USER_STOP'
                if time.time()-state['startedAt'] > p['secondsMaximumPerArm']: reason = 'RUN_TIME_LIMIT'
                if (work / 'worker-progress.json').exists():
                    status = t.read(work / 'worker-progress.json')
                    assert status['pid'] == child.pid, 'WORKER_PID_MISMATCH'
                    if time.time()-status['startedAt'] > p['phaseSecondsMaximum']: reason = 'PHASE_TIME_LIMIT'
                if reason: raise RuntimeError(reason)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            result = t.read(work / 'result.json')
            assert result['arm'] == arm and result['attempted'] == len(p['caseIds']), 'INCOMPLETE_RESULT'
            state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
    finally:
        try:
            if child is not None and child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
            state.update(workerPid=None, finishedAt=time.time())
            if created: t.atomic(work / 'state.json', state)
        finally:
            if locked and t.LOCK.exists() and t.read(t.LOCK).get('token') == token: t.LOCK.unlink()
            for sig, handler in previous.items(): signal.signal(sig, handler)
    print(g.compact(state), flush=True)
    if state['status'] != 'completed': raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'run', 'worker'])
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--evaluation', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--arm', choices=['base', 'lora']); parser.add_argument('--token')
    args = parser.parse_args()
    if args.action == 'prepare':
        assert args.evaluation and args.out
        print(g.compact(prepare(args.run.resolve(), args.evaluation.resolve(), args.out.resolve())['counts']))
    elif args.action == 'worker':
        assert args.arm and args.token
        worker(args.run.resolve(), args.arm, args.token)
    else:
        assert args.arm
        supervise(args.run.resolve(), args.arm)

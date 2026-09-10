"""Freeze public compact-evaluation cases without exposing teacher answers.

This is deliberately only the preparation half.  It can run while training is
active, but requires a terminal successful adapter before it writes a run
bundle.  GPU generation is a separate protected worker.
"""
import hashlib
import importlib.util
import json
import gc
import os
import signal
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

SCRIPT = Path(__file__).resolve()


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPT.with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


t = module('compact_eval_training', 'hero-distillation-train.py')
SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX']


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def atomic(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def read(path):
    return json.loads(Path(path).read_text())


def public_heroes(dataset, split='dev'):
    """Make per-hero public inputs.  No message assistant content is copied;
    the resulting object is suitable for both Base and LoRA generation."""
    dataset = Path(dataset).resolve()
    manifest = read(dataset / 'manifest.json')
    assert manifest['schema'] == 'ggd-distillation-compact-frozen-data@1', 'COMPACT_DATASET_REQUIRED'
    assert sha_bytes((dataset / 'examples.json').read_bytes()) == manifest['outputs']['examples.json'], 'DATASET_DRIFT'
    examples, bindings = read(dataset / 'examples.json'), read(dataset / 'asset-bindings.json')
    selected = [row for row in examples if row['split'] == split]
    groups = {}
    for row in selected:
        groups.setdefault(row['heroId'], []).append(row)
    heroes = []
    for hero_id, rows in sorted(groups.items()):
        whole = [row for row in rows if row['stage'] == 'select']
        configurations = [row for row in rows if row['stage'] == 'configure']
        assert len(whole) == 1 and {row['slot'] for row in configurations} == set(SLOTS), 'COMPACT_HERO_CASE_SHAPE'
        selection = whole[0]
        user = json.loads(selection['messages'][1]['content'])
        assert [message['role'] for message in selection['messages']] == ['system', 'user', 'assistant'], 'SELECTION_TEACHER_SHAPE'
        systems = {row['messages'][0]['content'] for row in configurations}
        assert len(systems) == 1, 'CONFIG_SYSTEM_DRIFT'
        assert hero_id in bindings, 'ASSET_BINDING_MISSING'
        heroes.append({'heroId': hero_id, 'heroName': user['request']['heroName'], 'request': user['request'],
                       'selectionMessages': selection['messages'][:2], 'configurationSystem': next(iter(systems)),
                       # This script-owned binding is never appended to model messages.
                       'assetBinding': bindings[hero_id]})
    expected = manifest['counts'][split]['wholeHeroes']
    assert len(heroes) == expected, 'COMPACT_HERO_COUNT_DRIFT'
    return heroes


def final_checkpoint(run):
    run = Path(run).resolve()
    p = read(run / 'manifest.json')
    state = read(run / 'train/state.json')
    assert state['status'] == 'completed' and state['workerPid'] is None, 'TRAIN_NOT_TERMINAL_SUCCESS'
    result = read(run / 'train/result.json')
    assert result['steps'] == p['steps'] and result['uniqueTrainingTasks'] == p['steps'], 'TRAINING_INCOMPLETE'
    receipt = read(run / 'train/adapter-roundtrip.json')
    assert receipt['passed'] is True and len(receipt['tensorKeys']) == 8, 'ADAPTER_ROUNDTRIP_REQUIRED'
    folder = run / 'train' / result['checkpoint']['path']
    assert t.digest(folder / 'adapters.safetensors') == result['checkpoint']['sha256'], 'ADAPTER_DRIFT'
    return p, result, receipt, folder


def prepare(run, dataset, out):
    out, dataset = Path(out).resolve(), Path(dataset).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE'
    train, result, receipt, adapter = final_checkpoint(run)
    assert train['dataDirectory'] == str(dataset), 'TRAINING_DATASET_PATH_MISMATCH'
    assert train['frozenManifestSha256'] == t.digest(dataset / 'manifest.json'), 'TRAINING_DATASET_HASH_MISMATCH'
    heroes = public_heroes(dataset)
    payload = {'schema': 'ggd-compact-public-evaluation@1', 'split': 'internal-dev', 'heroes': heroes,
               'teacherAccess': 'No teacher answer is included in this public bundle.'}
    serialized = compact(payload) + '\n'
    assert '"role":"assistant"' not in serialized, 'TEACHER_MESSAGE_LEAKED'
    out.mkdir(parents=True)
    (out / 'public-heroes.json').write_text(serialized)
    (out / 'source').mkdir()
    source_files = [SCRIPT, SCRIPT.with_name('hero-distillation-compact-generation.py'),
                    SCRIPT.with_name('hero-distillation-generation.py'),
                    SCRIPT.with_name('hero-distillation-compact-runtime-cli.mjs'),
                    SCRIPT.with_name('hero-distillation-compact-runtime.mjs'), SCRIPT.with_name('hero-distillation-compact.mjs'),
                    SCRIPT.with_name('hero-distillation-freeze.mjs')]
    for file in source_files:
        shutil.copyfile(file, out / 'source' / file.name)
    manifest = {'schema': 'ggd-compact-protected-evaluation@1',
                'trainingManifestSha256': t.digest(Path(run) / 'manifest.json'),
                'trainingResultSha256': t.digest(Path(run) / 'train/result.json'),
                'datasetManifestSha256': t.digest(dataset / 'manifest.json'),
                'publicHeroesSha256': sha_bytes((out / 'public-heroes.json').read_bytes()),
                'adapterDirectory': str(adapter), 'adapterSha256': t.digest(adapter / 'adapters.safetensors'),
                'adapterTensorKeys': receipt['tensorKeys'], 'modelDirectory': train['modelDirectory'],
                'modelRevision': train['modelRevision'], 'baseFiles': train['baseFiles'], 'guard': train['guard'],
                'minimumAvailableBytes': train['minimumAvailableBytes'], 'metalLimitGiB': train['metalLimitGiB'],
                'datasetDirectory': str(dataset), 'sources': {file.name: t.digest(file) for file in source_files},
                'heroes': len(heroes), 'callsPerHero': 7, 'attemptsPerCall': 1,
                'automaticRestart': False, 'humanRepairsAllowed': False, 'modelPromoted': False,
                'fullHeroE2EProven': False}
    atomic(out / 'manifest.json', manifest)
    return manifest


def verify_bundle(directory):
    directory = Path(directory).resolve()
    p = read(directory / 'manifest.json')
    assert p['schema'] == 'ggd-compact-protected-evaluation@1', 'COMPACT_EVALUATION_SCHEMA'
    for file in [SCRIPT, SCRIPT.with_name('hero-distillation-compact-generation.py'), SCRIPT.with_name('hero-distillation-generation.py'), SCRIPT.with_name('hero-distillation-compact-runtime-cli.mjs'),
                 SCRIPT.with_name('hero-distillation-compact-runtime.mjs'), SCRIPT.with_name('hero-distillation-compact.mjs'),
                 SCRIPT.with_name('hero-distillation-freeze.mjs')]:
        assert p['sources'][file.name] == t.digest(file), 'RUNNER_DRIFT'
        assert p['sources'][file.name] == t.digest(directory / 'source' / file.name), 'SOURCE_SNAPSHOT_DRIFT'
    assert p['datasetManifestSha256'] == t.digest(Path(p['datasetDirectory']) / 'manifest.json'), 'DATASET_MANIFEST_DRIFT'
    assert p['publicHeroesSha256'] == sha_bytes((directory / 'public-heroes.json').read_bytes()), 'PUBLIC_INPUT_DRIFT'
    public = read(directory / 'public-heroes.json')
    assert set(public) == {'schema', 'split', 'heroes', 'teacherAccess'}, 'PUBLIC_BUNDLE_SHAPE'
    assert public['schema'] == 'ggd-compact-public-evaluation@1' and public['split'] == 'internal-dev', 'PUBLIC_BUNDLE_CONTRACT'
    assert public['teacherAccess'] == 'No teacher answer is included in this public bundle.', 'TEACHER_BOUNDARY_DRIFT'
    assert len(public['heroes']) == p['heroes'], 'HERO_COUNT_DRIFT'
    assert '"role":"assistant"' not in compact(public), 'TEACHER_MESSAGE_LEAKED'
    return p, public['heroes']


@contextmanager
def fp32_attention(mx, language):
    original = language.scaled_dot_product_attention
    def attention(queries, keys, values, cache, scale, mask, sinks=None):
        assert cache is None or type(cache).__name__ in ['KVCache', 'RotatingKVCache'], 'UNTESTED_KV_CACHE'
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


def safe_name(value):
    assert isinstance(value, str) and value and all(c.isascii() and (c.isalnum() or c in '-_.') for c in value), 'UNSAFE_HERO_ID'
    return value


def worker(directory, arm, token):
    directory, work = Path(directory).resolve(), Path(directory).resolve() / arm
    lock = read(t.LOCK)
    assert lock['token'] == token and lock['task'] == str(work), 'OWNED_LOCK_REQUIRED'
    p, heroes = verify_bundle(directory)
    def interrupted(signum, frame):
        raise InterruptedError('SUPERVISOR_STOP')
    signal.signal(signal.SIGTERM, interrupted)
    def progress(phase, **fields):
        atomic(work / 'worker-progress.json', {'pid': os.getpid(), 'phase': phase, 'startedAt': time.time(), **fields})
    progress('verify-model')
    for entry in p['baseFiles']:
        file = Path(p['modelDirectory']) / entry['name']
        assert file.resolve().is_relative_to(Path(p['modelDirectory']).resolve()), 'UNSAFE_BASE_PATH'
        assert file.stat().st_size == entry['bytes'] and t.digest(file) == entry['sha256'], 'BASE_DRIFT'
    adapter = Path(p['adapterDirectory'])
    assert t.digest(adapter / 'adapters.safetensors') == p['adapterSha256'], 'ADAPTER_DRIFT'
    import mlx.core as mx
    from mlx.utils import tree_flatten
    from mlx_vlm import load
    from mlx_vlm.models.gemma4 import language
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    generation = module('compact_eval_generation', 'hero-distillation-compact-generation.py')
    mx.set_memory_limit(min(p['metalLimitGiB'] * t.GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    progress('load-model')
    model, processor = load(p['modelDirectory'], lazy=True, strict=True, trust_remote_code=False)
    model.freeze()
    if arm == 'lora':
        config = read(adapter / 'adapter_config.json')
        linear_to_lora_layers(model, config['num_layers'], config['lora_parameters'])
        params, saved = dict(tree_flatten(model.trainable_parameters())), mx.load(str(adapter / 'adapters.safetensors'))
        assert set(params) == set(saved) == set(p['adapterTensorKeys']), 'ADAPTER_KEYS_MISMATCH'
        assert all(params[k].shape == saved[k].shape for k in params), 'ADAPTER_SHAPE_MISMATCH'
        model.load_weights(list(saved.items()), strict=False)
        actual = dict(tree_flatten(model.trainable_parameters()))
        assert all(mx.array_equal(actual[k], saved[k]).item() for k in saved), 'ADAPTER_LOAD_MISMATCH'
        atomic(work / 'adapter-loaded.json', {'sha256': p['adapterSha256'], 'tensorKeys': sorted(saved), 'passed': True})
    model.eval(); mx.eval(model.parameters()); mx.reset_peak_memory()
    tokenizer = getattr(processor, 'tokenizer', processor)
    calls, completed = [], []
    (work / 'calls').mkdir(); (work / 'heroes').mkdir()
    def emit(record):
        record.update(arm=arm, peakMetalBytes=mx.get_peak_memory())
        number = len(calls)
        atomic(work / 'calls' / f'{number:04d}-{safe_name(record["id"].split(":", 1)[0])}.json', record)
        calls.append({key: record[key] for key in ['id', 'stage', 'complete', 'seconds']})
        atomic(work / 'call-index.json', calls)
        gc.collect(); mx.clear_cache(); mx.reset_peak_memory()
    with fp32_attention(mx, language):
        for hero in heroes:
            progress('hero', heroId=hero['heroId'])
            try:
                result = generation.generate_hero(hero, p['datasetDirectory'], directory / 'source' / 'hero-distillation-compact-runtime-cli.mjs',
                                                  tokenizer, generation.g.mlx_stream_factory(model, processor), progress, emit)
                target = result['target']
                assert target['format'] == 'hero-plan', 'ASSEMBLY_FORMAT_DRIFT'
                result.update(status='complete')
                completed.append({'heroId': hero['heroId'], 'status':'complete','targetSha256': result['targetSha256'], 'calls': result['calls'], 'humanRepairs': 0})
            except Exception as error:
                # Invalid JSON/selection is a failed outcome for this fixed
                # hero, not a reason to silently shrink the arm denominator.
                result={'heroId':hero['heroId'],'status':'failed','error':repr(error),'humanRepairs':0,'fullHeroE2EProven':False}
                completed.append({'heroId':hero['heroId'],'status':'failed','error':repr(error),'humanRepairs':0})
            atomic(work / 'heroes' / (safe_name(hero['heroId']) + '.json'), result)
            atomic(work / 'hero-index.json', completed)
    # A fixed public denominator is mandatory.  A failed bounded decision can
    # legitimately consume fewer than seven calls, so never infer completeness
    # from a fixed call count.
    assert len(completed) == len(heroes), 'INCOMPLETE_COMPACT_EVALUATION'
    successes = sum(row['status'] == 'complete' for row in completed)
    atomic(work / 'result.json', {'arm': arm, 'attemptedHeroes': len(completed), 'attemptedCalls': len(calls),
                                   'completeHeroes': successes, 'failedHeroes':len(completed)-successes,'humanRepairs': 0,
                                   'modelPromoted': False, 'fullHeroE2EProven': False})


def supervise(directory, arm):
    assert arm in ['base', 'lora'], 'UNKNOWN_ARM'
    directory = Path(directory).resolve(); p, _ = verify_bundle(directory); work = directory / arm
    assert not work.exists(), 'REFUSE_RESTART_OR_OVERWRITE'
    start = t.resources(); assert start['acPower'] and start['availableBytes'] >= p['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not t.violation(start, start, p['guard']), 'RESOURCE_GUARD'
    token, child, locked, created = uuid.uuid4().hex, None, False, False
    state = {'status': 'starting', 'pid': os.getpid(), 'workerPid': None, 'arm': arm, 'startedAt': time.time(),
             'manifestSha256': t.digest(directory / 'manifest.json'), 'preflight': start}
    def interrupted(signum, frame):
        raise InterruptedError('INTERRUPTED')
    previous = {sig: signal.getsignal(sig) for sig in [signal.SIGINT, signal.SIGTERM]}
    try:
        t.LOCK.parent.mkdir(parents=True, exist_ok=True)
        with t.LOCK.open('x') as stream:
            locked = True; stream.write(compact({'pid': os.getpid(), 'task': str(work), 'token': token}))
        work.mkdir(); created = True
        for sig in previous: signal.signal(sig, interrupted)
        with (work / 'worker.log').open('x') as log, (work / 'resources.jsonl').open('x') as trace:
            child = subprocess.Popen([sys.executable, str(SCRIPT), 'worker', '--run', str(directory), '--arm', arm, '--token', token], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); atomic(work / 'state.json', state)
            while child.poll() is None:
                time.sleep(2); sample = t.resources(); trace.write(compact(sample)+'\n'); trace.flush()
                reason = t.violation(start, sample, p['guard'])
                if (work / 'STOP').exists(): reason = 'USER_STOP'
                if time.time()-state['startedAt'] > 7200: reason = 'RUN_TIME_LIMIT'
                if (work / 'worker-progress.json').exists():
                    progress = read(work / 'worker-progress.json'); assert progress['pid'] == child.pid, 'WORKER_PID_MISMATCH'
                    if time.time()-progress['startedAt'] > 610: reason = 'PHASE_TIME_LIMIT'
                if reason: raise RuntimeError(reason)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            result = read(work / 'result.json'); assert result['attemptedHeroes'] == p['heroes'], 'INCOMPLETE_RESULT'
            state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
    finally:
        try:
            if child is not None and child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
            state.update(workerPid=None, finishedAt=time.time())
            if created: atomic(work / 'state.json', state)
        finally:
            if locked and t.LOCK.exists() and read(t.LOCK).get('token') == token: t.LOCK.unlink()
            for sig, handler in previous.items(): signal.signal(sig, handler)
    print(compact(state), flush=True)
    if state['status'] != 'completed': raise SystemExit(1)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'run', 'worker'])
    parser.add_argument('--training', type=Path); parser.add_argument('--dataset', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--run', type=Path); parser.add_argument('--arm', choices=['base', 'lora']); parser.add_argument('--token')
    args = parser.parse_args()
    if args.action == 'prepare':
        assert args.training and args.dataset and args.out
        print(compact(prepare(args.training, args.dataset, args.out)))
    elif args.action == 'worker':
        assert args.run and args.arm and args.token; worker(args.run, args.arm, args.token)
    else:
        assert args.run and args.arm; supervise(args.run, args.arm)

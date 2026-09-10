"""Freeze no-teacher public cases for bounded-action Hero Forge evaluation.

This is deliberately a CPU-only preparation step.  It converts the frozen
action projection's internal-dev heroes into the exact public inputs consumed
by the autoregressive action generator, while preserving the hard boundary
that no assistant/teacher answer is placed in a model prompt.  Binding a
completed adapter, GPU decoding, and scoring are separate later stages.
"""
import argparse
from contextlib import contextmanager
import gc
import hashlib
import importlib.util
import json
import os
import signal
import subprocess
import shutil
import sys
import time
import uuid
from pathlib import Path

SCRIPT = Path(__file__).resolve()
SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX']


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def atomic(path, value):
    Path(path).write_text(compact(value) + '\n')


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


t = module('action_evaluation_training', SCRIPT.with_name('hero-distillation-train.py'))


def frozen_source(dataset):
    dataset = Path(dataset).resolve()
    manifest = read(dataset / 'manifest.json')
    assert manifest['schema'] == 'ggd-distillation-action-frozen-data@1', 'ACTION_DATASET_REQUIRED'
    for name, expected in manifest['outputs'].items():
        assert digest(dataset / name) == expected, 'ACTION_DATASET_DRIFT:' + name
    report = read(dataset / 'projection-report.json')
    action_protocol = report.get('actionProtocol', 'legacy@1')
    assert action_protocol in ['legacy@1', 'scalar-leaves@1'], 'ACTION_PROTOCOL'
    source = Path(report['source']).resolve()
    source_manifest = read(source / 'manifest.json')
    assert source_manifest['schema'] == 'ggd-distillation-compact-frozen-data@1', 'COMPACT_SOURCE_REQUIRED'
    assert digest(source / 'manifest.json') == report['sourceManifestSha256'], 'COMPACT_SOURCE_DRIFT'
    for name, expected in source_manifest['outputs'].items():
        assert digest(source / name) == expected, 'COMPACT_SOURCE_OUTPUT_DRIFT:' + name
    return dataset, manifest, source


def public_heroes(dataset, split='dev'):
    """Reconstruct only model-visible inputs.  Teacher answers never escape."""
    dataset, manifest, source = frozen_source(dataset)
    action_protocol = read(dataset / 'projection-report.json').get('actionProtocol', 'legacy@1')
    assert action_protocol in ['legacy@1', 'scalar-leaves@1'], 'ACTION_PROTOCOL'
    rows = [row for row in read(dataset / 'examples.json') if row['split'] == split]
    grouped = {}
    for row in rows:
        grouped.setdefault(row['heroId'], []).append(row)
    bindings, catalog = read(source / 'asset-bindings.json'), read(source / 'parameter-catalog.json')
    heroes = []
    for hero_id, hero_rows in sorted(grouped.items()):
        # Action labels intentionally repeat across product indices; only the
        # three public decision stages are unique per slot.
        by_stage, action_rows = {}, []
        for row in hero_rows:
            assert [message['role'] for message in row['messages']] == ['system', 'user', 'assistant'], 'ACTION_MESSAGE_SHAPE'
            if row['stage'].startswith('core-action:') or row['stage'].startswith('action:'):
                action_rows.append(row)
            else:
                assert row['stage'] not in by_stage, 'DUPLICATE_STAGE:' + row['stage']
                by_stage[row['stage']] = row
        identity = by_stage.get('identity')
        assert identity, 'IDENTITY_MISSING'
        input_value = json.loads(identity['messages'][1]['content'])
        assert set(input_value) == {'request', 'decisionSpace', 'outputContract'}, 'IDENTITY_INPUT_SHAPE'
        selection_rows = [by_stage.get('selection:' + slot) for slot in SLOTS]
        core_rows = [by_stage.get('core:' + slot) for slot in SLOTS]
        assert all(selection_rows) and all(core_rows), 'SLOT_PUBLIC_INPUT_MISSING'
        selection_systems = {row['messages'][0]['content'] for row in selection_rows}
        core_systems = {row['messages'][0]['content'] for row in core_rows}
        action_systems = {row['messages'][0]['content'] for row in action_rows}
        assert len(selection_systems) == len(core_systems) == len(action_systems) == 1, 'SYSTEM_PROMPT_DRIFT'
        assert hero_id in bindings, 'ASSET_BINDING_MISSING:' + hero_id
        hero = {'heroId': hero_id, 'heroName': input_value['request']['heroName'], 'request': input_value['request'],
                'decisionSpace': input_value['decisionSpace'], 'assetBinding': bindings[hero_id],
                'identityMessages': identity['messages'][:2], 'selectionSystem': next(iter(selection_systems)),
                'coreSystem': next(iter(core_systems)), 'actionSystem': next(iter(action_systems)),
                'detailedCatalog': catalog, 'actionProtocol': action_protocol}
        # These are the exact keys enforced by generate_hero().  Serialising
        # this assert protects the teacher-answer boundary as the protocol grows.
        assert set(hero) == {'heroId', 'heroName', 'request', 'decisionSpace', 'assetBinding', 'identityMessages',
                             'selectionSystem', 'coreSystem', 'actionSystem', 'detailedCatalog', 'actionProtocol'}, 'PUBLIC_CASE_SHAPE'
        assert 'assistant' not in compact(hero), 'TEACHER_MESSAGE_LEAKED'
        heroes.append(hero)
    assert len(heroes) == manifest['counts'][split]['heroes'], 'PUBLIC_HERO_COUNT_DRIFT'
    return heroes


def freeze(dataset, out):
    out = Path(out).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE'
    dataset, manifest, source = frozen_source(dataset)
    heroes = public_heroes(dataset)
    payload = {'schema': 'ggd-action-public-evaluation@1', 'split': 'internal-dev-seen-regression', 'heroes': heroes,
               'teacherAccess': 'No teacher answer is included in this public bundle; this split is seen regression only.'}
    text = compact(payload) + '\n'
    assert '"role":"assistant"' not in text, 'TEACHER_MESSAGE_LEAKED'
    out.mkdir(parents=True)
    (out / 'public-heroes.json').write_text(text)
    (out / 'source').mkdir()
    files = [SCRIPT, SCRIPT.with_name('hero-distillation-action-generation.py'),
             SCRIPT.with_name('hero-distillation-generation.py'), SCRIPT.with_name('hero-distillation-action-runtime.mjs'),
             SCRIPT.with_name('hero-distillation-action-runtime-cli.mjs')]
    for file in files:
        shutil.copyfile(file, out / 'source' / file.name)
    result = {'schema': 'ggd-action-protected-evaluation@1', 'kind': 'internal-dev-seen-regression',
              'datasetDirectory': str(dataset), 'datasetManifestSha256': digest(dataset / 'manifest.json'),
              'sourceDirectory': str(source), 'sourceManifestSha256': digest(source / 'manifest.json'),
              'publicHeroesSha256': digest(out / 'public-heroes.json'), 'heroes': len(heroes),
              'sources': {file.name: digest(file) for file in files}, 'automaticRestart': False,
              'humanRepairsAllowed': False, 'fullHeroE2EProven': False,
              'note': 'This bundle does not measure unseen-user-hero generalization and cannot select a checkpoint.'}
    atomic(out / 'manifest.json', result)
    return result


def verify(directory):
    directory = Path(directory).resolve()
    result = read(directory / 'manifest.json')
    assert result['schema'] == 'ggd-action-protected-evaluation@1', 'EVALUATION_SCHEMA'
    for name, expected in result['sources'].items():
        current = SCRIPT if name == SCRIPT.name else SCRIPT.with_name(name)
        assert digest(current) == expected, 'RUNNER_DRIFT:' + name
        assert digest(directory / 'source' / name) == expected, 'SOURCE_SNAPSHOT_DRIFT:' + name
    dataset, _, source = frozen_source(result['datasetDirectory'])
    assert digest(dataset / 'manifest.json') == result['datasetManifestSha256'], 'DATASET_MANIFEST_DRIFT'
    assert digest(source / 'manifest.json') == result['sourceManifestSha256'], 'SOURCE_MANIFEST_DRIFT'
    assert digest(directory / 'public-heroes.json') == result['publicHeroesSha256'], 'PUBLIC_CASE_DRIFT'
    public = read(directory / 'public-heroes.json')
    assert set(public) == {'schema', 'split', 'heroes', 'teacherAccess'}, 'PUBLIC_BUNDLE_SHAPE'
    assert public['schema'] == 'ggd-action-public-evaluation@1', 'PUBLIC_BUNDLE_SCHEMA'
    assert public['split'] == 'internal-dev-seen-regression', 'SPLIT_LABEL_DRIFT'
    assert len(public['heroes']) == result['heroes'], 'PUBLIC_HERO_COUNT_DRIFT'
    assert 'assistant' not in compact(public), 'TEACHER_MESSAGE_LEAKED'
    return result, public['heroes']


def final_checkpoint(training):
    """Accept only the fixed final full-epoch adapter, never a chosen dev checkpoint."""
    training = Path(training).resolve()
    manifest = read(training / 'manifest.json')
    state = read(training / 'train' / 'state.json')
    assert state['status'] == 'completed' and state['workerPid'] is None, 'TRAIN_NOT_TERMINAL_SUCCESS'
    result = read(training / 'train' / 'result.json')
    assert result['steps'] == manifest['steps'] and result['uniqueTrainingTasks'] == manifest['steps'], 'TRAINING_INCOMPLETE'
    receipt = read(training / 'train' / 'adapter-roundtrip.json')
    assert receipt['passed'] is True, 'ADAPTER_ROUNDTRIP_REQUIRED'
    folder = training / 'train' / result['checkpoint']['path']
    assert t.digest(folder / 'adapters.safetensors') == result['checkpoint']['sha256'], 'ADAPTER_DRIFT'
    return manifest, result, receipt, folder


def prepare(training, dataset, out):
    """Make a bound, no-teacher A/B evaluation after terminal training only."""
    out = Path(out).resolve()
    base = freeze(dataset, out)
    train, result, receipt, adapter = final_checkpoint(training)
    assert train['dataDirectory'] == str(Path(dataset).resolve()), 'TRAINING_DATASET_PATH_MISMATCH'
    assert train['frozenManifestSha256'] == t.digest(Path(dataset) / 'manifest.json'), 'TRAINING_DATASET_HASH_MISMATCH'
    base.update({'trainingDirectory': str(Path(training).resolve()),
                 'trainingManifestSha256': t.digest(Path(training) / 'manifest.json'),
                 'trainingResultSha256': t.digest(Path(training) / 'train' / 'result.json'),
                 'modelDirectory': train['modelDirectory'], 'modelRevision': train['modelRevision'],
                 'baseFiles': train['baseFiles'], 'adapterDirectory': str(adapter),
                 'adapterSha256': t.digest(adapter / 'adapters.safetensors'), 'adapterTensorKeys': receipt['tensorKeys'],
                 'guard': train['guard'], 'minimumAvailableBytes': train['minimumAvailableBytes'],
                 'metalLimitGiB': train['metalLimitGiB'], 'callsPerHero': 'variable bounded action sequence',
                 'attemptsPerCall': 1, 'fullHeroE2EProven': False})
    atomic(out / 'manifest.json', base)
    return base


@contextmanager
def fp32_attention(mx, language):
    original = language.scaled_dot_product_attention
    def attention(queries, keys, values, cache, scale, mask, sinks=None):
        assert cache is None or type(cache).__name__ in ['KVCache', 'RotatingKVCache'], 'UNTESTED_KV_CACHE'
        if hasattr(mask, 'dtype') and mx.issubdtype(mask.dtype, mx.floating): mask = mask.astype(mx.float32)
        if sinks is not None: sinks = sinks.astype(mx.float32)
        return mx.fast.scaled_dot_product_attention(queries.astype(mx.float32), keys.astype(mx.float32), values.astype(mx.float32),
                                                    scale=scale, mask=mask, sinks=sinks).astype(queries.dtype)
    language.scaled_dot_product_attention = attention
    try:
        yield
    finally:
        language.scaled_dot_product_attention = original


def safe_name(value):
    assert isinstance(value, str) and value and all(c.isascii() and (c.isalnum() or c in '-_.') for c in value), 'UNSAFE_HERO_ID'
    return value


def worker(directory, arm, token):
    assert arm in ['base', 'lora'], 'UNKNOWN_ARM'
    directory, work = Path(directory).resolve(), Path(directory).resolve() / arm
    lock = read(t.LOCK); assert lock['token'] == token and lock['task'] == str(work), 'OWNED_LOCK_REQUIRED'
    p, heroes = verify(directory)
    for key in ['modelDirectory', 'adapterDirectory', 'adapterSha256', 'adapterTensorKeys', 'baseFiles', 'guard', 'metalLimitGiB']:
        assert key in p, 'UNBOUND_EVALUATION:' + key
    def interrupted(signum, frame): raise InterruptedError('SUPERVISOR_STOP')
    signal.signal(signal.SIGTERM, interrupted)
    def progress(phase, **fields): atomic(work / 'worker-progress.json', {'pid': os.getpid(), 'phase': phase, 'startedAt': time.time(), **fields})
    progress('verify-model')
    for entry in p['baseFiles']:
        file = Path(p['modelDirectory']) / entry['name']
        assert file.resolve().is_relative_to(Path(p['modelDirectory']).resolve()), 'UNSAFE_BASE_PATH'
        assert file.stat().st_size == entry['bytes'] and t.digest(file) == entry['sha256'], 'BASE_DRIFT'
    import mlx.core as mx
    from mlx.utils import tree_flatten
    from mlx_vlm import load
    from mlx_vlm.models.gemma4 import language
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    generation = module('action_eval_generation', directory / 'source' / 'hero-distillation-action-generation.py')
    mx.set_memory_limit(min(p['metalLimitGiB'] * t.GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    progress('load-model'); model, processor = load(p['modelDirectory'], lazy=True, strict=True, trust_remote_code=False); model.freeze()
    if arm == 'lora':
        adapter = Path(p['adapterDirectory']); assert t.digest(adapter / 'adapters.safetensors') == p['adapterSha256'], 'ADAPTER_DRIFT'
        config = read(adapter / 'adapter_config.json'); linear_to_lora_layers(model, config['num_layers'], config['lora_parameters'])
        params, saved = dict(tree_flatten(model.trainable_parameters())), mx.load(str(adapter / 'adapters.safetensors'))
        assert set(params) == set(saved) == set(p['adapterTensorKeys']), 'ADAPTER_KEYS_MISMATCH'
        assert all(params[key].shape == saved[key].shape for key in params), 'ADAPTER_SHAPE_MISMATCH'
        model.load_weights(list(saved.items()), strict=False)
        actual = dict(tree_flatten(model.trainable_parameters()))
        assert all(mx.array_equal(actual[key], saved[key]).item() for key in saved), 'ADAPTER_LOAD_MISMATCH'
        atomic(work / 'adapter-loaded.json', {'sha256': p['adapterSha256'], 'tensorKeys': sorted(saved), 'passed': True})
    model.eval(); mx.eval(model.parameters()); mx.reset_peak_memory(); tokenizer = getattr(processor, 'tokenizer', processor)
    calls, completed = [], []; (work / 'calls').mkdir(); (work / 'heroes').mkdir()
    def emit(record):
        record.update(arm=arm, peakMetalBytes=mx.get_peak_memory()); number = len(calls)
        atomic(work / 'calls' / f'{number:05d}-{safe_name(record["id"].split(":", 1)[0])}.json', record)
        calls.append({key: record[key] for key in ['id', 'stage', 'complete', 'seconds', 'jsonAccepted']}); atomic(work / 'call-index.json', calls)
        gc.collect(); mx.clear_cache(); mx.reset_peak_memory()
    with fp32_attention(mx, language):
        for hero in heroes:
            progress('hero', heroId=hero['heroId'])
            try:
                value = generation.generate_hero(hero, directory / 'source' / 'hero-distillation-action-runtime-cli.mjs', tokenizer,
                                                 generation.g.mlx_stream_factory(model, processor), progress, emit)
                assert value['target']['format'] == 'hero-plan', 'ASSEMBLY_FORMAT_DRIFT'
                value.update(status='complete'); completed.append({'heroId': hero['heroId'], 'status': 'complete',
                                                                    'targetSha256': value['targetSha256'], 'humanRepairs': 0})
            except Exception as error:
                value = {'heroId': hero['heroId'], 'status': 'failed', 'error': repr(error), 'humanRepairs': 0,
                         'fullHeroE2EProven': False}
                completed.append({'heroId': hero['heroId'], 'status': 'failed', 'error': repr(error), 'humanRepairs': 0})
            atomic(work / 'heroes' / (safe_name(hero['heroId']) + '.json'), value); atomic(work / 'hero-index.json', completed)
    assert len(completed) == len(heroes), 'INCOMPLETE_ACTION_EVALUATION'
    successful = sum(row['status'] == 'complete' for row in completed)
    atomic(work / 'result.json', {'arm': arm, 'kind': p['kind'], 'attemptedHeroes': len(completed), 'attemptedCalls': len(calls),
                                   'completeHeroes': successful, 'failedHeroes': len(completed) - successful,
                                   'humanRepairs': 0, 'modelPromoted': False, 'fullHeroE2EProven': False})


def supervise(directory, arm):
    assert arm in ['base', 'lora'], 'UNKNOWN_ARM'
    directory = Path(directory).resolve(); p, _ = verify(directory); work = directory / arm
    assert 'trainingDirectory' in p, 'UNBOUND_EVALUATION'
    assert not work.exists(), 'REFUSE_RESTART_OR_OVERWRITE'
    start = t.resources(); assert start['acPower'] and start['availableBytes'] >= p['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not t.violation(start, start, p['guard']), 'RESOURCE_GUARD'
    token, child, locked, created = uuid.uuid4().hex, None, False, False
    state = {'status': 'starting', 'pid': os.getpid(), 'workerPid': None, 'arm': arm, 'startedAt': time.time(),
             'manifestSha256': t.digest(directory / 'manifest.json'), 'preflight': start}
    def interrupted(signum, frame): raise InterruptedError('INTERRUPTED')
    previous = {sig: signal.getsignal(sig) for sig in [signal.SIGINT, signal.SIGTERM]}
    try:
        t.LOCK.parent.mkdir(parents=True, exist_ok=True)
        with t.LOCK.open('x') as stream: locked = True; stream.write(compact({'pid': os.getpid(), 'task': str(work), 'token': token}))
        work.mkdir(); created = True
        for sig in previous: signal.signal(sig, interrupted)
        with (work / 'worker.log').open('x') as log, (work / 'resources.jsonl').open('x') as trace:
            child = subprocess.Popen([sys.executable, str(SCRIPT), 'worker', '--run', str(directory), '--arm', arm, '--token', token], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); atomic(work / 'state.json', state)
            while child.poll() is None:
                time.sleep(2); sample = t.resources(); trace.write(compact(sample) + '\n'); trace.flush(); reason = t.violation(start, sample, p['guard'])
                if (work / 'STOP').exists(): reason = 'USER_STOP'
                if time.time() - state['startedAt'] > p.get('secondsMaximumPerArm', 7200): reason = 'RUN_TIME_LIMIT'
                if (work / 'worker-progress.json').exists():
                    progress = read(work / 'worker-progress.json'); assert progress['pid'] == child.pid, 'WORKER_PID_MISMATCH'
                    if time.time() - progress['startedAt'] > 610: reason = 'PHASE_TIME_LIMIT'
                if reason: raise RuntimeError(reason)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'; result = read(work / 'result.json')
            assert result['attemptedHeroes'] == p['heroes'], 'INCOMPLETE_RESULT'; state['status'] = 'completed'
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['freeze', 'prepare', 'verify', 'run', 'worker'])
    parser.add_argument('--dataset', type=Path); parser.add_argument('--out', type=Path); parser.add_argument('--training', type=Path)
    parser.add_argument('--run', type=Path); parser.add_argument('--arm', choices=['base', 'lora']); parser.add_argument('--token')
    args = parser.parse_args()
    if args.action == 'freeze':
        assert args.dataset and args.out
        print(compact(freeze(args.dataset, args.out)))
    elif args.action == 'prepare':
        assert args.training and args.dataset and args.out
        print(compact(prepare(args.training, args.dataset, args.out)))
    elif args.action == 'verify':
        assert args.run
        print(compact({'manifest': verify(args.run)[0]}))
    elif args.action == 'worker':
        assert args.run and args.arm and args.token; worker(args.run, args.arm, args.token)
    else:
        assert args.run and args.arm; supervise(args.run, args.arm)

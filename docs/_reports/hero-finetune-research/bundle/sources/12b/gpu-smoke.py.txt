"""One offline Metal worker, supervised externally; finite development inference only."""
import argparse
import gc
import hashlib
import importlib.metadata as metadata
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

for key in ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'HF_HUB_DISABLE_IMPLICIT_TOKEN']:
    os.environ[key] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
os.environ['OMP_NUM_THREADS'] = '4'

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hero12b_preflight', HERE / 'gpu-preflight.py')
preflight_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight_module)
resources, digest, LOCK, GIB = (getattr(preflight_module, key) for key in ['resources', 'digest', 'LOCK', 'GIB'])
read = lambda p: json.loads(p.read_text())


def json_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def atomic(path, value):
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    temporary.replace(path)


def policy_violation(start, now, protocol):
    guard = protocol['guard']
    if not now['acPower']:
        return 'AC_POWER_REQUIRED'
    if now['batteryPercent'] is None or start['batteryPercent'] - now['batteryPercent'] >= guard['maxBatteryDropPoints']:
        return 'BATTERY_DROPPING'
    if now['availableBytes'] < guard['minAvailableGiB'] * GIB:
        return 'LOW_AVAILABLE_MEMORY'
    if now['swapUsedBytes'] - start['swapUsedBytes'] > guard['maxSwapGrowthGiB'] * GIB:
        return 'SWAP_GROWTH'
    return None


def prepare(directory):
    protocol = read(directory / 'manifest.json')
    requests = read(directory / 'requests.json')
    assert protocol['notTraining'] and protocol['notBlind'] and protocol['repairAttempts'] == 0
    assert protocol['modelDirectory'] == '/private/tmp/ggd-mid-models-20260907/gemma-4-12B-it-8bit'
    assert json_hash(requests) == protocol['requestSha256'], 'REQUEST_INTEGRITY'
    assert [r['id'] for r in requests] == protocol['selected'], 'REQUEST_COHORT'
    assert all(json_hash(r['messages']) == r['requestDigest'] for r in requests), 'MESSAGE_INTEGRITY'
    checker_files = protocol.get('checkerFiles', ['smoke-contract.mjs', 'normalize.mjs', 'intake.mjs'])
    assert checker_files and len(checker_files) == len(set(checker_files)), 'CHECKER_LIST'
    assert all(Path(name).name == name and name not in ['.', '..'] for name in checker_files), 'CHECKER_SCOPE'
    if 'checkerPins' in protocol:
        assert {name: digest(HERE / name) for name in checker_files} == protocol['checkerPins'], 'CHECKER_DRIFT'
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(protocol['modelDirectory'], local_files_only=True, trust_remote_code=False)
    prompts = [tokenizer.apply_chat_template(r['messages'], tokenize=False, add_generation_prompt=True, enable_thinking=False) for r in requests]
    counts = [len(tokenizer.encode(p, add_special_tokens=False)) for p in prompts]
    assert all(p.endswith('<|channel>thought\n<channel|>') and '<|think|>' not in p for p in prompts), 'PLAIN_CHANNEL_TEMPLATE_CHANGED'
    assert max(counts) <= protocol['maxPromptTokens'], f'PROMPT_BUDGET:{max(counts)}'
    assert max(counts) + protocol['maxTokens'] <= protocol['maxContextTokens'], 'CONTEXT_BUDGET'
    check = {'cpuOnly': True, 'requestSha256': protocol['requestSha256'], 'counts': counts,
             'promptSha256': [hashlib.sha256(p.encode()).hexdigest() for p in prompts],
             'thinking': False, 'maxOutputTokens': protocol['maxTokens'],
             'tokenizerConfigSha256': digest(Path(protocol['modelDirectory']) / 'tokenizer_config.json')}
    if (directory / 'prompt-check.json').exists():
        assert read(directory / 'prompt-check.json') == check, 'PROMPT_RENDER_DRIFT'
    else:
        with (directory / 'prompt-check.json').open('x') as stream:
            json.dump(check, stream, indent=2)
    return protocol, requests, prompts


def worker(directory, token):
    ownership = read(LOCK)
    assert ownership['token'] == token and ownership['task'] == str(directory), 'SUPERVISOR_LOCK_REQUIRED'
    protocol, requests, prompts = prepare(directory)
    assert not (directory / 'raw.json').exists() and not (directory / 'raw.partial.json').exists(), 'REFUSE_WORKER_RESTART'
    preflight = read(HERE / 'gpu-preflight-v1.json')
    assert preflight['modelDirectory'] == protocol['modelDirectory']
    assert preflight['modelRevision'] == protocol['revision']
    for p in preflight['files']:
        file = Path(protocol['modelDirectory']) / p['name']
        assert file.stat().st_size == p['bytes'] and digest(file) == p['sha256'], 'MODEL_DRIFT'
    start_resource = resources()
    assert start_resource['acPower'] and start_resource['availableBytes'] >= preflight['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    atomic(directory / 'worker-progress.json', {'pid': os.getpid(), 'phase': 'loading', 'startedAt': time.time()})
    import mlx.core as mx
    from mlx_vlm import load, stream_generate
    device = mx.device_info()
    mx.set_memory_limit(min(protocol['metalLimitGiB'] * GIB, device['max_recommended_working_set_size']))
    mx.set_cache_limit(256 * 1024 ** 2)
    started = time.monotonic()
    model, processor = load(protocol['modelDirectory'], lazy=True, strict=True, trust_remote_code=False)
    mx.eval(model.parameters())
    result = {'metadata': {'model': protocol['model'], 'revision': protocol['revision'],
        'quantization': protocol['quantization'], 'thinking': False, 'training': False, 'visualInputs': False,
        'seed': protocol['seed'], 'temperature': protocol['temperature'], 'maxTokens': protocol['maxTokens'],
        'loadSeconds': time.monotonic() - started, 'device': device, 'workerSha256': digest(Path(__file__)),
        'requestSha256': protocol['requestSha256'], 'manifestSha256': digest(directory / 'manifest.json'),
        'versions': {k: metadata.version(k) for k in ['mlx', 'mlx-vlm', 'transformers', 'psutil']}},
        'complete': False, 'results': []}
    print(json.dumps({'event': 'model-loaded', 'seconds': result['metadata']['loadSeconds']}), flush=True)
    for index, (request, prompt) in enumerate(zip(requests, prompts)):
        if (directory / 'STOP').exists():
            raise InterruptedError('USER_STOP')
        now = resources()
        violation = policy_violation(start_resource, now, protocol)
        if violation:
            raise RuntimeError(violation)
        mx.random.seed(protocol['seed']); mx.reset_peak_memory()
        begin = time.monotonic(); start_wall = time.time()
        progress = {'pid': os.getpid(), 'phase': 'generating', 'index': index, 'id': request['id'], 'caseStartedAt': start_wall}
        atomic(directory / 'worker-progress.json', progress)
        text, last, first_token = '', None, None
        stream = stream_generate(model, processor, prompt, max_tokens=protocol['maxTokens'], temperature=0,
            top_p=1.0, top_k=0, prefill_step_size=protocol['prefillStepSize'], enable_thinking=False,
            seed=protocol['seed'], verbose=False)
        try:
            for count, chunk in enumerate(stream):
                if first_token is None:
                    first_token = time.monotonic() - begin
                text += chunk.text; last = chunk
                if count % 128 == 0:
                    atomic(directory / 'active-case.partial.json', {**progress, 'text': text, 'finishReason': None, 'complete': False})
                if time.monotonic() - begin > protocol['caseSeconds']:
                    raise TimeoutError('CASE_TIME_LIMIT')
                if (directory / 'STOP').exists():
                    raise InterruptedError('USER_STOP')
        finally:
            stream.close()
        row = {'id': request['id'], 'requestDigest': request['requestDigest'],
               'envelope': {'channel': 'final', 'text': text, 'finishReason': last.finish_reason if last else None},
               'seconds': time.monotonic() - begin, 'firstTokenSeconds': first_token,
               'promptSha256': hashlib.sha256(prompt.encode()).hexdigest(),
               'promptTokens': last.prompt_tokens if last else None, 'generationTokens': last.generation_tokens if last else None,
               'generationTps': last.generation_tps if last else None, 'peakMetalBytes': mx.get_peak_memory()}
        result['results'].append(row)
        atomic(directory / 'raw.partial.json', result)
        atomic(directory / 'active-case.partial.json', {**progress, 'text': text, 'finishReason': row['envelope']['finishReason'], 'complete': True})
        print(json.dumps({'event': 'case-complete', 'index': index + 1, 'id': row['id'], 'seconds': row['seconds'],
                          'tokens': row['generationTokens'], 'finishReason': row['envelope']['finishReason']}), flush=True)
        gc.collect(); mx.clear_cache()
    result['complete'] = True
    atomic(directory / 'raw.json', result)


def supervise(directory):
    protocol, _, _ = prepare(directory)
    assert not (directory / 'state.json').exists(), 'REFUSE_SUPERVISOR_RESTART'
    start_resource = resources()
    assert start_resource['acPower'] and start_resource['availableBytes'] >= read(HERE / 'gpu-preflight-v1.json')['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not (directory / 'STOP').exists(), 'USER_STOP'
    token = uuid.uuid4().hex
    with LOCK.open('x') as stream:
        json.dump({'pid': os.getpid(), 'token': token, 'task': str(directory)}, stream)
    child = None
    state = {'status': 'starting', 'startedAt': time.time(), 'pid': os.getpid(), 'workerPid': None,
             'preflight': start_resource, 'requestSha256': protocol['requestSha256'],
             'manifestSha256': digest(directory / 'manifest.json'), 'samples': [], 'modelPromotion': False,
             'checkerPinsBeforeInference': {name: digest(HERE / name) for name in
                 protocol.get('checkerFiles', ['smoke-contract.mjs', 'normalize.mjs', 'intake.mjs'])}}
    def interrupted(signum, frame):
        raise InterruptedError('SUPERVISOR_INTERRUPTED')
    signal.signal(signal.SIGINT, interrupted); signal.signal(signal.SIGTERM, interrupted)
    try:
        atomic(directory / 'state.json', state)
        with (directory / 'worker.log').open('x') as log:
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), str(directory), '--worker', token],
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); atomic(directory / 'state.json', state)
            while child.poll() is None:
                time.sleep(2)
                now = resources(); state['samples'].append(now)
                violation = policy_violation(start_resource, now, protocol)
                if (directory / 'STOP').exists(): violation = 'USER_STOP'
                if time.time() - state['startedAt'] > protocol['workerMinutes'] * 60: violation = 'WORKER_TIME_LIMIT'
                progress = directory / 'worker-progress.json'
                if progress.exists():
                    p = read(progress)
                    assert p['pid'] == child.pid, 'PROGRESS_OWNERSHIP'
                    if p['phase'] == 'generating' and time.time() - p['caseStartedAt'] > protocol['caseSeconds'] + 10:
                        violation = 'CASE_TIME_LIMIT'
                    elif p['phase'] == 'loading' and time.time() - p['startedAt'] > protocol['loadSeconds']:
                        violation = 'LOAD_TIME_LIMIT'
                elif time.time() - state['startedAt'] > protocol['loadSeconds']: violation = 'PREPARE_TIME_LIMIT'
                atomic(directory / 'state.json', state)
                if violation: raise RuntimeError(violation)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            raw = read(directory / 'raw.json')
            assert raw['complete'] and len(raw['results']) == protocol['heroCount'], 'INCOMPLETE_ACCOUNTING'
            state.update(status='completed-inference-only', exitCode=child.returncode)
    except BaseException as exc:
        state.update(status='stopped-or-failed', error=repr(exc))
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
        state.update(workerPid=None, finishedAt=time.time())
        atomic(directory / 'state.json', state)
        if LOCK.exists() and read(LOCK).get('token') == token: LOCK.unlink()
    print(json.dumps({k: v for k, v in state.items() if k != 'samples'}), flush=True)
    if state['status'] != 'completed-inference-only': raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--doctor', action='store_true')
    parser.add_argument('--worker')
    args = parser.parse_args()
    directory = args.directory.resolve()
    assert directory.parent == HERE, 'SCOPE_OUTSIDE_RESEARCH'
    if args.doctor:
        prepare(directory)
        print(json.dumps(read(directory / 'prompt-check.json')), flush=True)
    elif args.worker: worker(directory, args.worker)
    else: supervise(directory)

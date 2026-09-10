"""One bounded Mac-only full-generation LoRA epoch, preceded by a real-length probe.

No data repair, truncation, dataset expansion, automatic retry, sweep, or promotion.
Resource/lock semantics retained from the earlier gpu-smoke/lora-facts supervisor.
"""
import argparse
import gc
import hashlib
import importlib.metadata as metadata
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import signal
import subprocess
import sys
import time
import uuid

for key in ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'HF_HUB_DISABLE_IMPLICIT_TOKEN']:
    os.environ[key] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
os.environ['OMP_NUM_THREADS'] = '4'
GIB = 1024 ** 3
QUERY_BLOCK_TOKENS = 256
# Resource reads wake macOS battery/RAM/swap sensors.  The user explicitly
# requested a three-minute cadence.  Process/deadline supervision remains
# frequent below; only resource sensor reads are rate-limited.
RESOURCE_SAMPLE_INTERVAL_SECONDS = 180
LOCK = Path('/private/tmp/ggd-forge-training-runtime/gpu.lock')
SCRIPT = Path(__file__).resolve()
MEMORY_SCRIPT = SCRIPT.with_name('hero-distillation-memory.py')
CACHE_SCRIPT = SCRIPT.with_name('hero-distillation-prefix-cache.py')


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def atomic(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)


def resources():
    import psutil
    memory, swap, battery = psutil.virtual_memory(), psutil.swap_memory(), psutil.sensors_battery()
    return {'sampledAt': time.time(), 'availableBytes': memory.available, 'totalBytes': memory.total,
            'swapUsedBytes': swap.used, 'acPower': battery is not None and battery.power_plugged,
            'batteryPercent': battery.percent if battery else None}


def violation(start, now, guard):
    if not now['acPower']:
        return 'AC_POWER_REQUIRED'
    if 'minBatteryPercent' in guard:
        if now['batteryPercent'] is None:
            return 'BATTERY_STATUS_UNKNOWN'
        if now['batteryPercent'] < guard['minBatteryPercent']:
            return 'BATTERY_BELOW_FLOOR'
    elif now['batteryPercent'] is None or start['batteryPercent'] - now['batteryPercent'] >= guard['maxBatteryDropPoints']:
        return 'BATTERY_DROPPING'
    if now['availableBytes'] < guard['minAvailableGiB'] * GIB:
        return 'LOW_AVAILABLE_MEMORY'
    if now['swapUsedBytes'] - start['swapUsedBytes'] > guard['maxSwapGrowthGiB'] * GIB:
        return 'SWAP_GROWTH'
    return None


def encode(tokenizer, messages):
    assert len(messages) == 3 and [m['role'] for m in messages] == ['system', 'user', 'assistant']
    prompt = tokenizer.apply_chat_template(messages[:2], tokenize=False, add_generation_prompt=True, enable_thinking=False)
    suffix = '<|channel>thought\n<channel|>'
    assert prompt.endswith(suffix), 'NO_THINKING_TEMPLATE_DRIFT'
    completed = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False, enable_thinking=False)
    assert completed == prompt[:-len(suffix)] + messages[2]['content'] + '<turn|>\n', 'CHAT_TEMPLATE_DRIFT'
    prefix = tokenizer.encode(prompt, add_special_tokens=False)
    ids = tokenizer.encode(prompt + messages[2]['content'] + '<turn|>\n', add_special_tokens=False)
    assert ids[:len(prefix)] == prefix and len(ids) > len(prefix), 'COMPLETION_BOUNDARY_DRIFT'
    return {'ids': ids, 'promptTokens': len(prefix), 'outputTokens': len(ids) - len(prefix), 'totalTokens': len(ids)}


def capacity_plan(train, dev):
    """Profile both length extremes per output format, with no dev gradients."""
    strata = {}
    for name in sorted({row['format'] for row in train}):
        rows = [row for row in train if row['format'] == name]
        strata[name] = {'trainTasks': len(rows), 'devTasks': sum(row['format'] == name for row in dev),
                        'probeIds': sorted({max(rows, key=lambda row: row[key])['id'] for key in ['totalTokens', 'outputTokens']})}
    assert all(row['format'] in strata for row in dev), 'UNPROFILED_DEV_FORMAT'
    return strata


def epoch_estimate(probes, strata):
    estimate = 0
    for name, stratum in strata.items():
        rows = [row for row in probes if row['format'] == name]
        assert {row['id'] for row in rows} == set(stratum['probeIds']), 'INCOMPLETE_CAPACITY_STRATUM'
        assert all(math.isfinite(row['seconds']) and row['seconds'] > 0 for row in rows)
        # Dev has no backward pass; using the stratum gradient time twice is
        # deliberately conservative. Wall-clock guards remain authoritative.
        estimate += max(row['seconds'] for row in rows) * (stratum['trainTasks'] + 2 * stratum['devTasks'])
    return estimate * 1.5 + 300


def aligned_prefix_length(length, block_size):
    """Preserve the uncached query-block grid; leftover tokens stay in suffix."""
    assert isinstance(length,int) and isinstance(block_size,int) and length>=block_size>0
    return length//block_size*block_size


def time_authorization(path):
    if path is None:return 7200,None
    approval=read(path)
    assert approval.get('schema')=='ggd-distillation-time-authorization@1','TIME_AUTHORIZATION_SCHEMA'
    assert approval.get('maximumSeconds')==57600 and approval.get('epochs')==1,'UNAUTHORIZED_TIME_OR_EPOCHS'
    assert approval.get('userQuote')=='延長到16小時','TIME_AUTHORIZATION_QUOTE'
    assert approval.get('otherGuardsUnchanged') is True,'OTHER_GUARDS_MUST_REMAIN'
    return approval['maximumSeconds'],{'sha256':digest(path),'record':approval}


def begin_gradient_probe(progress,row,comparison):
    assert comparison in ['uncached-reference','cached','uncached'],'UNKNOWN_PROBE_LEG'
    progress('gradient-probe',id=row['id'],tokens=row['totalTokens'],comparison=comparison)
    return time.monotonic()


def battery_authorization(path):
    if path is None:
        return {'maxBatteryDropPoints': 2}, None
    record = read(path)
    assert record['schema'] == 'ggd-distillation-battery-authorization@1'
    assert record['minimumPercent'] == 30 and record['comparison'] == 'strictly-less-than'
    assert record['replacesRelativeDropGuard'] is True and record['otherGuardsUnchanged'] is True
    assert record['userQuote'] == '電量界限我們改成30%'
    return {'minBatteryPercent': 30}, {'sha256': digest(path), 'record': record}


def base_files_from_receipt(receipt):
    """Accept either immutable base-preflight or prior-run receipt spelling."""
    files = receipt.get('files', receipt.get('baseFiles'))
    assert isinstance(files, list) and files, 'BASE_FILE_RECEIPT_REQUIRED'
    return files


def prepare(args):
    out, data = args.out.resolve(), args.data.resolve()
    assert not out.exists(), 'OUTPUT_ALREADY_EXISTS'
    maximum_seconds,authorization=time_authorization(getattr(args,'time_authorization',None))
    battery_guard,battery_record=battery_authorization(getattr(args,'battery_authorization',None))
    manifest = read(data / 'manifest.json')
    assert digest(data / 'examples.json') == manifest['outputs']['examples.json'], 'FROZEN_DATA_DRIFT'
    receipt = read(args.base_receipt)
    model_dir = Path(receipt['modelDirectory'])
    assert receipt['modelRevision'] == '200bb6db075e137a4deb08838865ac4ddb86292e'
    base_files = base_files_from_receipt(receipt)
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
    examples = read(data / 'examples.json')
    tokens = [{**{key: e[key] for key in ['id', 'heroId', 'groupId', 'slot', 'split']}, 'cacheGroup':e.get('sharedPrefixGroup'),
               'format': json.loads(e['messages'][2]['content'])['format'], **encode(tokenizer, e['messages'])} for e in examples]
    train = [r for r in tokens if r['split'] == 'train']
    dev = [r for r in tokens if r['split'] == 'dev']
    assert len(train) == manifest['counts']['train']['tasks'] and len(dev) == manifest['counts']['dev']['tasks']
    assert not {r['groupId'] for r in train} & {r['groupId'] for r in dev}, 'GROUP_LEAKAGE'
    assert any(r['slot'] == 'HERO' for r in train) and any(r['slot'] == 'HERO' for r in dev), 'WHOLE_HERO_REQUIRED'
    prefixes={}
    if manifest.get('layout')=='public-catalog-first@1':
        for example,row in zip(examples,tokens):
            if row['split']!='train' or row['cacheGroup'] in prefixes:continue
            content=example['messages'][1]['content'];user=json.loads(content)
            shared=json.dumps({key:user[key] for key in ['allowedCatalog','assets']},ensure_ascii=False,separators=(',',':'))[:-1]
            assert content.startswith(shared),'PUBLIC_PREFIX_LAYOUT_DRIFT'
            prompt=tokenizer.apply_chat_template(example['messages'][:2],tokenize=False,add_generation_prompt=True,enable_thinking=False)
            assert prompt.count(content)==1,'AMBIGUOUS_USER_CONTENT'
            public=tokenizer.encode(prompt[:prompt.index(content)]+shared,add_special_tokens=False)
            n=0
            while n<min(len(public),row['promptTokens']) and public[n]==row['ids'][n]:n+=1
            if not getattr(args,'cache_diagnostic',False):
                n=aligned_prefix_length(n,QUERY_BLOCK_TOKENS)
            assert n>1000,'NO_USEFUL_PUBLIC_PREFIX'
            prefixes[row['cacheGroup']]=public[:n]
        assert all(row['cacheGroup'] in prefixes and row['ids'][:len(prefixes[row['cacheGroup']])]==prefixes[row['cacheGroup']]
                   and len(prefixes[row['cacheGroup']])<row['promptTokens'] for row in tokens),'PREFIX_MEMBERSHIP_DRIFT'
    # Probe actual worst training sequence and actual longest answer. No source
    # or answer truncation, and dev never supplies gradients.
    strata = capacity_plan(train, dev)
    probe_ids = sorted({identity for stratum in strata.values() for identity in stratum['probeIds']})
    out.mkdir(parents=True)
    (out / 'source').mkdir()
    for file in [SCRIPT, MEMORY_SCRIPT, CACHE_SCRIPT]:
        snapshot = out / 'source' / file.name
        with snapshot.open('xb') as stream: stream.write(file.read_bytes())
        assert digest(snapshot) == digest(file), 'SOURCE_SNAPSHOT_DRIFT'
    atomic(out / 'tokens.json', tokens)
    config = {'schema': 'ggd-full-hero-lora-run@1', 'dataDirectory': str(data), 'frozenManifestSha256': digest(data / 'manifest.json'),
              'cacheDiagnosticOnly': bool(getattr(args,'cache_diagnostic',False)),
              'tokenizedSha256': digest(out / 'tokens.json'), 'workerSha256': digest(SCRIPT), 'memoryHelperSha256': digest(MEMORY_SCRIPT),
              'cacheHelperSha256':digest(CACHE_SCRIPT),
              'prefixCache':{'enabled':bool(prefixes),'prefixes':prefixes,'maxHiddenRelativeL2':0.01,
                  'boundaryPolicy':'original-public-boundary' if getattr(args,'cache_diagnostic',False) else 'global-query-block-aligned',
                  'maxLossDelta':0.02,'maxGradientRelativeL2':0.02,'source':'Public catalog/system prefix from TRAIN rows only; all memberships verified, no answers.',
                  'policy':'Frozen layers only, immutable host cache, exact prefix match, fresh suffix KV views. Trainable tail always recomputed.'},
              # A prior training manifest already pins the same base files as
              # ``baseFiles``; a standalone preflight receipt calls them
              # ``files``.  Both are immutable verification receipts, so the
              # preparation gate accepts either shape without rebuilding or
              # weakening the file-hash check performed by the worker.
              'modelDirectory': str(model_dir), 'modelRevision': receipt['modelRevision'], 'baseFiles': base_files,
              'minimumAvailableBytes': receipt['minimumAvailableBytes'], 'seed': 20260909,
              'epochs': 1, 'steps': len(train), 'batchSize': 1, 'learningRate': 2e-5,
              'numLayers': 2, 'loraParameters': {'rank': 8, 'scale': 8.0, 'dropout': 0.0, 'keys': ['self_attn.q_proj', 'self_attn.o_proj']},
              'maxSequenceTokens': max(r['totalTokens'] for r in tokens), 'sequenceTruncation': False,
              'maxTrainSequenceTokens': max(r['totalTokens'] for r in train),
              'maxTrainOutputTokens': max(r['outputTokens'] for r in train), 'probeIds': probe_ids, 'capacityStrata': strata,
              'capacityEstimatePolicy': 'Per-format observed gradient max * (train tasks + 2 * dev tasks), sum * 1.5 + 300s; heuristic admission estimate, not a timing guarantee. No dev gradients.',
              'metalLimitGiB': 28, 'secondsMaximum': maximum_seconds, 'probeSecondsMaximum': 1200, 'stepSecondsMaximum': 120,
              'resourceSampleIntervalSeconds': RESOURCE_SAMPLE_INTERVAL_SECONDS,
              'timeAuthorization':authorization,
              'batteryAuthorization':battery_record,
              'guard': {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, **battery_guard, 'acRequired': True, 'concurrentOwnGpuWorkers': 1},
              'saveEvery': max(1, math.ceil(len(train) / 5)), 'selection': 'fixed final one-epoch adapter; no dev checkpoint selection',
              'loss': 'completion-only exact causal teacher forcing; retain full prompt attention; only project completion hidden states into vocabulary',
              'memoryPolicy': {'queryBlockTokens': QUERY_BLOCK_TOKENS, 'lossBlockTokens': 128, 'sourceOrAnswerTruncation': False,
                               'detachedCustomForward': True, 'evaluatedBlockLeaves': True, 'firstOrderOnly': True,
                               'frozenTailMlpBlocks': True,
                               'layerwiseTailVjp': True,
                               'analyticAttentionVjp': True,
                               'frozenTailNormBlocks': False, 'hostFloat32AttentionAccumulation': True,
                               'materializedVjpBoundaries': True,
                               'blockLocalFloat32Attention': True,
                               'observeEveryBlockAndLayer': True,
                               'activeMetalLimitGiB': 28,
                               'frozenPrefix': 'Compute all frozen layers outside value_and_grad; dense/bounded tail parity uses the exact same frozen hidden input. No prefix parameter is trainable.',
                               'attentionPrecision': 'float32 Q/K/V and accumulation, then cast attention output to activation dtype; dense reference and future A/B must use the same arithmetic',
                               'controlTokens': 1153, 'controlPromptTokens': 768, 'maxLossDelta': 0.02, 'maxGradientRelativeL2': 0.02,
                               'reason': 'MLX 0.32.2 Metal training SDPA is unfused. Bound query blocks and recompute block VJPs; preserve all K/V gradient contributions.'},
              'automaticRestart': False, 'promotionAllowed': False, 'cloudGpuUsd': 0}
    atomic(out / 'manifest.json', config)
    summary = {'counts': manifest['counts'], 'trainTotalTokens': sum(r['totalTokens'] for r in train),
               'trainOutputTokens': sum(r['outputTokens'] for r in train), 'devTotalTokens': sum(r['totalTokens'] for r in dev),
               'maxSequenceTokens': config['maxSequenceTokens'], 'maxTrainOutputTokens': config['maxTrainOutputTokens'],
               'probeIds': probe_ids, 'capacityStrata': strata, 'gpuStarted': False, 'sequenceTruncation': False,
               'publicPrefixTokens':{key:len(value) for key,value in prefixes.items()}}
    atomic(out / 'token-preflight.json', summary)
    print(json.dumps(summary), flush=True)


def worker(directory, phase, token):
    p = read(directory / 'manifest.json')
    work = directory / phase
    assert read(LOCK)['token'] == token and read(LOCK)['task'] == str(work), 'OWNED_LOCK_REQUIRED'
    assert digest(SCRIPT) == p['workerSha256'], 'WORKER_DRIFT'
    assert digest(MEMORY_SCRIPT) == p['memoryHelperSha256'], 'MEMORY_HELPER_DRIFT'
    assert digest(CACHE_SCRIPT) == p['cacheHelperSha256'], 'CACHE_HELPER_DRIFT'
    assert digest(directory / 'tokens.json') == p['tokenizedSha256'], 'TOKEN_DATA_DRIFT'
    assert digest(Path(p['dataDirectory']) / 'manifest.json') == p['frozenManifestSha256'], 'FROZEN_MANIFEST_DRIFT'
    data = read(directory / 'tokens.json')
    train, dev = ([r for r in data if r['split'] == split] for split in ['train', 'dev'])
    start_resource = resources()
    assert start_resource['acPower'] and start_resource['availableBytes'] >= p['minimumAvailableBytes'], 'RESOURCE_ADMISSION'

    def progress(name, **fields):
        atomic(work / 'worker-progress.json', {'pid': os.getpid(), 'phase': name, 'startedAt': time.time(), **fields})

    progress('verify-model')
    for f in p['baseFiles']:
        file = Path(p['modelDirectory']) / f['name']
        assert file.stat().st_size == f['bytes'] and digest(file) == f['sha256'], 'BASE_MODEL_DRIFT'
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten
    from mlx_vlm import load
    from mlx_vlm.trainer.adapter_utils import linear_to_lora_layers
    spec = importlib.util.spec_from_file_location('ggd_distillation_memory', MEMORY_SCRIPT)
    memory = importlib.util.module_from_spec(spec); spec.loader.exec_module(memory)
    cache_spec=importlib.util.spec_from_file_location('ggd_prefix_cache',CACHE_SCRIPT)
    prefix_cache=importlib.util.module_from_spec(cache_spec);cache_spec.loader.exec_module(prefix_cache)
    mx.set_memory_limit(min(p['metalLimitGiB'] * GIB, mx.device_info()['max_recommended_working_set_size']))
    mx.set_cache_limit(128 * 1024 ** 2)
    mx.random.seed(p['seed'])
    progress('load-model')
    model, processor = load(p['modelDirectory'], lazy=True, strict=True, trust_remote_code=False)
    mx.eval(model.parameters()); model.freeze()
    assert model.model_type == 'gemma4_unified'
    linear_to_lora_layers(model, p['numLayers'], p['loraParameters'])
    params = dict(tree_flatten(model.trainable_parameters()))
    assert len(params) == 8 and all(k.endswith(('lora_a', 'lora_b')) for k in params), 'TRAINABLE_SCOPE'
    trainable_prefixes = tuple(f'language_model.model.layers.{i}.' for i in range(len(model.language_model.model.layers) - p['numLayers'], len(model.language_model.model.layers)))
    assert all(key.startswith(trainable_prefixes) for key in params), 'PREFIX_MUST_BE_FROZEN'
    mx.eval(model.trainable_parameters())
    initial = {k: mx.array(v) for k, v in params.items()}
    model.eval()

    audit_count = 0
    def memory_audit(event, **fields):
        nonlocal audit_count
        audit_count += 1
        active = mx.get_active_memory()
        # An extra in-worker fail-closed check at each evaluated block; does
        # not reset the supervisor phase timer or relax any existing guard.
        over = active > p['memoryPolicy']['activeMetalLimitGiB'] * GIB
        if event == 'frozen-layer' or audit_count % 16 == 0 or over:
            with (work / 'memory-trace.jsonl').open('a') as stream:
                stream.write(json.dumps({'at': time.time(), 'event': event, 'activeMetalBytes': active,
                                         'peakMetalBytes': mx.get_peak_memory(), **fields}) + '\n')
        assert not over, 'ACTIVE_METAL_LIMIT'

    caches={};cache_builds=[]
    def build_caches():
        for key,ids in sorted(p['prefixCache']['prefixes'].items()):
            progress('prefix-cache-build',group=key,tokens=len(ids));started=time.monotonic()
            caches[key]=prefix_cache.FrozenPrefixCache(mx,memory,model,ids,tail_layers=p['numLayers'],
                block_size=p['memoryPolicy']['queryBlockTokens'],observer=memory_audit)
            cache_builds.append({'group':key,'tokens':len(ids),'seconds':time.monotonic()-started,'hostBytes':caches[key].nbytes})
            atomic(work/'prefix-cache-builds.json',cache_builds)
    def prefix_for(row,uncached=False):
        if not uncached and caches and row.get('cacheGroup') in caches:
            return caches[row['cacheGroup']].hidden_for(row['ids'][:-1])
        inputs = mx.array([row['ids'][:-1]], dtype=mx.int32)
        return memory.frozen_prefix(mx, model, inputs, tail_layers=p['numLayers'], block_size=p['memoryPolicy']['queryBlockTokens'], observer=memory_audit)

    def loss_fn(net, row, full=False, prefix=None):
        assert prefix is not None, 'FROZEN_PREFIX_REQUIRED'
        ids = mx.array([row['ids']], dtype=mx.int32)
        n = row['outputTokens']
        hidden = memory.tail_hidden(mx, net, prefix, tail_layers=p['numLayers'],
                                    block_size=p['memoryPolicy']['queryBlockTokens'], reference=full, observer=memory_audit)[:, -n:, :]
        targets = ids[:, row['promptTokens']:]
        assert hidden.shape[:2] == targets.shape and targets.size == n
        if full:
            logits = net.language_model.logits_from_hidden(hidden)
            return nn.losses.cross_entropy(logits.astype(mx.float32), targets, reduction='mean')
        # The head is frozen; the custom VJP only returns hidden gradients.
        # Full prompt/answer context and all K/V contributions are preserved.
        loss = memory.make_completion_loss(mx, nn, net.language_model.logits_from_hidden, targets,
                                           block_size=p['memoryPolicy']['lossBlockTokens'], observer=memory_audit)
        return loss(hidden)

    def scalar_loss(row): return loss_fn(model, row, prefix=prefix_for(row)).item()

    dense_gradient_fn = nn.value_and_grad(model, loss_fn)
    def gradient_fn(net,row,full,prefix):
        if full: return dense_gradient_fn(net,row,True,prefix)
        targets=mx.array([row['ids'][row['promptTokens']:]],dtype=mx.int32)
        return memory.tail_value_and_grad(mx,nn,net,prefix,targets,tail_layers=p['numLayers'],
            block_size=p['memoryPolicy']['queryBlockTokens'],loss_block_size=p['memoryPolicy']['lossBlockTokens'],observer=memory_audit)
    if phase == 'probe':
        if p.get('cacheDiagnosticOnly'):
            assert p['prefixCache']['enabled'],'PUBLIC_PREFIX_REQUIRED'
            row=min((r for r in train if r['id'] in p['probeIds']),key=lambda r:r['totalTokens'])
            progress('gradient-probe',diagnosticOnly=True,id=row['id'],tokens=row['totalTokens'])
            result=prefix_cache.diagnose_partition(mx,memory,model,row['ids'][:-1],
                len(p['prefixCache']['prefixes'][row['cacheGroup']]),
                block_size=p['memoryPolicy']['queryBlockTokens'],observer=memory_audit)
            atomic(work/'prefix-partition-diagnostic.json',{'id':row['id'],**result})
            assert all(mx.array_equal(dict(tree_flatten(model.trainable_parameters()))[k],v).item() for k,v in initial.items())
            atomic(work/'result.json',{'phase':phase,'diagnosticOnly':True,'optimizerSteps':0,
                'fitsTimeBudget':False,'fitsStepBudget':False,'prefixCacheParityPassed':False,
                'modelPromoted':False,'note':'Forward-only diagnostic cannot authorize training.'})
            return
        # This short kernel-equivalence control is not a training sample.
        # Actual capacity probes below always use full frozen sequences.
        policy = p['memoryPolicy']
        small_ids = train[0]['ids'][:policy['controlTokens']]
        small = {'ids': small_ids, 'promptTokens': policy['controlPromptTokens'],
                 'outputTokens': len(small_ids) - policy['controlPromptTokens']}
        progress('kernel-equivalence')
        control_prefix = prefix_for(small)
        full_loss, full_grads = gradient_fn(model, small, True, control_prefix)
        opt_loss, opt_grads = gradient_fn(model, small, False, control_prefix)
        mx.eval(full_loss, full_grads, opt_loss, opt_grads)
        loss_delta = abs(full_loss.item() - opt_loss.item())
        f, o = dict(tree_flatten(full_grads)), dict(tree_flatten(opt_grads))
        delta = max(mx.max(mx.abs(f[k] - o[k])).item() for k in f)
        relative = {k: (mx.sqrt(mx.sum((f[k].astype(mx.float32) - o[k].astype(mx.float32)) ** 2)) /
                        mx.maximum(mx.sqrt(mx.sum(f[k].astype(mx.float32) ** 2)), 1e-12)).item() for k in f}
        equivalent = loss_delta <= policy['maxLossDelta'] and max(relative.values()) <= policy['maxGradientRelativeL2']
        atomic(work / 'kernel-equivalence.json', {'lossDelta': loss_delta, 'maxGradientDelta': delta,
              'passed': equivalent, 'gradientRelativeL2': relative, 'policy': policy, 'comparedTrainableTensors': len(f),
              'controlTokens': len(small_ids), 'trainingSampleTruncated': False,
              'note': 'Dense and blocked references use float32 attention, then original activation dtype. This does not prove parity with legacy BF16 attention. Tolerances fixed before this control; CPU primitives use 2e-5 absolute.'})
        assert equivalent, 'MEMORY_PATH_NOT_NUMERICALLY_EQUIVALENT'
        del full_loss, full_grads, opt_loss, opt_grads, f, o, control_prefix
        gc.collect(); mx.clear_cache()
        if p['prefixCache']['enabled']:build_caches()
        probes = []
        parity=[]
        for row in sorted(train, key=lambda row: row['totalTokens']):
            if row['id'] not in p['probeIds']:
                continue
            reference_started=begin_gradient_probe(progress,row,'uncached-reference' if caches else 'uncached')
            mx.reset_peak_memory()
            if caches:
                reference_prefix=prefix_for(row,uncached=True)
                reference_loss,reference_grads=gradient_fn(model,row,False,reference_prefix)
                mx.eval(reference_loss,reference_grads)
            # Each comparison leg is one full forward/backward operation.
            # Apply the unchanged 120s limit separately, not to their sum.
            started = begin_gradient_probe(progress,row,'cached') if caches else reference_started
            reference_seconds=started-reference_started if caches else None
            prefix = prefix_for(row)
            loss, grads = gradient_fn(model, row, False, prefix)
            mx.eval(loss, grads)
            flat = dict(tree_flatten(grads))
            assert set(flat) == set(params) and all(mx.all(mx.isfinite(v)).item() for v in flat.values()), 'BAD_GRADIENT'
            assert math.isfinite(loss.item()), 'NONFINITE_LOSS'
            elapsed=time.monotonic()-started
            if caches:
                a,b=reference_prefix.astype(mx.float32),prefix.astype(mx.float32)
                hidden_relative=(mx.sqrt(mx.sum((a-b)**2))/mx.maximum(mx.sqrt(mx.sum(a*a)),1e-12)).item()
                ref=dict(tree_flatten(reference_grads))
                relative={key:(mx.sqrt(mx.sum((ref[key].astype(mx.float32)-value.astype(mx.float32))**2))/
                    mx.maximum(mx.sqrt(mx.sum(ref[key].astype(mx.float32)**2)),1e-12)).item() for key,value in flat.items()}
                item={'id':row['id'],'hiddenRelativeL2':hidden_relative,'lossDelta':abs(reference_loss.item()-loss.item()),'gradientRelativeL2':relative}
                limits=p['prefixCache'];item['passed']=hidden_relative<=limits['maxHiddenRelativeL2'] and item['lossDelta']<=limits['maxLossDelta'] and max(relative.values())<=limits['maxGradientRelativeL2']
                parity.append(item);atomic(work/'prefix-cache-parity.json',parity)
                assert item['passed'],'PREFIX_CACHE_PARITY_FAILED'
                del reference_prefix,reference_loss,reference_grads,ref,a,b
            probes.append({'id': row['id'], 'format': row['format'], 'totalTokens': row['totalTokens'], 'outputTokens': row['outputTokens'],
                           'loss': loss.item(), 'seconds': elapsed, 'uncachedReferenceSeconds':reference_seconds,
                           'peakMetalBytes': mx.get_peak_memory()})
            atomic(work / 'probe-trace.json', probes)
            del loss, grads, flat, prefix
            gc.collect(); mx.clear_cache()
        assert len(probes) == len(p['probeIds'])
        assert all(mx.array_equal(dict(tree_flatten(model.trainable_parameters()))[k], v).item() for k, v in initial.items())
        upper = epoch_estimate(probes, p['capacityStrata'])+1.5*sum(item['seconds'] for item in cache_builds)
        atomic(work / 'result.json', {'phase': phase, 'probes': probes, 'optimizerSteps': 0,
              'allActualSamplesUntruncated': True, 'estimatedUpperEpochSeconds': upper,
              'fitsTimeBudget': upper <= p['secondsMaximum'], 'fitsStepBudget': max(r['seconds'] for r in probes) <= p['stepSecondsMaximum'],
              'prefixCacheEnabled':bool(caches),'prefixCacheParityPassed':all(item['passed'] for item in parity) if caches else None,
              'prefixCacheHostBytes':sum(cache.nbytes for cache in caches.values()),'cacheBuilds':cache_builds,
              'trainingQualityProven': False, 'versions': {k: metadata.version(k) for k in ['mlx', 'mlx-vlm', 'transformers', 'psutil']}})
        return

    probe = read(directory / 'probe/result.json')
    assert probe['fitsTimeBudget'] and probe['fitsStepBudget'], 'PROBE_BUDGET_FAILED'
    if p['prefixCache']['enabled']:
        assert probe.get('prefixCacheParityPassed'),'CACHE_NOT_ADMITTED'
        build_caches()
    optimizer = optim.Adam(learning_rate=p['learningRate'])

    def evaluate(name):
        model.eval(); results = []
        for row in dev:
            progress(name, id=row['id'])
            results.append({'id': row['id'], 'loss': scalar_loss(row), 'outputTokens': row['outputTokens']})
            gc.collect(); mx.clear_cache()
        atomic(work / (name + '.json'), results)
        return results

    before = evaluate('dev-before')
    order = list(range(len(train))); random.Random(p['seed']).shuffle(order)
    atomic(work / 'order.json', [train[i]['id'] for i in order])
    trace = []; checkpoints = []
    model.train()
    for step, index in enumerate(order, 1):
        if (work / 'STOP').exists():
            raise InterruptedError('USER_STOP')
        reason = violation(start_resource, resources(), p['guard'])
        if reason:
            raise RuntimeError(reason)
        row = train[index]; progress('training', step=step, id=row['id'], tokens=row['totalTokens'])
        started = time.monotonic(); mx.reset_peak_memory()
        prefix = prefix_for(row)
        loss, grads = gradient_fn(model, row, False, prefix); mx.eval(loss, grads)
        flat = dict(tree_flatten(grads))
        assert set(flat) == set(params) and all(mx.all(mx.isfinite(v)).item() for v in flat.values()), 'BAD_GRADIENT'
        assert math.isfinite(loss.item()), 'NONFINITE_LOSS'
        optimizer.update(model, grads); mx.eval(model.trainable_parameters(), optimizer.state)
        trace.append({'step': step, 'id': row['id'], 'loss': loss.item(), 'totalTokens': row['totalTokens'],
                      'seconds': time.monotonic() - started, 'peakMetalBytes': mx.get_peak_memory()})
        atomic(work / 'training-trace.json', trace)
        if step % p['saveEvery'] == 0 or step == len(order):
            checkpoint = work / f'checkpoint-{step:04d}'; checkpoint.mkdir()
            atomic(checkpoint / 'adapter_config.json', {'fine_tune_type': 'lora', 'num_layers': p['numLayers'], 'lora_parameters': p['loraParameters']})
            mx.save_safetensors(str(checkpoint / 'adapters.safetensors'), dict(tree_flatten(model.trainable_parameters())))
            checkpoints.append({'step': step, 'path': checkpoint.name, 'sha256': digest(checkpoint / 'adapters.safetensors')})
            atomic(work / 'checkpoints.json', checkpoints)
        del grads, flat, loss, prefix
        gc.collect(); mx.clear_cache()
    assert len(trace) == p['steps'] and len({r['id'] for r in trace}) == len(train), 'INCOMPLETE_EPOCH'
    after = evaluate('dev-after')
    progress('adapter-roundtrip')
    saved = mx.load(str(work / checkpoints[-1]['path'] / 'adapters.safetensors'))
    final = dict(tree_flatten(model.trainable_parameters()))
    assert set(saved) == set(final) and all(mx.array_equal(saved[k], final[k]).item() for k in saved)
    model.load_weights(list(initial.items()), strict=False)
    reset_loss = scalar_loss(dev[0])
    assert abs(reset_loss - before[0]['loss']) < 1e-5, 'FROZEN_BASE_CHANGED'
    model.load_weights(list(saved.items()), strict=False)
    reload_loss = scalar_loss(dev[0])
    assert abs(reload_loss - after[0]['loss']) < 1e-5, 'ADAPTER_RELOAD_FAILED'
    atomic(work / 'adapter-roundtrip.json', {'tensorKeys': sorted(saved), 'resetLoss': reset_loss, 'reloadLoss': reload_loss, 'passed': True})
    atomic(work / 'result.json', {'phase': phase, 'steps': len(trace), 'uniqueTrainingTasks': len(train),
          'wholeHeroTrainingTasks': sum(r['slot'] == 'HERO' for r in train), 'checkpoint': checkpoints[-1],
          'peakMetalBytes': max(r['peakMetalBytes'] for r in trace), 'trainingSeconds': sum(r['seconds'] for r in trace),
          'beforeMeanDevCE': sum(r['loss'] * r['outputTokens'] for r in before) / sum(r['outputTokens'] for r in before),
          'afterMeanDevCE': sum(r['loss'] * r['outputTokens'] for r in after) / sum(r['outputTokens'] for r in after),
          'ceIsGenerationSuccessMetric': False, 'modelPromoted': False, 'fullHeroE2EProven': False})


def supervise(directory, phase):
    p = read(directory / 'manifest.json'); work = directory / phase
    assert not work.exists(), 'REFUSE_RESTART_OR_OVERWRITE'
    assert p['workerSha256'] == digest(SCRIPT), 'WORKER_DRIFT'
    if phase == 'train':
        assert not p.get('cacheDiagnosticOnly'),'DIAGNOSTIC_CANNOT_TRAIN'
        probe = read(directory / 'probe/result.json')
        assert probe['fitsTimeBudget'] and probe['fitsStepBudget'], 'PROBE_BUDGET_FAILED'
        assert read(directory / 'probe/state.json')['status'] == 'completed', 'PROBE_SUPERVISOR_DID_NOT_FINISH'
    start = resources()
    assert start['acPower'] and start['availableBytes'] >= p['minimumAvailableBytes'], 'RESOURCE_ADMISSION'
    assert not violation(start, start, p['guard']), 'RESOURCE_GUARD'
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    state = {'status': 'starting', 'pid': os.getpid(), 'workerPid': None, 'startedAt': time.time(), 'phase': phase,
             'manifestSha256': digest(directory / 'manifest.json'), 'preflight': start, 'samples': []}
    child = None
    lock_created = False
    work_created = False

    def interrupt(signum, frame):
        raise InterruptedError('INTERRUPTED')

    previous_handlers = {sig: signal.getsignal(sig) for sig in [signal.SIGTERM, signal.SIGINT]}
    try:
        with LOCK.open('x') as stream:
            lock_created = True
            json.dump({'pid': os.getpid(), 'task': str(work), 'token': token}, stream)
        work.mkdir()
        work_created = True
        signal.signal(signal.SIGTERM, interrupt); signal.signal(signal.SIGINT, interrupt)
        with (work / 'worker.log').open('x') as log:
            child = subprocess.Popen([sys.executable, str(SCRIPT), 'worker', '--run', str(directory), '--phase', phase, '--token', token],
                                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            state.update(status='running', workerPid=child.pid); atomic(work / 'state.json', state)
            last_resource_sample = time.monotonic()
            while child.poll() is None:
                time.sleep(2)
                # Keep the short process/step deadline, but do not wake
                # battery/RAM/swap sensors more frequently than authorised.
                reason = None
                if time.monotonic() - last_resource_sample >= p['resourceSampleIntervalSeconds']:
                    sample = resources(); state['samples'].append(sample); atomic(work / 'state.json', state)
                    reason = violation(start, sample, p['guard'])
                    last_resource_sample = time.monotonic()
                if (work / 'STOP').exists(): reason = 'USER_STOP'
                maximum = p['probeSecondsMaximum'] if phase == 'probe' else p['secondsMaximum']
                if time.time() - state['startedAt'] > maximum: reason = 'RUN_TIME_LIMIT'
                if (work / 'worker-progress.json').exists():
                    progress = read(work / 'worker-progress.json'); assert progress['pid'] == child.pid
                    limit = p['stepSecondsMaximum'] if progress['phase'] in ['training', 'gradient-probe'] else 610
                    if time.time() - progress['startedAt'] > limit: reason = 'PHASE_TIME_LIMIT'
                if reason: raise RuntimeError(reason)
            assert child.returncode == 0, f'WORKER_EXIT:{child.returncode}'
            assert read(work / 'result.json')['phase'] == phase
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
            if work_created: atomic(work / 'state.json', state)
        finally:
            # Never remove a different worker's lock or overwrite its output.
            # A mkdir/log/Popen failure must still release our own lock.
            if lock_created and LOCK.exists() and read(LOCK).get('token') == token: LOCK.unlink()
            for sig, handler in previous_handlers.items(): signal.signal(sig, handler)
    print(json.dumps({k: v for k, v in state.items() if k != 'samples'}), flush=True)
    if state['status'] != 'completed': raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'probe', 'train', 'worker'])
    parser.add_argument('--data', type=Path); parser.add_argument('--base-receipt', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--run', type=Path); parser.add_argument('--phase', choices=['probe', 'train']); parser.add_argument('--token')
    parser.add_argument('--cache-diagnostic', action='store_true', help='Prepare a bounded forward-only cache diagnostic, never a training admission.')
    parser.add_argument('--time-authorization', type=Path, help='Explicit user authorization record for this single epoch; default remains 7200s.')
    parser.add_argument('--battery-authorization', type=Path, help='Explicit 30-percent floor authorization; replaces relative battery-drop guard for this new run only.')
    args = parser.parse_args()
    if args.action == 'prepare':
        assert args.data and args.base_receipt and args.out
        prepare(args)
    elif args.action == 'worker':
        assert args.run and args.phase and args.token
        worker(args.run.resolve(), args.phase, args.token)
    else:
        assert args.run
        supervise(args.run.resolve(), args.action)

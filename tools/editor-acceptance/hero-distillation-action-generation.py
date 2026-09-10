"""Bounded autoregressive Hero Forge action generation.

The model never receives a future teacher cursor.  Python derives the current
cursor from its own accepted prior shape actions, while the canonical JS bridge
validates all semantic selections and assembles the final HeroPlan.
"""
import hashlib
import importlib.util
import json
import subprocess
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve()
SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX']
MAX_ACTION_SEQUENCE = 512
SCRIPT_KEYS = {'instanceId', 'provenance', 'capabilityIds', 'directionOptionIds',
               'fallbackOptionIds', 'modelKey', 'championIcon', 'icon', 'sfxKey',
               'vfxKey', 'attach', 'replaces'}


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPT.with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


g = module('action_generation_json', 'hero-distillation-generation.py')


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def decoding_contract():
    return {'max_tokens': 256, 'temperature': 0.0, 'top_p': 1.0, 'top_k': 0,
            'prefill_step_size': 256, 'enable_thinking': False, 'seed': 20260910,
            'skip_special_tokens': True}


def strict_object(raw):
    parsed = g.parse_output(raw)
    assert parsed['parsed'] and parsed['wrapper'] in ['none', 'whole-response-json-fence'], 'ACTION_JSON_REJECTED:' + str(parsed['error'])
    return parsed['value']


def exact(value, keys, code):
    assert isinstance(value, dict) and set(value) == set(keys), code


def reject_native(value):
    if isinstance(value, list):
        for item in value:
            reject_native(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            assert key not in SCRIPT_KEYS, 'ACTION_SCRIPT_FIELD:' + key
            reject_native(item)
    elif isinstance(value, str):
        assert not (value.startswith('fx.prim.') or value.startswith('assets/') or value.startswith('champ.')), 'ACTION_NATIVE_VALUE'


def set_at(root, path, value):
    if not path:
        return value
    current = root
    for key in path[:-1]:
        assert isinstance(current, (dict, list)), 'ACTION_PARENT_MISSING'
        current = current[key]
    current[path[-1]] = value
    return root


def apply_action(state, answer, scalar_values=False):
    exact(answer, ['format', 'op', 'value'], 'ACTION_OUTPUT_KEYS')
    assert answer['format'] == 'forge-next-json-action@1', 'ACTION_FORMAT'
    queue = list(state['queue'])
    assert queue, 'ACTION_QUEUE_COMPLETE'
    cursor = queue.pop(0)
    if answer['op'] == 'value':
        value = answer['value']
        if scalar_values:
            assert value is None or isinstance(value, (str, int, float, bool)), 'ACTION_VALUE_NOT_SCALAR'
        reject_native(value)
    else:
        assert answer['op'] == 'shape', 'ACTION_OPERATION'
        shape = answer['value']
        assert isinstance(shape, dict) and shape.get('kind') in ['array', 'object'], 'ACTION_SHAPE'
        if shape['kind'] == 'array':
            exact(shape, ['kind', 'length'], 'ACTION_ARRAY_SHAPE')
            assert isinstance(shape['length'], int) and 0 <= shape['length'] <= 32, 'ACTION_ARRAY_LENGTH'
            value = [None] * shape['length']
            queue = [[*cursor, index] for index in range(shape['length'])] + queue
        else:
            exact(shape, ['kind', 'keys'], 'ACTION_OBJECT_SHAPE')
            keys = shape['keys']
            assert isinstance(keys, list) and all(isinstance(key, str) and key not in SCRIPT_KEYS for key in keys), 'ACTION_OBJECT_KEYS'
            assert len(set(keys)) == len(keys), 'ACTION_DUPLICATE_KEYS'
            value = {}
            queue = [[*cursor, key] for key in keys] + queue
    return {'queue': queue, 'root': set_at(state['root'], cursor, value), 'accepted': state['accepted'] + 1}


def generate_one(case_id, stage, messages, tokenizer, stream_factory, progress):
    assert [message['role'] for message in messages] == ['system', 'user'], 'ACTION_MESSAGE_BOUNDARY'
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    ids = tokenizer.encode(prompt, add_special_tokens=False)
    assert ids, 'ACTION_EMPTY_PROMPT'
    progress('generation', id=case_id, stage=stage, promptTokens=len(ids))
    started, chunks, last, stream, failure = time.monotonic(), [], None, None, None
    try:
        stream = stream_factory(prompt, ids, decoding_contract())
        for last in stream:
            chunks.append(last.text)
    except Exception as error:
        failure = error
    finally:
        if stream is not None and hasattr(stream, 'close'):
            try:
                stream.close()
            except Exception as error:
                failure = failure or error
    raw = ''.join(chunks)
    finish, count = getattr(last, 'finish_reason', None), getattr(last, 'generation_tokens', None)
    complete = failure is None and finish == 'stop' and isinstance(count, int) and 0 < count <= decoding_contract()['max_tokens']
    parsed = g.parse_output(raw) if complete else {'parsed': False, 'wrapper': 'none', 'error': repr(failure), 'value': None}
    accepted = parsed['parsed'] and parsed['wrapper'] in ['none', 'whole-response-json-fence']
    return {'id': case_id, 'stage': stage, 'messagesSha256': sha(compact(messages)), 'promptSha256': sha(prompt),
            'promptTokens': len(ids), 'promptTokenIdsSha256': sha(compact(ids)), 'decoding': decoding_contract(),
            'raw': raw, 'rawSha256': sha(raw), 'seconds': time.monotonic()-started, 'generationTokens': count,
            'finishReason': finish, 'complete': complete, 'cachedPromptTokens': getattr(last, 'cached_tokens', None),
            'promptTokensPerSecond': getattr(last, 'prompt_tps', None), 'generationTokensPerSecond': getattr(last, 'generation_tps', None),
            'error': repr(failure) if failure else None, 'json': parsed['value'], 'jsonAccepted': accepted,
            'jsonWrapper': parsed['wrapper'], 'jsonError': parsed['error'], 'attempts': 1, 'humanRepairs': 0}


def action_sequence(case, slot, selection, core, product, tokenizer, stream_factory, progress, emit, scalar_values=False):
    state = {'queue': [[]], 'root': None, 'accepted': 0}
    answers = []
    while state['queue']:
        assert state['accepted'] < MAX_ACTION_SEQUENCE, 'ACTION_SEQUENCE_LIMIT'
        cursor = state['queue'][0]
        payload = {'request': case['request'], 'identity': case['identity'], 'slot': slot, 'selection': selection,
                   'core': core, 'cursor': {'path': cursor, 'ordinal': state['accepted']},
                   'outputContract': {'format': 'forge-next-json-action@1'}}
        if product is not None:
            payload['product'] = product
        label = 'core-action' if product is None else 'action'
        record = generate_one(f"{case['heroId']}:{slot}:{label}:{state['accepted']}", label,
                              [{'role': 'system', 'content': case['actionSystem']}, {'role': 'user', 'content': compact(payload)}],
                              tokenizer, stream_factory, progress)
        emit(record)
        assert record['complete'] and record['jsonAccepted'], 'ACTION_INCOMPLETE_OR_INVALID_JSON'
        state = apply_action(state, record['json'], scalar_values=scalar_values)
        answers.append(record['json'])
    assert state['root'] is not None, 'ACTION_EMPTY_ROOT'
    return answers


def assemble(cli, payload):
    process = subprocess.run(['node', str(cli), 'assemble'], input=compact(payload), text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    assert process.returncode == 0, 'ACTION_RUNTIME_REJECTED:' + process.stderr.strip()
    return json.loads(process.stdout)


def generate_hero(case, cli, tokenizer, stream_factory, progress, emit):
    expected = {'heroId', 'heroName', 'request', 'decisionSpace', 'assetBinding', 'identityMessages',
                'selectionSystem', 'coreSystem', 'actionSystem', 'detailedCatalog'}
    assert set(case) in [expected, expected | {'actionProtocol'}], 'ACTION_HERO_CASE_KEYS'
    action_protocol = case.get('actionProtocol', 'legacy@1')
    assert action_protocol in ['legacy@1', 'scalar-leaves@1'], 'ACTION_PROTOCOL'
    scalar_values = action_protocol == 'scalar-leaves@1'
    identity_record = generate_one(case['heroId'] + ':identity', 'identity', case['identityMessages'], tokenizer, stream_factory, progress)
    emit(identity_record); assert identity_record['complete'] and identity_record['jsonAccepted'], 'ACTION_IDENTITY_INVALID'
    identity = identity_record['json']; exact(identity, ['format', 'identity'], 'ACTION_IDENTITY_KEYS'); assert identity['format'] == 'forge-identity@1', 'ACTION_IDENTITY_FORMAT'
    case = {**case, 'identity': identity['identity']}
    selections, cores, core_actions, product_actions = {}, {}, {}, {}
    for slot in SLOTS:
        payload = {'request': case['request'], 'identity': case['identity'], 'slot': slot, 'decisionSpace': case['decisionSpace'],
                   'outputContract': {'format': 'forge-slot-selection@1', 'slot': slot}}
        record = generate_one(f"{case['heroId']}:{slot}:selection", 'selection',
                              [{'role': 'system', 'content': case['selectionSystem']}, {'role': 'user', 'content': compact(payload)}], tokenizer, stream_factory, progress)
        emit(record); assert record['complete'] and record['jsonAccepted'], 'ACTION_SELECTION_INVALID:' + slot
        selection = record['json']; exact(selection, ['format', 'slot', 'selection'], 'ACTION_SELECTION_KEYS'); assert selection['format'] == 'forge-slot-selection@1' and selection['slot'] == slot, 'ACTION_SELECTION_FORMAT'
        selections[slot] = selection
    for slot in SLOTS:
        selection = selections[slot]['selection']
        payload = {'request': case['request'], 'identity': case['identity'], 'slot': slot, 'selection': selection,
                   'outputContract': {'format': 'forge-slot-core@1', 'slot': slot}}
        record = generate_one(f"{case['heroId']}:{slot}:core", 'core',
                              [{'role': 'system', 'content': case['coreSystem']}, {'role': 'user', 'content': compact(payload)}], tokenizer, stream_factory, progress)
        emit(record); assert record['complete'] and record['jsonAccepted'], 'ACTION_CORE_INVALID:' + slot
        core = record['json']; exact(core, ['format', 'slot', 'productTemplates'], 'ACTION_CORE_KEYS'); assert core['format'] == 'forge-slot-core@1' and core['slot'] == slot and isinstance(core['productTemplates'], list) and core['productTemplates'], 'ACTION_CORE_FORMAT'
        cores[slot] = core
        core_actions[slot] = action_sequence(case, slot, selection, core, None, tokenizer, stream_factory, progress, emit, scalar_values=scalar_values)
        product_actions[slot] = []
        for index, template_ref in enumerate(core['productTemplates']):
            product_actions[slot].append(action_sequence(case, slot, selection, core, {'index': index, 'templateRef': template_ref}, tokenizer, stream_factory, progress, emit, scalar_values=scalar_values))
    target = assemble(cli, {'identity': identity, 'slotSelections': selections, 'slotCores': cores, 'coreActions': core_actions,
                            'productActions': product_actions, 'decisionSpace': case['decisionSpace'], 'actionProtocol': action_protocol,
                            'context': {'heroId': case['heroId'], 'heroName': case['heroName'], 'request': case['request'],
                                        'assetBinding': case['assetBinding'], 'detailedCatalog': case['detailedCatalog']}})
    return {'heroId': case['heroId'], 'target': target, 'targetSha256': sha(compact(target)), 'identity': identity,
            'slotSelections': selections, 'slotCores': cores, 'coreActions': core_actions, 'productActions': product_actions,
            'humanRepairs': 0, 'fullHeroE2EProven': False}

"""Bounded seven-call generation core for the compact Hero Forge contract.

The caller supplies public selection messages only.  After one arm generates a
selection, this module invokes the canonical JS runtime bridge to construct
six config messages from *that same selection*.  It never accepts a teacher
answer, repairs malformed output, retries a call, or invents a fallback.
"""
import hashlib
import importlib.util
import json
import subprocess
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve()


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPT.with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


g = module('compact_generation_json', 'hero-distillation-generation.py')
SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX']


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def decoding_contract():
    # Fixed for every compact selection/configuration in every arm.  It is
    # intentionally independent of teacher output size.
    return {'max_tokens': 4096, 'temperature': 0.0, 'top_p': 1.0, 'top_k': 0,
            'prefill_step_size': 256, 'enable_thinking': False,
            'seed': 20260910, 'skip_special_tokens': True}


def strict_object(raw):
    parsed = g.parse_output(raw)
    assert parsed['parsed'] and parsed['wrapper'] == 'none', 'COMPACT_JSON_REJECTED:' + str(parsed['error'])
    return parsed['value']


def bridge(cli, mode, dataset, value):
    process = subprocess.run(['node', str(cli), mode, str(dataset)], input=compact(value),
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    assert process.returncode == 0, 'COMPACT_RUNTIME_REJECTED:' + process.stderr.strip()
    return json.loads(process.stdout)


def generate_one(case_id, stage, messages, tokenizer, stream_factory, progress):
    assert [message['role'] for message in messages] == ['system', 'user'], 'COMPACT_MESSAGE_BOUNDARY'
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    ids = tokenizer.encode(prompt, add_special_tokens=False)
    assert ids, 'COMPACT_EMPTY_PROMPT'
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
    value = strict_object(raw) if complete else None
    return {'id': case_id, 'stage': stage, 'messagesSha256': sha(compact(messages)),
            'promptSha256': sha(prompt), 'promptTokens': len(ids), 'promptTokenIdsSha256': sha(compact(ids)),
            'decoding': decoding_contract(), 'raw': raw, 'rawSha256': sha(raw), 'seconds': time.monotonic() - started,
            'generationTokens': count, 'finishReason': finish, 'complete': complete,
            'cachedPromptTokens': getattr(last, 'cached_tokens', None),
            'promptTokensPerSecond': getattr(last, 'prompt_tps', None),
            'generationTokensPerSecond': getattr(last, 'generation_tps', None),
            'error': repr(failure) if failure else None, 'json': value,
            'attempts': 1, 'humanRepairs': 0}


def generate_hero(case, dataset, cli, tokenizer, stream_factory, progress, emit):
    """Generate and materialize exactly one hero.  `case` carries only public
    request/messages and script-owned identity/binding; it has no teacher data."""
    expected = {'heroId', 'heroName', 'request', 'selectionMessages', 'configurationSystem', 'assetBinding'}
    assert set(case) == expected, 'COMPACT_HERO_CASE_KEYS'
    selection_record = generate_one(case['heroId'] + ':HERO:select', 'select', case['selectionMessages'],
                                    tokenizer, stream_factory, progress)
    emit(selection_record)
    assert selection_record['complete'], 'COMPACT_SELECTION_INCOMPLETE'
    selection = selection_record['json']
    # Validation and config-contract construction live in the JS runtime, so
    # Python cannot accidentally broaden selected candidates.
    configurations = {}
    for slot in SLOTS:
        config_input = bridge(cli, 'config-input', dataset,
                              {'request': case['request'], 'selection': selection, 'slot': slot})
        messages = [{'role': 'system', 'content': case['configurationSystem']},
                    {'role': 'user', 'content': compact(config_input)}]
        record = generate_one(case['heroId'] + ':' + slot + ':configure', 'configure', messages,
                              tokenizer, stream_factory, progress)
        emit(record)
        assert record['complete'], 'COMPACT_CONFIGURATION_INCOMPLETE:' + slot
        # The full slot configuration is validated here, during final bridge
        # assembly; an unselected semantic ID fails closed there.
        configurations[slot] = record['json']
    target = bridge(cli, 'assemble', dataset, {'heroId': case['heroId'], 'heroName': case['heroName'],
                    'request': case['request'], 'selection': selection, 'slotConfigurations': configurations,
                    'assetBinding': case['assetBinding']})
    return {'heroId': case['heroId'], 'target': target, 'targetSha256': sha(compact(target)),
            'selection': selection, 'slotConfigurations': configurations,
            'calls': 1 + len(SLOTS), 'humanRepairs': 0, 'fullHeroE2EProven': False}

"""Paired full-output generation core; no CLI, training or teacher-file access.

The caller owns the resource-guarded process and durable per-case output. Importing
this module does not import MLX, load weights or acquire a GPU. This is inference
wiring, not a semantic scorer or evidence of playable-hero success.
"""
import hashlib
import json
import math
import re
import time


def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def compact(value):
    # Matches JSON.stringify for these string/object/array-only public messages.
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def validate_cases(cases):
    assert cases and len({r['id'] for r in cases}) == len(cases), 'EMPTY_OR_DUPLICATE_CASES'
    expected = {'id', 'heroId', 'groupId', 'slot', 'engineRevision', 'format',
                'inputSha256', 'messagesSha256', 'messages'}
    for row in cases:
        assert set(row) == expected, 'PUBLIC_CASE_KEYS'
        assert [m['role'] for m in row['messages']] == ['system', 'user'], 'MESSAGE_BOUNDARY'
        assert all(set(m) == {'role', 'content'} and isinstance(m['content'], str)
                   for m in row['messages']), 'MESSAGE_CONTENT'
        assert sha(compact(row['messages'])) == row['messagesSha256'], 'MESSAGE_DRIFT'
        assert sha(row['messages'][1]['content']) == row['inputSha256'], 'INPUT_DRIFT'
        contract = json.loads(row['messages'][1]['content'])['outputContract']
        assert (contract['heroId'], contract['slot'], contract['format']) == (
            row['heroId'], row['slot'], row['format']), 'OUTPUT_CONTRACT_DRIFT'


def decoding_contract():
    # One public-contract limit for every case, not a limit derived from answers.
    return {'max_tokens': 16384, 'temperature': 0.0, 'top_p': 1.0, 'top_k': 0,
            'prefill_step_size': 256, 'enable_thinking': False,
            'seed': 20260909, 'skip_special_tokens': True}


def parse_output(raw):
    """Strict object or single whole-response JSON fence; never repair content.

    This research profile intentionally does not extract one object from prose,
    strip reasoning, merge multiple answers, or implement Editor ticket #1108.
    Duplicate keys and non-finite numbers fail closed, unlike plain json.loads.
    """
    text = raw.strip()
    wrapper = 'none'
    fenced = re.fullmatch(r'```(?:json)?\s*\n([\s\S]*?)\n```', text)
    if fenced:
        text, wrapper = fenced.group(1), 'whole-response-json-fence'

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('DUPLICATE_JSON_KEY')
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError('NONFINITE_JSON_NUMBER')

    def number(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError('NONFINITE_JSON_NUMBER')
        return result

    try:
        value = json.loads(text, object_pairs_hook=pairs,
                           parse_constant=invalid_constant, parse_float=number)
        if not isinstance(value, dict):
            raise ValueError('JSON_OBJECT_REQUIRED')
    except (ValueError, RecursionError) as error:
        return {'parsed': False, 'wrapper': wrapper, 'error': str(error), 'value': None}
    return {'parsed': True, 'wrapper': wrapper, 'error': None, 'value': value}


def generate_cases(cases, tokenizer, stream_factory, emit, progress):
    """Exactly one attempt per case. Persist raw output even on stream failure.

    stream_factory receives the rendered prompt, exact untruncated token IDs,
    and an identical fresh decoding dict. It must reset per-case KV state.
    Fatal generator errors are recorded then re-raised, not silently retried.
    No teacher object/path is accepted by this interface.
    """
    validate_cases(cases)
    for index, row in enumerate(cases):
        prompt = tokenizer.apply_chat_template(row['messages'], tokenize=False,
                   add_generation_prompt=True, enable_thinking=False)
        ids = tokenizer.encode(prompt, add_special_tokens=False)
        assert ids, 'EMPTY_PROMPT'
        progress('generation', index=index, id=row['id'], promptTokens=len(ids))
        started = time.monotonic()
        chunks, last, stream, failure = [], None, None, None
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
        finish = getattr(last, 'finish_reason', None)
        count = getattr(last, 'generation_tokens', None)
        # A valid-looking JSON prefix at the output cap must not pass.
        complete = (failure is None and finish == 'stop' and isinstance(count, int)
                    and 0 < count <= decoding_contract()['max_tokens'])
        parsed = parse_output(raw)
        record = {'id': row['id'], 'heroId': row['heroId'], 'slot': row['slot'],
            'format': row['format'], 'messagesSha256': row['messagesSha256'],
            'promptSha256': sha(prompt), 'promptTokens': len(ids),
            'promptTokenIdsSha256': sha(compact(ids)), 'decoding': decoding_contract(),
            'raw': raw, 'rawSha256': sha(raw), 'seconds': time.monotonic()-started,
            'generationTokens': count, 'finishReason': finish, 'complete': complete,
            'error': repr(failure) if failure else None, 'json': parsed,
            'outputFormatMatches': parsed['parsed'] and parsed['value'].get('format') == row['format'],
            'fullHeroE2EProven': False, 'humanRepairs': 0, 'attempts': 1}
        emit(record)
        if failure:
            raise failure


def mlx_stream_factory(model, processor):
    """Use only inside a separately resource-guarded GPU worker.

    No prompt cache is shared between cases/arms. Forward-only FP32 attention
    must be selected by the caller for both arms; training's custom VJP and
    PrefixKV policy are not compatible with native autoregressive KV caches.
    """
    import mlx.core as mx
    from mlx_vlm import stream_generate

    def factory(prompt, ids, settings):
        mx.random.seed(settings['seed'])
        return stream_generate(model, processor, prompt,
            input_ids=mx.array([ids]), verbose=False, **settings)
    return factory

"""CPU-only tokenizer alignment for explicit JSON value exclusion.
Produces masks, never starts training or loads model weights.
"""
import argparse
import hashlib
import json
from pathlib import Path

def digest(value):
    return hashlib.sha256(value).hexdigest()

def align_loss_mask(text, offsets, prefix_tokens, prefix_bytes, excluded):
    char_to_byte = [0]
    for c in text:
        char_to_byte.append(char_to_byte[-1] + len(c.encode('utf-8')))
    ranges = [(prefix_bytes + s['startByte'], prefix_bytes + s['endByte']) for s in excluded]
    for lo, hi in ranges:
        assert 0 <= lo < hi <= char_to_byte[-1], 'EXCLUSION_OUT_OF_RANGE'
    mask, touched, byte_offsets = [], [0] * len(ranges), []
    for index, (start, end) in enumerate(offsets):
        assert 0 <= start <= end <= len(text), 'TOKEN_OFFSET_OUT_OF_RANGE'
        lo, hi = char_to_byte[start], char_to_byte[end]
        byte_offsets.append([lo, hi])
        allowed = index >= prefix_tokens
        if allowed:
            assert hi > lo, 'UNVERIFIABLE_ZERO_WIDTH_COMPLETION_TOKEN'
        for i, (a, b) in enumerate(ranges):
            if lo < b and hi > a:
                assert index >= prefix_tokens, 'MASK_INTERSECTS_PROMPT'
                allowed = False
                touched[i] += 1
        mask.append(int(allowed))
    assert all(n > 0 for n in touched), 'MASK_SPAN_HAS_NO_TOKENS'
    assert sum(mask) > 0 and not any(mask[:prefix_tokens]), 'EMPTY_OR_PROMPT_LOSS'
    return mask, byte_offsets, touched

def prepare(dataset_dir, model_dir, output_dir):
    assert dataset_dir.is_dir() and model_dir.is_dir() and not output_dir.exists()
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
    assert tokenizer.is_fast, 'EXACT_OFFSETS_REQUIRED'
    rows = json.loads((dataset_dir / 'dataset.private.json').read_text())
    manifest = json.loads((dataset_dir / 'manifest.json').read_text())
    canonical = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode()
    assert digest(canonical) == manifest['datasetSha256'], 'DATASET_DRIFT'
    prepared = []
    for row in rows:
        target = row['target']; answer = target['text']
        assert digest(answer.encode()) == target['textSha256'], 'ANSWER_DRIFT'
        for span in target['excluded']:
            assert digest(answer.encode()[span['startByte']:span['endByte']]) == span['valueSha256'], 'VALUE_SPAN_DRIFT'
        prompt = tokenizer.apply_chat_template(row['messages'], tokenize=False, add_generation_prompt=True, enable_thinking=False)
        assert prompt.endswith('<|channel>thought\n<channel|>'), 'NONTHINKING_PREFIX_DRIFT'
        history = tokenizer.apply_chat_template(row['messages'] + [{'role': 'assistant', 'content': answer}],
            tokenize=False, add_generation_prompt=False, enable_thinking=False)
        prefix_plain = prompt[:-len('<|channel>thought\n<channel|>')]
        assert history == prefix_plain + answer + '<turn|>\n', 'NATIVE_COMPLETION_BOUNDARY_DRIFT'
        text = prompt + answer + '<turn|>\n'
        prefix = tokenizer.encode(prompt, add_special_tokens=False)
        encoded = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
        ids, offsets = encoded['input_ids'], encoded['offset_mapping']
        assert ids[:len(prefix)] == prefix and len(ids) > len(prefix), 'TOKEN_PREFIX_BOUNDARY_DRIFT'
        mask, byte_offsets, touched = align_loss_mask(text, offsets, len(prefix), len(prompt.encode()), target['excluded'])
        prepared.append({'id': row['id'], 'heroId': row['heroId'], 'ids': ids, 'labelMask': mask,
            'promptTokens': len(prefix), 'completionTokens': len(ids) - len(prefix), 'directLossTokens': sum(mask),
            'maskedCompletionTokens': len(ids) - len(prefix) - sum(mask),
            'excludedSpans': [{**s, 'overlappingTokens': n} for s, n in zip(target['excluded'], touched)],
            'textSha256': digest(text.encode()), 'tokenByteOffsets': byte_offsets,
            'lossAlignment': 'logits[:, :-1] predicts ids[1:]; use labelMask[1:]',
            'trainingAdmitted': False, 'indirectConditioningStillPresent': True})
    result = {'schema': 'ggd-semantic-token-mask-preparation@2', 'cpuOnly': True, 'modelWeightsLoaded': False,
        'modelDirectory': str(model_dir), 'datasetSha256': manifest['datasetSha256'],
        'scriptSha256': digest(Path(__file__).read_bytes()), 'tokenizerClass': type(tokenizer).__name__,
        'tokenizerFiles': {p.name: digest(p.read_bytes()) for p in model_dir.iterdir() if p.name in ('tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja')},
        'tokenizedDataSha256': digest(json.dumps(prepared, ensure_ascii=False, separators=(',', ':')).encode()),
        'heroes': len(prepared), 'sourceFamilyCounts': {family: sum(r.get('sourceFamily') == family for r in rows) for family in sorted({r.get('sourceFamily', 'unknown') for r in rows})},
        'datasetScope': manifest.get('scope', 'engineering controls only; no independent generalization claim'), 'rows': [{k: r[k] for k in ('id', 'promptTokens', 'completionTokens', 'directLossTokens', 'maskedCompletionTokens')} for r in prepared],
        'trainingAdmitted': 0, 'gpuStarted': False,
        'limitations': ['Masked values remain in teacher-forcing context, so indirect influence is not eliminated.',
            'Engineering controls and shared synthetic permutations are not an independent source or mechanism-family holdout.',
            'Any token overlapping an excluded value is fully masked, including adjacent punctuation in the same token.']}
    output_dir.mkdir()
    for name, value in [('tokens.private.json', prepared), ('manifest.json', result)]:
        with (output_dir / name).open('x') as f:
            json.dump(value, f, ensure_ascii=False, indent=2); f.write('\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path); parser.add_argument('model', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args(); prepare(args.dataset.resolve(), args.model.resolve(), args.output.resolve())

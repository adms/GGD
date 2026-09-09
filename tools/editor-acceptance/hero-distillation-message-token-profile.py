"""CPU-only token profile for already-frozen chat-message datasets."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path

SCRIPT = Path(__file__).resolve()


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPT.with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


train = module('compact_token_training_contract', 'hero-distillation-train.py')


def digest(path):
    hasher = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def summarize(values):
    values = sorted(values)
    assert values
    return {'count': len(values), 'sum': sum(values), 'min': values[0],
            'p50': values[max(0, math.ceil(len(values) * .50) - 1)],
            'p95': values[max(0, math.ceil(len(values) * .95) - 1)], 'max': values[-1]}


def profile(dataset, model, out, tokenizer_factory=None):
    dataset, model, out = Path(dataset).resolve(), Path(model).resolve(), Path(out).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE'
    manifest = json.loads((dataset / 'manifest.json').read_text())
    assert manifest['schema'] == 'ggd-distillation-compact-frozen-data@1', 'COMPACT_DATASET_REQUIRED'
    assert digest(dataset / 'examples.json') == manifest['outputs']['examples.json'], 'DATASET_DRIFT'
    rows = json.loads((dataset / 'examples.json').read_text())
    if tokenizer_factory is None:
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        from transformers import AutoTokenizer
        tokenizer_factory = lambda: AutoTokenizer.from_pretrained(
            str(model), local_files_only=True, trust_remote_code=False)
    tokenizer = tokenizer_factory()
    token_rows = []
    for row in rows:
        encoded = train.encode(tokenizer, row['messages'])
        token_rows.append({key: row[key] for key in ['id', 'heroId', 'groupId', 'slot', 'split', 'stage']} | {
            key: encoded[key] for key in ['promptTokens', 'outputTokens', 'totalTokens']})
    groups = {}
    for split in ['train', 'dev']:
        for stage in ['select', 'configure']:
            selected = [row for row in token_rows if row['split'] == split and row['stage'] == stage]
            assert selected, 'EMPTY_TOKEN_STRATUM'
            groups[f'{split}:{stage}'] = {key: summarize([row[key] for row in selected])
                                                for key in ['promptTokens', 'outputTokens', 'totalTokens']}
    pins = {file.name: digest(file) for file in model.iterdir() if file.is_file() and file.name in {
        'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja', 'config.json'}}
    report = {'schema': 'ggd-compact-message-token-profile@1', 'cpuOnly': True,
              'weightsLoaded': False, 'gpuWorkStarted': False, 'sequenceTruncation': False,
              'datasetManifestSha256': digest(dataset / 'manifest.json'),
              'scriptSha256': digest(SCRIPT), 'modelDirectory': str(model),
              'tokenizerPins': pins, 'counts': {'tasks': len(rows)}, 'groups': groups,
              'rows': token_rows, 'limitations': 'Token sizing only; not model quality, latency or training completion.'}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(profile(args.dataset, args.model, args.out)['groups'], ensure_ascii=False))

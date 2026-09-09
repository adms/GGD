"""Freeze two public cases for cache equivalence/performance, never quality."""
import argparse
import hashlib
import json
from pathlib import Path


SCRIPT = Path(__file__).resolve()


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    with path.open('x') as stream:
        if isinstance(value, str):
            stream.write(value)
        else:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')


def build(source, out):
    source, out = Path(source).resolve(), Path(out).resolve()
    assert source.is_dir() and not out.exists(), 'NEW_PROBE_PLAN_REQUIRED'
    source_manifest = read(source / 'manifest.json')
    assert source_manifest.get('schema') == 'ggd-distillation-evaluation-inputs@1', 'SOURCE_MANIFEST_INVALID'
    for name, sha in source_manifest['outputs'].items():
        file = source / name
        assert file.is_file() and digest(file) == sha, 'SOURCE_EVALUATION_DRIFT:' + name
    rows = [json.loads(line) for line in (source / 'public-cases.jsonl').read_text().splitlines() if line]
    selected = rows[:2]
    assert len(selected) == 2 and selected[0]['slot'] == 'HERO' \
        and selected[1]['slot'] != 'HERO' and selected[0]['heroId'] == selected[1]['heroId'], \
        'PROBE_REQUIRES_ADJACENT_WHOLE_AND_SLOT'
    source_plan = read(source / 'plan.json')
    plan = {'schema': 'ggd-distillation-paired-evaluation-plan@1',
        'sourceManifestSha256': source_plan['sourceManifestSha256'],
        'status': 'frozen-prefix-cache-performance-probe', 'blindTest': False,
        'split': 'internal-dev',
        'counts': {'tasks': 2, 'primaryWholeHeroes': 1, 'secondarySlots': 1},
        'primaryCaseIds': [selected[0]['id']], 'secondaryCaseIds': [selected[1]['id']],
        'arms': source_plan['arms'],
        'execution': {'enabled': False, 'performanceProbeOnly': True,
            'sourceEvaluationManifestSha256': digest(source / 'manifest.json'),
            'sourcePublicCasesSha256': digest(source / 'public-cases.jsonl'),
            'comparisonReference': 'same-case cold outputs from the terminal v1 Base run',
            'noQualityDenominatorChange': True},
        'scoring': {'qualityScoringEnabled': False, 'reason': 'Two-case cache equivalence and timing only.'},
        'limitations': ['Never use this two-case probe as model quality, selection, promotion, or a reduced denominator.']}
    public = ''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n' for row in selected)
    out.mkdir(parents=True)
    write(out / 'public-cases.jsonl', public)
    write(out / 'plan.json', plan)
    outputs = {'public-cases.jsonl': digest(out / 'public-cases.jsonl'), 'plan.json': digest(out / 'plan.json')}
    write(out / 'manifest.json', {'schema': 'ggd-distillation-prefix-cache-probe-inputs@1',
        'builderSha256': digest(SCRIPT), 'sourceEvaluationManifestSha256': digest(source / 'manifest.json'),
        'sourceManifestSha256': source_plan['sourceManifestSha256'],
        'outputs': outputs, 'qualityScoringEnabled': False, 'inferenceStarted': False})
    return plan


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.out)['counts']))

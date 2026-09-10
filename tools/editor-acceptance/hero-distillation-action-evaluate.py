"""Freeze no-teacher public cases for bounded-action Hero Forge evaluation.

This is deliberately a CPU-only preparation step.  It converts the frozen
action projection's internal-dev heroes into the exact public inputs consumed
by the autoregressive action generator, while preserving the hard boundary
that no assistant/teacher answer is placed in a model prompt.  Binding a
completed adapter, GPU decoding, and scoring are separate later stages.
"""
import argparse
import hashlib
import json
import shutil
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


def frozen_source(dataset):
    dataset = Path(dataset).resolve()
    manifest = read(dataset / 'manifest.json')
    assert manifest['schema'] == 'ggd-distillation-action-frozen-data@1', 'ACTION_DATASET_REQUIRED'
    for name, expected in manifest['outputs'].items():
        assert digest(dataset / name) == expected, 'ACTION_DATASET_DRIFT:' + name
    report = read(dataset / 'projection-report.json')
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
                'detailedCatalog': catalog}
        # These are the exact keys enforced by generate_hero().  Serialising
        # this assert protects the teacher-answer boundary as the protocol grows.
        assert set(hero) == {'heroId', 'heroName', 'request', 'decisionSpace', 'assetBinding', 'identityMessages',
                             'selectionSystem', 'coreSystem', 'actionSystem', 'detailedCatalog'}, 'PUBLIC_CASE_SHAPE'
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['freeze', 'verify'])
    parser.add_argument('--dataset', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--run', type=Path)
    args = parser.parse_args()
    if args.action == 'freeze':
        assert args.dataset and args.out
        print(compact(freeze(args.dataset, args.out)))
    else:
        assert args.run
        print(compact({'manifest': verify(args.run)[0]}))

"""Finalize one fixed evaluation from bound receipts without repairing outputs.

This is a CPU-only packaging step. It derives quality, renders the immutable
HTML report, and records hashes. It never generates, scores, retries or promotes
a model.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil


SCRIPT = Path(__file__).resolve()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        if isinstance(value, str):
            stream.write(value)
        else:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')


def finalize(results, evidence, out):
    results, evidence, out = map(lambda value: Path(value).resolve(), (results, evidence, out))
    assert results.is_file() and evidence.is_file(), 'FINALIZATION_INPUT_MISSING'
    assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    adjudicator_path = SCRIPT.with_name('hero-distillation-quality-adjudication.py')
    renderer_path = SCRIPT.with_name('hero-distillation-report.py')
    adjudicator = load_module('hero_quality_adjudicator', adjudicator_path)
    renderer = load_module('hero_quality_report', renderer_path)
    adjudicated = adjudicator.adjudicate(results, evidence)
    assert adjudicated['fullHeroE2EProven'] is True and adjudicated['modelPromoted'] is False
    html = renderer.render(adjudicated)
    out.mkdir(parents=True)
    inputs = out / 'inputs'; sources = out / 'source'
    inputs.mkdir(); sources.mkdir()
    result_snapshot = inputs / 'unverified-report-data.json'
    evidence_snapshot = inputs / 'quality-evidence.json'
    shutil.copyfile(results, result_snapshot); shutil.copyfile(evidence, evidence_snapshot)
    evidence_document = json.loads(evidence.read_text())
    artifact_records, copied = [], {}
    artifact_root = evidence.parent.resolve(); artifact_out = inputs / 'evidence-artifacts'
    artifact_out.mkdir()
    for row in evidence_document['rows']:
        for item in row['evidence']:
            relative = Path(item['path'])
            assert not relative.is_absolute() and '..' not in relative.parts, 'UNSAFE_EVIDENCE_PATH'
            original = (artifact_root / relative).resolve()
            assert original.is_relative_to(artifact_root) and original.is_file(), 'MISSING_EVIDENCE_FILE'
            assert digest(original) == item['sha256'], 'QUALITY_EVIDENCE_DRIFT:' + item['path']
            key = str(original)
            if key not in copied:
                snapshot = artifact_out / f'{len(copied):04d}-{original.name}'
                shutil.copyfile(original, snapshot); copied[key] = snapshot
            snapshot = copied[key]
            artifact_records.append({'arm': row['arm'], 'id': row['id'], 'kind': item['kind'],
                'originalPath': key, 'snapshot': str(snapshot.relative_to(out)),
                'sha256': item['sha256'], 'bytes': original.stat().st_size})
    script_snapshots = {}
    for path in [SCRIPT, adjudicator_path, renderer_path]:
        snapshot = sources / path.name
        shutil.copyfile(path, snapshot)
        script_snapshots[path.name] = {'path': str(snapshot.relative_to(out)), 'sha256': digest(snapshot)}
    save(out / 'report-data.json', adjudicated)
    save(out / 'report.html', html)
    manifest = {'schema': 'ggd-distillation-finalized-evaluation@1',
        'inputs': {str(results): {'sha256': digest(results), 'bytes': results.stat().st_size,
                                  'snapshot': str(result_snapshot.relative_to(out))},
                   str(evidence): {'sha256': digest(evidence), 'bytes': evidence.stat().st_size,
                                   'snapshot': str(evidence_snapshot.relative_to(out))}},
        'evidenceArtifacts': artifact_records,
        'scripts': {str(path): digest(path) for path in [SCRIPT, adjudicator_path, renderer_path]},
        'scriptSnapshots': script_snapshots,
        'outputs': {'report-data.json': digest(out / 'report-data.json'),
                    'report.html': digest(out / 'report.html')},
        'blindTest': adjudicated['blindTest'], 'fullHeroE2EProven': True,
        'modelPromoted': False,
        'scope': 'Immutable quality-evidence packaging only; no generation, repair, retry, scoring or promotion.'}
    save(out / 'manifest.json', manifest)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    value = finalize(**vars(args))
    print(json.dumps({'out': str(args.out.resolve()),
                      'blindTest': value['blindTest'], 'fullHeroE2EProven': True}, ensure_ascii=False))

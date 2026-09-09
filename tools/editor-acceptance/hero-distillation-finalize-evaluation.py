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
    save(out / 'report-data.json', adjudicated)
    save(out / 'report.html', html)
    manifest = {'schema': 'ggd-distillation-finalized-evaluation@1',
        'inputs': {str(results): {'sha256': digest(results), 'bytes': results.stat().st_size},
                   str(evidence): {'sha256': digest(evidence), 'bytes': evidence.stat().st_size}},
        'scripts': {str(path): digest(path) for path in [SCRIPT, adjudicator_path, renderer_path]},
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

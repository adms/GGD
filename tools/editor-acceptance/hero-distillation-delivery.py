"""Build one reviewable Git/S3 delivery from terminal training and evaluation.

Readable JSON/HTML evidence is copied for Git review. Opaque adapter/archive
payloads are manifest-bound under ``bundle/`` and ignored by Git for later S3
publication. This tool does not train, infer, upload, commit or promote.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil


SCRIPT = Path(__file__).resolve()
spec = importlib.util.spec_from_file_location('research_archive', SCRIPT.with_name('hero-finetune-archive.py'))
archive = importlib.util.module_from_spec(spec); spec.loader.exec_module(archive)
MAX_READABLE_BYTES = 20 * 1024 ** 2


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        stream.write(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def safe(root, name):
    relative = Path(name)
    assert name and not relative.is_absolute() and '..' not in relative.parts, 'UNSAFE_DELIVERY_PATH'
    target = (root / relative).resolve()
    assert target.is_relative_to(root.resolve()), 'DELIVERY_PATH_ESCAPE'
    return target


def verify(out):
    out = Path(out).resolve()
    manifest = json.loads((out / 'DELIVERY_MANIFEST.json').read_text())
    assert manifest.get('schema') == 'ggd-hero-distillation-delivery@1' \
        and manifest.get('productionQualified') is False, 'DELIVERY_POLICY_MISMATCH'
    assert manifest.get('gitPolicy') == {
        'tracked': ['.gitignore', 'DELIVERY_MANIFEST.json', 'readable/**', 'bundle/manifest.json'],
        'ignoredPayloads': ['bundle/archives/**', 'bundle/models/**']}, 'GIT_PAYLOAD_POLICY_DRIFT'
    assert manifest.get('s3Policy') == {'profile': 'vibe-coding', 'region': 'ap-east-2',
                                        'bucket': 'ggd-390630837668-ap-east-2-an'}, 'S3_POLICY_DRIFT'
    assert (out / '.gitignore').read_text() == 'bundle/archives/\nbundle/models/\n', 'GITIGNORE_DRIFT'
    paths = []
    for item in manifest['readableEvidence']:
        file = safe(out, item['path']); paths.append(item['path'])
        assert file.is_file() and file.stat().st_size == item['bytes'] \
            and digest(file) == item['sha256'], 'READABLE_EVIDENCE_DRIFT:' + item['path']
    assert len(paths) == len(set(paths)) == 12, 'READABLE_EVIDENCE_DENOMINATOR_DRIFT'
    bundle = safe(out, manifest['bundleManifest']['path'])
    assert bundle.is_file() and digest(bundle) == manifest['bundleManifest']['sha256'], 'BUNDLE_MANIFEST_DRIFT'
    archive.verify(bundle.parent)
    return {'verified': True, 'readableFiles': len(paths), 'bundleManifestSha256': digest(bundle),
            'productionQualified': False}


def build(workspace, training, evaluation, out):
    workspace, training, evaluation, out = map(lambda p: Path(p).resolve(),
                                                (workspace, training, evaluation, out))
    assert workspace.is_dir() and training.is_dir() and evaluation.is_dir(), 'DELIVERY_INPUT_MISSING'
    assert training.is_relative_to(workspace) and evaluation.is_relative_to(workspace), 'INPUT_OUTSIDE_WORKSPACE'
    assert not out.exists(), 'NEW_DELIVERY_DIRECTORY_REQUIRED'
    training_rel, evaluation_rel = training.relative_to(workspace), evaluation.relative_to(workspace)
    train_state = archive.terminal_evidence(workspace, training_rel / 'train/state.json')
    eval_state = archive.terminal_evidence(workspace, evaluation_rel / 'state.json')
    assert train_state['status'] == eval_state['status'] == 'completed', 'SUCCESSFUL_TERMINAL_RUNS_REQUIRED'
    evaluation_manifest = json.loads((evaluation / 'manifest.json').read_text())
    assert Path(evaluation_manifest['trainingDirectory']).resolve() == training, 'EVALUATION_TRAINING_BINDING_DRIFT'

    out.mkdir(parents=True)
    write(out / '.gitignore', 'bundle/archives/\nbundle/models/\n')
    readable = {
        'training/manifest.json': training / 'manifest.json',
        'training/state.json': training / 'train/state.json',
        'training/result.json': training / 'train/result.json',
        'training/adapter-roundtrip.json': training / 'train/adapter-roundtrip.json',
        'training/dev-before.json': training / 'train/dev-before.json',
        'training/dev-after.json': training / 'train/dev-after.json',
        'training/training-trace.json': training / 'train/training-trace.json',
        'evaluation/manifest.json': evaluation / 'manifest.json',
        'evaluation/state.json': evaluation / 'state.json',
        'evaluation/result.json': evaluation / 'result.json',
        'evaluation/report-data.json': evaluation / 'report-data.json',
        'evaluation/report.html': evaluation / 'report.html',
    }
    records = []
    for name, source in readable.items():
        assert source.is_file(), 'READABLE_EVIDENCE_MISSING:' + name
        assert source.stat().st_size <= MAX_READABLE_BYTES, 'READABLE_EVIDENCE_TOO_LARGE:' + name
        destination = out / 'readable' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        records.append({'path': str(destination.relative_to(out)), 'source': str(source),
                        'bytes': source.stat().st_size, 'sha256': digest(source)})
    archive.build(workspace, out / 'bundle', [training_rel, evaluation_rel], evaluation_rel / 'state.json')
    manifest = {
        'schema': 'ggd-hero-distillation-delivery@1',
        'trainingDirectory': str(training), 'evaluationDirectory': str(evaluation),
        'readableEvidence': records,
        'bundleManifest': {'path': 'bundle/manifest.json', 'sha256': digest(out / 'bundle/manifest.json')},
        'gitPolicy': {'tracked': ['.gitignore', 'DELIVERY_MANIFEST.json', 'readable/**', 'bundle/manifest.json'],
                      'ignoredPayloads': ['bundle/archives/**', 'bundle/models/**']},
        's3Policy': {'profile': 'vibe-coding', 'region': 'ap-east-2',
                     'bucket': 'ggd-390630837668-ap-east-2-an'},
        'productionQualified': False,
        'scope': 'Terminal evidence packaging only; no training, inference, upload, commit, promotion or deployment.'}
    write(out / 'DELIVERY_MANIFEST.json', manifest)
    verify(out)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'verify'])
    for name in ['workspace', 'training', 'evaluation', 'out']:
        parser.add_argument('--' + name, type=Path, required=name == 'out')
    args = parser.parse_args()
    if args.mode == 'build':
        assert all(getattr(args, name) for name in ['workspace', 'training', 'evaluation']), 'BUILD_INPUTS_REQUIRED'
        value = build(args.workspace, args.training, args.evaluation, args.out)
        result = {'readableFiles': len(value['readableEvidence']),
                  'bundleManifestSha256': value['bundleManifest']['sha256'],
                  'productionQualified': False}
    else:
        result = verify(args.out)
    print(json.dumps(result, ensure_ascii=False))

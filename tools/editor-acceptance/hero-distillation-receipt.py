"""Export terminal full-hero run evidence, never weights or running snapshots.

This is local archival only: no training, AWS, publication, or quality promotion.
The source snapshots must match the manifest, not today's edited working tree.
"""
import argparse
import hashlib
import json
from pathlib import Path


def digest(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_text())


def export(run, out):
    run, out = Path(run).resolve(), Path(out).resolve()
    assert not out.exists() and not out.is_relative_to(run), 'NEW_INDEPENDENT_OUTPUT_REQUIRED'
    manifest_bytes = (run / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    payloads = {'manifest.json': manifest_bytes}
    for filename, key in [('hero-distillation-train.py', 'workerSha256'), ('hero-distillation-memory.py', 'memoryHelperSha256')]:
        data = (run / 'source' / filename).read_bytes()
        assert digest(data) == manifest[key], 'EXECUTED_SOURCE_SNAPSHOT_MISMATCH'
        payloads['source/' + filename] = data
    phases = {}
    for phase in ['probe', 'train']:
        directory = run / phase
        if not directory.exists(): continue
        state = read(directory / 'state.json')
        assert state['status'] in ['completed', 'stopped-or-failed'], 'RUN_NOT_TERMINAL'
        assert state.get('finishedAt') and state.get('workerPid') is None, 'WORKER_NOT_JOINED'
        assert state['manifestSha256'] == digest(manifest_bytes), 'STATE_MANIFEST_MISMATCH'
        samples = [state['preflight'], *state['samples']]
        trace = read(directory / 'training-trace.json') if (directory / 'training-trace.json').exists() else []
        assert phase == 'train' or not trace, 'PROBE_CANNOT_UPDATE_WEIGHTS'
        phases[phase] = {
            'status': state['status'], 'error': state.get('error'),
            'wallSeconds': state['finishedAt'] - state['startedAt'],
            'optimizerStepsRecorded': len(trace),
            'minAvailableBytes': min(x['availableBytes'] for x in samples),
            'maxObservedSwapGrowthBytes': max(x['swapUsedBytes'] - samples[0]['swapUsedBytes'] for x in samples),
            'allSamplesOnAC': all(x['acPower'] for x in samples),
            'minBatteryPercent': min((x['batteryPercent'] for x in samples if x['batteryPercent'] is not None), default=None),
        }
        for file in sorted(directory.rglob('*')):
            assert not file.is_symlink(), 'NO_SYMLINK_EVIDENCE'
            if file.is_file() and file.suffix in ['.json', '.jsonl', '.log']:
                payloads[file.relative_to(run).as_posix()] = file.read_bytes()
    assert phases, 'NO_TERMINAL_PHASE'
    payloads['token-preflight.json'] = (run / 'token-preflight.json').read_bytes()
    assert digest((run / 'tokens.json').read_bytes()) == manifest['tokenizedSha256'], 'TOKEN_DATA_MISMATCH'
    omitted = []
    for file in sorted(run.rglob('*')):
        assert not file.is_symlink(), 'NO_SYMLINK_EVIDENCE'
        if file.is_file() and file.relative_to(run).as_posix() not in payloads:
            omitted.append({'path': file.relative_to(run).as_posix(), 'bytes': file.stat().st_size,
                            'sha256': digest(file.read_bytes()),
                            'reason': 'weights-not-in-git' if file.suffix == '.safetensors' else 'not-a-receipt'})
    receipt = {'schema': 'ggd-distillation-receipt@1', 'run': str(run), 'phases': phases,
               'files': {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in payloads.items()},
               'omitted': omitted, 'fullHeroE2EProven': False, 'modelPromoted': False,
               'note': 'Terminal supervisor receipts, not a live process query or model quality assessment.'}
    out.mkdir(parents=True)
    for name, data in payloads.items():
        target = out / name; target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream: stream.write(data)
        assert digest(target.read_bytes()) == receipt['files'][name]['sha256']
    with (out / 'receipt.json').open('x') as stream:
        json.dump(receipt, stream, ensure_ascii=False, indent=2); stream.write('\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = export(args.run, args.out)
    print(json.dumps({'phases': result['phases'], 'files': len(result['files']), 'omitted': result['omitted']}))

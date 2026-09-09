"""Archive one terminal failed paired evaluation without turning it into success.

The receipt copies only text evidence.  It never restarts inference, repairs a
candidate, creates a result report, or promotes a model.
"""
import argparse
import hashlib
import json
from pathlib import Path


TEXT_SUFFIXES = {'.json', '.jsonl', '.log', '.py', '.mjs', '.mts', '.ts', '.txt', '.html', '.md'}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def verify_output(out):
    out = Path(out).resolve()
    receipt = read(out / 'receipt.json')
    assert receipt['schema'] == 'ggd-distillation-evaluation-failure-receipt@1'
    assert receipt['evaluationCompleted'] is False
    assert receipt['fullHeroE2EProven'] is False and receipt['modelPromoted'] is False
    for name, metadata in receipt['files'].items():
        target = out / name
        assert target.resolve().is_relative_to(out), 'RECEIPT_PATH_ESCAPE'
        assert target.is_file() and target.stat().st_size == metadata['bytes'], 'RECEIPT_FILE_MISSING'
        assert digest(target) == metadata['sha256'], 'RECEIPT_FILE_DRIFT'
    return receipt


def export(run, out):
    run, out = Path(run).resolve(), Path(out).resolve()
    assert run.is_dir() and not out.exists() and not out.is_relative_to(run), 'NEW_INDEPENDENT_OUTPUT_REQUIRED'
    manifest = read(run / 'manifest.json')
    state = read(run / 'state.json')
    assert manifest.get('schema') == 'ggd-distillation-evaluation-batch@1', 'INVALID_EVALUATION_MANIFEST'
    assert state.get('schema') == 'ggd-distillation-evaluation-batch-state@1', 'INVALID_EVALUATION_STATE'
    assert state.get('status') == 'stopped-or-failed' and state.get('finishedAt') and state.get('error'), \
        'EVALUATION_NOT_TERMINAL_FAILURE'
    assert state.get('modelPromoted') is False and state.get('fullHeroE2EProven') is False \
        and manifest.get('modelPromoted') is False and manifest.get('fullHeroE2EProven') is False, \
        'FAILED_EVALUATION_CANNOT_BE_PROMOTED'
    steps = state.get('steps') or []
    assert steps and steps[-1].get('status') == 'stopped-or-failed' \
        and all(step.get('status') == 'completed' for step in steps[:-1]), 'INVALID_FAILURE_STEP_ORDER'
    assert not any((run / name).exists() for name in ['result.json', 'report-data.json', 'report.html']), \
        'FAILED_RUN_HAS_SUCCESS_REPORT'
    for name, sha in manifest.get('sources', {}).items():
        source = run / 'source' / name
        assert source.is_file() and digest(source) == sha, 'EVALUATION_SOURCE_DRIFT:' + name
    for name, sha in manifest.get('inputManifests', {}).items():
        source = Path(name)
        assert source.is_file() and digest(source) == sha, 'EVALUATION_INPUT_DRIFT:' + name

    inference = run / 'inference'
    inference_manifest = read(inference / 'manifest.json')
    assert inference_manifest.get('schema') == 'ggd-distillation-protected-inference@1', 'INVALID_INFERENCE_MANIFEST'
    assert inference_manifest.get('modelPromoted') is False \
        and inference_manifest.get('fullHeroE2EProven') is False, 'FAILED_INFERENCE_CANNOT_BE_PROMOTED'
    planned = inference_manifest['caseIds']
    assert len(planned) == inference_manifest['counts']['tasks'], 'INFERENCE_DENOMINATOR_DRIFT'
    for name, sha in inference_manifest.get('sources', {}).items():
        source = inference / 'source' / name
        assert source.is_file() and digest(source) == sha, 'INFERENCE_SOURCE_DRIFT:' + name

    summaries = []
    seen_failed = False
    for arm in manifest['fixedArmOrder']:
        directory = inference / arm
        if not directory.exists():
            assert seen_failed, 'MISSING_ARM_BEFORE_FAILURE'
            continue
        arm_state = read(directory / 'state.json')
        assert arm_state.get('arm') == arm and arm_state.get('workerPid') is None \
            and arm_state.get('finishedAt'), 'ARM_WORKER_NOT_JOINED'
        assert arm_state.get('manifestSha256') == digest(inference / 'manifest.json'), 'ARM_MANIFEST_DRIFT'
        index = read(directory / 'index.json')
        case_files = sorted(directory.glob('case-*.json'))
        assert len(index) == len(case_files) and len(index) <= len(planned), 'PARTIAL_CASE_COUNT_DRIFT'
        cases = [read(file) for file in case_files]
        assert [row['id'] for row in index] == [row['id'] for row in cases] == planned[:len(cases)], \
            'PARTIAL_CASE_ORDER_DRIFT'
        assert all(index_row['complete'] is case['complete'] \
            and index_row['outputFormatMatches'] is case['outputFormatMatches']
            for index_row, case in zip(index, cases)), 'PARTIAL_INDEX_DRIFT'
        status = arm_state.get('status')
        if status == 'completed':
            assert not seen_failed and len(cases) == len(planned), 'COMPLETED_ARM_DENOMINATOR_INVALID'
            result = read(directory / 'result.json')
            assert result.get('arm') == arm and result.get('attempted') == len(planned), 'COMPLETED_ARM_RESULT_INVALID'
        else:
            assert status == 'stopped-or-failed' and arm_state.get('error') and not seen_failed, 'INVALID_FAILED_ARM'
            assert len(cases) < len(planned), 'FAILED_ARM_NOT_PARTIAL'
            seen_failed = True
        summaries.append({'arm': arm, 'status': status, 'error': arm_state.get('error'),
            'planned': len(planned), 'attemptedFiles': len(cases),
            'completeOutputs': sum(row['complete'] is True for row in cases),
            'formatMatches': sum(row['outputFormatMatches'] is True for row in cases),
            'generationSeconds': sum(row['seconds'] for row in cases)})
    assert seen_failed and summaries[-1]['status'] == 'stopped-or-failed', 'NO_TERMINAL_FAILED_ARM'

    payloads = {}
    for file in sorted(run.rglob('*')):
        assert not file.is_symlink(), 'NO_SYMLINK_EVIDENCE'
        if file.is_file():
            assert file.suffix in TEXT_SUFFIXES, 'NON_TEXT_EVALUATION_EVIDENCE:' + str(file.relative_to(run))
            payloads[file.relative_to(run).as_posix()] = file.read_bytes()
    out.mkdir(parents=True)
    files = {}
    for name, data in payloads.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
        files[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    receipt = {'schema': 'ggd-distillation-evaluation-failure-receipt@1',
        'sourceDirectory': str(run), 'failure': state['error'], 'arms': summaries,
        'files': files, 'evaluationCompleted': False, 'fullHeroE2EProven': False,
        'modelPromoted': False,
        'note': 'Terminal partial-output evidence only; no retry, repair, comparison result, or quality promotion.'}
    write(out / 'receipt.json', receipt)
    verify_output(out)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['export', 'verify'])
    parser.add_argument('--run', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = export(args.run, args.out) if args.mode == 'export' else verify_output(args.out)
    print(json.dumps({'failure': result.get('failure'), 'arms': result.get('arms'),
        'files': len(result['files']), 'evaluationCompleted': False}, ensure_ascii=False))

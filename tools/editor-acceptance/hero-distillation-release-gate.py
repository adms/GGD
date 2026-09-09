"""Fail-closed release gate for a completed hero-distillation candidate.

This does not score semantics or gameplay.  It only accepts already-recorded,
hash-bound evidence and deliberately refuses to turn CE/JSON/compile success
into a model-readiness claim.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('DUPLICATE_JSON_KEY:' + key)
            value[key] = item
        return value
    return json.loads(Path(path).read_text(), object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('NONFINITE_JSON:' + value)))


def hero_ids(path):
    return {json.loads(line)['id'].split(':', 1)[0]
            for line in Path(path).read_text().splitlines() if line.strip()}


def evaluate(training, internal_results, blind_results):
    training, internal_results, blind_results = map(Path, (training, internal_results, blind_results))
    checks = []

    def check(name, passed, detail):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})

    manifest = read(training / 'manifest.json')
    state = read(training / 'train/state.json')
    result = read(training / 'train/result.json')
    roundtrip = read(training / 'train/adapter-roundtrip.json')
    checkpoint = training / 'train' / result['checkpoint']['path'] / 'adapters.safetensors'
    data_manifest = Path(manifest['dataDirectory']) / 'manifest.json'
    check('frozen-dataset-manifest', data_manifest.is_file()
          and digest(data_manifest) == manifest.get('frozenManifestSha256'),
          manifest.get('frozenManifestSha256'))
    check('training-state-binds-manifest', state.get('manifestSha256') == digest(training / 'manifest.json'),
          state.get('manifestSha256'))
    check('training-supervisor-completed', state.get('status') == 'completed', state.get('status'))
    check('single-full-epoch', result.get('phase') == 'train' and result.get('steps') == manifest.get('steps')
          and result.get('uniqueTrainingTasks') == manifest.get('steps'),
          {'steps': result.get('steps'), 'planned': manifest.get('steps'), 'unique': result.get('uniqueTrainingTasks')})
    check('final-adapter-hash', checkpoint.is_file() and digest(checkpoint) == result['checkpoint'].get('sha256'),
          result['checkpoint'].get('sha256'))
    check('adapter-roundtrip', roundtrip.get('passed') is True, roundtrip.get('passed'))
    check('post-train-dev-complete', (training / 'train/dev-after.json').is_file(),
          str(training / 'train/dev-after.json'))

    internal, blind = read(internal_results), read(blind_results)
    seen = hero_ids(Path(manifest['dataDirectory']) / 'train.jsonl') | hero_ids(Path(manifest['dataDirectory']) / 'dev.jsonl')

    def result_checks(label, report, must_be_blind):
        prefix = label + '-'
        count = report.get('counts', {}).get('primaryWholeHeroes')
        arm = report.get('arms', {}).get('lora', {})
        rows = arm.get('rows') or []
        generation = arm.get('generation') or {}
        whole = generation.get('wholeHeroes') or {}
        check(prefix + 'schema', report.get('schema') == 'ggd-distillation-results@1', report.get('schema'))
        dev_cases = report.get('training', {}).get('devAfter', {}).get('cases')
        expected_dev = report.get('counts', {}).get('tasks') if not must_be_blind else dev_cases
        check(prefix + 'training-complete-and-dev-measured',
              report.get('training', {}).get('recordedStatus') == 'completed'
              and type(dev_cases) is int and dev_cases > 0 and dev_cases == expected_dev,
              {'status': report.get('training', {}).get('recordedStatus'),
               'devCases': dev_cases, 'expectedInternalDevCases': expected_dev if not must_be_blind else None})
        check(prefix + 'blind-status', report.get('blindTest') is must_be_blind, report.get('blindTest'))
        check(prefix + 'nonempty-fixed-denominator', type(count) is int and count > 0 and len(rows) == count,
              {'count': count, 'rows': len(rows)})
        ids = [row.get('id') for row in rows]
        check(prefix + 'unique-row-ids', len(ids) == len(set(ids)), ids)
        check(prefix + 'all-generations-recorded', whole.get('plannedCases') == count and whole.get('recordedCases') == count
              and whole.get('completeOutputs') == count and whole.get('completeJsonOutputs') == count,
              {k: whole.get(k) for k in ['plannedCases', 'recordedCases', 'completeOutputs', 'completeJsonOutputs']})
        threshold = math.ceil(count * .95) if type(count) is int and count > 0 else None
        for key in ['structuralPassed', 'packageAdmissionPassed', 'isolatedImportPassed', 'runtimeVerifiedImports']:
            check(prefix + key, type(arm.get(key)) is int and arm.get(key) >= threshold if threshold is not None else False,
                  {'passed': arm.get(key), 'required': threshold})
        check(prefix + 'semantic-gameplay-full-hero-success', type(arm.get('fullHeroSuccess')) is int
              and arm.get('fullHeroSuccess') >= threshold if threshold is not None else False,
              {'passed': arm.get('fullHeroSuccess'), 'required': threshold})
        check(prefix + 'dangerous-accepts-zero', type(arm.get('unsafeAccepts')) is int
              and arm.get('unsafeAccepts') == 0, arm.get('unsafeAccepts'))
        row_successes = sum(row.get('fullHeroSuccess') is True for row in rows)
        row_unsafe = sum(row.get('unsafeAccept') is True for row in rows)
        check(prefix + 'aggregate-matches-rows', arm.get('fullHeroSuccess') == row_successes
              and arm.get('unsafeAccepts') == row_unsafe,
              {'aggregateSuccess': arm.get('fullHeroSuccess'), 'rowSuccess': row_successes,
               'aggregateUnsafe': arm.get('unsafeAccepts'), 'rowUnsafe': row_unsafe})
        def complete_row_evidence(row):
            verdicts = [row.get(key) for key in ['semanticFidelity', 'liveImport', 'gameplay']]
            success_consistent = row.get('fullHeroSuccess') is False or (
                row.get('supported') is True and verdicts == ['passed', 'passed', 'passed']
                and (row.get('structural') or {}).get('structuralPassed') is True
                and (row.get('package') or {}).get('passed') is True
                and (row.get('isolatedImport') or {}).get('passed') is True
                and (row.get('isolatedImport') or {}).get('runtimeMatchesAdmission') is True)
            return all(value in ['passed', 'failed'] for value in verdicts) \
                and type(row.get('fullHeroSuccess')) is bool and type(row.get('unsafeAccept')) is bool \
                and type(row.get('supported')) is bool and type(row.get('humanRepairs')) is int \
                and row.get('humanRepairs') == 0 and success_consistent
        check(prefix + 'row-level-evidence', len(rows) == (count or -1)
              and all(complete_row_evidence(row) for row in rows),
              'requires determinate, zero-repair row evidence; every claimed success must pass all E2E stages')
        check(prefix + 'full-e2e-claim', report.get('fullHeroE2EProven') is True, report.get('fullHeroE2EProven'))
        comparison = report.get('arms', {})
        arm_ids = [[row.get('id') for row in (comparison.get(name, {}).get('rows') or [])]
                   for name in ['teacher', 'base', 'lora']]
        base_whole = (comparison.get('base', {}).get('generation') or {}).get('wholeHeroes') or {}
        check(prefix + 'same-case-three-arm-comparison', arm_ids[0] == arm_ids[1] == arm_ids[2] == ids
              and base_whole.get('plannedCases') == count and base_whole.get('recordedCases') == count,
              {'sameIds': arm_ids[0] == arm_ids[1] == arm_ids[2],
               'basePlanned': base_whole.get('plannedCases'), 'baseRecorded': base_whole.get('recordedCases')})
        return {row.get('id', '').split(':', 1)[0] for row in rows}

    result_checks('internal', internal, False)
    blind_ids = result_checks('blind', blind, True)
    protocol = blind.get('blindProtocol') or {}
    check('blind-teacher-withheld', protocol.get('teacherAnswersVisibleToCandidate') is False,
          protocol.get('teacherAnswersVisibleToCandidate'))
    check('blind-not-used-for-training-or-tuning', protocol.get('usedForTraining') is False
          and protocol.get('usedForTuning') is False and protocol.get('checkpointSelectedBeforeGeneration') is True,
          {k: protocol.get(k) for k in ['usedForTraining', 'usedForTuning', 'checkpointSelectedBeforeGeneration']})
    overlap = sorted(seen & blind_ids)
    check('blind-hero-id-disjoint-from-train-and-dev', not overlap, overlap)
    check('results-bind-training-manifest', all(
        report.get('sourceFiles', {}).get(str((training / 'manifest.json').resolve()), {}).get('sha256') == digest(training / 'manifest.json')
        for report in [internal, blind]), str((training / 'manifest.json').resolve()))

    passed = all(item['passed'] for item in checks)
    return {'schema': 'ggd-distillation-release-gate@1', 'passed': passed,
            'modelReady': passed, 'promotionAllowed': False,
            'threshold': {'wholeHeroSuccessRate': .95, 'dangerousAccepts': 0},
            'checks': checks,
            'scope': 'Evidence aggregation only. This gate cannot create semantic, gameplay, live-import or blind-test evidence.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training', type=Path, required=True)
    parser.add_argument('--internal-results', type=Path, required=True)
    parser.add_argument('--blind-results', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assert not args.out.exists(), 'REFUSE_OVERWRITE'
    report = evaluate(args.training, args.internal_results, args.blind_results)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'failed': [x['name'] for x in report['checks'] if not x['passed']]}, ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)

"""Read-only paired report data; missing evidence stays null, never a pass."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
from datetime import datetime, timezone


def checked_number(value):
    assert isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value), 'NON_FINITE_METRIC'
    return value


def dev_loss(rows, expected_ids):
    if rows is None:
        return None
    assert [r['id'] for r in rows] == expected_ids, 'DEV_CASE_ORDER_MISMATCH'
    assert len(set(expected_ids)) == len(expected_ids) and rows, 'INVALID_DEV_IDS'
    for row in rows:
        assert checked_number(row['loss']) >= 0, 'NEGATIVE_LOSS'
        assert type(row['outputTokens']) is int and row['outputTokens'] > 0, 'INVALID_TOKEN_COUNT'
    tokens = sum(r['outputTokens'] for r in rows)
    return {'cases': len(rows), 'answerTokens': tokens, 'macroCE': statistics.mean(r['loss'] for r in rows),
            'tokenWeightedCE': sum(r['loss'] * r['outputTokens'] for r in rows) / tokens}


def structural_rows(report, cases):
    if report is None:
        return {c['id']: None for c in cases if c['slot'] == 'HERO'}
    assert report['schema'] == 'ggd-distillation-generation-compile@1', 'WRONG_COMPILE_REPORT'
    assert [r['id'] for r in report['rows']] == [c['id'] for c in cases], 'COMPILE_CASE_ORDER_MISMATCH'
    assert [r['slot'] for r in report['rows']] == [c['slot'] for c in cases], 'COMPILE_SLOT_MISMATCH'
    return {r['id']: {'structuralPassed': r['schemaCompilePassed'] is True and r['diskReloadCompileIdentical'] is True,
                     'status': r['status'], 'error': r.get('error')}
            for r in report['rows'] if r['slot'] == 'HERO'}


def generation_stats(records, cases):
    """Observed generation-call cost, never decode-only TPS or hero quality."""
    assert [r['id'] for r in records] == [c['id'] for c in cases[:len(records)]], 'GENERATION_CASE_ORDER_DRIFT'
    assert len(records) <= len(cases), 'EXCESS_GENERATION_RECORDS'
    for row, case in zip(records, cases):
        assert row['slot'] == case['slot'], 'GENERATION_SLOT_DRIFT'
        assert checked_number(row['seconds']) > 0, 'INVALID_GENERATION_SECONDS'
        assert type(row['promptTokens']) is int and row['promptTokens'] > 0, 'INVALID_PROMPT_TOKENS'
        tokens = row['generationTokens']
        assert tokens is None or type(tokens) is int and tokens >= 0, 'INVALID_GENERATION_TOKENS'
        assert checked_number(row['peakMetalBytes']) >= 0, 'INVALID_GENERATION_MEMORY'
        assert type(row['attempts']) is int and row['attempts'] == 1 and type(row['humanRepairs']) is int and row['humanRepairs'] == 0, 'GENERATION_REPAIR_OR_RETRY'
        assert type(row['complete']) is bool and type(row['json']['parsed']) is bool, 'INVALID_COMPLETION_FLAGS'

    def summarize(selected, planned):
        durations = sorted(r['seconds'] for r in selected)
        known = [r['generationTokens'] for r in selected if r['generationTokens'] is not None]
        seconds = sum(durations)
        return {'plannedCases': planned, 'recordedCases': len(selected),
            'completeOutputs': sum(r['complete'] for r in selected),
            'completeJsonOutputs': sum(r['complete'] and r['json']['parsed'] for r in selected),
            'generationCallSeconds': seconds if selected else None,
            'meanGenerationCallSeconds': statistics.mean(durations) if selected else None,
            'p50GenerationCallSeconds': durations[math.ceil(len(durations) * .5) - 1] if selected else None,
            'p95GenerationCallSeconds': durations[math.ceil(len(durations) * .95) - 1] if selected else None,
            'knownGenerationTokens': sum(known) if selected else None,
            'missingGenerationTokenCounts': len(selected) - len(known),
            'promptTokens': sum(r['promptTokens'] for r in selected) if selected else None,
            'effectiveOutputTokensPerGenerationSecond': sum(known) / seconds if selected and len(known) == len(selected) else None,
            'recordedCasePeakMetalBytes': max(r['peakMetalBytes'] for r in selected) if selected else None}

    return {'all': summarize(records, len(cases)),
        'wholeHeroes': summarize([r for r in records if r['slot'] == 'HERO'], sum(c['slot'] == 'HERO' for c in cases)),
        'auxiliarySlots': summarize([r for r in records if r['slot'] != 'HERO'], sum(c['slot'] != 'HERO' for c in cases)),
        'percentileMethod': 'nearest-rank', 'ttftSeconds': None, 'decodeOnlyTokensPerSecond': None,
        'scope': 'Persisted generation-call durations include prefill/decode/output parsing, exclude model loading and prompt tokenization. Failed outputs are included; unfinished/unrecorded calls are not measured. Complete JSON is not semantic or playable-hero success.'}


def collect(training, evaluation, paired=None, teacher_compile=None, teacher_package=None, teacher_import=None):
    pins = {}

    def raw(file):
        file = Path(file)
        data = file.read_bytes()
        pins[str(file.resolve())] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        return data

    def read(file, optional=False):
        file = Path(file)
        if optional and not file.exists():
            return None
        return json.loads(raw(file))

    training, evaluation = Path(training), Path(evaluation)
    manifest = read(training / 'manifest.json')
    em = read(evaluation / 'manifest.json')
    for name in ['plan.json', 'public-cases.jsonl']:
        assert hashlib.sha256(raw(evaluation / name)).hexdigest() == em['outputs'][name], 'EVAL_DRIFT'
    plan = read(evaluation / 'plan.json')
    cases = [json.loads(line) for line in raw(evaluation / 'public-cases.jsonl').decode().splitlines()]
    assert len(cases) == plan['counts']['tasks'], 'EVAL_COUNT_DRIFT'
    assert len({c['id'] for c in cases}) == len(cases), 'DUPLICATE_EVAL_ID'
    assert sum(c['slot'] == 'HERO' for c in cases) == plan['counts']['primaryWholeHeroes'], 'PRIMARY_COUNT_DRIFT'
    assert sum(c['slot'] != 'HERO' for c in cases) == plan['counts']['secondarySlots'], 'SECONDARY_COUNT_DRIFT'
    assert plan['sourceManifestSha256'] == manifest['frozenManifestSha256'], 'TRAIN_EVAL_DATASET_MISMATCH'
    state = read(training / 'train/state.json', True)
    if state:
        assert state['manifestSha256'] == pins[str((training / 'manifest.json').resolve())]['sha256'], 'TRAIN_STATE_DRIFT'
    trace = read(training / 'train/training-trace.json', True) or []
    assert [r['step'] for r in trace] == list(range(1, len(trace) + 1)), 'STEP_SEQUENCE_DRIFT'
    assert len(trace) <= manifest['steps'] and len({r['id'] for r in trace}) == len(trace), 'REPEATED_OR_EXCESS_STEPS'
    before = read(training / 'train/dev-before.json', True)
    after = read(training / 'train/dev-after.json', True)
    expected_ids = [c['id'] for c in cases]
    before_stats, after_stats = dev_loss(before, expected_ids), dev_loss(after, expected_ids)
    if before is not None and after is not None:
        assert [r['outputTokens'] for r in before] == [r['outputTokens'] for r in after], 'DEV_ANSWER_LENGTH_DRIFT'
    delta = None if before_stats is None or after_stats is None else {
        'macroCE': after_stats['macroCE'] - before_stats['macroCE'],
        'tokenWeightedCE': after_stats['tokenWeightedCE'] - before_stats['tokenWeightedCE']}
    primary = [c for c in cases if c['slot'] == 'HERO']
    inference_dir = Path(paired) / 'inference' if paired else None
    inference_manifest = read(inference_dir / 'manifest.json', True) if inference_dir else None
    if inference_manifest:
        assert inference_manifest['schema'] == 'ggd-distillation-protected-inference@1', 'WRONG_INFERENCE_MANIFEST'
        assert inference_manifest['evaluationManifestSha256'] == pins[str((evaluation / 'manifest.json').resolve())]['sha256'], 'INFERENCE_EVAL_DRIFT'
        assert inference_manifest['trainingManifestSha256'] == pins[str((training / 'manifest.json').resolve())]['sha256'], 'INFERENCE_TRAIN_DRIFT'
        assert inference_manifest['caseIds'] == expected_ids, 'INFERENCE_CASE_ORDER_DRIFT'
    arms = {}
    for arm in ['teacher', 'base', 'lora']:
        generation = None
        if arm != 'teacher' and inference_manifest:
            index = read(inference_dir / arm / 'index.json', True)
            if index is not None:
                records = []
                assert len(index) <= len(cases), 'EXCESS_GENERATION_INDEX'
                for n, entry in enumerate(index):
                    record = read(inference_dir / arm / f'case-{n:04d}.json')
                    assert {k: record[k] for k in ['id', 'complete', 'outputFormatMatches', 'seconds']} == entry, 'GENERATION_INDEX_DRIFT'
                    assert record['arm'] == arm and record['decoding'] == inference_manifest['decoding'], 'GENERATION_ARM_OR_DECODING_DRIFT'
                    assert record['messagesSha256'] == cases[n]['messagesSha256'], 'GENERATION_MESSAGE_DRIFT'
                    assert hashlib.sha256(record['raw'].encode()).hexdigest() == record['rawSha256'], 'GENERATION_RAW_DRIFT'
                    if record['complete']:
                        assert record['finishReason'] == 'stop' and record['error'] is None, 'FALSE_COMPLETE_GENERATION'
                        assert type(record['generationTokens']) is int and 0 < record['generationTokens'] <= inference_manifest['decoding']['max_tokens'], 'INVALID_COMPLETE_TOKEN_COUNT'
                    records.append(record)
                generation = generation_stats(records, cases)
        cr = Path(teacher_compile) / 'report.json' if arm == 'teacher' and teacher_compile else (
            Path(paired) / f'{arm}-compile/report.json' if arm != 'teacher' and paired else None)
        pr = Path(teacher_package) / 'report.json' if arm == 'teacher' and teacher_package else (
            Path(paired) / f'{arm}-package-admission/report.json' if arm != 'teacher' and paired else None)
        compilation = read(cr, True) if cr else None
        if compilation:
            assert compilation['evaluationManifestSha256'] == pins[str((evaluation / 'manifest.json').resolve())]['sha256'], 'COMPILE_EVAL_DRIFT'
            assert compilation['sourceEvidence']['arm'] == ('teacher-control' if arm == 'teacher' else arm), 'ARM_MISMATCH'
        structural = structural_rows(compilation, cases)
        package = read(pr, True) if pr else None
        if package:
            assert compilation and package['schema'] == 'ggd-distillation-package-admission@1', 'PACKAGE_WITHOUT_COMPILE'
            assert package['compiledReportSha256'] == pins[str(cr.resolve())]['sha256'], 'PACKAGE_COMPILE_DRIFT'
            assert [r['id'] for r in package['rows']] == [c['id'] for c in primary], 'PACKAGE_HERO_ORDER_MISMATCH'
        packages = {r['id']: {'passed': r['packageAdmissionPassed'], 'status': r['status'], 'error': r.get('error')}
                    for r in package['rows']} if package else {}
        ir = Path(teacher_import) / 'report.json' if arm == 'teacher' and teacher_import else (
            Path(paired) / f'{arm}-import-roundtrip/report.json' if arm != 'teacher' and paired else None)
        ar = Path(teacher_import) / 'runtime-audit.json' if arm == 'teacher' and teacher_import else (
            Path(paired) / f'{arm}-import-runtime-audit/report.json' if arm != 'teacher' and paired else None)
        imported = read(ir, True) if ir else None
        audited = read(ar, True) if ar else None
        primary_ids = [c['id'] for c in primary]
        if imported:
            assert package and imported['schema'] == 'ggd-distillation-import-roundtrip@1', 'IMPORT_WITHOUT_PACKAGE'
            assert imported['admittedReportSha256'] == pins[str(pr.resolve())]['sha256'], 'IMPORT_PACKAGE_DRIFT'
            assert [r['id'] for r in imported['rows']] == primary_ids, 'IMPORT_HERO_ORDER_MISMATCH'
        if audited:
            assert imported and audited['schema'] == 'ggd-distillation-import-runtime-audit@1', 'AUDIT_WITHOUT_IMPORT'
            assert audited['importReportSha256'] == pins[str(ir.resolve())]['sha256'], 'AUDIT_IMPORT_DRIFT'
            assert audited['admittedReportSha256'] == pins[str(pr.resolve())]['sha256'], 'AUDIT_PACKAGE_DRIFT'
            assert [r['id'] for r in audited['rows']] == primary_ids, 'AUDIT_HERO_ORDER_MISMATCH'
        audits = {r['id']: r['runtimeMatchesAdmission'] for r in audited['rows']} if audited else {}
        imports = {r['id']: {'passed': r['liveImportPassed'], 'status': r['status'], 'error': r.get('error'),
                             'runtimeMatchesAdmission': audits.get(r['id'])} for r in imported['rows']} if imported else {}
        for hero_id, value in imports.items():
            assert value['passed'] is not True or packages[hero_id]['passed'] is True, 'IMPORT_PASSED_WITHOUT_ADMISSION'
            assert value['runtimeMatchesAdmission'] is not True or value['passed'] is True, 'RUNTIME_AUDIT_PASSED_WITHOUT_IMPORT'
        arms[arm] = {'wholeHeroes': len(primary), 'measuredStructural': compilation is not None,
            'generation': generation,
            'structuralPassed': None if compilation is None else sum(r['structuralPassed'] for r in structural.values()),
            'packageAdmissionPassed': None if package is None else sum(r['passed'] is True for r in packages.values()),
            'isolatedImportPassed': None if imported is None else sum(r['passed'] is True for r in imports.values()),
            'runtimeVerifiedImports': None if audited is None else sum(r['passed'] is True and r['runtimeMatchesAdmission'] is True for r in imports.values()),
            'fullHeroSuccess': None, 'unsafeAccepts': None,
            'rows': [{'id': c['id'], 'name': json.loads(c['messages'][1]['content'])['request']['heroName'],
                      'structural': structural[c['id']], 'package': packages.get(c['id']), 'isolatedImport': imports.get(c['id']),
                      'semanticFidelity': 'unverified', 'liveImport': 'unverified', 'gameplay': 'unverified',
                      'fullHeroSuccess': None, 'unsafeAccept': None} for c in primary]}
    improvements = regressions = None
    if arms['base']['measuredStructural'] and arms['lora']['measuredStructural']:
        pairs = zip(arms['base']['rows'], arms['lora']['rows'])
        changes = [(a['structural']['structuralPassed'], b['structural']['structuralPassed']) for a, b in pairs]
        improvements = sum(not a and b for a, b in changes)
        regressions = sum(a and not b for a, b in changes)
    return {'schema': 'ggd-distillation-results@1', 'capturedAt': datetime.now(timezone.utc).isoformat(),
        'training': {'recordedStatus': state['status'] if state else 'not-started',
            'completedSteps': len(trace), 'plannedSteps': manifest['steps'],
            'meanRecordedStepSeconds': statistics.mean(checked_number(r['seconds']) for r in trace) if trace else None,
            'recordedStepPeakMetalBytes': max(checked_number(r['peakMetalBytes']) for r in trace) if trace else None,
            'devBefore': before_stats, 'devAfter': after_stats, 'devAfterMinusBefore': delta},
        'counts': plan['counts'], 'arms': arms,
        'pairedStructural': {'improved': improvements, 'regressed': regressions},
        'fullHeroE2EProven': False, 'modelPromoted': False, 'blindTest': False,
        'limits': ['File snapshot, not an OS process-liveness check.',
                   'Teacher-forced CE is not generated hero quality; per-step losses concern different tasks.',
                   'Package admission is not live import or match verification.',
                   'Isolated import/storage/runtime roundtrip is not platform publication, hero selection or match behavior.',
                   'Unknown full-hero quality and dangerous acceptance counts remain null, not zero.',
                   'Internal dev is not an unseen generalization test.'], 'sourceFiles': pins}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['training', 'evaluation', 'out']:
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ['paired', 'teacher-compile', 'teacher-package', 'teacher-import']:
        parser.add_argument('--' + name, type=Path)
    args = parser.parse_args()
    assert not args.out.exists(), 'REFUSE_OVERWRITE'
    report = collect(args.training, args.evaluation, args.paired, args.teacher_compile, args.teacher_package, args.teacher_import)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'training': report['training'], 'counts': report['counts']}, ensure_ascii=False))

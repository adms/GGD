"""Create conservative quality evidence from exact compiled-reference identity.

A candidate only inherits semantic/gameplay qualification when its complete
compiled hero is byte-identical to a separately qualified teacher under the
same pinned engine. Different-but-possibly-equivalent designs fail closed and
need another frozen scorer; this tool never asks an LLM or repairs output.
"""
import argparse
import hashlib
import json
from pathlib import Path


ARMS = ['teacher', 'base', 'lora']


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def loads(text):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('DUPLICATE_JSON_KEY:' + key)
            value[key] = item
        return value
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('NONFINITE_JSON:' + value)))


def read(path):
    return loads(Path(path).read_text())


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def safe_evidence(root, entries):
    checked = []
    for item in entries:
        assert item.get('kind') in ['source-semantic', 'teacher-gameplay'], 'UNKNOWN_TEACHER_EVIDENCE_KIND'
        relative = Path(item['path'])
        assert not relative.is_absolute() and '..' not in relative.parts, 'UNSAFE_TEACHER_EVIDENCE_PATH'
        file = (root / relative).resolve()
        assert file.is_relative_to(root) and file.is_file(), 'MISSING_TEACHER_EVIDENCE'
        assert digest(file) == item['sha256'], 'TEACHER_EVIDENCE_DRIFT:' + item['path']
        checked.append({'kind': item['kind'], 'path': str(file), 'sha256': item['sha256']})
    assert sorted(x['kind'] for x in checked) == ['source-semantic', 'teacher-gameplay'], 'INCOMPLETE_TEACHER_EVIDENCE'
    return checked


def compiled_index(directory, expected_rows, expected_arm):
    directory = Path(directory).resolve()
    report_path = directory / 'report.json'; report = read(report_path)
    assert report['schema'] == 'ggd-distillation-generation-compile@1', 'WRONG_COMPILE_SCHEMA'
    assert report['sourceEvidence']['arm'] == expected_arm, 'COMPILE_ARM_DRIFT'
    wanted = {row['id']: row for row in expected_rows}; found = {}
    for index, row in enumerate(report['rows']):
        if row['id'] not in wanted:
            continue
        expected = wanted[row['id']]
        assert row['heroId'] == expected['heroId'] and row['slot'] == 'HERO', 'COMPILE_IDENTITY_DRIFT'
        assert row['id'] not in found, 'DUPLICATE_COMPILE_ROW'
        file = directory / f'case-{index:04d}' / 'compiled.json'
        if row.get('schemaCompilePassed') is True and row.get('diskReloadCompileIdentical') is True:
            assert file.is_file() and digest(file) == row['compiledSha256'], 'COMPILED_ARTIFACT_DRIFT:' + row['id']
            found[row['id']] = {'engineRevision': row['engineRevision'], 'path': str(file),
                                'sha256': row['compiledSha256']}
        else:
            assert not file.exists(), 'FAILED_COMPILE_HAS_ARTIFACT:' + row['id']
            found[row['id']] = None
    assert set(found) == set(wanted), 'MISSING_PRIMARY_COMPILE_ROWS'
    return {'report': str(report_path), 'reportSha256': digest(report_path), 'rows': found}


def build(results_path, qualification_path, compile_dirs, out):
    results_path, qualification_path, out = map(lambda value: Path(value).resolve(),
                                                 (results_path, qualification_path, out))
    assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    results, qualification = read(results_path), read(qualification_path)
    assert results['schema'] == 'ggd-distillation-results@1', 'WRONG_RESULTS_SCHEMA'
    assert qualification['schema'] == 'ggd-distillation-teacher-quality@1', 'WRONG_QUALIFICATION_SCHEMA'
    assert qualification['blindTest'] is results['blindTest'], 'QUALIFICATION_BLIND_DRIFT'
    expected = [(row['id'], row['heroId']) for row in results['arms']['teacher']['rows']]
    assert [(row['id'], row['heroId']) for row in qualification['rows']] == expected, 'QUALIFICATION_DENOMINATOR_DRIFT'
    qroot = qualification_path.parent.resolve(); qualified = {}
    for row in qualification['rows']:
        assert row['semanticFidelity'] in ['passed', 'failed'] and row['gameplay'] in ['passed', 'failed'], 'UNVERIFIED_TEACHER_QUALITY'
        assert type(row['unsafeAccept']) is bool, 'INVALID_TEACHER_UNSAFE_FLAG'
        qualified[row['id']] = {**row, 'checkedEvidence': safe_evidence(qroot, row['evidence'])}
    indexes = {}
    for arm in ARMS:
        expected_arm = 'teacher-control' if arm == 'teacher' else arm
        indexes[arm] = compiled_index(compile_dirs[arm], results['arms'][arm]['rows'], expected_arm)
        pin = results.get('sourceFiles', {}).get(indexes[arm]['report']) or {}
        assert pin.get('sha256') == indexes[arm]['reportSha256'], 'RESULTS_COMPILE_REPORT_BINDING_DRIFT:' + arm
    for row in qualification['rows']:
        teacher = indexes['teacher']['rows'][row['id']]
        assert teacher is not None, 'QUALIFIED_TEACHER_DID_NOT_COMPILE:' + row['id']
        assert row.get('engineRevision') == teacher['engineRevision'], 'QUALIFIED_TEACHER_ENGINE_DRIFT:' + row['id']
        assert row.get('compiledSha256') == teacher['sha256'], 'QUALIFIED_TEACHER_COMPILED_DRIFT:' + row['id']
    out.mkdir(parents=True)
    rows = []
    for arm in ARMS:
        for number, row in enumerate(results['arms'][arm]['rows']):
            qrow = qualified[row['id']]; teacher = indexes['teacher']['rows'][row['id']]
            candidate = indexes[arm]['rows'][row['id']]
            same_engine = candidate is not None and teacher is not None and candidate['engineRevision'] == teacher['engineRevision']
            exact = same_engine and candidate['sha256'] == teacher['sha256']
            imported = row.get('isolatedImport') or {}
            live = imported.get('passed') is True and imported.get('runtimeMatchesAdmission') is True
            semantic = qrow['semanticFidelity'] == 'passed' and exact
            gameplay = qrow['gameplay'] == 'passed' and exact and live
            package_accepted = (row.get('package') or {}).get('passed') is True
            unsafe = qrow['unsafeAccept'] or (package_accepted and not semantic)
            receipt_data = {
                'semantic': {'schema': 'ggd-distillation-exact-reference-receipt@1', 'arm': arm,
                    'id': row['id'], 'heroId': row['heroId'], 'verdict': 'passed' if semantic else 'failed',
                    'method': 'Exact complete compiled-hero SHA-256 identity to separately qualified teacher.',
                    'teacher': teacher, 'candidate': candidate, 'samePinnedEngine': same_engine,
                    'exactCompiledIdentity': exact, 'teacherQualification': qrow['semanticFidelity'],
                    'teacherEvidence': qrow['checkedEvidence']},
                'live-import': {'schema': 'ggd-distillation-exact-reference-receipt@1', 'arm': arm,
                    'id': row['id'], 'heroId': row['heroId'], 'verdict': 'passed' if live else 'failed',
                    'method': 'Existing isolated import and saved-runtime equality from the bound results row.',
                    'isolatedImport': imported},
                'gameplay': {'schema': 'ggd-distillation-exact-reference-receipt@1', 'arm': arm,
                    'id': row['id'], 'heroId': row['heroId'], 'verdict': 'passed' if gameplay else 'failed',
                    'method': 'Exact compiled identity transfers separately qualified teacher gameplay only after candidate import/runtime equality.',
                    'teacherGameplayQualification': qrow['gameplay'], 'exactCompiledIdentity': exact,
                    'candidateImportRuntimePassed': live, 'teacherEvidence': qrow['checkedEvidence']}}
            evidence = []
            for kind, value in receipt_data.items():
                relative = Path('receipts') / f'{arm}-{number:04d}-{kind}.json'
                save(out / relative, value)
                evidence.append({'kind': kind, 'path': str(relative), 'sha256': digest(out / relative)})
            rows.append({'arm': arm, 'id': row['id'], 'heroId': row['heroId'], 'supported': True,
                'humanRepairs': 0, 'reviewerInterventions': 0,
                'semanticFidelity': 'passed' if semantic else 'failed',
                'liveImport': 'passed' if live else 'failed', 'gameplay': 'passed' if gameplay else 'failed',
                'unsafeAccept': unsafe, 'evidence': evidence})
    evidence = {'schema': 'ggd-distillation-quality-evidence@1', 'resultsSha256': digest(results_path),
        'blindTest': results['blindTest'], 'rows': rows,
        'method': 'exact-compiled-reference-identity@1',
        'inputs': {'results': {'path': str(results_path), 'sha256': digest(results_path)},
                   'teacherQualification': {'path': str(qualification_path), 'sha256': digest(qualification_path)},
                   'compileReports': {arm: {'path': value['report'], 'sha256': value['reportSha256']}
                                      for arm, value in indexes.items()}},
        'limits': ['Different but functionally equivalent outputs fail closed.',
                   'Teacher qualification is external, hash-bound evidence; this script cannot create it.',
                   'No LLM judgment, output repair, retry or model promotion occurs.']}
    save(out / 'quality-evidence.json', evidence)
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--teacher-quality', type=Path, required=True, dest='qualification_path')
    for arm in ARMS:
        parser.add_argument('--' + arm + '-compile', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    value = build(args.results, args.qualification_path,
                  {arm: getattr(args, arm + '_compile') for arm in ARMS}, args.out)
    print(json.dumps({'rows': len(value['rows']), 'unsafeAccepts': sum(r['unsafeAccept'] for r in value['rows'])}, ensure_ascii=False))

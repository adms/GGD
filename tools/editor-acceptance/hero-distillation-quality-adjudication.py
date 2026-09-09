"""Bind row-level quality receipts to teacher/base/LoRA results.

The evidence file supplies determinate verdicts and artifact hashes.  This tool
derives full-hero success from those verdicts plus the already-recorded
structural/package/import facts; it cannot repair or regenerate an output.
"""
import argparse
import hashlib
import json
from pathlib import Path


ARMS = ['teacher', 'base', 'lora']
VERDICTS = ['passed', 'failed']
EVIDENCE_KINDS = ['semantic', 'live-import', 'gameplay']


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def loads(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('DUPLICATE_JSON_KEY:' + key)
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('NONFINITE_JSON:' + value)))


def read(path):
    return loads(Path(path).read_text())


def adjudicate(results_path, evidence_path):
    results_path, evidence_path = Path(results_path), Path(evidence_path)
    results, evidence = read(results_path), read(evidence_path)
    assert results['schema'] == 'ggd-distillation-results@1', 'WRONG_RESULTS_SCHEMA'
    assert evidence['schema'] == 'ggd-distillation-quality-evidence@1', 'WRONG_EVIDENCE_SCHEMA'
    assert evidence['resultsSha256'] == digest(results_path), 'RESULTS_EVIDENCE_DRIFT'
    assert evidence['blindTest'] is results['blindTest'], 'BLIND_STATUS_DRIFT'
    expected = [(arm, row['id'], row['heroId']) for arm in ARMS for row in results['arms'][arm]['rows']]
    actual = [(row['arm'], row['id'], row['heroId']) for row in evidence['rows']]
    assert actual == expected, 'QUALITY_ROW_ORDER_OR_DENOMINATOR_DRIFT'

    evidence_root = evidence_path.parent.resolve()
    for arm in ARMS:
        rows = results['arms'][arm]['rows']
        receipts = [row for row in evidence['rows'] if row['arm'] == arm]
        for row, receipt in zip(rows, receipts):
            assert type(receipt['supported']) is bool, 'INVALID_SUPPORTED_FLAG'
            assert type(receipt['humanRepairs']) is int and receipt['humanRepairs'] >= 0, 'INVALID_HUMAN_REPAIRS'
            assert type(receipt['reviewerInterventions']) is int and receipt['reviewerInterventions'] >= 0, 'INVALID_REVIEW_COUNT'
            assert type(receipt['unsafeAccept']) is bool, 'INVALID_UNSAFE_ACCEPT'
            verdicts = [receipt[key] for key in ['semanticFidelity', 'liveImport', 'gameplay']]
            assert all(value in VERDICTS for value in verdicts), 'UNVERIFIED_QUALITY_VERDICT'
            kinds = [item['kind'] for item in receipt['evidence']]
            assert sorted(kinds) == sorted(EVIDENCE_KINDS), 'MISSING_OR_DUPLICATE_QUALITY_EVIDENCE'
            evidence_paths = [item['path'] for item in receipt['evidence']]
            assert len(evidence_paths) == len(set(evidence_paths)), 'DUPLICATE_QUALITY_EVIDENCE_PATH'
            for item in receipt['evidence']:
                relative = Path(item['path'])
                assert not relative.is_absolute() and '..' not in relative.parts, 'UNSAFE_EVIDENCE_PATH'
                file = (evidence_root / relative).resolve()
                assert file.is_relative_to(evidence_root) and file.is_file(), 'MISSING_EVIDENCE_FILE'
                assert digest(file) == item['sha256'], 'QUALITY_EVIDENCE_DRIFT:' + item['path']
                artifact = read(file)
                assert artifact.get('schema') == 'ggd-distillation-exact-reference-receipt@1', \
                    'WRONG_QUALITY_RECEIPT_SCHEMA:' + item['kind']
                assert (artifact.get('arm'), artifact.get('id'), artifact.get('heroId')) == \
                    (arm, receipt['id'], receipt['heroId']), 'QUALITY_RECEIPT_IDENTITY_DRIFT:' + item['kind']
                verdict_key = {'semantic': 'semanticFidelity', 'live-import': 'liveImport',
                               'gameplay': 'gameplay'}[item['kind']]
                assert artifact.get('verdict') == receipt[verdict_key], \
                    'QUALITY_RECEIPT_VERDICT_DRIFT:' + item['kind']
                results['sourceFiles'][str(file)] = {'sha256': item['sha256'], 'bytes': file.stat().st_size}
            structural = (row.get('structural') or {}).get('structuralPassed') is True
            package = (row.get('package') or {}).get('passed') is True
            imported = row.get('isolatedImport') or {}
            isolated = imported.get('passed') is True and imported.get('runtimeMatchesAdmission') is True
            success = receipt['supported'] and receipt['humanRepairs'] == 0 and not receipt['unsafeAccept'] \
                and verdicts == ['passed', 'passed', 'passed'] and structural and package and isolated
            row.update(supported=receipt['supported'], humanRepairs=receipt['humanRepairs'],
                       reviewerInterventions=receipt['reviewerInterventions'],
                       semanticFidelity=receipt['semanticFidelity'], liveImport=receipt['liveImport'],
                       gameplay=receipt['gameplay'], unsafeAccept=receipt['unsafeAccept'],
                       fullHeroSuccess=success, qualityEvidence=receipt['evidence'])
        results['arms'][arm]['fullHeroSuccess'] = sum(row['fullHeroSuccess'] for row in rows)
        results['arms'][arm]['unsafeAccepts'] = sum(row['unsafeAccept'] for row in rows)
    results['qualityEvidence'] = {'schema': evidence['schema'], 'sha256': digest(evidence_path),
        'rows': len(evidence['rows']),
        'reviewerInterventions': sum(row['reviewerInterventions'] for row in evidence['rows']),
        'humanRepairs': sum(row['humanRepairs'] for row in evidence['rows']),
        'scope': 'Verdicts are bound to receipts; fullHeroSuccess is derived, not supplied by the evidence file.'}
    results['sourceFiles'][str(results_path.resolve())] = {'sha256': digest(results_path), 'bytes': results_path.stat().st_size}
    results['sourceFiles'][str(evidence_path.resolve())] = {'sha256': digest(evidence_path), 'bytes': evidence_path.stat().st_size}
    results['fullHeroE2EProven'] = True
    results['modelPromoted'] = False
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assert not args.out.exists(), 'REFUSE_OVERWRITE'
    value = adjudicate(args.results, args.evidence)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({arm: {'success': value['arms'][arm]['fullHeroSuccess'],
                            'unsafe': value['arms'][arm]['unsafeAccepts']} for arm in ARMS}, ensure_ascii=False))

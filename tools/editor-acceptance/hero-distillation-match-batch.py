"""Run isolated headless match-entry checks on every eligible generated hero.

No new GPU work, repairs, retries, dropped denominators, or semantic approval.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

HERE = Path(__file__).resolve().parent
ENTRY = HERE / 'hero-distillation-match-entry.mts'


def read(path): return json.loads(Path(path).read_text())
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path = Path(path); temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def execute(argv, log, timeout):
    with Path(log).open('x') as stream:
        child = subprocess.Popen(argv, stdout=stream, stderr=subprocess.STDOUT,
                                 cwd=HERE.parents[1], start_new_session=True)
        try:
            return child.wait(timeout=timeout)
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)


def run(options, launch=execute):
    e2e, out = Path(options['e2e']).resolve(), Path(options['out']).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    seconds = options.get('seconds_per_hero', 180)
    assert type(seconds) is int and 1 <= seconds <= 180, 'INVALID_CASE_TIME_LIMIT'
    p, result = read(e2e / 'manifest.json'), read(e2e / 'result.json')
    assert read(e2e / 'state.json')['status'] == 'completed', 'E2E_NOT_TERMINAL'
    assert p['schema'] == 'ggd-action-e2e@1' and result['schema'] == 'ggd-action-e2e-result@1'
    evaluation = Path(p['evaluationDirectory'])
    assert digest(evaluation / 'manifest.json') == p['evaluationManifestSha256'], 'EVALUATION_DRIFT'
    evaluation_manifest = read(evaluation / 'manifest.json')
    assert digest(evaluation / 'public-heroes.json') == evaluation_manifest['publicHeroesSha256'], 'PUBLIC_HERO_DRIFT'
    heroes = read(evaluation / 'public-heroes.json')['heroes']
    ids = [hero['heroId'] for hero in heroes]
    assert len(ids) == len(set(ids)) == evaluation_manifest['heroes'], 'HERO_DENOMINATOR_DRIFT'
    out.mkdir(parents=True)
    report = {'schema': 'ggd-match-entry-batch@1', 'status': 'running', 'startedAt': time.time(),
              'e2eResultSha256': digest(e2e / 'result.json'), 'e2eManifestSha256': digest(e2e / 'manifest.json'),
              'entryScriptSha256': digest(ENTRY), 'scriptSha256': digest(__file__),
              'secondsPerHero': seconds, 'attemptsPerHero': 1, 'arms': {}, 'humanRepairs': 0,
              'sixSlotSemanticsMeasured': False, 'networkClientMeasured': False,
              'fullHeroE2EProven': False, 'modelPromoted': False}
    try:
        for arm in ['base', 'lora']:
            rows = [{'heroId': hero_id, 'status': 'not-measured', 'entryPassed': False} for hero_id in ids]
            report['arms'][arm] = {'wholeHeroes': len(ids), 'rows': rows}
            if result.get('skipped'):
                assert result['skipReason'] == 'INCOMPLETE_HERO_PLANS', 'UNKNOWN_E2E_SKIP'
                for row in rows: row['status'] = 'blocked-by-generation'
            else:
                imported_path, package_path, audit_path = [e2e / f'{arm}-{name}' / 'report.json'
                                                           for name in ['import', 'package', 'runtime-audit']]
                imported, package, audit = map(read, [imported_path, package_path, audit_path])
                assert imported['admittedReportSha256'] == digest(package_path), 'PACKAGE_REPORT_DRIFT'
                assert audit['importReportSha256'] == digest(imported_path), 'IMPORT_REPORT_DRIFT'
                assert audit['admittedReportSha256'] == digest(package_path), 'AUDITED_PACKAGE_DRIFT'
                assert [r['heroId'] for r in imported['rows']] == ids, 'IMPORTED_HERO_ORDER_DRIFT'
                assert [r['heroId'] for r in package['rows']] == ids, 'PACKAGED_HERO_ORDER_DRIFT'
                assert [r['id'] for r in audit['rows']] == [r['id'] for r in imported['rows']], 'AUDIT_ORDER_DRIFT'
                for row, imp, pack, checked in zip(rows, imported['rows'], package['rows'], audit['rows']):
                    if not imp.get('liveImportPassed') or checked.get('runtimeMatchesAdmission') is not True:
                        row['status'] = 'blocked-by-import-or-runtime-audit'; continue
                    assert digest(ENTRY) == report['entryScriptSha256'], 'ENTRY_RUNNER_DRIFT'
                    assert re.fullmatch(r'case-\d{4}\.json', pack['artifact']), 'UNSAFE_ARTIFACT_PATH'
                    assert digest(e2e / f'{arm}-package' / pack['artifact']) == pack['artifactSha256'], 'PACKAGE_ARTIFACT_DRIFT'
                    archive = imported_path.parent / Path(pack['artifact']).stem / 'hero.zip'
                    assert digest(archive) == imp['archiveSha256'] == checked['archiveSha256'], 'AUDITED_ARCHIVE_DRIFT'
                    case = out / f'{arm}-{Path(pack["artifact"]).stem}'
                    argv = [options['node_binary'], '--import', 'tsx', str(ENTRY), '--import-report', str(imported_path),
                            '--zip', str(archive), '--hero-id', row['heroId'], '--source-repo', options['source_repo'],
                            '--game-dependencies', options['game_dependencies'], '--shared-dependencies', options['shared_dependencies'], '--out', str(case)]
                    row['status'] = 'running'; write(out / 'report.json', report)
                    try:
                        code = launch(argv, case.with_suffix('.log'), seconds)
                        evidence = read(case / 'report.json')
                        assert evidence['heroId'] == row['heroId'] and evidence['archiveSha256'] == imp['archiveSha256'], 'MATCH_CASE_IDENTITY_DRIFT'
                        assert evidence['scriptSha256'] == report['entryScriptSha256'], 'MATCH_CASE_SCRIPT_DRIFT'
                        row.update(status=evidence['status'], exitCode=code, evidencePath=str(case / 'report.json'),
                                   evidenceSha256=digest(case / 'report.json'), stage=evidence.get('stage'), error=evidence.get('error'))
                        row['entryPassed'] = code == 0 and evidence['status'] == 'entry-passed-not-mechanism-acceptance' and all(
                            evidence.get(key) is True for key in ['selectionPassed', 'spawnPassed', 'combatEntryPassed', 'unknownSelectionRejected'])
                    except (Exception,):
                        # Preserve process/runtime failures separately; never retry or count as a pass.
                        import traceback
                        row.update(status='check-execution-failed', error=traceback.format_exc())
            report['arms'][arm]['entryPassed'] = sum(r['entryPassed'] for r in rows)
            report['arms'][arm]['unpassed'] = len(rows) - report['arms'][arm]['entryPassed']
            write(out / 'report.json', report)
        report['status'] = 'completed'
    except BaseException as error:
        report.update(status='stopped-or-failed', error=repr(error)); raise
    finally:
        report['finishedAt'] = time.time(); write(out / 'report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['e2e', 'out', 'source_repo', 'game_dependencies', 'shared_dependencies', 'node_binary']:
        parser.add_argument('--' + name.replace('_', '-'), required=True, dest=name)
    parser.add_argument('--seconds-per-hero', type=int, default=180, dest='seconds_per_hero')
    report = run(vars(parser.parse_args()))
    print(json.dumps({'status': report['status'], 'arms': {k: {f:v for f,v in a.items() if f != 'rows'} for k,a in report['arms'].items()}}))

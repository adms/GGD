#!/usr/bin/env python3
"""Offline batch verification. No publishing, source writes or arbitrary shell commands."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import time

REPO = Path(__file__).resolve().parents[2]
SLOTS = ('PASSIVE', 'Q', 'W', 'E', 'R', 'EX')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def member(root, name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError(f'Invalid member: {name!r}')
    p = Path(name)
    if p.is_absolute() or '..' in p.parts or p.as_posix() != name:
        raise ValueError(f'Unsafe member: {name}')
    resolved = (root / p).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError(f'Member escapes batch: {name}')
    return resolved


def preflight(batch):
    """Collect every independent file error, rather than stopping on the first hash."""
    errors, slots = [], []
    manifest_path = batch / 'handoff-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('schema') != 'ggd-shared-authoring-handoff@1':
        raise ValueError('Unsupported handoff manifest')
    seen = set()
    for row in manifest.get('files', []) + manifest.get('refinements', []):
        try:
            path = member(batch, row['path'])
            if row['path'] in seen:
                raise ValueError('Duplicate manifest member')
            seen.add(row['path'])
            if digest(path) != row['sha256']:
                raise ValueError('SHA-256 mismatch; rebuild from source')
            if 'bytes' in row and path.stat().st_size != row['bytes']:
                raise ValueError('Byte count mismatch')
        except (OSError, ValueError, KeyError) as exc:
            errors.append(f"{row.get('path')}: {exc}")
    index = json.loads((batch / 'index.json').read_text())
    heroes = index.get('heroes', [])
    if not 1 <= len(heroes) <= 100 or index.get('heroCount') != len(heroes) or index.get('slotCount') != len(heroes) * 6:
        errors.append('Index must contain 1..100 unique heroes with six slots each')
    if manifest.get('heroCount') != len(heroes) or manifest.get('slotCount') != len(heroes) * 6:
        errors.append('Manifest counts differ from index')
    ids = set()
    for hero in heroes:
        try:
            if hero['projectId'] in ids:
                raise ValueError('Duplicate hero identity')
            ids.add(hero['projectId'])
            for key in ('project', 'recipe'):
                if hero[key] not in seen:
                    raise ValueError(f'{key} not hashed in manifest')
            recipe_path = member(batch, hero['recipe'])
            recipe = json.loads(recipe_path.read_text())
            project = json.loads(member(batch, hero['project']).read_text())
            if recipe['projectId'] != hero['projectId'] or project['projectId'] != hero['projectId']:
                raise ValueError('Project/recipe/index identity mismatch')
            if project['sourceDesign']['sourceSha256'] != digest(recipe_path):
                raise ValueError('Project no longer matches its preserved source')
            rows = {s['slot']: s for s in recipe['slots']}
            if set(rows) != set(SLOTS) or len(recipe['slots']) != 6:
                raise ValueError('Missing or duplicate source slot')
            for slot in SLOTS:
                source = rows[slot]
                slots.append({'projectId': hero['projectId'], 'name': hero['name'], 'slot': slot,
                              'ownerDescription': source['ownerDescription'],
                              'requiredRefinement': source.get('requiredRefinement', ''),
                              'behaviorSuites': [], 'behaviorTests': 'not-covered',
                              'originalDesignAcceptance': 'unverified', 'visualAcceptance': 'unverified'})
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.append(f"{hero.get('projectId')}: {exc}")
    return errors, slots


def load_plan(batch, slots):
    path = batch / 'validation-plan.json'
    if not path.exists():
        return []
    plan = json.loads(path.read_text())
    if plan.get('schema') != 'ggd-batch-validation-plan@1' or plan.get('manifestSha256') != digest(batch / 'handoff-manifest.json'):
        raise ValueError('Validation plan is stale or has the wrong schema; review its source/test mapping')
    known = {(r['projectId'], r['slot']) for r in slots}
    suites, ids = [], set()
    for suite in plan['suites']:
        if not re.fullmatch(r'[a-z0-9-]+', suite['id']) or suite['id'] in ids:
            raise ValueError('Invalid or duplicate suite id')
        ids.add(suite['id'])
        if set(suite) != {'id', 'files', 'heroSlots'} or not suite['files']:
            raise ValueError('Suites accept test files and coverage only, never commands')
        for name in suite['files']:
            path = member(REPO, name)
            if not name.startswith(('packages/shared/', 'apps/editor/', 'apps/client/', 'apps/game-server/')) or not name.endswith(('.test.ts', '.test.tsx')) or not path.is_file():
                raise ValueError(f'Not an existing repository test: {name}')
        for hero, covered in suite['heroSlots'].items():
            if not covered or any((hero, s) not in known for s in covered):
                raise ValueError(f'Suite {suite["id"]} references another batch or nonexistent slot')
        suites.append(suite)
    return suites


def source_fingerprint(repo, batch):
    """Git blob ids cover clean files; actual bytes cover dirty/untracked files."""
    h = hashlib.sha256(subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=repo))
    changed = subprocess.check_output(['git', 'diff', '--name-only', '-z'], cwd=repo).decode().split('\0')
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=repo).decode().split('\0')
    for name in sorted(set(changed + untracked) - {''}):
        p = repo / name
        h.update(name.encode()); h.update(p.read_bytes() if p.is_file() else b'<deleted>')
    # An external batch must participate in cache identity too, not just its manifest text.
    for p in sorted(batch.rglob('*.json')):
        if not p.resolve().is_relative_to(batch.resolve()):
            raise ValueError('External batch contains a JSON symlink outside its root')
        h.update(p.relative_to(batch).as_posix().encode()); h.update(p.read_bytes())
    return h.hexdigest()


def run_job(job, output, fingerprint, env, timeout, previous=None, previous_root=None):
    key = hashlib.sha256((fingerprint + json.dumps(job['argv']) + str(timeout)).encode()).hexdigest()
    log_name = job['id'] + '.log'
    log = output / log_name
    old = (previous or {}).get(job['id'])
    if job.get('cacheable', True) and old and old.get('exitCode') == 0 and old.get('fingerprint') == key:
        try:
            old_log = member(previous_root, old['log'])
            if digest(old_log) == old['logSha256']:
                shutil.copyfile(old_log, log)
                return {**old, 'log': log_name, 'reused': True}
        except (OSError, ValueError, KeyError):
            pass  # Missing or tampered success evidence is rerun, never trusted.
    start = time.monotonic()
    with log.open('wb') as stream:
        process = subprocess.Popen(job['argv'], cwd=REPO, env=env, stdout=stream,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
            # The parent may have exited while a grandchild ignored TERM.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(); code = 124
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise
    return {'id': job['id'], 'argv': job['argv'], 'exitCode': code, 'fingerprint': key,
            'log': log_name, 'logSha256': digest(log), 'seconds': round(time.monotonic() - start, 2), 'reused': False}


def skills_census_jobs(package):
    jobs = []
    for text in dict.fromkeys(package['scripts']['skills:check'].split('&&')):
        argv = shlex.split(text.strip())
        if len(argv) != 2 or argv[0] != 'pnpm' or argv[1] not in package['scripts']:
            raise ValueError('skills:check changed shape; refusing to reinterpret shell syntax')
        jobs.append({'id': 'skills-' + argv[1].replace(':', '-'), 'argv': argv})
    return jobs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--batch-dir', type=Path, default=REPO / 'materials/community-hero-forge')
    ap.add_argument('--output', required=True, type=Path, help='New directory outside repository and batch')
    ap.add_argument('--release-root', type=Path, help='Existing local model archive; never downloaded automatically')
    ap.add_argument('--release', action='store_true', help='Run all three required release gates; diagnose all skills children on failure')
    ap.add_argument('--resume-from', type=Path, help='Previous output directory; successful matching evidence only')
    ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--timeout', type=int, default=600, help='Per-command timeout, seconds')
    args = ap.parse_args()
    batch, output = args.batch_dir.resolve(), args.output.resolve()
    if output.is_relative_to(REPO) or output.is_relative_to(batch) or not 1 <= args.jobs <= 4 or not 1 <= args.timeout <= 3600:
        ap.error('Output must be outside source; jobs 1..4; timeout 1..3600')
    output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'ggd-batch-verification@1', 'batch': str(batch), 'errors': [], 'slots': [], 'jobs': [],
              'originalDesignAcceptance': 'unverified', 'visualAcceptance': 'unverified', 'formalPublication': False,
              'modelBytes': 'pending' if args.release_root else 'not-checked'}
    previous, previous_root = {}, None
    try:
        if args.resume_from:
            previous_root = args.resume_from.resolve()
            previous = {j['id']: j for j in json.loads((previous_root / 'report.json').read_text())['jobs']}
        errors, slots = preflight(batch)
        report.update(errors=errors, slots=slots)
        input_ok = not errors
        suites = []
        try:
            suites = load_plan(batch, slots)
        except (OSError, KeyError, ValueError) as exc:
            report['errors'].append(str(exc))
        fingerprint = source_fingerprint(REPO, batch)
        report['sourceFingerprint'] = fingerprint
        report['head'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
        jobs = []
        if input_ok:
            argv = ['pnpm', 'exec', 'node', '--import', 'tsx', 'tools/community-hero-forge/prepare-published-handoff.mts', '--batch-dir', str(batch)]
            if args.release_root:
                argv += ['--release-root', str(args.release_root.resolve())]
            # Re-read archive bytes each time; behavior/release caches remain reusable.
            jobs.append({'id': 'compile-and-models', 'argv': argv, 'cacheable': not bool(args.release_root)})
            for suite in suites:
                jobs.append({'id': 'behavior-' + suite['id'], 'argv': ['pnpm', 'exec', 'vitest', 'run', *suite['files'], '--pool=threads', '--minWorkers=1', '--maxWorkers=1']})
        if args.release:
            jobs = [{'id': id, 'argv': ['pnpm', cmd]} for id, cmd in [('skills', 'skills:check'), ('editor', 'editor:accept:release'), ('coord', 'coord:check')]] + jobs
        env = {**os.environ, 'GGD_HERO_BATCH_DIR': str(batch)}
        def execute(job):
            try:
                job_env = env if job['id'].startswith('behavior-') else {k: v for k, v in os.environ.items() if k != 'GGD_HERO_BATCH_DIR'}
                result = run_job(job, output, fingerprint, job_env, args.timeout, previous, previous_root)
            except OSError as exc:
                result = {'id': job['id'], 'argv': job['argv'], 'exitCode': 127, 'error': str(exc), 'reused': False}
            print(f"{result['id']}: exit {result['exitCode']}" + (' (reused)' if result['reused'] else ''), flush=True)
            return result
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            report['jobs'] = list(pool.map(execute, jobs))
            if any(j['id'] == 'skills' and j['exitCode'] != 0 for j in report['jobs']):
                report['jobs'] += list(pool.map(execute, skills_census_jobs(json.loads((REPO / 'package.json').read_text()))))
        by_id = {j['id']: j for j in report['jobs']}
        if args.release_root:
            report['modelBytes'] = 'verified' if by_id.get('compile-and-models', {}).get('exitCode') == 0 else 'not-verified'
        for row in slots:
            row['behaviorSuites'] = ['behavior-' + s['id'] for s in suites if row['slot'] in s['heroSlots'].get(row['projectId'], [])]
            if row['behaviorSuites']:
                row['behaviorTests'] = 'passed' if all(by_id.get(id, {}).get('exitCode') == 0 for id in row['behaviorSuites']) else 'failed-or-not-run'
        report['counts'] = {'heroes': len({s['projectId'] for s in slots}), 'slots': len(slots),
                            'slotsWithPassingBehaviorSuite': sum(s['behaviorTests'] == 'passed' for s in slots),
                            'slotsWithoutBehaviorSuite': sum(not s['behaviorSuites'] for s in slots)}
        # Source edits during a run invalidate its evidence, even if child processes exited 0.
        if source_fingerprint(REPO, batch) != report['sourceFingerprint']:
            report['errors'].append('Sources changed during verification; rerun against a stable tree')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        report['errors'].append(str(exc))
    report['exitCode'] = 1 if report['errors'] or any(j['exitCode'] != 0 for j in report['jobs']) else (2 if any(s['behaviorTests'] != 'passed' for s in report['slots']) else 0)
    if report['errors']:
        for job in report['jobs']:
            job['fingerprint'] = 'invalidated'  # A mixed-source run must never seed a cache.
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    failures = report['errors'] + [f"{j['id']}: exit {j['exitCode']} ({j.get('log', 'no log')})" for j in report['jobs'] if j['exitCode'] != 0]
    lines = ['# Batch verification', '', json.dumps(report.get('counts', {}), ensure_ascii=False), '',
             'Passing tests are evidence, not a declaration that every original requirement or visual is complete.', '',
             '## Failures', '', *(['- ' + f for f in failures] or ['None.']), '', '## Uncovered slots', '']
    lines += [f"- {s['name']} {s['slot']}: {s['requiredRefinement']}" for s in report['slots'] if s['behaviorTests'] != 'passed']
    (output / 'report.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps({'output': str(output), 'exitCode': report['exitCode'], **report.get('counts', {})}, ensure_ascii=False))
    return report['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())

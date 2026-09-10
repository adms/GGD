"""CPU-only, no-repair E2E controller for completed bounded-action arms.

It deliberately starts *after* base and LoRA action generation have terminal
receipts.  Each arm preserves the same full hero denominator through Main
materialization, package admission, isolated import, and ZIP runtime readback.
This controller cannot establish semantic fidelity or game-match behavior.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

SCRIPT = Path(__file__).resolve(); REPO = SCRIPT.parents[2]
FILES = [SCRIPT.name, 'hero-distillation-action-compile.mts', 'hero-distillation-action-evaluate.py',
         'hero-distillation-package-admission.mts', 'hero-distillation-import-roundtrip.mts']


def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path): return json.loads(Path(path).read_text())


def node_binary(value=None):
    """Resolve Node before writing an E2E receipt.

    Protected launch environments may intentionally use a short PATH even
    though the local desktop's Node is installed in /usr/local/bin.  A caller
    may provide an absolute path; otherwise retain the ordinary PATH lookup
    and then use only this known local fallback.  This is a deterministic
    runtime preflight, not a dependency installer or PATH mutation.
    """
    candidate = Path(value).resolve() if value else Path(shutil.which('node') or '/usr/local/bin/node').resolve()
    assert candidate.is_file() and os.access(candidate, os.X_OK), 'NODE_REQUIRED:' + str(candidate)
    return str(candidate)


def write(path, value):
    path = Path(path); temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n'); temporary.replace(path)


def command(argv, log, timeout=180):
    """Run one bounded CPU phase, joining only this subprocess group."""
    with Path(log).open('x') as stream:
        child = subprocess.Popen(argv, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=timeout)
            if code != 0: raise RuntimeError(f'CPU_STEP_EXIT:{code}; log={log}')
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)


def action_manifest(evaluation):
    p = read(Path(evaluation) / 'manifest.json')
    assert p['schema'] == 'ggd-action-protected-evaluation@1', 'ACTION_EVALUATION_SCHEMA'
    assert p.get('kind') == 'internal-dev-seen-regression', 'UNLABELLED_EVALUATION_KIND'
    results = {}
    for arm in ['base', 'lora']:
        state = read(Path(evaluation) / arm / 'state.json')
        result = read(Path(evaluation) / arm / 'result.json')
        assert state['status'] == 'completed' and state['workerPid'] is None, 'ACTION_ARM_NOT_TERMINAL:' + arm
        assert result['attemptedHeroes'] == p['heroes'], 'ACTION_DENOMINATOR_DRIFT:' + arm
        assert isinstance(result.get('completeHeroes'), int) and 0 <= result['completeHeroes'] <= p['heroes'], 'ACTION_COMPLETE_COUNT_INVALID:' + arm
        results[arm] = result
    return p, results


def run(options, execute=command):
    evaluation, models, dependencies, source = [Path(options[key]).resolve() for key in
                                                  ['evaluation', 'models', 'dependencies', 'source_repo']]
    roots = [Path(value).resolve() for value in options['asset_roots']]
    out = Path(options['out']).resolve(); assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    assert source == REPO.resolve(), 'SOURCE_REPO_MUST_BE_CURRENT_RESEARCH_CHECKOUT'
    assert all(path.is_dir() for path in [evaluation, models, dependencies, source, *roots]), 'INPUT_DIRECTORY_MISSING'
    p, arm_results = action_manifest(evaluation)
    node = node_binary(options.get('node_binary'))
    out.mkdir(parents=True); (out / 'source').mkdir()
    sources = {name: digest(SCRIPT if name == SCRIPT.name else SCRIPT.with_name(name)) for name in FILES}
    for name in FILES: shutil.copyfile(SCRIPT if name == SCRIPT.name else SCRIPT.with_name(name), out / 'source' / name)
    inputs = {str(path / 'manifest.json'): digest(path / 'manifest.json') for path in [evaluation, models]}
    state = {'schema': 'ggd-action-e2e-state@1', 'status': 'running', 'startedAt': time.time(), 'steps': [],
             'humanRepairs': 0, 'fullHeroE2EProven': False}
    manifest = {'schema': 'ggd-action-e2e@1', 'evaluationDirectory': str(evaluation),
                'evaluationManifestSha256': digest(evaluation / 'manifest.json'), 'modelBindingsDirectory': str(models),
                'modelBindingsManifestSha256': digest(models / 'manifest.json'), 'dependenciesDirectory': str(dependencies),
                'assetRoots': list(map(str, roots)), 'sourceRepo': str(source), 'sources': sources, 'inputManifests': inputs,
                'fixedArmOrder': ['base', 'lora'], 'attemptsPerArm': 1, 'automaticRetry': False, 'humanRepairs': 0,
                'evaluationKind': p['kind'], 'teacherAnswerFileAccess': False, 'cpuPhaseTimeoutSeconds': 180,
                'fullHeroE2EProven': False, 'modelPromoted': False}
    write(out / 'manifest.json', manifest); write(out / 'state.json', state)

    def step(name, action):
        for file, expected in inputs.items(): assert digest(file) == expected, 'INPUT_DRIFT:' + file
        for file, expected in sources.items():
            current = SCRIPT if file == SCRIPT.name else SCRIPT.with_name(file)
            assert digest(current) == expected and digest(out / 'source' / file) == expected, 'RUNNER_DRIFT:' + file
        record = {'name': name, 'status': 'running', 'startedAt': time.time()}; state['steps'].append(record); write(out / 'state.json', state)
        action(); record.update(status='completed', finishedAt=time.time()); write(out / 'state.json', state)

    old = signal.getsignal(signal.SIGTERM)
    def interrupted(signum, frame): raise InterruptedError('ACTION_E2E_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        # Only skip when neither arm produced a candidate. The compiler and
        # downstream gates already retain failed-generation rows, so partial
        # arms must still validate their candidates against the full denominator.
        incomplete = {arm: result['completeHeroes'] for arm, result in arm_results.items()
                      if result['completeHeroes'] != p['heroes']}
        if not any(result['completeHeroes'] for result in arm_results.values()):
            write(out / 'result.json', {'schema': 'ggd-action-e2e-result@1', 'arms': {
                arm: {'completeHeroes': result['completeHeroes'], 'attemptedHeroes': result['attemptedHeroes']}
                for arm, result in arm_results.items()}, 'evaluationKind': p['kind'],
                'skipped': True, 'skipReason': 'INCOMPLETE_HERO_PLANS', 'incompleteArms': incomplete,
                'humanRepairs': 0, 'semanticFidelityMeasured': False, 'gameplayMeasured': False,
                'fullHeroE2EProven': False, 'modelPromoted': False,
                'note': 'Neither arm produced a complete no-repair HeroPlan. No compiler/package/import/readback was run; every attempted hero remains in the denominator.'})
            state['status'] = 'completed'
            return state
        summaries = {}
        for arm in ['base', 'lora']:
            compiled, packaged, imported, audit = [out / f'{arm}-{label}' for label in ['compile', 'package', 'import', 'runtime-audit']]
            args = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-action-compile.mts')), '--evaluation', str(evaluation),
                    '--models', str(models), '--source-repo', str(source), '--out', str(compiled), '--arm', arm]
            step('compile-' + arm, lambda args=args, arm=arm: execute(args, out / f'compile-{arm}.log'))
            args = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-package-admission.mts')), '--compiled', str(compiled),
                    '--source-repo', str(source), '--out', str(packaged), '--dependencies', str(dependencies)]
            for root in roots: args.extend(['--asset-root', str(root)])
            step('package-' + arm, lambda args=args, arm=arm: execute(args, out / f'package-{arm}.log'))
            args = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')), '--admitted', str(packaged),
                    '--source-repo', str(source), '--out', str(imported), '--dependencies', str(dependencies),
                    '--api-dependencies', str(options['api_dependencies'])]
            for root in roots: args.extend(['--asset-root', str(root)])
            step('isolated-import-' + arm, lambda args=args, arm=arm: execute(args, out / f'import-{arm}.log'))
            args = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')), '--admitted', str(packaged),
                    '--verify-saved-runtime', str(imported), '--source-repo', str(source), '--out', str(audit)]
            step('runtime-readback-' + arm, lambda args=args, arm=arm: execute(args, out / f'runtime-{arm}.log'))
            summaries[arm] = {label: read(directory / 'report.json')['counts'] for label, directory in
                              [('compile', compiled), ('package', packaged), ('import', imported), ('runtimeAudit', audit)]}
            assert summaries[arm]['compile']['primaryWholeHeroes'] == p['heroes'], 'COMPILE_DENOMINATOR_DRIFT'
            assert summaries[arm]['package']['wholeHeroes'] == p['heroes'], 'PACKAGE_DENOMINATOR_DRIFT'
            assert summaries[arm]['import']['wholeHeroes'] == p['heroes'], 'IMPORT_DENOMINATOR_DRIFT'
            assert summaries[arm]['runtimeAudit']['wholeHeroes'] == p['heroes'], 'RUNTIME_DENOMINATOR_DRIFT'
        write(out / 'result.json', {'schema': 'ggd-action-e2e-result@1', 'arms': summaries, 'evaluationKind': p['kind'],
                                     'generationCounts': {arm: {'attemptedHeroes': result['attemptedHeroes'], 'completeHeroes': result['completeHeroes']}
                                                          for arm, result in arm_results.items()},
                                     'incompleteArms': incomplete,
                                     'humanRepairs': 0, 'semanticFidelityMeasured': False, 'gameplayMeasured': False,
                                     'fullHeroE2EProven': False, 'modelPromoted': False,
                                     'note': 'Completed means all scheduled evidence steps ran; it does not assert model readiness or game behavior.'})
        state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
        if state['steps'] and state['steps'][-1]['status'] == 'running': state['steps'][-1].update(status='stopped-or-failed', finishedAt=time.time())
        raise
    finally:
        signal.signal(signal.SIGTERM, old); state['finishedAt'] = time.time(); write(out / 'state.json', state)
    return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['evaluation', 'models', 'dependencies', 'source_repo', 'api_dependencies', 'out']: parser.add_argument('--' + name.replace('_', '-'), required=True, dest=name)
    parser.add_argument('--node-binary', dest='node_binary')
    parser.add_argument('--asset-root', action='append', required=True, dest='asset_roots')
    print(json.dumps(run(vars(parser.parse_args())), ensure_ascii=False))

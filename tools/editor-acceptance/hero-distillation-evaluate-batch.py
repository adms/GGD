"""One-shot post-training evaluation; no retries, repairs or release promotion.

Inference remains inside the existing exclusive, resource-protected supervisor.
This runner must not be launched until training has terminated successfully.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

SCRIPT = Path(__file__).resolve()
REPO = SCRIPT.parents[2]
FILES = [SCRIPT.name, 'hero-distillation-infer.py', 'hero-distillation-train.py',
         'hero-distillation-generation.py', 'hero-distillation-generation-compile.mts',
         'hero-distillation-adapter.mjs', 'hero-distillation-freeze.mjs',
         'hero-distillation-package-admission.mts', 'hero-distillation-results.py',
         'hero-distillation-report.py', 'hero-distillation-import-roundtrip.mts']


def read(file):
    return json.loads(Path(file).read_text())


def digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(file, value):
    temp = file.with_suffix(file.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(file)


def inference_module():
    spec = importlib.util.spec_from_file_location('batch_protected_inference', SCRIPT.with_name('hero-distillation-infer.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cpu_command(command, log, timeout=180):
    """Kill/join only this CPU subprocess group on timeout or interruption."""
    with log.open('x') as stream:
        child = subprocess.Popen(command, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=timeout)
            if code != 0:
                raise RuntimeError(f'CPU_STEP_EXIT:{code}; log={log}')
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=5)


def run(options, inference=None, execute_cpu=cpu_command):
    out = Path(options['out']).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    training, evaluation, models, assets, dependencies = [Path(options[k]).resolve()
        for k in ['training', 'evaluation', 'models', 'assets', 'dependencies']]
    roots = [Path(p).resolve(strict=True) for p in options['asset_roots']]
    assert roots and all(p.is_dir() for p in roots), 'ASSET_ROOTS_REQUIRED'
    assert all(p.is_dir() for p in [training, evaluation, models, assets, dependencies]), 'INPUT_DIRECTORY_MISSING'
    node = shutil.which('node')
    assert node, 'NODE_REQUIRED'
    inference = inference or inference_module()
    # No directory, subprocess, weights loading or GPU lock before this gate.
    training_manifest, adapter, keys = inference.final_checkpoint(training)
    api_dependencies = Path(options.get('api_dependencies') or dependencies.parents[2] / 'apps/content-api/node_modules').resolve()
    assert all((api_dependencies / name / 'package.json').is_file() for name in ['fastify', 'tsx']), 'API_DEPENDENCIES_MISSING'
    sources = {name: digest(SCRIPT.with_name(name)) for name in FILES}
    inputs = {str(p / 'manifest.json'): digest(p / 'manifest.json') for p in [training, evaluation, models, assets]}
    teacher_reports = {key: Path(options[key]).resolve() for key in ['teacher_compile', 'teacher_package', 'teacher_import'] if options.get(key)}
    for directory in teacher_reports.values():
        inputs[str(directory / 'report.json')] = digest(directory / 'report.json')
    if 'teacher_import' in teacher_reports:
        file = teacher_reports['teacher_import'] / 'runtime-audit.json'
        inputs[str(file)] = digest(file)
    out.mkdir(parents=True)
    (out / 'source').mkdir()
    for name in FILES:
        shutil.copyfile(SCRIPT.with_name(name), out / 'source' / name)
    manifest = {'schema': 'ggd-distillation-evaluation-batch@1',
        'trainingDirectory': str(training), 'trainingManifestSha256': digest(training / 'manifest.json'),
        'evaluationDirectory': str(evaluation), 'evaluationManifestSha256': digest(evaluation / 'manifest.json'),
        'modelBindingsDirectory': str(models), 'modelBindingsManifestSha256': digest(models / 'manifest.json'),
        'frozenAssetsDirectory': str(assets), 'frozenAssetsManifestSha256': digest(assets / 'manifest.json'),
        'dependenciesDirectory': str(dependencies), 'apiDependenciesDirectory': str(api_dependencies), 'assetRoots': list(map(str, roots)),
        'cpuPhaseTimeoutSeconds': 180, 'importPhaseTimeoutSeconds': 180,
        'node': node, 'python': sys.executable, 'sources': sources, 'inputManifests': inputs,
        'fixedArmOrder': ['base', 'lora'], 'attemptsPerArm': 1, 'automaticRetry': False,
        'humanRepairs': 0, 'teacherAnswerFileAccess': False,
        'teacherControlReports': {key: str(value) for key, value in teacher_reports.items()},
        'scope': 'Full public internal-dev paired generation, structural/package admission and isolated HTTP import/runtime comparison. Not blind testing, semantic equivalence, platform publication or match certification.',
        'fullHeroE2EProven': False, 'modelPromoted': False}
    write(out / 'manifest.json', manifest)
    state = {'schema': 'ggd-distillation-evaluation-batch-state@1', 'status': 'running',
             'pid': os.getpid(), 'startedAt': time.time(), 'steps': [],
             'fullHeroE2EProven': False, 'modelPromoted': False}
    write(out / 'state.json', state)

    def step(name, action):
        for file, sha in inputs.items():
            assert digest(file) == sha, 'INPUT_MANIFEST_DRIFT:' + file
        for file, sha in sources.items():
            assert digest(SCRIPT.with_name(file)) == sha, 'RUNNER_DRIFT:' + file
            assert digest(out / 'source' / file) == sha, 'SNAPSHOT_DRIFT:' + file
        record = {'name': name, 'status': 'running', 'startedAt': time.time()}
        state['steps'].append(record)
        write(out / 'state.json', state)
        action()
        record.update(status='completed', finishedAt=time.time())
        write(out / 'state.json', state)

    previous = signal.getsignal(signal.SIGTERM)

    def interrupted(signum, frame):
        raise InterruptedError('BATCH_INTERRUPTED')

    signal.signal(signal.SIGTERM, interrupted)
    try:
        bundle = out / 'inference'
        step('prepare-inference', lambda: inference.prepare(training, evaluation, bundle))
        for arm in ['base', 'lora']:
            # This supervisor owns/joins its worker and enforces the same GPU
            # lock, battery floor, RAM/swap and time budget as direct CLI use.
            step('infer-' + arm, lambda arm=arm: inference.supervise(bundle, arm))
            arm_state = read(bundle / arm / 'state.json')
            assert arm_state['status'] == 'completed' and arm_state['workerPid'] is None, 'ARM_NOT_JOINED_SUCCESS'
        for arm in ['base', 'lora']:
            compiled, packaged = out / (arm + '-compile'), out / (arm + '-package-admission')
            command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-generation-compile.mts')),
                '--evaluation', str(evaluation), '--models', str(models), '--assets-dir', str(assets),
                '--source-repo', str(REPO), '--out', str(compiled), '--inference', str(bundle), '--arm', arm]
            step('compile-' + arm, lambda command=command, arm=arm: execute_cpu(command, out / ('compile-' + arm + '.log')))
            command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-package-admission.mts')),
                '--compiled', str(compiled), '--source-repo', str(REPO), '--out', str(packaged), '--dependencies', str(dependencies)]
            for root in roots:
                command.extend(['--asset-root', str(root)])
            step('package-admission-' + arm, lambda command=command, arm=arm: execute_cpu(command, out / ('package-' + arm + '.log')))
        summaries = {}
        for arm in ['base', 'lora']:
            summaries[arm] = {label: {'counts': read(out / f'{arm}-{label}' / 'report.json')['counts'],
                                     'reportSha256': digest(out / f'{arm}-{label}' / 'report.json')}
                              for label in ['compile', 'package-admission']}
            counts = read(bundle / 'manifest.json')['counts']
            assert summaries[arm]['compile']['counts']['allCases'] == counts['tasks'], 'COMPILE_CASES_MISSING'
            assert summaries[arm]['compile']['counts']['primaryWholeHeroes'] == counts['primaryWholeHeroes'], 'COMPILE_HERO_DENOMINATOR_DRIFT'
            assert summaries[arm]['package-admission']['counts']['wholeHeroes'] == counts['primaryWholeHeroes'], 'PACKAGE_HERO_DENOMINATOR_DRIFT'
        for arm in ['base', 'lora']:
            packaged, imported, audit = [out / (arm + '-' + suffix) for suffix in ['package-admission', 'import-roundtrip', 'import-runtime-audit']]
            command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')),
                '--admitted', str(packaged), '--source-repo', str(REPO), '--out', str(imported),
                '--dependencies', str(dependencies), '--api-dependencies', str(api_dependencies)]
            for root in roots:
                command.extend(['--asset-root', str(root)])
            # Same existing 180-second CPU-stage cap; no automatic extension.
            step('isolated-import-' + arm, lambda command=command, arm=arm: execute_cpu(command, out / ('import-' + arm + '.log')))
            command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')),
                '--admitted', str(packaged), '--verify-saved-runtime', str(imported), '--source-repo', str(REPO), '--out', str(audit)]
            step('verify-import-runtime-' + arm, lambda command=command, arm=arm: execute_cpu(command, out / ('runtime-' + arm + '.log')))
            for label in ['import-roundtrip', 'import-runtime-audit']:
                report = out / (arm + '-' + label) / 'report.json'
                summaries[arm][label] = {'counts': read(report)['counts'], 'reportSha256': digest(report)}
                assert summaries[arm][label]['counts']['wholeHeroes'] == counts['primaryWholeHeroes'], 'IMPORT_HERO_DENOMINATOR_DRIFT'
        command = [sys.executable, str(SCRIPT.with_name('hero-distillation-results.py')),
            '--training', str(training), '--evaluation', str(evaluation), '--paired', str(out),
            '--out', str(out / 'report-data.json')]
        for key, directory in teacher_reports.items():
            command.extend(['--' + key.replace('_', '-'), str(directory)])
        step('collect-results', lambda: execute_cpu(command, out / 'collect-results.log'))
        command = [sys.executable, str(SCRIPT.with_name('hero-distillation-report.py')),
            '--data', str(out / 'report-data.json'), '--out', str(out / 'report.html')]
        step('render-report', lambda: execute_cpu(command, out / 'render-report.log'))
        result = {'schema': 'ggd-distillation-evaluation-batch-result@1', 'arms': summaries,
                  'reportDataSha256': digest(out / 'report-data.json'), 'reportHtmlSha256': digest(out / 'report.html'),
                  'blindTest': False, 'semanticFidelityMeasured': False, 'liveImportMeasured': False,
                  'isolatedImportEvaluationsCompleted': True,
                  'fullHeroE2EProven': False, 'modelPromoted': False,
                  'note': 'Completed means the scheduled evaluations ran, not that outputs passed or the model is ready.'}
        write(out / 'result.json', result)
        state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
        if state['steps'] and state['steps'][-1]['status'] == 'running':
            state['steps'][-1].update(status='stopped-or-failed', finishedAt=time.time())
        raise
    finally:
        signal.signal(signal.SIGTERM, previous)
        state['finishedAt'] = time.time()
        write(out / 'state.json', state)
    return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['training', 'evaluation', 'models', 'assets', 'dependencies', 'out']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--asset-root', action='append', required=True, dest='asset_roots')
    parser.add_argument('--api-dependencies')
    parser.add_argument('--teacher-compile', default=str(REPO / 'docs/_reports/hero-finetune-research/hero74-generation-compile-control-v2'))
    parser.add_argument('--teacher-package', default=str(REPO / 'docs/_reports/hero-finetune-research/hero74-package-admission-control-v1'))
    parser.add_argument('--teacher-import', default=str(REPO / 'docs/_reports/hero-finetune-research/hero74-import-control-v3'))
    print(json.dumps(run(vars(parser.parse_args())), ensure_ascii=False))

"""Run blind teacher compile/package/import only after candidate sealing.

The model call is intentionally outside this CPU-only controller. It consumes a
validated teacher seal, creates a derived evaluation view, and runs the same
pinned control stages without exposing teacher answers to candidate inference.
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
FILES = [SCRIPT.name, 'hero-distillation-generation-compile.mts', 'hero-distillation-adapter.mjs',
         'hero-distillation-freeze.mjs', 'hero-distillation-package-admission.mts',
         'hero-distillation-import-roundtrip.mts']


def read(path): return json.loads(Path(path).read_text())
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    with Path(path).open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2); stream.write('\n')


def cpu_command(command, log, timeout=180):
    with log.open('x') as stream:
        child = subprocess.Popen(command, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=timeout)
            if code != 0: raise RuntimeError(f'CPU_STEP_EXIT:{code}; log={log}')
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)


def run(options, execute=cpu_command):
    out = Path(options['out']).resolve(); assert not out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    evaluation, seal, models, assets, dependencies, source_repo = [Path(options[key]).resolve()
        for key in ['evaluation', 'seal', 'models', 'assets', 'dependencies', 'source_repo']]
    roots = [Path(value).resolve(strict=True) for value in options['asset_roots']]
    api_dependencies = Path(options.get('api_dependencies') or dependencies.parents[2] / 'apps/content-api/node_modules').resolve()
    assert all(path.is_dir() for path in [evaluation, seal, models, assets, dependencies, source_repo]), 'INPUT_DIRECTORY_MISSING'
    assert roots and all(path.is_dir() for path in roots), 'ASSET_ROOTS_REQUIRED'
    assert all((api_dependencies / name / 'package.json').is_file() for name in ['fastify', 'tsx']), 'API_DEPENDENCIES_MISSING'
    node = shutil.which('node'); assert node, 'NODE_REQUIRED'
    em, plan, sm = read(evaluation / 'manifest.json'), read(evaluation / 'plan.json'), read(seal / 'manifest.json')
    assert plan.get('split') == 'blind-user-batch' and plan.get('blindTest') is True, 'NOT_BLIND_EVALUATION'
    assert sm['schema'] == 'ggd-distillation-blind-teacher-seal@1' and sm['blindTest'] is True, 'WRONG_TEACHER_SEAL'
    assert sm['evaluationManifestSha256'] == digest(evaluation / 'manifest.json'), 'TEACHER_SEAL_EVALUATION_DRIFT'
    assert sm['publicCasesSha256'] == digest(evaluation / 'public-cases.jsonl'), 'TEACHER_SEAL_PUBLIC_CASE_DRIFT'
    assert sm['outputs']['private-teachers.jsonl'] == digest(seal / 'private-teachers.jsonl'), 'TEACHER_SEAL_ANSWER_DRIFT'
    cases = [json.loads(line) for line in (evaluation / 'public-cases.jsonl').read_text().splitlines() if line]
    primary = sum(row['slot'] == 'HERO' for row in cases)
    assert len(cases) == plan['counts']['tasks'] and primary == plan['counts']['primaryWholeHeroes'], 'BLIND_CASE_COUNT_DRIFT'
    sources = {name: digest(SCRIPT.with_name(name)) for name in FILES}
    inputs = {str(path): digest(path) for path in [evaluation / 'manifest.json', evaluation / 'plan.json',
        evaluation / 'public-cases.jsonl', seal / 'manifest.json', seal / 'private-teachers.jsonl',
        models / 'manifest.json', assets / 'manifest.json']}
    out.mkdir(parents=True); (out / 'source').mkdir(); derived = out / 'evaluation'; derived.mkdir()
    for name in FILES: shutil.copyfile(SCRIPT.with_name(name), out / 'source' / name)
    for name in ['plan.json', 'public-cases.jsonl']:
        shutil.copyfile(evaluation / name, derived / name)
    shutil.copyfile(seal / 'private-teachers.jsonl', derived / 'private-teachers.jsonl')
    derived_manifest = {'schema': 'ggd-distillation-evaluation-inputs@1',
        'sourceManifestSha256': plan['sourceManifestSha256'], 'blindTest': True, 'split': 'blind-user-batch',
        'originalEvaluationManifestSha256': digest(evaluation / 'manifest.json'),
        'teacherSealManifestSha256': digest(seal / 'manifest.json'),
        'outputs': {name: digest(derived / name) for name in ['plan.json', 'public-cases.jsonl', 'private-teachers.jsonl']},
        'scope': 'Derived read-only teacher-control view created after blind candidate outputs were sealed.'}
    write(derived / 'manifest.json', derived_manifest)
    manifest = {'schema': 'ggd-distillation-blind-teacher-control@1', 'blindTest': True,
        'originalEvaluationManifestSha256': digest(evaluation / 'manifest.json'),
        'derivedEvaluationManifestSha256': digest(derived / 'manifest.json'),
        'teacherSealManifestSha256': digest(seal / 'manifest.json'), 'sources': sources, 'inputs': inputs,
        'cpuPhaseTimeoutSeconds': 180, 'importPhaseTimeoutSeconds': 180, 'automaticRetry': False,
        'humanRepairs': 0, 'modelInferenceCalls': 0, 'modelPromoted': False, 'fullHeroE2EProven': False,
        'scope': 'Post-candidate teacher compile/package/isolated-import/runtime control only; not semantic or match certification.'}
    write(out / 'manifest.json', manifest)
    state = {'schema': 'ggd-distillation-blind-teacher-control-state@1', 'status': 'running',
        'pid': os.getpid(), 'startedAt': time.time(), 'steps': [], 'modelPromoted': False, 'fullHeroE2EProven': False}
    write(out / 'state.json', state)

    def atomic_state():
        temp = out / 'state.json.tmp'; temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n'); temp.replace(out / 'state.json')

    def step(name, command, log):
        for path, sha in inputs.items(): assert digest(path) == sha, 'INPUT_DRIFT:' + path
        for file, sha in sources.items():
            assert digest(SCRIPT.with_name(file)) == sha and digest(out / 'source' / file) == sha, 'SOURCE_DRIFT:' + file
        record = {'name': name, 'status': 'running', 'startedAt': time.time()}; state['steps'].append(record); atomic_state()
        execute(command, out / log); record.update(status='completed', finishedAt=time.time()); atomic_state()

    try:
        compile_dir, package_dir, import_dir, audit_dir = [out / name for name in ['compile', 'package-admission', 'import-roundtrip', 'import-runtime-audit']]
        step('compile-teacher', [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-generation-compile.mts')),
            '--evaluation', str(derived), '--models', str(models), '--assets-dir', str(assets),
            '--source-repo', str(source_repo), '--out', str(compile_dir), '--teacher-control'], 'compile.log')
        compile_report = read(compile_dir / 'report.json')
        assert compile_report['evaluationManifestSha256'] == digest(derived / 'manifest.json'), 'COMPILE_DERIVED_EVALUATION_DRIFT'
        assert compile_report['counts']['allCases'] == len(cases) and compile_report['counts']['primaryWholeHeroes'] == primary, 'COMPILE_DENOMINATOR_DRIFT'
        command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-package-admission.mts')),
            '--compiled', str(compile_dir), '--source-repo', str(source_repo), '--out', str(package_dir), '--dependencies', str(dependencies)]
        for root in roots: command.extend(['--asset-root', str(root)])
        step('package-admission-teacher', command, 'package.log')
        assert read(package_dir / 'report.json')['counts']['wholeHeroes'] == primary, 'PACKAGE_DENOMINATOR_DRIFT'
        command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')),
            '--admitted', str(package_dir), '--source-repo', str(source_repo), '--out', str(import_dir),
            '--dependencies', str(dependencies), '--api-dependencies', str(api_dependencies)]
        for root in roots: command.extend(['--asset-root', str(root)])
        step('isolated-import-teacher', command, 'import.log')
        command = [node, '--import', 'tsx', str(SCRIPT.with_name('hero-distillation-import-roundtrip.mts')),
            '--admitted', str(package_dir), '--verify-saved-runtime', str(import_dir), '--source-repo', str(source_repo), '--out', str(audit_dir)]
        step('verify-import-runtime-teacher', command, 'runtime.log')
        for directory in [import_dir, audit_dir]:
            assert read(directory / 'report.json')['counts']['wholeHeroes'] == primary, 'IMPORT_DENOMINATOR_DRIFT'
        result = {'schema': 'ggd-distillation-blind-teacher-control-result@1', 'blindTest': True,
            'counts': {'tasks': len(cases), 'primaryWholeHeroes': primary},
            'outputs': {str(path.relative_to(out)): digest(path) for path in [compile_dir / 'report.json',
                package_dir / 'report.json', import_dir / 'report.json', audit_dir / 'report.json']},
            'modelInferenceCalls': 0, 'humanRepairs': 0, 'modelPromoted': False, 'fullHeroE2EProven': False,
            'note': 'Completed control stages are evidence, not a semantic/gameplay pass.'}
        write(out / 'result.json', result); state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
        if state['steps'] and state['steps'][-1]['status'] == 'running': state['steps'][-1].update(status='stopped-or-failed', finishedAt=time.time())
        raise
    finally:
        state['finishedAt'] = time.time(); atomic_state()
    return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['evaluation', 'seal', 'models', 'assets', 'dependencies', 'source-repo', 'out']:
        parser.add_argument('--' + name, required=True, dest=name.replace('-', '_'))
    parser.add_argument('--asset-root', action='append', required=True, dest='asset_roots')
    parser.add_argument('--api-dependencies')
    print(json.dumps(run(vars(parser.parse_args())), ensure_ascii=False))

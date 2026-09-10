"""Run one immutable bounded-action evaluation workflow after terminal training.

The worker-facing model calls remain in ``hero-distillation-action-evaluate``.
This controller only removes manual handoffs: prepare the public cases, run
base then LoRA under their existing resource guard, then run the CPU-only
materialize/package/import/readback chain.  It never retries, repairs,
promotes a model, or treats the seen internal regression as generalization.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time


SCRIPT = Path(__file__).resolve()
EVALUATE = SCRIPT.with_name('hero-distillation-action-evaluate.py')
E2E = SCRIPT.with_name('hero-distillation-action-e2e.py')
REPORT = SCRIPT.with_name('hero-distillation-action-report.py')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def command(argv, log):
    """One foreground step; each child retains its own limits and guards."""
    with Path(log).open('x') as stream:
        completed = subprocess.run(argv, stdout=stream, stderr=subprocess.STDOUT,
                                   check=False, cwd=SCRIPT.parents[2])
    if completed.returncode:
        raise RuntimeError(f'WORKFLOW_STEP_EXIT:{completed.returncode}; log={log}')


def node_binary(value=None):
    """Preflight an explicit, executable Node before any model work starts."""
    candidate = Path(value).resolve() if value else Path(shutil.which('node') or '/usr/local/bin/node').resolve()
    assert candidate.is_file() and candidate.stat().st_mode & 0o111, 'NODE_REQUIRED:' + str(candidate)
    return str(candidate)


def checked_directory(value, label):
    path = Path(value).resolve()
    assert path.is_dir(), f'{label}_DIRECTORY_MISSING'
    return path


def run(options, execute=command):
    training = checked_directory(options['training'], 'TRAINING')
    dataset = checked_directory(options['dataset'], 'DATASET')
    models = checked_directory(options['models'], 'MODELS')
    dependencies = checked_directory(options['dependencies'], 'DEPENDENCIES')
    api_dependencies = checked_directory(options['api_dependencies'], 'API_DEPENDENCIES')
    source = checked_directory(options['source_repo'], 'SOURCE_REPO')
    roots = [checked_directory(value, 'ASSET_ROOT') for value in options['asset_roots']]
    node = node_binary(options.get('node_binary'))
    evaluation, e2e_out = Path(options['evaluation']).resolve(), Path(options['e2e_out']).resolve()
    assert not evaluation.exists() and not e2e_out.exists(), 'REFUSE_OVERWRITE_OR_RETRY'
    assert source == SCRIPT.parents[2].resolve(), 'SOURCE_REPO_MUST_BE_CURRENT_RESEARCH_CHECKOUT'

    root = e2e_out.parent
    workflow = root / (e2e_out.name + '-workflow')
    assert not workflow.exists(), 'WORKFLOW_RECEIPT_EXISTS'
    workflow.mkdir(parents=True)
    (workflow / 'source').mkdir()
    sources = {path.name: digest(path) for path in [SCRIPT, EVALUATE, E2E, REPORT]}
    for path in [SCRIPT, EVALUATE, E2E, REPORT]:
        shutil.copyfile(path, workflow / 'source' / path.name)
    manifest = {
        'schema': 'ggd-action-evaluation-workflow@1',
        'trainingDirectory': str(training), 'datasetDirectory': str(dataset),
        'evaluationDirectory': str(evaluation), 'e2eDirectory': str(e2e_out),
        'modelBindingsDirectory': str(models), 'dependenciesDirectory': str(dependencies),
        'apiDependenciesDirectory': str(api_dependencies), 'assetRoots': list(map(str, roots)),
        'nodeBinary': node,
        'fixedSteps': ['prepare', 'base', 'lora', 'compile-package-import-readback', 'render-evidence-report'],
        'automaticRetry': False, 'humanRepairsAllowed': False,
        'modelPromoted': False, 'fullHeroE2EProven': False,
        'note': 'Internal dev seen regression only; this workflow cannot establish unseen generalization or gameplay.',
        'sources': sources,
    }
    state = {'schema': 'ggd-action-evaluation-workflow-state@1', 'status': 'running',
             'startedAt': time.time(), 'steps': [], 'humanRepairs': 0}
    write(workflow / 'manifest.json', manifest)
    write(workflow / 'state.json', state)

    def step(name, argv):
        record = {'name': name, 'status': 'running', 'startedAt': time.time()}
        state['steps'].append(record); write(workflow / 'state.json', state)
        execute(argv, workflow / (name + '.log'))
        record.update(status='completed', finishedAt=time.time())
        write(workflow / 'state.json', state)

    try:
        step('prepare', [sys.executable, str(EVALUATE), 'prepare', '--training', str(training),
                         '--dataset', str(dataset), '--out', str(evaluation)])
        for arm in ['base', 'lora']:
            step(arm, [sys.executable, str(EVALUATE), 'run', '--run', str(evaluation), '--arm', arm])
        e2e_argv = [sys.executable, str(E2E), '--evaluation', str(evaluation), '--models', str(models),
                    '--dependencies', str(dependencies), '--api-dependencies', str(api_dependencies),
                    '--source-repo', str(source), '--out', str(e2e_out), '--node-binary', node]
        for root in roots:
            e2e_argv.extend(['--asset-root', str(root)])
        step('compile-package-import-readback', e2e_argv)
        report_out = root / (e2e_out.name + '-report.html')
        assert not report_out.exists(), 'REPORT_REFUSE_OVERWRITE'
        step('render-evidence-report', [sys.executable, str(REPORT), '--training', str(training),
                                        '--evaluation', str(evaluation), '--e2e', str(e2e_out),
                                        '--out', str(report_out)])
        state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
        if state['steps'] and state['steps'][-1]['status'] == 'running':
            state['steps'][-1].update(status='stopped-or-failed', finishedAt=time.time())
        raise
    finally:
        state['finishedAt'] = time.time(); write(workflow / 'state.json', state)
    return {'workflowDirectory': str(workflow), 'status': state['status'],
            'evaluationDirectory': str(evaluation), 'e2eDirectory': str(e2e_out),
            'reportPath': str(root / (e2e_out.name + '-report.html')),
            'modelPromoted': False, 'fullHeroE2EProven': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['training', 'dataset', 'evaluation', 'models', 'dependencies', 'api_dependencies',
                 'source_repo', 'e2e_out']:
        parser.add_argument('--' + name.replace('_', '-'), required=True, dest=name)
    parser.add_argument('--asset-root', action='append', required=True, dest='asset_roots')
    parser.add_argument('--node-binary', dest='node_binary')
    print(json.dumps(run(vars(parser.parse_args())), ensure_ascii=False))

"""Make the one permitted handoff from terminal LoRA training to evaluation.

This is deliberately a narrow supervisor, not another training controller.
It only waits for one existing training receipt to become terminal.  A
successful, round-trip-verified adapter starts the fixed workflow exactly
once; any other terminal state is recorded and fails closed.  It neither
retries training nor changes datasets, checkpoints, prompts, or GPU limits.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time


SCRIPT = Path(__file__).resolve()
WORKFLOW = SCRIPT.with_name('hero-distillation-action-workflow.py')
SPEC = importlib.util.spec_from_file_location('handoff_evaluation', SCRIPT.with_name('hero-distillation-action-evaluate.py'))
evaluation = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(evaluation)


def write(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def read(path):
    return json.loads(Path(path).read_text())


def live(pid):
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def terminal_training(run):
    state_path = Path(run) / 'train' / 'state.json'
    assert state_path.is_file(), 'TRAINING_STATE_MISSING'
    state = read(state_path)
    if state.get('status') not in ('starting', 'running', 'paused-charging'):
        return state
    worker = state.get('workerPid')
    supervisor = state.get('pid')
    assert (worker and live(worker)) or (supervisor and live(supervisor)), 'RUNNING_RECEIPT_WITHOUT_LIVE_PROCESS'
    return None


def workflow_argv(options):
    argv = [sys.executable, str(WORKFLOW)]
    for key in ['run', 'dataset', 'evaluation', 'models', 'dependencies', 'api_dependencies', 'source_repo', 'e2e_out']:
        name = 'training' if key == 'run' else key
        argv.extend(['--' + name.replace('_', '-'), str(Path(options[key]).resolve())])
    for root in options['asset_roots']:
        argv.extend(['--asset-root', str(Path(root).resolve())])
    if options.get('node_binary'):
        argv.extend(['--node-binary', options['node_binary']])
    return argv


def run(options, execute=subprocess.run, sleeper=time.sleep):
    output = Path(options['out']).resolve()
    assert not output.exists(), 'HANDOFF_REFUSE_OVERWRITE_OR_RETRY'
    assert 10 <= options['poll_seconds'] <= 300, 'POLL_SECONDS_OUT_OF_RANGE'
    output.mkdir(parents=True)
    state = {'schema': 'ggd-action-handoff@1', 'status': 'waiting', 'startedAt': time.time(),
             'trainingDirectory': str(Path(options['run']).resolve()), 'automaticRetry': False,
             'humanRepairsAllowed': False, 'pollSeconds': options['poll_seconds']}
    write(output / 'state.json', state)
    try:
        training = terminal_training(options['run'])
        while training is None:
            sleeper(options['poll_seconds'])
            training = terminal_training(options['run'])
        state['trainingStatus'] = training.get('status')
        state['trainingFinishedAt'] = training.get('finishedAt')
        if training.get('status') != 'completed':
            state.update(status='stopped-or-failed', reason='TRAINING_NOT_COMPLETED')
            return state
        # The real trainer writes phase/steps/checkpoint, not result.status.
        # Reuse the actual evaluation gate, including final-epoch and byte hash checks.
        evaluation.final_checkpoint(options['run'])
        argv = workflow_argv(options)
        state.update(status='running-evaluation', workflowCommand=argv, evaluationStartedAt=time.time())
        write(output / 'state.json', state)
        with (output / 'workflow.log').open('x') as log:
            completed = execute(argv, stdout=log, stderr=subprocess.STDOUT, check=False, cwd=SCRIPT.parents[2])
        if completed.returncode:
            raise RuntimeError('WORKFLOW_EXIT:' + str(completed.returncode))
        state['status'] = 'completed'
    except BaseException as error:
        state.update(status='stopped-or-failed', error=repr(error))
        raise
    finally:
        state['finishedAt'] = time.time()
        write(output / 'state.json', state)
    return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['run', 'dataset', 'evaluation', 'models', 'dependencies', 'api_dependencies', 'source_repo', 'e2e_out', 'out']:
        parser.add_argument('--' + name.replace('_', '-'), required=True, dest=name)
    parser.add_argument('--asset-root', action='append', required=True, dest='asset_roots')
    parser.add_argument('--node-binary', dest='node_binary')
    parser.add_argument('--poll-seconds', type=int, default=120, dest='poll_seconds')
    print(json.dumps(run(vars(parser.parse_args())), ensure_ascii=False))

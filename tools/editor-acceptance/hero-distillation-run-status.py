#!/usr/bin/env python3
"""Read a distillation trainer's authoritative progress without changing it.

The trainer shuffles its training rows, so an action ID's position in the
source JSONL is *not* a progress counter.  ``worker-progress.json.step`` is
the only live training progress value exposed by the trainer.
"""

import argparse
import json
from pathlib import Path


def read(path: Path):
    return json.loads(path.read_text())


def jsonl_count(path: Path):
    with path.open() as stream:
        return sum(1 for line in stream if line.strip())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def summarize(run: Path, train_jsonl: Path):
    """Return a side-effect-free, monotonic training progress receipt."""
    run = run.resolve()
    train = run / 'train'
    state = read(train / 'state.json')
    require(state.get('status') in {'running', 'completed', 'failed', 'stopped'}, 'INVALID_TRAIN_STATE')
    total = jsonl_count(train_jsonl)
    require(total > 0, 'EMPTY_TRAIN_JSONL')
    progress_path = train / 'worker-progress.json'
    progress = read(progress_path) if progress_path.exists() else {}
    phase = progress.get('phase')
    step = progress.get('step')
    if phase == 'training':
        require(type(step) is int and 1 <= step <= total, 'INVALID_LIVE_TRAIN_STEP')
        completed = step
    elif state.get('status') == 'completed':
        completed = total
    else:
        completed = 0
    return {
        'schema': 'ggd-hero-distillation-run-status@1',
        'run': str(run),
        'status': state['status'],
        'phase': phase,
        'completedSteps': completed,
        'totalSteps': total,
        'fraction': completed / total,
        'source': 'worker-progress.step' if phase == 'training' else 'terminal-state-or-not-yet-training',
        'error': state.get('error'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path)
    parser.add_argument('--train-jsonl', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(summarize(args.run, args.train_jsonl), ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()

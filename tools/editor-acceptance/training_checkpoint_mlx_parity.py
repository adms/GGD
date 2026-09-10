"""Small real-MLX test: continuous Adam versus fresh-process resumed Adam.

Loads no base model. Uses at most a few small tensors and exits after 12 steps.
"""
import argparse
import importlib.metadata
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import training_runtime_checkpoint as checkpoint

CONTRACT = {'test': 'adam-rng-process-resume@1', 'steps': 12, 'learningRate': .002}


def segment(root, start, stop, resume):
    import mlx.core as mx
    import mlx.optimizers as optim
    mx.random.seed(917); random.seed(917)
    weights = {'w': mx.array([.25, -.4, .7])}
    optimizer = optim.Adam(learning_rate=.002); optimizer.init(weights)
    trace = []
    order = list(range(12)); random.Random(456).shuffle(order)
    if resume:
        data = checkpoint.load(json.loads(resume.read_text()), CONTRACT, load_tensors=mx.load)
        weights = data['weights']; optimizer.state = data['optimizer']
        checkpoint.restore_mlx_random(mx, data['mlxRandom']); random.setstate(data['pythonRandom'])
        trace = data['trace']
        assert data['nextStep'] == start and data['order'] == order
    for step in range(start, stop):
        noise = mx.random.normal((3,))
        scale = random.random()
        grads = {'w': weights['w'] * (order[step] + 1) + noise * scale}
        weights = optimizer.apply_gradients(grads, weights)
        mx.eval(weights, optimizer.state, mx.random.state)
        trace.append(weights['w'].tolist())
    payload = {'weights': weights, 'optimizer': optimizer.state, 'mlxRandom': checkpoint.capture_mlx_random(mx),
               'pythonRandom': random.getstate(), 'order': order, 'nextStep': stop, 'trace': trace}
    return checkpoint.save(root, CONTRACT, payload, is_tensor=lambda v: isinstance(v, mx.array), save_tensors=mx.save_safetensors)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--segment', action='store_true'); p.add_argument('--root', type=Path)
    p.add_argument('--start', type=int, default=0); p.add_argument('--stop', type=int, default=12)
    p.add_argument('--resume', type=Path); p.add_argument('--receipt', type=Path)
    p.add_argument('--report', type=Path, help='Write the bounded parity verification receipt')
    args = p.parse_args()
    if args.segment:
        args.receipt.write_text(json.dumps(segment(args.root, args.start, args.stop, args.resume))); return
    with tempfile.TemporaryDirectory(prefix='mlx-resume-parity-') as tmp:
        root = Path(tmp)
        def run(name, start, stop, resume=None):
            receipt = root / (name + '.json')
            cmd = [sys.executable, __file__, '--segment', '--root', str(root / name),
                   '--start', str(start), '--stop', str(stop), '--receipt', str(receipt)]
            if resume: cmd += ['--resume', str(resume)]
            subprocess.run(cmd, check=True, timeout=60)
            return receipt
        continuous = run('continuous', 0, 12)
        first = run('first', 0, 4)
        second = run('second', 4, 8, first)
        resumed = run('resumed', 8, 12, second)
        import mlx.core as mx
        left = checkpoint.load(json.loads(continuous.read_text()), CONTRACT, load_tensors=mx.load)
        right = checkpoint.load(json.loads(resumed.read_text()), CONTRACT, load_tensors=mx.load)
        from mlx.utils import tree_flatten
        def compare(a, b):
            aa, bb = dict(tree_flatten(a)), dict(tree_flatten(b))
            assert aa.keys() == bb.keys()
            for k in aa:
                if isinstance(aa[k], mx.array): assert mx.array_equal(aa[k], bb[k]).item(), k
                else: assert aa[k] == bb[k], k
        compare(left, right)
        report = {'passed': True, 'steps': 12, 'freshProcesses': 4,
                          'resumes': 2, 'weightsOptimizerRngTraceEqual': True,
                          'mlxVersion': importlib.metadata.version('mlx'),
                          'checkpointHelperSha256': checkpoint.sha(Path(checkpoint.__file__)),
                          'testSha256': checkpoint.sha(Path(__file__)),
                          'scope': 'small MLX Adam; not full Gemma training parity'}
        if args.report:
            with args.report.open('x') as stream: json.dump(report, stream, indent=2)
        print(json.dumps(report))

if __name__ == '__main__': main()

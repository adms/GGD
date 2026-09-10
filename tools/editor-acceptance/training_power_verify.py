"""Run power/checkpoint checks without loading the hero model. MLX is opt-in."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SUITES = ['training_power_governor.test.py', 'training_runtime_checkpoint.test.py',
          'hero-distillation-power.test.py', 'hero-distillation-train.test.py',
          'hero-distillation-run-status.test.py']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mlx', action='store_true', help='Also run bounded real-GPU process-resume parity')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    checks = []
    for name in SUITES + (['training_checkpoint_mlx_parity.py'] if args.mlx else []):
        result = subprocess.run([sys.executable, str(HERE/name)], text=True, capture_output=True, timeout=90)
        evidence = result.stdout + result.stderr
        count = re.search(r'Ran (\d+) tests?', evidence)
        passed = result.returncode == 0 and (int(count[1]) > 0 if name in SUITES and count else name not in SUITES)
        if name not in SUITES and passed:
            passed = json.loads(result.stdout)['passed'] is True
        checks.append({'script': name, 'passed': passed, 'testCount': int(count[1]) if count else None,
                       'exitCode': result.returncode, 'output': evidence})
    report = {'passed': all(c['passed'] for c in checks), 'checks': checks,
              'sourceSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in
                  [HERE/name for name in SUITES] + [HERE/'hero-distillation-train.py', HERE/'training_power_governor.py',
                   HERE/'training_runtime_checkpoint.py', HERE/'hero-distillation-run-status.py']},
              'scope': 'CPU policy/supervision plus optional small MLX parity; full Gemma resume pending'}
    if args.report:
        with args.report.open('x') as f: json.dump(report, f, indent=2)
    print(json.dumps({'passed': report['passed'], 'checks': [{k:v for k,v in c.items() if k != 'output'} for c in checks]}))
    if not report['passed']:
        for c in checks:
            if not c['passed']: print(c['output'], file=sys.stderr)
        raise SystemExit(1)

if __name__ == '__main__': main()

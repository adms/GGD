"""CPU-only integrity/resource receipt before any local Metal worker starts."""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import sys
import time
from pathlib import Path
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODEL = Path('/private/tmp/ggd-mid-models-20260907/gemma-4-12B-it-8bit')
LOCK = Path('/private/tmp/ggd-forge-training-runtime/gpu.lock')
GIB = 1024 ** 3


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def resources():
    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()  # Missing access is a failed check, never assumed safe.
    battery = psutil.sensors_battery()
    return {'sampledAt': time.time(), 'availableBytes': memory.available,
            'totalBytes': memory.total, 'swapUsedBytes': swap.used,
            'acPower': battery is not None and battery.power_plugged,
            'batteryPercent': battery.percent if battery is not None else None,
            'gpuLockPresent': LOCK.exists()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'REFUSE_OVERWRITE'
    original = ROOT / 'outputs/mid-model-comparison-20260907/12b-download.json'
    receipt = json.loads(original.read_text())
    assert receipt['status'] == 'verified'
    assert receipt['revision'] == '200bb6db075e137a4deb08838865ac4ddb86292e'
    assert receipt['repo'] == 'mlx-community/gemma-4-12B-it-8bit'
    assert Path(receipt['destination']) == MODEL
    files = []
    start = time.time()
    before = resources()
    for entry in receipt['files']:
        assert Path(entry['name']).name == entry['name'], 'UNSAFE_MODEL_FILENAME'
        target = MODEL / entry['name']
        assert target.stat().st_size == entry['bytes'], 'MODEL_SIZE_CHANGED'
        actual = digest(target)
        if entry['sha256']:
            assert actual == entry['sha256'], f'MODEL_HASH_CHANGED:{entry["name"]}'
        files.append({'name': entry['name'], 'bytes': target.stat().st_size, 'sha256': actual,
                      'matchesPriorHash': True if entry['sha256'] else None})
    after = resources()
    minimum = receipt['expectedBytes'] + 12 * GIB
    checks = {'acPower': after['acPower'], 'memoryHeadroom': after['availableBytes'] >= minimum,
              'noSharedGpuLock': not after['gpuLockPresent'],
              'hashingSwapStable': after['swapUsedBytes'] - before['swapUsedBytes'] <= 2 * GIB}
    result = {'schema': 'ggd-hero12b-gpu-preflight@1', 'createdAt': time.time(),
              'cpuOnly': True, 'gpuWorkerStarted': False, 'modelDirectory': str(MODEL),
              'modelRevision': receipt['revision'], 'files': files,
              'priorReceiptSha256': digest(original), 'scriptSha256': digest(Path(__file__)),
              'python': sys.executable,
              'versions': {k: metadata.version(k) for k in ['mlx', 'mlx-vlm', 'transformers', 'psutil']},
              'before': before, 'after': after, 'checks': checks,
              'minimumAvailableBytes': minimum, 'seconds': time.time() - start,
              'readyForBoundedInferenceAtThisInstant': all(checks.values()),
              'trainingCompatibilityVerified': False,
              'limits': ['Fresh runtime checks and exclusive lock are still required at worker launch.',
                         'No assertion that unrelated applications use zero GPU.',
                         'Small files without prior hashes are newly pinned, not upstream-identity proof.']}
    with args.output.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

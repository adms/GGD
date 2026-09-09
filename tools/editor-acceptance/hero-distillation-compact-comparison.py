"""Build a deterministic compact-interface comparison from frozen evidence."""
import argparse
import hashlib
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve()


def digest(path):
    hasher = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def reduction(before, after):
    assert before > 0 and 0 <= after <= before
    return round((before - after) / before * 100, 2)


def build(earlier, final, probe_receipt, out):
    earlier, final, probe_receipt, out = map(lambda value: Path(value).resolve(),
                                             [earlier, final, probe_receipt, out])
    assert not out.exists(), 'REFUSE_OVERWRITE'
    manifests = [read(root / 'manifest.json') for root in [earlier, final]]
    profiles = [read(root / 'token-profile.json') for root in [earlier, final]]
    projections = [read(root / 'projection-report.json') for root in [earlier, final]]
    ownership = read(final / 'ownership-report.json')
    probe_manifest = read(probe_receipt / 'manifest.json')
    probe = read(probe_receipt / 'probe/result.json')
    receipt = read(probe_receipt / 'receipt.json')
    assert manifests[0]['sourceDatasetManifestSha256'] == manifests[1]['sourceDatasetManifestSha256']
    assert manifests[1]['sourceExamples'] == 518 and manifests[1]['semanticRoundtripPassed'] == 518
    assert all(value == 0 for value in ownership['checks'].values()), 'OWNERSHIP_LEAK'
    assert receipt['phases']['probe']['optimizerStepsRecorded'] == 0
    assert probe_manifest['frozenManifestSha256'] == digest(final / 'manifest.json')
    before_input = projections[0]['characters']['selectInputTotal'] + projections[0]['characters']['configureInputTotal']
    after_input = projections[1]['characters']['selectInputTotal'] + projections[1]['characters']['configureInputTotal']
    before_output = projections[0]['characters']['selectOutputTotal'] + projections[0]['characters']['configureOutputTotal']
    after_output = projections[1]['characters']['selectOutputTotal'] + projections[1]['characters']['configureOutputTotal']
    report = {
        'schema': 'ggd-compact-architecture-comparison@1',
        'inputs': {
            'earlierManifestSha256': digest(earlier / 'manifest.json'),
            'finalManifestSha256': digest(final / 'manifest.json'),
            'probeReceiptSha256': digest(probe_receipt / 'receipt.json'),
        },
        'sameTeacherSource': True,
        'counts': manifests[1]['counts'],
        'semanticRoundtrip': {'passed': 518, 'total': 518},
        'compactEvolution': {
            'inputCharacters': {'earlier': before_input, 'final': after_input,
                                'reductionPercent': reduction(before_input, after_input)},
            'outputCharacters': {'earlier': before_output, 'final': after_output,
                                 'reductionPercent': reduction(before_output, after_output)},
            'selectionTotalTokens': {
                'earlierP50': profiles[0]['groups']['train:select']['totalTokens']['p50'],
                'finalP50': profiles[1]['groups']['train:select']['totalTokens']['p50'],
                'earlierP95': profiles[0]['groups']['train:select']['totalTokens']['p95'],
                'finalP95': profiles[1]['groups']['train:select']['totalTokens']['p95'],
            },
            'configureTotalTokens': {
                'earlierP50': profiles[0]['groups']['train:configure']['totalTokens']['p50'],
                'finalP50': profiles[1]['groups']['train:configure']['totalTokens']['p50'],
                'earlierP95': profiles[0]['groups']['train:configure']['totalTokens']['p95'],
                'finalP95': profiles[1]['groups']['train:configure']['totalTokens']['p95'],
            },
        },
        'ownership': ownership,
        'gpuProbe': {
            'optimizerSteps': probe['optimizerSteps'],
            'wallSeconds': receipt['phases']['probe']['wallSeconds'],
            'estimatedUpperEpochSeconds': probe['estimatedUpperEpochSeconds'],
            'fitsDefault7200Seconds': probe['fitsTimeBudget'],
            'maxPeakMetalBytes': max(row['peakMetalBytes'] for row in probe['probes']),
            'maxSequenceTokens': max(row['totalTokens'] for row in probe['probes']),
            'probes': probe['probes'],
        },
        'claims': {
            'trainingQualityProven': False,
            'fullHeroE2EProven': False,
            'modelPromoted': False,
        },
        'scriptSha256': digest(SCRIPT),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--earlier', type=Path, required=True)
    parser.add_argument('--final', type=Path, required=True)
    parser.add_argument('--probe-receipt', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = build(args.earlier, args.final, args.probe_receipt, args.out)
    print(json.dumps({'compactEvolution': result['compactEvolution'],
                      'gpuProbe': result['gpuProbe']}, ensure_ascii=False))

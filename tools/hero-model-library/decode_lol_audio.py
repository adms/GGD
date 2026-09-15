#!/usr/bin/env python3
"""Decode frozen LoL extraction packages; append per-package results separately."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path

from decode_wwise_intake import decode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('intake', type=Path)
    parser.add_argument('--decoder', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=2, choices=range(1, 5))
    args = parser.parse_args()
    root = args.intake.resolve()
    batch = json.loads((root / 'batch-progress.json').read_text())
    if batch['completeWads'] != batch['expectedWads'] or batch['errors']:
        raise ValueError('Require complete extraction without parse errors')
    priorities = {'Warwick.zh_TW': 0, 'Warwick': 1, 'Lux.zh_TW': 2,
                  'Karthus.zh_TW': 3, 'Yasuo.zh_TW': 4, 'MissFortune.zh_TW': 5,
                  'LeeSin.zh_TW': 6, 'Xerath.zh_TW': 7}
    receipts = sorted((root / rel for rel in batch['receipts']),
                      key=lambda p: (priorities.get(p.parent.name, 8), p.parent.name))
    decoder = args.decoder.resolve()

    def run(receipt):
        native_id = receipt.parent.name
        source = receipt.parent / 'media'
        output = root / 'decoded' / native_id
        report_path = output / 'decoding.json'
        if report_path.exists():
            report = json.loads(report_path.read_text())
        elif not source.is_dir():
            return dict(nativeId=native_id, decodedCount=0, failedCount=0, status='no-embedded-media')
        else:
            report = decode(source, output, decoder)
            # The decoder itself writes its full report; this small receipt is
            # added only after every input in this package has a result.
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        return dict(nativeId=native_id, reportPath=report_path.relative_to(root).as_posix(),
                    decodedCount=report['decodedCount'], failedCount=report['failedCount'],
                    status='decoded-pending-listening-review')

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in as_completed([pool.submit(run, p) for p in receipts]):
            result = future.result()
            results.append(result)
            temp = root / 'decode-progress.tmp'
            temp.write_text(json.dumps(dict(schema='ggd-lol-decoding-progress@1',
                                           completePackages=len(results), expectedPackages=len(receipts),
                                           results=results), ensure_ascii=False, indent=2) + '\n')
            temp.replace(root / 'decode-progress.json')
            print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

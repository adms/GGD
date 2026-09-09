"""Archive two-case cache experiments without copying model output text."""
import argparse
import hashlib
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve()


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def arm(directory):
    directory = Path(directory).resolve()
    cases = [read(directory / f'case-{index:04d}.json') for index in range(2)]
    for index, row in enumerate(cases):
        assert row['rawSha256'] == hashlib.sha256(row['raw'].encode()).hexdigest(), f'RAW_DRIFT:{index}'
    return {'directory': str(directory), 'manifestSha256': digest(directory.parent / 'manifest.json'),
            'caseFileSha256': {f'case-{i:04d}.json': digest(directory / f'case-{i:04d}.json') for i in range(2)},
            'ids': [row['id'] for row in cases], 'totalSeconds': sum(row['seconds'] for row in cases),
            'rows': [{key: row.get(key) for key in ['id', 'seconds', 'promptTokens', 'cachedPromptTokens',
                'promptTokensPerSecond', 'generationTokens', 'generationTokensPerSecond', 'rawSha256',
                'complete', 'outputFormatMatches', 'peakMetalBytes']} for row in cases]}


def report(reference, post_turn, exact_apc, public_cases, out):
    out = Path(out).resolve()
    assert not out.exists(), 'REFUSE_OVERWRITE'
    runs = {name: arm(value) for name, value in [('coldReference', reference),
                                                  ('postTurnCache', post_turn), ('exactApc', exact_apc)]}
    ids = runs['coldReference']['ids']
    assert all(run['ids'] == ids for run in runs.values()), 'CASE_ID_MISMATCH'
    reference_rows = runs['coldReference']['rows']
    for name in ['postTurnCache', 'exactApc']:
        runs[name]['rawParity'] = [row['rawSha256'] == reference_rows[index]['rawSha256']
                                   for index, row in enumerate(runs[name]['rows'])]
    public_rows = [json.loads(line) for line in Path(public_cases).read_text().splitlines() if line]
    assert [row['id'] for row in public_rows[:2]] == ids, 'PUBLIC_CASE_MISMATCH'
    user = json.loads(public_rows[0]['messages'][1]['content'])
    chars = {'system': len(public_rows[0]['messages'][0]['content']),
             'user': len(public_rows[0]['messages'][1]['content'])}
    chars.update({key: len(json.dumps(user[key], ensure_ascii=False, separators=(',', ':')))
                  for key in ['allowedCatalog', 'assets', 'request', 'outputContract']})
    result = {'schema': 'ggd-prefix-cache-probe-report@1', 'scriptSha256': digest(SCRIPT),
              'publicCasesSha256': digest(public_cases), 'caseIds': ids, 'promptCharacters': chars,
              'runs': runs, 'conclusion': {
                  'postTurnCacheAdopted': False,
                  'postTurnReason': 'Gemma 4 sliding-attention cache could not roll back across the generated suffix; zero cached prompt tokens.',
                  'exactApcAdopted': False,
                  'exactApcReason': 'The second case reused an exact prefix, but both raw outputs differed from the cold reference; strict arithmetic/output parity failed.',
                  'architectureDecision': 'Replace the full-catalog/full-native-output interface with compact semantic selection plus per-slot configuration and deterministic materialization.'}}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--post-turn', type=Path, required=True)
    parser.add_argument('--exact-apc', type=Path, required=True)
    parser.add_argument('--public-cases', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    value = report(args.reference, args.post_turn, args.exact_apc, args.public_cases, args.out)
    print(json.dumps(value['conclusion'], ensure_ascii=False))

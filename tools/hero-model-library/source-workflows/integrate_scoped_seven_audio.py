"""Integrate the pinned exact-seven LOL delivery; never acquire another roster."""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[3]
BASE = REPO / 'materials/hero-model-library'
SOURCE_ID = 'lol-project-seven-ja-jp-16.18.8159717'
BUCKET = 'ggd-390630837668-ap-east-2-an'
DELIVERY_SHA256 = '9e6d357f2f284777cf45c2483ab02d76bcf08dadacbb626e67c1fd67f8222eda'
SCOPED_MANIFEST_SHA256 = 'a1854f39b1a3346456c3b33a223f27ba413be999640f4201af7f021ac8f6c9f2'
COUNTS = {'Karthus.ja_JP': 225, 'LeeSin.ja_JP': 1069, 'Lux.ja_JP': 1142,
          'MissFortune.ja_JP': 695, 'Warwick.ja_JP': 531, 'Xerath.ja_JP': 223, 'Yasuo.ja_JP': 1042}


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(value):
    if (not isinstance(value, str) or value.startswith('/') or '\\' in value or '\0' in value
            or ':' in value.split('/')[0] or any(p in {'', '.', '..'} for p in value.split('/'))):
        raise ValueError('Unsafe relative source/member path')
    return value


def file_map(rows):
    saved = {}
    for row in rows:
        name = relative(row['path'])
        if name in saved or type(row['bytes']) is not int or row['bytes'] < 0 or not re.fullmatch(r'[a-f0-9]{64}', row['sha256']):
            raise ValueError('Duplicate or invalid frozen file row')
        saved[name] = (row['bytes'], row['sha256'])
    return saved


def validate_groups(source):
    groups = source['audioGroups']
    if len(groups) != 7 or len({g['id'] for g in groups}) != 7 or Counter(g['nativeId'] for g in groups) != Counter(COUNTS.keys()):
        raise ValueError('Exact seven unique source groups required')
    for group in groups:
        native = group['nativeId']; key = native.split('.')[0].lower()
        if (group['pcmWavCount'] != COUNTS[native] or group['id'] != f'lol-{key}-ja-jp-16-18-8159717'
                or group['pathPrefixes'] != [f'audio/decoded/{native}/wav/']
                or len(group['heroIds']) != 2 or set(group['heroIds']) != {f'example:{key}', f'lol-{key}'}):
            raise ValueError('Seven group identity, scope or count changed')


def validate_proposals(source, archive, workspace):
    if source['id'] != SOURCE_ID or archive['id'] != SOURCE_ID:
        raise ValueError('Unexpected scoped source')
    validate_groups(source)
    spec = source['audioFileIndex']; root = (workspace / relative(source['localPath'])).resolve()
    report_path = (root / relative(spec['reportPath'])).resolve()
    if not root.is_relative_to(workspace.resolve()) or not report_path.is_relative_to(root):
        raise ValueError('Source or report escapes workspace')
    if spec['reportSha256'] != DELIVERY_SHA256 or sha(report_path) != DELIVERY_SHA256:
        raise ValueError('Changed pinned seven delivery')
    report = read(report_path)
    if report['sourceId'] != SOURCE_ID or report.get('deliveryFrozen') is not True:
        raise ValueError('Delivery source or frozen identity mismatch')
    if Counter(p['nativeId'] for p in report['packages']) != Counter(COUNTS.keys()):
        raise ValueError('Delivery package roster is not exact seven')
    if Counter(r['nativeId'] for r in report['files']) != Counter(COUNTS):
        raise ValueError('Actual delivery audio counts differ from exact seven')
    for row in report['files']:
        if not row['path'].startswith(f"audio/decoded/{row['nativeId']}/wav/"):
            raise ValueError('Audio row native identity/path mismatch')
    audio = file_map(report['files']); expected = file_map(report['allFiles'])
    if any(expected.get(path) != value for path, value in audio.items()):
        raise ValueError('Delivery audio is not in frozen allFiles')
    report_member = relative(spec['reportPath'])
    if report_member in expected:
        raise ValueError('Subset report unexpectedly appears in original allFiles')
    expected[report_member] = (report_path.stat().st_size, DELIVERY_SHA256)
    if file_map(archive['files']) != expected or archive['fileCount'] != len(expected):
        raise ValueError('Archive must equal exact allFiles plus pinned subset report')
    manifest_path = Path(source['backupStatus']['manifestAbsolutePath']).resolve()
    if not manifest_path.is_relative_to(workspace.resolve()) or source['backupStatus']['manifestSha256'] != SCOPED_MANIFEST_SHA256 or sha(manifest_path) != SCOPED_MANIFEST_SHA256:
        raise ValueError('Changed pinned scoped manifest')
    frozen = read(manifest_path)
    if frozen['sourceId'] != SOURCE_ID or file_map(frozen['files']) != expected:
        raise ValueError('Scoped manifest source or contents changed')
    digest = archive['sha256']
    if not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Invalid archive SHA')
    uri = f's3://{BUCKET}/legacy/public-model-sources/{SOURCE_ID}/{digest}.tar.gz'
    for key, value in {'sha256': digest, 'bytes': archive['bytes'], 'fileCount': len(expected),
            'archiveFormat': 'tar-gzip', 'archiveMemberRoot': '', 'plannedS3Uri': uri}.items():
        if archive.get(key) != value or frozen.get(key) != value:
            raise ValueError('Archive identity, format or authorized URI mismatch')
    for key in ('sha256', 'bytes', 'plannedS3Uri', 'archiveFormat', 'archiveMemberRoot'):
        if source['pendingBackup'].get(key) != archive[key]:
            raise ValueError('Source pending backup identity mismatch')
    if Path(frozen['absoluteLocalArchive']).resolve() != (workspace / relative(archive['localArchive'])).resolve():
        raise ValueError('Local archive relationship mismatch')
    return report, frozen, manifest_path


def validate_receipt(receipt, archive, frozen, manifest_path):
    expected = {'id': SOURCE_ID, 'sha256': archive['sha256'], 'bytes': archive['bytes'],
        'fileCount': archive['fileCount'], 's3Uri': archive['plannedS3Uri'],
        'manifestUri': archive['plannedS3Uri'].removesuffix('.tar.gz') + '.files.json',
        'manifestSha256': SCOPED_MANIFEST_SHA256, 'profile': 'vibe-coding', 'region': 'ap-east-2',
        'archiveFormat': 'tar-gzip', 'archiveMemberRoot': ''}
    if any(receipt.get(key) != value for key, value in expected.items()):
        raise ValueError('Receipt identity, manifest, URI or AWS scope mismatch')
    if any(receipt.get(key) is not True for key in ('readbackVerified', 'fullGetVerified', 'allArchiveMembersSha256Verified', 'localPreserved')):
        raise ValueError('Receipt lacks explicit full readback flags')
    if Path(receipt['localManifest']).resolve() != manifest_path or sha(manifest_path) != receipt['manifestSha256'] or Path(receipt['localArchive']).resolve() != Path(frozen['absoluteLocalArchive']).resolve():
        raise ValueError('Receipt does not refer to the pinned local archive/manifest')


def fill_missing(existing, proposed):
    """Keep other workflows' annotations and enriched fields; fill only absent data."""
    result = deepcopy(existing)
    for key, value in proposed.items():
        if key not in result:
            result[key] = deepcopy(value)
        elif isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = fill_missing(result[key], value)
    return result


def verify_existing_record(record, archive):
    if any(record.get(k) != archive.get(k) for k in ('id', 'sha256', 'bytes', 'fileCount', 'archiveFormat', 'archiveMemberRoot')) or file_map(record['files']) != file_map(archive['files']):
        raise ValueError('Different archive record already exists')
    uri = archive.get('s3Uri', archive.get('plannedS3Uri'))
    if record.get('s3Uri', record.get('plannedS3Uri')) != uri:
        raise ValueError('Existing archive URI changed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proposals', type=Path, required=True)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    source = read(args.proposals / 'lol-seven-source-entry-proposal.json')
    rows = read(args.proposals / 'public-source-files-pending-uploads-proposal.json')['pendingUploads']
    if len(rows) != 1:
        raise ValueError('Exactly one pending scoped archive required')
    archive = rows[0]
    report, frozen, manifest_path = validate_proposals(source, archive, REPO.parent)
    paths = [BASE / 'download-sources.json', BASE / 'public-source-files.json']
    initial = [path.read_bytes() for path in paths]
    downloads, index = [json.loads(blob) for blob in initial]
    existing = [s for s in downloads['publicSources'] if s['id'] == SOURCE_ID]
    if existing:
        if len(existing) != 1 or any(existing[0].get(k) != source[k] for k in ('audioFileIndex', 'localPath')):
            raise ValueError('A different source revision already exists')
        validate_groups(existing[0])
        for key in ('backup', 'pendingBackup'):
            if existing[0].get(key) and existing[0][key].get('sha256') != archive['sha256']:
                raise ValueError('Existing source refers to a different archive revision')
        if existing[0].get('pendingBackup') and any(existing[0]['pendingBackup'].get(k) != archive[k] for k in ('bytes', 'plannedS3Uri', 'archiveFormat', 'archiveMemberRoot')):
            raise ValueError('Existing pending backup identity changed')
        source = fill_missing(existing[0], source)
    pending = [r for r in index['pendingUploads'] if (r['id'], r['sha256']) == (SOURCE_ID, archive['sha256'])]
    if len(pending) > 1:
        raise ValueError('Duplicate pending source archive')
    if pending:
        verify_existing_record(pending[0], archive)
        archive = fill_missing(pending[0], archive)
    if args.receipt:
        receipt = read(args.receipt)
        validate_receipt(receipt, archive, frozen, manifest_path)
        source.pop('pendingBackup', None)
        source['backup'] = dict(source.get('backup', {}), **receipt)
        source['backup'].update(receiptPath=str(args.receipt.resolve()), receiptSha256=sha(args.receipt))
        source['publicationStatus'] = 's3-readback-verified'
        source['backupStatus'] = dict(source.get('backupStatus', {}), scopedS3ReadbackVerified=True, state='exact-seven-full-get-verified')
        archive['s3Uri'] = archive.pop('plannedS3Uri')
        archive.update(readbackVerified=True, s3ReadbackVerified=True, fullReadbackVerified=True,
                       readbackPath=receipt['localReadback'], receiptSha256=sha(args.receipt))
        collection = 'sources'
    else:
        if existing and existing[0].get('backup', {}).get('readbackVerified'):
            raise ValueError('Cannot downgrade an already verified backup')
        collection = 'pendingUploads'
    prior = [r for r in index[collection] if (r['id'], r['sha256']) == (SOURCE_ID, archive['sha256'])]
    if len(prior) > 1:
        raise ValueError('Duplicate existing source archive')
    if prior:
        verify_existing_record(prior[0], archive)
        replacement = fill_missing(prior[0], archive)
        for key in ('readbackVerified', 's3ReadbackVerified', 'fullReadbackVerified'):
            if key in archive:
                replacement[key] = archive[key]
        index[collection][index[collection].index(prior[0])] = replacement
    else:
        index[collection].append(archive)
    if args.receipt:
        index['pendingUploads'] = [r for r in index['pendingUploads']
                                  if (r['id'], r['sha256']) != (SOURCE_ID, archive['sha256'])]
    if existing:
        downloads['publicSources'][downloads['publicSources'].index(existing[0])] = source
    else:
        downloads['publicSources'].append(source)
    if any(path.read_bytes() != before for path, before in zip(paths, initial)):
        raise ValueError('Central source records changed during admission; retry from fresh inputs')
    for path, data in zip(paths, (downloads, index)):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(sourceId=SOURCE_ID, audioRelationships=len(report['files']), newAcquisition=False,
                         archiveFileCount=archive['fileCount'], s3Verified=bool(args.receipt))))


if __name__ == '__main__':
    main()

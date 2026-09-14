"""Register the frozen Dai/Vearn follow-up evidence and preserve Dai query aliases."""
import hashlib
import json
from pathlib import Path
import tarfile

REPO = Path(__file__).resolve().parents[3]
BASE = REPO / 'materials/hero-model-library'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def append_once(rows, entry):
    prior = [row for row in rows if row['id'] == entry['id']]
    if prior and prior != [entry]:
        raise ValueError('Different source version already registered: ' + entry['id'])
    if not prior:
        rows.append(entry)


def main():
    source_path = BASE / 'download-sources.json'
    archive_path = BASE / 'public-source-files.json'
    sources, archives = read(source_path), read(archive_path)
    group = next(group for source in sources['publicSources'] if source['id'] == 'parallel-ps-jumpforce-audio'
                 for group in source['audioGroups'] if group['id'] == 'JForce_Dai')
    if group['name'] not in {'Dai / 達伊', '小呆／達伊 / Dai'} or group['heroIds']:
        raise ValueError('Dai audio source mapping changed; inspect it before merging.')
    group['name'] = '小呆／達伊 / Dai'

    evidence = BASE / 'priority-evidence/dai-vearn-20260911/followup-02'
    entry = read(evidence / 'source-lead-entry.json')
    root, report_path = Path(entry['localRoot']), Path(entry['sourceReport'])
    if sha(report_path) != entry['sourceReportSha256']:
        raise ValueError('Changed follow-up research report')
    report = read(report_path)
    receipt_path = Path(entry['backup']['receiptPath'])
    if sha(receipt_path) != entry['backup']['receiptSha256']:
        raise ValueError('Changed follow-up research backup receipt')
    receipt = read(receipt_path)
    manifest_path = Path(receipt['backupInventoryPath'])
    if sha(manifest_path) != receipt['backupInventorySha256']:
        raise ValueError('Changed follow-up research inventory')
    manifest = read(manifest_path)
    archive, readback = Path(receipt['localArchive']), Path(receipt['fullGetPath'])
    if sha(archive) != receipt['sha256'] or sha(readback) != receipt['sha256']:
        raise ValueError('Research archive or saved remote readback changed')
    with tarfile.open(readback, 'r:gz') as tar:
        if sorted(m.name for m in tar if m.isfile()) != sorted(row['archiveMember'] for row in manifest['files']):
            raise ValueError('Research archive member list differs')
        for row in manifest['files']:
            payload = tar.extractfile(row['archiveMember']).read()
            if len(payload) != row['bytes'] or hashlib.sha256(payload).hexdigest() != row['sha256'] or sha(root / row['path']) != row['sha256']:
                raise ValueError('Changed research member: ' + row['path'])
    for hero_id in entry['heroIds']:
        hero = read(REPO / 'content/champions' / (hero_id + '.json'))
        expected = '巴恩' if hero_id == 'godie-ubal' else '小呆'
        if expected not in hero['name']:
            raise ValueError('Research target no longer matches hero identity: ' + hero_id)
    local_path = root.relative_to(REPO.parent).as_posix()
    routes = report['newSpecificSourceRoutes']
    entry.update(url=routes[0]['urls'][0], sourceRoutes=routes, localPath=local_path,
                 sourceWork='勇者鬥惡龍 達伊的大冒險／神龍之謎（Dragon Quest: The Adventure of Dai）',
                 sourceGame='Infinity Strash priority research; community sculpt leads separately identified',
                 platform='mixed-leads-not-acquired', downloadUrl=None, automaticEligible=False,
                 readiness='source-lead-only', resourceRole='model-source-lead', assetKinds=[],
                 format='研究 JSON 與來源證據；未取得模型素材包', accessStatus='research-only-paid-sculpt-not-acquired',
                 publicationStatus='s3-legacy-research-only-full-get-verified', purchaseDecision='no-purchase',
                 modelCount=0, audioCount=0, nativeAnimationCount=0, standaloneVfxCount=0, files=[], ownerEntryIds=[],
                 gitSourceReportPath=str((evidence / 'source-report.json').relative_to(REPO)),
                 gitBackupReceiptPath=str((evidence / 's3-backup-receipt.json').relative_to(REPO)),
                 notAliases=['Baran', '巴蘭', 'バラン'],
                 backendIntegration=dict(required=False, state='not-acquired', selectionVerified=False,
                                         note='僅研究線索；沒有模型素材，不登記可選模型。'))
    append_once(sources['publicSourceLeads'], entry)
    append_once(archives['sources'], dict(id=entry['id'], localPath=local_path,
        localArchive=str(archive), readbackPath=str(readback), s3Uri=receipt['s3Uri'],
        bytes=receipt['bytes'], sha256=receipt['sha256'], archiveFormat='tar-gzip',
        archiveMemberRoot=receipt['archiveMemberRoot'], files=manifest['files'],
        readbackVerified=True, fullReadbackVerified=True, resourceRole='research-evidence-backup',
        acquiredAssetPayloadCount=0, gitReceiptPath=entry['gitBackupReceiptPath']))
    for path, data in [(source_path, sources), (archive_path, archives)]:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('Dai alias and one research-only source/backup registered; acquired asset counts unchanged.')


if __name__ == '__main__':
    main()

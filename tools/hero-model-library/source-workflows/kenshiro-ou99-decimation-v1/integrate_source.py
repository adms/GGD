#!/usr/bin/env python3
"""Add the pinned Kenshiro source and approved derivative to the shared catalog."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
CATALOG = ROOT / 'materials/hero-model-library/workflow-model-options.json'

def read(path): return json.loads(path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def integrate(data):
    source = read(HERE / 'source.json')
    receipt = read(HERE / 'evidence/receipt.json')
    backup = read(HERE / 'evidence/stage-backup.json')
    if not (backup['fullGetVerified'] and backup['allMemberSha256Verified']):
        raise ValueError('Stage backup is not verified')
    champion = read(ROOT / 'content/champions' / (source['heroId'] + '.json'))
    versions = [v for v in champion['modelVersions'] if v['sourceModelKey'] == source['candidateModelKey']]
    if len(versions) != 1 or not receipt['registration']['runtimeDropdownRegistered']:
        raise ValueError('Kenshiro candidate registration missing')
    for kind, key, path_key, receipt_key in [('source', 'sourceModelKey', 'sourceModelDocument', 'source'), ('candidate', 'candidateModelKey', 'candidateModelDocument', 'candidate')]:
        document_path = ROOT / source[path_key]
        document = read(document_path)
        glb = ROOT / 'content' / document['glbPath']
        if sha(glb) != receipt[receipt_key]['sha256']:
            raise ValueError('Kenshiro GLB changed')
        row = dict(id=source['sourceId'] + (':standard-v1' if kind == 'candidate' else ''),
            modelKey=source[key], glbPath=document['glbPath'], sha256=sha(glb), bytes=glb.stat().st_size,
            documentSha256=sha(document_path), sourceCharacter=source['character'], sourceWork=source['work'],
            sourceAssetId=source['sourceUrl'], sourcePlatform=source['sourcePlatform'],
            clipMap=document['clipMap'], storage='git', gitPath='content/' + document['glbPath'],
            identityStatus='character-labelled-ou99-community-model', fullCharacterPackage=False,
            validation='model-intake-and-visual-comparison-passed' if kind == 'candidate' else 'retained-over-budget-source',
            limitations=['Warcraft III 社群模型，不是 JUMP FORCE 遊戲擷取版。', f"保留 {receipt['preservation']['nativeAnimations']} 段來源動作；正式部署尚未驗證。"],
            validationEvidence={'gitPath':str((HERE/'evidence/receipt.json').relative_to(ROOT)), 'sha256':sha(HERE/'evidence/receipt.json')},
            localAbsolutePath=str(glb), sourceId=source['sourceId'], automaticEligible=False,
            preparationBackup=dict(s3Uri=backup['s3Uri'], manifestUri=backup['manifestUri'],
                receiptGitPath=str((HERE/'evidence/stage-backup.json').relative_to(ROOT)),
                receiptSha256=sha(HERE/'evidence/stage-backup.json'), allMemberSha256Verified=True))
        data['models'] = [m for m in data['models'] if m['id'] != row['id']] + [row]
    option = dict(sourceId=source['sourceId']+':standard-v1', sourceModelKey=source['candidateModelKey'],
        label=f"拳四郎 OU99 社群本尊／{receipt['preservation']['nativeAnimations']} 來源動作／減面版", source=versions[0]['source'])
    own = next((h for h in data['heroes'] if h['id'] == source['heroId']), None)
    if own is None:
        own = dict(id=source['heroId'], runtimeHeroId=source['heroId'], name=source['character'], options=[], pending=[])
        data['heroes'].append(own)
    own['options'] = [o for o in own['options'] if o['sourceId'] != option['sourceId']] + [option]
    candidate = dict(candidateId=option['sourceId'], heroId=source['heroId'], runtimeHeroId=source['heroId'],
        modelKey=source['candidateModelKey'], identityStatus='character-labelled-ou99-community-model',
        sourceReference=source['sourceUrl'], gitPath=source['candidateGlb'], sha256=receipt['candidate']['sha256'])
    data['candidates'] = [c for c in data['candidates'] if c['candidateId'] != candidate['candidateId']] + [candidate]
    return data

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--check',action='store_true'); args=p.parse_args()
    expected=json.dumps(integrate(read(CATALOG)),ensure_ascii=False,indent=2)+'\n'
    if args.check:
        if CATALOG.read_text()!=expected: raise SystemExit('Kenshiro catalog is stale')
    else: CATALOG.write_text(expected)
    print('Kenshiro source and standardized candidate catalog verified')

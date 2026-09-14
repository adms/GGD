#!/usr/bin/env python3
"""Record the Mai ANP3 conversion rejection and register its acquired source.

This is deliberately an evidence/catalog operation.  It never writes a runtime
model document, a model option, a clip map, or the active model.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ROOT = WORKSPACE / 'GGD-Asset-Library/intake/public-models-20260911/mai-doa6-gtasa-motion-round23'
ENTRY = ROOT / 'public-source-entry.json'
CONVERSION = ROOT / 'converted/mai-gtasa-anp3-retargeted-core-rotations.json'
PROOF = ROOT / 'converted/webgl-retarget-proof-v2'
VALIDATION = ROOT / 'retarget-validation.json'
SOURCES = REPO / 'materials/hero-model-library/download-sources.json'

def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()

def main() -> None:
    entry, conversion = json.loads(ENTRY.read_text()), json.loads(CONVERSION.read_text())
    run, proof = (json.loads((PROOF / name).read_text()) for name in ('run.json', 'proof.json'))
    contact = PROOF / 'contact-sheet.png'
    assert entry['id'] == 'mai-doa6-gtasa-gtav06-motion'
    assert conversion['validation'] == {'sourceShaVerified': True, 'all162Produced': True, 'allChannelsTargetSkinJoints': True, 'structuralReadback': True}
    assert conversion['output']['sha256'] == run['sourceSha256']
    assert run['complete'] and run['proofExists'] and not run['errorExists'] and run['images'] == 36
    assert proof['expectedRetargetedClipCount'] == 162 and len(proof['shots']) == 36 and all(shot['finite'] for shot in proof['shots'])
    assert contact.is_file()
    validation = {
        'schema': 'ggd.mai-anp3-retarget-validation@1',
        'sourceId': entry['id'],
        'outcome': 'rejected-visual',
        'runtimeRegistrationAllowed': False,
        'backendSelectionAllowed': False,
        'eventBindingAllowed': False,
        'reason': 'Six distributed ANP3 clips sampled at start, midpoint and endpoint rendered as horizontally inverted or severely contorted poses on the target Mai bind pose. The data is structurally valid but its coordinate/local-rotation convention is not established for this target skeleton.',
        'conversion': {'path': str(CONVERSION.resolve()), 'sha256': sha(CONVERSION), 'candidateGlbPath': conversion['output']['path'], 'candidateGlbSha256': conversion['output']['sha256'], 'candidateGlbBytes': conversion['output']['bytes'], 'clipCount': conversion['output']['animationCount'], 'mappedTracks': conversion['mapping']['mappedTracks'], 'droppedSourceTracks': conversion['mapping']['droppedSourceTracks'], 'translationTracksDropped': True},
        'structuralReadback': conversion['validation'],
        'webgl': {'runPath': str((PROOF / 'run.json').resolve()), 'runSha256': sha(PROOF / 'run.json'), 'proofPath': str((PROOF / 'proof.json').resolve()), 'proofSha256': sha(PROOF / 'proof.json'), 'contactSheetPath': str(contact.resolve()), 'contactSheetSha256': sha(contact), 'renderer': 'Babylon.js ' + proof['babylonVersion'], 'sampledAnimationIndexes': proof['sampledAnimationIndexes'], 'samples': len(proof['shots']), 'allFiniteVertices': True, 'meshCount': proof['meshCount'], 'skinBones': proof['bones']},
        'nextRequiredWork': ['Establish the GTA SA ANP3 quaternion component/order and local-space convention against a compatible reference skeleton.', 'Derive a documented bind-pose correction and rerun structural and visual validation.', 'Only after a passing visual review, assign independently reviewed clips to gameplay states and run backend selection verification.'],
    }
    VALIDATION.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    limitations = [line for line in entry.get('limitations', []) if 'retargeting, animation GLB, runtime acceptance, or visual check performed' not in line]
    limitations.extend([
        'A 162-clip core-rotation retarget candidate was structurally read back but rejected by visual WebGL review: sampled poses are horizontally inverted or severely contorted on the target bind pose.',
        'The rejected candidate, source analysis and rendering evidence remain preserved locally and must be archived as legacy material; it is not runtime-ready, selectable, or event-bound.',
    ])
    entry['readiness'] = 'retarget-rejected-visual'
    entry['publicationStatus'] = 'local-only-awaiting-s3-upload'
    entry['backendIntegration'] = {'required': True, 'state': 'retarget-rejected-visual', 'heroIds': entry['heroIds'], 'ownerEntryIds': entry.get('ownerEntryIds', []), 'release': None, 'selectionVerified': False}
    entry['limitations'] = limitations
    entry['retargetValidation'] = {'path': 'retarget-validation.json', 'sha256': sha(VALIDATION), 'outcome': validation['outcome'], 'runtimeRegistrationAllowed': False}
    ENTRY.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + '\n')
    catalog = json.loads(SOURCES.read_text())
    central = copy.deepcopy(entry)
    central['localPath'] = ROOT.relative_to(WORKSPACE).as_posix()
    central.setdefault('purchaseDecision', 'hold-purchase-review-free-source')
    central.setdefault('reuseTerms', '來源作者、版本與公開下載頁已保存；公開下載不等於跨遊戲轉換或再散布授權。')
    central.setdefault('usage', 'intake-only; rejected animation candidate has no automatic runtime selection')
    matches = [row for row in catalog.get('publicSources', []) if row.get('id') == entry['id']]
    if matches:
        if len(matches) != 1: raise ValueError('duplicate central source ID')
        index = catalog['publicSources'].index(matches[0]); catalog['publicSources'][index] = central
    else:
        catalog.setdefault('publicSources', []).append(central)
    SOURCES.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'sourceId': entry['id'], 'validation': str(VALIDATION), 'validationSha256': sha(VALIDATION), 'centralPath': str(SOURCES), 'runtimeRegistrationAllowed': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()

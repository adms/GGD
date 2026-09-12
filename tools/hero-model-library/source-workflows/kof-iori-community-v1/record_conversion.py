#!/usr/bin/env python3
"""Record the reproducible Iori Unity intake stage without promoting it to runtime."""
import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / 'GGD-Asset-Library'
SOURCE_ID = 'thunderstore-iori'
CONVERSION = ASSET_ROOT / 'conversions/iori-community-body-v1/native-glb'
SOURCE_BUNDLE = ASSET_ROOT / 'intake/public-models-20260910/thunderstore-iori/bundles/Iori.IoriKOF.bundle'
DOWNLOADS = ROOT / 'materials/hero-model-library/download-sources.json'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', type=Path, help='Fully verified legacy conversion-stage backup receipt')
    args = parser.parse_args()
    conversion = read_json(CONVERSION/'conversion.json')
    structural = read_json(CONVERSION/'structural-validation.json')
    output = CONVERSION/'body.glb'
    if conversion['source']['sha256'] != sha256(SOURCE_BUNDLE):
        raise ValueError('Source bundle SHA-256 differs from conversion record')
    if conversion['output']['sha256'] != sha256(output):
        raise ValueError('Output GLB SHA-256 differs from conversion record')
    if structural['sha256'] != sha256(output) or not structural['glb2'] or structural['externalDependencies']:
        raise ValueError('Structural validation does not prove a self-contained GLB')
    if not structural['allAccessorsFiniteAndWithinBuffers'] or not structural['jointAndWeightReferencesValidated']:
        raise ValueError('Structural validation did not pass')
    if structural['animations'] or conversion['sourceAnimationClips']:
        raise ValueError('This intake declaration assumes no native animation clips')
    if len(conversion['meshes']) != 2 or structural['triangles'] != 14704:
        raise ValueError('Unexpected Iori mesh topology')
    evidence = {
        'schema': 'ggd-iori-community-unity-intake@1',
        'source': {'id': SOURCE_ID, 'bundle': str(SOURCE_BUNDLE), 'sha256': sha256(SOURCE_BUNDLE)},
        'conversion': {'tool': 'tools/hero-model-library/convert_unity_prefab.py', 'unityPy': conversion['unityPy'],
                       'output': 'body.glb', 'sha256': sha256(output), 'bytes': output.stat().st_size,
                       'meshCount': structural['meshes'], 'skinCount': structural['skins'],
                       'jointCounts': structural['skinJointCounts'], 'triangles': structural['triangles'],
                       'materials': structural['materials'], 'textures': len(structural['embeddedImages']),
                       'maxVertexInfluences': structural['maxVertexInfluences'],
                       'sourceWeightSumMaxError': max(mesh['sourceWeightSumMaxError'] for mesh in conversion['meshes']),
                       'skinPositionMaxError': max(mesh['skinPositionMaxError'] for mesh in conversion['meshes'])},
        'nativeAssets': {'animationClips': 0, 'audio': 0, 'standaloneVfx': 0},
        'structuralValidation': {'path': 'structural-validation.json', 'sha256': sha256(CONVERSION/'structural-validation.json'),
                                 'passed': True},
        'visualReview': {'status': 'pending', 'reason': 'Blender bpy preview process exited 139 before loading the GLB; browser review could not start because the local Mac session was locked.',
                         'evidence': None},
        'runtime': {'runtimeReady': False, 'dropdownRegistered': False, 'defaultEligible': False,
                    'reason': 'Visual identity/material review and action integration remain incomplete.'},
    }
    evidence_path = CONVERSION/'pipeline-evidence.json'
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
    source_data = read_json(DOWNLOADS)
    sources = [source for source in source_data['publicSources'] if source['id'] == SOURCE_ID]
    if len(sources) != 1:
        raise ValueError('Expected exactly one Iori source record')
    source = sources[0]
    candidate = {
        'candidateId': 'thunderstore-iori-kof-static-skinned-v1',
        'character': '八神庵 / Iori Yagami',
        'heroIds': ['community-review-02-20260907'],
        'sourceId': SOURCE_ID,
        'sourceUrl': source['url'],
        'author': source['uploader'],
        'sourceClass': 'community-mod',
        'sourceGame': 'KOF-style Iori community MOD; original-game platform/version unverified',
        'sourcePlatform': 'Lethal Company Unity MOD',
        'sourceSkeleton': 'Source Unity Avatar; 100-joint skin order and bind matrices preserved',
        'model': str(output),
        'absolutePath': str(output),
        'bytes': output.stat().st_size,
        'sha256': sha256(output),
        'nativeModel': str(SOURCE_BUNDLE),
        'nativeModelSha256': sha256(SOURCE_BUNDLE),
        'nativeAnimationCount': 0,
        'proceduralAnimationCount': 0,
        'vfxCount': 0,
        'audioCount': 0,
        'meshCount': structural['meshes'],
        'skinCount': structural['skins'],
        'jointCount': 100,
        'vertices': sum(mesh['vertices'] for mesh in conversion['meshes']),
        'triangles': structural['triangles'],
        'drawPrimitives': conversion['drawPrimitives'],
        'textureCount': len(structural['embeddedImages']),
        'materialCount': structural['materials'],
        'maxVertexInfluences': structural['maxVertexInfluences'],
        'readyStage': 'glb-structural-validated-pending-visual-review',
        'runtimeReady': False,
        'backendSelectionVerified': False,
        'defaultChanged': False,
        'defaultEligible': False,
        'automaticEligible': False,
        'conversionEvidence': str(evidence_path),
        'conversionEvidenceSha256': sha256(evidence_path),
        'limitations': [
            'No native animation, audio or standalone VFX assets were present in the source bundle.',
            'Visual identity, shader fidelity and three-view preview are pending; no candidate is registered in the runtime dropdown.',
            'This is a community MOD source, not verified as a direct KOF game extraction or a licensed redistribution asset.',
            'No GGD action retargeting, gameplay test, default selection or deployment has been performed.',
        ],
    }
    if args.receipt:
        receipt = read_json(args.receipt)
        if (receipt.get('schema') != 'ggd-intake-backup-receipt@1'
                or not all(receipt.get(key) is True for key in ['fullGetVerified', 'allMemberSha256Verified', 'localUnchanged'])
                or Path(receipt.get('source', '')).resolve() != CONVERSION.resolve()):
            raise ValueError('Conversion backup receipt is incomplete or for another source')
        manifest = read_json(Path(receipt['manifest']))
        body = next((row for row in manifest['files'] if row['path'] == 'body.glb'), None)
        if body != {'path': 'body.glb', 'bytes': output.stat().st_size, 'sha256': sha256(output)}:
            raise ValueError('Verified conversion archive does not contain the current GLB')
        locator = {'s3Uri': receipt['s3Uri'], 's3ArchiveMember': 'body.glb',
                   's3Use': 'backup-only-not-runtime-entry',
                   'backupReceiptPath': str(args.receipt.resolve()), 'backupReceiptSha256': sha256(args.receipt)}
        candidate.update(locator, backupLocations=[locator])
    existing = [value for value in source.get('modelCandidates', []) if value.get('candidateId') == candidate['candidateId']]
    if existing and existing[0] != candidate:
        locator_keys = {'s3Uri', 's3ArchiveMember', 's3Use', 'backupReceiptPath', 'backupReceiptSha256', 'backupLocations'}
        prior_core = {key: value for key, value in existing[0].items() if key not in locator_keys}
        candidate_core = {key: value for key, value in candidate.items() if key not in locator_keys}
        if prior_core != candidate_core:
            raise ValueError('Existing Iori candidate differs; inspect before overwriting')
    source['modelCandidates'] = [value for value in source.get('modelCandidates', []) if value.get('candidateId') != candidate['candidateId']] + [candidate]
    source['assetKinds'] = ['model', 'skeleton', 'texture']
    source['resourceRole'] = 'character-model-collection'
    source['sourceGame'] = 'KOF-style Iori community MOD; original-game platform/version unverified'
    source['platform'] = 'Lethal Company Unity MOD'
    source['readiness'] = 'converted-structural-validation-pending-visual-review'
    source['verification'] = ('已將 IoriKOF bundle 的2個蒙皮網格轉為自包含GLB：26,795頂點、14,704三角面、2材質/2貼圖、2組各100骨節；'
                              '所有權重、關節引用、有限值及座標轉換檢查通過。原始AnimationClip=0，未取得音效/語音/VFX。'
                              '視覺驗收尚未完成，不能登錄後台下拉或自動預選。')
    source['backendIntegration'] = {'required': True, 'state': 'pending-visual-review-and-action-integration',
                                    'heroIds': ['community-review-02-20260907'], 'ownerEntryIds': [],
                                    'release': None, 'selectionVerified': False}
    DOWNLOADS.write_text(json.dumps(source_data, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'candidateId': candidate['candidateId'], 'evidence': str(evidence_path),
                      'evidenceSha256': sha256(evidence_path), 'readiness': source['readiness']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

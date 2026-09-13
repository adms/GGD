"""Compose the fixed Git resource entry point without rewriting immutable releases."""
import argparse, gzip, json, hashlib, subprocess
from pathlib import Path
from build_palworld_index import model_components
from weapon_components import source_weapon_components
from skinned_components import source_skinned_components
from historical_components import source_historical_artifacts, source_historical_components
from animated_components import source_animated_components
ROOT=Path(__file__).resolve().parents[2]
def read(path):
    payload = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    return json.loads(payload.decode('utf-8'))


def verify_git_contents(entries, repo=ROOT):
    """Require each catalogued Git path to exist in the index with its declared digest."""
    for entry in entries:
        path = entry['gitPath']
        result = subprocess.run(['git', 'show', ':' + path], cwd=repo, capture_output=True)
        if result.returncode:
            raise ValueError('Catalogued file is absent from the Git index: ' + path)
        if hashlib.sha256(result.stdout).hexdigest() != entry['sha256']:
            raise ValueError('Catalogued Git blob differs from the index: ' + path)
        if 'bytes' in entry and len(result.stdout) != entry['bytes']:
            raise ValueError('Catalogued Git blob byte count differs from the index: ' + path)


def verify_component_git_contents(components, repo=ROOT):
    """Check staged blobs, so ignored or unstaged local copies cannot be published."""
    try:
        verify_git_contents(components, repo)
    except ValueError as error:
        message = str(error)
        if message.startswith('Catalogued file is absent'):
            raise ValueError(message.replace('Catalogued file', 'Model component', 1)) from error
        if message.startswith('Catalogued Git blob'):
            raise ValueError(message.replace('Catalogued Git blob', 'Model component Git blob', 1)) from error
        raise


def component_git_evidence(components):
    """Return unique direct evidence blobs declared by model components.

    Component records keep their model GLB at the top level and supporting
    Git receipts in named dictionaries such as ``validationEvidence`` and
    ``visualEvidence``.  Verify those receipts separately so a local-only
    evidence file cannot make the generated catalog look portable.
    """
    evidence_by_path = {}
    for component in components:
        for value in component.values():
            if not isinstance(value, dict):
                continue
            path = value.get('gitPath')
            digest = value.get('sha256')
            if not isinstance(path, str) or not isinstance(digest, str):
                continue
            previous = evidence_by_path.get(path)
            if previous is not None:
                previous_bytes = previous.get('bytes')
                current_bytes = value.get('bytes')
                if previous['sha256'] != digest or (
                    previous_bytes is not None
                    and current_bytes is not None
                    and previous_bytes != current_bytes
                ):
                    raise ValueError('Conflicting component evidence declaration: ' + path)
                continue
            evidence_by_path[path] = value
    return list(evidence_by_path.values())


def apply_option_registration_overlay(components, receipt):
    """Join generated option receipts back onto their source components.

    Source acquisition records deliberately begin as non-selectable.  Once the
    checked registration generator emits a receipt, the central current index
    must expose that newer fact instead of repeating the pre-registration state.
    The immutable source record remains intact in download-sources.json.
    """
    by_id = {row['componentId']: row for row in receipt.get('registrations', [])}
    blocked = {row['componentId']: row for row in receipt.get('blocked', [])}
    for component in components:
        registration = by_id.get(component.get('id'))
        if registration:
            model_glb = registration['modelGlb']
            if (component.get('gitPath'), component.get('sha256'), component.get('bytes')) != (
                model_glb['gitPath'], model_glb['sha256'], model_glb['bytes']
            ):
                raise ValueError('Historical option/component GLB mismatch: ' + component['id'])
            component.update(
                runtimeSelectable=True,
                runtimeDropdownRegistered=True,
                heroIds=[registration['heroId']],
                relatedHeroIds=[registration['heroId']],
                runtimeModelKey=registration['modelKey'],
                modelDocumentGitPath=registration['modelDocument']['gitPath'],
                readiness='registered-non-default-feature-branch-option; production deployment unverified',
                registrationEvidence={
                    'receiptGitPath': 'materials/hero-model-library/priority-evidence/historical-model-recovery/model-option-registration.json',
                    'heroId': registration['heroId'],
                    'modelKey': registration['modelKey'],
                    'label': registration['label'],
                    'productionDeploymentVerified': registration['productionDeploymentVerified'],
                },
            )
        elif component.get('id') in blocked:
            component['registrationBlocker'] = blocked[component['id']]['reason']
    return components


def apply_hero_integration_overlay(components, receipt, receipt_git_path):
    """Expose verified Hero Forge integration on the matching current GLB."""
    by_glb = {
        (row['modelGlb']['gitPath'], row['modelGlb']['sha256'], row['modelGlb']['bytes']): row
        for row in receipt.get('integrations', [])
        if row.get('backendDropdownRegistered') is True
    }
    for component in components:
        row = by_glb.get((component.get('gitPath'), component.get('sha256'), component.get('bytes')))
        if not row:
            continue
        component.update(
            runtimeSelectable=True,
            runtimeDropdownRegistered=True,
            heroIds=[row['heroId']],
            relatedHeroIds=[row['heroId']],
            runtimeModelKey=row['defaultModelKey'],
            modelDocumentGitPath=row['modelDocument']['gitPath'],
            readiness='hero-forge-six-slot-package-and-dropdown-verified; production deployment unverified',
            registrationEvidence={
                'receiptGitPath': receipt_git_path,
                'heroId': row['heroId'],
                'modelKey': row['defaultModelKey'],
                'backendDropdownScope': row['backendDropdownScope'],
                'authoringState': row['authoringState'],
                'productionDeploymentVerified': row['productionDeploymentVerified'],
            },
        )
    return components


def build():
    base=ROOT/'materials/hero-model-library';sources=[];models={};registered={}
    windows_game_inventory_path=base/'source-inventories/windows-game-library.json.gz'
    windows_game_inventory=read(windows_game_inventory_path)
    ultimate14_motion_path=base/'source-inventories/ultimate14-native-motions.json'
    ultimate14_motion=read(ultimate14_motion_path)
    workflow_restoration_path=base/'priority-evidence/asset-workflow-restoration/manifest.json'
    workflow_restoration=read(workflow_restoration_path)
    popp_vfx_receipt_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/receipt.json'
    popp_vfx_receipt=read(popp_vfx_receipt_path)
    popp_vfx_export_backup_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/dependency-export-s3-backup-receipt.json'
    popp_vfx_export_backup=read(popp_vfx_export_backup_path)
    popp_vfx_staticmesh_receipt_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-receipt.json'
    popp_vfx_staticmesh_receipt=read(popp_vfx_staticmesh_receipt_path)
    popp_vfx_staticmesh_backup_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-s3-backup-receipt.json'
    popp_vfx_staticmesh_backup=read(popp_vfx_staticmesh_backup_path)
    popp_vfx_reconstruction_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-candidates.json'
    popp_vfx_reconstruction=read(popp_vfx_reconstruction_path)
    popp_vfx_reconstruction_receipt_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-candidates-receipt.json'
    popp_vfx_reconstruction_receipt=read(popp_vfx_reconstruction_receipt_path)
    if (popp_vfx_receipt.get('schema')!='ggd.infinity-strash-popp-vfx-events@1'
        or popp_vfx_receipt.get('summary',{}).get('vfxDependencySupportFilesExported',0)<=0
        or popp_vfx_receipt.get('summary',{}).get('vfxConverted')!=0):
        raise ValueError('Popp VFX dependency support receipt is absent, empty or overclaims conversion')
    if (popp_vfx_export_backup.get('schema')!='ggd-intake-backup-receipt@1'
        or not popp_vfx_export_backup.get('fullGetVerified')
        or not popp_vfx_export_backup.get('allMemberSha256Verified')):
        raise ValueError('Popp VFX dependency support S3 backup is not verified')
    if (popp_vfx_staticmesh_receipt.get('schema')!='ggd.infinity-strash-popp-vfx-staticmesh-recovery@1'
        or popp_vfx_staticmesh_receipt.get('summary',{}).get('packagesConverted')!=33
        or popp_vfx_staticmesh_receipt.get('summary',{}).get('packagesStillBlocked')!=0):
        raise ValueError('Popp VFX StaticMesh recovery receipt is not complete')
    if (popp_vfx_staticmesh_backup.get('schema')!='ggd-intake-backup-receipt@1'
        or not popp_vfx_staticmesh_backup.get('fullGetVerified')
        or not popp_vfx_staticmesh_backup.get('allMemberSha256Verified')):
        raise ValueError('Popp VFX StaticMesh recovery S3 backup is not verified')
    if (popp_vfx_reconstruction.get('schema')!='ggd.infinity-strash-popp-vfx-reconstruction-candidates@1'
        or popp_vfx_reconstruction.get('summary',{}).get('niagaraSystemCandidates')!=14
        or popp_vfx_reconstruction.get('summary',{}).get('ggdVfxBuilt')!=0
        or popp_vfx_reconstruction_receipt.get('states',{}).get('ggdVfxBuilt') is not False):
        raise ValueError('Popp VFX reconstruction candidates are absent or overclaim readiness')
    reviewPath=base/'post-registration-review.json'
    review=read(reviewPath) if reviewPath.exists() else {'affectedSources':[]}
    reviewByKey={key:item for item in review['affectedSources'] for key in item['modelKeys']}
    for p in (ROOT/'content/champions').glob('*.json'):
        if p.name.startswith('_'):continue
        c=read(p)
        for v in c.get('modelVersions',[]):registered.setdefault(v['sourceModelKey'],[]).append(c['id'])
    for name in ['manifest.json','workflow-model-options.json','priority-runtime-options.json']:
        path=base/name;data=read(path)
        sources.append(dict(gitPath=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        for m in data['models']:
            item=dict(m,registeredFor=sorted(set(registered.get(m['modelKey'],[]))))
            item['runtimeDropdownRegistered']=bool(item['registeredFor'])
            if m['modelKey'] in reviewByKey:item['pendingGeometryReview']=reviewByKey[m['modelKey']]
            item['gitPath']='content/'+m['glbPath']
            item['modelDocumentGitPath']='content/models/'+m['modelKey']+'.json'
            for rel,digest in [(item['gitPath'],m['sha256']),(item['modelDocumentGitPath'],m['documentSha256'])]:
                if hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()!=digest:raise ValueError('Changed resource: '+rel)
            models[m['id']]=item
    result=dict(schema='ggd-current-resource-index@1',immutableRelease='materials/asset-library/git-release.json',
        modelInventory='materials/hero-model-library/inventory.json',postRegistrationReview='materials/hero-model-library/post-registration-review.json',sourceManifests=sources,
        modelSourceCount=len(models),models=list(models.values()),
        voiceIndex='materials/hero-model-library/voice-index.json',
        modelDesignBacklog='materials/hero-model-library/已取得模型待設計英雄.json',
        modelDesignBacklogDocument='materials/hero-model-library/已取得模型待設計英雄.md',
        palworldResourceIndex='materials/hero-model-library/palworld/帕魯三角色素材索引.json',
        palworldResourceDocument='materials/hero-model-library/palworld/帕魯三角色素材索引.md',
        projectSevenJapaneseVoiceIndex='materials/hero-model-library/lol-project-seven/seven-voice-index.json',
        windowsGameSourceInventory=dict(
            gitPath=str(windows_game_inventory_path.relative_to(ROOT)),
            sha256=hashlib.sha256(windows_game_inventory_path.read_bytes()).hexdigest(),
            status=windows_game_inventory['statusSemantics']['current'],
            summary=windows_game_inventory['summary']),
        windowsGameSourceDocument='materials/hero-model-library/source-inventories/windows-game-library.md',
        ultimate14NativeMotionIndex=dict(
            gitPath=str(ultimate14_motion_path.relative_to(ROOT)),
            sha256=hashlib.sha256(ultimate14_motion_path.read_bytes()).hexdigest(),
            status='parsed-native-mod-motion-reserve-pending-conversion-and-skeleton-playback',
            summary=ultimate14_motion['summary']),
        assetWorkflowRestorationManifest=dict(
            gitPath=str(workflow_restoration_path.relative_to(ROOT)),
            sha256=hashlib.sha256(workflow_restoration_path.read_bytes()).hexdigest(),
            summary=workflow_restoration['summary']),
        poppVfxDependencySupport=dict(
            heroId='b2-popp',
            sourceId=popp_vfx_receipt['sourceId'],
            status='reconstruction-support-assets-exported; Niagara and GGD VFX conversion pending',
            receiptGitPath=str(popp_vfx_receipt_path.relative_to(ROOT)),
            receiptSha256=hashlib.sha256(popp_vfx_receipt_path.read_bytes()).hexdigest(),
            backupReceiptGitPath=str(popp_vfx_export_backup_path.relative_to(ROOT)),
            backupReceiptSha256=hashlib.sha256(popp_vfx_export_backup_path.read_bytes()).hexdigest(),
            staticMeshReceiptGitPath=str(popp_vfx_staticmesh_receipt_path.relative_to(ROOT)),
            staticMeshReceiptSha256=hashlib.sha256(popp_vfx_staticmesh_receipt_path.read_bytes()).hexdigest(),
            staticMeshBackupReceiptGitPath=str(popp_vfx_staticmesh_backup_path.relative_to(ROOT)),
            staticMeshBackupReceiptSha256=hashlib.sha256(popp_vfx_staticmesh_backup_path.read_bytes()).hexdigest(),
            reconstructionCandidatesGitPath=str(popp_vfx_reconstruction_path.relative_to(ROOT)),
            reconstructionCandidatesSha256=hashlib.sha256(popp_vfx_reconstruction_path.read_bytes()).hexdigest(),
            reconstructionReceiptGitPath=str(popp_vfx_reconstruction_receipt_path.relative_to(ROOT)),
            reconstructionReceiptSha256=hashlib.sha256(popp_vfx_reconstruction_receipt_path.read_bytes()).hexdigest(),
            reconstructionReviewGitPath='materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-review.html',
            localRoot=popp_vfx_export_backup['source'],
            s3Uri=popp_vfx_export_backup['s3Uri'],
            manifestUri=popp_vfx_export_backup['manifestUri'],
            summary=dict(
                packagesAttempted=popp_vfx_receipt['summary']['vfxDependencyPackagesAttempted'],
                packagesExported=popp_vfx_receipt['summary']['vfxDependencyPackagesExported'],
                filesExported=popp_vfx_receipt['summary']['vfxDependencySupportFilesExported'],
                bytesExported=popp_vfx_receipt['summary']['vfxDependencySupportBytesExported'],
                extensionCounts=popp_vfx_receipt['summary']['vfxDependencySupportExtensionCounts'],
                filesReadable=popp_vfx_receipt['summary']['vfxDependencySupportFilesReadable'],
                uniqueByteAssets=popp_vfx_receipt['summary']['vfxDependencySupportUniqueByteAssets'],
                duplicateOccurrences=popp_vfx_receipt['summary']['vfxDependencySupportDuplicateOccurrences'],
                semanticGroups=popp_vfx_receipt['summary']['vfxDependencySupportSemanticGroups'],
                staticMeshPackagesRecovered=popp_vfx_receipt['summary']['vfxStaticMeshPackagesRecovered'],
                staticMeshPackagesStillBlocked=popp_vfx_receipt['summary']['vfxStaticMeshPackagesStillBlocked'],
                staticMeshGlbFiles=popp_vfx_receipt['summary']['vfxStaticMeshGlbFiles'],
                staticMeshVertices=popp_vfx_receipt['summary']['vfxStaticMeshVertices'],
                staticMeshTriangles=popp_vfx_receipt['summary']['vfxStaticMeshTriangles'],
                niagaraSystemCandidates=popp_vfx_receipt['summary']['vfxNiagaraSystemCandidates'],
                supportRoots=popp_vfx_receipt['summary']['vfxSupportRoots'],
                candidateRecipes=popp_vfx_receipt['summary']['vfxCandidateRecipes'],
                ggdVfxConverted=0,
                runtimeBindingsCreated=popp_vfx_receipt['summary']['runtimeBindingsCreated']),
            fullGetVerified=True,
            allMemberSha256Verified=True,
            runtimeSelectable=False,
            productionDeploymentVerified=False),
        note='Immutable releases, new canonical models and all source alternatives remain available. Registration is separate from production deployment; raw/intermediate sources remain local and S3 legacy.')
    component_path=base/'palworld/帕魯三角色素材索引.json'
    component_data=read(component_path)
    for pin in component_data['inputs']:
        if hashlib.sha256((ROOT/pin['gitPath']).read_bytes()).hexdigest()!=pin['sha256']:
            raise ValueError('Refresh Palworld component index: '+pin['gitPath'])
    components=model_components(component_data,ROOT)
    palworld_hero_receipt_path=base/'priority-evidence/palworld-hero-integration/receipt.json'
    palworld_hero_receipt=read(palworld_hero_receipt_path)
    if palworld_hero_receipt.get('status')!='ggd-authoring-packages-verified-model-options-policy-eligible-source-av-review-pending-production-unverified':
        raise ValueError('Palworld hero integration receipt is not current')
    apply_hero_integration_overlay(
        components,
        palworld_hero_receipt,
        str(palworld_hero_receipt_path.relative_to(ROOT)),
    )
    component_source_path=base/'download-sources.json'
    component_sources=read(component_source_path)
    fateubw_source=next(source for source in component_sources['publicSources'] if source['id']=='github-flemmli97-fateubw-07e9d79b')
    fateubw_native_path=base/'priority-evidence/fateubw-community/native-motion-completion-v2.json'
    fateubw_native_backup_path=base/'priority-evidence/fateubw-community/native-motion-completion-v2-s3-backup.json'
    fateubw_derivative_path=base/'priority-evidence/fateubw-community/static-pose-derivatives-v1/evidence-receipt.json'
    fateubw_derivative_backup_path=base/'priority-evidence/fateubw-community/static-pose-derivatives-v1/s3-backup-receipt.json'
    fateubw_derivative=fateubw_source.get('durationlessDerivativeCompletion',{})
    fateubw_native_backup=read(fateubw_native_backup_path)
    if (not fateubw_native_backup.get('fullGetVerified')
        or not fateubw_native_backup.get('allMemberSha256Verified')
        or not fateubw_native_backup.get('localUnchanged')):
        raise ValueError('FateUBW native completion backup is not fully verified')
    if (fateubw_derivative.get('counts') != {'candidates': 5, 'staticPoseHolds': 3, 'proceduralFormulaLoops': 2, 'nativeDurationClips': 0}
        or fateubw_derivative.get('nativeDurationClaim') is not False
        or fateubw_derivative.get('runtimeReady') is not False):
        raise ValueError('FateUBW durationless derivative reserve is absent or overclaims readiness')
    result.update(fateubwMotionReserve=dict(
        sourceId=fateubw_source['id'],
        nativeMotionCompletion=dict(
            gitPath=str(fateubw_native_path.relative_to(ROOT)),
            sha256=hashlib.sha256(fateubw_native_path.read_bytes()).hexdigest(),
            backupReceiptGitPath=str(fateubw_native_backup_path.relative_to(ROOT)),
            backupReceiptSha256=hashlib.sha256(fateubw_native_backup_path.read_bytes()).hexdigest(),
            s3Uri=fateubw_native_backup['s3Uri'],
            manifestUri=fateubw_native_backup['manifestUri'],
            archiveSha256=fateubw_native_backup['archiveSha256'],
            archiveBytes=fateubw_native_backup['archiveBytes'],
            fileCount=fateubw_native_backup['fileCount'],
            fullGetVerified=True,
            allMemberSha256Verified=True,
            convertedNativeClips=127,
            retainedNoDurationSourcePoses=5),
        durationlessDerivativeCompletion=dict(gitPath=str(fateubw_derivative_path.relative_to(ROOT)),sha256=hashlib.sha256(fateubw_derivative_path.read_bytes()).hexdigest(),backupReceiptGitPath=str(fateubw_derivative_backup_path.relative_to(ROOT)),backupReceiptSha256=hashlib.sha256(fateubw_derivative_backup_path.read_bytes()).hexdigest(),s3Uri=fateubw_derivative['s3Uri'],counts=fateubw_derivative['counts'],nativeDurationClaim=False,runtimeSelectable=False,productionDeploymentVerified=False)))
    ultimate14_source=next(source for source in component_sources['publicSources'] if source['id']=='parallel-ns-ultimate14')
    if ultimate14_source['nativeMotionIndex']['sha256'] != hashlib.sha256(ultimate14_motion_path.read_bytes()).hexdigest():
        raise ValueError('Refresh Ultimate14 native motion index relationship')
    components.extend(source_weapon_components(component_sources,ROOT))
    components.extend(source_skinned_components(component_sources,ROOT))
    components.extend(source_animated_components(component_sources,ROOT))
    components.extend(source_historical_components(component_sources,ROOT))
    historical_artifacts=source_historical_artifacts(component_sources,ROOT)
    restoration_receipt_path=base/'priority-evidence/historical-model-recovery/restoration-receipt.json'
    historical_option_registration_path=base/'priority-evidence/historical-model-recovery/model-option-registration.json'
    historical_option_registration=read(historical_option_registration_path)
    if historical_option_registration.get('schema')!='ggd-historical-model-option-registration@1':
        raise ValueError('Historical model option registration is not current')
    apply_option_registration_overlay(components, historical_option_registration)
    result.update(modelComponents=components,modelComponentCount=len(components),
        historicalModelSourceArtifacts=historical_artifacts,
        historicalModelSourceArtifactCount=len(historical_artifacts),
        historicalModelRestorationReceipt=dict(
            gitPath=str(restoration_receipt_path.relative_to(ROOT)),
            sha256=hashlib.sha256(restoration_receipt_path.read_bytes()).hexdigest()),
        historicalModelOptionRegistration=dict(
            gitPath=str(historical_option_registration_path.relative_to(ROOT)),
            bytes=historical_option_registration_path.stat().st_size,
            sha256=hashlib.sha256(historical_option_registration_path.read_bytes()).hexdigest(),
            registeredHeroIds=[row['heroId'] for row in historical_option_registration['registrations']],
            blockedHeroIds=[row['heroId'] for row in historical_option_registration['blocked']],
            productionDeploymentVerified=False),
        modelComponentIndex=dict(gitPath=str(component_path.relative_to(ROOT)),
            sha256=hashlib.sha256(component_path.read_bytes()).hexdigest()),
        palworldHeroIntegrationReceipt=dict(
            gitPath=str(palworld_hero_receipt_path.relative_to(ROOT)),
            sha256=hashlib.sha256(palworld_hero_receipt_path.read_bytes()).hexdigest(),
            heroIds=[row['heroId'] for row in palworld_hero_receipt['integrations']],
            status=palworld_hero_receipt['status'],
            productionDeploymentVerified=False),
        modelComponentSourceIndex=dict(gitPath=str(component_source_path.relative_to(ROOT)),
            sha256=hashlib.sha256(component_source_path.read_bytes()).hexdigest()))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the generated index without writing it.')
    parser.add_argument('--check-git', action='store_true', help='Also require exact component bytes in the Git index.')
    args = parser.parse_args()
    result = build()
    if args.check_git:
        # Historical pre-normalization GLBs are separate from selectable model
        # components, but their catalog paths still claim that exact Git blobs
        # exist.  Verify both collections so an untracked local file cannot make
        # current-resources.json look complete.
        verify_component_git_contents(
            result['modelComponents'] + result['historicalModelSourceArtifacts']
        )
        verify_git_contents(component_git_evidence(result['modelComponents']))
        verify_git_contents(
            result['sourceManifests']
            + [
                result['windowsGameSourceInventory'],
                result['ultimate14NativeMotionIndex'],
                result['assetWorkflowRestorationManifest'],
                {
                    'gitPath': result['fateubwMotionReserve']['nativeMotionCompletion']['gitPath'],
                    'sha256': result['fateubwMotionReserve']['nativeMotionCompletion']['sha256'],
                },
                {
                    'gitPath': result['fateubwMotionReserve']['nativeMotionCompletion']['backupReceiptGitPath'],
                    'sha256': result['fateubwMotionReserve']['nativeMotionCompletion']['backupReceiptSha256'],
                },
                {
                    'gitPath': result['fateubwMotionReserve']['durationlessDerivativeCompletion']['gitPath'],
                    'sha256': result['fateubwMotionReserve']['durationlessDerivativeCompletion']['sha256'],
                },
                {
                    'gitPath': result['fateubwMotionReserve']['durationlessDerivativeCompletion']['backupReceiptGitPath'],
                    'sha256': result['fateubwMotionReserve']['durationlessDerivativeCompletion']['backupReceiptSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['receiptGitPath'],
                    'sha256': result['poppVfxDependencySupport']['receiptSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['backupReceiptGitPath'],
                    'sha256': result['poppVfxDependencySupport']['backupReceiptSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['staticMeshReceiptGitPath'],
                    'sha256': result['poppVfxDependencySupport']['staticMeshReceiptSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['staticMeshBackupReceiptGitPath'],
                    'sha256': result['poppVfxDependencySupport']['staticMeshBackupReceiptSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['reconstructionCandidatesGitPath'],
                    'sha256': result['poppVfxDependencySupport']['reconstructionCandidatesSha256'],
                },
                {
                    'gitPath': result['poppVfxDependencySupport']['reconstructionReceiptGitPath'],
                    'sha256': result['poppVfxDependencySupport']['reconstructionReceiptSha256'],
                },
                result['historicalModelRestorationReceipt'],
                result['historicalModelOptionRegistration'],
                result['modelComponentIndex'],
                result['palworldHeroIntegrationReceipt'],
                result['modelComponentSourceIndex'],
            ]
        )
    path = ROOT/'materials/asset-library/current-resources.json'
    encoded = json.dumps(result, ensure_ascii=False, indent=2)+'\n'
    if args.check:
        if path.read_text() != encoded:
            raise ValueError('Refresh current resource index: ' + str(path))
    else:
        path.write_text(encoded)
    print('Current resource model sources:', result['modelSourceCount'], 'components:', result['modelComponentCount'])
if __name__=='__main__':main()

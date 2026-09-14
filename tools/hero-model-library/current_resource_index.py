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


def rebase_git_absolute_paths(value, source_root, link_root):
    """Keep generated local Git links stable when rebuilding in an isolated worktree."""
    source_root=source_root.resolve();link_root=link_root.resolve()
    if isinstance(value,list):
        for item in value:rebase_git_absolute_paths(item,source_root,link_root)
    elif isinstance(value,dict):
        for key,item in value.items():
            if key=='gitAbsolutePath' and isinstance(item,str):
                absolute=Path(item).resolve()
                try:relative=absolute.relative_to(source_root)
                except ValueError:pass
                else:value[key]=str(link_root/relative)
            else:rebase_git_absolute_paths(item,source_root,link_root)
    return value


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
    """Expose verified Hero Forge integration on every registered model option."""
    by_glb = {}
    for integration in receipt.get('integrations', []):
        if integration.get('backendDropdownRegistered') is not True:
            continue
        for option in integration.get('modelOptionEvidence', []):
            model_glb = option['modelGlb']
            by_glb[(model_glb['gitPath'], model_glb['sha256'], model_glb['bytes'])] = (integration, option)
    for component in components:
        match = by_glb.get((component.get('gitPath'), component.get('sha256'), component.get('bytes')))
        if not match:
            continue
        row, option = match
        component.update(
            runtimeSelectable=True,
            runtimeDropdownRegistered=True,
            heroIds=[row['heroId']],
            relatedHeroIds=[row['heroId']],
            runtimeModelKey=option['modelKey'],
            modelDocumentGitPath=option['modelDocument']['gitPath'],
            readiness='hero-forge-six-slot-package-and-dropdown-verified; production deployment unverified',
            registrationEvidence={
                'receiptGitPath': receipt_git_path,
                'heroId': row['heroId'],
                'modelKey': option['modelKey'],
                'isDefault': option['isDefault'],
                'backendDropdownScope': row['backendDropdownScope'],
                'authoringState': row['authoringState'],
                'productionDeploymentVerified': row['productionDeploymentVerified'],
            },
        )
    return components


def apply_eight_model_registration_overlay(components, receipt, receipt_git_path):
    """Expose the verified non-default Ryu procedural fallback option."""
    by_id={row['componentId']:row for row in receipt.get('registrations',[])}
    for component in components:
        row=by_id.get(component.get('id'))
        if not row:continue
        model=row['modelGlb']
        if (component.get('gitPath'),component.get('sha256'),component.get('bytes')) != (model['gitPath'],model['sha256'],model['bytes']):
            raise ValueError('Eight-model option/component GLB mismatch: '+component['id'])
        component.update(
            runtimeSelectable=True,runtimeDropdownRegistered=True,
            heroIds=[row['heroId']],relatedHeroIds=[row['heroId']],
            runtimeModelKey=row['modelKey'],modelDocumentGitPath=row['modelDocument']['gitPath'],
            readiness='registered-non-default-procedural-fallback-option; production deployment unverified',
            registrationEvidence={'receiptGitPath':receipt_git_path,'heroId':row['heroId'],'modelKey':row['modelKey'],'isDefault':row['isDefault'],'motionProvenance':row['motionProvenance'],'productionDeploymentVerified':False})
    return components


def build(git_link_root=ROOT):
    base=ROOT/'materials/hero-model-library';sources=[];models={};registered={}
    unused_300_mba_path=base/'priority-evidence/300-mba-unused-assets-v1/index.json'
    unused_300_mba=read(unused_300_mba_path)
    if (unused_300_mba.get('schema')!='ggd.300-mba-unused-assets-index@1'
        or unused_300_mba.get('newDownloads') is not False
        or unused_300_mba.get('conversionPerformed') is not False
        or unused_300_mba.get('runtimeRegistrationPerformed') is not False
        or unused_300_mba.get('approvedProcessedCopyAuthorizationsChanged') is not False
        or unused_300_mba.get('summary',{}).get('contentObjectsBySha256')!=68669
        or unused_300_mba.get('summary',{}).get('duplicatePathRows')!=5183
        or unused_300_mba.get('summary',{}).get('sourceDefinitionsCatalog')!=297
        or unused_300_mba.get('summary',{}).get('sourceDefinitionsExcludedFromHeroBacklog')!=6
        or unused_300_mba.get('summary',{}).get('pipelineStageCounts',{}).get('convertedCandidate')!=223
        or unused_300_mba.get('summary',{}).get('pipelineStageCounts',{}).get('ggdAccepted')!=0
        or unused_300_mba.get('summary',{}).get('pipelineStageCounts',{}).get('runtimeSelectableAsSourceFile')!=0
        or unused_300_mba.get('summary',{}).get('pipelineStageCounts',{}).get('productionDeployed')!=0):
        raise ValueError('300/MBA unused asset inventory is absent or overclaims readiness')
    for key in ('files','animationClips'):
        entry=unused_300_mba[key]
        if hashlib.sha256((ROOT/entry['gitPath']).read_bytes()).hexdigest()!=entry['sha256']:
            raise ValueError('Refresh 300/MBA unused asset inventory: '+entry['gitPath'])
    community_unused_path=base/'source-inventories/community-unused-assets-v1/inventory.json'
    community_unused_doc_path=base/'source-inventories/community-unused-assets-v1/README.md'
    community_unused_receipt_path=base/'source-inventories/community-unused-assets-v1/local-verification.json'
    community_unused=read(community_unused_path)
    community_unused_receipt=read(community_unused_receipt_path)
    if (community_unused.get('schema')!='ggd.community-unused-assets-inventory@1'
        or community_unused.get('scope',{}).get('newDownloadPerformed') is not False
        or community_unused.get('scope',{}).get('newConversionPerformed') is not False
        or community_unused.get('scope',{}).get('runtimeRegistrationPerformed') is not False
        or community_unused.get('scope',{}).get('productionDeploymentPerformed') is not False
        or community_unused.get('summary',{}).get('sourceRecords',0)<=0
        or community_unused.get('summary',{}).get('sourcePipelineCounts',{}).get('productionDeployed')!=0):
        raise ValueError('Community unused asset inventory is absent or overclaims readiness')
    if (community_unused_receipt.get('schema')!='ggd.community-unused-assets-local-verification@1'
        or community_unused_receipt.get('summary',{}).get('componentMismatchedFiles')!=0
        or community_unused_receipt.get('summary',{}).get('componentMissingFiles')!=0):
        raise ValueError('Community unused component verification is absent or invalid')
    if community_unused['externalAuthorities']['unused300Mba']['sha256']!=hashlib.sha256(unused_300_mba_path.read_bytes()).hexdigest():
        raise ValueError('Community inventory 300/MBA authority pointer is stale')
    windows_game_inventory_path=base/'source-inventories/windows-game-library.json.gz'
    windows_game_inventory=read(windows_game_inventory_path)
    valhalla37_audit_path=base/'priority-evidence/valhalla-37-model-options-v1/audit.json'
    valhalla37_audit=read(valhalla37_audit_path)
    if (valhalla37_audit.get('schema')!='ggd.valhalla-37-model-option-audit@1'
        or valhalla37_audit.get('summary',{}).get('championDocumentsGitTracked')!=37
        or valhalla37_audit.get('summary',{}).get('localContentBundleResolvable')!=37):
        raise ValueError('Valhalla 37 model option audit is absent or stale')
    fate_unlimited_codes_platform_path=base/'priority-evidence/fate-unlimited-codes-platforms-v1/source-index.json'
    fate_unlimited_codes_platform=read(fate_unlimited_codes_platform_path)
    if (fate_unlimited_codes_platform.get('schema')!='ggd-fuc-platform-source-index@1'
        or fate_unlimited_codes_platform.get('summary',{}).get('originalGameInventoryRows')!=2
        or fate_unlimited_codes_platform.get('summary',{}).get('originalGamePayloadBytesRead')!=0
        or fate_unlimited_codes_platform.get('summary',{}).get('originalGameModelPolicyCandidates')!=0
        or fate_unlimited_codes_platform.get('summary',{}).get('nonFucPspReferenceGmoFiles')!=21
        or fate_unlimited_codes_platform.get('summary',{}).get('nonFucPspReferenceMotionBlocks')!=258
        or fate_unlimited_codes_platform.get('summary',{}).get('fateUbwServants')!=14
        or fate_unlimited_codes_platform.get('summary',{}).get('fateUbwConvertedNativeClips')!=127):
        raise ValueError('Fate/unlimited codes platform index is absent, stale or overclaims original payload access')
    smash_legacy_path=base/'source-inventories/smash-legacy-sources-v1/inventory.json'
    smash_legacy=read(smash_legacy_path)
    if (smash_legacy.get('schema')!='ggd.smash-legacy-source-inventory@1'
        or smash_legacy.get('ultimateBoundary',{}).get('includedInLegacyTotals') is not False
        or smash_legacy.get('nintendo64',{}).get('payloadFilesRead')!=0
        or smash_legacy.get('nintendo64',{}).get('payloadSha256Recorded')!=0
        or smash_legacy.get('melee',{}).get('wavFiles')!=1766
        or smash_legacy.get('brawl',{}).get('wavFiles')!=448
        or smash_legacy.get('verification',{}).get('safeNewModelConversionsCompleted')!=0):
        raise ValueError('Legacy Smash source inventory is absent, stale or overclaims payload/conversion status')
    playstation_platform_path=base/'source-inventories/playstation-platform-sources-v1/inventory.json'
    playstation_platform=read(playstation_platform_path)
    playstation_cloud_audit_path=base/'source-inventories/playstation-platform-sources-v1/cloud-policy-audit.json'
    playstation_cloud_audit=read(playstation_cloud_audit_path)
    if (playstation_platform.get('schema')!='ggd.playstation-platform-source-inventory@1'
        or playstation_platform.get('verification',{}).get('windowsMetadataRowsInScope')!=85
        or playstation_platform.get('verification',{}).get('windowsPayloadFilesRead')!=0
        or playstation_platform.get('platformSummary',{}).get('PS Vita',{}).get('metadataRows')!=0
        or playstation_platform.get('acquiredSources',{}).get('pspNativeGmoAuthorSnapshot',{}).get('nativeGmoHeadersVerified')!=21
        or playstation_platform.get('acquiredSources',{}).get('pspCloudConvertedCandidate',{}).get('nativeMotionClips')!=13
        or playstation_platform.get('acquiredSources',{}).get('ps4CloudEnglishAudio',{}).get('decodedWavFiles')!=49
        or playstation_cloud_audit.get('readiness',{}).get('runtimeReady') is not False):
        raise ValueError('PlayStation platform inventory is absent, stale or overclaims payload/readiness')
    jumpforce_path=base/'source-inventories/jumpforce-assets-v2/inventory.json'
    jumpforce_document_path=base/'source-inventories/jumpforce-assets-v2/README.md'
    jumpforce_review_path=base/'source-inventories/jumpforce-assets-v2/listening-review-groups.json'
    jumpforce_entry_path=base/'source-inventories/jumpforce-assets-v2/current-resource-entry.json'
    jumpforce=read(jumpforce_path)
    jumpforce_review=read(jumpforce_review_path)
    jumpforce_entry=read(jumpforce_entry_path)
    if (jumpforce.get('schema')!='ggd.jumpforce-acquired-asset-inventory@2'
        or jumpforce.get('summary',{}).get('publicPackages')!=58
        or jumpforce.get('summary',{}).get('publicCharacterPackages')!=57
        or jumpforce.get('summary',{}).get('steamDecodedAudioFiles')!=4034
        or jumpforce.get('summary',{}).get('automaticSpeakerBindings')!=0
        or jumpforce.get('summary',{}).get('runtimeSelectableAssets')!=0
        or jumpforce_review.get('schema')!='ggd.jumpforce-audio-listening-review-groups@1'
        or jumpforce_review.get('counts',{}).get('approvedForRuntimeBinding')!=0):
        raise ValueError('JUMP FORCE acquired asset inventory is absent, stale or overclaims readiness')
    for path,key in ((jumpforce_path,'sha256'),(jumpforce_document_path,'documentSha256'),(jumpforce_review_path,'listeningReviewQueueSha256')):
        if jumpforce_entry.get(key)!=hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('JUMP FORCE current-resource pointer is stale: '+str(path))
    asset_review_queue_path=base/'review/asset-review-portal-v1/review-queue.json'
    asset_review_schema_path=base/'review/asset-review-portal-v1/review-decision.schema.json'
    asset_review_page_path=ROOT/'apps/client/public/asset-review-portal.html'
    asset_review_queue=read(asset_review_queue_path)
    if (asset_review_queue.get('schema')!='ggd.asset-review-portal@1'
        or asset_review_queue.get('summary',{}).get('audioCandidateCount',0)<=0
        or asset_review_queue.get('summary',{}).get('motionCandidateCount',0)<=0
        or asset_review_queue.get('summary',{}).get('pendingDecisionCount')!=(
            asset_review_queue.get('summary',{}).get('audioCandidateCount',0)
            + asset_review_queue.get('summary',{}).get('motionCandidateCount',0)
            + asset_review_queue.get('summary',{}).get('visualCandidateCount',0))
        or asset_review_queue.get('summary',{}).get('visualCandidateCount')!=164
        or asset_review_queue.get('summary',{}).get('kofXivTextureCandidateCount')!=55
        or asset_review_queue.get('summary',{}).get('kofXivEffGroupCandidateCount')!=71
        or asset_review_queue.get('summary',{}).get('daiVfxTextureComponentCount')!=18
        or asset_review_queue.get('summary',{}).get('daiVfxMeshComponentCount')!=8
        or asset_review_queue.get('summary',{}).get('poppVfxCandidateCount')!=12
        or any(row.get('ownerDecision')!='pending' for row in asset_review_queue.get('visualCandidates',[]))
        or any(row.get('runtimeMutationAllowed') is not False for row in asset_review_queue.get('visualCandidates',[]))
        or asset_review_queue.get('summary',{}).get('approvedDecisionCount')!=0
        or asset_review_queue.get('summary',{}).get('runtimeBindingsChanged')!=0
        or asset_review_queue.get('policy',{}).get('runtimeMutationAllowed') is not False):
        raise ValueError('Unified asset review portal is absent, stale or overclaims approval/runtime binding')
    infinity_strash_weapon_review_path=base/'infinity-strash/weapon-review.json'
    infinity_strash_weapon_review_page=ROOT/'apps/client/public/infinity-strash-weapon-review.html'
    infinity_strash_weapon_review=read(infinity_strash_weapon_review_path)
    if (infinity_strash_weapon_review.get('schema')!='ggd.infinity-strash-weapon-review@1'
        or infinity_strash_weapon_review.get('popp',{}).get('selectedCandidateId')!='infinity-strash-popp-pn020-02-kagayaki-native-v1'
        or len(infinity_strash_weapon_review.get('popp',{}).get('candidates',[]))!=3
        or len(infinity_strash_weapon_review.get('dai',{}).get('candidates',[]))!=2
        or infinity_strash_weapon_review.get('dai',{}).get('ownerSelectedCandidateId') is not None
        or any(row.get('selectableAsHeroWeapon') for row in infinity_strash_weapon_review.get('dai',{}).get('independentProps',[]))
        or infinity_strash_weapon_review.get('runtimeMutationAllowed') is not False
        or infinity_strash_weapon_review.get('audioOrVoiceBindingChanged') is not False):
        raise ValueError('Infinity Strash weapon review is absent, stale or overclaims selection/runtime binding')
    popp_gap_ledger_path=base/'infinity-strash/popp-integration-gaps.json'
    popp_review_contract_path=base/'infinity-strash/popp-integration-review.json'
    popp_review_page_path=ROOT/'apps/client/public/popp-integration-review.html'
    popp_gap_definitions_path=ROOT/'tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/gap-definitions.json'
    popp_vfx_proposals_path=ROOT/'tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/vfx-binding-proposals.json'
    popp_gap_ledger=read(popp_gap_ledger_path)
    popp_gap_summary=popp_gap_ledger.get('summary',{})
    popp_gap_rows=popp_gap_ledger.get('gaps',[])
    if (popp_gap_ledger.get('schema')!='ggd.popp-integration-gap-ledger@1'
        or popp_gap_ledger.get('heroId')!='b2-popp'
        or popp_gap_summary.get('defined')!=5
        or popp_gap_summary.get('closed')!=1
        or popp_gap_summary.get('remaining')!=4
        or popp_gap_summary.get('eventAudioCandidates')!=36
        or popp_gap_summary.get('eventAudioReviewed')!=0
        or popp_gap_summary.get('ggdVfxCandidates')!=12
        or popp_gap_summary.get('vfxVisuallyAccepted')!=0
        or popp_gap_summary.get('vfxBindingProposals')!=7
        or popp_gap_summary.get('vfxReserveCandidates')!=5
        or popp_gap_summary.get('runtimeBindingsAddedByThisWorkflow')!=0
        or len(popp_gap_rows)!=5
        or sum(bool(row.get('closed')) for row in popp_gap_rows)!=1
        or any(not row.get('closureCriteria') for row in popp_gap_rows)
        or popp_gap_ledger.get('weaponDecision',{}).get('selectedCandidateId')!='infinity-strash-popp-pn020-02-kagayaki-native-v1'
        or popp_gap_ledger.get('weaponDecision',{}).get('selectionMode')!='manual'
        or popp_gap_ledger.get('weaponDecision',{}).get('candidateCount')!=3):
        raise ValueError('Popp five-gap ledger is absent, stale or overclaims closure/runtime readiness')
    for item,path in (
        (popp_gap_ledger.get('definitionSource',{}),popp_gap_definitions_path),
        (popp_gap_ledger.get('reviewContract',{}),popp_review_contract_path),
    ):
        if (item.get('sha256')!=hashlib.sha256(path.read_bytes()).hexdigest()
            or item.get('bytes')!=path.stat().st_size):
            raise ValueError('Popp gap ledger evidence is stale: '+str(path))
    popp_vfx_proposals=popp_gap_ledger.get('vfxBindingReviewProposals',{})
    if (popp_vfx_proposals.get('source',{}).get('sha256')!=hashlib.sha256(popp_vfx_proposals_path.read_bytes()).hexdigest()
        or popp_vfx_proposals.get('proposedCandidateCount')!=7
        or popp_vfx_proposals.get('reserveCandidateCount')!=5
        or popp_vfx_proposals.get('policy',{}).get('visuallyApproved') is not False
        or popp_vfx_proposals.get('policy',{}).get('runtimeMutationAllowed') is not False
        or popp_vfx_proposals.get('runtimeBindingsCreated')!=0):
        raise ValueError('Popp VFX review proposals are stale or overclaim approval/runtime binding')
    infinity_strash_av_summary_path=base/'priority-evidence/infinity-strash-dai-vearn-av-v1/summary.json'
    infinity_strash_av_audio_path=base/'priority-evidence/infinity-strash-dai-vearn-av-v1/audio-review-queue.json'
    infinity_strash_av_vfx_path=base/'priority-evidence/infinity-strash-dai-vearn-av-v1/vfx-source-index.json'
    infinity_strash_av_page_path=ROOT/'apps/client/public/infinity-strash-dai-vearn-av-review.html'
    infinity_strash_av_summary=read(infinity_strash_av_summary_path)
    infinity_strash_av_audio=read(infinity_strash_av_audio_path)
    infinity_strash_av_vfx=read(infinity_strash_av_vfx_path)
    if (infinity_strash_av_summary.get('schema')!='ggd.infinity-strash-dai-vearn-av-summary@1'
        or infinity_strash_av_summary.get('scope',{}).get('youngOrPostTransformationVearnPayloadCount')!=0
        or set(infinity_strash_av_summary.get('scope',{}).get('excludedIdentities',{}))!={'EN653','EN680','EN681'}
        or infinity_strash_av_audio.get('schema')!='ggd.infinity-strash-dai-vearn-audio-review@1'
        or infinity_strash_av_audio.get('summary',{}).get('candidateCount')!=485
        or infinity_strash_av_audio.get('summary',{}).get('runtimeBindingsCreated')!=0
        or infinity_strash_av_vfx.get('schema')!='ggd.infinity-strash-dai-vearn-vfx-source-index@1'
        or infinity_strash_av_vfx.get('summary',{}).get('packageGroups')!=175
        or infinity_strash_av_vfx.get('summary',{}).get('ggdVfxConverted')!=0
        or infinity_strash_av_vfx.get('summary',{}).get('skillBindingsCreated')!=0):
        raise ValueError('Infinity Strash Dai/Vearn AV evidence is absent, stale or overclaims readiness')
    fate_asset_path=base/'source-inventories/fate-assets-v2/inventory.json'
    fate_asset_document_path=base/'source-inventories/fate-assets-v2/README.md'
    fate_asset_policy_path=base/'source-inventories/fate-assets-v2/current-policy.json'
    fate_asset_entry_path=base/'source-inventories/fate-assets-v2/current-resource-entry.json'
    fate_psp_asset_audit_path=base/'priority-evidence/fate-unlimited-codes-platforms-v1/psp-asset-audit.json'
    fate_psp_asset_audit_document_path=base/'priority-evidence/fate-unlimited-codes-platforms-v1/psp-asset-audit.md'
    fate_asset=read(fate_asset_path)
    fate_asset_entry=read(fate_asset_entry_path)
    fate_psp_asset_audit=read(fate_psp_asset_audit_path)
    if (fate_asset.get('schema')!='ggd.fate-platform-separated-asset-inventory@1'
        or fate_asset.get('summary',{}).get('minecraftServants')!=14
        or fate_asset.get('summary',{}).get('hardPolicyPass')!=14
        or fate_asset.get('summary',{}).get('pspPayloadBytesRead')!=0
        or fate_asset.get('summary',{}).get('runtimeSelectable')!=0
        or fate_asset.get('scope',{}).get('minecraftCommunitySeparateFromFucOriginal') is not True):
        raise ValueError('Fate platform-separated inventory is absent, stale or overclaims readiness')
    if (fate_psp_asset_audit.get('schema')!='ggd-fuc-psp-asset-audit@1'
        or fate_psp_asset_audit.get('summary',{}).get('originalPspPayloadBytesRead')!=0
        or fate_psp_asset_audit.get('summary',{}).get('standardGlbCandidates')!=13
        or fate_psp_asset_audit.get('summary',{}).get('nativeFucMotionEntries')!=0
        or fate_psp_asset_audit.get('summary',{}).get('nativeFucVfxEntries')!=0):
        raise ValueError('Fate PSP asset audit is absent, stale or overclaims native asset readiness')
    for path,key in (
        (fate_asset_path,'sha256'),
        (fate_asset_document_path,'documentSha256'),
        (fate_asset_policy_path,'policyAuditSha256'),
        (fate_psp_asset_audit_path,'fucPspAssetAuditSha256'),
        (fate_psp_asset_audit_document_path,'fucPspAssetAuditDocumentSha256'),
    ):
        if fate_asset_entry.get(key)!=hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('Fate current-resource pointer is stale: '+str(path))
    palworld_av_path=base/'source-inventories/palworld-vfx-sfx-v1/inventory.json'
    palworld_av_document_path=base/'source-inventories/palworld-vfx-sfx-v1/README.md'
    palworld_av_unused_path=base/'source-inventories/palworld-vfx-sfx-v1/unused-assets.json'
    palworld_av_entry_path=base/'source-inventories/palworld-vfx-sfx-v1/current-resource-entry.json'
    palworld_av=read(palworld_av_path)
    palworld_av_entry=read(palworld_av_entry_path)
    if (palworld_av.get('schema')!='ggd.palworld-vfx-sfx-inventory@1'
        or palworld_av.get('summary',{}).get('characters')!=3
        or palworld_av.get('summary',{}).get('genericCryCandidates')!=18
        or palworld_av.get('summary',{}).get('acquiredStandaloneVfx')!=0
        or palworld_av.get('summary',{}).get('acquiredSkillSpecificSfx')!=0
        or palworld_av.get('summary',{}).get('runtimeBindingsAdded')!=0):
        raise ValueError('Palworld VFX/SFX inventory is absent, stale or overclaims readiness')
    for path,key in ((palworld_av_path,'sha256'),(palworld_av_document_path,'documentSha256'),(palworld_av_unused_path,'unusedAssetIndexSha256')):
        if palworld_av_entry.get(key)!=hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('Palworld VFX/SFX current-resource pointer is stale: '+str(path))
    ultimate14_motion_path=base/'source-inventories/ultimate14-native-motions.json'
    ultimate14_motion=read(ultimate14_motion_path)
    kof3d_inventory_path=base/'source-inventories/kof-3d-sources-v1/inventory.json'
    kof3d_inventory=read(kof3d_inventory_path)
    if (kof3d_inventory.get('schema')!='ggd.kof-3d-source-inventory@1'
        or not kof3d_inventory.get('kofXiv',{}).get('selectedExtraction',{}).get('verification',{}).get('allFilesSha256Verified')
        or kof3d_inventory.get('kofXv',{}).get('hardPolicyProbe',{}).get('result')!='hard-policy-failed-draw-calls'):
        raise ValueError('KOF 3D source/conversion inventory is absent, stale or overclaims readiness')
    kof_jump_coverage_path=base/'source-inventories/kof-jump-container-coverage-v1/inventory.json'
    kof_jump_coverage_doc_path=base/'source-inventories/kof-jump-container-coverage-v1/README.md'
    jumpforce_identity_path=base/'source-inventories/kof-jump-container-coverage-v1/identity-map.json'
    jumpforce_identity_doc_path=base/'source-inventories/kof-jump-container-coverage-v1/identity-map.md'
    kof_xiv_vfx_textures_path=base/'source-inventories/kof-jump-container-coverage-v1/vfx-texture-candidates.json'
    kof_xiv_effect_mapping_path=base/'source-inventories/kof-jump-container-coverage-v1/effect-mapping.json'
    kof_xiv_effect_review_path=base/'source-inventories/kof-jump-container-coverage-v1/effect-review.html'
    kof_xiv_effect_sheets=[base/f'source-inventories/kof-jump-container-coverage-v1/effect-contact-sheets/{native_id}.png' for native_id in ('MAI','IOR','KYO')]
    kof_jump_query_path=ROOT/'tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/query.py'
    jumpforce_identity_builder_path=ROOT/'tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_jumpforce_identity_map.py'
    kof_xiv_effect_probe_path=ROOT/'tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/probe_kof_xiv_effects.py'
    kof_jump_coverage=read(kof_jump_coverage_path)
    jumpforce_identity=read(jumpforce_identity_path)
    kof_xiv_vfx_textures=read(kof_xiv_vfx_textures_path)
    kof_xiv_effect_mapping=read(kof_xiv_effect_mapping_path)
    if (kof_jump_coverage.get('schema')!='ggd.kof-jump-container-coverage@1'
        or kof_jump_coverage.get('jumpForce',{}).get('inferredNativeCharacterIdTokens')!=224
        or kof_jump_coverage.get('jumpForce',{}).get('knownIdentityCrosswalks')!=63
        or kof_jump_coverage.get('jumpForce',{}).get('unmappedNativeCharacterIdTokens')!=161
        or kof_jump_coverage.get('kofXiv',{}).get('nativeDirectoryTokens')!=80
        or jumpforce_identity.get('schema')!='ggd.jumpforce.identity-map@1'
        or jumpforce_identity.get('summary',{}).get('nativeIdTokens')!=224
        or jumpforce_identity.get('summary',{}).get('highConfidenceIdentities')!=63
        or jumpforce_identity.get('summary',{}).get('unresolvedIdentities')!=161
        or jumpforce_identity.get('summary',{}).get('automaticRuntimeBindings')!=0
        or kof_jump_coverage.get('automaticAudioBindings')!=0
        or kof_jump_coverage.get('runtimeSelectableAssetsAdded')!=0
        or kof_xiv_vfx_textures.get('schema')!='ggd.kof-xiv-vfx-texture-candidates@1'
        or kof_xiv_vfx_textures.get('summary',{}).get('convertedPngFiles')!=55
        or kof_xiv_vfx_textures.get('summary',{}).get('overTextureLimit')!=0
        or kof_xiv_vfx_textures.get('runtimeVfxDocuments')!=0
        or kof_xiv_vfx_textures.get('backendSelectable') is not False
        or kof_xiv_effect_mapping.get('schema')!='ggd.kof-xiv-eff-reference-mapping@1'
        or kof_xiv_effect_mapping.get('summary',{}).get('sourceNativeEffectGroups')!=71
        or kof_xiv_effect_mapping.get('summary',{}).get('groupsWithConvertedTexture')!=64
        or kof_xiv_effect_mapping.get('summary',{}).get('convertedTexturesDirectlyReferenced')!=48
        or kof_xiv_effect_mapping.get('summary',{}).get('allEffectDirectoryFilesSha256Covered') is not True
        or kof_xiv_effect_mapping.get('summary',{}).get('ggdRuntimeVfxCandidates')!=0
        or kof_xiv_effect_mapping.get('summary',{}).get('skillBindingsCreated')!=0
        or kof_xiv_effect_mapping.get('policy',{}).get('materialBlendTimingAttachmentValidated') is not False):
        raise ValueError('KOF/JUMP container coverage is absent, stale or overclaims runtime readiness')
    ssbu_ultimate_roster_path=base/'source-inventories/ssbu-ultimate-local-roster-v1/inventory.json'
    ssbu_ultimate_roster_doc_path=base/'source-inventories/ssbu-ultimate-local-roster-v1/README.md'
    ssbu_ultimate_roster=read(ssbu_ultimate_roster_path)
    ssbu_summary=ssbu_ultimate_roster.get('summary',{})
    if (ssbu_ultimate_roster.get('schema')!='ggd-ssbu-ultimate-local-roster@1'
        or ssbu_summary.get('fighterOrFormIdCount')!=92
        or ssbu_summary.get('fighterOrFormWithBodyCandidateCount')!=89
        or ssbu_summary.get('primaryBodyOrAvatarCandidateCount')!=698
        or ssbu_summary.get('acceptedStaticComponentCount')!=14
        or ssbu_summary.get('acceptedMotionComponentCount')!=4
         or ssbu_summary.get('ultimate14DecodedWavFiles')!=19
         or ssbu_summary.get('windowsNsandns2PayloadBytesRead')!=0):
         raise ValueError('SSBU Ultimate local roster is absent, stale or overclaims source access/readiness')
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
    popp_vfx_runtime_path=base/'priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1/manifest.json'
    popp_vfx_runtime=read(popp_vfx_runtime_path)
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
    if (popp_vfx_runtime.get('schema')!='ggd.infinity-strash-popp-vfx-runtime-candidates@1'
        or popp_vfx_runtime.get('summary',{}).get('ggdVfxDocumentsBuilt')!=12
        or popp_vfx_runtime.get('summary',{}).get('identityExcludedRoots')!=2
        or popp_vfx_runtime.get('summary',{}).get('skillBindingsCreated')!=0
        or popp_vfx_runtime.get('summary',{}).get('visuallyAccepted')!=0):
        raise ValueError('Popp GGD VFX candidates are absent, stale or overclaim acceptance/binding')
    dai_vfx_candidates_path=base/'priority-evidence/infinity-strash-dai-vfx-components-v1/candidates.json'
    dai_vfx_policy_path=base/'priority-evidence/infinity-strash-dai-vfx-components-v1/policy-check.json'
    dai_vfx_receipt_path=base/'priority-evidence/infinity-strash-dai-vfx-components-v1/receipt.json'
    dai_vfx_page_path=ROOT/'apps/client/public/infinity-strash-dai-vfx-components.html'
    dai_vfx_sheet_path=ROOT/'apps/client/public/infinity-strash-dai-vfx-components.png'
    dai_vfx_candidates=read(dai_vfx_candidates_path)
    dai_vfx_policy=read(dai_vfx_policy_path)
    dai_vfx_receipt=read(dai_vfx_receipt_path)
    if (dai_vfx_candidates.get('schema')!='ggd.infinity-strash-dai-vfx-component-candidates@1'
        or dai_vfx_candidates.get('summary',{}).get('textureComponents')!=18
        or dai_vfx_candidates.get('summary',{}).get('meshComponentsConverted')!=8
        or dai_vfx_candidates.get('summary',{}).get('niagaraSystemsConverted')!=0
        or dai_vfx_candidates.get('summary',{}).get('skillBindingsCreated')!=0
        or dai_vfx_policy.get('summary',{}).get('texturesHardPass')!=18
        or dai_vfx_policy.get('summary',{}).get('meshesHardPass')!=8
        or dai_vfx_receipt.get('allGitCandidateBytesVerified') is not True):
        raise ValueError('Dai VFX support components are absent, stale or overclaim runtime readiness')
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
        valhalla37ModelOptionAudit=dict(
            gitPath=str(valhalla37_audit_path.relative_to(ROOT)),
            sha256=hashlib.sha256(valhalla37_audit_path.read_bytes()).hexdigest(),
            status='feature-branch-registered-and-bundle-resolvable; production-glbs-http-404; visual-e2e-unverified',
            summary=valhalla37_audit['summary']),
        windowsGameSourceInventory=dict(
            gitPath=str(windows_game_inventory_path.relative_to(ROOT)),
            sha256=hashlib.sha256(windows_game_inventory_path.read_bytes()).hexdigest(),
            status=windows_game_inventory['statusSemantics']['current'],
            summary=windows_game_inventory['summary']),
        windowsGameSourceDocument='materials/hero-model-library/source-inventories/windows-game-library.md',
        fateUnlimitedCodesPlatformIndex=dict(
            gitPath=str(fate_unlimited_codes_platform_path.relative_to(ROOT)),
            sha256=hashlib.sha256(fate_unlimited_codes_platform_path.read_bytes()).hexdigest(),
            status='psp-inventory-metadata-only; PS2 public audio and FateUBW community reserve indexed separately',
            summary=fate_unlimited_codes_platform['summary']),
        fateUnlimitedCodesPlatformDocument=dict(
            gitPath='materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1/source-index.md',
            sha256=hashlib.sha256((base/'priority-evidence/fate-unlimited-codes-platforms-v1/source-index.md').read_bytes()).hexdigest()),
        legacySmashSourceInventory=dict(
            gitPath=str(smash_legacy_path.relative_to(ROOT)),
            sha256=hashlib.sha256(smash_legacy_path.read_bytes()).hexdigest(),
            sourceId=smash_legacy['sourceId'],
            status='N64 metadata-only; Melee and Brawl audio bytes verified; model/motion/VFX source bytes not acquired; Ultimate separate',
            summary=dict(
                nintendo64InventoryRows=smash_legacy['nintendo64']['inventoryRows'],
                nintendo64PayloadFilesRead=smash_legacy['nintendo64']['payloadFilesRead'],
                meleeArchivePackages=smash_legacy['melee']['archivePackages'],
                meleeVerifiedMemberFiles=smash_legacy['melee']['memberFiles'],
                meleePcmWavFiles=smash_legacy['melee']['wavFiles'],
                brawlArchivePackages=smash_legacy['brawl']['archivePackages'],
                brawlVerifiedMemberFiles=smash_legacy['brawl']['memberFiles'],
                brawlPcmWavFiles=smash_legacy['brawl']['wavFiles'],
                modelFiles=0,
                nativeMotionFiles=0,
                vfxFiles=0,
                convertedFiles=0,
                runtimeBindingsVerified=0),
            ultimateBoundary=smash_legacy['ultimateBoundary']),
        legacySmashSourceDocument=dict(
            gitPath='materials/hero-model-library/source-inventories/smash-legacy-sources-v1/README.md',
            sha256=hashlib.sha256((base/'source-inventories/smash-legacy-sources-v1/README.md').read_bytes()).hexdigest()),
        playstationPlatformSourceInventory=dict(
            gitPath=str(playstation_platform_path.relative_to(ROOT)),
            sha256=hashlib.sha256(playstation_platform_path.read_bytes()).hexdigest(),
            documentGitPath='materials/hero-model-library/source-inventories/playstation-platform-sources-v1/README.md',
            documentSha256=hashlib.sha256((base/'source-inventories/playstation-platform-sources-v1/README.md').read_bytes()).hexdigest(),
            cloudPolicyAuditGitPath=str(playstation_cloud_audit_path.relative_to(ROOT)),
            cloudPolicyAuditSha256=hashlib.sha256(playstation_cloud_audit_path.read_bytes()).hexdigest(),
            sourceId=playstation_platform['sourceId'],
            status='85 Windows game-container rows metadata-only; 3 independent local source IDs byte/SHA/S3-verified; runtime/deployment unverified',
            summary=dict(
                platformSummary=playstation_platform['platformSummary'],
                locallyVerifiedSourceIds=playstation_platform['verification']['locallyVerifiedSourceIds'],
                locallyVerifiedMemberFiles=playstation_platform['verification']['locallyVerifiedMemberFiles'],
                pspNativeGmoFiles=21,
                pspNativeMotionBlocks=258,
                pspCloudConvertedClips=13,
                ps4CloudDecodedWavFiles=49,
                newDownloads=0,
                newConversions=0,
                runtimeBindingsVerified=0,
                productionDeploymentVerified=False)),
        ultimate14NativeMotionIndex=dict(
            gitPath=str(ultimate14_motion_path.relative_to(ROOT)),
            sha256=hashlib.sha256(ultimate14_motion_path.read_bytes()).hexdigest(),
            status='parsed-native-mod-motion-reserve-pending-conversion-and-skeleton-playback',
            summary=ultimate14_motion['summary']),
        kof3dSourceInventory=dict(
            gitPath=str(kof3d_inventory_path.relative_to(ROOT)),
            sha256=hashlib.sha256(kof3d_inventory_path.read_bytes()).hexdigest(),
            sourceId=kof3d_inventory['sourceId'],
            kofXivCharacters=kof3d_inventory['kofXiv']['selectedExtraction']['nativeCharacterIds'],
            textureCandidates=kof3d_inventory['kofXiv']['textureCandidates']['summary'],
            textureBackup=kof3d_inventory['kofXiv']['textureCandidates']['backup'],
            ashGuardResult=kof3d_inventory['kofXv']['hardPolicyProbe']['result'],
            runtimeSelectable=False,
            productionDeploymentVerified=False),
        kofJumpContainerCoverage=dict(
            gitPath=str(kof_jump_coverage_path.relative_to(ROOT)),
            sha256=hashlib.sha256(kof_jump_coverage_path.read_bytes()).hexdigest(),
            documentGitPath=str(kof_jump_coverage_doc_path.relative_to(ROOT)),
            documentSha256=hashlib.sha256(kof_jump_coverage_doc_path.read_bytes()).hexdigest(),
            identityMapGitPath=str(jumpforce_identity_path.relative_to(ROOT)),
            identityMapSha256=hashlib.sha256(jumpforce_identity_path.read_bytes()).hexdigest(),
            identityDocumentGitPath=str(jumpforce_identity_doc_path.relative_to(ROOT)),
            identityDocumentSha256=hashlib.sha256(jumpforce_identity_doc_path.read_bytes()).hexdigest(),
            vfxTextureCandidateGitPath=str(kof_xiv_vfx_textures_path.relative_to(ROOT)),
            vfxTextureCandidateSha256=hashlib.sha256(kof_xiv_vfx_textures_path.read_bytes()).hexdigest(),
            effectMappingGitPath=str(kof_xiv_effect_mapping_path.relative_to(ROOT)),
            effectMappingSha256=hashlib.sha256(kof_xiv_effect_mapping_path.read_bytes()).hexdigest(),
            effectReviewGitPath=str(kof_xiv_effect_review_path.relative_to(ROOT)),
            effectReviewSha256=hashlib.sha256(kof_xiv_effect_review_path.read_bytes()).hexdigest(),
            effectContactSheets=[dict(
                nativeCharacterId=path.stem,
                gitPath=str(path.relative_to(ROOT)),
                bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest()) for path in kof_xiv_effect_sheets],
            queryToolGitPath=str(kof_jump_query_path.relative_to(ROOT)),
            queryToolSha256=hashlib.sha256(kof_jump_query_path.read_bytes()).hexdigest(),
            identityBuilderToolGitPath=str(jumpforce_identity_builder_path.relative_to(ROOT)),
            identityBuilderToolSha256=hashlib.sha256(jumpforce_identity_builder_path.read_bytes()).hexdigest(),
            effectProbeToolGitPath=str(kof_xiv_effect_probe_path.relative_to(ROOT)),
            effectProbeToolSha256=hashlib.sha256(kof_xiv_effect_probe_path.read_bytes()).hexdigest(),
            jumpForceNativeIdTokens=224,
            jumpForceHighConfidenceIdentities=63,
            jumpForceUnresolvedIdentities=161,
            jumpForceIdentitySummary=jumpforce_identity['summary'],
            kofXivNativeDirectoryTokens=80,
            kofXivVfxTextureCandidates=55,
            kofXivSourceNativeEffectGroups=kof_xiv_effect_mapping['summary']['sourceNativeEffectGroups'],
            kofXivEffGroupsWithConvertedTexture=kof_xiv_effect_mapping['summary']['groupsWithConvertedTexture'],
            kofXivConvertedTexturesDirectlyReferenced=kof_xiv_effect_mapping['summary']['convertedTexturesDirectlyReferenced'],
            textureConversionBackup=kof_xiv_effect_mapping['textureConversionBackup'],
            kofXivRuntimeVfxCandidates=kof_xiv_effect_mapping['summary']['ggdRuntimeVfxCandidates'],
            automaticAudioBindings=0,
            runtimeSelectableAssetsAdded=0,
            productionDeploymentVerified=False),
        ssbuUltimateLocalRoster=dict(
            gitPath=str(ssbu_ultimate_roster_path.relative_to(ROOT)),
            sha256=hashlib.sha256(ssbu_ultimate_roster_path.read_bytes()).hexdigest(),
            documentGitPath=str(ssbu_ultimate_roster_doc_path.relative_to(ROOT)),
            documentSha256=hashlib.sha256(ssbu_ultimate_roster_doc_path.read_bytes()).hexdigest(),
            status='Worldblender local fighter/form sources indexed; Ultimate14 partial MOD indexed; NSandNS2 payload unavailable',
            summary=ssbu_summary,
            nsandns2Blocker=ssbu_ultimate_roster['nsandns2']['blocker']),
        assetWorkflowRestorationManifest=dict(
            gitPath=str(workflow_restoration_path.relative_to(ROOT)),
            sha256=hashlib.sha256(workflow_restoration_path.read_bytes()).hexdigest(),
            summary=workflow_restoration['summary']),
        unused300MbaAssetIndex=dict(
            gitPath=str(unused_300_mba_path.relative_to(ROOT)),
            sha256=hashlib.sha256(unused_300_mba_path.read_bytes()).hexdigest(),
            documentGitPath=str(unused_300_mba_path.with_name('index.md').relative_to(ROOT)),
            documentSha256=hashlib.sha256(unused_300_mba_path.with_name('index.md').read_bytes()).hexdigest(),
            filesGitPath=unused_300_mba['files']['gitPath'],
            filesSha256=unused_300_mba['files']['sha256'],
            animationClipsGitPath=unused_300_mba['animationClips']['gitPath'],
            animationClipsSha256=unused_300_mba['animationClips']['sha256'],
            status='existing-local-sources-indexed; unused reserves remain pending standardization/acceptance/registration',
            summary=unused_300_mba['summary'],
            newDownloads=False,
            runtimeSelectable=False,
            productionDeploymentVerified=False),
        communityUnusedAssetIndex=dict(
            gitPath=str(community_unused_path.relative_to(ROOT)),
            sha256=hashlib.sha256(community_unused_path.read_bytes()).hexdigest(),
            documentGitPath=str(community_unused_doc_path.relative_to(ROOT)),
            documentSha256=hashlib.sha256(community_unused_doc_path.read_bytes()).hexdigest(),
            localVerificationGitPath=str(community_unused_receipt_path.relative_to(ROOT)),
            localVerificationSha256=hashlib.sha256(community_unused_receipt_path.read_bytes()).hexdigest(),
            sourceRecords=community_unused['summary']['sourceRecords'],
            componentRecords=community_unused['summary']['componentRecords'],
            unusedForRuntime=community_unused['summary']['sourcePipelineCounts']['unusedForRuntime'],
            runtimeSelectable=community_unused['summary']['sourcePipelineCounts']['runtimeSelectable'],
            productionDeployed=community_unused['summary']['sourcePipelineCounts']['productionDeployed'],
            authoritativeFileRows=community_unused['summary']['authoritativeFileRows'],
            note='Per-file rows remain in public-source-files.json; registered, selectable and deployed are separate facts.'),
        jumpForceAssetInventory=dict(
            **jumpforce_entry,
            entryGitPath=str(jumpforce_entry_path.relative_to(ROOT)),
            entrySha256=hashlib.sha256(jumpforce_entry_path.read_bytes()).hexdigest()),
        assetReviewPortal=dict(
            schema=asset_review_queue['schema'],
            sourceFingerprint=asset_review_queue['sourceFingerprint'],
            queueGitPath=str(asset_review_queue_path.relative_to(ROOT)),
            queueSha256=hashlib.sha256(asset_review_queue_path.read_bytes()).hexdigest(),
            decisionSchemaGitPath=str(asset_review_schema_path.relative_to(ROOT)),
            decisionSchemaSha256=hashlib.sha256(asset_review_schema_path.read_bytes()).hexdigest(),
            reviewPageGitPath=str(asset_review_page_path.relative_to(ROOT)),
            reviewPageSha256=hashlib.sha256(asset_review_page_path.read_bytes()).hexdigest(),
            summary=asset_review_queue['summary'],
            defaultDecision='pending',
            runtimeMutationAllowed=False,
            productionDeploymentVerified=False),
        infinityStrashWeaponReview=dict(
            schema=infinity_strash_weapon_review['schema'],
            sourceFingerprint=infinity_strash_weapon_review['sourceFingerprint'],
            reviewGitPath=str(infinity_strash_weapon_review_path.relative_to(ROOT)),
            reviewSha256=hashlib.sha256(infinity_strash_weapon_review_path.read_bytes()).hexdigest(),
            reviewPageGitPath=str(infinity_strash_weapon_review_page.relative_to(ROOT)),
            reviewPageSha256=hashlib.sha256(infinity_strash_weapon_review_page.read_bytes()).hexdigest(),
            poppSelectedCandidateId=infinity_strash_weapon_review['popp']['selectedCandidateId'],
            poppCandidateCount=len(infinity_strash_weapon_review['popp']['candidates']),
            daiCandidateCount=len(infinity_strash_weapon_review['dai']['candidates']),
            daiOwnerSelectedCandidateId=None,
            daiIndependentPropCount=len(infinity_strash_weapon_review['dai']['independentProps']),
            runtimeMutationAllowed=False,
            audioOrVoiceBindingChanged=False,
            productionDeploymentVerified=False),
        poppIntegrationGapLedger=dict(
            schema=popp_gap_ledger['schema'],
            sourceFingerprint=popp_gap_ledger['sourceFingerprint'],
            gapLedgerGitPath=str(popp_gap_ledger_path.relative_to(ROOT)),
            gapLedgerSha256=hashlib.sha256(popp_gap_ledger_path.read_bytes()).hexdigest(),
            definitionSourceGitPath=str(popp_gap_definitions_path.relative_to(ROOT)),
            definitionSourceSha256=hashlib.sha256(popp_gap_definitions_path.read_bytes()).hexdigest(),
            vfxBindingProposalGitPath=str(popp_vfx_proposals_path.relative_to(ROOT)),
            vfxBindingProposalSha256=hashlib.sha256(popp_vfx_proposals_path.read_bytes()).hexdigest(),
            reviewContractGitPath=str(popp_review_contract_path.relative_to(ROOT)),
            reviewContractSha256=hashlib.sha256(popp_review_contract_path.read_bytes()).hexdigest(),
            reviewPageGitPath=str(popp_review_page_path.relative_to(ROOT)),
            reviewPageSha256=hashlib.sha256(popp_review_page_path.read_bytes()).hexdigest(),
            weaponDecision=popp_gap_ledger['weaponDecision'],
            summary=popp_gap_summary,
            gaps=popp_gap_rows,
            vfxBindingReviewProposals=popp_vfx_proposals,
            runtimeMutationAllowed=False,
            productionDeploymentVerified=False),
        infinityStrashDaiVearnAv=dict(
            schema=infinity_strash_av_summary['schema'],
            sourceIds=infinity_strash_av_summary['sourceIds'],
            status='exact-identity-audio-decoded-and-queued; raw-VFX-indexed; listening/visual-acceptance/runtime-binding/deployment-pending',
            summaryGitPath=str(infinity_strash_av_summary_path.relative_to(ROOT)),
            summarySha256=hashlib.sha256(infinity_strash_av_summary_path.read_bytes()).hexdigest(),
            audioReviewQueueGitPath=str(infinity_strash_av_audio_path.relative_to(ROOT)),
            audioReviewQueueSha256=hashlib.sha256(infinity_strash_av_audio_path.read_bytes()).hexdigest(),
            audioQueueParts=infinity_strash_av_audio['parts'],
            vfxSourceIndexGitPath=str(infinity_strash_av_vfx_path.relative_to(ROOT)),
            vfxSourceIndexSha256=hashlib.sha256(infinity_strash_av_vfx_path.read_bytes()).hexdigest(),
            vfxIndexParts=infinity_strash_av_vfx['parts'],
            reviewPageGitPath=str(infinity_strash_av_page_path.relative_to(ROOT)),
            reviewPageSha256=hashlib.sha256(infinity_strash_av_page_path.read_bytes()).hexdigest(),
            summary=infinity_strash_av_summary,
            runtimeBindingsCreated=0,
            productionDeploymentVerified=False),
        infinityStrashDaiVfxComponents=dict(
            schema=dai_vfx_candidates['schema'],
            sourceId=dai_vfx_candidates['sourceId'],
            character=dai_vfx_candidates['character'],
            status='26 policy-passing support components indexed; Niagara reconstruction, owner review, skill binding and runtime remain pending',
            candidatesGitPath=str(dai_vfx_candidates_path.relative_to(ROOT)),
            candidatesSha256=hashlib.sha256(dai_vfx_candidates_path.read_bytes()).hexdigest(),
            policyGitPath=str(dai_vfx_policy_path.relative_to(ROOT)),
            policySha256=hashlib.sha256(dai_vfx_policy_path.read_bytes()).hexdigest(),
            receiptGitPath=str(dai_vfx_receipt_path.relative_to(ROOT)),
            receiptSha256=hashlib.sha256(dai_vfx_receipt_path.read_bytes()).hexdigest(),
            reviewPageGitPath=str(dai_vfx_page_path.relative_to(ROOT)),
            reviewPageSha256=hashlib.sha256(dai_vfx_page_path.read_bytes()).hexdigest(),
            contactSheetGitPath=str(dai_vfx_sheet_path.relative_to(ROOT)),
            contactSheetSha256=hashlib.sha256(dai_vfx_sheet_path.read_bytes()).hexdigest(),
            summary=dai_vfx_candidates['summary'],
            s3=dai_vfx_candidates['s3'],
            runtimeBindingsCreated=0,
            productionDeploymentVerified=False),
        fateAssetInventory=dict(
            **fate_asset_entry,
            entryGitPath=str(fate_asset_entry_path.relative_to(ROOT)),
            entrySha256=hashlib.sha256(fate_asset_entry_path.read_bytes()).hexdigest()),
        palworldVfxSfxInventory=dict(
            **palworld_av_entry,
            entryGitPath=str(palworld_av_entry_path.relative_to(ROOT)),
            entrySha256=hashlib.sha256(palworld_av_entry_path.read_bytes()).hexdigest()),
        poppVfxDependencySupport=dict(
            heroId='b2-popp',
            sourceId=popp_vfx_receipt['sourceId'],
            status='12 source-texture GGD VFX candidates built; Niagara timing/mesh layers/visual acceptance and skill binding pending',
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
            runtimeCandidates=dict(
                gitPath=str(popp_vfx_runtime_path.relative_to(ROOT)),
                sha256=hashlib.sha256(popp_vfx_runtime_path.read_bytes()).hexdigest(),
                documentGitPath='materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1/README.md',
                candidates=popp_vfx_runtime['candidates'],
                excluded=popp_vfx_runtime['excluded'],
                reviewPage=popp_vfx_runtime['review']['page']),
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
                ggdVfxConvertedCandidates=popp_vfx_runtime['summary']['ggdVfxDocumentsBuilt'],
                identityExcludedRoots=popp_vfx_runtime['summary']['identityExcludedRoots'],
                visuallyAccepted=0,
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
    eight_registration_path=base/'priority-evidence/eight-missing-models-v1/registration.json'
    eight_registration=read(eight_registration_path)
    if eight_registration.get('schema')!='ggd.eight-missing-model-option-registration@1':
        raise ValueError('Eight-model option registration is not current')
    apply_eight_model_registration_overlay(components,eight_registration,str(eight_registration_path.relative_to(ROOT)))
    historical_artifacts=source_historical_artifacts(component_sources,ROOT)
    restoration_receipt_path=base/'priority-evidence/historical-model-recovery/restoration-receipt.json'
    historical_option_registration_path=base/'priority-evidence/historical-model-recovery/model-option-registration.json'
    historical_option_registration=read(historical_option_registration_path)
    historical_lineage_audit_path=base/'priority-evidence/historical-model-recovery/current-lineage-audit.json'
    historical_lineage_audit=read(historical_lineage_audit_path)
    if historical_option_registration.get('schema')!='ggd-historical-model-option-registration@1':
        raise ValueError('Historical model option registration is not current')
    if (historical_lineage_audit.get('schema')!='ggd-historical-model-lineage-audit@1'
        or historical_lineage_audit.get('summary',{}).get('exactHistoricalGlbsByteIdentical')!=4
        or historical_lineage_audit.get('summary',{}).get('standardizedLineageOptionsRegistered')!=4):
        raise ValueError('Historical model lineage audit is not current')
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
        historicalModelLineageAudit=dict(
            gitPath=str(historical_lineage_audit_path.relative_to(ROOT)),
            bytes=historical_lineage_audit_path.stat().st_size,
            sha256=hashlib.sha256(historical_lineage_audit_path.read_bytes()).hexdigest(),
            exactHistoricalGlbsByteIdentical=historical_lineage_audit['summary']['exactHistoricalGlbsByteIdentical'],
            standardizedLineageOptionsRegistered=historical_lineage_audit['summary']['standardizedLineageOptionsRegistered'],
            defaultsChanged=historical_lineage_audit['summary']['defaultsChanged'],
            productionDeploymentVerified=False),
        eightMissingModelOptionRegistration=dict(
            gitPath=str(eight_registration_path.relative_to(ROOT)),
            bytes=eight_registration_path.stat().st_size,
            sha256=hashlib.sha256(eight_registration_path.read_bytes()).hexdigest(),
            registeredHeroIds=[row['heroId'] for row in eight_registration['registrations']],
            blockedHeroIds=sorted(set(row['heroId'] for row in eight_registration['blocked'])),
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
    approved_derivative_audit_path=base/'priority-evidence/approved-derivatives-v1/audit.json'
    if approved_derivative_audit_path.exists():
        approved_derivative_audit=read(approved_derivative_audit_path)
        if approved_derivative_audit.get('summary',{}).get('count')!=11 or approved_derivative_audit.get('summary',{}).get('hardPolicyPass')!=11:
            raise ValueError('Approved derivative audit is absent or incomplete')
        result['approvedDerivativeAudit']=dict(
            gitPath=str(approved_derivative_audit_path.relative_to(ROOT)),
            sha256=hashlib.sha256(approved_derivative_audit_path.read_bytes()).hexdigest(),
            approvedCount=11,hardPolicyPass=11,registeredAndSelectable=approved_derivative_audit['summary']['registeredAndSelectable'],
            productionDeploymentVerified=False)
    return rebase_git_absolute_paths(result,ROOT,git_link_root)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the generated index without writing it.')
    parser.add_argument('--check-git', action='store_true', help='Also require exact component bytes in the Git index.')
    parser.add_argument('--git-link-root', type=Path, default=ROOT,
        help='Checkout root used only for absolute Git links in generated evidence.')
    args = parser.parse_args()
    result = build(args.git_link_root.resolve())
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
                result['valhalla37ModelOptionAudit'],
                result['fateUnlimitedCodesPlatformIndex'],
                result['fateUnlimitedCodesPlatformDocument'],
                result['legacySmashSourceInventory'],
                result['legacySmashSourceDocument'],
                {
                    'gitPath': result['playstationPlatformSourceInventory']['gitPath'],
                    'sha256': result['playstationPlatformSourceInventory']['sha256'],
                },
                {
                    'gitPath': result['playstationPlatformSourceInventory']['documentGitPath'],
                    'sha256': result['playstationPlatformSourceInventory']['documentSha256'],
                },
                {
                    'gitPath': result['playstationPlatformSourceInventory']['cloudPolicyAuditGitPath'],
                    'sha256': result['playstationPlatformSourceInventory']['cloudPolicyAuditSha256'],
                },
                result['ultimate14NativeMotionIndex'],
                result['kof3dSourceInventory'],
                {
                    'gitPath': result['kofJumpContainerCoverage']['gitPath'],
                    'sha256': result['kofJumpContainerCoverage']['sha256'],
                },
                {
                    'gitPath': result['kofJumpContainerCoverage']['documentGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['documentSha256'],
                },
                {
                    'gitPath': result['kofJumpContainerCoverage']['vfxTextureCandidateGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['vfxTextureCandidateSha256'],
                },
                {
                    'gitPath': result['kofJumpContainerCoverage']['effectMappingGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['effectMappingSha256'],
                },
                {
                    'gitPath': result['kofJumpContainerCoverage']['effectReviewGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['effectReviewSha256'],
                },
                *result['kofJumpContainerCoverage']['effectContactSheets'],
                {
                    'gitPath': result['kofJumpContainerCoverage']['queryToolGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['queryToolSha256'],
                },
                {
                    'gitPath': result['kofJumpContainerCoverage']['effectProbeToolGitPath'],
                    'sha256': result['kofJumpContainerCoverage']['effectProbeToolSha256'],
                },
                {
                    'gitPath': result['ssbuUltimateLocalRoster']['gitPath'],
                    'sha256': result['ssbuUltimateLocalRoster']['sha256'],
                },
                {
                    'gitPath': result['ssbuUltimateLocalRoster']['documentGitPath'],
                    'sha256': result['ssbuUltimateLocalRoster']['documentSha256'],
                },
                result['assetWorkflowRestorationManifest'],
                {
                    'gitPath': result['unused300MbaAssetIndex']['gitPath'],
                    'sha256': result['unused300MbaAssetIndex']['sha256'],
                },
                {
                    'gitPath': result['unused300MbaAssetIndex']['documentGitPath'],
                    'sha256': result['unused300MbaAssetIndex']['documentSha256'],
                },
                {
                    'gitPath': result['unused300MbaAssetIndex']['filesGitPath'],
                    'sha256': result['unused300MbaAssetIndex']['filesSha256'],
                },
                {
                    'gitPath': result['unused300MbaAssetIndex']['animationClipsGitPath'],
                    'sha256': result['unused300MbaAssetIndex']['animationClipsSha256'],
                },
                {
                    'gitPath': result['communityUnusedAssetIndex']['gitPath'],
                    'sha256': result['communityUnusedAssetIndex']['sha256'],
                },
                {
                    'gitPath': result['communityUnusedAssetIndex']['documentGitPath'],
                    'sha256': result['communityUnusedAssetIndex']['documentSha256'],
                },
                {
                    'gitPath': result['communityUnusedAssetIndex']['localVerificationGitPath'],
                    'sha256': result['communityUnusedAssetIndex']['localVerificationSha256'],
                },
                {
                    'gitPath': result['jumpForceAssetInventory']['gitPath'],
                    'sha256': result['jumpForceAssetInventory']['sha256'],
                },
                {
                    'gitPath': result['jumpForceAssetInventory']['documentGitPath'],
                    'sha256': result['jumpForceAssetInventory']['documentSha256'],
                },
                {
                    'gitPath': result['jumpForceAssetInventory']['listeningReviewQueueGitPath'],
                    'sha256': result['jumpForceAssetInventory']['listeningReviewQueueSha256'],
                },
                {
                    'gitPath': result['jumpForceAssetInventory']['entryGitPath'],
                    'sha256': result['jumpForceAssetInventory']['entrySha256'],
                },
                {
                    'gitPath': result['assetReviewPortal']['queueGitPath'],
                    'sha256': result['assetReviewPortal']['queueSha256'],
                },
                {
                    'gitPath': result['assetReviewPortal']['decisionSchemaGitPath'],
                    'sha256': result['assetReviewPortal']['decisionSchemaSha256'],
                },
                {
                    'gitPath': result['assetReviewPortal']['reviewPageGitPath'],
                    'sha256': result['assetReviewPortal']['reviewPageSha256'],
                },
                {
                    'gitPath': result['infinityStrashWeaponReview']['reviewGitPath'],
                    'sha256': result['infinityStrashWeaponReview']['reviewSha256'],
                },
                {
                    'gitPath': result['infinityStrashWeaponReview']['reviewPageGitPath'],
                    'sha256': result['infinityStrashWeaponReview']['reviewPageSha256'],
                },
                {
                    'gitPath': result['poppIntegrationGapLedger']['gapLedgerGitPath'],
                    'sha256': result['poppIntegrationGapLedger']['gapLedgerSha256'],
                },
                {
                    'gitPath': result['poppIntegrationGapLedger']['definitionSourceGitPath'],
                    'sha256': result['poppIntegrationGapLedger']['definitionSourceSha256'],
                },
                {
                    'gitPath': result['poppIntegrationGapLedger']['vfxBindingProposalGitPath'],
                    'sha256': result['poppIntegrationGapLedger']['vfxBindingProposalSha256'],
                },
                {
                    'gitPath': result['poppIntegrationGapLedger']['reviewContractGitPath'],
                    'sha256': result['poppIntegrationGapLedger']['reviewContractSha256'],
                },
                {
                    'gitPath': result['poppIntegrationGapLedger']['reviewPageGitPath'],
                    'sha256': result['poppIntegrationGapLedger']['reviewPageSha256'],
                },
                {
                    'gitPath': result['infinityStrashDaiVearnAv']['summaryGitPath'],
                    'sha256': result['infinityStrashDaiVearnAv']['summarySha256'],
                },
                {
                    'gitPath': result['infinityStrashDaiVearnAv']['audioReviewQueueGitPath'],
                    'sha256': result['infinityStrashDaiVearnAv']['audioReviewQueueSha256'],
                },
                *[
                    {'gitPath': row['gitPath'], 'sha256': row['sha256'], 'bytes': row['bytes']}
                    for row in result['infinityStrashDaiVearnAv']['audioQueueParts']
                ],
                {
                    'gitPath': result['infinityStrashDaiVearnAv']['vfxSourceIndexGitPath'],
                    'sha256': result['infinityStrashDaiVearnAv']['vfxSourceIndexSha256'],
                },
                *[
                    {'gitPath': row['gitPath'], 'sha256': row['sha256'], 'bytes': row['bytes']}
                    for row in result['infinityStrashDaiVearnAv']['vfxIndexParts']
                ],
                {
                    'gitPath': result['infinityStrashDaiVearnAv']['reviewPageGitPath'],
                    'sha256': result['infinityStrashDaiVearnAv']['reviewPageSha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['gitPath'],
                    'sha256': result['fateAssetInventory']['sha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['documentGitPath'],
                    'sha256': result['fateAssetInventory']['documentSha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['policyAuditGitPath'],
                    'sha256': result['fateAssetInventory']['policyAuditSha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['entryGitPath'],
                    'sha256': result['fateAssetInventory']['entrySha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['fucPspAssetAuditGitPath'],
                    'sha256': result['fateAssetInventory']['fucPspAssetAuditSha256'],
                },
                {
                    'gitPath': result['fateAssetInventory']['fucPspAssetAuditDocumentGitPath'],
                    'sha256': result['fateAssetInventory']['fucPspAssetAuditDocumentSha256'],
                },
                {
                    'gitPath': result['palworldVfxSfxInventory']['gitPath'],
                    'sha256': result['palworldVfxSfxInventory']['sha256'],
                },
                {
                    'gitPath': result['palworldVfxSfxInventory']['documentGitPath'],
                    'sha256': result['palworldVfxSfxInventory']['documentSha256'],
                },
                {
                    'gitPath': result['palworldVfxSfxInventory']['unusedAssetIndexGitPath'],
                    'sha256': result['palworldVfxSfxInventory']['unusedAssetIndexSha256'],
                },
                {
                    'gitPath': result['palworldVfxSfxInventory']['entryGitPath'],
                    'sha256': result['palworldVfxSfxInventory']['entrySha256'],
                },
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
                {
                    'gitPath': result['poppVfxDependencySupport']['runtimeCandidates']['gitPath'],
                    'sha256': result['poppVfxDependencySupport']['runtimeCandidates']['sha256'],
                },
                *[
                    evidence
                    for candidate in result['poppVfxDependencySupport']['runtimeCandidates']['candidates']
                    for evidence in (candidate['runtimeTexture'], candidate['vfxDocument'])
                ],
                result['historicalModelRestorationReceipt'],
                result['historicalModelOptionRegistration'],
                result['historicalModelLineageAudit'],
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

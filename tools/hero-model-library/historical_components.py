"""Validate recovered historical body components without inventing hero registrations."""
import hashlib
import json
from pathlib import Path
from current_component_policy import current_policy_for


PRESERVED_RECOVERED_COMPONENTS = {
    'historical-astralym-7bc2fa3f8': (
        '618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8',
        'community:palworld-astralym',
    ),
    'historical-jetragon-7bc2fa3f8': (
        # ⭐ PR #1152 合併準備：出貨版本換成貼圖背板修補後的位元組；
        #   歷史原件 0d9eed3a… 逐位元組保留在 sourceArtifact.gitArchivePath（同 kita-kita／lord-nightmares 的前例）
        '0d533af89dee1680ed68dc321b209b6c3e70871027c6ada53656d625cbff522d',
        'community:palworld-jetragon',
    ),
    'historical-kita-kita-7bc2fa3f8': (
        'be6148045377a8207a09f7bb5834f4e9104eaadc6822d8a94c315f4510c9740e',
        'mba:Chara14',
    ),
    'historical-lord-nightmares-7bc2fa3f8': (
        '98ba248a71e17db1bc3ac783d89d4f6aa1c683cd659ad0bd2d5ae89e32b49b8c',
        'mba:Chara13',
    ),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def _non_image_data_identical(before, after):
    """⭐ 證明的**唯一住處**是 `tools/model-fix/record_backdrop_repairs.py`，⛔ 這裡不抄一份。"""
    import importlib.util
    path = Path(__file__).resolve().parents[1] / 'model-fix' / 'record_backdrop_repairs.py'
    spec = importlib.util.spec_from_file_location('ggd_record_backdrop_repairs', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        proof = module.non_image_data_identical(before, after)
    except AssertionError:
        return False
    return proof.get('nonImageBufferViewsByteIdentical') is True and proof.get('gltfJsonIdenticalExceptImageLayout') is True


def file_pin(path):
    path = Path(path)
    return {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def verify_pin(pin, repo):
    path = (Path(repo) / pin['gitPath']).resolve()
    require(path.is_relative_to(Path(repo).resolve()), 'Historical component escapes checkout')
    require(path.is_file(), 'Missing historical component evidence: ' + str(path))
    actual = file_pin(path)
    require((actual['bytes'], actual['sha256']) == (pin['bytes'], pin['sha256']), 'Changed historical component pin: ' + str(path))
    return path


def source_historical_artifacts(downloads, repo):
    """Expose exact pre-normalization Git blobs as archived, non-runtime sources."""
    repo = Path(repo).resolve()
    result = []
    seen = set()
    for source in downloads.get('publicSources', []) + downloads.get('paidSources', []):
        for candidate in source.get('componentCandidates', []):
            artifact = candidate.get('sourceArtifact')
            if (not artifact or not artifact.get('gitPathAtIngest')
                    or candidate.get('recoveredFromGitCommit') != '7bc2fa3f8'
                    or candidate.get('resourceRole') != 'independent-historical-model-body-component'):
                continue
            artifact_id = candidate['id'] + ':exact-historical-source'
            require(artifact_id not in seen, 'Duplicate historical source artifact ID: ' + artifact_id)
            seen.add(artifact_id)
            pin = {
                'gitPath': artifact.get('gitArchivePath', artifact['gitPathAtIngest']),
                'bytes': artifact['bytes'],
                'sha256': artifact['sha256'],
            }
            model_path = verify_pin(pin, repo)
            result.append({
                'id': artifact_id,
                'sourceId': source['id'],
                'sourceCandidateId': candidate['id'],
                'nameZh': candidate['nameZh'],
                'originalName': candidate['originalName'],
                'workZh': candidate['workZh'],
                'sourceGame': candidate['sourceGame'],
                'platform': candidate['platform'],
                'variant': candidate['variant'] + '／7bc2fa3f8 原始位元組',
                'resourceRole': 'exact-historical-model-source-artifact',
                'assetKinds': candidate['assetKinds'],
                'bytes': artifact['bytes'],
                'sha256': artifact['sha256'],
                'gitPath': artifact.get('gitArchivePath', artifact['gitPathAtIngest']),
                'gitAbsolutePath': str(model_path),
                'recoveredFromGitCommit': candidate['recoveredFromGitCommit'],
                'normalizedReplacementSha256': candidate['sha256'],
                'normalizedReplacementGitPath': candidate['gitPath'],
                'componentReady': False,
                'runtimeSelectable': False,
                'runtimeDropdownRegistered': False,
                'defaultEligible': False,
                'automaticEligible': False,
                'fullHeroModel': False,
                'heroIds': [],
                'relatedHeroIds': [],
                'readiness': 'archived-exact-historical-source; normalized replacement retained separately',
                'limitations': list(candidate.get('limitations', [])) + [
                    '保留合併前的精確 Git 位元組；未取代材質正規化版本，也不宣稱可切換或已部署。'
                ],
                'sourceArtifactBackup': {
                    key: artifact[key]
                    for key in ('s3Uri', 's3ArchiveMember', 'backupReceiptPath', 'backupReceiptSha256')
                    if artifact.get(key) is not None
                },
            })
    return result


def source_historical_components(downloads, repo):
    repo = Path(repo).resolve()
    result = []
    seen = set()
    for source in downloads.get('publicSources', []) + downloads.get('paidSources', []):
        for candidate in source.get('componentCandidates', []):
            if not candidate.get('componentReady') or candidate.get('resourceRole') != 'independent-historical-model-body-component':
                continue
            require(candidate['id'] not in seen, 'Duplicate historical component ID: ' + candidate['id'])
            seen.add(candidate['id'])
            require(candidate.get('sourceId') == source['id'], 'Historical component source mismatch')
            require(candidate.get('sourceClass') == source.get('sourceClass'), 'Historical source classification mismatch')
            for field in ['runtimeSelectable', 'defaultEligible', 'automaticEligible', 'runtimeDropdownRegistered', 'fullHeroModel']:
                require(candidate.get(field) is False, 'Historical component cannot enable ' + field)
            require(candidate.get('heroIds') == [] and candidate.get('relatedHeroIds') == [], 'Historical component cannot bind a hero')
            require(candidate.get('proceduralAnimationCount') == 0 and candidate.get('nativeAnimationCount', 0) > 0,
                    'Historical animated body must retain native clips only')
            expected = 'content/assets/models/community/' + candidate['sha256'] + '.glb'
            require(candidate.get('gitPath') == expected, 'Noncanonical historical component path')
            model_path = verify_pin(candidate, repo)
            source_artifact = candidate.get('sourceArtifact')
            historical_sha = candidate['sha256'] if source_artifact is None else source_artifact['sha256']
            historical_bytes = candidate['bytes'] if source_artifact is None else source_artifact['bytes']
            if source_artifact is not None:
                normalization_path = verify_pin(candidate['normalizationEvidence'], repo)
                normalization = json.loads(normalization_path.read_text())
                normalized_rows = [item for item in normalization.get('records', []) if item.get('candidateId') == candidate['id']]
                require(len(normalized_rows) == 1, 'Missing historical material-normalization record')
                normalized = normalized_rows[0]
                require((normalized['source']['sha256'], normalized['source']['bytes']) == (historical_sha, historical_bytes),
                        'Historical normalization source mismatch')
                require((normalized['output']['sha256'], normalized['output']['bytes']) == (candidate['sha256'], candidate['bytes']),
                        'Historical normalization output mismatch')
                if normalized.get('schema') == 'ggd-model-texture-backdrop-repair@1':
                    # ⭐ PR #1152 合併準備（2026-09-14）：`MODEL_TEXTURE_BACKDROP` 閘晚於這批歷史復原才存在，
                    #   而「BLEND 平面卡的不透明底色」與「自發光藏著亮色」⛔ 只改材質 JSON 修不掉 —— 要動貼圖像素。
                    #   ⇒ 契約擴充成兩類，⭐ 但這一類**由這裡從位元組重算證明**，⛔ 不信紀錄上填的布林：
                    #   歷史原件（sourceArtifact.gitArchivePath）與出貨版本之間，**非貼圖的 bufferView 必須逐位元組相同**、
                    #   glTF JSON 除了貼圖佈局以外必須相同 ⇒ 幾何・骨架・動作一個位元組都沒動。
                    archive = verify_pin({'gitPath': source_artifact['gitArchivePath'], 'bytes': historical_bytes, 'sha256': historical_sha}, repo)
                    require(_non_image_data_identical(archive.read_bytes(), model_path.read_bytes()),
                            'Historical texture repair changed non-image data')
                else:
                    require(normalized.get('binaryChunkByteIdentical') is True and normalized.get('nonMaterialJsonByteSemanticIdentical') is True,
                            'Historical normalization changed non-material data')
            evidence_path = verify_pin(candidate['validationEvidence'], repo)
            evidence = json.loads(evidence_path.read_text())
            if evidence.get('schema') == 'ggd-historical-astralym-decimation-validation@1':
                require(candidate.get('parentComponentId') == 'historical-astralym-7bc2fa3f8', 'Astralym decimation parent mismatch')
                require(evidence.get('candidateId') == candidate['id'] and evidence.get('heroId') == candidate['historicalAcceptanceId'],
                        'Astralym decimation identity mismatch')
                # ⭐ 減面驗證（含 15 組三視角 A/B）是對**減面產物本身**跑的。之後若再做過貼圖背板修補，
                #   那一份產物就是 sourceArtifact（逐位元組封存）⇒ 證據對它比，⛔ 不是對修補後的出貨版本比 ——
                #   修補後與封存之間「只動了貼圖位元組」由上面的證明守著。
                decimated = (source_artifact['sha256'], source_artifact['bytes']) if source_artifact is not None else (candidate['sha256'], candidate['bytes'])
                require((evidence.get('candidate', {}).get('git', {}).get('sha256'), evidence.get('candidate', {}).get('git', {}).get('bytes')) ==
                        decimated, 'Astralym decimation output mismatch')
                require(evidence.get('originalRetained', {}).get('git', {}).get('sha256') == PRESERVED_RECOVERED_COMPONENTS[candidate['parentComponentId']][0],
                        'Astralym original retention mismatch')
                require(evidence.get('formalHeroAdoptionEligible') is True and evidence.get('ggdModelBudget', {}).get('errors') == [],
                        'Astralym decimation current contract failed')
                require(evidence.get('rig', {}).get('ok') is True and evidence.get('animationProvenance', {}).get('nativeClipCount') == candidate['nativeAnimationCount'],
                        'Astralym decimation rig/native clips failed')
                require(evidence.get('preservation', {}).get('skinJointsAndInverseBindMatricesExact') is True and
                        evidence.get('preservation', {}).get('animationChannelsAndKeyValuesExact') is True,
                        'Astralym decimation skin or animation values changed')
            else:
                require(evidence.get('schema') == 'ggd-historical-model-recovery-validation@1', 'Unexpected historical validation schema')
                require(evidence.get('historicalCommit') == candidate.get('recoveredFromGitCommit'), 'Historical recovery commit mismatch')
                require(evidence.get('allRecoveredBytesMatchHistoricalGit') is True, 'Historical byte recovery not verified')
                require(evidence.get('allKhronosErrorsZero') is True and evidence.get('allCurrentGgdBudgetErrorsZero') is True,
                        'Historical component contract validation failed')
                rows = [row for row in evidence.get('records', []) if row.get('id') == candidate['id']]
                require(len(rows) == 1, 'Missing historical validation record: ' + candidate['id'])
                row = rows[0]
                require((row.get('sha256'), row.get('bytes')) == (historical_sha, historical_bytes), 'Historical source validation output mismatch')
                require(row.get('historicalModelKey') == candidate.get('historicalModelKey'), 'Historical model key mismatch')
                require(row.get('identityIds') == candidate.get('identityIds'), 'Historical identity mismatch')
                require(row.get('byteIdenticalToHistoricalGitBlob') is True, 'Historical Git blob match missing')
                require(row.get('ggdInspection', {}).get('clipCount') == candidate['nativeAnimationCount'], 'Historical clip count mismatch')
                require(row.get('currentReplacement', {}).get('glbSha256') == candidate.get('currentReplacementSha256'), 'Current replacement pin mismatch')
            visual_path = verify_pin(candidate['visualEvidence'], repo)
            visual = json.loads(visual_path.read_text())
            if visual.get('schema') == 'ggd-historical-astralym-visual-comparison@1':
                # ⭐ 同上：15 組三視角 A/B 是**對減面產物渲的** ⇒ 對封存那一份比。
                #   ⚠️ 它⛔ 沒有對貼圖修補後的位元組重跑 —— 修補紀錄的 visualNote 明寫，⛔ 不假裝這份視覺證據涵蓋修補。
                rendered = source_artifact['sha256'] if source_artifact is not None else candidate['sha256']
                require(visual.get('candidate', {}).get('sha256') == rendered, 'Astralym visual candidate mismatch')
                require(visual.get('allChangedPixelPctAtChannelDeltaGt10Under5') is True and
                        visual.get('allLitClassificationXorPctAtLuma128Under5') is True and
                        visual.get('humanReview', {}).get('result') == 'accepted', 'Astralym visual acceptance failed')
                for pin in visual.get('contactSheets', []):
                    verify_pin({'gitPath': str(Path(candidate['visualEvidence']['gitPath']).parent / pin['path']),
                                'bytes': pin['bytes'], 'sha256': pin['sha256']}, repo)
            else:
                require(visual.get('schema') == 'ggd-historical-model-visual-acceptance@1', 'Unexpected historical visual acceptance schema')
                visual_rows = [item for item in visual.get('records', []) if item.get('id') == candidate['id']]
                require(len(visual_rows) == 1 and visual_rows[0].get('accepted') is True,
                        'Missing historical component visual acceptance: ' + candidate['id'])
                require(visual_rows[0].get('scope') == 'independent-historical-model-body-component-static-visual-integrity',
                        'Historical visual acceptance scope mismatch')
                for pin in visual_rows[0].get('reviewViews', []) + [visual_rows[0]['webglProof']]:
                    verify_pin(pin, repo)
            result.append(dict(candidate, gitAbsolutePath=str(model_path), currentPolicyAudit=current_policy_for(candidate, repo)))
    recovered = {row['id']: row for row in result}
    for component_id, (digest, identity_id) in PRESERVED_RECOVERED_COMPONENTS.items():
        require(component_id in recovered, 'Missing required recovered historical component: ' + component_id)
        component = recovered[component_id]
        require(component['sha256'] == digest, 'Changed recovered historical component SHA-256: ' + component_id)
        require(identity_id in component['identityIds'], 'Changed recovered historical component identity: ' + component_id)
    return result

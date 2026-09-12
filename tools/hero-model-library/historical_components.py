"""Validate recovered historical body components without inventing hero registrations."""
import hashlib
import json
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


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
                require(normalized.get('binaryChunkByteIdentical') is True and normalized.get('nonMaterialJsonByteSemanticIdentical') is True,
                        'Historical normalization changed non-material data')
            evidence_path = verify_pin(candidate['validationEvidence'], repo)
            evidence = json.loads(evidence_path.read_text())
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
            require(visual.get('schema') == 'ggd-historical-model-visual-acceptance@1', 'Unexpected historical visual acceptance schema')
            visual_rows = [item for item in visual.get('records', []) if item.get('id') == candidate['id']]
            require(len(visual_rows) == 1 and visual_rows[0].get('accepted') is True,
                    'Missing historical component visual acceptance: ' + candidate['id'])
            require(visual_rows[0].get('scope') == 'independent-historical-model-body-component-static-visual-integrity',
                    'Historical visual acceptance scope mismatch')
            for pin in visual_rows[0].get('reviewViews', []) + [visual_rows[0]['webglProof']]:
                verify_pin(pin, repo)
            for pin in evidence.get('currentContractPins', []):
                contract = (repo / pin['path']).resolve()
                require(contract.is_relative_to(repo) and contract.is_file(), 'Historical contract pin escapes checkout')
                require(file_pin(contract)['sha256'] == pin['sha256'], 'Stale historical contract pin: ' + pin['path'])
            result.append(dict(candidate, gitAbsolutePath=str(model_path)))
    return result

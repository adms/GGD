"""Validate independently reusable skinned components without promoting heroes."""
import hashlib
import json
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def file_pin(path):
    path = Path(path)
    return dict(absolutePath=str(path.resolve()), bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def verify_pin(pin, repo):
    path=(Path(repo)/pin['gitPath']).resolve()
    require(path.is_relative_to(Path(repo).resolve()), 'Evidence escapes checkout')
    actual=file_pin(path)
    require((actual['bytes'],actual['sha256']) == (pin['bytes'],pin['sha256']), 'Changed pinned file: '+str(path))
    return path


def validate_component(candidate, repo):
    for field in ['runtimeSelectable','defaultEligible','automaticEligible','runtimeDropdownRegistered','fullHeroModel']:
        require(candidate.get(field) is False, 'Independent skinned component cannot enable '+field)
    require(candidate.get('heroIds') == [] and candidate.get('relatedHeroIds',[]) == [], 'Independent skinned component cannot bind a hero')
    require(candidate.get('resourceRole') == 'independent-static-skinned-model-component', 'Unsupported skinned component role')
    require(candidate.get('nativeAnimationCount') == 0 and candidate.get('proceduralAnimationCount') == 0,
            'Static component cannot claim animations')
    path=verify_pin(candidate, repo)
    require(candidate.get('gitPath') == 'content/assets/models/community/'+candidate['sha256']+'.glb', 'Noncanonical component Git path')
    source_artifact=candidate.get('sourceArtifact')
    accepted_sha=candidate['sha256'] if source_artifact is None else source_artifact['sha256']
    accepted_bytes=candidate['bytes'] if source_artifact is None else source_artifact['bytes']
    if source_artifact is not None:
        normalization=json.loads(verify_pin(candidate['normalizationEvidence'],repo).read_text())
        rows=[row for row in normalization.get('records',[]) if row.get('candidateId') == candidate['id']]
        require(len(rows) == 1, 'Missing component material-normalization record')
        row=rows[0]
        require((row['source']['sha256'],row['source']['bytes']) == (accepted_sha,accepted_bytes), 'Normalization source pin mismatch')
        require((row['output']['sha256'],row['output']['bytes']) == (candidate['sha256'],candidate['bytes']), 'Normalization output pin mismatch')
        require(row.get('binaryChunkByteIdentical') is True and row.get('nonMaterialJsonByteSemanticIdentical') is True,
                'Component normalization changed geometry, animation, image or other JSON data')
    validation=json.loads(verify_pin(candidate['validationEvidence'],repo).read_text())
    schema=validation.get('schema')
    if schema == 'ggd.zero-lancer-current-validation@1':
        require(validation.get('role') == 'independent-skinned-model-component', 'Validation is not an independent skinned component')
        require((validation.get('outputSha256'),validation.get('outputBytes')) == (accepted_sha,accepted_bytes), 'Validation source-output pin mismatch')
        require(validation.get('outputByteIdenticalToAcquiredCandidate') is True, 'Byte-identical source rebuild missing')
        require(validation.get('skinCount') == 1 and validation.get('joints') == 59 and validation.get('clips') == [], 'Unexpected skin/animation shape')
        require(validation.get('budget',{}).get('errors') == [], 'Component exceeds current budget')
        issues=validation.get('uploadReport',{}).get('issues',{})
        require(validation.get('heroModelPreparationPerformed') is False and validation.get('backendRegistrationPerformed') is False,
                'Component cannot claim hero preparation or backend registration')
    elif schema == 'ggd-ssbu-blend-component-validation@1':
        require(validation.get('candidateId') == candidate.get('conversionCandidateId'), 'SSBU conversion candidate mismatch')
        glb=validation.get('glb',{})
        require((glb.get('sha256'),glb.get('bytes')) == (candidate['sha256'],candidate['bytes']), 'SSBU validation output pin mismatch')
        inspection=validation.get('ggdInspection',{})
        require(inspection.get('skinCount') == candidate.get('skinCount') and inspection.get('joints') == [candidate.get('jointCount')],
                'Unexpected SSBU skin/joint shape')
        require(inspection.get('skinnedPrimitives') == inspection.get('drawPrimitives') == candidate.get('drawPrimitives'),
                'Every SSBU model primitive must be skinned')
        require(inspection.get('clips') == [] and inspection.get('clipCount') == 0, 'Static SSBU component cannot contain clips')
        require(inspection.get('budget',{}).get('errors') == [], 'Component exceeds current budget')
        issues=inspection.get('uploadReport',{}).get('issues',{})
        khronos=validation.get('khronosIssues',{})
        require(khronos.get('numErrors') == 0 and khronos.get('numWarnings') == 0 and khronos.get('truncated') is False,
                'Direct Khronos validation failed')
        require(validation.get('structuralValidationPassed') is True and validation.get('finiteFloatAccessors',{}).get('passed') is True,
                'SSBU structural or finite-accessor validation failed')
        require(validation.get('runtimeReady') is False and validation.get('runtimeSelectable') is False and validation.get('defaultEligible') is False,
                'SSBU component validation cannot claim runtime readiness')
    elif schema == 'ggd.rezero-static-component-validation@1':
        require(validation.get('candidateId') == candidate.get('conversionCandidateId'), 'Re:Zero conversion candidate mismatch')
        glb=validation.get('glb',{})
        require((glb.get('sha256'),glb.get('bytes')) == (candidate['sha256'],candidate['bytes']),
                'Re:Zero validation output pin mismatch')
        inspection=validation.get('ggdInspection',{})
        require(inspection.get('skinCount') == candidate.get('skinCount') and
                inspection.get('joints') == [candidate.get('jointCount')], 'Unexpected Re:Zero skin/joint shape')
        require(inspection.get('skinnedPrimitives') == inspection.get('drawPrimitives') == candidate.get('drawPrimitives'),
                'Every Re:Zero model primitive must be skinned')
        require(inspection.get('clips') == [] and inspection.get('clipCount') == 0,
                'Static Re:Zero component cannot contain clips')
        require(inspection.get('budget',{}).get('errors') == [], 'Re:Zero component exceeds current budget')
        issues=validation.get('khronosIssues',{})
        require(issues.get('numErrors') == 0 and issues.get('numWarnings') == 0 and issues.get('truncated') is False,
                'Direct Re:Zero Khronos validation failed')
        require(validation.get('structuralValidationPassed') is True and
                validation.get('finiteFloatAccessors',{}).get('passed') is True and
                validation.get('allAccessorBytesPreserved') is True,
                'Re:Zero structural, finite-accessor or normalization preservation check failed')
        require(validation.get('runtimeReady') is False and validation.get('runtimeSelectable') is False and
                validation.get('defaultEligible') is False, 'Re:Zero validation cannot claim runtime readiness')
        rebuild=json.loads(verify_pin(candidate['sourceRebuildEvidence'],repo).read_text())
        require(rebuild.get('schema') == 'ggd.rezero-static-component-source-rebuild@1' and
                rebuild.get('componentId') == candidate['id'], 'Unexpected Re:Zero rebuild proof')
        require(rebuild.get('sourceConversionByteIdentical') is True and
                rebuild.get('normalizedGlbByteIdentical') is True and
                rebuild.get('outputSha256') == candidate['sha256'], 'Re:Zero deterministic rebuild proof failed')
    else:
        raise ValueError('Unexpected skinned validation schema: '+str(schema))
    require(issues.get('numErrors') == 0 and issues.get('numWarnings') == 0 and issues.get('truncated') is False,
            'Component upload validation failed')
    for pin in validation.get('contractPins',[]):
        code=(Path(repo)/pin['path']).resolve()
        require(code.is_relative_to(Path(repo).resolve()) and code.is_file(), 'Contract pin escapes checkout')
        require(file_pin(code)['sha256'] == pin['sha256'], 'Stale component contract pin: '+pin['path'])
    acceptance=json.loads(verify_pin(candidate['acceptanceEvidence'],repo).read_text())
    matches=[row for row in acceptance.get('components',[]) if row.get('id') == candidate['id']]
    require(len(matches) == 1 and matches[0].get('accepted') is True,
            'Missing parent acceptance for skinned component')
    require(matches[0].get('scope') == 'independent-static-skinned-model-component' and matches[0].get('sha256') == accepted_sha,
            'Parent acceptance scope or SHA mismatch')
    for evidence in ['deliveryEvidence','visualEvidence','webglProofEvidence','sourceFidelityEvidence','sourceRebuildEvidence']:
        if evidence not in candidate:
            continue
        verify_pin(candidate[evidence],repo)
    if schema == 'ggd-ssbu-blend-component-validation@1':
        rebuild=json.loads(verify_pin(candidate['sourceRebuildEvidence'],repo).read_text())
        expected_rebuild_schemas={
            'ssbu-zero-c00-static-skinned-v1': 'ggd.ssbu-zero-source-rebuild@1',
            'ssbu-mario-c00-static-skinned-v1': 'ggd.ssbu-mario-source-rebuild@1',
            'ssbu-mewtwo-c00-static-skinned-v1': 'ggd.ssbu-mewtwo-source-rebuild@1',
            'ssbu-ryu-c00-static-skinned-v1': 'ggd.ssbu-ryu-source-rebuild@1',
            'ssbu-pickel-steve-c00-static-skinned-v1': 'ggd.ssbu-pickel-steve-source-rebuild@1',
            'ssbu-pickel-alex-c01-static-skinned-v1': 'ggd.ssbu-pickel-alex-source-rebuild@1',
            'ssbu-ptrainer-male-c00-static-skinned-v1': 'ggd.ssbu-ptrainer-male-source-rebuild@1',
            'ssbu-ptrainer-female-c01-static-skinned-v1': 'ggd.ssbu-ptrainer-female-source-rebuild@1',
        }
        require(rebuild.get('schema') == expected_rebuild_schemas.get(candidate['id']), 'Unexpected SSBU rebuild schema')
        require(rebuild.get('componentId') == candidate['id'], 'SSBU rebuild component ID mismatch')
        require(rebuild.get('byteIdenticalRebuild') is True and rebuild.get('bothValidationsPassed') is True,
                'SSBU deterministic rebuild proof failed')
        require(rebuild.get('outputSha256') == candidate['sha256'], 'SSBU rebuild output pin mismatch')
    return dict(candidate,gitAbsolutePath=str(path))


def source_skinned_components(downloads, repo):
    result=[];seen=set()
    for source in downloads.get('publicSources',[])+downloads.get('paidSources',[]):
        for candidate in source.get('componentCandidates',[]):
            if not candidate.get('componentReady'):
                continue
            require(candidate['id'] not in seen, 'Duplicate component ID: '+candidate['id']);seen.add(candidate['id'])
            require(candidate.get('sourceId') == source['id'], 'Component source mismatch')
            require(candidate.get('sourceClass') == source.get('sourceClass'), 'Component source classification mismatch')
            if candidate.get('resourceRole') != 'independent-static-skinned-model-component':
                continue
            result.append(validate_component(candidate,repo))
    return result

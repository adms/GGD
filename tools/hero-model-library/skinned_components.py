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
    validation=json.loads(verify_pin(candidate['validationEvidence'],repo).read_text())
    require(validation.get('schema') == 'ggd.zero-lancer-current-validation@1', 'Unexpected skinned validation schema')
    require(validation.get('role') == 'independent-skinned-model-component', 'Validation is not an independent skinned component')
    require((validation.get('outputSha256'),validation.get('outputBytes')) == (candidate['sha256'],candidate['bytes']), 'Validation output pin mismatch')
    require(validation.get('outputByteIdenticalToAcquiredCandidate') is True, 'Byte-identical source rebuild missing')
    require(validation.get('skinCount') == 1 and validation.get('joints') == 59 and validation.get('clips') == [], 'Unexpected skin/animation shape')
    require(validation.get('budget',{}).get('errors') == [], 'Component exceeds current budget')
    issues=validation.get('uploadReport',{}).get('issues',{})
    require(issues.get('numErrors') == 0 and issues.get('numWarnings') == 0 and issues.get('truncated') is False,
            'Component upload validation failed')
    require(validation.get('heroModelPreparationPerformed') is False and validation.get('backendRegistrationPerformed') is False,
            'Component cannot claim hero preparation or backend registration')
    for pin in validation.get('contractPins',[]):
        code=(Path(repo)/pin['path']).resolve()
        require(code.is_relative_to(Path(repo).resolve()) and code.is_file(), 'Contract pin escapes checkout')
        require(file_pin(code)['sha256'] == pin['sha256'], 'Stale component contract pin: '+pin['path'])
    acceptance=json.loads(verify_pin(candidate['acceptanceEvidence'],repo).read_text())
    matches=[row for row in acceptance.get('components',[]) if row.get('id') == candidate['id']]
    require(len(matches) == 1 and matches[0].get('accepted') is True,
            'Missing parent acceptance for skinned component')
    require(matches[0].get('scope') == 'independent-static-skinned-model-component' and matches[0].get('sha256') == candidate['sha256'],
            'Parent acceptance scope or SHA mismatch')
    for evidence in ['deliveryEvidence','visualEvidence','sourceFidelityEvidence','sourceRebuildEvidence']:
        verify_pin(candidate[evidence],repo)
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

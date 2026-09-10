"""Admission and catalog validation for independent weapon props, never heroes."""
import hashlib
import json
from pathlib import Path

CONTRACT_PATHS = {
    'packages/shared/src/content/modelUpload/normalize.ts',
    'packages/shared/src/content/modelUpload/inspect.ts',
    'packages/shared/src/content/modelUpload/glb.ts',
    'packages/shared/src/content/modelUpload/heroModel.ts',
    'packages/shared/src/content/modelUpload/budget.ts',
    'apps/content-api/src/resizeImage.node.ts',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def file_pin(path):
    path = Path(path)
    return dict(absolutePath=str(path.resolve()), bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def verify_pin(pin, repo=None):
    if 'gitPath' in pin:
        require(repo is not None, 'Git evidence requires a checkout')
        path = (Path(repo) / pin['gitPath']).resolve()
        require(path.is_relative_to(Path(repo).resolve()), 'Evidence escapes checkout')
    else:
        path = Path(pin['absolutePath'])
    actual = file_pin(path)
    require((actual['sha256'], actual['bytes']) == (pin['sha256'], pin['bytes']), 'Changed pinned file: ' + str(path))
    return path


def verify_validation(validation, model, repo):
    require(validation.get('schema') == 'ggd.dai-rigid-prop-current-validation@1', 'Unexpected weapon validation schema')
    require(validation.get('role') == 'independent-weapon-component', 'Not an independent weapon validation')
    require((validation.get('outputSha256'), validation.get('outputBytes')) == (model['sha256'], model['bytes']), 'Validation model pin mismatch')
    require(validation.get('budget', {}).get('errors') == [], 'Weapon component exceeds current budget')
    issues = validation.get('uploadReport', {}).get('issues', {})
    require(issues.get('numErrors') == 0 and issues.get('truncated') is False, 'Weapon upload validation failed')
    require(validation.get('allAccessorBytesPreserved') is True and validation.get('materialJsonPreserved') is True, 'Weapon normalization preservation missing')
    require(validation.get('skins') == 0 and validation.get('clips') == [], 'Rigid weapon contains skeleton or animations')
    require(validation.get('heroModelPreparationPerformed') is False and validation.get('backendRegistrationPerformed') is False, 'Weapon cannot claim hero registration')
    pins = validation.get('toolPins', [])
    require(CONTRACT_PATHS <= {pin['path'] for pin in pins}, 'Missing weapon contract pins')
    for pin in pins:
        path = (Path(repo) / pin['path']).resolve()
        require(path.is_relative_to(Path(repo).resolve()), 'Contract pin escapes checkout')
        require(file_pin(path)['sha256'] == pin['sha256'], 'Stale weapon contract pin: ' + pin['path'])


def verify_acceptance(acceptance, candidate, delivery_sha):
    require(acceptance.get('schema') == 'ggd-weapon-component-acceptance@1', 'Unexpected component acceptance schema')
    require(acceptance.get('deliverySha256') == delivery_sha, 'Acceptance delivery pin mismatch')
    rows = [row for row in acceptance.get('components', []) if row.get('id') == candidate['id']]
    require(len(rows) == 1, 'Missing or duplicate component acceptance: ' + candidate['id'])
    row = rows[0]
    require(row.get('accepted') is True and row.get('scope') == 'independent-weapon-prop', 'Weapon component acceptance pending')
    require(row.get('sha256') == candidate['sha256'], 'Acceptance model pin mismatch')


def source_weapon_components(downloads, repo):
    """Read ready props from the existing central sources, retaining all variants."""
    repo = Path(repo).resolve()
    result = []
    seen = set()
    for source in downloads.get('publicSources', []) + downloads.get('paidSources', []):
        for candidate in source.get('componentCandidates', []):
            if not candidate.get('componentReady'):
                continue
            require(candidate['id'] not in seen, 'Duplicate component ID: ' + candidate['id'])
            seen.add(candidate['id'])
            require(candidate.get('sourceId') == source['id'], 'Component source mismatch')
            require(candidate.get('sourceClass') == source.get('sourceClass'), 'Component source classification mismatch')
            require(candidate.get('resourceRole') == 'weapon-prop', 'Unsupported independent component role')
            for field in ['runtimeSelectable', 'defaultEligible', 'automaticEligible', 'runtimeDropdownRegistered', 'fullHeroModel']:
                require(candidate.get(field) is False, 'Independent component cannot enable ' + field)
            require(candidate.get('heroIds') == [], 'Independent component cannot bind heroIds')
            for hero_id in candidate.get('relatedHeroIds', []):
                require(hero_id in source.get('heroIds', []), 'Unverified related hero association')
                path = repo / 'content/champions' / (hero_id + '.json')
                require(path.is_file() and json.loads(path.read_text())['id'] == hero_id, 'Missing related hero definition')
            expected = 'content/assets/models/community/' + candidate['sha256'] + '.glb'
            require(candidate.get('gitPath') == expected, 'Noncanonical component Git path')
            path = verify_pin(candidate, repo)
            validation = json.loads(verify_pin(candidate['validationEvidence'], repo).read_text())
            verify_validation(validation, candidate, repo)
            acceptance = json.loads(verify_pin(candidate['acceptanceEvidence'], repo).read_text())
            verify_pin(candidate['deliveryEvidence'], repo)
            verify_pin(candidate['visualEvidence'], repo)
            verify_acceptance(acceptance, candidate, candidate['deliveryEvidence']['sha256'])
            result.append(dict(candidate, gitAbsolutePath=str(path)))
    return result

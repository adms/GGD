"""Merge two accepted Dai weapon props into the existing source, preserving it.

Run from a GGD checkout:
  python3 tools/hero-model-library/intake_dai_weapon_components.py DELIVERY --acceptance REVIEW --check
  python3 tools/hero-model-library/intake_dai_weapon_components.py DELIVERY --acceptance REVIEW --write

REVIEW is parent visual acceptance, not inferred from a successful conversion:
{"schema":"ggd-weapon-component-acceptance@1", "deliverySha256":"...",
 "components":[{"id":"...", "sha256":"...", "accepted":true,
                "scope":"independent-weapon-prop"}]}
Both delivered IDs must be covered. This copies only finished GLBs and pinned
evidence; it does not stage Git, upload S3, or regenerate central catalogs.
Stage the exact GLBs explicitly before current_resource_index.py --check-git.
"""
import argparse
import copy
import json
from pathlib import Path
import shutil

from weapon_components import file_pin, require, verify_acceptance, verify_pin, verify_validation

SOURCE_ID = 'patreon-shinteo-dai-daz-v2'
PROP_IDS = {'dai-shinteo-v2-sword-handheld-256-v1', 'dai-shinteo-v2-sword-back-256-v1'}


def prepare_intake(repo, downloads, delivery_path, acceptance_path):
    """Validate everything and prepare copies before any destination mutation."""
    repo = Path(repo).resolve()
    delivery_path, acceptance_path = Path(delivery_path).resolve(), Path(acceptance_path).resolve()
    delivery, acceptance = [json.loads(path.read_text()) for path in [delivery_path, acceptance_path]]
    result = copy.deepcopy(downloads)
    sources = [row for row in result.get('publicSources', []) + result.get('paidSources', []) if row['id'] == SOURCE_ID]
    require(len(sources) == 1, 'Expected one existing Dai source')
    source = sources[0]
    require(source.get('sourceClass') == 'community-mod-adaptation', 'Dai source classification changed')
    require(delivery.get('schema') == 'ggd.dai-rigid-props-delivery@1', 'Unexpected Dai delivery schema')
    require(any(row['sha256'] == delivery['sourceArchiveSha256'] for row in source.get('files', [])), 'Dai original archive pin mismatch')
    require({row['id'] for row in delivery['props']} == PROP_IDS and len(delivery['props']) == 2, 'Unexpected Dai prop set')
    require({row['id'] for row in acceptance.get('components', [])} == PROP_IDS and len(acceptance['components']) == 2, 'Acceptance must cover exactly both Dai props')
    delivery_sha = file_pin(delivery_path)['sha256']
    evidence_root = Path('materials/hero-model-library/priority-evidence/dai-rigid-props') / delivery_sha
    copies = []

    def evidence(path, name):
        pin = file_pin(path)
        relative = evidence_root / name
        copies.append((Path(path), repo / relative))
        return dict(gitPath=relative.as_posix(), bytes=pin['bytes'], sha256=pin['sha256'])

    delivery_pin = evidence(delivery_path, 'delivery.json')
    acceptance_pin = evidence(acceptance_path, 'acceptance.json')
    for field in ['sourceGeometryVerification', 'rebuildVerification']:
        evidence(verify_pin(delivery[field]), field + '.json')
    related = source.get('heroIds', [])
    for hero_id in related:
        path = repo / 'content/champions' / (hero_id + '.json')
        require(path.is_file() and json.loads(path.read_text())['id'] == hero_id, 'Related hero definition missing')
    for prop in delivery['props']:
        require(prop['sourceId'] == SOURCE_ID and prop.get('sourceClass') == 'community-mod-adaptation', 'Prop source mismatch')
        require(prop.get('heroIds') == [] and prop.get('defaultEligible') is False and prop.get('backendRegistration') is False, 'Prop cannot be a hero option')
        require(all(prop.get(key) == 0 for key in ['skins', 'nativeAnimations', 'proceduralAnimations', 'vfx', 'audio']), 'Not a rigid isolated prop')
        require(prop.get('rebuildByteIdentical') is True, 'Deterministic rebuild not verified')
        model = prop['component']
        local = verify_pin(model)
        validation_path = verify_pin(prop['validation'])
        validation = json.loads(validation_path.read_text())
        verify_validation(validation, model, repo)
        verify_acceptance(acceptance, dict(id=prop['id'], **model), delivery_sha)
        git_path = 'content/assets/models/community/' + model['sha256'] + '.glb'
        copies.append((local, repo / git_path))
        candidate = dict(id=prop['id'], sourceId=SOURCE_ID, nameZh=prop['nameZh'],
            characterName='小呆／達伊', originalName=prop['originalName'], workZh=prop['workZh'],
            sourceUrl=prop['sourceUrl'], author=source['author'], sourceClass=prop['sourceClass'],
            sourceGame=prop['sourceGame'], sourceVersion=prop['sourceVersion'], platform=prop['platform'],
            resourceRole='weapon-prop', assetKinds=['model-component', 'weapon', 'texture'],
            path=str(local), absolutePath=str(local), bytes=model['bytes'], sha256=model['sha256'],
            gitPath=git_path, s3Uri=None, sourceArchiveSha256=delivery['sourceArchiveSha256'],
            componentReady=True, runtimeSelectable=False, defaultEligible=False, automaticEligible=False,
            fullHeroModel=False, runtimeDropdownRegistered=False, heroIds=[], relatedHeroIds=list(related),
            nativeAnimationCount=0, proceduralAnimationCount=0, fullCharacterBodyCount=0,
            triangles=prop['triangles'], drawPrimitives=prop['drawPrimitives'], embeddedImages=prop['embeddedImages'],
            textureMaxEdge=prop['textureMaxEdge'], readiness='accepted-weapon-prop-pending-hero-attachment',
            limitations=prop['limitations'], deliveryEvidence=delivery_pin, acceptanceEvidence=acceptance_pin,
            validationEvidence=evidence(validation_path, prop['id'] + '-validation.json'),
            visualEvidence=evidence(verify_pin(prop['visualProof']), prop['id'] + '-visual-proof.json'))
        existing = [row for row in source.setdefault('componentCandidates', []) if row['id'] == candidate['id']]
        # A subsequent verified backup may add its URI/receipt without changing
        # the frozen component. Replay must retain that later provenance.
        require(len(existing) <= 1, 'Duplicate existing component ID')
        if existing:
            require(all(existing[0].get(key) == value for key, value in candidate.items() if key != 's3Uri'),
                    'Existing component ID has different data; retain prior revision')
        if not existing:
            source['componentCandidates'].append(candidate)
    for original, destination in copies:
        require(not destination.exists() or destination.read_bytes() == original.read_bytes(), 'Refusing to overwrite evidence or component: ' + str(destination))
    return result, copies


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('delivery', type=Path)
    parser.add_argument('--acceptance', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    repo = Path.cwd()
    index = repo / 'materials/hero-model-library/download-sources.json'
    result, copies = prepare_intake(repo, json.loads(index.read_text()), args.delivery, args.acceptance)
    if args.write:
        for original, destination in copies:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                shutil.copyfile(original, destination)
        index.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(components=2, fullCharacterBodies=0, heroBindings=0,
                         fileCopies=len(copies), written=args.write, s3Uploaded=False)))


if __name__ == '__main__':
    main()

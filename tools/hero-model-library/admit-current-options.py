#!/usr/bin/env python3
"""Append registered local model choices without rewriting historical resources.

Validation is based on checked source hashes and saved ModelVersions evidence.
This does not impersonate the legacy library validator or publish to S3.
"""
import argparse
import copy
import fcntl
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def local(root, relative):
    if not isinstance(relative, str):
        raise ValueError(f'Invalid relative path: {relative!r}')
    parts = PurePosixPath(relative)
    if parts.is_absolute() or '\\' in relative or '..' in parts.parts:
        raise ValueError(f'Unsafe relative path: {relative}')
    path = root / parts
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Escaping local path: {relative}')
    return path


def model_path(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]*', key):
        raise ValueError(f'Invalid model key: {key!r}')
    return f'models/{key}.json'


def checked(root, relative, expected):
    if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError(f'Invalid SHA-256 for {relative}')
    raw = local(root, relative).read_bytes()
    if digest(raw) != expected:
        raise ValueError(f'Source SHA-256 mismatch: {relative}')
    return raw


def existing_bundle(library, entry, model):
    base = local(library, entry['path'])
    if not base.resolve().is_relative_to((library / 'ready').resolve()):
        raise ValueError(f'Existing resource is outside ready/: {entry["id"]}')
    resource = json.loads(local(base, 'resource.json').read_bytes())
    if resource['id'] != entry['id'] or resource.get('model') != model_path(model['modelKey']):
        raise ValueError(f'Existing resource ID/model conflict: {entry["id"]}')
    checked(base, 'content/' + model_path(model['modelKey']), model['documentSha256'])
    checked(base, 'content/' + model['glbPath'], model['sha256'])
    proof_path = local(library, entry['validation'])
    if proof_path.resolve() != (base / 'validation.json').resolve():
        raise ValueError(f'Existing validation path conflict: {entry["id"]}')
    proof = json.loads(proof_path.read_bytes())
    if proof.get('status') != 'standardized' or not proof.get('files'):
        raise ValueError(f'Existing validation is incomplete: {entry["id"]}')
    for item in proof['files']:
        raw = checked(base, item['path'], item['sha256'])
        if len(raw) != item['bytes']:
            raise ValueError(f'Existing size mismatch: {item["path"]}')
    return resource, proof


def registration_evidence(content, model, document, versions):
    evidence = []
    for hero, version in versions:
        if version.get('binarySha256') != model['sha256']:
            continue
        relative = model_path(version['modelKey'])
        raw = local(content, relative).read_bytes()
        frozen = json.loads(raw)
        if frozen.get('id') != version['modelKey'] or (frozen.get('bodyVersion') or {}).get('sourceModelKey') != model['modelKey']:
            raise ValueError(f'Registered model provenance mismatch: {relative}')
        checked(content, frozen['glbPath'], version['binarySha256'])
        ignored = {'id', 'glbPath', 'bodyVersion', 'voxel'}
        if any(frozen.get(k) != value for k, value in document.items() if k not in ignored):
            continue
        evidence.append({'heroId': hero['heroId'], 'runtimeHeroId': hero.get('runtimeHeroId', hero['heroId']),
                         'versionModelKey': version['modelKey'], 'versionDocumentSha256': digest(raw),
                         'binarySha256': version['binarySha256']})
    if not evidence:
        raise ValueError(f'No registered version matches current model bytes/bindings: {model["modelKey"]}')
    return evidence


def build_plan(repo, library):
    repo, library = repo.resolve(), library.resolve()
    content, manifests = repo / 'content', repo / 'materials/hero-model-library'
    limits = json.loads((content / 'config/model-lod.json').read_bytes())
    catalog_raw = (library / 'catalog.json').read_bytes()
    catalog = json.loads(catalog_raw)
    if not isinstance(catalog.get('entries'), list):
        raise ValueError('Catalog entries must be an array')
    ids = [e['id'] for e in catalog['entries']]
    if len(ids) != len(set(ids)):
        raise ValueError('Existing catalog has duplicate IDs; refusing to rewrite history')
    old_by_id = {e['id']: e for e in catalog['entries']}
    inputs = {}
    for name in ['workflow-model-options.json', 'priority-runtime-options.json', 'priority-registration.json']:
        raw = (manifests / name).read_bytes()
        inputs[name] = {'sha256': digest(raw), 'document': json.loads(raw)}
    registered = {}
    for hero in inputs['priority-registration.json']['document']['heroes']:
        for version in hero.get('after', {}).get('versions', []):
            # The legacy snapshot is not an admitted candidate: it skipped upload validation.
            if version.get('source', {}).get('kind') != 'previous':
                registered.setdefault(version['sourceModelKey'], []).append((hero, version))
    groups, skipped = {}, []
    for name in ['workflow-model-options.json', 'priority-runtime-options.json']:
        for model in inputs[name]['document']['models']:
            key = model['modelKey']
            if key not in registered:
                skipped.append({'sourceId': model['id'], 'modelKey': key, 'reason': 'not-registered-in-after-versions'})
                continue
            group = groups.setdefault(key, [])
            if group and any(group[0][k] != model[k] for k in ['sha256', 'documentSha256', 'glbPath']):
                raise ValueError(f'Conflicting current deliveries for model key: {key}')
            if model not in group:
                group.append(model)
    planned, existing = [], []
    timestamp = datetime.now(timezone.utc).isoformat()
    for key, aliases in groups.items():
        model = aliases[0]
        if not model['glbPath'].startswith('assets/'):
            raise ValueError(f'Model GLB must be within content/assets/: {key}')
        document_raw = checked(content, model_path(key), model['documentSha256'])
        glb_raw = checked(content, model['glbPath'], model['sha256'])
        document = json.loads(document_raw)
        if document.get('id') != key or document.get('schema') != 'model@1' or document.get('glbPath') != model['glbPath']:
            raise ValueError(f'Model document disagrees with delivery: {key}')
        if len(glb_raw) != model['bytes']:
            raise ValueError(f'Source size mismatch: {key}')
        evidence = registration_evidence(content, model, document, registered[key])
        rid = 'ggd.model.' + model['documentSha256'][:24]
        brief = {'id': rid, 'modelKey': key, 'documentSha256': model['documentSha256'],
                 'glbSha256': model['sha256'], 'bytes': len(glb_raw), 'registeredHeroes': sorted({e['runtimeHeroId'] for e in evidence})}
        if rid in old_by_id:
            existing_bundle(library, old_by_id[rid], model)
            existing.append({**brief, 'path': old_by_id[rid]['path']})
            continue
        if any(item['entry']['id'] == rid for item in planned):
            raise ValueError(f'Truncated document digest collision: {rid}')
        relative = f'ready/{model["documentSha256"][:24]}/{model["sha256"][:16]}'
        resource = {'id': rid, 'kind': 'model-body', 'title': model.get('sourceCharacter', key),
                    'model': model_path(key), 'provenance': {'sources': copy.deepcopy(aliases),
                    'heroes': [{'id': e['heroId'], 'runtimeHeroId': e['runtimeHeroId']} for e in evidence],
                    'scope': 'Registered model-body choices; not full character/audio/VFX packages.'}}
        payload = {'resource.json': encoded(resource), 'content/' + model_path(key): document_raw,
                   'content/' + model['glbPath']: glb_raw}
        files = [{'path': name, 'bytes': len(raw), 'sha256': digest(raw)} for name, raw in sorted(payload.items())]
        content_digest = digest(json.dumps(files, sort_keys=True).encode())
        proof = {'schema': 'ggd-resource-validation@1', 'status': 'standardized', 'profile': 'model-body',
                 'content_digest': content_digest, 'files': files, 'source_repo': str(repo), 'checked_at': timestamp,
                 'validator_sha256': digest(Path(__file__).read_bytes()), 'validator_kind': 'registered-model-admission',
                 'validator_path': 'tools/hero-model-library/admit-current-options.py',
                 'checks': {'source_sha256': 'passed', 'saved_model_bindings': 'matched', 'registration': evidence,
                            'state_bindings': document.get('clipMap'), 'full_character_package': False,
                            'legacy_library_validator_rerun': False},
                 'registration_report_sha256': inputs['priority-registration.json']['sha256'],
                 'production_acceptance': 'not_claimed'}
        entry = {'id': rid, 'kind': 'model-body', 'title': resource['title'], 'status': 'standardized',
                 'path': relative, 'vfx_count': 0, 'content_digest': content_digest,
                 'validation': relative + '/validation.json', 'provenance': resource['provenance']}
        if local(library, relative).exists():
            # Recover a complete orphan from an interrupted catalog commit, without rewriting bytes.
            old_resource, old_proof = existing_bundle(library, entry, model)
            entry.update(title=old_resource['title'], provenance=old_resource['provenance'], content_digest=old_proof['content_digest'])
            payload = None
        else:
            payload['validation.json'] = encoded(proof)
        planned.append({'entry': entry, 'payload': payload, 'brief': {**brief, 'path': relative}, 'model': model})
    return {'repo': repo, 'library': library, 'initialHash': digest(catalog_raw), 'catalog': catalog,
            'inputs': {name: value['sha256'] for name, value in inputs.items()},
            'new': planned, 'existing': existing, 'skipped': skipped, 'timestamp': timestamp,
            'configuredChampionChannelLimit': limits['championChannelLimit']}


def publish_bundle(library, item):
    target = local(library, item['entry']['path'])
    if target.exists():
        existing_bundle(library, item['entry'], item['model'])
        return
    if item['payload'] is None:
        raise ValueError(f'Previously verified bundle disappeared: {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    # No-clobber publication: a concurrent directory creation fails instead of replacing it.
    target.mkdir()
    for name, raw in item['payload'].items():
        dest = local(target, name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open('xb') as stream:
            stream.write(raw)


def apply_plan(plan, receipt):
    library = plan['library']
    catalog_path = library / 'catalog.json'
    receipt = receipt.resolve()
    manifests = plan['repo'] / 'materials/hero-model-library'
    protected = {manifests / name for name in plan['inputs']}
    if (receipt.is_relative_to(library) or receipt.is_relative_to(plan['repo'] / 'content')
            or receipt in protected or receipt.suffix != '.json'):
        raise ValueError('Receipt must be a separate JSON file outside library/content/input manifests')
    if receipt.exists() and json.loads(receipt.read_bytes()).get('schema') != 'ggd-current-options-admission@1':
        raise ValueError('Receipt path contains an unrelated document; refusing to overwrite')
    def unchanged():
        if digest(catalog_path.read_bytes()) != plan['initialHash']:
            raise ValueError('Catalog changed since preflight; reload before admitting current options')
    # Other copies of this tool serialize; the hash check also catches external writers.
    with (library / '.catalog-admission.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        unchanged()
        for item in plan['new']:
            publish_bundle(library, item)
        unchanged()
        after = copy.deepcopy(plan['catalog'])
        if plan['new']:
            after['entries'].extend(item['entry'] for item in plan['new'])
            after['updated_at'] = plan['timestamp']
            raw = encoded(after)
            fd, name = tempfile.mkstemp(prefix='.catalog-admission-', dir=library)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                unchanged()
                os.replace(name, catalog_path)
            finally:
                if os.path.exists(name):
                    os.unlink(name)
        after_hash = digest(catalog_path.read_bytes())
    result = {'schema': 'ggd-current-options-admission@1', 'library': str(library),
              'catalogBeforeSha256': plan['initialHash'], 'catalogAfterSha256': after_hash,
              'beforeCount': len(plan['catalog']['entries']), 'afterCount': len(after['entries']),
              'oldEntriesPreserved': True, 'existingResourceBytesRewritten': False,
              'inputs': plan['inputs'], 'new': [item['brief'] for item in plan['new']],
              'existing': plan['existing'], 'skipped': plan['skipped'], 'checkedAt': plan['timestamp'],
              'configuredChampionChannelLimit': plan['configuredChampionChannelLimit'],
              'notes': ['Historical metadata (including old LoL 160-channel wording) remains verbatim.',
                        'Admission uses saved ModelVersions evidence, not a rerun of the legacy library validator.',
                        'Backend selection, whole-game acceptance and S3 publication are not performed.']}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_bytes(encoded(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--receipt', type=Path, required=True, help='Small Git-tracked admission receipt')
    args = parser.parse_args()
    result = apply_plan(build_plan(args.repo, args.library), args.receipt)
    print(json.dumps({'new': len(result['new']), 'existing': len(result['existing']), 'skipped': len(result['skipped']),
                      'before': result['beforeCount'], 'after': result['afterCount'], 'receipt': str(args.receipt.resolve())}))


if __name__ == '__main__':
    main()

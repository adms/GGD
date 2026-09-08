"""Snapshot this completed experiment's text to Git and every checkpoint to S3."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('store', HERE / 'hero-finetune-s3.py')
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)
RUN = 'frozen-facts-low-update-v1'
REL = Path('outputs/hero-forge-12b-restart-20260908')
INDEX = 'EXPERIMENT_INDEX.json'
RECEIPT = 'S3_RECEIPT.json'


def snapshot(workspace, out):
    store.require(not out.exists(), 'NEW_DESTINATION_REQUIRED')
    research = workspace / REL
    state = json.loads((research / RUN / 'state.json').read_text())
    store.require(state['status'] == 'completed-experiment-not-promoted', 'INCOMPLETE_EXPERIMENT')
    roots = [research / n for n in ['run-low-update-finetune.py', 'test_low_update_finetune.py',
             'LOW_UPDATE_PLAN.md', 'LOW_UPDATE_FINDINGS.md', 'verify-low-update.py',
             RUN, RUN + '-pilot', RUN + '-assessment']]
    selected = []
    for root in roots:
        selected.extend([root] if root.is_file() else sorted(p for p in root.rglob('*') if p.is_file()))
    text, objects = [], {}
    out.mkdir()
    for source in selected:
        store.require(not source.is_symlink(), 'NO_SYMLINKS')
        original = source.relative_to(workspace).as_posix()
        sha, size = store.archive.digest(source), source.stat().st_size
        if source.suffix == '.safetensors':
            obj = objects.setdefault(sha, {'sha256': sha, 'bytes': size,
                'key': store.PREFIX + sha + '.safetensors', 'paths': []})
            store.require(obj['bytes'] == size, 'HASH_SIZE_CONFLICT')
            obj['paths'].append(original)
            continue
        store.require(source.suffix in {'.py', '.json', '.md', '.log', '.txt'}, 'UNEXPECTED_ARTIFACT')
        data = source.read_bytes()
        store.require(not store.archive.SECRETS.search(data), 'POSSIBLE_SECRET_STOP')
        delivered = 'files/' + source.relative_to(research).as_posix()
        if source.suffix == '.py':
            delivered += '.txt'
        dest = store.safe(out, delivered)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        text.append({'path': delivered, 'originalPath': original, 'bytes': size, 'sha256': sha})
    checkpoints = json.loads((research / (RUN + '-pilot/checkpoints.json')).read_text())
    store.require([c['step'] for c in checkpoints] == [6, 12, 18, 24], 'CHECKPOINT_COVERAGE')
    store.require({c['sha256'] for c in checkpoints} == set(objects), 'UNINDEXED_OR_MISSING_CHECKPOINT')
    index = {'schema': 'ggd-low-update-delivery@1', 'run': RUN, 'text': text,
        'objects': sorted(objects.values(), key=lambda x: x['key']),
        'profile': store.PROFILE, 'bucket': store.BUCKET, 'region': store.REGION,
        'productionQualified': False, 'includesEveryNewCheckpoint': True,
        'baseModelIndex': '../BASE_S3_INDEX.json',
        'existingDependencyArchive': '../S3_INDEX.json',
        'snapshotScriptSha256': store.archive.digest(Path(__file__))}
    store.archive.write(out / INDEX, index)
    return verify(out)


def verify(out, receipt=False):
    index = json.loads((out / INDEX).read_text())
    store.require(index['schema'] == 'ggd-low-update-delivery@1' and index['run'] == RUN, 'INDEX_SCHEMA')
    store.require((index['profile'], index['bucket'], index['region']) ==
                  (store.PROFILE, store.BUCKET, store.REGION), 'STORAGE_BOUNDARY')
    store.require(index['productionQualified'] is False, 'NO_PROMOTION')
    seen = set()
    for entry in index['text']:
        store.require(entry['path'] not in seen, 'DUPLICATE_TEXT_PATH')
        seen.add(entry['path'])
        store.check_file(store.safe(out, entry['path']), entry)
    keys, paths = set(), set()
    for obj in index['objects']:
        store.require(store.re.fullmatch(r'[0-9a-f]{64}', obj['sha256']) is not None, 'OBJECT_HASH')
        store.require(obj['key'] == store.PREFIX + obj['sha256'] + '.safetensors', 'OBJECT_KEY')
        store.require(obj['key'] not in keys and obj['paths'], 'DUPLICATE_OR_EMPTY_OBJECT')
        keys.add(obj['key'])
        for name in obj['paths']:
            safe = store.safe(Path('/scope'), name)
            store.require(safe.is_relative_to(Path('/scope') / REL) and name not in paths, 'SOURCE_PATH')
            paths.add(name)
    store.require(len(keys) == 4 and len(paths) == 5, 'ALL_CHECKPOINTS_AND_FINAL_ALIAS_REQUIRED')
    if receipt:
        r = json.loads((out / RECEIPT).read_text())
        store.require((r['profile'], r['bucket'], r['region'], r['identityRole']) ==
                      (store.PROFILE, store.BUCKET, store.REGION, 'vibe-coding-s3-role'), 'RECEIPT_BOUNDARY')
        store.require(r['indexSha256'] == store.archive.digest(out / INDEX), 'RECEIPT_INDEX')
        store.require(r['verification'] == 'get-object-sha256-every-object' and
                      r['objects'] == index['objects'], 'RECEIPT_COVERAGE')
    return {'textFiles': len(seen), 'uniqueCheckpoints': len(keys), 'weightPaths': len(paths),
            'metadataVerified': True, 'historicalReceiptChecked': receipt,
            'remoteChecked': False, 'payloadVerified': False}


def publish(workspace, out, cache):
    verify(out)
    store.require(not (out / RECEIPT).exists(), 'RECEIPT_ALREADY_EXISTS')
    store.require(not cache.resolve().is_relative_to(out.resolve()), 'CACHE_OUTSIDE_DELIVERY')
    index = json.loads((out / INDEX).read_text())
    for obj in index['objects']:
        for name in obj['paths']:
            store.check_file(store.safe(workspace, name), obj)
    aws = store.AWS()
    aws.identity()
    existing = aws.keys()
    for obj in index['objects']:
        if obj['key'] not in existing:
            aws.put(obj, store.safe(workspace, obj['paths'][0]))
        store.download(aws, obj, cache)
    store.archive.write(out / RECEIPT, {
        'schema': 'ggd-low-update-s3-receipt@1',
        'indexSha256': store.archive.digest(out / INDEX),
        'verifiedAt': store.datetime.now(store.timezone.utc).isoformat(),
        'verification': 'get-object-sha256-every-object', 'objects': index['objects'],
        'profile': store.PROFILE, 'region': store.REGION, 'bucket': store.BUCKET,
        'identityRole': 'vibe-coding-s3-role', 'gpuStarted': False})
    return dict(verify(out, True), remoteChecked=True, payloadVerified=True)


def restore(out, destination, cache, offline=False):
    verify(out)
    store.require(not destination.exists(), 'NEW_RESTORE_DESTINATION_REQUIRED')
    store.require(not destination.is_relative_to(out), 'RESTORE_OUTSIDE_DELIVERY')
    index = json.loads((out / INDEX).read_text())
    aws = None
    if not offline:
        aws = store.AWS()
        aws.identity()
    destination.mkdir(parents=True)
    for entry in index['text']:
        target = store.safe(destination, entry['originalPath'])
        target.parent.mkdir(parents=True, exist_ok=True)
        store.require(not target.exists(), 'DUPLICATE_RESTORE_PATH')
        shutil.copyfile(store.safe(out, entry['path']), target)
        store.check_file(target, entry)
    for obj in index['objects']:
        if offline:
            source = store.safe(cache, Path(obj['key']).name)
            store.check_file(source, obj)
        else:
            source = store.download(aws, obj, cache)
        for name in obj['paths']:
            target = store.safe(destination, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            store.require(not target.exists(), 'DUPLICATE_RESTORE_PATH')
            shutil.copyfile(source, target)
            store.check_file(target, obj)
    return {'restoredTextFiles': len(index['text']), 'restoredWeightPaths':
            sum(len(o['paths']) for o in index['objects']), 'payloadVerified': True,
            'remoteReadThisRun': not offline, 'gpuStarted': False}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['snapshot', 'verify', 'publish', 'restore'])
    p.add_argument('directory', type=Path)
    p.add_argument('--workspace', type=Path)
    p.add_argument('--cache', type=Path)
    p.add_argument('--receipt', action='store_true')
    p.add_argument('--destination', type=Path)
    p.add_argument('--offline', action='store_true')
    a = p.parse_args()
    if a.action == 'verify':
        result = verify(a.directory.resolve(), a.receipt)
    elif a.action == 'restore':
        store.require(a.destination is not None and a.cache is not None, 'DESTINATION_AND_CACHE_REQUIRED')
        result = restore(a.directory.resolve(), a.destination.resolve(), a.cache.resolve(), a.offline)
    else:
        store.require(a.workspace is not None, 'WORKSPACE_REQUIRED')
        if a.action == 'snapshot':
            result = snapshot(a.workspace.resolve(), a.directory.resolve())
        else:
            store.require(a.cache is not None, 'CACHE_REQUIRED')
            result = publish(a.workspace.resolve(), a.directory.resolve(), a.cache.resolve())
    print(json.dumps(result))

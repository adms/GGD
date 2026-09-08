"""Private research payload storage. No training, deletion, IAM or credential access.

Git keeps immutable bundle manifests and readable evidence. Offline index checks
are explicitly NOT remote/payload verification. hydrate restores a separate tree
and runs the original, unchanged full archive verifier before returning success.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile

PROFILE = 'vibe-coding'
REGION = 'ap-east-2'
BUCKET = 'ggd-390630837668-ap-east-2-an'
PREFIX = 'hero-finetune-research/sha256/'
SCHEMA = 'ggd-hero-finetune-s3-index@1'
INDEX = 'S3_INDEX.json'
RECEIPT = 'S3_RECEIPT.json'
spec = importlib.util.spec_from_file_location('research_archive', Path(__file__).with_name('hero-finetune-archive.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def safe(root, name):
    p = PurePosixPath(name)
    require(bool(name) and not p.is_absolute() and '..' not in p.parts and str(p) == name
            and '\\' not in name and not any(ord(c) < 32 for c in name), 'UNSAFE_PATH')
    target = root / name
    require(target.resolve().is_relative_to(root.resolve())
            and not any(p.is_symlink() for p in [target, *target.parents]), 'SYMLINK_OR_PATH_ESCAPE')
    return target


def check_file(path, item):
    require(path.is_file() and path.stat().st_size == item['bytes']
            and archive.digest(path) == item['sha256'], f'PAYLOAD_HASH_MISMATCH:{path.name}')


def full_verify(root, index):
    for bundle in index['bundles']:
        archive.verify(safe(root, bundle['path']).parent)
    for obj in index['objects']:
        for name in obj['paths']:
            check_file(safe(root, name), obj)


def plan(root):
    root = root.resolve()
    require(not (root / INDEX).exists(), 'INDEX_ALREADY_EXISTS')
    repo = Path(subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-toplevel'], text=True).strip())
    tracked = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z', '--', str(root)])
    files = [repo / os.fsdecode(p) for p in tracked.split(b'\0') if p]
    manifests = sorted(p for p in files if p.name == 'manifest.json'
                       and json.loads(p.read_text()).get('schema') == 'ggd-hero-finetune-research-archive@1')
    require(bool(manifests), 'NO_BUNDLES')
    for m in manifests:
        archive.verify(m.parent)
    objects = {}
    for path in sorted(files):
        if path.suffix not in {'.zip', '.safetensors'}:
            continue
        name = path.relative_to(root).as_posix()
        safe(root, name)
        sha = archive.digest(path)
        key = PREFIX + sha + path.suffix
        obj = objects.setdefault(key, {'key': key, 'sha256': sha, 'bytes': path.stat().st_size, 'paths': []})
        obj['paths'].append(name)
    index = {'schema': SCHEMA, 'profile': PROFILE, 'region': REGION, 'bucket': BUCKET,
             'prefix': PREFIX, 'sourceCommit': subprocess.check_output(
                 ['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip(),
             'productionQualified': False,
             'bundles': [{'path': p.relative_to(root).as_posix(), 'sha256': archive.digest(p)} for p in manifests],
             'objects': [objects[k] for k in sorted(objects)]}
    validate(root, index)
    archive.write(root / INDEX, index)
    return summary(index)


def validate(root, index):
    require(index['schema'] == SCHEMA and index['profile'] == PROFILE and index['region'] == REGION
            and index['bucket'] == BUCKET and index['prefix'] == PREFIX
            and index['productionQualified'] is False, 'STORAGE_POLICY_MISMATCH')
    require(re.fullmatch('[0-9a-f]{40}', index['sourceCommit']), 'INVALID_SOURCE_COMMIT')
    paths, keys, expected, bundles = {}, set(), {}, set()
    for obj in index['objects']:
        require(re.fullmatch('[0-9a-f]{64}', obj['sha256'])
                and type(obj['bytes']) is int and 0 <= obj['bytes'] < 5 * 1024**3
                and bool(obj['paths']), 'INVALID_OBJECT')
        suffix = PurePosixPath(obj['paths'][0]).suffix
        require(suffix in {'.zip', '.safetensors'}
                and obj['key'] == PREFIX + obj['sha256'] + suffix
                and obj['key'] not in keys, 'INVALID_OR_DUPLICATE_KEY')
        keys.add(obj['key'])
        for name in obj['paths']:
            safe(root, name)
            require(name not in paths and PurePosixPath(name).suffix == suffix, 'DUPLICATE_OR_INVALID_PATH')
            paths[name] = (obj['bytes'], obj['sha256'])
    require(bool(keys) and bool(index['bundles']), 'EMPTY_INDEX')
    for item in index['bundles']:
        path = safe(root, item['path'])
        require(item['path'] not in bundles and path.name == 'manifest.json', 'DUPLICATE_OR_INVALID_BUNDLE')
        bundles.add(item['path'])
        require(archive.digest(path) == item['sha256'], 'BUNDLE_MANIFEST_CHANGED')
        m = json.loads(path.read_text())
        require(m['schema'] == 'ggd-hero-finetune-research-archive@1'
                and m['productionQualified'] is False, 'INVALID_BUNDLE')
        for e in m['archives'] + [dict(e, path=e['modelBlob']) for e in m['entries'] if 'modelBlob' in e]:
            name = safe(path.parent, e['path']).relative_to(root).as_posix()
            pair = (e['bytes'], e['sha256'])
            require(name not in expected or expected[name] == pair, 'CONFLICTING_BLOB')
            expected[name] = pair
        for e in m['sourceMirrors']:
            require(archive.digest(safe(path.parent, e['path'])) == e['sha256'], 'SOURCE_MIRROR_CHANGED')
        for e in m['entries']:
            safe(root, e['path'])
    require(all(paths.get(name) == pair for name, pair in expected.items()), 'BUNDLE_PAYLOAD_MISSING_OR_CHANGED')
    present = {p.relative_to(root).as_posix() for p in root.rglob('manifest.json')
               if json.loads(p.read_text()).get('schema') == 'ggd-hero-finetune-research-archive@1'}
    require(present == bundles, 'UNINDEXED_BUNDLE')
    # One explicitly delivered package is outside the eight research bundles.
    require(set(paths) - set(expected) <= {'leesin-source/leesin-reviewed-offline.zip'}, 'UNREGISTERED_PAYLOAD')
    if 'leesin-source/bundle/manifest.json' in bundles:
        require(paths.get('leesin-source/leesin-reviewed-offline.zip') ==
                (2890218, '28b5ce6dd54861814e8ec8a7eeabb7690a0d62a0a169ce165e7f32e070245bfe'),
                'OFFLINE_PACKAGE_MISSING_OR_CHANGED')
    return index


def read_index(root):
    return validate(root, json.loads((root / INDEX).read_text()))


def summary(index):
    return {'bundles': len(index['bundles']), 'payloadPaths': sum(len(o['paths']) for o in index['objects']),
            'uniqueObjects': len(index['objects']), 'uniqueBytes': sum(o['bytes'] for o in index['objects']),
            'uniqueAdapters': sum(o['key'].endswith('.safetensors') for o in index['objects']),
            'uniqueZipFiles': sum(o['key'].endswith('.zip') for o in index['objects'])}


def check_receipt(root, index):
    r = json.loads((root / RECEIPT).read_text())
    require(r['schema'] == 'ggd-hero-finetune-s3-receipt@1'
            and r['indexSha256'] == archive.digest(root / INDEX)
            and r['bucket'] == BUCKET and r['region'] == REGION and r['profile'] == PROFILE
            and r['identityRole'] == 'vibe-coding-s3-role'
            and r['verification'] == 'get-object-sha256-every-object', 'INVALID_RECEIPT')
    require(r['objects'] == [{k: o[k] for k in ['key', 'bytes', 'sha256']} for o in index['objects']], 'INCOMPLETE_RECEIPT')
    return r


class AWS:
    """Fixed destination/profile. Never emit raw CLI stdout/stderr or credentials."""
    def __init__(self, runner=subprocess.run):
        self.runner = runner
        self.authorized = False

    def call(self, service, action, args=(), resource=None):
        require((service, action) in {('sts', 'get-caller-identity'), ('s3api', 'list-objects-v2'),
                ('s3api', 'put-object'), ('s3api', 'get-object')}, 'AWS_ACTION_NOT_ALLOWED')
        require(service == 'sts' or self.authorized, 'IDENTITY_NOT_VERIFIED')
        env = dict(os.environ, AWS_PROFILE=PROFILE, AWS_REGION=REGION, AWS_DEFAULT_REGION=REGION,
                   AWS_MAX_ATTEMPTS='1', AWS_PAGER='')
        for key in list(env):
            if key in {'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_SECURITY_TOKEN',
                       'AWS_DEFAULT_PROFILE'} or key.startswith('AWS_ENDPOINT_URL'):
                env.pop(key)
        command = ['aws', '--profile', PROFILE, '--region', REGION, '--output', 'json',
                   '--cli-connect-timeout', '10', '--cli-read-timeout', '60', service, action, *args]
        if service == 's3api':
            command += ['--bucket', BUCKET]
        try:
            result = self.runner(command, env=env, capture_output=True, text=True, timeout=180)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'AWS_TIMEOUT:{service}:{action}:{resource or "identity"}') from None
        if result.returncode:
            denied = 'AccessDenied' in result.stderr or 'Access Denied' in result.stderr
            code = 'AWS_ACCESS_DENIED_STOP' if denied else 'AWS_COMMAND_FAILED'
            permission = {'list-objects-v2': 's3:ListBucket', 'put-object': 's3:PutObject',
                          'get-object': 's3:GetObject', 'get-caller-identity': 'sts:GetCallerIdentity'}[action]
            error_code = re.search(r'An error occurred \(([A-Za-z0-9_.-]+)\)', result.stderr)
            detail = error_code.group(1) if error_code else f'cli-exit-{result.returncode}'
            raise RuntimeError(f'{code}:{permission}:{resource or "identity"}:{detail}')
        return json.loads(result.stdout or '{}')

    def identity(self):
        value = self.call('sts', 'get-caller-identity')
        require(value.get('Account') == '390630837668'
                and ':assumed-role/vibe-coding-s3-role/' in value.get('Arn', ''), 'AWS_IDENTITY_MISMATCH_STOP')
        self.authorized = True

    def keys(self):
        value = self.call('s3api', 'list-objects-v2', ['--prefix', PREFIX], f'arn:aws:s3:::{BUCKET}')
        return {e['Key'] for e in value.get('Contents', [])}

    def put(self, obj, source):
        self.call('s3api', 'put-object', ['--key', obj['key'], '--body', str(source),
                  '--if-none-match', '*', '--metadata', 'sha256=' + obj['sha256']],
                  f'arn:aws:s3:::{BUCKET}/{obj["key"]}')

    def get(self, obj, destination):
        self.call('s3api', 'get-object', ['--key', obj['key'], str(destination)],
                  f'arn:aws:s3:::{BUCKET}/{obj["key"]}')


def download(aws, obj, cache):
    cache.mkdir(parents=True, exist_ok=True)
    dest = safe(cache, PurePosixPath(obj['key']).name)
    # Existing cache never substitutes for this run's remote read-back proof.
    with tempfile.TemporaryDirectory(prefix='s3-readback-', dir=cache) as tmp:
        part = Path(tmp) / 'payload'
        aws.get(obj, part)
        check_file(part, obj)
        if dest.exists():
            check_file(dest, obj)
        else:
            shutil.copyfile(part, dest)
    return dest


def publish(root, cache, aws=None):
    index = read_index(root)
    require(not (root / RECEIPT).exists(), 'RECEIPT_ALREADY_EXISTS')
    require(not cache.resolve().is_relative_to(root.resolve()), 'CACHE_MUST_BE_OUTSIDE_GIT_DELIVERY')
    full_verify(root, index)
    aws = aws or AWS()
    aws.identity()
    existing = aws.keys()
    started = datetime.now(timezone.utc).isoformat()
    for n, obj in enumerate(index['objects'], 1):
        if obj['key'] not in existing:
            aws.put(obj, safe(root, obj['paths'][0]))
        download(aws, obj, cache)
        print(json.dumps({'verifiedObjects': n, 'total': len(index['objects'])}), flush=True)
    receipt = {'schema': 'ggd-hero-finetune-s3-receipt@1', 'indexSha256': archive.digest(root / INDEX),
               'bucket': BUCKET, 'region': REGION, 'profile': PROFILE, 'identityRole': 'vibe-coding-s3-role',
               'startedAt': started, 'completedAt': datetime.now(timezone.utc).isoformat(),
               'verification': 'get-object-sha256-every-object', 'productionQualified': False,
               'objects': [{k: o[k] for k in ['key', 'bytes', 'sha256']} for o in index['objects']]}
    archive.write(root / RECEIPT, receipt)
    return dict(summary(index), remotePayloadVerified=True)


def hydrate(root, destination, cache=None, offline=False, aws=None):
    index = read_index(root)
    require(not destination.exists(), 'NEW_HYDRATION_DIRECTORY_REQUIRED')
    require(not destination.resolve().is_relative_to(root.resolve()), 'DESTINATION_MUST_BE_OUTSIDE_SOURCE')
    require(not offline or cache is not None, 'OFFLINE_CACHE_REQUIRED')
    if not offline:
        aws = aws or AWS()
        aws.identity()
    # Text/indices only: do not accidentally pass using source tree binaries.
    shutil.copytree(root, destination, ignore=shutil.ignore_patterns('*.zip', '*.safetensors', '.git'))
    with tempfile.TemporaryDirectory(prefix='hero-s3-cache-') as tmp:
        cache = cache or Path(tmp).resolve()
        for obj in index['objects']:
            if offline:
                source = safe(cache, PurePosixPath(obj['key']).name)
                check_file(source, obj)
            else:
                source = download(aws, obj, cache)
            for name in obj['paths']:
                dest = safe(destination, name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, dest)
    full_verify(destination, index)
    return dict(summary(index), payloadVerified=True, remoteReadThisRun=not offline,
                hydrated=str(destination), gpuStarted=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['plan', 'verify-index', 'publish', 'hydrate'])
    parser.add_argument('root', type=Path)
    parser.add_argument('--cache', type=Path)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--receipt', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.mode == 'plan':
        result = plan(root)
    elif args.mode == 'verify-index':
        index = read_index(root)
        if args.receipt:
            check_receipt(root, index)
        result = dict(summary(index), indexVerified=True, payloadVerified=False,
                      remoteChecked=False, historicalReceiptChecked=args.receipt)
    elif args.mode == 'publish':
        require(args.cache is not None, 'CACHE_REQUIRED_FOR_RECOVERABLE_MIGRATION')
        result = publish(root, args.cache.resolve())
    else:
        require(args.destination is not None, 'DESTINATION_REQUIRED')
        result = hydrate(root, args.destination.resolve(), args.cache.resolve() if args.cache else None, args.offline)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, AssertionError) as error:
        raise SystemExit(str(error))

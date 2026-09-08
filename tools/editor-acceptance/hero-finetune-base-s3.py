"""Back up the exact existing 12B base using bounded, content-addressed S3 chunks.

No model downloads, training, credential reads, IAM, multipart or deletion APIs.
Uses the same fixed-profile AWS boundary as the research archive utility.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import time

spec = importlib.util.spec_from_file_location('storage', Path(__file__).with_name('hero-finetune-s3.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
CHUNK = 256 * 1024**2
PREFIX = 'hero-finetune-research/base-model/sha256/'
MODEL = 'mlx-community/gemma-4-12B-it-8bit'
REVISION = '200bb6db075e137a4deb08838865ac4ddb86292e'
INDEX = 'BASE_S3_INDEX.json'
RECEIPT = 'BASE_S3_RECEIPT.json'
NAMES = {'README.md', 'chat_template.jinja', 'config.json', 'generation_config.json',
         'model-00001-of-00003.safetensors', 'model-00002-of-00003.safetensors',
         'model-00003-of-00003.safetensors', 'model.safetensors.index.json',
         'processor_config.json', 'tokenizer.json', 'tokenizer_config.json'}


def now():
    return datetime.now(timezone.utc).isoformat()


def objects(index):
    result = {}
    for f in index['files']:
        for part in f['parts']:
            obj = {k: part[k] for k in ('key', 'bytes', 'sha256')}
            s.require(obj['key'] not in result or result[obj['key']] == obj, 'CONFLICTING_CHUNK')
            result[obj['key']] = obj
    return list(result.values())


def validate(index):
    s.require(index['schema'] == 'ggd-hero-base-s3-index@1' and index['model'] == MODEL
              and index['revision'] == REVISION and index['profile'] == s.PROFILE
              and index['region'] == s.REGION and index['bucket'] == s.BUCKET
              and index['prefix'] == PREFIX and index['chunkBytes'] == CHUNK, 'BASE_POLICY_MISMATCH')
    s.require(len(index['files']) == len(NAMES) and {f['name'] for f in index['files']} == NAMES, 'BASE_FILES_INCOMPLETE')
    for f in index['files']:
        s.require(s.re.fullmatch('[0-9a-f]{64}', f['sha256']) and bool(f['parts']), 'INVALID_FILE_HASH')
        offset = 0
        for n, part in enumerate(f['parts']):
            s.require(s.re.fullmatch('[0-9a-f]{64}', part['sha256'])
                      and part['key'] == PREFIX + part['sha256'] + '.bin'
                      and part['offset'] == offset and type(part['bytes']) is int
                      and 0 < part['bytes'] <= CHUNK
                      and (n == len(f['parts']) - 1 or part['bytes'] == CHUNK), 'INVALID_CHUNK_LAYOUT')
            offset += part['bytes']
        s.require(offset == f['bytes'], 'FILE_LENGTH_MISMATCH')
    s.require(sum(f['bytes'] for f in index['files']) == index['totalBytes'], 'TOTAL_LENGTH_MISMATCH')
    objects(index)
    return index


def load(root):
    return validate(json.loads((root / INDEX).read_text()))


def verify_model(model_dir, index):
    for f in index['files']:
        s.check_file(s.safe(model_dir, f['name']), f)
    refs = json.loads((model_dir / 'model.safetensors.index.json').read_text())['weight_map']
    s.require(set(refs.values()) == {n for n in NAMES if n.endswith('.safetensors')}, 'WEIGHT_INDEX_INCOMPLETE')
    for name in NAMES:
        if name.endswith('.json'):
            json.loads((model_dir / name).read_text())


def prepare(root, model_dir, prior_path, preflight_path):
    s.require(not (root / INDEX).exists(), 'BASE_INDEX_ALREADY_EXISTS')
    prior, preflight = [json.loads(p.read_text()) for p in (prior_path, preflight_path)]
    s.require(prior['repo'] == MODEL and prior['revision'] == REVISION and prior['status'] == 'verified'
              and preflight['modelRevision'] == REVISION, 'ORIGINAL_REVISION_MISMATCH')
    s.require({f['name'] for f in prior['files']} == NAMES
              and {f['name'] for f in preflight['files']} == NAMES, 'ORIGINAL_FILE_LIST_MISMATCH')
    s.require({p.name for p in model_dir.iterdir() if p.is_file()} == NAMES, 'LOCAL_FILE_LIST_MISMATCH')
    pins = {f['name']: f for f in preflight['files']}
    files = []
    for entry in prior['files']:
        path = s.safe(model_dir, entry['name'])
        whole, parts, offset = hashlib.sha256(), [], 0
        with path.open('rb') as stream:
            while True:
                data = stream.read(CHUNK)
                if not data:
                    break
                sha = hashlib.sha256(data).hexdigest()
                whole.update(data)
                parts.append({'offset': offset, 'bytes': len(data), 'sha256': sha, 'key': PREFIX + sha + '.bin'})
                offset += len(data)
        sha = whole.hexdigest()
        s.require(offset == entry['bytes'] == pins[entry['name']]['bytes']
                  and sha == pins[entry['name']]['sha256']
                  and (not entry['sha256'] or sha == entry['sha256']), 'ORIGINAL_MODEL_CHANGED:' + entry['name'])
        files.append({'name': entry['name'], 'bytes': offset, 'sha256': sha, 'parts': parts})
        print(json.dumps({'pinnedFile': entry['name'], 'bytes': offset}), flush=True)
    index = {'schema': 'ggd-hero-base-s3-index@1', 'model': MODEL, 'revision': REVISION,
             'profile': s.PROFILE, 'region': s.REGION, 'bucket': s.BUCKET, 'prefix': PREFIX,
             'chunkBytes': CHUNK, 'totalBytes': sum(f['bytes'] for f in files), 'files': files,
             'downloadReceiptSha256': s.archive.digest(prior_path),
             'trainingPreflightSha256': s.archive.digest(preflight_path),
             'recordedRuntimeVersions': preflight['versions'],
             'omitted': ['.cache: downloader metadata, not model runtime files'],
             'limitations': ['Byte-identical model backup, not a complete machine or Python environment image.',
                             'Fine-tuned adapters still require their matching base and recorded runtime.']}
    validate(index)
    s.require(index['totalBytes'] == prior['expectedBytes'], 'ORIGINAL_TOTAL_MISMATCH')
    s.archive.write(root / INDEX, index)
    return {'files': len(files), 'chunks': len(objects(index)), 'bytes': index['totalBytes'], 'gpuStarted': False}


class AWS(s.AWS):
    def keys(self):
        result = self.call('s3api', 'list-objects-v2', ['--prefix', PREFIX], f'arn:aws:s3:::{s.BUCKET}')
        return {e['Key'] for e in result.get('Contents', [])}

    @staticmethod
    def transient(error):
        message = str(error)
        return message.startswith('AWS_TIMEOUT:') or (
            message.startswith('AWS_COMMAND_FAILED:') and message.rsplit(':', 1)[-1] in
            {'endpoint-connection', 'connection-closed', 'connection-reset', 'read-timeout', 'connect-timeout'})

    def transfer(self, method, obj, path):
        for attempt in range(3):
            try:
                return method(obj, path)
            except RuntimeError as error:
                # A lost PUT response may have committed the exact key. Never
                # overwrite it: the caller still GETs and hashes all its bytes.
                if attempt and method.__name__ == 'put' and str(error).endswith(':PreconditionFailed'):
                    return
                if not self.transient(error) or attempt == 2:
                    raise
                print(json.dumps({'transientTransferRetry': attempt + 1, 'operation': method.__name__}), flush=True)
                time.sleep(attempt + 1)

    def put(self, obj, source):
        return self.transfer(super().put, obj, source)

    def get(self, obj, destination):
        return self.transfer(super().get, obj, destination)


def journal_path(cache, index_hash, key):
    return s.safe(cache, index_hash + '-' + key.rsplit('/', 1)[-1] + '.verified.json')


def publish(root, model_dir, cache, aws=None):
    index = load(root)
    s.require(not (root / RECEIPT).exists(), 'BASE_RECEIPT_ALREADY_EXISTS')
    s.require(not cache.is_relative_to(root) and not cache.is_relative_to(model_dir), 'CACHE_MUST_BE_SEPARATE')
    verify_model(model_dir, index)
    aws = aws or AWS()
    aws.identity()
    existing = aws.keys()
    cache.mkdir(parents=True, exist_ok=True)
    index_hash, verified, total = s.archive.digest(root / INDEX), {}, index['totalBytes']
    started = now()
    for f in index['files']:
        for part in f['parts']:
            if part['key'] in verified:
                continue
            journal = journal_path(cache, index_hash, part['key'])
            if journal.exists():
                old = json.loads(journal.read_text())
                s.require(old['indexSha256'] == index_hash and old['object'] ==
                          {k: part[k] for k in ('key', 'bytes', 'sha256')}, 'PROGRESS_MISMATCH')
                s.check_file(s.safe(cache, part['key'].rsplit('/', 1)[-1]), part)
                verified[part['key']] = old
            else:
                if part['key'] not in existing:
                    with tempfile.TemporaryDirectory(prefix='base-upload-') as tmp:
                        chunk = Path(tmp) / 'chunk.bin'
                        with s.safe(model_dir, f['name']).open('rb') as src, chunk.open('xb') as dest:
                            src.seek(part['offset'])
                            remaining = part['bytes']
                            while remaining:
                                data = src.read(min(4 * 1024**2, remaining))
                                s.require(bool(data), 'SOURCE_TRUNCATED')
                                dest.write(data)
                                remaining -= len(data)
                        s.check_file(chunk, part)
                        aws.put(part, chunk)
                s.download(aws, part, cache)
                record = {'indexSha256': index_hash, 'verifiedAt': now(),
                          'object': {k: part[k] for k in ('key', 'bytes', 'sha256')}}
                s.archive.write(journal, record)
                verified[part['key']] = record
            done = sum(v['object']['bytes'] for v in verified.values())
            print(json.dumps({'verifiedChunks': len(verified), 'totalChunks': len(objects(index)),
                              'verifiedBytes': done, 'totalBytes': total}), flush=True)
    receipt = {'schema': 'ggd-hero-base-s3-receipt@1', 'model': MODEL, 'revision': REVISION,
               'indexSha256': index_hash, 'profile': s.PROFILE, 'bucket': s.BUCKET, 'region': s.REGION,
               'identityRole': 'vibe-coding-s3-role', 'startedAt': started, 'completedAt': now(),
               'verification': 'every-chunk-get-object-sha256-including-recorded-resumed-chunks',
               'objects': [verified[o['key']] for o in objects(index)], 'gpuStarted': False}
    s.archive.write(root / RECEIPT, receipt)
    return {'complete': True, 'chunks': len(verified), 'bytes': total, 'gpuStarted': False}


def check_receipt(root, index):
    receipt = json.loads((root / RECEIPT).read_text())
    s.require(receipt['schema'] == 'ggd-hero-base-s3-receipt@1'
              and receipt['indexSha256'] == s.archive.digest(root / INDEX)
              and receipt['model'] == MODEL and receipt['revision'] == REVISION
              and receipt['profile'] == s.PROFILE and receipt['region'] == s.REGION
              and receipt['bucket'] == s.BUCKET and receipt['identityRole'] == 'vibe-coding-s3-role', 'INVALID_BASE_RECEIPT')
    s.require([r['object'] for r in receipt['objects']] == objects(index)
              and all(r['indexSha256'] == receipt['indexSha256'] for r in receipt['objects']), 'INCOMPLETE_BASE_RECEIPT')


def restore(root, destination, cache=None, offline=False, aws=None):
    index = load(root)
    s.require(not destination.exists() and not destination.is_relative_to(root), 'NEW_SEPARATE_DESTINATION_REQUIRED')
    s.require(not offline or cache is not None, 'OFFLINE_CACHE_REQUIRED')
    if not offline:
        aws = aws or AWS()
        aws.identity()
    destination.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix='base-restore-cache-') as tmp:
        cache = cache or Path(tmp).resolve()
        for f in index['files']:
            with s.safe(destination, f['name']).open('xb') as out:
                for part in f['parts']:
                    src = s.safe(cache, part['key'].rsplit('/', 1)[-1])
                    if not offline:
                        src = s.download(aws, part, cache)
                    s.check_file(src, part)
                    with src.open('rb') as chunk:
                        shutil.copyfileobj(chunk, out, 4 * 1024**2)
            s.check_file(destination / f['name'], f)
            print(json.dumps({'restoredFile': f['name'], 'sha256Verified': True}), flush=True)
    verify_model(destination, index)
    return {'restoredFiles': len(index['files']), 'bytes': index['totalBytes'],
            'allOriginalFileHashesMatch': True, 'remoteReadThisRun': not offline, 'gpuStarted': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode', choices=['prepare', 'publish', 'verify-index', 'restore'])
    p.add_argument('root', type=Path)
    p.add_argument('--model-directory', type=Path)
    p.add_argument('--download-receipt', type=Path)
    p.add_argument('--training-preflight', type=Path)
    p.add_argument('--cache', type=Path)
    p.add_argument('--destination', type=Path)
    p.add_argument('--report', type=Path, help='Write a new restore-verification JSON receipt after full success')
    p.add_argument('--offline', action='store_true')
    p.add_argument('--receipt', action='store_true')
    a = p.parse_args()
    root = a.root.resolve()
    if a.report:
        s.require(a.mode == 'restore' and not a.report.exists(), 'NEW_RESTORE_REPORT_REQUIRED')
    if a.mode == 'prepare':
        s.require(all([a.model_directory, a.download_receipt, a.training_preflight]), 'PREPARATION_ARGUMENTS_REQUIRED')
        result = prepare(root, a.model_directory.resolve(), a.download_receipt, a.training_preflight)
    elif a.mode == 'publish':
        s.require(a.model_directory and a.cache, 'MODEL_AND_CACHE_REQUIRED')
        result = publish(root, a.model_directory.resolve(), a.cache.resolve())
    elif a.mode == 'verify-index':
        index = load(root)
        if a.receipt:
            check_receipt(root, index)
        result = {'metadataVerified': True, 'historicalReceiptChecked': a.receipt, 'remoteChecked': False,
                  'payloadVerified': False, 'files': len(index['files']), 'chunks': len(objects(index)), 'bytes': index['totalBytes']}
    else:
        s.require(a.destination, 'DESTINATION_REQUIRED')
        result = restore(root, a.destination.resolve(), a.cache.resolve() if a.cache else None, a.offline)
        if a.report:
            s.archive.write(a.report, {'schema': 'ggd-hero-base-restore-verification@1', 'verifiedAt': now(),
                                      'model': MODEL, 'revision': REVISION,
                                      'indexSha256': s.archive.digest(root / INDEX),
                                      'restoreScriptSha256': s.archive.digest(Path(__file__)),
                                      'source': 'verified-chunk-cache' if a.offline else 'fresh-S3-downloads',
                                      'sourceModelDirectoryUsed': False,
                                      'destination': str(a.destination.resolve()), **result})
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, AssertionError) as error:
        raise SystemExit(str(error))

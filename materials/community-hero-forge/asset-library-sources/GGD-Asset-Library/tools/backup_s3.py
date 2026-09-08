#!/usr/bin/env python3
"""Backup only: isolated prefix, immutable chunked archives, full GET verification.

This tool does not restore or consume assets. No production index is modified.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
import tarfile
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from publish_s3 import ROOT, BUCKET, runaws, write

WORKSPACE = ROOT.parent
PREFIX = 'legacy/ggd-asset-library'
URI = f's3://{BUCKET}/{PREFIX}/'
CHUNK = 256 * 1024 * 1024


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class HashReader:
    def __init__(self, stream):
        self.stream, self.hash = stream, hashlib.sha256()

    def read(self, size=-1):
        data = self.stream.read(size)
        self.hash.update(data)
        return data


class Parts:
    def __init__(self, folder, on_part):
        self.folder, self.on_part = folder, on_part
        self.file, self.size, self.index = None, 0, 0
        self.parts = []

    def write(self, data):
        original = len(data)
        view = memoryview(data)
        while view:
            if self.file is None:
                self.path = self.folder / f'archive.tar.gz.part{self.index:05d}'
                self.file = self.path.open('wb')
                self.hash, self.size = hashlib.sha256(), 0
            count = min(len(view), CHUNK - self.size)
            self.file.write(view[:count])
            self.hash.update(view[:count])
            self.size += count
            view = view[count:]
            if self.size == CHUNK:
                self.finish()
        return original

    def flush(self):
        if self.file:
            self.file.flush()

    def finish(self):
        if self.file:
            self.file.close()
            record = dict(name=self.path.name, bytes=self.size, sha256=self.hash.hexdigest())
            self.parts.append(record)
            self.on_part(self.path, record)
            self.index += 1
            self.file = None


def groups():
    game = WORKSPACE / 'outputs/game-asset-library-20260907'
    hero = game / '300heroes'
    result = [(f'300heroes-{p.name}', [p]) for p in sorted(hero.iterdir()) if p.is_dir()]
    result += [('300heroes-indexes-root', [p for p in sorted(hero.iterdir()) if p.is_file()])]
    result += [('magical-battle-arena', [game / 'magical-battle-arena'])]
    result += [('game-source-docs-tools', [p for p in sorted(game.iterdir()) if p.name not in {'300heroes', 'magical-battle-arena'}])]
    result += [(name, [WORKSPACE / path]) for name, path in [
        ('lol-intermediate', 'outputs/community-lol-models-20260907'),
        ('candidate-registry', 'outputs/asset-library-registry-20260907'),
        ('community37-handoff', 'GGD社群英雄上傳內容_37名'),
        ('intake', 'GGD-Asset-Library/intake'),
        ('staging', 'GGD-Asset-Library/staging')]]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true', help='Upload and read back all backup objects')
    args = parser.parse_args()
    if not args.publish:
        parser.error('Use --publish only for an authorized backup. This tool cannot restore backups.')
    identity = json.loads(runaws(['sts', 'get-caller-identity', '--output', 'json'], 'sts:GetCallerIdentity', 'configured role'))
    if 'assumed-role/vibe-coding-s3-role/' not in identity.get('Arn', ''):
        raise RuntimeError('STOP: AWS role mismatch: ' + identity.get('Arn', '<missing>'))
    runaws(['s3api', 'list-objects-v2', '--bucket', BUCKET, '--prefix', PREFIX+'/', '--max-keys', '5', '--output', 'json'], 's3:ListBucket', URI)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    local = ROOT / 'backups' / stamp
    local.mkdir(parents=True, exist_ok=False)
    remote = URI + 'snapshots/' + stamp + '/'
    stopped = threading.Event()
    lock = threading.Lock()
    counters = dict(verified_objects=0, verified_bytes=0)

    def transfer(path, target, expected):
        if stopped.is_set():
            raise RuntimeError('Stopped after a prior transfer failure')
        try:
            runaws(['s3', 'cp', str(path), target, '--only-show-errors'], 's3:PutObject', target)
            with tempfile.TemporaryDirectory() as tmp:
                copy = Path(tmp)/'readback'
                runaws(['s3', 'cp', target, str(copy), '--only-show-errors'], 's3:GetObject', target)
                if copy.stat().st_size != path.stat().st_size or digest(copy) != expected:
                    raise ValueError('Backup read-back mismatch: ' + target)
            with lock:
                counters['verified_objects'] += 1
                counters['verified_bytes'] += path.stat().st_size
                write(local/'progress.json', dict(status='uploading_and_verifying', snapshot=stamp, **counters))
            print('VERIFIED '+target+' '+str(path.stat().st_size), flush=True)
        except BaseException:
            stopped.set()
            raise

    # Publish the restriction before any backup data. Never change IAM/ACL.
    for source, name in [('BACKUP_README.md', 'README.md'), ('BACKUP_POLICY.json', 'POLICY.json')]:
        transfer(ROOT/source, URI+name, digest(ROOT/source))

    manifest = dict(schema='ggd-restricted-backup@1', snapshot=stamp, backup_uri=remote,
                    scope='backup_only', allow_automatic_consumption=False,
                    requires_explicit_human_authorization=True, local_sources_preserved=True,
                    groups=[], skipped_symlinks=[])
    futures = []
    # Independent uploads/GET checks overlap compression. Bound pending data to 4 parts.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        def submit(path, record):
            if stopped.is_set():
                raise RuntimeError('Backup stopped after transfer failure')
            while len(futures) >= 4:
                futures.pop(0).result()
            target = remote + str(path.relative_to(local))
            futures.append(pool.submit(transfer, path, target, record['sha256']))

        for name, sources in groups():
            folder = local/name
            folder.mkdir()
            files = []
            for source in sources:
                if not source.exists():
                    raise FileNotFoundError(source)
                for path in ([source] if source.is_file() else sorted(source.rglob('*'))):
                    if path.is_symlink():
                        manifest['skipped_symlinks'].append(str(path.relative_to(WORKSPACE)))
                    elif path.is_file():
                        if path.name in {'.env', 'credentials', 'id_rsa', 'id_ed25519'} or path.suffix in {'.pem', '.key'}:
                            raise ValueError('Stop before reading a sensitive-looking file: '+str(path))
                        files.append(path)
            print('PACKING '+name+' files='+str(len(files)), flush=True)
            parts = Parts(folder, submit)
            file_count = total_bytes = 0
            listing = folder/'files.jsonl'
            with listing.open('w') as index, gzip.GzipFile(filename='', mode='wb', compresslevel=1, fileobj=parts, mtime=0) as gz:
                with tarfile.open(fileobj=gz, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                    for path in files:
                        before = path.stat()
                        rel = str(path.relative_to(WORKSPACE))
                        info = archive.gettarinfo(str(path), arcname=rel)
                        info.uid = info.gid = 0
                        info.uname = info.gname = ''
                        with path.open('rb') as source:
                            reader = HashReader(source)
                            archive.addfile(info, reader)
                        after = path.stat()
                        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                            raise RuntimeError('Source changed during backup: '+rel)
                        index.write(json.dumps(dict(path=rel, bytes=before.st_size, sha256=reader.hash.hexdigest()), ensure_ascii=False)+'\n')
                        file_count += 1
                        total_bytes += before.st_size
            parts.finish()
            listing_hash = digest(listing)
            submit(listing, dict(sha256=listing_hash))
            manifest['groups'].append(dict(id=name, file_count=file_count, source_bytes=total_bytes,
                                           files_index=name+'/files.jsonl', files_index_sha256=listing_hash,
                                           parts=[dict(path=name+'/'+r['name'], bytes=r['bytes'], sha256=r['sha256']) for r in parts.parts]))
            write(local/'prepared-manifest.json', manifest)
            print('PACKED '+name+' source_bytes='+str(total_bytes)+' parts='+str(len(parts.parts)), flush=True)
        for future in futures:
            future.result()
    manifest['status'] = 'all_archive_parts_and_file_indexes_read_back_verified'
    manifest['file_count'] = sum(g['file_count'] for g in manifest['groups'])
    manifest['source_bytes'] = sum(g['source_bytes'] for g in manifest['groups'])
    manifest['archive_bytes'] = sum(p['bytes'] for g in manifest['groups'] for p in g['parts'])
    write(local/'manifest.json', manifest)
    transfer(local/'manifest.json', remote+'manifest.json', digest(local/'manifest.json'))
    pointer = dict(schema='ggd-restricted-backup-current@1', status='published_and_read_back_verified',
                   snapshot=stamp, manifest_uri=remote+'manifest.json', manifest_sha256=digest(local/'manifest.json'),
                   file_count=manifest['file_count'], source_bytes=manifest['source_bytes'],
                   archive_bytes=manifest['archive_bytes'], scope='backup_only',
                   allow_automatic_consumption=False, requires_explicit_human_authorization=True)
    write(local/'latest.json', pointer)
    transfer(local/'latest.json', URI+'latest.json', digest(local/'latest.json'))
    write(ROOT/'backups/latest.json', pointer)
    write(local/'receipt.json', dict(**pointer, role_arn=identity['Arn'], **counters,
                                    local_backup=str(local), local_sources_preserved=True, deletions=0))
    write(local/'progress.json', dict(status=pointer['status'], snapshot=stamp, **counters))
    print(json.dumps(pointer, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()

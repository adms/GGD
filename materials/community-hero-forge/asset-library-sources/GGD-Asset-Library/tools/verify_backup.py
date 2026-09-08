#!/usr/bin/env python3
"""Integrity verification only; never extracts or imports backup assets."""
import argparse
import gzip
import hashlib
import json
import tarfile
from pathlib import Path
from backup_s3 import digest
from publish_s3 import write


class JoinedParts:
    def __init__(self, root, parts):
        self.root, self.parts = root, iter(parts)
        self.stream = None

    def read(self, size):
        result = bytearray()
        while len(result) < size:
            if self.stream is None:
                part = next(self.parts, None)
                if part is None:
                    break
                path = self.root/part['path']
                if path.stat().st_size != part['bytes'] or digest(path) != part['sha256']:
                    raise ValueError('Archive part mismatch: '+str(path))
                self.stream = path.open('rb')
            block = self.stream.read(size-len(result))
            if not block:
                self.stream.close()
                self.stream = None
            else:
                result.extend(block)
        return bytes(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    args = parser.parse_args()
    root = args.snapshot.resolve()
    source = root/'manifest.json'
    if not source.exists():
        source = root/'prepared-manifest.json'
    manifest = json.loads(source.read_text())
    report_path = root/'archive-integrity.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else dict(groups={})
    for group in manifest['groups']:
        fingerprint = hashlib.sha256(json.dumps(group, sort_keys=True).encode()).hexdigest()
        if report['groups'].get(group['id'], {}).get('manifest_sha256') == fingerprint:
            continue
        listing = root/group['files_index']
        if digest(listing) != group['files_index_sha256']:
            raise ValueError('File index changed: '+group['id'])
        expected = {row['path']: row for line in listing.read_text().splitlines() if (row := json.loads(line))}
        count = size = 0
        with gzip.GzipFile(fileobj=JoinedParts(root, group['parts']), mode='rb') as gz:
            with tarfile.open(fileobj=gz, mode='r|', bufsize=1024*1024) as archive:
                for entry in archive:
                    record = expected.pop(entry.name, None)
                    if not entry.isfile() or record is None or entry.size != record['bytes']:
                        raise ValueError('Unexpected archive member: '+entry.name)
                    h = hashlib.sha256()
                    stream = archive.extractfile(entry)
                    for block in iter(lambda: stream.read(4*1024*1024), b''):
                        h.update(block)
                    if h.hexdigest() != record['sha256']:
                        raise ValueError('Archived file mismatch: '+entry.name)
                    count += 1
                    size += entry.size
            while gz.read(1024*1024):
                pass  # Consume footer to verify gzip CRC and length.
        if expected or count != group['file_count'] or size != group['source_bytes']:
            raise ValueError('Incomplete archive: '+group['id'])
        report['groups'][group['id']] = dict(manifest_sha256=fingerprint, files=count, bytes=size, status='passed')
        write(report_path, report)
        print('ARCHIVE VERIFIED '+group['id']+' files='+str(count), flush=True)
    report['status'] = 'complete' if source.name == 'manifest.json' else 'completed_groups_verified_backup_still_running'
    write(report_path, report)
    print(report['status'], flush=True)


if __name__ == '__main__':
    main()

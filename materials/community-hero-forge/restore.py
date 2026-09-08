#!/usr/bin/env python3
"""Verify committed material parts and restore to a new, isolated directory."""
import argparse
import gzip
import hashlib
import io
import json
import os
import shutil
import tarfile
from pathlib import Path, PurePosixPath


class JoinedParts(io.RawIOBase):
    def __init__(self, paths):
        self.paths, self.current = iter(paths), None

    def readable(self):
        return True

    def readinto(self, buffer):
        while True:
            if self.current is None:
                path = next(self.paths, None)
                if path is None:
                    return 0
                self.current = path.open('rb')
            n = self.current.readinto(buffer)
            if n:
                return n
            self.current.close()
            self.current = None

    def close(self):
        if self.current:
            self.current.close()
        super().close()


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def relative(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or str(path) != name:
        raise ValueError('Unsafe archive path: ' + name)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, help='Must not already exist; no source workspace or live service is changed')
    args = ap.parse_args()
    here = Path(__file__).resolve().parent
    manifest = json.loads((here / 'manifest.json').read_text())
    if manifest['schema'] != 'ggd-community-materials-archive@1':
        raise ValueError('Unknown manifest schema')
    paths = []
    for row in manifest['parts']:
        path = here / relative(row['path'])
        if path.is_symlink() or path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError('Corrupt or missing part: ' + row['path'])
        paths.append(path)
    expected = {}
    for row in manifest['files']:
        relative(row['path'])
        if row['path'] in expected:
            raise ValueError('Duplicate manifest path')
        expected[row['path']] = row
    if not args.output:
        print(json.dumps({'verifiedParts': len(paths), 'filesAvailable': len(expected)}))
        return
    output = args.output.absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('Output must not already exist')
    output.mkdir(parents=True)
    seen = set()
    with io.BufferedReader(JoinedParts(paths)) as joined, gzip.GzipFile(fileobj=joined) as unzipped:
        with tarfile.open(fileobj=unzipped, mode='r|') as archive:
            for item in archive:
                name = str(relative(item.name))
                if name not in expected or name in seen:
                    raise ValueError('Unexpected or duplicate member: ' + name)
                target = output / name
                target.parent.mkdir(parents=True, exist_ok=True)
                if item.islnk():
                    link = str(relative(item.linkname))
                    if link not in seen or expected[link]['sha256'] != expected[name]['sha256']:
                        raise ValueError('Unverified hardlink: ' + name)
                    # Separate files preserve independent future edits, including hero version copies.
                    shutil.copyfile(output / link, target)
                elif item.isfile():
                    if item.size != expected[name]['bytes']:
                        raise ValueError('Unexpected size: ' + name)
                    with target.open('xb') as stream:
                        shutil.copyfileobj(archive.extractfile(item), stream)
                else:
                    raise ValueError('Links/devices/directories are not payload members')
                if target.stat().st_size != expected[name]['bytes'] or digest(target) != expected[name]['sha256']:
                    raise ValueError('Restored bytes differ: ' + name)
                os.chmod(target, expected[name]['mode'] & 0o777)
                seen.add(name)
    if seen != set(expected):
        raise ValueError('Incomplete archive')
    print(json.dumps({'restoredFiles': len(seen), 'verifiedParts': len(paths), 'output': str(output),
                      'redactedFiles': manifest['summary']['redactedFiles']}))


if __name__ == '__main__':
    main()

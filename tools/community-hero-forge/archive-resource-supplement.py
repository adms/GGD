#!/usr/bin/env python3
"""Archive an audited resource gap without changing originals or existing archives."""
import argparse
import gzip
import hashlib
import importlib.util
import io
import json
import tarfile
from pathlib import Path, PurePosixPath


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workspace', type=Path, required=True)
    ap.add_argument('--inventory', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    workspace = args.workspace.resolve()
    inventory = json.loads(args.inventory.read_text())
    rows, seen = [], set()
    for row in inventory['files']:
        name = PurePosixPath(row['path'])
        if name.is_absolute() or '..' in name.parts or '\\' in str(name) or str(name) != row['path'] or str(name) in seen:
            raise ValueError('Invalid or duplicate inventory path')
        path = workspace / str(name)
        if path.is_symlink() or not path.resolve().is_relative_to(workspace) or not path.is_file():
            raise ValueError('Invalid inventory source: ' + str(name))
        rows.append({key: row[key] for key in ['path', 'bytes', 'sha256', 'mode']})
        seen.add(str(name))
    # This uses the same part format as the original material archive.
    spec = importlib.util.spec_from_file_location('material_archive', Path(__file__).with_name('archive-materials.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    args.output.mkdir(parents=True, exist_ok=False)
    parts, first = module.Parts(args.output), {}
    with gzip.GzipFile(filename='', mode='wb', fileobj=parts, mtime=0, compresslevel=6) as stream:
        with tarfile.open(fileobj=stream, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            for index, row in enumerate(rows):
                data = (workspace / row['path']).read_bytes()
                if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']:
                    raise ValueError('Source changed since audit: ' + row['path'])
                entry = tarfile.TarInfo(row['path'])
                entry.mode = row['mode'] & 0o777
                if row['sha256'] in first:
                    entry.type, entry.linkname = tarfile.LNKTYPE, first[row['sha256']]
                    archive.addfile(entry)
                else:
                    entry.size = row['bytes']
                    archive.addfile(entry, io.BytesIO(data))
                    first[row['sha256']] = row['path']
                if (index + 1) % 2000 == 0:
                    print(json.dumps({'archivedFiles': index + 1}), flush=True)
    parts.finish()
    manifest = {'schema': 'ggd-community-materials-archive@1', 'purpose': 'audited-resource-supplement',
                'sources': inventory['repositories'], 'files': rows, 'parts': parts.rows, 'excluded': [],
                'summary': {'files': len(rows), 'uniquePayloads': len(first), 'bytes': sum(r['bytes'] for r in rows),
                            'compressedBytes': parts.total, 'redactedFiles': 0}}
    path = args.output / 'manifest.json'
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    location = {'schema': 'ggd-community-materials-s3@1', 'bucket': 'ggd-390630837668-ap-east-2-an',
                'region': 'ap-east-2', 'profile': 'vibe-coding', 'manifestSha256': sha,
                'prefix': 'community-hero-forge/' + sha + '/'}
    (args.output / 's3-location.json').write_text(json.dumps(location, indent=2) + '\n')
    print(json.dumps(manifest['summary']))


if __name__ == '__main__':
    main()

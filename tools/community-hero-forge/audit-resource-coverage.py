#!/usr/bin/env python3
"""Compare current GGD resource bytes with explicitly provided archive inventories."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

EXTENSIONS = set('glb gltf obj fbx mdx mdl dds tga png webp jpg jpeg gif svg wav ogg mp3 mp4 webm avi bin zip tar gz exr hdr ktx ktx2 psd blend blp sf3 doo mmp shd w3a w3b w3d w3e w3h w3i w3q w3t w3u wpm imp w3c w3r w3s wct wtg'.split())


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workspace', type=Path, required=True)
    ap.add_argument('--archive-manifest', type=Path, action='append', required=True)
    ap.add_argument('--file-index-dir', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    known, inventories = set(), []
    for path in args.archive_manifest:
        known.update(row['sha256'] for row in json.loads(path.read_text())['files'])
        inventories.append({'path': str(path), 'sha256': digest(path)})
    for path in sorted(args.file_index_dir.glob('*/files.jsonl')):
        with path.open() as stream:
            known.update(json.loads(line)['sha256'] for line in stream)
        inventories.append({'path': str(path), 'sha256': digest(path)})
    repos, missing, checked = [], [], 0
    workspace = args.workspace.resolve()
    for name in ['GGD', 'GGD-community-hero-forge', 'GGD-community-hero-forge-s3', 'GGD-hero-auto-forge']:
        root = workspace / name
        tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().strip('\0').split('\0')
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        paths = [root / rel for rel in tracked]
        repos.append({'repository': name, 'head': head})
        if name == 'GGD':
            paths.extend((workspace / 'ggd-editor-pack-v2').rglob('*'))
        for path in paths:
            if path.suffix.lower().lstrip('.') not in EXTENSIONS or not path.is_file() or path.is_symlink():
                continue
            sha = digest(path)
            checked += 1
            if sha not in known:
                missing.append({'path': str(path.relative_to(workspace)), 'bytes': path.stat().st_size, 'sha256': sha})
    report = {'scope': 'Current tracked resource-format bytes across four GGD worktrees and editor pack. Not Git history, dependency caches, unrelated AI research, or the entire Mac.',
              'resourcePathsChecked': checked, 'uncoveredPaths': len(missing), 'uncovered': missing,
              'repositories': repos, 'resourceExtensions': sorted(EXTENSIONS), 'inventories': inventories,
              'remoteVerification': 'Refer to upload/read-back receipts for each archive; this check compares local bytes with their inventories.'}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'resourcePathsChecked': checked, 'uncoveredPaths': len(missing)}))
    if missing:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

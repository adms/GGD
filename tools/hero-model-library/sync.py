#!/usr/bin/env python3
"""Hydrate/verify only Git-pinned approved model bytes. Never read the legacy backup prefix."""
import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PREFIX = 's3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/releases/'

def read(path): return json.loads(path.read_text())
def sha(raw): return hashlib.sha256(raw).hexdigest()
def inside(root, rel):
    result = (root/rel).resolve()
    if not result.is_relative_to(root.resolve()): raise ValueError('Escaping model dependency: '+rel)
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--content', type=Path, default=REPO/'content')
    p.add_argument('--local-library', type=Path, default=REPO.parent/'GGD-Asset-Library')
    p.add_argument('--verify-only', action='store_true')
    p.add_argument('--write-file-list', type=Path)
    args = p.parse_args()
    root = args.content.resolve()
    manifest = read(REPO/'materials/hero-model-library/manifest.json')
    release = read(REPO/'materials/hero-model-library/release.json')
    if release['release_uri'] != PREFIX+release['release']+'/': raise ValueError('Unapproved release prefix')
    for model in manifest['models']:
        if sha(inside(root,'models/'+model['modelKey']+'.json').read_bytes()) != model['documentSha256']: raise ValueError('Model binding differs from Git release: '+model['modelKey'])
    sources = {m['sha256']: m for m in manifest['models']}
    required = {m['glbPath']: m['sha256'] for m in manifest['models']}
    original = {}
    for path in (root/'champions').glob('*.json'):
        if path.name.startswith('_'): continue
        for version in read(path).get('modelVersions', []):
            doc = read(inside(root, 'models/'+version['modelKey']+'.json'))
            required[doc['glbPath']] = version['binarySha256']
            if version['binarySha256'] not in sources:
                previous = read(inside(root, 'models/'+version['sourceModelKey']+'.json'))
                original[version['binarySha256']] = inside(root, previous['glbPath'])
    checked_identity = False
    def aws(arguments, action, resource):
        env = dict(os.environ, AWS_PROFILE='vibe-coding', AWS_REGION='ap-east-2', AWS_PAGER='')
        r = subprocess.run(['aws', *arguments, '--profile', 'vibe-coding', '--region', 'ap-east-2', '--no-cli-pager'], env=env, capture_output=True, text=True)
        if r.returncode: raise RuntimeError(f'{action} denied/failed on {resource}: {r.stderr.strip()}')
        return r.stdout
    for rel, digest in sorted(required.items()):
        target = inside(root, rel)
        if target.exists():
            if sha(target.read_bytes()) != digest: raise ValueError('Existing model changed; not overwritten: '+rel)
            continue
        if args.verify_only: raise ValueError('Missing model: '+rel)
        source = sources.get(digest)
        raw = None
        if source:
            location = release['model_locations'][source['modelKey']]
            if not location.startswith('ready/') or '..' in Path(location).parts: raise ValueError('Unapproved model path')
            local = inside(args.local_library.resolve()/'shared/releases'/release['release'], location)
            if local.is_file(): raw = local.read_bytes()
            if raw is None:
                if not checked_identity:
                    identity = aws(['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'], 'sts:GetCallerIdentity', 'configured role')
                    if 'assumed-role/vibe-coding-s3-role/' not in identity: raise RuntimeError('STOP: AWS role mismatch: '+identity.strip())
                    checked_identity = True
                with tempfile.TemporaryDirectory() as folder:
                    file = Path(folder)/'body.glb'
                    uri = release['release_uri']+location
                    aws(['s3', 'cp', uri, str(file), '--only-show-errors'], 's3:GetObject', uri)
                    raw = file.read_bytes()
        elif digest in original:
            raw = original[digest].read_bytes()
        if raw is None or sha(raw) != digest: raise ValueError('Missing or changed pinned model: '+rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        # The digest is verified before publishing a new path. Never overwrite another version.
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temp:
            temp.write(raw); temporary = Path(temp.name)
        try: os.link(temporary, target)
        finally: temporary.unlink()
    if args.write_file_list:
        args.write_file_list.write_text('\n'.join(sorted(required))+'\n')
    print(json.dumps(dict(release=release['release'], verified_files=len(required), manifest_sha256=sha((REPO/'materials/hero-model-library/manifest.json').read_bytes()))))

if __name__ == '__main__': main()

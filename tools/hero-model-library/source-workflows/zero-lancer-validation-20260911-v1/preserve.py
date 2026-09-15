#!/usr/bin/env python3
"""Preserve the complete hash-pinned source manifest into a new validation delivery."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source-root',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args();src=args.source_root.resolve();out=args.output.resolve()
    config=json.loads(Path(__file__).with_name('source-config.json').read_text())
    manifest=src/'files.sha256.json'
    assert sha(manifest)==config['sourceManifestSha256']
    rows=json.loads(manifest.read_text())['files']
    assert len(rows)==config['sourceManifestFiles']
    assert not out.exists() and not out.is_relative_to(src)
    for r in rows:
        p=src/r['path'];assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(src)
        assert p.stat().st_size==r['bytes'] and sha(p)==r['sha256'],str(p)
    out.mkdir(parents=True)
    for r in rows:
        p=out/'raw/source'/r['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src/r['path'],p)
        assert sha(p)==r['sha256']
    shutil.copy2(manifest,out/'raw/source/files.sha256.json')
    (out/'evidence').mkdir()
    (out/'evidence/source-preservation.json').write_text(json.dumps({'sourceConfig':config,
        'manifestFilesFreshShaPassed':len(rows),'sourceCopies':len(rows)+1,'originalFilesModified':False},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__': main()

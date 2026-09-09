#!/usr/bin/env python3
"""Mirror versioned library tooling and admit only checked model components; retain local originals."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--release', type=Path, required=True)
p.add_argument('--library', type=Path, required=True)
a = p.parse_args()
repo = Path(__file__).resolve().parents[2]
release, library = a.release.resolve(), a.library.resolve()
manifest = json.loads((release/'manifest.json').read_text())
old = json.loads((library/'catalog.json').read_text())
snapshot = library/'history/tooling-before-model-options'
source = repo/'materials/asset-library/source'
for path in source.rglob('*'):
    if not path.is_file() or '__pycache__' in path.parts:
        continue
    rel = path.relative_to(source)
    dest = library/rel
    if dest.exists() and not (snapshot/rel).exists():
        (snapshot/rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dest, snapshot/rel)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, dest)
env = dict(os.environ, GGD_CONTRACT_REPO=str(repo))
stage = library/'staging/hero-model-options'
stage.mkdir(parents=True, exist_ok=True)

def read(path): return json.loads(path.read_text())
def write(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
def admit(bundle):
    result = subprocess.run([sys.executable, str(library/'tools/admit.py'), str(bundle)], env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout+result.stderr)
    print(json.loads(result.stdout)['id'], flush=True)

# Existing VFX also pass the current validator; historical receipts remain untouched.
for entry in old['entries']:
    if entry['kind'] != 'vfx-library':
        continue
    bundle = stage/entry['id']
    if not bundle.exists():
        shutil.copytree(library/entry['path'], bundle, ignore=shutil.ignore_patterns('validation.json'))
    admit(bundle)
groups = {}
for model in manifest['models']:
    groups.setdefault(model['modelKey'], []).append(model)
allowed={entry["id"] for entry in old["entries"] if entry["kind"]=="vfx-library"}
for key, aliases in groups.items():
    model = aliases[0]
    rid = 'ggd.model.'+model['documentSha256'][:24]
    allowed.add(rid)
    for alias in aliases:
        alias['bundleId'] = rid
    bundle = stage/rid
    bundle.mkdir(exist_ok=True)
    for rel, digest in [(model['glbPath'], model['sha256']), ('models/'+key+'.json', model['documentSha256'])]:
        raw = (release/rel).read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError('Release bytes changed: '+rel)
        target = bundle/'content'/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    ids = {m['id'] for m in aliases}
    users = [dict(id=h['id'], name=h['name']) for h in manifest['heroes'] if any(o['sourceId'] in ids for o in h['options'])]
    write(bundle/'resource.json', dict(id=rid, title=model['sourceCharacter'], kind='model-body', model='models/'+key+'.json',
        provenance=dict(sources=aliases, heroes=users, scope=manifest['scope'])))
    admit(bundle)
catalog=read(library/'catalog.json');catalog['entries']=[e for e in catalog['entries'] if e['id'] in allowed];write(library/'catalog.json',catalog)
write(library/'hero-model-options.json', manifest)
shutil.copyfile(release/'spider-identity.json', library/'spider-identity.json')
print(json.dumps(dict(models=len(groups), options=sum(len(h['options']) for h in manifest['heroes']), productionDeployed=False)))

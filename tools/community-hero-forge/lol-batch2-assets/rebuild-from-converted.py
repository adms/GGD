#!/usr/bin/env python3
"""Replay this fixed batch from preserved converter outputs into a new tmp tree.

Uses only the existing repair, texture optimizer, compactor and upload verifier.
Does not download dependencies, write a repository, or publish anything.
"""
import argparse, hashlib, json, shutil, subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('source', type=Path)
p.add_argument('output', type=Path)
p.add_argument('repo', type=Path)
a = p.parse_args()
src, out, repo = a.source.resolve(), a.output.resolve(), a.repo.resolve()
out.mkdir(exist_ok=False)
(out/'logs').mkdir()
manifest = json.loads((src/'handoff-manifest.json').read_text())
recipes = json.loads((src/'conversion-recipes.json').read_text())['characters']
visibility = json.loads((src/'native-visibility-receipt.json').read_text())['models']
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def artifact(path): return {'path': str(path), 'sha256': sha(path), 'bytes': path.stat().st_size}
def run(label, command, cwd=repo):
    with (out/'logs'/f'{label}.log').open('w') as stream:
        subprocess.run(command, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT, check=True)
for tool in manifest['sourceTools']:
    path = repo/Path(tool['path']).relative_to(manifest['repo'])
    assert sha(path) == tool['sha256'], f'Source tool changed: {path}'
for row in visibility:
    assert sha(src/'converted'/f"{row['nativeId'].lower()}.glb") == row['sourceSha256']
shutil.copytree(src/'converted', out/'converted')
shutil.copytree(src/'skin-config', out/'skin-config')
shutil.copyfile(src/'conversion-recipes.json', out/'conversion-recipes.json')
run('native-visibility', ['python3', str(src/'apply-native-visibility.py'), str(out)])
shutil.copytree(out/'native-visible', out/'accessor-repaired')
repair = out/'tools/w3x-import/repair_glb_accessors.py'
repair.parent.mkdir(parents=True)
shutil.copyfile(repo/'tools/w3x-import/repair_glb_accessors.py', repair)
run('accessor-repair', ['python3', str(repair), str(out/'accessor-repaired'), '--apply'])
run('texture-optimize', ['node', '--import', 'tsx', 'tools/model-budget/optimize.ts', str(out/'accessor-repaired'), '--role', 'champion', '--tex-edge', '256', '--out', str(out/'texture256'), '--apply'])
compacted = ['chogath', 'ashe', 'blitzcrank', 'ahri', 'malphite']
(out/'ggd-selected-manifest.json').write_text(json.dumps({'models': [{'character': s, 'file': f'texture256/{s}.glb'} for s in compacted]}, indent=2)+'\n')
run('compact', ['node', str(src/'optimizer/compact-ggd.mjs'), str(out)])
run('zero-weight-joints', ['node', str(src/'optimizer/normalize-zero-weight-joints.mjs'), str(out)])
(out/'preparation').mkdir()
(out/'ready').mkdir()
results = []
for recipe in recipes:
    slug = recipe['nativeId'].lower()
    file = out/('canonical-skin' if slug in compacted else 'texture256')/f'{slug}.glb'
    preparation = {'schema': 'ggd-library-model-preparation@1', 'asset': 'lol:'+slug, 'source': artifact(out/'native-visible'/f'{slug}.glb'), 'output': artifact(file), 'stateClips': recipe['stateClips'], 'sourceArchive': {'path': recipe['sourceArchive'], 'sha256': recipe['sourceSha256']}, 'nativeVisibilityReceipt': str(out/'native-visibility-receipt.json'), 'limitations': recipe['limitations']}
    if slug in compacted:
        preparation['animationCompaction'] = str(out/'ggd-runtime-candidate-manifest.json')
        preparation['limitations'].append('Unrendered attachment motion omitted by existing compact-ggd; complete raw clips remain preserved.')
    receipt = out/'preparation'/f'{slug}.json'
    receipt.write_text(json.dumps(preparation, indent=2)+'\n')
    ready = out/'ready'/slug
    run(slug+'-finalize', ['node', '--import', 'tsx', 'tools/community-hero-forge/finalize-library-body.mts', '--receipt', str(receipt), '--out', str(ready)])
    expected = next(r for r in manifest['models'] if r['nativeId'] == recipe['nativeId'])
    assert sha(ready/'body.glb') == expected['body']['sha256'], f'Rebuild bytes differ: {slug}'
    assert json.loads((ready/'model.json').read_text())['id'] == expected['modelKey']
    results.append({'nativeId': recipe['nativeId'], 'body': artifact(ready/'body.glb'), 'modelKey': expected['modelKey'], 'matchesPreparedSha': True})
(out/'rebuild-result.json').write_text(json.dumps(results, indent=2)+'\n')

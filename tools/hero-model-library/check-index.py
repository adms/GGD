#!/usr/bin/env python3
"""Check portable release references and the three resolved identities without native backups."""
import hashlib
import json
from pathlib import Path

repo=Path(__file__).resolve().parents[2]
root=repo/'materials/hero-model-library'
read=lambda p:json.loads(p.read_text())
manifest=read(root/'manifest.json');release=read(root/'release.json');receipt=read(root/'s3-publication-receipt.json')
assert manifest['priority']==['300heroes','mba','original','w3x']
assert receipt['status']=='published_and_read_back_verified' and receipt['release']==release['release']
assert receipt['archive_sha256']==release['archive_sha256']
models={m['id']:m for m in manifest['models']}
assert len(models)==len(manifest['models'])
for m in models.values():
    path=repo/'content/models'/(m['modelKey']+'.json')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==m['documentSha256'],str(path)
    assert read(path)['glbPath']==m['glbPath']
    assert release['model_locations'][m['modelKey']].startswith('ready/')
heroes={h['id']:h for h in manifest['heroes']}
for h in heroes.values():
    ranks=[(manifest['priority'].index(o['source']['tier']),0 if o['sourceId']==h.get('preferredDerivative') else 1,['exact','alternate','style-proxy','previous'].index(o['source']['kind'])) for o in h['options']]
    assert ranks==sorted(ranks),h['id']
    assert all(o['sourceId'] in models for o in h['options'])
for hero,source in [('community-review-23-20260907','300heroes:137'),('b2-kumoko','pet:spider'),('godie-hapm','300heroes:41')]:
    assert heroes[hero]['options'][0]['sourceId']==source
    assert heroes[hero]['options'][0]['source']['kind']=='exact'
    assert not heroes[hero]['pending']
derivatives=read(root/'derivatives.json')['entries'];copies=read(root/'derivative-validation.json')['entries']
assert len(derivatives)==len(copies)==11
assert sum(h['id'].startswith('community-review-') for h in heroes.values())==37
assert sum(h['id'].startswith('b2-') for h in heroes.values())==37
assert sum(h['id'].startswith('example:') for h in heroes.values())==7
for e in derivatives:
    key='derivative:'+e['id'];h=heroes[e['heroId']];m=models[key];copy=next(x for x in copies if x['derivativeId']==key)
    assert h['options'][0]['sourceId']==key
    assert m['sha256']==copy['sha256'] and copy['sha256']!=copy['sourceSha256']
    assert copy['physicalCopy'] and copy['embeddedResources'] and copy['skinAndAnimationPayloadUnchanged']
    assert m['derivation']['sourceId']==e['sourceId']
proof=read(root/'spider-identity.json')
assert proof['evidence'][0]['fields']['10']==proof['evidence'][1]['fields']['1']==45029
assert all(e['fields']['2']=='蜘蛛子' for e in proof['evidence'])
print(json.dumps(dict(source_options=len(models),unique_models=len({m['modelKey'] for m in models.values()}),hero_targets=len(heroes),mappings=sum(len(h['options']) for h in heroes.values()),resolved=['坂田銀時','蜘蛛子','海克力斯']),ensure_ascii=False))

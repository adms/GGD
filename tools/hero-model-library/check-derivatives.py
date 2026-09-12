#!/usr/bin/env python3
"""Verify copies against their upstream GLBs, including all embedded motion/rig data."""
import argparse,json,hashlib,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);a=p.parse_args();ws=a.workspace.resolve();repo=Path(__file__).resolve().parents[2];base=ws/'outputs/hero-model-derivatives-20260910'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def decode(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def payload(d,b,i):
 acc=d['accessors'][i];v=d['bufferViews'][acc['bufferView']];offset=v.get('byteOffset',0)+acc.get('byteOffset',0);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[acc['type']];size={5121:1,5123:2,5125:4,5126:4}[acc['componentType']];assert 'byteStride' not in v;return b[offset:offset+width*size*acc['count']]
results={}
for folder in ['copies-v1','copies-v2','copies-v3','copies-v4','copies-v5']:
 for r in read(base/folder/'summary.json'):
  if r['stage']=='prepared':results[r['characterId']]=r
assert len(results)==11
proof=[]
for e in read(repo/'materials/hero-model-library/derivatives.json')['entries']:
 r=results['derivative:'+e['id']];runtime=Path(r['runtime']);prep=read(runtime/'receipt.json')['preparation'];source=Path(prep['source']['path']);out=runtime/'body.glb';d,b=decode(out);sd,sb=decode(source)
 assert source.is_file() and not out.is_symlink() and source.stat().st_ino!=out.stat().st_ino
 assert sha(source)==prep['source']['sha256'] and sha(out)!=sha(source)
 assert all('uri' not in x for x in d.get('images',[])+d['buffers'])
 assert len(d['skins'])==len(sd['skins'])
 for ns,ss in zip(d['skins'],sd['skins']):
  assert {k:v for k,v in ns.items() if k!='inverseBindMatrices'}=={k:v for k,v in ss.items() if k!='inverseBindMatrices'}
  assert payload(d,b,ns['inverseBindMatrices'])==payload(sd,sb,ss['inverseBindMatrices'])
 assert len(d['animations'])==len(sd['animations'])
 for anim in d['animations']:
  old=next(x for x in sd['animations'] if x['name']==anim['name']);assert anim['channels']==old['channels']
  for new_s,old_s in zip(anim['samplers'],old['samplers']):
   for key in ['input','output']:assert payload(d,b,new_s[key])==payload(sd,sb,old_s[key])
 if e['id']!='goblin':
  assert len(d['meshes'])==len(sd['meshes'])
  for nm,sm in zip(d['meshes'],sd['meshes']):
   for np,sp in zip(nm['primitives'],sm['primitives']):
    assert payload(d,b,np['indices'])==payload(sd,sb,sp['indices'])
    for k in sp['attributes']:assert payload(d,b,np['attributes'][k])==payload(sd,sb,sp['attributes'][k])
 for t in prep['textures']:
  copied=Path(t['copy']['path']);assert sha(copied)==t['copy']['sha256']
  if t['edited']:assert t['copy']['sha256']!=t['source']['sha256']
  else:assert t['copy']['sha256']==t['source']['sha256']
 if e['id']=='goblin':
  merged=d['meshes'][0]['primitives'][0]
  for attribute in merged['attributes']:
   expected=b''.join(payload(sd,sb,m['primitives'][0]['attributes'][attribute]) for m in sd['meshes'])
   assert payload(d,b,merged['attributes'][attribute])==expected
  for attach in prep['attachments']:assert attach['node'] in d['nodes'][attach['parentNode']]['children']
  assert {x['parentName'] for x in prep['attachments']}=={'Bip001 L Hand','Bip001 R Hand'}
 motion=read(runtime/'motion.json');assert motion['modelSha256']==sha(out)
 proof.append(dict(id=e['heroId'],derivativeId=r['characterId'],sourceId=e['sourceId'],sourceSha256=sha(source),sha256=sha(out),physicalCopy=True,embeddedResources=True,skinAndAnimationPayloadUnchanged=True,geometryPayloadUnchanged=e['id']!='goblin',geometryNote='Identical body vertices merged by material; two added hand attachments' if e['id']=='goblin' else 'Complete source geometry retained',textures=[dict(index=t['index'],sha256=t['copy']['sha256'],sourceSha256=t['source']['sha256'],edited=t['edited']) for t in prep['textures']],attachments=prep['attachments'],runtime=str(runtime.relative_to(ws))))
dest=repo/'materials/hero-model-library/derivative-validation.json';dest.write_text(json.dumps(dict(schema='ggd-independent-derivative-validation@1',count=11,entries=proof,visualScope='Local Babylon preview; not production deployment or gameplay acceptance'),ensure_ascii=False,indent=2)+'\n');print('Verified 11 independent full model copies, unchanged source bytes, embedded textures, preserved rigs and clips')

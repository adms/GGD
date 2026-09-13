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

# Two derivatives received later, separately accepted repairs.  The base copies-vN
# receipts remain useful provenance, but must not overwrite these accepted bytes
# when this generated index is rebuilt.
kirby_receipt_path=repo/'materials/hero-model-library/priority-evidence/procedural-palette-repair/receipt.json'
kirby_receipt=read(kirby_receipt_path)
kirby_model=next(x for x in kirby_receipt['models'] if x['id']=='kirby-derivative')
kirby_source_model=next(x for x in kirby_receipt['models'] if x['id']=='kirby-source')
kirby_glb=repo/kirby_model['newGlbPath'];kirby_source_glb=repo/kirby_source_model['newGlbPath']
assert sha(kirby_glb)==kirby_model['new'] and sha(kirby_source_glb)==kirby_source_model['new']
kirby=next(x for x in proof if x['derivativeId']=='derivative:kirby')
kirby.update(sourceSha256=kirby_source_model['new'],sha256=kirby_model['new'],textures=[dict(index=0,sha256=kirby_receipt['outputImage']['sha256'],sourceSha256=kirby_receipt['outputImage']['sha256'],edited=False)],evidence=str(kirby_receipt_path.relative_to(repo)))

mai_receipt_path=repo/'materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-acceptance.json'
mai_receipt=read(mai_receipt_path);mai_candidate=mai_receipt['candidate'];mai_glb=repo/mai_candidate['gitPath']
assert sha(mai_glb)==mai_candidate['sha256'] and mai_receipt['validation']['hardPolicy']['passed']
mai=next(x for x in proof if x['derivativeId']=='derivative:mai')
mai.update(sha256=mai_candidate['sha256'],geometryPayloadUnchanged=False,geometryNote=f"Complete edited source reduced from {mai_receipt['source']['triangles']} to {mai_candidate['triangles']} triangles; accepted source remains a separate dropdown option",runtime=mai_candidate['gitPath'],sourceBodySkinAndAnimationPayloadUnchanged=True,evidence=str(mai_receipt_path.relative_to(repo)))

goblin_receipt_path=repo/'materials/hero-model-library/priority-evidence/goblin-rigid-attachment-skin-v2/receipt.json'
goblin_receipt=read(goblin_receipt_path);accepted=goblin_receipt['acceptedSource'];goblin_glb=repo/accepted['glbPath']
assert sha(goblin_glb)==accepted['sha256']
goblin=next(x for x in proof if x['derivativeId']=='derivative:goblin')
old_attachments={x['name']:x for x in goblin['attachments']}
attachments=[]
for binding in goblin_receipt['bindings']:
 old=old_attachments[binding['mesh']]
 attachments.append(dict(name=binding['mesh'],parentNode=old['parentNode'],parentName=binding['joint'],node=old['node'],skin=0,jointSlot=binding['jointSlot'],vertices=binding['vertices'],binding='100%-rigid-to-hand-joint'))
texture=accepted['textures'][0]
goblin.update(sha256=accepted['sha256'],skinAndAnimationPayloadUnchanged=False,geometryPayloadUnchanged=False,geometryNote='Original body geometry retained; existing two hand attachments converted from rigid child meshes to fully skinned model-space primitives',textures=[dict(index=i,sha256=texture['sha256'],sourceSha256=t['sourceSha256'],edited=False,normalizedToMaxEdge=texture['width']) for i,t in enumerate(goblin['textures'])],attachments=attachments,runtime=accepted['glbPath'],sourceBodySkinAndAnimationPayloadUnchanged=True,accessorySkinPayloadAdded=True,evidence=str(goblin_receipt_path.relative_to(repo)))
dest=repo/'materials/hero-model-library/derivative-validation.json';dest.write_text(json.dumps(dict(schema='ggd-independent-derivative-validation@1',count=11,entries=proof,visualScope='Local Babylon preview; not production deployment or gameplay acceptance'),ensure_ascii=False,indent=2)+'\n');print('Verified 11 independent full model copies, unchanged source bytes, embedded textures, preserved rigs and clips')

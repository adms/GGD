#!/usr/bin/env python3
"""Validate a complete resource bundle before copying it into ready/. No game writes."""
import argparse,hashlib,json,math,os,re,shutil,struct,subprocess,tempfile
from pathlib import Path
from datetime import datetime
ROOT=Path(__file__).resolve().parent.parent
STATES=('idle','run','attack','cast','hurt','death')
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def local(root,rel):
 p=(root/rel).resolve()
 if not p.is_relative_to(root.resolve()) or not p.is_file():raise ValueError('Missing or escaping dependency: '+str(rel))
 return p

def glb(path,clipmap,component=False):
 b=path.read_bytes();magic,v,total=struct.unpack_from('<4sII',b)
 if magic!=b'glTF' or v!=2 or total!=len(b):raise ValueError('Invalid GLB header')
 n,kind=struct.unpack_from('<I4s',b,12)
 if kind!=b'JSON':raise ValueError('Missing GLB JSON')
 d=json.loads(b[20:20+n]);bl,bt=struct.unpack_from('<I4s',b,20+n);binary=b[28+n:28+n+bl]
 if bt!=b'BIN\0' or len(binary)!=bl:raise ValueError('Invalid binary chunk')
 if any('uri' in x for x in d.get('buffers',[])+d.get('images',[])):raise ValueError('GLB must embed buffers and textures')
 for view in d.get('bufferViews',[]):
  if view.get('buffer',0)!=0 or view.get('byteOffset',0)+view['byteLength']>bl:raise ValueError('GLB buffer bounds')
 formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
 widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 cache={}
 def accessor(i):
  if i in cache:return cache[i]
  a=d['accessors'][i]
  if 'sparse' in a or 'bufferView' not in a:raise ValueError('Sparse/accessor layout requires conversion')
  fmt,size=formats[a['componentType']];width=widths[a['type']];view=d['bufferViews'][a['bufferView']];stride=view.get('byteStride',width*size);start=view.get('byteOffset',0)+a.get('byteOffset',0)
  end=start+(a['count']-1)*stride+width*size if a['count'] else start
  if end>view.get('byteOffset',0)+view['byteLength']:raise ValueError('Accessor bounds')
  rows=[struct.unpack_from('<'+fmt*width,binary,start+j*stride) for j in range(a['count'])]
  if any(not math.isfinite(v) for row in rows for v in row):raise ValueError('Non-finite accessor')
  if a.get('normalized'):
   divisor={5121:255,5123:65535,5120:127,5122:32767}.get(a['componentType'])
   if divisor:rows=[tuple(max(-1,x/divisor) for x in row) for row in rows]
  cache[i]=rows;return rows
 for i in range(len(d.get('accessors',[]))):accessor(i)
 skins=d.get('skins',[])
 if not skins and not component:raise ValueError('Character requires a skin')
 skinned=0
 for node in d.get('nodes',[]):
  if 'skin' not in node:continue
  skinned+=1;s=skins[node['skin']];joints=s['joints']
  if not joints or any(j>=len(d['nodes']) or j<0 for j in joints):raise ValueError('Invalid skin joints')
  for prim in d['meshes'][node['mesh']]['primitives']:
   at=prim['attributes']
   if not {'POSITION','JOINTS_0','WEIGHTS_0'}<=set(at):raise ValueError('Missing skin attributes')
   js=accessor(at['JOINTS_0']);ws=accessor(at['WEIGHTS_0']);ps=accessor(at['POSITION'])
   if not len(js)==len(ws)==len(ps):raise ValueError('Skin vertex counts')
   for j,w in zip(js,ws):
    if any(x<0 or x>=len(joints) for x in j) or any(x<0 for x in w) or abs(sum(w)-1)>0.002:raise ValueError('Invalid joint/weight values')
 if not skinned and not component:raise ValueError('No skinned mesh nodes')
 names={a.get('name'):a for a in d.get('animations',[])}
 if len(names)!=len(d.get('animations',[])) or any(not name for name in names):raise ValueError('Animation names must be nonempty and unique')
 if not component and len(set(clipmap.values()))!=len(STATES):raise ValueError('Core state fallback/alias is not standardized')
 for state in STATES:
  if clipmap.get(state) not in names:raise ValueError('Unbound state '+state)
  animation=names[clipmap[state]]
  if not animation.get('channels'):raise ValueError('Empty animation '+state)
  for channel in animation['channels']:
   if channel['target']['node']>=len(d['nodes']):raise ValueError('Animation target invalid')
   sampler=animation['samplers'][channel['sampler']];times=[x[0] for x in accessor(sampler['input'])]
   if not times or any(y<=x for x,y in zip(times,times[1:])):raise ValueError('Invalid animation timeline')
 return dict(animations=len(names),skins=len(skins),state_bindings=clipmap)

def validate(bundle):
 resource=read(local(bundle,'resource.json'));kind=resource['kind'];rid=resource['id']
 if not re.fullmatch('[a-z0-9][a-z0-9._-]+',rid):raise ValueError('Invalid stable ID')
 if kind not in ('character','vfx-library','model-body'):raise ValueError('Unknown profile')
 if not resource.get('provenance'):raise ValueError('Missing provenance')
 content=bundle/'content';plan=[];vfx={};required={'resource.json'}
 for rel in resource.get('vfx',[]):
  p=local(content,rel);doc=read(p);plan.append(dict(kind='vfx',path=str(p)));vfx[doc['id']]=doc;required.add('content/'+rel)
  if doc.get('texture'):
   texture=local(content,doc['texture'])
   if texture.suffix.lower() not in ('.png','.webp'):raise ValueError('Texture must be PNG/WebP')
   header=texture.read_bytes()[:12]
   if not(header.startswith(b'\x89PNG\r\n\x1a\n') or header[:4]==b'RIFF' and header[8:12]==b'WEBP'):raise ValueError('Texture signature mismatch')
   required.add('content/'+doc['texture'])
 if not vfx and kind!='model-body':raise ValueError('No standardized VFX definitions')
 result={}
 if kind in ('character','model-body'):
  rel=resource['model'];p=local(content,rel);doc=read(p);required.add('content/'+rel);plan.append(dict(kind='model',path=str(p)))
  model=local(content,doc['glbPath']);required.add('content/'+doc['glbPath']);result=glb(model,doc['clipMap'],component=kind=='model-body')
  result['full_character_package']=kind=='character'
  result['aliased_states']=len(set(doc['clipMap'].values()))<6
  scripts=resource.get('scripts',[])
  if not scripts and kind=='character':raise ValueError('Missing bound VFX event scripts')
  for rel in scripts:
   p=local(content,rel);s=read(p);required.add('content/'+rel);plan.append(dict(kind='script',path=str(p)))
   for seg in s['segments']:
    if seg['kind']=='vfx' and seg.get('vfxId') not in vfx:raise ValueError('Unresolved VFX '+str(seg.get('vfxId')))
    if seg['kind'] not in ('vfx','anim'):raise ValueError('Segment dependency needs a supported adapter: '+seg['kind'])
    if seg['kind']=='anim' and seg.get('pulse') not in doc['clipMap']:raise ValueError('Unbound animation pulse')
    if seg.get('attach') and seg['attach'] not in doc.get('attachPoints',{}):raise ValueError('Unbound VFX anchor')
    if seg.get('on') not in ('castStart','castEffect','projectileSpawn','projectileHit'):raise ValueError('Unsupported event binding')
  result['event_binding_targets']=[read(local(content,r))['abilityId'] for r in scripts]
 policy=read(ROOT/'policy.json');repo=Path(os.environ.get('GGD_CONTRACT_REPO',ROOT/policy['contract_repo'])).resolve()
 with tempfile.TemporaryDirectory() as tmp:
  planfile=Path(tmp)/'schema-plan.json';write(planfile,plan)
  proc=subprocess.run(['node','--import',(repo/'node_modules/tsx/dist/loader.mjs').as_uri(),str(ROOT/'tools/validate-schema.mts'),str(repo),str(planfile)],capture_output=True,text=True)
  if proc.returncode:raise ValueError('GGD schema validation failed: '+proc.stdout+proc.stderr)
  result['schema_validation']=json.loads(proc.stdout)
 # Do not silently carry unrelated raw files through the admission path.
 allfiles={str(p.relative_to(bundle)) for p in bundle.rglob('*') if p.is_file()}
 if allfiles!=required:raise ValueError('Undeclared bundle files: '+str(sorted(allfiles-required)))
 files=[dict(path=r,bytes=local(bundle,r).stat().st_size,sha256=sha(local(bundle,r))) for r in sorted(required)]
 digest=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
 schema_digest=hashlib.sha256()
 for p in sorted((repo/'packages/shared/src/content/schema').rglob('*.ts')):schema_digest.update(str(p.relative_to(repo)).encode());schema_digest.update(p.read_bytes())
 return resource,dict(schema='ggd-resource-validation@1',status='standardized',profile=kind,content_digest=digest,
                      files=files,policy_sha256=sha(ROOT/'policy.json'),schema_tree_sha256=schema_digest.hexdigest(),
                      source_repo=str(repo),checked_at=datetime.now().astimezone().isoformat(),checks=result,
                      validator_sha256=sha(Path(__file__)),schema_validator_sha256=sha(ROOT/'tools/validate-schema.mts'),
                      production_acceptance='not_claimed')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('bundle',type=Path);parser.add_argument('--check-only',action='store_true');args=parser.parse_args()
 resource,proof=validate(args.bundle.resolve())
 if args.check_only:print(json.dumps(proof,ensure_ascii=False));return
 revision=hashlib.sha256(json.dumps({k:proof[k] for k in ['content_digest','policy_sha256','schema_tree_sha256','validator_sha256','schema_validator_sha256']},sort_keys=True).encode()).hexdigest()
 proof['admission_digest']=revision
 dest=ROOT/'ready'/resource['id']/revision[:16]
 if not dest.exists():
  dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.building');shutil.copytree(args.bundle,tmp);write(tmp/'validation.json',proof);tmp.rename(dest)
 catalog=read(ROOT/'catalog.json') if (ROOT/'catalog.json').exists() else dict(schema='ggd-standardized-resource-catalog@1',entries=[])
 entry=dict(id=resource['id'],kind=resource['kind'],title=resource['title'],status='standardized',
            path=str(dest.relative_to(ROOT)),vfx_count=len(resource.get('vfx',[])),content_digest=proof['content_digest'],
            validation=str((dest/'validation.json').relative_to(ROOT)),provenance=resource['provenance'])
 catalog['entries']=[e for e in catalog['entries'] if e['id']!=entry['id']]+[entry];catalog['updated_at']=proof['checked_at']
 temp=ROOT/'catalog.json.tmp';write(temp,catalog);temp.replace(ROOT/'catalog.json')
 print(json.dumps(entry,ensure_ascii=False,indent=2))
if __name__=='__main__':main()

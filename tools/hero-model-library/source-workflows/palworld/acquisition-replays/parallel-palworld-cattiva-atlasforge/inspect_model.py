"""Static inspection of the public viewer payload; reproduce its four magic bytes only.
No downloaded JavaScript is executed. Native viewer payload is preserved unchanged.
"""
from pathlib import Path
import hashlib,json,struct,math
root=Path(__file__).resolve().parents[1]
source=root/'original/PinkCat.viewer-model'; b=source.read_bytes()
assert b[:4]==bytes([1,1,1,1]) and struct.unpack_from('<II',b,4)==(2,len(b))
# The source page's public viewer explicitly sets these four bytes before GLTFLoader.parse.
out=root/'decoded/cattiva-atlasforge.glb'; cooked=b'glTF'+b[4:]
assert not out.exists() or out.read_bytes()==cooked
out.write_bytes(cooked)
at=12;chunks=[]
while at<len(b):
 size,kind=struct.unpack_from('<II',b,at);at+=8
 assert at+size<=len(b);chunks.append((kind,b[at:at+size]));at+=size
assert at==len(b)
g=json.loads(chunks[0][1]);binary=next(v for k,v in chunks if k==0x004e4942)
assert all('uri' not in x for x in g['buffers'])
assert len(binary)>=g['buffers'][0]['byteLength']
def floats(ai):
 a=g['accessors'][ai];assert a['componentType']==5126 and a['type']=='SCALAR'
 v=g['bufferViews'][a['bufferView']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',4)
 out=[struct.unpack_from('<f',binary,start+i*stride)[0] for i in range(a['count'])]
 assert all(math.isfinite(x) for x in out);return out
anims=[]
for i,a in enumerate(g.get('animations',[])):
 times=[floats(x['input']) for x in a['samplers']];duration=max(max(t) for t in times)-min(min(t) for t in times)
 anims.append({'index':i,'name':a.get('name'),'durationSeconds':duration,'channels':len(a['channels']),'samplers':len(a['samplers']),'targetNodes':len({c['target']['node'] for c in a['channels']}),'targetPaths':sorted({c['target']['path'] for c in a['channels']}),'sampleCounts':sorted({len(t) for t in times}),'provenance':'source-supplied AS_PinkCat_Idle, original-game origin indicated by source/native naming; no raw Unreal animation bank acquired','procedural':False})
images=[];(root/'extracted/textures').mkdir(parents=True,exist_ok=True)
for i,x in enumerate(g.get('images',[])):
 v=g['bufferViews'][x['bufferView']];start=v.get('byteOffset',0);data=binary[start:start+v['byteLength']]
 ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[x['mimeType']];p=root/'extracted/textures'/f'image-{i}.{ext}'
 assert not p.exists() or p.read_bytes()==data;p.write_bytes(data)
 images.append({'index':i,'name':x.get('name'),'path':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'mimeType':x['mimeType']})
report={'schema':'ggd.cattiva.viewer-model-analysis@1','sourcePath':str(source),'sourceSha256':hashlib.sha256(b).hexdigest(),'sourceBytes':len(b),'convertedPath':str(out),'convertedSha256':hashlib.sha256(cooked).hexdigest(),'translation':'Only first four bytes normalized exactly as public viewer code; all remaining bytes identical','asset':g['asset'],'meshes':len(g.get('meshes',[])),'primitives':sum(len(x['primitives']) for x in g.get('meshes',[])),'skins':len(g.get('skins',[])),'uniqueJointNodes':len({j for s in g.get('skins',[]) for j in s['joints']}),'meshAccessors':[{'vertices':g['accessors'][p['attributes']['POSITION']]['count'],'triangles':g['accessors'][p['indices']]['count']//3} for m in g['meshes'] for p in m['primitives']],'materials':g.get('materials',[]),'images':images,'animationCount':len(anims),'animations':anims,'extensionsRequired':g.get('extensionsRequired',[]),'audioCount':0,'vfxCount':0,'readiness':'source-candidate-pending-standardization','backendIntegration':{'state':'not-registered','selectionVerified':False}}
(root/'analysis/static-analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['convertedSha256','meshes','primitives','skins','uniqueJointNodes','meshAccessors','animationCount','animations']},indent=2))

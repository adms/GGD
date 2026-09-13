"""Read-only bounded PSP GMO chunk/rig/motion inventory.
Format references: PiosGmoLibrary GmoFunctions.cs/GmoEnums.cs/Motion.cs.
No game execution, encryption handling, FPK decoding or GLB readiness claim.
"""
import argparse, collections, hashlib, json, math, struct
from pathlib import Path
TYPES={2:'File',3:'Model',4:'Bone',5:'Part',6:'Mesh',7:'Arrays',8:'Material',9:'Layer',10:'Texture',11:'Motion',12:'FCurve',0x12:'FileName',0x13:'FileImage',0x41:'ParentBone',0x44:'BlendBones',0x45:'BlendOffsets',0x48:'Translate',0x49:'RotateZYX',0x4a:'RotateYXZ',0x4b:'RotateQ',0x4c:'Scale',0x4d:'Scale2',0x4e:'DrawPart',0x61:'SetMaterial',0x62:'BlendSubset',0x66:'DrawArrays',0x67:'DrawParticle',0x91:'SetTexture',0xb1:'FrameLoop',0xb2:'FrameRate',0xb3:'Animate',0xb4:'FrameRepeat'}
def inspect(path):
 b=path.read_bytes()
 if not 32<=len(b)<=64*1024*1024:raise ValueError('file size outside bound')
 if b[:11]!=b'OMG.00.1PSP':raise ValueError('expected PSP little-endian GMO signature')
 records=[];maxchunks=200000
 def read(off,end,depth,parent=None):
  if depth>48 or len(records)>=maxchunks or off+8>end:raise ValueError('invalid chunk nesting/count/header')
  typ,args,nxt=struct.unpack_from('<HHI',b,off);half=bool(typ&0x8000);kind=typ&0x7fff
  minimum=8 if half else 16
  if half:args=8 # compact command header's second ushort is reserved, not an args offset
  if nxt<minimum or off+nxt>end or nxt%4:raise ValueError(f'invalid chunk span at {off:x}: {nxt}')
  if args<minimum or args>nxt:raise ValueError(f'args outside chunk at {off:x}')
  c={'offset':off,'bytes':nxt,'typeId':kind,'type':TYPES.get(kind,hex(kind)),'half':half,'argsOffset':off+args,'parentOffset':parent,'children':[]}
  if not half:
   child,data=struct.unpack_from('<II',b,off+8)
   if not minimum<=args<=data<=child<=nxt:raise ValueError(f'invalid chunk layout at {off:x}: {args} {data} {child} {nxt}')
   c.update(name=b[off+16:off+args].rstrip(b'\0').decode('shift_jis',errors='replace'),dataOffset=off+data,dataBytes=child-data)
  records.append(c)
  data_end=off+nxt if half else off+data
  def values(fmt):
   n=struct.calcsize('<'+fmt)
   if off+args+n>data_end:raise ValueError(f'args incomplete for {kind:x} at {off:x}')
   return struct.unpack_from('<'+fmt,b,off+args)
  if kind==0xb2:c['fps']=values('f')[0]
  elif kind==0xb1:c['frameRange']=values('2f')
  elif kind==0x41:c['boneParentRef']=values('I')[0]
  elif kind==0xb3:c['animateRefs']=values('4I')
  elif kind==12:
   flags,dim,keys,res=values('4I');c.update(curveFlags=flags,dimensions=dim,keyCount=keys)
   if dim>64 or keys>1000000:raise ValueError('curve count out of bound')
   stride=(2 if flags&128 else 4)*(dim+1);expected=keys*stride
   if expected>c['dataBytes']:raise ValueError('curve payload truncated')
   fmt='<'+('e' if flags&128 else 'f')*(dim+1)
   frames=[struct.unpack_from(fmt,b,c['dataOffset']+i*stride) for i in range(keys)]
   if not all(math.isfinite(v) for row in frames for v in row):raise ValueError('nonfinite curve')
   c.update(timeRange=[min(row[0] for row in frames),max(row[0] for row in frames)] if frames else None,keyPayloadBytes=expected,keyPayloadSha256=hashlib.sha256(b[c['dataOffset']:c['dataOffset']+expected]).hexdigest(),timeNondecreasing=all(a[0]<=z[0] for a,z in zip(frames,frames[1:])))
  if not half:
   p=off+child
   while p+8<=off+nxt:
    ch=read(p,off+nxt,depth+1,off);c['children'].append(ch['offset']);p+=ch['bytes']
   if any(b[p:off+nxt]):raise ValueError('nonzero unparsed chunk tail')
  return c
 root=read(16,len(b),0)
 if root['typeId']!=2 or root['bytes']+16!=len(b):raise ValueError('GMO file chunk does not consume file')
 byoff={r['offset']:r for r in records};motions=[]
 for r in records:
  if r['typeId']==11:
   kids=[byoff[o] for o in r['children']];fps=next((x['fps'] for x in kids if x['typeId']==0xb2),None);rng=next((x['frameRange'] for x in kids if x['typeId']==0xb1),None)
   motions.append({'name':r['name'],'offset':r['offset'],'bytes':r['bytes'],'fps':fps,'frameRange':rng,'secondsFromDeclaredFrameRange':(rng[1]-rng[0])/fps if rng and fps and fps>0 else None,'fcurveCount':sum(x['typeId']==12 for x in kids),'keyCount':sum(x.get('keyCount',0) for x in kids),'animateBindingCount':sum(x['typeId']==0xb3 for x in kids),'status':'native-motion-data-preserved-not-retargeted-or-playback-verified'})
 return {'schema':'ggd.native-gmo-inspection@1','source':str(path),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'signature':'OMG.00.1PSP','endianness':'little','counts':dict(collections.Counter(r['type'] for r in records)),'bones':[{'name':r['name'],'offset':r['offset'],'parentRef':next((byoff[o].get('boneParentRef') for o in r['children'] if byoff[o]['typeId']==0x41),None)} for r in records if r['typeId']==4],'motions':motions,'records':records,'structuralValidation':'pass-file-and-chunk-bounds-and-finite-key-payloads','limitations':['Chunk inventory is not a mesh render or animation playback validation.','Original game/character identity is not established by filenames or signature.','No FUC FPK/GMO asset was used to validate this parser.']}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=inspect(a.source);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(a.source),'counts':d['counts'],'motions':len(d['motions'])},ensure_ascii=False))

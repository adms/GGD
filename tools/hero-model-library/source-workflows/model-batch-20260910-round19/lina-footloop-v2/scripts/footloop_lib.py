from pathlib import Path
import sys,json,copy,math,hashlib,shutil
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');BASE=ROOT/'GGD-Asset-Library/intake/public-models-20260910';OLD=BASE/'parallel-community-lina-rays-300-retarget';P=BASE/'parallel-community-lina-rays-300-retarget-footloop-v2'
for s in ['scripts','evidence','candidates']:(P/s).mkdir(parents=True,exist_ok=True)
for s in ['glb_io.py','retarget_math.py']:shutil.copyfile(OLD/'scripts'/s,P/'scripts'/s)
sys.path.insert(0,str(P/'scripts'));import glb_io as glb,retarget_math as rm

def slerp(a,b,t):
 a=np.array(a);b=np.array(b);dot=np.dot(a,b)
 if dot<0:b=-b;dot=-dot
 if dot>.9995:r=a+t*(b-a);return r/np.linalg.norm(r)
 angle=math.acos(np.clip(dot,-1,1));return (math.sin((1-t)*angle)*a+math.sin(t*angle)*b)/math.sin(angle)
def sample(model,animation,time):
 j=model.gltf;nodes=copy.deepcopy(j['nodes'])
 for ch in animation['channels']:
  sampler=animation['samplers'][ch['sampler']];ts=np.array(model.accessor_values(sampler['input']));pa=ch['target']['path'];stride=4 if pa=='rotation' else 3;vs=np.array(model.accessor_values(sampler['output'])).reshape(-1,stride)
  if len(ts)==1:value=vs[0]
  else:
   hi=min(max(int(np.searchsorted(ts,time,side='right')),1),len(ts)-1);lo=hi-1;f=float(np.clip((time-ts[lo])/(ts[hi]-ts[lo]),0,1)) if ts[hi]!=ts[lo] else 0;mode=sampler.get('interpolation','LINEAR');assert mode in ['LINEAR','STEP'];value=vs[lo] if mode=='STEP' else slerp(vs[lo],vs[hi],f) if pa=='rotation' else (1-f)*vs[lo]+f*vs[hi]
  nd=nodes[ch['target']['node']];nd.pop('matrix',None);nd[pa]=value.tolist()
 return nodes

def make_boots(model,footnames,scale=1):
 j=model.gltf;skin=j['skins'][0];names={n['name']:i for i,n in enumerate(j['nodes'])};ibm=np.array(model.accessor_values(skin['inverseBindMatrices'])).reshape(-1,4,4).transpose(0,2,1);parts=[];rest,_=rm.globals_of(j)
 for n in j['nodes']:
  if 'skin'not in n:continue
  for prim in j['meshes'][n['mesh']]['primitives']:
   a=prim['attributes'];pos=np.array(model.accessor_values(a['POSITION'])).reshape(-1,3);ids=np.array(model.accessor_values(a['JOINTS_0']),dtype=int).reshape(-1,4);weights=np.array(model.accessor_values(a['WEIGHTS_0'])).reshape(-1,4)
   for side in 'LR':
    js=[skin['joints'].index(names[name]) for name in footnames[side]];mask=(weights*np.isin(ids,js)).sum(axis=1)>.5
    if not mask.any():continue
    ps=pos[mask];ix=ids[mask];ws=weights[mask];mats=np.array([rest[i]@b for i,b in zip(skin['joints'],ibm)]);h=np.c_[ps,np.ones(len(ps))];out=np.einsum('nk,nkij,nj->ni',ws,mats[ix],h)[:,:3]*scale;sole=out[:,1]<out[:,1].min()+.01;parts.append((side,ps,ix,ws,sole))
 return skin,ibm,parts

def feet(world,boot):
 skin,ibm,parts=boot;mats=np.array([world[i]@b for i,b in zip(skin['joints'],ibm)]);out={s:[] for s in 'LR'};soles={s:[] for s in 'LR'}
 for side,pos,ids,ws,mask in parts:
  h=np.c_[pos,np.ones(len(pos))];vs=np.einsum('nk,nkij,nj->ni',ws,mats[ids],h)[:,:3];out[side].append(vs);soles[side].append(vs[mask])
 return {s:{'vertices':np.concatenate(out[s]),'sole':np.concatenate(soles[s])} for s in 'LR'}
def duration(model,anim):return max(model.accessor_values(s['input'])[-1] for s in anim['samplers'])
def summarize(rows,side):
 vs=np.array([r[side]['soleCentroid'] for r in rows]);ys=np.array([r[side]['minY'] for r in rows]);ts=np.array([r['seconds'] for r in rows]);vel=np.gradient(vs,ts,axis=0);return {'minY':float(ys.min()),'maxY':float(ys.max()),'soleXzRange':np.ptp(vs[:,[0,2]],axis=0).tolist(),'loopSoleGap':float(np.linalg.norm(vs[-1]-vs[0])),'loopAnkleGap':float(np.linalg.norm(np.array(rows[-1][side]['ankle'])-np.array(rows[0][side]['ankle']))),'loopSoleVelocityGap':float(np.linalg.norm(vel[-1]-vel[0]))}
def main():
 sourcefile=ROOT/'GGD-hero-model-options/content/assets/models/community/df07ee9d9baf46a88033329bcba43d814580521de3d8b4b9a5deb161bd1f0628.glb';targetfile=OLD/'candidates/lina00-hands-a-300-idle-run-resampled-120hz.glb';models={'300':glb.read(str(sourcefile)),'retarget':glb.read(str(targetfile))};ratio=1.8731744117095663;reports=[]
 for clip in ['bat_idle','single_run']:
  result={'clip':clip,'units':'source additionally normalized by target/source leg length for comparison; native source values kept separately','sources':{}}
  for tag,m in models.items():
   names={n['name']:i for i,n in enumerate(m.gltf['nodes'])};root=names['Bip01' if tag=='300' else 'Pelvis'];footnames={s:[f'Bip01 {s} Foot',f'Bip01 {s} Toe0'] if tag=='300' else [f'Foot{s}'] for s in 'LR'};boot=make_boots(m,footnames,ratio if tag=='300' else 1);anim=next(a for a in m.gltf['animations'] if clip in a['name']);dur=duration(m,anim);times=np.linspace(0,dur,math.ceil(dur*240)+1);rows=[]
   for t in times:
    nodes=sample(m,anim,t);world,_=rm.globals_of(m.gltf,[rm.trs(n) for n in nodes]);f=feet(world,boot);r={'seconds':float(t),'rootWorldXYZ':world[root][:3,3].tolist()}
    for s in 'LR':
     ankle=world[names[footnames[s][0]]][:3,3];r[s]={'minY':float(f[s]['vertices'][:,1].min()),'soleCentroid':f[s]['sole'].mean(axis=0).tolist(),'ankle':ankle.tolist(),'ankleRelativeRoot':(ankle-world[root][:3,3]).tolist()}
    rows.append(r)
   result['sources'][tag]={'duration':dur,'sampleRate':240,'footGeometrySelection':footnames,'feet':{s:summarize(rows,s) for s in 'LR'},'frames':rows}
  result['endpointComparison']={s:{'sourceSoleGapNative':result['sources']['300']['feet'][s]['loopSoleGap'],'sourceSoleGapScaledToRaysLegLength':result['sources']['300']['feet'][s]['loopSoleGap']*ratio,'retargetSoleGap':result['sources']['retarget']['feet'][s]['loopSoleGap'],'sourceAnkleGapScaledToRaysLegLength':result['sources']['300']['feet'][s]['loopAnkleGap']*ratio,'retargetAnkleGap':result['sources']['retarget']['feet'][s]['loopAnkleGap']} for s in 'LR'};reports.append(result)
 (P/'evidence/source-versus-retarget-foot-comparison.json').write_text(json.dumps(reports,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-footloop-compare.py',P/'scripts/footloop_lib.py');print(json.dumps([{k:v for k,v in x.items() if k!='sources'} for x in reports],indent=2));print(json.dumps([{ 'clip':x['clip'],'sourceFeet':x['sources']['300']['feet']} for x in reports],indent=2))
if __name__=='__main__':main()

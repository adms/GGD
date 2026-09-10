from pathlib import Path
import sys,json,copy,hashlib,math,struct,shutil
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');base=ROOT/'GGD-Asset-Library/intake/public-models-20260910';p=base/'parallel-community-lina-rays-300-retarget';sys.path.insert(0,str(p/'scripts'));import glb_io as glb,retarget_math as rm
SRC=ROOT/'GGD-hero-model-options/content/assets/models/community/df07ee9d9baf46a88033329bcba43d814580521de3d8b4b9a5deb161bd1f0628.glb';TGT=base/'parallel-community-slayers-lina-hand-review/candidates/lina00-hands-a.glb';source=glb.read(str(SRC));target=glb.read(str(TGT));sj=source.gltf;j=copy.deepcopy(target.gltf);sn={n['name']:i for i,n in enumerate(sj['nodes'])};tn={n['name']:i for i,n in enumerate(j['nodes'])};sw0,sp=rm.globals_of(sj)
# Scale only the target skeleton root; skinned mesh node remains root as required by glTF.
j['nodes'][0].pop('matrix',None);j['nodes'][0]['scale']=[.01]*3;j['nodes'][0]['translation']=[0,0,0];j['nodes'][0]['rotation']=[0,0,0,1];tw0,tp=rm.globals_of(j);default_local=[rm.trs(n) for n in j['nodes']]
def norm(v):
 n=np.linalg.norm(v)
 if n<1e-9:raise ValueError('degenerate anatomical axis')
 return v/n
def aim(a,b):
 a=norm(a);b=norm(b);v=np.cross(a,b);c=np.dot(a,b)
 if c<-0.9999:raise ValueError('180-degree aim ambiguity')
 k=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])
 return np.eye(3)+k+k@k/(1+c)
def yframe(up,lateral):
 y=norm(up);x=norm(lateral-y*np.dot(y,lateral));z=norm(np.cross(x,y));return np.column_stack([x,y,z])
def zframe(forward,up):
 z=norm(forward);x=norm(np.cross(up,z));y=np.cross(z,x);return np.column_stack([x,y,z])
def pos(w,names,name):return w[names[name]][:3,3]
def vec(w,names,a,b):return pos(w,names,b)-pos(w,names,a)
maprows=[('Pelvis','Bip01 Pelvis','torso','Bip01 Spine','Spine2'),('Spine1','Bip01 Spine','torso','Bip01 Spine1','Spine2'),('Spine2','Bip01 Spine1','torso','Bip01 Neck','Neck'),('Neck','Bip01 Neck','torso','Bip01 Head','Head'),('Head','Bip01 Head','head',None,None)]
for side in ['L','R']:
 maprows.extend([(f'Clavicle{side}',f'Bip01 {side} Clavicle','aim',f'Bip01 {side} UpperArm',f'Shoulder{side}'),(f'Shoulder{side}',f'Bip01 {side} UpperArm','aim',f'Bip01 {side} Forearm',f'Elbow{side}'),(f'Elbow{side}',f'Bip01 {side} Forearm','aim',f'Bip01 {side} Hand',f'Hand{side}'),(f'Hand{side}',f'Bip01 {side} Hand','aim',f'Bip01 {side} Finger1',None),(f'Hip{side}',f'Bip01 {side} Thigh','aim',f'Bip01 {side} Calf',f'Knee{side}'),(f'Knee{side}',f'Bip01 {side} Calf','aim',f'Bip01 {side} Foot',f'Foot{side}'),(f'Foot{side}',f'Bip01 {side} Foot','foot',f'Bip01 {side} Toe0',None)])
leg_source=sum(np.linalg.norm(vec(sw0,sn,a,b)) for a,b in [('Bip01 L Thigh','Bip01 L Calf'),('Bip01 L Calf','Bip01 L Foot')]);leg_target=sum(np.linalg.norm(vec(tw0,tn,a,b)) for a,b in [('HipL','KneeL'),('KneeL','FootL')]);ratio=leg_target/leg_source
mapping=[]
for t,s,kind,sc,tc in maprows:
 i=tn[t];si=sn[s];n=j['nodes'][i];mat=default_local[i];n.pop('matrix',None);n['translation']=mat[:3,3].tolist();n['rotation']=rm.matq(rm.rotation(mat)).tolist();n['scale']=np.linalg.norm(mat[:3,:3],axis=0).tolist();mapping.append({'target':t,'targetNode':i,'targetParent':j['nodes'][tp[i]]['name'] if i in tp else None,'source':s,'sourceNode':si,'sourceParent':sj['nodes'][sp[si]]['name'] if si in sp else None,'method':kind,'sourceAimChild':sc,'targetAimChild':tc})
# Canonical head / foot secondary axes chosen once from bind orientation, then fixed for all frames.
headR=rm.rotation(sw0[sn['Bip01 Head']]);headCol=max([1,2],key=lambda c:abs(headR[2,c]));headSign=1 if headR[2,headCol]>0 else -1
torso_axes={}
for t,s,kind,sc,tc in maprows:
 if kind=='torso':
  r=rm.rotation(sw0[sn[s]]);col=max([1,2],key=lambda c:abs(r[0,c]));torso_axes[s]=(col,1 if r[0,col]>0 else -1)
foot_axes={}
for side in ['L','R']:
 r=rm.rotation(sw0[sn[f'Bip01 {side} Toe0']]);col=max([1,2],key=lambda c:abs(r[1,c]));foot_axes[side]=(col,1 if r[1,col]>0 else -1)

def sample_animation(animation,time):
 trsrows=[{'translation':np.array(n.get('translation',[0,0,0]),dtype=float),'rotation':np.array(n.get('rotation',[0,0,0,1]),dtype=float),'scale':np.array(n.get('scale',[1,1,1]),dtype=float)} for n in sj['nodes']]
 for c in animation['channels']:
  s=animation['samplers'][c['sampler']];times=np.array(source.accessor_values(s['input']));path=c['target']['path'];stride=4 if path=='rotation' else 3;values=np.array(source.accessor_values(s['output'])).reshape(-1,stride);assert s.get('interpolation','LINEAR') in ['LINEAR','STEP'];hi=min(max(int(np.searchsorted(times,time,side='right')),1),len(times)-1);lo=hi-1;t=0 if times[hi]==times[lo] else float(np.clip((time-times[lo])/(times[hi]-times[lo]),0,1));a=values[lo];b=values[hi]
  if path=='rotation':
   dot=float(np.dot(a,b))
   if dot<0:b=-b;dot=-dot
   if dot>.9995:value=a+t*(b-a);value=value/np.linalg.norm(value)
   else:angle=math.acos(np.clip(dot,-1,1));value=(math.sin((1-t)*angle)*a+math.sin(t*angle)*b)/math.sin(angle)
  else:value=a*(1-t)+b*t
  trsrows[c['target']['node']][path]=value.tolist()
 return rm.globals_of(sj,[rm.trs(n) for n in trsrows])[0]

# Boot samples are source vertices dominated by the target left/right Foot joint. No ad hoc mesh deformation.
skin=j['skins'][0];inv=np.array(target.accessor_values(skin['inverseBindMatrices'])).reshape(-1,4,4).transpose(0,2,1);boot_parts=[]
for node in j['nodes']:
 if 'skin'not in node:continue
 for prim in j['meshes'][node['mesh']]['primitives']:
  at=prim['attributes'];positions=np.array(target.accessor_values(at['POSITION'])).reshape(-1,3);ids=np.array(target.accessor_values(at['JOINTS_0']),dtype=int).reshape(-1,4);weights=np.array(target.accessor_values(at['WEIGHTS_0'])).reshape(-1,4)
  for side in ['L','R']:
   ji=skin['joints'].index(tn['Foot'+side]);mask=(weights*(ids==ji)).sum(axis=1)>.5
   if mask.any():boot_parts.append((side,positions[mask],ids[mask],weights[mask]))

def foot_points(world):
 matrices=np.array([world[i]@b for i,b in zip(skin['joints'],inv)]);out={'L':[],'R':[]}
 for side,positions,ids,weights in boot_parts:
  h=np.concatenate([positions,np.ones((len(positions),1))],axis=1);result=np.einsum('nk,nkij,nj->ni',weights,matrices[ids],h)[:,:3];out[side].append(result)
 return {s:np.concatenate(v) for s,v in out.items()}

mapdict={tn[t]:(t,s,kind,sc,tc) for t,s,kind,sc,tc in maprows};all_anims=[];clip_proof=[];saved_binary=bytearray(target.bin);accessors=j['accessors'];views=j['bufferViews']
def add_accessor(vals,kind):
 a=np.asarray(vals,dtype='<f4');n={'SCALAR':1,'VEC3':3,'VEC4':4}[kind];a=a.reshape(-1,n);pad=(-len(saved_binary))%4;saved_binary.extend(b'\0'*pad);v=len(views);views.append({'buffer':0,'byteOffset':len(saved_binary),'byteLength':a.nbytes});saved_binary.extend(a.tobytes());accessors.append({'bufferView':v,'componentType':5126,'count':len(a),'type':kind,'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()});return len(accessors)-1
for original_name in ['bat_idle','single_run']:
 animation=next(a for a in sj['animations'] if a['name']==original_name);sourceKeyTimes=sorted({float(t) for sam in animation['samplers'] for t in source.accessor_values(sam['input'])});times=sorted(set(sourceKeyTimes)|set(np.linspace(sourceKeyTimes[0],sourceKeyTimes[-1],math.ceil((sourceKeyTimes[-1]-sourceKeyTimes[0])*120)+1).tolist()));frames=[];footframes=[]
 for time in times:
  sw=sample_animation(animation,time);desired={};slateral=vec(sw,sn,'Bip01 R Thigh','Bip01 L Thigh');tlateral=vec(tw0,tn,'HipR','HipL')
  for t,s,kind,sc,tc in maprows:
   ti=tn[t];r0=rm.rotation(tw0[ti])
   if kind=='torso':
    sr=rm.rotation(sw[sn[s]]);col,sgn=torso_axes[s];desired[ti]=yframe(sr[:,0],sr[:,col]*sgn)@yframe(vec(tw0,tn,t,tc),tlateral).T@r0
   elif kind=='head':desired[ti]=yframe(rm.rotation(sw[sn[s]])[:,0],np.cross(rm.rotation(sw[sn[s]])[:,0],rm.rotation(sw[sn[s]])[:,headCol]*headSign))@r0
   elif kind=='foot':
    side=t[-1];toeR=rm.rotation(sw[sn[sc]]);col,sgn=foot_axes[side];desired[ti]=zframe(toeR[:,0],toeR[:,col]*sgn)@r0
   else:
    restdirection=vec(tw0,tn,t,tc) if tc else np.array([1 if t[-1]=='L' else -1,0,0]);desired[ti]=aim(restdirection,vec(sw,sn,s,sc))@r0
  current={};localqs={};localts={}
  def visit(i):
   if i in current:return current[i]
   parent=visit(tp[i]) if i in tp else np.eye(4);local=default_local[i].copy()
   if i in desired:
    localR=rm.rotation(parent).T@desired[i];local[:3,:3]=localR@np.diag(np.linalg.norm(default_local[i][:3,:3],axis=0));localqs[i]=rm.matq(localR)
    if i==tn['Pelvis']:
     newpos=tw0[i][:3,3].copy();newpos[1]+=(sw[sn['Bip01']][1,3]-sw0[sn['Bip01']][1,3])*ratio;local[:3,3]=(np.linalg.inv(parent)@np.r_[newpos,1])[:3];localts[i]=local[:3,3].copy()
   current[i]=parent@local;return current[i]
  for i in range(len(j['nodes'])):visit(i)
  feet=foot_points(current);footframes.append({'time':time,'LminY':float(feet['L'][:,1].min()),'RminY':float(feet['R'][:,1].min()),'Lmean':feet['L'].mean(axis=0).tolist(),'Rmean':feet['R'].mean(axis=0).tolist()});frames.append({'q':localqs,'t':localts})
 # One constant grounding offset per clip avoids penetration at the lowest sampled boot; it does not force contact/erase airborne phases.
 floor=min(min(x['LminY'],x['RminY']) for x in footframes);ground=.002-floor;pelvisparent=tw0[tp[tn['Pelvis']]];localGround=(np.linalg.inv(pelvisparent)@np.array([0,ground,0,0]))[:3]
 for f in frames:f['t'][tn['Pelvis']]+=localGround
 for f in footframes:f['LminY']+=ground;f['RminY']+=ground;f['Lmean'][1]+=ground;f['Rmean'][1]+=ground
 output={'name':'300heroes_'+original_name+'_retargeted_to_Rays_Lina','samplers':[],'channels':[]};inputidx=add_accessor(times,'SCALAR');steps={}
 for ti in sorted(desired):
  qs=[]
  for f in frames:
   q=f['q'][ti]
   if qs and np.dot(q,qs[-1])<0:q=-q
   qs.append(q)
  steps[j['nodes'][ti]['name']]=max([math.degrees(2*math.acos(min(1,abs(float(np.dot(a,b)))))) for a,b in zip(qs,qs[1:])]+[0]);ai=add_accessor(qs,'VEC4');output['samplers'].append({'input':inputidx,'output':ai,'interpolation':'LINEAR'});output['channels'].append({'sampler':len(output['samplers'])-1,'target':{'node':ti,'path':'rotation'}})
 ai=add_accessor([f['t'][tn['Pelvis']] for f in frames],'VEC3');output['samplers'].append({'input':inputidx,'output':ai,'interpolation':'LINEAR'});output['channels'].append({'sampler':len(output['samplers'])-1,'target':{'node':tn['Pelvis'],'path':'translation'}});all_anims.append(output);clip_proof.append({'sourceClip':original_name,'outputClip':output['name'],'duration':times[-1]-times[0],'sourceKeyTimes':sourceKeyTimes,'outputSampleTimes':times,'sampling':'120 Hz plus existing key times; evaluated from existing source GLB LINEAR interpolation; not new native motion','groundingSafetyMarginMeters':.002,'constantGroundOffsetMeters':ground,'rootMotion':'in-place horizontal root position; source root vertical delta scaled by target/source leg length; no invented trajectory','footSamples':footframes,'maxAdjacentRotationStepDegrees':steps,'nativeRaysAnimation':False})
j['animations']=all_anims;j['buffers']=[{'byteLength':len(saved_binary)}];j['asset']['generator']='GGD bounded anatomical-axis 300heroes animation retarget prototype';out=p/'candidates/lina00-hands-a-300-idle-run-resampled-120hz.glb';glb.write(str(out),j,bytes(saved_binary));sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();proof={'schema':'ggd-bounded-retarget-prototype@1','sourceModel':str(SRC),'sourceSha256':sha(SRC),'targetModel':str(TGT),'targetSha256':sha(TGT),'output':str(out),'outputSha256':sha(out),'sourceGame':'300英雄','targetSourceGame':'Tales of the Rays','attributionLabel':'300英雄動作重綁到Rays模型','nativeRaysAnimationClips':0,'sourceWalkClipAvailable':False,'sourceClips':['bat_idle','single_run'],'mappedJoints':mapping,'legLengthRatio':ratio,'sourceLegLength':leg_source,'targetLegLengthMeters':leg_target,'targetSceneScale':.01,'clips':clip_proof,'runtimeReady':False,'visualValidationComplete':False,'knownLimits':['Anatomical aim alignment does not transfer limb axial twist; target fingers are rigid mesh alternatives','No toe joint on Rays target; source toe orientation drives target boot orientation','Unmapped hair/cape/accessory bones retain local rest pose','Constant per-clip ground offset does not implement foot-contact IK','Source has idle/run but no separate walk; original run tempo retained']};(p/'retarget-proof-resampled-120hz.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-retarget-resampled.py',p/'scripts/ggd-lina-retarget-resampled.py');print(json.dumps({'mapped':len(mapping),'output':str(out),'bytes':out.stat().st_size,'clips':[{'name':x['sourceClip'],'ground':x['constantGroundOffsetMeters'],'maxRotationStep':max(x['maxAdjacentRotationStepDegrees'].values())} for x in clip_proof],'legRatio':ratio},ensure_ascii=False))

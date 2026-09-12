from pathlib import Path
import sys,copy,json,math,hashlib,shutil
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');BASE=ROOT/'GGD-Asset-Library/intake/public-models-20260910';P=BASE/'parallel-community-lina-rays-300-retarget-footloop-v2';OLD=BASE/'parallel-community-lina-rays-300-retarget';sys.path.insert(0,str(P/'scripts'));import footloop_lib as lib,glb_io as glb,retarget_math as rm
IN=OLD/'candidates/lina00-hands-a-300-idle-run-resampled-120hz.glb';model=glb.read(str(IN));j=copy.deepcopy(model.gltf);names={n['name']:i for i,n in enumerate(j['nodes'])};_,parents=rm.globals_of(j);boots=lib.make_boots(model,{s:[f'Foot{s}'] for s in 'LR'});sourcecompare=json.loads((P/'evidence/source-versus-retarget-foot-comparison.json').read_text());ratio=1.8731744117095663
# Fit one test actor speed from source ankle-relative-root trajectories in each stance window.
rows=sourcecompare[1]['sources']['300']['frames'];dur=sourcecompare[1]['sources']['300']['duration'];fits=[]
for side,(lo,hi) in [('R',(0,.17)),('L',(.5,.67))]:
 use=[r for r in rows if lo<=r['seconds']/dur<=hi];ts=np.array([r['seconds'] for r in use]);zs=np.array([r[side]['ankleRelativeRoot'][2] for r in use]);slope,intercept=np.polyfit(ts,zs,1);fits.append({'side':side,'sourcePhaseWindow':[lo,hi],'sourceRootRelativeAnkleSlope':float(slope),'scaledSpeed':float(-slope*ratio)})
speed=float(np.mean([f['scaledSpeed'] for f in fits]));identity=np.array([0.,0.,0.,1.]);tau=2*math.pi

def norm(a):return a/max(np.linalg.norm(a),1e-12)
def aim(a,b):
 a=norm(a);b=norm(b);v=np.cross(a,b);c=float(np.dot(a,b))
 if c<-0.9999:raise ValueError('ambiguous 180 degree IK swing')
 k=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+k+k@k/(1+c)
def quatmul(a,b):
 av=a[:3];bv=b[:3];return np.r_[a[3]*bv+b[3]*av+np.cross(av,bv),a[3]*b[3]-np.dot(av,bv)]
def invq(q):return np.r_[-q[:3],q[3]]
def qpower(q,t):
 q=norm(q)
 if q[3]<0:q=-q
 an=math.acos(np.clip(q[3],-1,1));s=math.sin(an)
 return identity.copy() if abs(s)<1e-10 else np.r_[q[:3]/s*math.sin(an*t),math.cos(an*t)]
def smooth(f):f=float(np.clip(f,0,1));return f*f*(3-2*f)
def globals(nodes):return rm.globals_of(j,[rm.trs(n) for n in nodes])[0]
def set_rotation(nodes,idx,worldR):
 w=globals(nodes);parentR=rm.rotation(w[parents[idx]]) if idx in parents else np.eye(3);nodes[idx]['rotation']=rm.matq(parentR.T@worldR).tolist();nodes[idx].pop('matrix',None)
def move_pelvis(nodes,delta):
 w=globals(nodes);idx=names['Pelvis'];local=(np.linalg.inv(w[parents[idx]])@np.r_[delta,0])[:3];nodes[idx]['translation']=(np.array(nodes[idx].get('translation',[0,0,0]))+local).tolist()
def solve_ik(nodes,side,goal,footR):
 hi,ki,fi=[names[f'{name}{side}'] for name in ['Hip','Knee','Foot']];w=globals(nodes);H,K,F=[w[x][:3,3] for x in [hi,ki,fi]];l1=np.linalg.norm(K-H);l2=np.linalg.norm(F-K);delta=goal-H;dist=np.linalg.norm(delta);reach=min(max(dist,abs(l1-l2)+.00001),l1+l2-.00001);u=norm(delta);A=H+u*reach;pole=K-H-u*np.dot(K-H,u)
 if np.linalg.norm(pole)<1e-7:pole=np.array([0,0,1])-u*u[2]
 pole=norm(pole);along=(l1*l1-l2*l2+reach*reach)/(2*reach);height=math.sqrt(max(0,l1*l1-along*along));newK=H+u*along+pole*height;set_rotation(nodes,hi,aim(K-H,newK-H)@rm.rotation(w[hi]));w=globals(nodes);K=w[ki][:3,3];F=w[fi][:3,3];set_rotation(nodes,ki,aim(F-K,A-K)@rm.rotation(w[ki]));set_rotation(nodes,fi,footR);actual=globals(nodes)[fi][:3,3];return {'requestedAnkle':goal.tolist(),'achievedAnkle':actual.tolist(),'unreachableDistance':abs(dist-reach),'ankleError':float(np.linalg.norm(actual-goal))}

def periodic_pose(anim,t):
 d=lib.duration(model,anim);n=lib.sample(model,anim,t);f=t/d;begin=.82;epsilon=min(1/240,d/32)
 if f<=begin:return n
 a=lib.sample(model,anim,0);b=lib.sample(model,anim,epsilon);amount=smooth((f-begin)/(1-begin));offset=(t-d)/epsilon
 for ch in anim['channels']:
  idx=ch['target']['node'];path=ch['target']['path'];va=np.array(a[idx][path]);vb=np.array(b[idx][path]);cur=np.array(n[idx][path])
  if path=='rotation':pred=quatmul(va,qpower(quatmul(invq(va),vb),offset));n[idx][path]=lib.slerp(cur,pred,amount).tolist()
  else:pred=va+(vb-va)*offset;n[idx][path]=((1-amount)*cur+amount*pred).tolist()
 return n

idle=next(a for a in j['animations'] if 'bat_idle'in a['name']);restIdle=lib.sample(model,idle,0);idleWorld=globals(restIdle);idleFeet=lib.feet(idleWorld,boots);flat={}
for s in 'LR':
 F=idleWorld[names['Foot'+s]];flat[s]={'rotation':rm.rotation(F),'ankleOffsetToGround':float(.002-(idleFeet[s]['vertices'][:,1].min()-F[1,3])),'idleAnchor':F[:3,3].copy()};flat[s]['idleAnchor'][1]=flat[s]['ankleOffsetToGround']

saved=bytearray(model.bin);animations=[];reports=[]
def add(vals,kind):
 a=np.asarray(vals,dtype='<f4').reshape(-1,{'SCALAR':1,'VEC3':3,'VEC4':4}[kind]);saved.extend(b'\0'*((-len(saved))%4));idx=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(saved),'byteLength':a.nbytes});saved.extend(a.tobytes());j['accessors'].append({'bufferView':idx,'componentType':5126,'count':len(a),'type':kind,'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()});return len(j['accessors'])-1
for anim in model.gltf['animations']:
 isidle='bat_idle'in anim['name'];d=lib.duration(model,anim);times=sorted(set(np.linspace(0,d,math.ceil(d*240)+1).tolist())|{float(t) for sm in anim['samplers'] for t in model.accessor_values(sm['input'])});times=np.unique(np.asarray(times,dtype=np.float32)).astype(float).tolist();channels=copy.deepcopy(anim['channels']);values={i:[] for i in range(len(channels))};evidence=[];centers={'R':.10,'L':.62};anchor={}
 if not isidle:
  for s in 'LR':
   n=periodic_pose(anim,centers[s]*d);move_pelvis(n,np.array([0,-.06,0]));w=globals(n);anchor[s]=w[names['Foot'+s]][:3,3].copy();anchor[s][1]=flat[s]['ankleOffsetToGround']
 for t in times:
  raw=lib.sample(model,anim,t);before=globals(raw);nodes=periodic_pose(anim,t);move_pelvis(nodes,np.array([0,-.02 if isidle else -.06,0]));w=globals(nodes);row={'seconds':t,'phase':t/d,'legs':{}};targets={}
  for s in 'LR':
   F=w[names['Foot'+s]];baseGoal=F[:3,3].copy();baseRotation=rm.rotation(F)
   if isidle:weight=1.;goal=flat[s]['idleAnchor'].copy();rotation=flat[s]['rotation'];phaseDelta=0
   else:
    phaseDelta=((t/d-centers[s]+.5)%1)-.5;weight=1-smooth((abs(phaseDelta)-.12)/.06);plant=anchor[s].copy();plant[2]-=speed*phaseDelta*d;goal=(1-weight)*baseGoal+weight*plant;rotation=rm.qmat(lib.slerp(rm.matq(baseRotation),rm.matq(flat[s]['rotation']),weight))
   targets[s]=(goal,rotation);row['legs'][s]={'stanceWeight':weight,'coreContact':weight>=.9999,'wrappedPhaseDelta':phaseDelta,'desiredAnkle':goal.tolist()}
  for s in 'LR':
   goal,rotation=targets[s];row['legs'][s]['ik']=solve_ik(nodes,s,goal,rotation)
  # Contact/floor correction on actual skinned boot geometry; no synthetic new walk/locomotion trajectory.
  for iteration in range(2):
   w=globals(nodes);f=lib.feet(w,boots)
   for s in 'LR':
    minY=float(f[s]['vertices'][:,1].min());goal,rotation=targets[s];correction=.002-minY if isidle or row['legs'][s]['coreContact'] else max(0,.002-minY)
    if abs(correction)>1e-6:
     goal=goal.copy();goal[1]+=correction;targets[s]=(goal,rotation);row['legs'][s]['ik']=solve_ik(nodes,s,goal,rotation)
  after=globals(nodes);feet=lib.feet(after,boots);row['pelvisWorldDelta']=(after[names['Pelvis']][:3,3]-before[names['Pelvis']][:3,3]).tolist();row['localRotationDeltaDegrees']={};
  for ci,ch in enumerate(channels):
   i=ch['target']['node'];pa=ch['target']['path'];v=np.array(nodes[i][pa]);
   if pa=='rotation':
    if values[ci] and np.dot(values[ci][-1],v)<0:v=-v
    row['localRotationDeltaDegrees'][j['nodes'][i]['name']]=float(math.degrees(2*math.acos(min(1,abs(float(np.dot(v,np.array(raw[i][pa]))))))))
   values[ci].append(v.tolist())
  for s in 'LR':row['legs'][s]['minBootY']=float(feet[s]['vertices'][:,1].min());row['legs'][s]['soleCentroid']=feet[s]['sole'].mean(axis=0).tolist()
  evidence.append(row)
 output={'name':anim['name']+'_processed_footplant_loop','samplers':[],'channels':channels};input=add(times,'SCALAR')
 for ci,ch in enumerate(channels):
  ch['sampler']=ci;output['samplers'].append({'input':input,'output':add(values[ci],'VEC4' if ch['target']['path']=='rotation' else 'VEC3'),'interpolation':'LINEAR'})
 animations.append(output);reports.append({'sourceClip':anim['name'],'outputClip':output['name'],'durationSeconds':d,'outputTimes':times,'samplingHz':240,'durationChanged':False,'nativeAnimation':False,'staticPelvisYAdjustmentMeters':-.02 if isidle else -.06,'loopBlendStartPhase':.82,'loopBlendMethod':'last 18% crossfade to first-pose backward extrapolation, matching first-frame velocity; derived seam processing','contactMethod':'two-bone IK, boot flat orientation, actual skinned-boot ground correction','runContactWindows':None if isidle else {'centers':centers,'coreHalfPhase':.12,'blendPhase':.06},'testActorSpeedMps':0 if isidle else speed,'frames':evidence})
j['animations']=animations;j['buffers']=[{'byteLength':len(saved)}];j['asset']['generator']='GGD 300heroes-to-Rays derived IK footplant and loop processing review';OUT=P/'candidates/lina00-hands-a-300-idle-run-footplant-initial-knee-pole.glb';glb.write(str(OUT),j,bytes(saved));proof={'schema':'ggd-derived-animation-footplant-loop@1','input':str(IN),'inputSha256':hashlib.sha256(IN.read_bytes()).hexdigest(),'output':str(OUT),'outputSha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'animationAttribution':'300英雄動作重綁到Rays模型，再作落地與循環加工','nativeRaysAnimations':0,'nativeFps':'unknown','speedFit':fits,'testActorSpeedMps':speed,'rootMotion':'GLB remains in-place; optional preview entity world translation at fitted speed tests foot plant; not native root motion','clips':reports,'runtimeReady':False};(P/'evidence/initial-knee-pole-processing-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-footloop-process.py',P/'scripts/ggd-lina-footloop-process.py');print(json.dumps({'file':str(OUT),'speed':speed,'fits':fits,'clips':[{'name':r['sourceClip'],'keys':len(r['outputTimes']),'minY':min(f['legs'][s]['minBootY'] for f in r['frames'] for s in 'LR'),'maxIKUnreachable':max(f['legs'][s]['ik']['unreachableDistance'] for f in r['frames'] for s in 'LR')} for r in reports]},indent=2))

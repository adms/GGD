"""Author Kaiji-specific six-state fallback gestures; preserve all native geometry.

No acquired native motion exists in this MOD. Rotations use the model's standing
world axes, converted back into each original local bone frame. Every original
joint, bind matrix, material, texture and accessor is retained. Ground correction
is sampled from actual skinned vertices, not the raw unposed mesh bounds.
"""
import copy,hashlib,importlib.util,json,math,sys
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('ggd_animation_io',root/'tools/hero-model-library/priority-conversion/sinbad/ggd-procedural-six-state.py')
io=importlib.util.module_from_spec(spec);spec.loader.exec_module(io)
source,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=False)
g,b=io.read_glb(source);assert not g.get('animations')
original=copy.deepcopy(g);world=io.worlds(g)
byname={n['name']:i for i,n in enumerate(g['nodes'])}
roles={'pelvis':'ORG-spine','spine':'ORG-spine.002','head':'ORG-spine.005',
       'armL':'ORG-upper_arm.L','armR':'ORG-upper_arm.R','forearmL':'ORG-forearm.L','forearmR':'ORG-forearm.R',
       'thighL':'ORG-thigh.L','thighR':'ORG-thigh.R','shinL':'ORG-shin.L','shinR':'ORG-shin.R','footL':'ORG-foot.L','footR':'ORG-foot.R'}
ids={k:byname[v] for k,v in roles.items()};rest={i:np.array(g['nodes'][i]['rotation'],float) for i in ids.values()}
basis={i:io.matrix_quat(world[i][:3,:3]/np.linalg.norm(world[i][:3,:3],axis=0)) for i in ids.values()}
skin=g['skins'][0];joints=skin['joints'];bind=io.accessor(g,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
attrs=g['meshes'][0]['primitives'][0]['attributes'];pos=io.accessor(g,b,attrs['POSITION']);weights=io.accessor(g,b,attrs['WEIGHTS_0']);indices=io.accessor(g,b,attrs['JOINTS_0']).astype(int)
homogeneous=np.column_stack([pos,np.ones(len(pos))]);base_root=np.array(g['nodes'][0]['translation'],float)
durations={'idle':2.4,'run':.8,'attack':1.,'cast':1.6,'hurt':.55,'death':1.25};g['animations']=[];reports=[]
for state,duration in durations.items():
 count=math.ceil(duration*30)+1;times=np.linspace(0,duration,count,dtype=np.float32)
 rotations={i:[] for i in ids.values()};roots=[];floors=[]
 for t in times:
  u=float(t/duration);s=math.sin(2*math.pi*u);v={k:np.zeros(3) for k in roles}
  v['armL'][2]=-75;v['armR'][2]=75
  if state=='idle':v['spine'][0]=1.3*s;v['head'][1]=2*s;v['armL'][0]=2*s;v['armR'][0]=-2*s
  elif state=='run':
   v['spine'][0]=5;v['thighL'][0]=-27*s;v['thighR'][0]=27*s
   v['shinL'][0]=38*max(0,s);v['shinR'][0]=38*max(0,-s)
   v['footL'][0]=-v['thighL'][0]-v['shinL'][0];v['footR'][0]=-v['thighR'][0]-v['shinR'][0]
   v['armL'][0]=22*s;v['armR'][0]=-22*s
  elif state=='attack':
   a=float(np.interp(u,[0,.2,.45,.65,1],[0,-.2,1,.55,0]));v['spine']=[6*a,15*a,0];v['armR'][0]=-83*a;v['armL'][0]=-15*a
  elif state=='cast':
   a=math.sin(math.pi*u)**2;v['armL'][2]+=58*a;v['armR'][2]-=58*a;v['armL'][0]=-20*a;v['armR'][0]=-20*a;v['spine'][0]=-4*a
  elif state=='hurt':
   a=float(np.interp(u,[0,.18,.45,1],[0,1,.5,0]));v['spine']=[17*a,0,6*a];v['head'][0]=-8*a;v['armL'][0]=-12*a;v['armR'][0]=-12*a
  else:
   a=min(1,u/.85);a=a*a*(3-2*a);v['pelvis'][2]=86*a;v['spine'][0]=8*a;v['armL'][2]+=25*a
  posed=copy.deepcopy(original)
  for role,i in ids.items():
   qw=basis[i];inverse=qw*np.array([-1,-1,-1,1]);offset=io.qmul(io.qmul(inverse,io.euler(v[role])),qw)
   q=io.qmul(rest[i],offset)
   if rotations[i] and np.dot(q,rotations[i][-1])<0:q=-q
   rotations[i].append(q.tolist());posed['nodes'][i]['rotation']=q.tolist()
  posed_world=io.worlds(posed);matrices=np.array([posed_world[i] for i in joints])@bind
  points=np.einsum('nk,nki->ni',weights,np.einsum('nkij,nj->nki',matrices[indices],homogeneous))[:,:3]
  floor=float(points[:,1].min());translation=base_root+[0,-floor,0];roots.append(translation.tolist());floors.append(floor)
 ti=io.add_accessor(g,b,times,'SCALAR',bounds=True);samplers=[];channels=[]
 for i,keys in rotations.items():
  oi=io.add_accessor(g,b,keys,'VEC4');channels.append({'sampler':len(samplers),'target':{'node':i,'path':'rotation'}});samplers.append({'input':ti,'output':oi,'interpolation':'LINEAR'})
 oi=io.add_accessor(g,b,roots,'VEC3');channels.append({'sampler':len(samplers),'target':{'node':0,'path':'translation'}});samplers.append({'input':ti,'output':oi,'interpolation':'LINEAR'})
 g['animations'].append({'name':'GGD_procedural_'+state,'samplers':samplers,'channels':channels,'extras':{'provenance':'GGD authored fallback; not native or retargeted','native':False,'loopIntent':state in ['idle','run']}})
 reports.append({'state':state,'seconds':duration,'keys':count,'channels':len(channels),'floorCorrectionMin':-max(floors),'floorCorrectionMax':-min(floors)})
g['extras']={'ggdProceduralFallback':{'sourceNativeAnimationCount':0,'authoringSampleRateHz':30,'worldAxisMappedToNativeBoneFrames':True,'allNativePartsRetained':True}}
sha=io.write_glb(g,b,out/'body.glb')
receipt={'schema':'ggd-kaiji-procedural-animation@1','source':str(source.resolve()),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSha256':sha,'bones':len(joints),'sourcePrimitives':len(g['meshes'][0]['primitives']),'stateClips':{s:'GGD_procedural_'+s for s in durations},'boneRolesFromAvatar':roles,'clips':reports,'native':False,'retargeted':False,'allOriginalAccessorsUnchanged':g['accessors'][:len(original['accessors'])]==original['accessors'],'limitations':['Generic procedural gestures; not source-game movement or original skill timing.','No foot IK, physical fall or cloth simulation. Floor correction is evaluated at authored keys; interpolation and transitions require separate playback review.','No source audio or VFX is generated by this process.']}
(out/'animation.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))

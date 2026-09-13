from pathlib import Path
import sys,json,math,hashlib,shutil
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');BASE=ROOT/'GGD-Asset-Library/intake/public-models-20260910';P=BASE/'parallel-community-lina-rays-300-retarget-footloop-v2';sys.path.insert(0,str(P/'scripts'));import footloop_lib as lib,glb_io as glb,retarget_math as rm
proof=json.loads((P/'processing-proof.json').read_text());speed=proof['testActorSpeedMps'];reports=[]
for key in ['bat_idle','single_run']:
 item={'clip':key,'speedMps':0 if key=='bat_idle' else speed,'variants':{}}
 for tag,file in [('prior',proof['input']),('processed',proof['output'])]:
  m=glb.read(file);j=m.gltf;anim=next(a for a in j['animations'] if key in a['name']);names={n['name']:i for i,n in enumerate(j['nodes'])};boots=lib.make_boots(m,{s:[f'Foot{s}'] for s in 'LR'});duration=lib.duration(m,anim);times=np.linspace(0,duration,math.ceil(duration*960)+1);rows=[]
  for t in times:
   nodes=lib.sample(m,anim,t);w=rm.globals_of(j,[rm.trs(n) for n in nodes])[0];f=lib.feet(w,boots);r={'seconds':float(t),'phase':float(t/duration)}
   assert all(np.isfinite(x).all() for x in w.values())
   for side in 'LR':
    pos=f[side]['sole'].mean(axis=0);phaseDelta=((t/duration-{'R':.10,'L':.62}[side]+.5)%1)-.5;core=key=='bat_idle' or abs(phaseDelta)<=.12;r[side]={'minY':float(f[side]['vertices'][:,1].min()),'soleCentroid':pos.tolist(),'ankle':w[names['Foot'+side]][:3,3].tolist(),'plantWorldCentroid':(pos+np.array([0,0,item['speedMps']*t])).tolist(),'scheduledCoreContact':bool(core)}
   rows.append(r)
  stats={}
  for side in 'LR':
   vs=np.array([r[side]['soleCentroid'] for r in rows]);world=np.array([r[side]['plantWorldCentroid'] for r in rows]);vel=np.gradient(world,times,axis=0);yv=np.array([r[side]['minY'] for r in rows]);core=np.array([r[side]['scheduledCoreContact'] for r in rows]);inner=core.copy();inner[1:]&=core[:-1];inner[:-1]&=core[1:];cv=np.linalg.norm(vel[inner][:,[0,2]],axis=1);stats[side]={'minBootY':float(yv.min()),'maxBootY':float(yv.max()),'loopSoleGapMeters':float(np.linalg.norm(vs[-1]-vs[0])),'loopAnkleGapMeters':float(np.linalg.norm(np.array(rows[-1][side]['ankle'])-np.array(rows[0][side]['ankle']))),'loopSoleVelocityGapMetersPerSecond':float(np.linalg.norm(vel[-1]-vel[0])),'coreContactSampleCount':int(core.sum()),'coreContactMinY':float(yv[core].min()),'coreContactMaxY':float(yv[core].max()),'coreWorldFootSpeedMedianMps':float(np.median(cv)),'coreWorldFootSpeedP95Mps':float(np.quantile(cv,.95)),'coreWorldFootSpeedMaxMps':float(cv.max()),'horizontalSoleRangeMeters':np.ptp(vs[:,[0,2]],axis=0).tolist()}
  item['variants'][tag]={'path':file,'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest(),'duration':duration,'samplesHz':960,'sampleCount':len(rows),'feet':stats,'frames':rows}
 reports.append(item)
(P/'evidence/footloop-dense-audit-960hz.json').write_text(json.dumps(reports,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-footloop-audit.py',P/'scripts/ggd-lina-footloop-audit.py');print(json.dumps([{'clip':r['clip'],'speedMps':r['speedMps'],'variants':{k:v['feet'] for k,v in r['variants'].items()}} for r in reports],indent=2))

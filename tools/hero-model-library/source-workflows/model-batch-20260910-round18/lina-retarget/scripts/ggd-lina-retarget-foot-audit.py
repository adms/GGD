from pathlib import Path
import sys,json,ast,copy,math,subprocess,hashlib,shutil
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');p=ROOT/'GGD-Asset-Library/intake/public-models-20260910/parallel-community-lina-rays-300-retarget';sys.path.insert(0,str(p/'scripts'));import glb_io as glb,retarget_math as rm
source=glb.read(str(p/'candidates/lina00-hands-a-300-idle-run-stable-torso.glb'));sj=source.gltf;names={n['name']:i for i,n in enumerate(sj['nodes'])};tree=ast.parse(Path('/private/tmp/ggd-lina-retarget.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sample_animation');code=ast.unparse(fn);line=next(s for s in code.splitlines() if s.strip().startswith('trsrows ='));code=code.replace(line,'    trsrows = copy.deepcopy(sj["nodes"])');exec(code)
skin=sj['skins'][0];ibm=np.array(source.accessor_values(skin['inverseBindMatrices'])).reshape(-1,4,4).transpose(0,2,1);rest,_=rm.globals_of(sj);parts=[]
for n in sj['nodes']:
 if 'skin'not in n:continue
 for prim in sj['meshes'][n['mesh']]['primitives']:
  at=prim['attributes'];ps=np.array(source.accessor_values(at['POSITION'])).reshape(-1,3);ids=np.array(source.accessor_values(at['JOINTS_0']),dtype=int).reshape(-1,4);ws=np.array(source.accessor_values(at['WEIGHTS_0'])).reshape(-1,4)
  for side in 'LR':
   joint=skin['joints'].index(names['Foot'+side]);mask=(ws*(ids==joint)).sum(axis=1)>.5
   if not mask.any():continue
   pos=ps[mask];jids=ids[mask];weights=ws[mask];mats=np.array([rest[i]@b for i,b in zip(skin['joints'],ibm)]);h=np.c_[pos,np.ones(len(pos))];world=np.einsum('nk,nkij,nj->ni',weights,mats[jids],h)[:,:3];sole=world[:,1]<world[:,1].min()+.01;parts.append((side,pos,jids,weights,sole))
results=[]
for anim in sj['animations']:
 duration=max(source.accessor_values(s['input'])[-1] for s in anim['samplers']);times=np.linspace(0,duration,math.ceil(duration*240)+1);rows=[]
 for t in times:
  world=sample_animation(anim,float(t));mats=np.array([world[i]@b for i,b in zip(skin['joints'],ibm)]);feet={'L':[],'R':[]};soles={'L':[],'R':[]}
  for side,pos,ids,ws,sole in parts:
   h=np.c_[pos,np.ones(len(pos))];vertices=np.einsum('nk,nkij,nj->ni',ws,mats[ids],h)[:,:3];assert np.isfinite(vertices).all();feet[side].append(vertices);soles[side].append(vertices[sole])
  row={'seconds':float(t)}
  for side in 'LR':
   f=np.concatenate(feet[side]);so=np.concatenate(soles[side]);row[side]={'minY':float(f[:,1].min()),'soleCentroid':so.mean(axis=0).tolist()}
  rows.append(row)
 side_stats={}
 for side in 'LR':
  ys=np.array([r[side]['minY'] for r in rows]);centers=np.array([r[side]['soleCentroid'] for r in rows]);vel=np.gradient(centers,times,axis=0);contact=ys<.03;contact_v=vel[contact];side_stats[side]={'minBootY':float(ys.min()),'maxBootY':float(ys.max()),'soleVertices':sum(int(x[4].sum()) for x in parts if x[0]==side),'contactThresholdMeters':.03,'contactSamples':int(contact.sum()),'horizontalSoleRangeMeters':np.ptp(centers[:,[0,2]],axis=0).tolist(),'contactMedianHorizontalVelocityMetersPerSecond':np.median(contact_v[:,[0,2]],axis=0).tolist() if len(contact_v) else None,'contactMaxHorizontalSpeedMetersPerSecond':float(np.linalg.norm(contact_v[:,[0,2]],axis=1).max()) if len(contact_v) else None,'loopSolePositionGapMeters':float(np.linalg.norm(centers[-1]-centers[0]))}
 results.append({'clip':anim['name'],'duration':duration,'sampleRate':240,'samples':len(rows),'feet':side_stats,'frames':rows,'note':'In-place locomotion has moving contact feet unless gameplay supplies forward velocity. These numbers are diagnostics, not a claim of foot-lock or full runtime acceptance.'})
(p/'evidence/dense-foot-audit.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps([{k:v for k,v in r.items() if k!='frames'} for r in results],indent=2))
videos=[]
for f in sorted((p/'evidence/playback-v2').glob('*.webm')):
 meta=subprocess.run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(f)],capture_output=True,text=True,check=True);m=json.loads(meta.stdout);check=subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','framemd5','-'],capture_output=True,text=True,check=True);hashes=[x.split(',')[-1].strip() for x in check.stdout.splitlines() if x and not x.startswith('#')];(p/'evidence'/(f.stem+'.framemd5.txt')).write_text(check.stdout);videos.append({'file':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'probe':m,'decodedFrames':len(hashes),'distinctDecodedFrameHashes':len(set(hashes)),'allFramesDecodedSuccessfully':True})
(p/'evidence/playback-video-validation.json').write_text(json.dumps(videos,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-retarget-foot-audit.py',p/'scripts/ggd-lina-retarget-foot-audit.py');print('video frames',[(Path(x['file']).name,x['decodedFrames'],x['distinctDecodedFrameHashes']) for x in videos])

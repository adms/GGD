"""Bounded Cloud GMO native motion -> matched-SMD glTF animation conversion.
Reads local frozen author samples; never executes downloaded author software.
All original keys retained. No assumed metric scale or semantic clip names.
"""
from pathlib import Path
import collections, copy, hashlib, json, math, shutil, struct
import numpy as np

BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910')
PRIOR=BASE/'fate-unlimited-codes-native-format-batch3/gmoloader'
ROOT=BASE/'psp-cloud-native-motion-batch4'
assert not (ROOT/'control/handoff.json').exists(), 'Frozen intake must not be overwritten'
for rel in ['original/cloud-source','raw/motions','converted','analysis','control/tooling']:(ROOT/rel).mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ref(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
src=PRIOR/'extracted/PSP-GMO-Loader-f346daeca824aff9740cd8e41719d88a06133dda'
shutil.copyfile(src/'Resources/GMO/cloud.gmo',ROOT/'original/cloud.gmo')
for f in (src/'Resources/Models/Cloud').iterdir():
    if f.is_file():shutil.copyfile(f,ROOT/'original/cloud-source'/f.name)
shutil.copyfile(PRIOR/'converted/cloud/body.glb',ROOT/'original/cloud-smd-bind-pose.glb')
shutil.copyfile(PRIOR/'analysis/cloud-gmo.json',ROOT/'original/cloud-gmo-structure.json')
for name in ['NezAnimatedModel.m','GmoModelLoader.m','GmoDataStructures.h','Math.m']:
    (ROOT/'original/format-reference').mkdir(exist_ok=True)
    shutil.copyfile(src/'Classes'/name,ROOT/'original/format-reference'/name)
b=(ROOT/'original/cloud.gmo').read_bytes();d=json.loads((ROOT/'original/cloud-gmo-structure.json').read_text())
assert hashlib.sha256(b).hexdigest()==d['sha256'] and b[:11]==b'OMG.00.1PSP'
records=d['records'];by={x['offset']:x for x in records}
bones=[x for x in records if x['typeId']==4]
assert len(bones)==60 and len({x['name'] for x in bones})==60
blob=(ROOT/'original/cloud-smd-bind-pose.glb').read_bytes();jlen=struct.unpack_from('<I',blob,12)[0]
g=json.loads(blob[20:20+jlen]);blen=struct.unpack_from('<I',blob,20+jlen)[0];binary=bytearray(blob[28+jlen:28+jlen+blen])
names={x.get('name'):(i,x) for i,x in enumerate(g['nodes'])}
assert len(names)==len(g['nodes'])
parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])}
def resolve(owner,value):
    if value==0xffffffff:return None
    typ=(value>>16)&65535;level=(value>>12)&15;index=value&4095
    for _ in range(level):owner=by[owner['parentOffset']]
    children=[by[x] for x in owner['children'] if by[x]['typeId']==typ]
    assert index<len(children), (owner['offset'],value)
    return children[index]
def quaternion(q):
    q=np.array(q,dtype=float);norm=float(np.linalg.norm(q));assert norm>0.5 and norm<1.5
    return q/norm

# Establish the exact bone scope before attaching animation to the SMD model.
bone_proof=[];mapping={};all_t=[];all_smd_t=[]
for bone in bones:
    node_index,node=names[bone['name']];t=np.zeros(3);q=np.array([0,0,0,1.]);scale=np.ones(3);parent=None
    for off in bone['children']:
        r=by[off];typ=r['typeId'];args=r['argsOffset']
        if typ==0x41:
            found=resolve(bone,struct.unpack_from('<I',b,args)[0]);parent=found['name'] if found else None
        elif typ==0x48:t=np.array(struct.unpack_from('<3f',b,args))
        elif typ==0x4b:q=np.array(struct.unpack_from('<4f',b,args))
        elif typ in [0x4c,0x4d]:scale=np.array(struct.unpack_from('<3f',b,args))
        elif typ in [0x49,0x4a,0x4f]:raise ValueError('Unimplemented base rotation/scale')
    gltf_parent=g['nodes'][parents[node_index]].get('name') if parents.get(node_index)!=0 else None
    assert gltf_parent==parent,(bone['name'],gltf_parent,parent)
    gt=np.array(node.get('translation',[0,0,0.]));gq=quaternion(node.get('rotation',[0,0,0,1.]));nq=quaternion(q)
    q_error=min(float(np.max(np.abs(nq-gq))),float(np.max(np.abs(nq+gq))))
    inverse=nq*np.array([-1,-1,-1,1]);inverse_error=min(float(np.max(np.abs(inverse-gq))),float(np.max(np.abs(inverse+gq))))
    t_error=float(np.max(np.abs(t*255-gt)));scale_error=float(np.max(np.abs(scale-np.array(node.get('scale',[1,1,1.])))))
    assert q_error<1e-5 and t_error<1e-4 and scale_error<1e-6,(bone['name'],q_error,t_error,scale_error)
    bone_proof.append({'name':bone['name'],'gmoOffset':bone['offset'],'gltfNode':node_index,'parent':parent,'nativeTranslation':t.tolist(),'nativeRotationXyzw':q.tolist(),'nativeScale':scale.tolist(),'translationScale':255,'translationMaximumComponentResidual':t_error,'normalizedQuaternionSignEquivalentMaxComponentResidual':q_error,'inverseQuaternionMaxComponentResidual':inverse_error,'parentMatch':True})
    mapping[bone['offset']]=node_index;all_t.append(t);all_smd_t.append(gt)
ta=np.array(all_t);ga=np.array(all_smd_t)
rig_proof={'status':'name-hierarchy-rest-pose-match','nativeBoneCount':60,'matchingNodeCount':60,'matchingParentCount':60,'sourceUnitsToSmdUnits':255,'leastSquaresTranslationScale':float(np.sum(ta*ga)/np.sum(ta*ta)),'maximumTranslationResidual':max(x['translationMaximumComponentResidual'] for x in bone_proof),'maximumQuaternionComponentResidual':max(x['normalizedQuaternionSignEquivalentMaxComponentResidual'] for x in bone_proof),'metricUnitsKnown':False,'rotationConvention':'raw XYZW normalized; sign-equivalent direct components match SMD. Author custom matrix math uses an inverse convention, not applied to glTF.','bones':bone_proof}
put(ROOT/'analysis/bone-scope-and-bind-pose.json',rig_proof)

# The existing assimp export flips V from the author's SMD. Actual native
# texture/render inspection shows this sample's SMD UVs already follow its PNG
# orientation. Restore the original SMD coordinates; retain the prior GLB.
uv_receipts=[];seen_uv=set()
for primitive in g['meshes'][0]['primitives']:
    ai=primitive['attributes']['TEXCOORD_0']
    if ai in seen_uv:continue
    seen_uv.add(ai);a=g['accessors'][ai];v=g['bufferViews'][a['bufferView']]
    assert a['componentType']==5126 and a['type']=='VEC2'
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',8)
    uv=np.ndarray((a['count'],2),dtype='<f4',buffer=binary,offset=offset,strides=(stride,4))
    before=hashlib.sha256(uv.tobytes()).hexdigest();uv[:,1]=1-uv[:,1]
    a['min']=uv.min(axis=0).astype(float).tolist();a['max']=uv.max(axis=0).astype(float).tolist()
    uv_receipts.append({'accessor':ai,'count':a['count'],'operation':'v = 1 - priorAssimpV; restores original SMD UV','beforeSha256':before,'afterSha256':hashlib.sha256(uv.tobytes()).hexdigest()})
del uv
put(ROOT/'analysis/uv-orientation-correction.json',{'reason':'Actual-mesh render exposed vertically inverted source texture placement; restore original SMD UVs. Prior GLB retained.','accessors':uv_receipts,'verification':'Independent source-SMD triangle-corner comparison and rendered texture review follow.'})

# Raw curves are decoded separately from conversion, preserving every key value.
curves={}
for r in records:
    if r['typeId']!=12:continue
    flags,dim,count,reserved=struct.unpack_from('<4I',b,r['argsOffset']);interp=flags&15
    assert interp in [0,1,4] and flags in [128,129,132],(r['offset'],flags)
    fmt='<'+('e' if flags&128 else 'f')*(dim+1);stride=struct.calcsize(fmt)
    payload=b[r['dataOffset']:r['dataOffset']+stride*count]
    assert len(payload)==stride*count and hashlib.sha256(payload).hexdigest()==r['keyPayloadSha256']
    keys=[struct.unpack_from(fmt,payload,i*stride) for i in range(count)]
    assert all(all(math.isfinite(v) for v in row) for row in keys)
    assert all(a[0]<z[0] for a,z in zip(keys,keys[1:]))
    curves[r['offset']]={'offset':r['offset'],'bytes':r['bytes'],'name':r['name'],'flags':flags,'dimensions':dim,'keyCount':count,'interpolation':{0:'CONSTANT',1:'LINEAR',4:'SPHERICAL'}[interp],'extrapolation':'HOLD','storage':'float16','dataOffset':r['dataOffset'],'keyPayloadBytes':len(payload),'keyPayloadSha256':hashlib.sha256(payload).hexdigest(),'keys':[{'frame':row[0],'values':list(row[1:])} for row in keys]}
assert len(curves)==1386

def append_accessor(rows,kind):
    a=np.array(rows,dtype='<f4')
    assert a.ndim==2 and np.all(np.isfinite(a))
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(a.tobytes());vi=len(g['bufferViews'])
    g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes})
    ai=len(g['accessors']);g['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':kind,'min':a.min(axis=0).astype(float).tolist(),'max':a.max(axis=0).astype(float).tolist()})
    return ai

g['animations']=[];clip_index=[];converted_channels=0;normalization_max=0.;hemisphere_flips=0
for motion in [r for r in records if r['typeId']==11]:
    children=[by[o] for o in motion['children']];fps_chunks=[x for x in children if x['typeId']==0xb2];loop_chunks=[x for x in children if x['typeId']==0xb1]
    assert len(fps_chunks)==len(loop_chunks)==1
    fps_r=fps_chunks[0];fps=struct.unpack_from('<f',b,fps_r['argsOffset'])[0];assert fps==30.
    loop_r=loop_chunks[0];loop=list(struct.unpack_from('<2f',b,loop_r['argsOffset']))
    local_curves=[curves[x['offset']] for x in children if x['typeId']==12]
    all_frames=[k['frame'] for c in local_curves for k in c['keys']];origin=min(all_frames);last=max(all_frames)
    animation={'name':'native'+motion['name'],'channels':[],'samplers':[],'extras':{'sourceMotionName':motion['name'],'sourceOffset':motion['offset'],'sourceFramesPerSecond':fps,'timeOriginFrame':origin,'sourceFrameDomain':[origin,last],'sourceFrameLoop':loop,'loopRangeSeconds':[(x-origin)/fps for x in loop],'semanticAction':'unknown','source':'GMO actual Motion/FCurve; not SMD single-key bind pose'}}
    bindings=[];seen=set();omissions=[]
    for command in [x for x in children if x['typeId']==0xb3]:
        target_raw,cmd,index,curve_raw=struct.unpack_from('<4I',b,command['argsOffset'])
        target=resolve(motion,target_raw);curve_r=resolve(motion,curve_raw);assert curve_r and curve_r['offset'] in curves
        curve=curves[curve_r['offset']];target_name=target.get('name') if target else None
        row={'commandOffset':command['offset'],'targetReferenceRaw':target_raw,'targetOffset':target['offset'] if target else None,'targetName':target_name,'commandType':cmd,'componentIndex':index,'curveReferenceRaw':curve_raw,'curveOffset':curve_r['offset'],'curveName':curve['name'],'curveKeyCount':curve['keyCount']}
        reason=None
        if target is None:reason='unused target reference 0xffffffff; cannot bind'
        elif target['typeId']!=4:reason='target is not a Bone'
        elif cmd==0x42:reason='visibility is not a core glTF TRS animation channel; retained raw'
        elif cmd not in [0x48,0x4b,0x4d]:reason='unsupported native channel'
        elif index!=0:reason='unsupported component index'
        if reason:
            row.update(status='preserved-unconverted',reason=reason);omissions.append(row);bindings.append(row);continue
        path={0x48:'translation',0x4b:'rotation',0x4d:'scale'}[cmd];dim=4 if path=='rotation' else 3
        assert curve['dimensions']==dim and (target['offset'],path) not in seen
        seen.add((target['offset'],path))
        values=np.array([k['values'] for k in curve['keys']],float)
        if path=='translation':values*=255.
        elif path=='rotation':
            lengths=np.linalg.norm(values,axis=1);assert np.all(lengths>0.99) and np.all(lengths<1.01)
            clean=values/lengths[:,None];normalization_max=max(normalization_max,float(np.max(np.abs(clean-values))));values=clean
            for i in range(1,len(values)):
                if np.dot(values[i-1],values[i])<0:values[i]*=-1;hemisphere_flips+=1
            assert curve['interpolation'] in ['CONSTANT','SPHERICAL']
        else:assert curve['interpolation'] in ['CONSTANT','LINEAR']
        times=[[(k['frame']-origin)/fps] for k in curve['keys']]
        interpolation='STEP' if curve['interpolation']=='CONSTANT' else 'LINEAR'
        sampler_index=len(animation['samplers']);sampler={'input':append_accessor(times,'SCALAR'),'output':append_accessor(values,'VEC4' if path=='rotation' else 'VEC3'),'interpolation':interpolation}
        animation['samplers'].append(sampler);animation['channels'].append({'sampler':sampler_index,'target':{'node':mapping[target['offset']],'path':path}})
        row.update(status='converted',gltfNode=mapping[target['offset']],gltfPath=path,gltfSampler=sampler_index,translationScale=255 if path=='translation' else None)
        bindings.append(row);converted_channels+=1
    assert animation['channels']
    duration=(last-origin)/fps
    raw={'schema':'ggd.raw-gmo-motion@1','sourceGmo':ref(ROOT/'original/cloud.gmo'),'sourceMotion':{'name':motion['name'],'offset':motion['offset'],'bytes':motion['bytes'],'chunkSha256':hashlib.sha256(b[motion['offset']:motion['offset']+motion['bytes']]).hexdigest()},'frameRateEvidence':{'chunkOffset':fps_r['offset'],'argsOffset':fps_r['argsOffset'],'float32RawHex':b[fps_r['argsOffset']:fps_r['argsOffset']+4].hex(),'framesPerSecond':fps},'sourceFrameDomain':[origin,last],'sourceFrameLoop':loop,'timeMapping':'seconds = (nativeFrame - timeOriginFrame) / declaredFramesPerSecond','timeOriginFrame':origin,'durationSeconds':duration,'playbackRate':1,'gameEngineSpeedIndependentlyVerified':False,'curves':local_curves,'bindings':bindings}
    raw_file=ROOT/'raw/motions'/(motion['name']+'.json');put(raw_file,raw)
    g['animations'].append(animation)
    clip_index.append({'name':animation['name'],'sourceMotionName':motion['name'],'animationIndex':len(g['animations'])-1,'sourceFrameDomain':[origin,last],'sourceFrameLoop':loop,'timeOriginFrame':origin,'framesPerSecond':fps,'frameRateEvidence':raw['frameRateEvidence'],'durationSeconds':duration,'loopRangeSeconds':animation['extras']['loopRangeSeconds'],'rawMotion':ref(raw_file),'sourceChannels':len(bindings),'convertedTrsChannels':len(animation['channels']),'unconvertedChannels':omissions,'channelCoverage':len(animation['channels'])/len(bindings),'curveCount':len(local_curves),'rawKeyCount':sum(c['keyCount'] for c in local_curves),'semanticAction':'unknown','enginePlaybackSpeedVerified':False})

assert len(g['animations'])==13 and converted_channels==1846
g['asset']['generator']='GGD bounded native GMO motion converter; existing Assimp matched-SMD geometry'
g['asset']['extras']={'nativeSource':'cloud.gmo','priorSmdBindPoseAnimationRemoved':True,'sourceUnitsRetained':True,'gmoTranslationToSmdScale':255,'metricScaleKnown':False,'textureUV':'Restored author SMD UV after reversing prior assimp V flip; source PNG bytes unchanged.'}
g['buffers']=[{'byteLength':len(binary)}]
j=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*(-len(j)%4);binary.extend(b'\0'*(-len(binary)%4))
out=ROOT/'converted/cloud-native-13-motions.glb'
out.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(j)+len(binary),len(j),0x4e4f534a)+j+struct.pack('<2I',len(binary),0x004e4942)+binary)
put(ROOT/'motion-index.json',{'schema':'ggd.native-motion-conversion.intake@1','localRoot':str(ROOT),'sourceId':'github-neztypezero-psp-gmo-loader-f346daec','model':ref(out),'clips':clip_index,'convertedClipCount':13,'convertedChannels':converted_channels,'originalChannelCount':1850,'unconvertedChannels':4,'rawCurves':1386,'rawKeys':sum(x['keyCount'] for x in curves.values()),'unitQuaternionMaximumComponentNormalization':normalization_max,'quaternionHemisphereSignFlips':hemisphere_flips,'nativeGameAnimation':True,'sourceGame':'unknown','sourceGameHint':'Dissidia series indicated by filenames; exact version pending','sourcePlatform':'PSP','runtimeReady':False,'semanticLabelsReviewed':False})
put(ROOT/'analysis/conversion-summary.json',{'clips':13,'channels':converted_channels,'rawCurves':1386,'rawKeys':sum(x['keyCount'] for x in curves.values()),'sourceBytes':len(b),'output':ref(out),'rigMatch':{k:v for k,v in rig_proof.items() if k!='bones'},'limitations':['4 native channels retained but not converted (3 unbound targets, 1 visibility)','source frame loop requires player loop configuration; core glTF has no loop setting','metric scale unknown; native to matching SMD scale 255 retained','no actual-game or GGD backend comparison yet','native quaternion half-float values normalized for standard rotations; originals retained']})
print(json.dumps({'model':ref(out),'clips':len(clip_index),'channels':converted_channels,'rawKeys':sum(x['keyCount'] for x in curves.values()),'maxQNormalization':normalization_max,'flips':hemisphere_flips},indent=2))

import pathlib,json,hashlib,collections,re
import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

root=pathlib.Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260911/parallel-kaiji-source-audit')
out=root/'analysis';out.mkdir(exist_ok=False)
(out/'textures').mkdir()
env=UnityPy.load(str(root/'embedded/kaiji-unityfs.bundle'))
objects={o.path_id:o for o in env.objects}
trees={o.path_id:o.read_typetree() for o in env.objects if o.type.name in ['Transform','GameObject','SkinnedMeshRenderer','Material','Avatar','Animator']}
renderers=[(i,t) for i,t in trees.items() if objects[i].type.name=='SkinnedMeshRenderer']
assert len(renderers)==1
rid,renderer=renderers[0]
textures=[]
for o in env.objects:
    if o.type.name!='Texture2D':continue
    t=o.read();name=re.sub('[^A-Za-z0-9._-]+','-',t.m_Name)
    p=out/'textures'/f'{name}.{o.path_id}.png';im=t.image;im.save(p);b=p.read_bytes()
    textures.append({'pathId':o.path_id,'name':t.m_Name,'path':str(p.relative_to(root)),'width':im.width,'height':im.height,'mode':im.mode,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'decode':'UnityPy Texture2D.image native DXT1 decode; no resizing or tinting'})

meshobj=objects[renderer['m_Mesh']['m_PathID']];mesh=meshobj.read();mt=meshobj.read_typetree();h=MeshHandler(mesh);h.process()
verts=np.asarray(h.m_Vertices,dtype=np.float32);weights=np.asarray(h.m_BoneWeights,dtype=np.float32);joints=np.asarray(h.m_BoneIndices,dtype=np.int32)
np.savez_compressed(out/'mesh-native.npz',vertices=verts,normals=np.asarray(h.m_Normals,dtype=np.float32),tangents=np.asarray(h.m_Tangents,dtype=np.float32),uv0=np.asarray(h.m_UV0,dtype=np.float32),weights=weights,joints=joints,indices=np.asarray(h.m_IndexBuffer,dtype=np.uint32))
bones=[]
for idx,ref in enumerate(renderer['m_Bones']):
    assert ref['m_FileID']==0 and ref['m_PathID'] in trees
    t=trees[ref['m_PathID']];go=trees[t['m_GameObject']['m_PathID']]
    bones.append({'jointIndex':idx,'name':go['m_Name'],'transformPathId':ref['m_PathID'],'parentTransformPathId':t['m_Father']['m_PathID'],'localPosition':t['m_LocalPosition'],'localRotation':t['m_LocalRotation'],'localScale':t['m_LocalScale']})
refs=[]
for mid in renderer['m_Materials']:
    m=trees[mid['m_PathID']];props=m['m_SavedProperties'];tex={k:v for k,v in props['m_TexEnvs'] if v['m_Texture']['m_PathID']}
    refs.append({'pathId':mid['m_PathID'],'name':m['m_Name'],'textureProperties':tex,'floatProperties':dict(props['m_Floats']),'colorProperties':dict(props['m_Colors'])})
for m in refs:
    for x in m['textureProperties'].values(): assert x['m_Texture']['m_FileID']==0 and x['m_Texture']['m_PathID'] in objects
checks={'vertexCount':len(verts),'indexCount':len(h.m_IndexBuffer),'triangleCount':sum(s['indexCount']//3 for s in mt['m_SubMeshes']),'submeshCount':len(mt['m_SubMeshes']),'boneCount':len(bones),'bindPoseCount':len(mt['m_BindPose']),'allIndicesInRange':int(max(h.m_IndexBuffer))<len(verts),'allDataFinite':bool(np.isfinite(verts).all() and np.isfinite(weights).all()),'maxWeightSumError':float(np.max(np.abs(weights.sum(axis=1)-1))),'maxPositiveInfluences':int(np.max((weights>0).sum(axis=1))),'positiveInfluenceJointIndicesInRange':bool(np.all(joints[weights>0]>=0) and np.all(joints[weights>0]<len(bones))),'weightedJointCount':int(len(np.unique(joints[weights>0]))),'nativeVertexBounds':{'min':verts.min(axis=0).tolist(),'max':verts.max(axis=0).tolist()},'allRendererBonesResolve':True,'allMaterialTexturesResolve':True,'nativeAnimationClipCount':0,'audioClipCount':0,'sourceFps':None,'runtimeReady':False,'notes':['Native Unity local-coordinate arrays; not GLB-ready coordinate/scale normalization.','Animator has Avatar but null controller. No independent AnimationClip payload; do not call rigged presence an acquired motion library.','Source HDRP material properties retained in native-scene.json; conversion must choose supported equivalent materials and retain all three groups.','No rendered 3D body or animation/physics/game quality verification in this source-analysis batch.']}
assert checks['allIndicesInRange'] and checks['allDataFinite'] and checks['positiveInfluenceJointIndicesInRange']
assert checks['maxWeightSumError']<1e-5

def write(name,data): (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
write('mesh-metadata.json',{'meshPathId':meshobj.path_id,'name':mt['m_Name'],'subMeshes':mt['m_SubMeshes'],'bindPoses':mt['m_BindPose'],'streamData':mt.get('m_StreamData'),'blendShapeCount':len(mt.get('m_Shapes',{}).get('channels',[])),'nativeArrays':'mesh-native.npz','arraysCoordinateSystem':'native Unity mesh-local coordinates; not mirrored or rescaled'})
write('native-scene.json',{'objects':[{'pathId':i,'type':objects[i].type.name,'data':t} for i,t in trees.items()]})
write('skeleton.json',{'rendererPathId':rid,'rootBone':renderer['m_RootBone'],'bones':bones,'jointOrder':'exact SkinnedMeshRenderer.m_Bones order matching indices and m_BindPose','transformsNote':'All parent transforms (including non-joints) retained in native-scene.json'})
write('textures.json',textures);write('materials.json',refs);write('checks.json',checks)
print(json.dumps(checks,ensure_ascii=False,indent=2))

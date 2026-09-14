import sys
sys.path = [p for p in sys.path if p != '/private/tmp']
"""Source-specific, isolated .blend conversion. Never execute embedded scripts."""
import os
os.environ['BLENDER_USER_CONFIG']='/private/tmp/ggd-kof-blender-empty-config'
os.environ['BLENDER_USER_SCRIPTS']='/private/tmp/ggd-kof-blender-empty-scripts'
os.environ['BLENDER_USER_DATAFILES']='/private/tmp/ggd-kof-blender-empty-datafiles'
from pathlib import Path
import hashlib,json,math,sys,re
import bpy
from mathutils import Vector
root=Path(sys.argv[1]).resolve();src=root/'original/Ash.blend'
receipt=json.loads((root/'download-receipt.json').read_text());assert receipt.get('publisherSha256Verified')
source_bytes=src.read_bytes();assert hashlib.sha256(source_bytes).hexdigest()==receipt['expectedSha256']
out=root/'converted';assert not out.exists();out.mkdir()
for key in ['BLENDER_USER_CONFIG','BLENDER_USER_SCRIPTS','BLENDER_USER_DATAFILES']:Path(os.environ[key]).mkdir(parents=True,exist_ok=True)
if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
props={p.identifier for p in bpy.ops.wm.open_mainfile.get_rna_type().properties}
assert 'use_scripts' in props
bpy.ops.wm.open_mainfile(filepath=str(src),use_scripts=False,load_ui=False)
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
muted=[]
for datablocks in (bpy.data.objects,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.shape_keys,bpy.data.scenes,bpy.data.worlds,bpy.data.node_groups,bpy.data.curves,bpy.data.cameras,bpy.data.lights):
 for block in datablocks:
  ad=getattr(block,'animation_data',None)
  if ad:
   for dr in ad.drivers:dr.mute=True;muted.append({'datablock':block.name,'dataPath':dr.data_path})
all_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];meshes=[o for o in all_meshes if not o.hide_render and o.visible_get()]
assert meshes
rigs={m.object for o in meshes for m in o.modifiers if m.type=='ARMATURE' and m.object is not None}
images=[];native_textures=[];texture_dir=root/'native-textures';texture_dir.mkdir(exist_ok=False)
for im_index,im in enumerate(bpy.data.images):
 if im.type not in ('IMAGE','UV_TEST'):continue
 packed=getattr(im,'packed_file',None)
 images.append(dict(name=im.name,source=im.source,filepath=im.filepath,width=im.size[0],height=im.size[1],packed=packed is not None,packedBytes=packed.size if packed else 0))
 entries=[(x.filepath,x.packed_file) for x in im.packed_files] if getattr(im,'packed_files',None) else [(im.filepath,packed)] if packed else []
 for slot,(original_name,pf) in enumerate(entries):
  raw=bytes(pf.data);ext=Path(original_name).suffix.lower() or '.'+im.file_format.lower();name=re.sub(r'[^A-Za-z0-9_.-]+','_',im.name).strip('._') or 'texture';dest=texture_dir/(f'{im_index:03d}-{slot:02d}-'+name+ext)
  with dest.open('xb') as stream:stream.write(raw)
  native_textures.append(dict(imageName=im.name,nativePath=original_name,path=dest.relative_to(root).as_posix(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),originalPackedBytes=True))
source=dict(schema='ggd-blend-source-analysis@1',sourceSha256=hashlib.sha256(source_bytes).hexdigest(),blenderVersion=bpy.app.version_string,embeddedScriptsExecuted=False,embeddedTextBlocks=len(bpy.data.texts),mutedDrivers=muted,totalMeshObjects=len(all_meshes),exportedVisibleMeshObjects=[o.name for o in meshes],hiddenNativeMeshObjects=[o.name for o in all_meshes if o not in meshes],armatures=[dict(name=o.name,bones=len(o.data.bones),boneNames=[b.name for b in o.data.bones]) for o in rigs],actions=[dict(name=x.name,frameRange=list(x.frame_range)) for x in bpy.data.actions],images=images,nativeTextures=native_textures,sounds=[dict(name=x.name,filepath=x.filepath,packed=x.packed_file is not None) for x in bpy.data.sounds],sceneObjects=[dict(name=x.name,type=x.type,hideRender=x.hide_render,visible=x.visible_get()) for x in bpy.context.scene.objects],sourceUnits=dict(system=bpy.context.scene.unit_settings.system,scaleLength=bpy.context.scene.unit_settings.scale_length),sourceGeometry=[dict(name=o.name,vertices=len(o.data.vertices),polygons=len(o.data.polygons),vertexGroups=len(o.vertex_groups),morphTargets=len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0,uvLayers=[x.name for x in o.data.uv_layers]) for o in meshes])
(root/'source-analysis.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
missing=[x for x in images if not x['packed'] and x['source']=='FILE' and not Path(bpy.path.abspath(x['filepath'])).is_file()]
assert not missing,{'missingExternalImages':missing}
# All transformations are on the loaded copy. Original .blend bytes remain untouched.
objects=set(meshes)|rigs
for o in list(objects):
 p=o.parent
 while p is not None:objects.add(p);p=p.parent
for o in bpy.context.scene.objects:o.select_set(False)
for o in objects:o.hide_set(False);o.select_set(True)
coords=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
minimum=Vector([min(v[i] for v in coords) for i in range(3)]);maximum=Vector([max(v[i] for v in coords) for i in range(3)])
height=maximum.z-minimum.z;assert math.isfinite(height) and height>0
factor=1.8/height;center=(minimum+maximum)*0.5
normal=bpy.data.objects.new('GGD_Normalization',None);bpy.context.scene.collection.objects.link(normal)
for o in objects:
 if o.parent not in objects:
  world=o.matrix_world.copy();o.parent=normal;o.matrix_world=world
normal.scale=(factor,)*3;normal.location=(-center.x*factor,-center.y*factor,-minimum.z*factor);normal.select_set(True)
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1.0
props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
opts=dict(filepath=str(out/'body.glb'),export_format='GLB',use_selection=True,export_skins=True,export_animations=True,export_morph=True,export_cameras=False,export_lights=False,export_extras=False)
for k in opts:assert k in props,k
for k,v in {'export_def_bones':False,'export_all_influences':True,'export_apply':False}.items():
 if k in props:opts[k]=v
bpy.ops.export_scene.gltf(**opts)
assert src.read_bytes()==source_bytes
result=dict(schema='ggd-blend-glb-conversion@1',sourceSha256=source['sourceSha256'],blenderVersion=bpy.app.version_string,exportOptions=opts,normalization=dict(sourceBounds=[list(minimum),list(maximum)],sourceUp='Blender Z',glbUp='glTF Y',targetHeightMeters=1.8,uniformScale=factor,footOrigin=True),sourceActions=len(source['actions']),sourceRigCount=len(rigs),sourceBones=[len(o.data.bones) for o in rigs],originalBytesUnchanged=True,embeddedScriptsExecuted=False,driversMuted=len(muted),runtimeReady=False,backendSelectionVerified=False,limitations=['Structural GLB and visual validation must pass independently.','No gameplay retargeting or new motions synthesized.','Hidden native mesh variants remain in the original .blend and are inventoried; this GLB contains the source-visible appearance.'])
(root/'conversion.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import os,json,hashlib,math
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=Path('/private/tmp/ggd-kof-deform-empty')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
from mathutils import Vector
root=Path(sys.argv[1]).resolve();src=root/'original/Ash.blend';receipt=json.loads((root/'download-receipt.json').read_text());assert receipt['publisherSha256Verified'];original_sha=hashlib.sha256(src.read_bytes()).hexdigest();assert original_sha==receipt['expectedSha256'];results=[]
for variant,hair in [('left-hair','left hair'),('right-hair','right hair')]:
 bpy.context.preferences.filepaths.use_scripts_auto_execute=False
 if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
 bpy.ops.wm.open_mainfile(filepath=str(src),use_scripts=False,load_ui=False)
 bpy.context.preferences.filepaths.use_scripts_auto_execute=False;muted=0
 for dbs in (bpy.data.objects,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.shape_keys,bpy.data.scenes,bpy.data.worlds,bpy.data.node_groups,bpy.data.curves,bpy.data.cameras,bpy.data.lights):
  for block in dbs:
   ad=getattr(block,'animation_data',None)
   if ad:
    for dr in ad.drivers:dr.mute=True;muted+=1
 meshes=[bpy.data.objects['24_body_0.3_0_0'],bpy.data.objects[hair]];rigs={m.object for o in meshes for m in o.modifiers if m.type=='ARMATURE' and m.object};objects=set(meshes)|rigs
 for o in list(objects):
  parent=o.parent
  while parent:objects.add(parent);parent=parent.parent
 for o in bpy.context.scene.objects:o.select_set(False)
 for o in objects:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
 coords=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices];lo=Vector([min(v[i] for v in coords) for i in range(3)]);hi=Vector([max(v[i] for v in coords) for i in range(3)]);factor=1.8/(hi.z-lo.z);center=(hi+lo)*.5
 normal=bpy.data.objects.new('GGD_Normalization',None);bpy.context.scene.collection.objects.link(normal)
 for o in objects:
  if o.parent not in objects:
   world=o.matrix_world.copy();o.parent=normal;o.matrix_world=world
 normal.scale=(factor,)*3;normal.location=(-center.x*factor,-center.y*factor,-lo.z*factor);normal.select_set(True);bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
 out=root/'converted'/variant;out.mkdir(exist_ok=False)
 opts=dict(filepath=str(out/'body.glb'),export_format='GLB',use_selection=True,export_skins=True,export_animations=False,export_morph=True,export_cameras=False,export_lights=False,export_extras=False,export_def_bones=True,export_all_influences=True,export_apply=False)
 bpy.ops.export_scene.gltf(**opts);blob=(out/'body.glb').read_bytes();result=dict(variant=variant,model=(out/'body.glb').relative_to(root).as_posix(),sourceMeshNames=[x.name for x in meshes],sha256=hashlib.sha256(blob).hexdigest(),bytes=len(blob),sourceSkeletonBones=[len(x.data.bones) for x in rigs],sourceDeformBones=[sum(b.use_deform for b in x.data.bones) for x in rigs],sourceStaticPoseActions=[dict(name=x.name,frameRange=list(x.frame_range)) for x in bpy.data.actions],exportOptions=opts,targetHeightMeters=1.8,sourceBounds=[list(lo),list(hi)],uniformScale=factor,driversMuted=muted,sourceScriptsExecuted=False,originalSourceSha256=original_sha,sourceUnchanged=hashlib.sha256(src.read_bytes()).hexdigest()==original_sha,gameplayAnimationClips=0,defaultChanged=False,runtimeReady=False,limitations=['Static single-frame source actions are retained in original blend, not presented as gameplay animations.','Full rig, helper widgets and source drivers remain in original blend; GLB exports deform bones only.','Source vertex influences are preserved; runtime retargeting/deformation and maximum influence compatibility require acceptance.'])
 (out/'conversion.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');results.append(result)
(root/'deform-variant-conversions.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps([{k:r[k] for k in ['variant','bytes','sha256','sourceDeformBones']} for r in results]))

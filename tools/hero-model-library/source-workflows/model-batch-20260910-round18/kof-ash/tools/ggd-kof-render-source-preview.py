import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import os,math,json,hashlib
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=Path('/private/tmp/ggd-kof-preview-empty')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
from mathutils import Vector
root=Path(sys.argv[1]).resolve();variant='source-left-hair';src=root/'original/Ash.blend';source_hash=hashlib.sha256(src.read_bytes()).hexdigest();out=root/'previews'/variant;out.mkdir(parents=True,exist_ok=False)
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.open_mainfile(filepath=str(src),use_scripts=False,load_ui=False)
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
for blocks in (bpy.data.objects,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.shape_keys,bpy.data.scenes,bpy.data.worlds,bpy.data.node_groups):
 for block in blocks:
  ad=getattr(block,'animation_data',None)
  if ad:
   for dr in ad.drivers:dr.mute=True
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH':obj.hide_render=obj.name not in ['24_body_0.3_0_0','left hair']
 if obj.type=='LIGHT':bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.render.resolution_x=512;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('GGDPreviewWorld');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.065,.065,.065,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
for name,loc,power,size in [('key',(3,-4,5),600,4),('fill',(-3,-1,3),400,3),('rim',(2,4,4),750,3)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('GGDPreviewCamera');cam=bpy.data.objects.new('GGDPreviewCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=2.12
coords=[o.matrix_world @ Vector(c) for o in scene.objects if o.type=='MESH' and not o.hide_render for c in o.bound_box];center=Vector([(min(v[i] for v in coords)+max(v[i] for v in coords))/2 for i in range(3)])
receipts=[]
for name,location in [('front',(0,-4,1.0)),('back',(0,4,1.0)),('three-quarter',(3,-4,1.3))]:
 cam.location=location;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();rot=cam.rotation_euler.to_matrix();right=rot.col[0];up=rot.col[1];width=max(right.dot(v-center) for v in coords)-min(right.dot(v-center) for v in coords);height=max(up.dot(v-center) for v in coords)-min(up.dot(v-center) for v in coords);camdata.ortho_scale=max(height,width/(512/768))*1.16;p=out/(name+'.png');scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);receipts.append(dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
assert hashlib.sha256(src.read_bytes()).hexdigest()==source_hash
(root/('preview-render-'+variant+'.json')).write_text(json.dumps(dict(schema='ggd-glb-preview-render@1',sourceGlbSha256=source_hash,blenderVersion=bpy.app.version_string,engine='Cycles CPU',resolution=[512,768],samples=32,files=receipts,sourceUnchanged=True,visualReviewPending=True),indent=2)+'\n')
print(json.dumps(receipts))

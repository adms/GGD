import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import os,json,hashlib
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=Path('/private/tmp/ggd-ash-comparison-empty')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
from mathutils import Vector
root=Path(sys.argv[1]).resolve();old=root.parent/'kof-open3dlab-ash-xv';variant=sys.argv[2];hair=variant.replace('-',' ')
receipts=[]
cameras=[dict(name='front',location=[0,-4,.9],target=[0,0,.9],scale=2.05,resolution=[384,576]),dict(name='three-quarter',location=[3,-4,1.35],target=[0,0,.9],scale=2.1,resolution=[384,576]),dict(name='face',location=[0,-4,1.61],target=[0,0,1.61],scale=.46,resolution=[448,448]),dict(name='boots',location=[0,-4,.19],target=[0,0,.19],scale=.60,resolution=[448,448])]
def secure():
 bpy.context.preferences.filepaths.use_scripts_auto_execute=False
 if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
def mute():
 for db in (bpy.data.objects,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.shape_keys,bpy.data.scenes,bpy.data.worlds,bpy.data.node_groups,bpy.data.curves,bpy.data.cameras,bpy.data.lights):
  for block in db:
   if block.animation_data:
    for dr in block.animation_data.drivers:dr.mute=True
for mode in ['source','baseline','repaired']:
 secure();bpy.ops.wm.read_factory_settings(use_empty=True)
 if mode=='source':
  src=root/'original/Ash.blend';bpy.ops.wm.open_mainfile(filepath=str(src),use_scripts=False,load_ui=False);secure();mute()
  meshes=[bpy.data.objects['24_body_0.3_0_0'],bpy.data.objects[hair]];rigs={m.object for o in meshes for m in o.modifiers if m.type=='ARMATURE' and m.object};objects=set(meshes)|rigs
  for o in list(objects):
   parent=o.parent
   while parent:objects.add(parent);parent=parent.parent
  for o in objects:o.hide_set(False);o.hide_viewport=False
  conv=json.loads((old/'converted'/variant/'conversion.json').read_text());lo,hi=[Vector(v) for v in conv['sourceBounds']];center=(lo+hi)*.5;factor=conv['uniformScale'];normal=bpy.data.objects.new('GGD_Normalization',None);bpy.context.scene.collection.objects.link(normal)
  for o in objects:
   if o.parent not in objects:world=o.matrix_world.copy();o.parent=normal;o.matrix_world=world
  normal.scale=(factor,)*3;normal.location=(-center.x*factor,-center.y*factor,-lo.z*factor)
 else:
  src=(old if mode=='baseline' else root)/'converted'/variant/'body.glb';bpy.ops.import_scene.gltf(filepath=str(src));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and (o.name=='24_body_0.3_0_0' or o.name==hair)]
 assert len(meshes)==2,[o.name for o in bpy.context.scene.objects if o.type=='MESH']
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH':o.hide_render=o not in meshes
  if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False;scene.cycles.seed=0
 scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.film_transparent=False;scene.render.dither_intensity=0
 scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.view_settings.use_curve_mapping=False
 scene.world=bpy.data.worlds.new('GGDComparisonWorld');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.065,.065,.065,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
 for name,loc,power,size in [('key',(3,-4,5),600,4),('fill',(-3,-1,3),400,3),('rim',(2,4,4),750,3)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 camdata=bpy.data.cameras.new('GGDComparisonCamera');cam=bpy.data.objects.new('GGDComparisonCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
 out=root/'comparisons'/variant/mode;out.mkdir(parents=True,exist_ok=False)
 for c in cameras:
  cam.location=c['location'];cam.rotation_euler=(Vector(c['target'])-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=c['scale'];scene.render.resolution_x,scene.render.resolution_y=c['resolution'];p=out/(c['name']+'.png');scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);receipts.append(dict(mode=mode,variant=variant,path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),camera=c,visibleMeshes=[m.name for m in meshes],sourcePath=str(src),sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest()));(root/'analysis'/('comparison-render-'+variant+'-progress.json')).write_text(json.dumps(receipts,indent=2)+'\n')
report=dict(schema='ggd-ash-same-camera-comparison@2',blenderVersion=bpy.app.version_string,sourceScriptsExecuted=False,sourceDriversMuted=True,engine='Cycles CPU',samples=24,denoising=False,viewTransform='AgX',look='None',dither=0,fixedCameras=True,boundsNotRecomputed=True,importerIcosphereExcluded=True,files=receipts)
(root/'analysis'/('comparison-render-'+variant+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(variant=variant,images=len(receipts))))

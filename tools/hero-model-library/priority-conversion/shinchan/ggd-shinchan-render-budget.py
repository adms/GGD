import sys,os,json,hashlib
from pathlib import Path
sys.path=[x for x in sys.path if x!='/private/tmp']
for k,v in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','data')]:
 p=Path('/private/tmp/ggd-shinchan-empty-bpy')/v;p.mkdir(parents=True,exist_ok=True);os.environ[k]=str(p)
import bpy
from mathutils import Vector
root=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-shinchan-canonical-20260910');out=root/'budget-visual-v1';out.mkdir(exist_ok=False);proof=[]
for variant in ['sd2','kstamil']:
 for rig in ['budget']:
  src=root/'budget-static-v1'/(variant+'.glb');bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.use_scripts_auto_execute=False
  if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
  bpy.ops.import_scene.gltf(filepath=str(src));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
  scene.world=bpy.data.worlds.new('GGD neutral world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.14,.17,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
  scene.view_settings.view_transform='Standard'
  for name,loc,power,size in [('key',(2,-3,4),180,3),('fill',(-2,-1,2),100,3),('rim',(2,3,3),150,2)]:
   data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.55))-o.location).to_track_quat('-Z','Y').to_euler()
  camdata=bpy.data.cameras.new('GGD camera');cam=bpy.data.objects.new('GGD camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=1.35
  for angle,loc in [('front',(0,-4,.55)),('three-quarter',(2,-4,.9))]:
   cam.location=loc;cam.rotation_euler=(Vector((0,0,.53))-cam.location).to_track_quat('-Z','Y').to_euler();dest=out/(variant+'-'+rig+'-'+angle+'.png');scene.render.filepath=str(dest);bpy.ops.render.render(write_still=True);proof.append(dict(variant=variant,rig=rig,view=angle,source=str(src),sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest(),path=str(dest),sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
(out/'render-proof.json').write_text(json.dumps(dict(engine='Cycles CPU',bpy=bpy.app.version_string,samples=16,sourceBytePreserving=True,files=proof),indent=2)+'\n');print(json.dumps({'renders':len(proof)}))

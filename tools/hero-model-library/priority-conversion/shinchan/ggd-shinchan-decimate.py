import sys,os,json,hashlib
from pathlib import Path
sys.path=[x for x in sys.path if x!='/private/tmp']
for k,v in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','data')]:
 p=Path('/private/tmp/ggd-shinchan-decimate-empty')/v;p.mkdir(parents=True,exist_ok=True);os.environ[k]=str(p)
import bpy
from mathutils import Vector
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-shinchan-canonical-20260910');out=ROOT/'decimated-v2';out.mkdir(exist_ok=False)
for variant in ['sd2','kstamil']:
 src=ROOT/'optimized-v3'/variant/'atlas-static.glb';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.use_scripts_auto_execute=False
 bpy.ops.import_scene.gltf(filepath=str(src));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=bpy.context.object
 for mod in list(obj.modifiers):
  if mod.type=='ARMATURE':obj.modifiers.remove(mod)
 before=len(obj.data.polygons);mod=obj.modifiers.new('GGD runtime budget reduction','DECIMATE');mod.decimate_type='COLLAPSE';mod.ratio=.43;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);obj.data.calc_loop_triangles()
 # Export evaluated mesh data explicitly to preserve the original glTF bone frames instead of Blender bone display reorientation.
 mesh=obj.data;normalmatrix=obj.matrix_world.to_3x3().inverted().transposed();positions=[];normals=[];uv=[];weights=[];indices=[];lookup={};groups={g.index:g.name for g in obj.vertex_groups}
 for tri in mesh.loop_triangles:
  for li in tri.loops:
   loop=mesh.loops[li];vertex=mesh.vertices[loop.vertex_index];co=obj.matrix_world@vertex.co;n=normalmatrix@loop.normal;n.normalize();t=mesh.uv_layers.active.data[li].uv
   w=sorted([(groups[g.group],g.weight) for g in vertex.groups if g.weight>0],key=lambda x:(-x[1],x[0]))
   key=(loop.vertex_index,tuple(round(x,7) for x in n),round(t.x,8),round(t.y,8))
   if key not in lookup:
    lookup[key]=len(positions);positions.append([co.x,co.z,-co.y]);normals.append([n.x,n.z,-n.y]);uv.append([t.x,1-t.y]);weights.append(w)
   indices.append(lookup[key])
 data=dict(variant=variant,source=str(src),sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest(),blenderVersion=bpy.app.version_string,decimateRatio=.43,polygonsBefore=before,trianglesAfter=len(indices)//3,vertexCount=len(positions),positions=positions,normals=normals,uv=uv,weights=weights,indices=indices)
 p=out/(variant+'-mesh.json');p.write_text(json.dumps(data,separators=(',',':')));print(json.dumps({k:v for k,v in data.items() if k not in ['positions','normals','uv','weights','indices']}),flush=True)

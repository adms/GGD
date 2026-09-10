import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import os,json,hashlib,array
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=Path('/private/tmp/ggd-ash-v2-empty')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
root=Path(sys.argv[1]).resolve();src=root/'original/Ash.blend';assert hashlib.sha256(src.read_bytes()).hexdigest()=='30e11c524fb8223fd421ecf3c2d832fff7a3671f6a38444f7ebed5adeb2cc746'
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
bpy.ops.wm.open_mainfile(filepath=str(src),use_scripts=False,load_ui=False);bpy.context.preferences.filepaths.use_scripts_auto_execute=False
for blocks in (bpy.data.objects,bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.shape_keys,bpy.data.scenes,bpy.data.worlds,bpy.data.node_groups):
 for block in blocks:
  ad=getattr(block,'animation_data',None)
  if ad:
   for dr in ad.drivers:dr.mute=True

def value(x):
 if isinstance(x,(str,bool,float,int)) or x is None:return x
 try:return list(x)
 except TypeError:return str(x)
def tree(t):
 return dict(name=t.name,nodes=[dict(name=n.name,type=n.bl_idname,operation=getattr(n,'operation',None),blendType=getattr(n,'blend_type',None),uvMap=getattr(n,'uv_map',None),image=n.image.name if getattr(n,'image',None) else None,nodeTree=n.node_tree.name if getattr(n,'node_tree',None) else None,inputs=[dict(name=s.name,index=i,default=value(getattr(s,'default_value',None)),linked=s.is_linked) for i,s in enumerate(n.inputs)],outputs=[dict(name=s.name,index=i,linked=s.is_linked) for i,s in enumerate(n.outputs)],extension=getattr(n,'extension',None),interpolation=getattr(n,'interpolation',None)) for n in t.nodes],links=[dict(fromNode=l.from_node.name,fromSocket=l.from_socket.name,fromIndex=list(l.from_node.outputs).index(l.from_socket),toNode=l.to_node.name,toSocket=l.to_socket.name,toIndex=list(l.to_node.inputs).index(l.to_socket)) for l in t.links])
materials=[]
for m in bpy.data.materials:
 if not m.use_nodes:continue
 materials.append(dict(name=m.name,surfaceRenderMethod=getattr(m,'surface_render_method',None),useBackfaceCulling=m.use_backface_culling,diffuseColor=list(m.diffuse_color),tree=tree(m.node_tree)))
images=[dict(name=im.name,filepath=im.filepath,alphaMode=im.alpha_mode,colorspace=im.colorspace_settings.name,channels=im.channels,depth=im.depth,size=list(im.size),packedBytes=im.packed_file.size if im.packed_file else 0) for im in bpy.data.images if im.type=='IMAGE']
geometry=[];deps=bpy.context.evaluated_depsgraph_get()
for name in ['24_body_0.3_0_0','left hair','right hair']:
 o=bpy.data.objects[name];ev=o.evaluated_get(deps);me=ev.to_mesh();pos=array.array('f',(a for v in me.vertices for a in (o.matrix_world@v.co)))
 if sys.byteorder!='little':pos.byteswap()
 dest=root/'analysis'/(name.replace('/','_').replace(' ','_')+'-source-evaluated.f32');dest.write_bytes(pos.tobytes())
 geometry.append(dict(name=name,vertices=len(o.data.vertices),evaluatedVertices=len(me.vertices),worldMatrix=[list(r) for r in o.matrix_world],modifiers=[dict(name=m.name,type=m.type,showViewport=m.show_viewport,showRender=m.show_render) for m in o.modifiers],uvLayers=[dict(name=u.name,activeRender=u.active_render) for u in o.data.uv_layers],sourceEvaluatedVertices=dict(path=dest.relative_to(root).as_posix(),bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()),materialNames=[m.name if m else None for m in o.data.materials]));ev.to_mesh_clear()
report=dict(schema='ggd-native-blend-material-probe@1',sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest(),blenderVersion=bpy.app.version_string,frameCurrent=bpy.context.scene.frame_current,materials=materials,nodeGroups=[tree(t) for t in bpy.data.node_groups],images=images,geometry=geometry)
(root/'analysis/native-materials.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(materials=len(materials),images=len(images),geometry=geometry),ensure_ascii=False))

"""Re-export only the already acquired Cattiva GLB through installed Blender glTF I/O."""
from pathlib import Path
import bpy,json,hashlib
root=Path(__file__).resolve().parents[1]
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
source=root/'decoded/cattiva-atlasforge.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];meshes=[o for o in bpy.data.objects if o.type=='MESH']
report={'schema':'ggd.cattiva.blender-import@1','blenderVersion':bpy.app.version_string,'autoexec':bpy.context.preferences.filepaths.use_scripts_auto_execute,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'meshObjects':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'vertexGroups':len(o.vertex_groups)} for o in meshes],'armatures':[{'name':o.name,'boneCount':len(o.data.bones)} for o in rigs],'actions':[{'name':a.name,'frameRange':list(a.frame_range)} for a in bpy.data.actions],'images':[{'name':i.name,'size':list(i.size),'channels':i.channels,'hasData':i.has_data} for i in bpy.data.images]}
out=root/'standardized/cattiva.glb';out.parent.mkdir(exist_ok=True)
assert not out.exists()
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_draco_mesh_compression_enable=False,export_image_format='AUTO',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True)
report.update(outputPath=str(out),outputBytes=out.stat().st_size,outputSha256=hashlib.sha256(out.read_bytes()).hexdigest(),runtimeAcceptance='Not performed; source candidate only')
(root/'analysis/blender-import.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

import bpy,json,hashlib,sys,collections
from pathlib import Path
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
bpy.context.preferences.system.use_online_access=False
root=Path(sys.argv[1]).resolve()
for sid in ['mai-xv-raw','iori-xv-raw']:
 r=root/sid
 sources=list((r/'extracted-v1').rglob('*.fbx'))
 if not sources:continue
 if (r/'fbx-analysis.json').exists():raise RuntimeError('refuse overwriting source analysis')
 output=[]
 for p in sources:
  digest=hashlib.sha256(p.read_bytes()).hexdigest();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.use_scripts_auto_execute=False;bpy.context.preferences.system.use_online_access=False
  result=bpy.ops.import_scene.fbx(filepath=str(p),use_image_search=False,use_anim=True)
  meshes=[]
  for obj in bpy.data.objects:
   if obj.type!='MESH':continue
   m=obj.data;m.calc_loop_triangles();weights=[sum(1 for g in v.groups if g.weight>0) for v in m.vertices]
   meshes.append({'name':obj.name,'vertices':len(m.vertices),'triangles':len(m.loop_triangles),'materialSlots':[s.material.name if s.material else None for s in obj.material_slots],'vertexGroupCount':len(obj.vertex_groups),'weightedVertices':sum(n>0 for n in weights),'maxVertexInfluences':max(weights,default=0),'shapeKeyCount':len(m.shape_keys.key_blocks) if m.shape_keys else 0,'armatureModifiers':[a.object.name if a.object else None for a in obj.modifiers if a.type=='ARMATURE']})
  rigs=[]
  for obj in bpy.data.objects:
   if obj.type=='ARMATURE':rigs.append({'name':obj.name,'bones':len(obj.data.bones),'boneNames':[b.name for b in obj.data.bones],'parentByBone':{b.name:b.parent.name if b.parent else None for b in obj.data.bones}})
  actions=[{'name':a.name,'frameRange':list(a.frame_range),'slotCount':len(a.slots) if hasattr(a,'slots') else None} for a in bpy.data.actions]
  imgs=[{'name':im.name,'width':im.size[0],'height':im.size[1],'filepathBasename':Path(im.filepath.replace('\\','/')).name,'loaded':im.has_data} for im in bpy.data.images]
  row={'sourcePath':p.relative_to(r).as_posix(),'sourceSha256':digest,'importResult':list(result),'blenderVersion':bpy.app.version_string,'meshObjects':meshes,'meshObjectCount':len(meshes),'vertices':sum(m['vertices'] for m in meshes),'triangles':sum(m['triangles'] for m in meshes),'armatures':rigs,'materialCount':len(bpy.data.materials),'materials':[m.name for m in bpy.data.materials],'importedImages':imgs,'actionCount':len(actions),'actions':actions,'limitations':['Readonly FBX parse only: no GLB conversion, texture/material repair, runtime validation or visual acceptance.','Author claims original game rig. Original game installation platform is not stated.']}
  assert hashlib.sha256(p.read_bytes()).hexdigest()==digest;output.append(row)
 (r/'fbx-analysis.json').write_text(json.dumps({'schema':'ggd.source-fbx-analysis@1','sourceId':sid,'files':output},indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({'id':sid,'files':[{'meshObjects':x['meshObjectCount'],'vertices':x['vertices'],'triangles':x['triangles'],'boneCounts':[z['bones'] for z in x['armatures']],'actions':x['actions'],'materialCount':x['materialCount']} for x in output]},ensure_ascii=False),flush=True)

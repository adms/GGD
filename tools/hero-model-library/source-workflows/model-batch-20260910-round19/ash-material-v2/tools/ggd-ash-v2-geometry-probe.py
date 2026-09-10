import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import os,json,array,math
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=Path('/private/tmp/ggd-ash-v2-geometry-empty')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
from mathutils import Vector,kdtree
root=Path(sys.argv[1]).resolve();old=root.parent/'kof-open3dlab-ash-xv';conv=json.loads((old/'converted/left-hair/conversion.json').read_text());lo,hi=map(Vector,conv['sourceBounds']);factor=conv['uniformScale'];center=(lo+hi)*.5;translation=Vector((-center.x*factor,-center.y*factor,-lo.z*factor));source=json.loads((root/'analysis/native-materials.json').read_text());byname={x['name']:x for x in source['geometry']}
bpy.context.preferences.filepaths.use_scripts_auto_execute=False;bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(old/'converted/left-hair/body.glb'));deps=bpy.context.evaluated_depsgraph_get();results=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or o.hide_render:continue
 name=o.name;source_name=name if name in byname else 'left hair' if 'hair' in name.lower() else None
 if source_name is None:continue
 native=array.array('f',(root/byname[source_name]['sourceEvaluatedVertices']['path']).read_bytes())
 if sys.byteorder!='little':native.byteswap()
 tree=kdtree.KDTree(len(native)//3)
 for i in range(len(native)//3):tree.insert(Vector(native[i*3:i*3+3])*factor+translation,i)
 tree.balance();ev=o.evaluated_get(deps);me=ev.to_mesh();coords=[o.matrix_world@v.co for v in me.vertices];distances=sorted(tree.find(v)[2] for v in coords);pos=array.array('f',(c for v in coords for c in v))
 if sys.byteorder!='little':pos.byteswap()
 (root/'analysis'/(source_name.replace(' ','_')+'-old-glb-evaluated.f32')).write_bytes(pos.tobytes());results.append(dict(mesh=name,sourceMesh=source_name,sourceVertices=len(native)//3,glbVertices=len(coords),nearestSourceDistanceMeters=dict(maximum=distances[-1],mean=sum(distances)/len(distances),p50=distances[len(distances)//2],p95=distances[int(len(distances)*.95)],p99=distances[int(len(distances)*.99)])));ev.to_mesh_clear()
(root/'analysis/geometry-baseline-comparison.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))

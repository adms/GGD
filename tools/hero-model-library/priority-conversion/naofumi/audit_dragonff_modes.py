import sys,os,json,hashlib,importlib.util
from pathlib import Path
from collections import Counter
sys.path=[p for p in sys.path if p!='/private/tmp']
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parents[1];source=BASE/'GGD-Asset-Library/intake/public-models-20260910/gtainside-naofumi'
for key,sub in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=ROOT/'native-audit/bpy-isolated'/sub;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
if hasattr(bpy.context.preferences.system,'use_online_access'):bpy.context.preferences.system.use_online_access=False
addon=Path('/private/tmp/ggd-dragonff-round5');spec=importlib.util.spec_from_file_location('ggd_dragonff',addon/'__init__.py',submodule_search_locations=[str(addon)]);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module);module.register()
from ggd_dragonff.ops.dff_importer import import_dff
report=json.loads((source/'renderware-inspection.json').read_text());geom=json.loads((source/'renderware/Naofumi-b8cd4c49ba/native.json').read_text())['clumps'][0]['geometry_list'][0];modes=[]
def tup(p,uv):return tuple(round(float(x),5) for x in [p[0],p[1],p[2],uv[0],uv[1]])
for mode in [False,True]:
 bpy.ops.wm.read_factory_settings(use_empty=True);tx={}
 for t in report['textureDictionaries'][0]['textures']:tx[t['name']]=[bpy.data.images.load(str(source/t['png']),check_existing=True)]
 import_dff(dict(file_name=str(source/'extracted/Naofumi.dff'),txd_images=tx,image_ext='png',connect_bones=False,use_mat_split=mode,remove_doubles=False,create_backfaces=False,group_materials=False,import_normals=True,materials_naming='TEX'))
 meshes=[o.data for o in bpy.context.scene.objects if o.type=='MESH'];actual=Counter();counts=Counter();expected=Counter();selected=geom['extensions']['mat_split'] if mode else geom['triangles']
 for face in selected:
  material=geom['materials'][face['material']]['textures'][0]['name']
  for j in [face['a'],face['b'],face['c']]:
   p=geom['vertices'][j];u=geom['uv_layers'][0][j];expected[(material,tup([p['x'],p['y'],p['z']],[u['u'],1-u['v']]))]+=1
 for mesh in meshes:
  uv=mesh.uv_layers.active
  for p in mesh.polygons:
   name=mesh.materials[p.material_index].name;counts[name]+=len(p.vertices)-2
   for li in p.loop_indices:
    vertex=mesh.vertices[mesh.loops[li].vertex_index];actual[(name,tup(vertex.co,uv.data[li].uv))]+=1
 mats=[]
 for mat in bpy.data.materials:
  if not mat.use_nodes:continue
  ps=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if ps:mats.append({'name':mat.name,'surfaceRenderMethod':getattr(mat,'surface_render_method',None),'legacyBlendMethod':getattr(mat,'blend_method',None),'alphaInputLinked':ps.inputs['Alpha'].is_linked,'alphaInputDefault':ps.inputs['Alpha'].default_value,'diffuseAlpha':mat.diffuse_color[3]})
 modes.append({'useMatSplit':mode,'materialTriangleCounts':dict(counts),'matchesSelectedNativePositionUVMaterialLoopMultiset':actual==expected,'actualLoops':sum(actual.values()),'expectedLoops':sum(expected.values()),'missingNativeLoopRecords':sum((expected-actual).values()),'extraImportedLoopRecords':sum((actual-expected).values()),'materials':mats})
r={'blenderVersion':bpy.app.version_string,'sourceDffSha256':hashlib.sha256((source/'extracted/Naofumi.dff').read_bytes()).hexdigest(),'modes':modes,'roundingDecimalPlaces':5,'comparison':'Per material per triangle corner: original local position and BlenderUV=(u,1-v), preserving duplicates in a multiset','sourceCodeEvidence':[{'file':str(addon/'ops/dff_importer.py'),'line':173,'behavior':'use_mat_split=True selects BinMesh triangle material groups'},{'file':str(addon/'ops/dff_importer.py'),'line':504,'behavior':'unconditionally sets legacy mat.blend_method=CLIP'},{'file':str(addon/'ops/importer_common.py'),'line':110,'behavior':'connects image Alpha socket to shader Alpha regardless of native TXD alpha=false'}]}
(ROOT/'native-audit/dragonff-mode-comparison.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))

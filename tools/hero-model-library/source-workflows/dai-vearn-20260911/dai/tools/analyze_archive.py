#!/usr/bin/env python3
"""Safe static ZIP / DSON inventory; never executes .duf/.dsf scripts or imports Daz."""
from pathlib import Path, PurePosixPath
import zipfile, json, gzip, hashlib, stat, collections, urllib.parse
ROOT=Path(__file__).resolve().parents[1]
arc=ROOT/'original/Dai V2.zip';dest=ROOT/'extracted';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert arc.is_file()
with zipfile.ZipFile(arc) as z:
 infos=z.infolist();bad=[]
 for i in infos:
  p=PurePosixPath(i.filename.replace('\\','/'))
  if p.is_absolute() or '..' in p.parts or ':' in p.parts[0] or stat.S_ISLNK(i.external_attr>>16) or i.flag_bits&1:bad.append(i.filename)
 assert not bad,bad
 assert sum(i.file_size for i in infos)<2*1024**3
 assert z.testzip() is None
 for i in infos:
  out=dest/PurePosixPath(i.filename.replace('\\','/'))
  if i.is_dir():out.mkdir(parents=True,exist_ok=True);continue
  out.parent.mkdir(parents=True,exist_ok=True)
  data=z.read(i)
  if out.exists():assert out.read_bytes()==data
  else:out.write_bytes(data)
 files=[p for p in dest.rglob('*') if p.is_file()]
 manifest=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)]
(ROOT/'archive-manifest.json').write_text(json.dumps({'archive':{'path':str(arc),'bytes':arc.stat().st_size,'sha256':sha(arc)},'memberCount':len(infos),'fileCount':len(files),'totalExpandedBytes':sum(i.file_size for i in infos),'allZipCrcPassed':True,'safeStaticExtraction':True,'allLocalMembers':manifest},ensure_ascii=False,indent=2)+'\n')
report={'formatCounts':dict(collections.Counter(p.suffix.lower() for p in files)),'dsonFiles':[],'referencedExternalAssets':[],'sourceExecutablesExecuted':False,'nativeGameMotionCount':0,'convertedModelCount':0}
refs=collections.defaultdict(set)
def walk(v,owner):
 if isinstance(v,dict):
  for k,x in v.items():
   if k in ['url','parent','id','source','target'] and isinstance(x,str) and ('.dsf' in x.lower() or '.duf' in x.lower()):refs[x].add(owner)
   walk(x,owner)
 elif isinstance(v,list):
  for x in v:walk(x,owner)
for p in files:
 if p.suffix.lower() not in ['.duf','.dsf']:continue
 data=p.read_bytes()
 if data[:2]==b'\x1f\x8b':data=gzip.decompress(data)
 try:j=json.loads(data)
 except Exception as e:report['dsonFiles'].append({'path':str(p.relative_to(ROOT)),'parseError':str(e)});continue
 row={'path':str(p.relative_to(ROOT)),'topLevelKeys':list(j),'assetInfo':j.get('asset_info'),'geometries':[],'nodeTypes':dict(collections.Counter(n.get('type') for n in j.get('node_library',[]))),'nodeNames':[n.get('id') for n in j.get('node_library',[])],'modifierTypes':dict(collections.Counter(('skin' if 'skin' in m else 'morph' if 'morph' in m else 'other') for m in j.get('modifier_library',[]))),'sceneNodeCount':len(j.get('scene',{}).get('nodes',[])),'sceneAnimationChannelCount':len(j.get('scene',{}).get('animations',[]))}
 for g in j.get('geometry_library',[]):row['geometries'].append({'id':g.get('id'),'name':g.get('name'),'vertexCount':g.get('vertices',{}).get('count'),'polygonCount':g.get('polylist',{}).get('count'),'materialGroups':g.get('polygon_material_groups'),'uvSet':g.get('default_uv_set')})
 row['skins']=[{'id':m.get('id'),'node':m.get('skin',{}).get('node'),'geometry':m.get('skin',{}).get('geometry'),'vertexCount':m.get('skin',{}).get('vertex_count'),'jointCount':len(m.get('skin',{}).get('joints',[]))} for m in j.get('modifier_library',[]) if 'skin' in m]
 report['dsonFiles'].append(row);walk(j,str(p.relative_to(ROOT)))
for ref,owners in sorted(refs.items()):
 raw=urllib.parse.unquote(ref.split('#',1)[0]);relative=raw.lstrip('/');matches=[str(p.relative_to(ROOT)) for p in files if str(p).lower().endswith('/'+relative.lower())]
 report['referencedExternalAssets'].append({'reference':ref,'usedBy':sorted(owners),'matchingArchiveFiles':matches,'presentInArchive':bool(matches),'mayBeFragmentOrSameFile':not raw or raw.startswith('#')})
report['missingNonFragmentReferences']=[r for r in report['referencedExternalAssets'] if not r['presentInArchive'] and not r['mayBeFragmentOrSameFile']]
report['counts']={'geometryDatablocks':sum(len(r.get('geometries',[])) for r in report['dsonFiles']),'geometryVertices':sum(g.get('vertexCount',0) or 0 for r in report['dsonFiles'] for g in r.get('geometries',[])),'geometryPolygons':sum(g.get('polygonCount',0) or 0 for r in report['dsonFiles'] for g in r.get('geometries',[])),'skinModifiers':sum(len(r.get('skins',[])) for r in report['dsonFiles']),'boneDefinitions':sum(r.get('nodeTypes',{}).get('bone',0) for r in report['dsonFiles']),'missingReferences':len(report['missingNonFragmentReferences'])}
(ROOT/'static-analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'archiveBytes':arc.stat().st_size,'archiveSha256':sha(arc),'fileCount':len(files),'formatCounts':report['formatCounts'],'counts':report['counts']},indent=2))

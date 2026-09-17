import dataclasses,hashlib,importlib.util,json,sys,zipfile
from pathlib import Path
import numpy as np
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');REPO=W/'GGD-hero-model-options';OUT=W/'outputs/priority-ou99-residual-geometry-audit-20260910';sys.path.insert(0,str(REPO/'tools/w3x-import'))
from w3xlib.mdx import parse_mdx
import geoset_alpha_report as gar
s=importlib.util.spec_from_file_location('h','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
allrows=[]
for r in json.loads((OUT/'input-manifest.json').read_text()):
 g,b=h.read_glb(Path(r['glb']));prim=g['meshes'][0]['primitives'][r['suspectPrimitive']];p=h.accessor(g,b,prim['attributes']['POSITION']);idx=h.accessor(g,b,prim['indices']).reshape(-1);archive=r['nativeArchive']['path']
 with zipfile.ZipFile(archive)as z:
  path=next(i.filename for i in z.infolist()if i.filename.lower().endswith('.mdx'));raw=z.read(path)
 model=parse_mdx(raw);chunks=gar.chunks(raw);seqs=gar.parse_seqs(raw,*chunks['SEQS'][0]);geoas=gar.parse_geoa(raw,*chunks['GEOA'][0])if 'GEOA'in chunks else [];match=[]
 for i,geo in enumerate(model.geosets):
  if len(geo.vertices)!=len(p)or len(geo.faces)!=len(idx):continue
  v=np.asarray(geo.vertices);aug=np.column_stack([v,np.ones(len(v))]);matrix=np.linalg.lstsq(aug,p,rcond=None)[0];err=float(np.max(np.abs(aug@matrix-p)));tri=idx.reshape(-1,3);nativeidx=np.asarray(geo.faces).reshape(-1,3);samefaces=np.array_equal(np.sort(tri,axis=1),np.sort(nativeidx,axis=1))
  if err>1e-5 or not samefaces:continue
  mat=model.materials[geo.material_id];ga=[x for x in geoas if x['geoset']==i];alpha=[]
  for seq in seqs:
   values=[gar.alpha_in_seq(x['tracks']['KGAO'],x['static_alpha'],seq)if x['tracks'].get('KGAO')else x['static_alpha']for x in ga]or[1.0];alpha.append({**seq,'sourceAlphaPeak':max(values)})
  match.append({'nativeGeosetIndex':i,'vertices':len(p),'triangles':len(idx)//3,'sameTriangleVertexTriples':samefaces,'affinePositionMaxError':err,'nativeToGlbAffineMatrix':matrix.tolist(),'nativeMaterialIndex':geo.material_id,'nativeMaterial':dataclasses.asdict(mat),'nativeTexturePaths':[dataclasses.asdict(model.textures[x.texture_id])if x.texture_id<len(model.textures)else{'invalidTextureId':x.texture_id}for x in mat.layers],'nativeMatrixGroups':geo.matrix_groups,'nativeGroupBones':[{**dataclasses.asdict(model.nodes[id]),'translation':None,'rotation':None,'scaling':None}for id in sorted({id for grp in geo.matrix_groups for id in grp})if id in model.nodes],'nativeGeosetAnimation':ga,'sequenceVisibility':alpha})
 assert len(match)==1,(r['originalModelKey'],len(match));proof={'schema':'ggd-native-geoset-provenance@1','modelKey':r['originalModelKey'],'suspectPrimitive':r['suspectPrimitive'],'glbSha256':r['sha256'],'nativeArchive':archive,'nativeArchiveSha256':r['nativeArchive']['sha256'],'nativeMember':path,'nativeMdxBytes':len(raw),'nativeMdxSha256':hashlib.sha256(raw).hexdigest(),'nativeVersion':model.version,'nativeModelName':model.name,'geosetCounts':[{'index':i,'vertices':len(x.vertices),'triangles':len(x.faces)//3}for i,x in enumerate(model.geosets)],'mdxGeosetMatch':match[0],'unmodifiedParser':str(REPO/'tools/w3x-import/geoset_alpha_report.py'),'parserSha256':hashlib.sha256((REPO/'tools/w3x-import/geoset_alpha_report.py').read_bytes()).hexdigest(),'caveat':'Visibility interpretation uses repository GEOA/KGAO parser; no WC3 game execution. Global-sequence tracks need separate interpretation if present.'};(OUT/r['originalModelKey']/'native-geoset-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');allrows.append(proof)
 print(json.dumps({'model':r['originalModelKey'],'nativeGeoset':match[0]['nativeGeosetIndex'],'positionError':match[0]['affinePositionMaxError'],'textures':match[0]['nativeTexturePaths'],'geoa':match[0]['nativeGeosetAnimation'],'visibleSequences':[(x['name'],x['sourceAlphaPeak'])for x in match[0]['sequenceVisibility']]},ensure_ascii=False))
(OUT/'native-provenance-manifest.json').write_text(json.dumps(allrows,ensure_ascii=False,indent=2)+'\n')

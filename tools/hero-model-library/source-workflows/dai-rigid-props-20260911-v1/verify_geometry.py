#!/usr/bin/env python3
"""Compare emitted positions/UVs to every original DSON face; inspect embedded data."""
import argparse,json,pathlib,struct,gzip,hashlib,urllib.parse,numpy as np
ap=argparse.ArgumentParser();ap.add_argument('root',type=pathlib.Path);a=ap.parse_args();root=a.root.resolve()
def js(p):
 b=p.read_bytes();return json.loads(gzip.decompress(b) if b[:2]==b'\x1f\x8b' else b)
def glb(p):
 b=p.read_bytes();assert struct.unpack_from('<III',b)==(0x46546c67,2,len(b));n,t=struct.unpack_from('<II',b,12);assert t==0x4e4f534a;j=json.loads(b[20:20+n]);bn,bt=struct.unpack_from('<II',b,20+n);assert bt==0x004e4942;return j,b[28+n:28+n+bn]
def acc(j,b,i):
 x=j['accessors'][i];v=j['bufferViews'][x['bufferView']];width={'VEC2':2,'VEC3':3,'VEC4':4}[x['type']];assert x['componentType']==5126;off=v.get('byteOffset',0)+x.get('byteOffset',0);return np.array(np.ndarray((x['count'],width),dtype='<f4',buffer=b,offset=off,strides=(v.get('byteStride',4*width),4)))
rows=[]
for prop in ['handheld','back']:
 report=js(root/'intermediate'/prop/'conversion.json');source=pathlib.Path(report['sourceGeometry']['path']);g=js(source)['geometry_library'][0];verts=np.asarray(g['vertices']['values']);pivot=np.asarray(report['sourceCenterPointCm']);expected=(verts-pivot)*.01
 copyroot=root/'raw/extracted';uvpath=copyroot/urllib.parse.unquote(g['default_uv_set'].split('#')[0]).lstrip('/');uv=js(uvpath)['uv_set_library'][0];uvs=np.asarray(uv['uvs']['values']);uvs[:,1]=1-uvs[:,1];overrides={(f,v):u for f,v,u in uv['polygon_vertex_indices']}
 p=root/'outputs'/prop/'component.glb';j,b=glb(p);sourcepolys=g['polylist']['values'];position_max=0;uv_max=0;checked=0;min_normal=2;max_normal=0;tangent_errors=0
 for mi,prim in enumerate(j['meshes'][0]['primitives']):
  attrs={k:acc(j,b,i) for k,i in prim['attributes'].items()};faces=[(i,poly[2:]) for i,poly in enumerate(sourcepolys) if poly[1]==mi];exp=np.asarray([expected[v] for _,face in faces for v in face]);exp_uv=np.asarray([uvs[overrides.get((fi,v),v)] for fi,face in faces for v in face]);position_max=max(position_max,float(np.max(np.abs(attrs['POSITION']-exp))));uv_max=max(uv_max,float(np.max(np.abs(attrs['TEXCOORD_0']-exp_uv))));checked+=len(faces)
  n=attrs['NORMAL'];t=attrs['TANGENT'];assert np.isfinite(n).all() and np.isfinite(t).all();nl=np.linalg.norm(n,axis=1);min_normal=min(min_normal,float(nl.min()));max_normal=max(max_normal,float(nl.max()));assert np.allclose(nl,1,atol=1e-6) and np.allclose(np.linalg.norm(t[:,:3],axis=1),1,atol=1e-6);assert np.max(np.abs(np.sum(n*t[:,:3],axis=1)))<1e-6;assert set(t[:,3]).issubset({-1.,1.})
  assert np.allclose(attrs['POSITION'],exp,atol=1e-7,rtol=0);assert np.allclose(attrs['TEXCOORD_0'],exp_uv,atol=2e-6,rtol=0)
 assert checked==len(sourcepolys)==1854;assert not j.get('skins') and not j.get('animations');assert all(m['alphaMode']=='OPAQUE' for m in j['materials'])
 rows.append({'prop':prop,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceTriangles':len(sourcepolys),'verifiedTriangles':checked,'positionMaximumAbsoluteErrorMeters':position_max,'uvMaximumAbsoluteError':uv_max,'allOriginalFacesPreserved':True,'normalLengthRange':[min_normal,max_normal],'tangentsFiniteUnitOrthogonal':True,'rightHandedYUp':True,'sourcePivotRelativeCmToMeters':True,'nativeBoneAndAnimationCount':0,'transparentMaterials':0,'sourceDazRenderParity':False,'attachmentFitVerified':False})
result={'schema':'ggd.dai-rigid-props-source-geometry-proof@1','props':rows};p=root/'evidence/source-geometry-verification.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))

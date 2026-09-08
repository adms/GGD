"""Inventory native JUMPX/EG3D models; export JUMPX character meshes and clip metadata.

OBJ is a static geometry preview. The original X retains skinning, animation,
particles and render settings. Offsets in metadata refer to inflated native data.
Layout reference: Gamepiaynmo/JumpXToolchain (included beside this script).
"""
import argparse
import concurrent.futures
import csv
import json
import math
import os
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT/'300heroes/raw'
OUT = ROOT/'300heroes/models'

def unpack(fmt, data, off):
    size=struct.calcsize(fmt)
    if off<0 or off+size>len(data):raise ValueError(f'Invalid offset {off}, size {size}')
    return struct.unpack_from(fmt,data,off)

def string(data, off):
    if not 0<=off<len(data):raise ValueError(f'Invalid string offset {off}')
    value=data[off:data.find(b'\0',off) if b'\0' in data[off:] else len(data)]
    for enc in ('utf-8','gb18030'):
        try:return value.decode(enc)
        except UnicodeDecodeError:pass
    return value.decode('gb18030','replace')

def native(path):
    b=path.read_bytes()
    if not b.startswith(b'JUMPX'):raise ValueError('Not JUMPX')
    version,hlen=unpack('<2I',b,80)
    if hlen%12 or hlen>4096:raise ValueError('Unknown header layout')
    fields={}
    for p in range(88,88+hlen,12):
        key,size,value=unpack('<4s2I',b,p)
        if size!=4:raise ValueError('Invalid header field size')
        fields[key.decode()]=value
    p=88+hlen;hr,dr,hc,dc=unpack('<4I',b,p);p+=16
    head=zlib.decompress(b[p:p+hc]);data=zlib.decompress(b[p+hc:p+hc+dc])
    if len(head)!=hr or len(data)!=dr:raise ValueError('Inflated size mismatch')
    return version,fields,head,data

def jumpx(path, export_obj):
    saved={}
    cached=OUT/path.relative_to(RAW).with_suffix('')/'model.json'
    if cached.exists():
        saved=json.loads(cached.read_text())
        character='/character/roleaction/' in '/'+str(path.relative_to(RAW))
        if saved.get('source')==str(path.relative_to(RAW)) and saved.get('source_bytes')==path.stat().st_size and saved.get('source_mtime_ns')==path.stat().st_mtime_ns and (not character or 'animation_binary' in saved) and (not export_obj or 'obj' in saved or not character):
            return {k:v for k,v in saved.items() if k not in ('bones','meshes')}
    version,f,h,d=native(path);rel=path.relative_to(RAW)
    target=OUT/rel.with_suffix('');target.mkdir(parents=True,exist_ok=True)
    textures=[string(h,unpack('<2I',h,f['atex']+8*i)[1]) for i in range(f['ntex'])]
    clips=[]
    for i in range(f['nact']):
        name,start,end,hit,ribbon_start,ribbon_end=unpack('<80s5h',h,f['aact']+90*i)
        clips.append(dict(name=string(name,0),start_frame=start,end_frame=end,
            hit_frame=hit,ribbon_start_frame=ribbon_start,ribbon_end_frame=ribbon_end))
    bones=[]
    for i in range(f['nbon']):
        p=f['abon']+172*i;_,flags,name,parent,nkeys,has=unpack('<3I2iI',h,p)
        keys=unpack('<14I',h,p+116)
        bones.append(dict(index=i,name=string(h,name),parent=parent,save_flags=flags,
            frame_count=nkeys,inverse_bind_matrix=list(unpack('<16f',h,p+24)),
            translation_bounds=list(unpack('<6fI',h,p+88)),
            key_layout=dict(zip(('child_count','child_offset','matrix_count','matrix_offset',
                'visibility_count','visibility_offset','position_count','position_offset',
                'position_compressed_offset','rotation_count','rotation_offset',
                'rotation_compressed_offset','scale_count','scale_offset'),keys))))
    record=dict(source=str(rel),source_bytes=path.stat().st_size,source_mtime_ns=path.stat().st_mtime_ns,
        format='JUMPX',version=version,textures=textures,
        geometry_count=f['ngeo'],bone_count=f['nbon'],particle_count=f['nprt'],
        ribbon_count=f['nrib'],clip_count=len(clips),clips=clips,bones=bones,
        animation_note='Clips and native key offsets; frame rate is unspecified. Original X contains complete key data.',
        native_data_offset_bias=1000000000)
    if '/character/roleaction/' in '/'+str(rel):
        payload=bytearray();shared={}
        for bone in bones:
            layout=bone['key_layout'];channels={}
            for key,width in [('visibility',4),('position',12),('rotation',16),('scale',12)]:
                count=layout[key+'_count'];offset=layout[key+'_offset'];encoding={'visibility':'uint32','position':'float32x3','rotation':'float32x4_native_xyzw','scale':'float32x3'}[key]
                if not count:continue
                if not offset and key=='position':offset=layout['position_compressed_offset'];width=4;encoding='uint32_bbox_10bit_xyz'
                if not offset and key=='rotation':offset=layout['rotation_compressed_offset'];width=8;encoding='uint64_native_packed_rotation'
                offset-=1000000000;length=count*width
                if offset<0 or offset+length>len(d):raise ValueError('Animation key range outside native data')
                identity=(offset,length)
                if identity not in shared:shared[identity]=len(payload);payload.extend(d[offset:offset+length])
                channels[key]=dict(offset=shared[identity],count=count,stride=width,encoding=encoding)
            bone['exported_channels']=channels
        (target/'animation-data.bin').write_bytes(payload)
        record['animation_binary']=str((target/'animation-data.bin').relative_to(ROOT))
        record['animation_binary_bytes']=len(payload)
        record['animation_note']='Animation key payload extracted without coordinate or rotation conversion. model.json bones[].exported_channels addresses animation-data.bin. Clip frame ranges and native timing retained; FPS unspecified.'
    mesh_summary=[]
    obj_path=target/'mesh.obj'
    reuse_obj=bool(saved.get('obj') and saved.get('source')==str(rel) and obj_path.exists() and obj_path.stat().st_mtime_ns>=path.stat().st_mtime_ns)
    if reuse_obj:
        for key in ('obj','meshes','obj_note'):record[key]=saved[key]
    if export_obj and '/character/roleaction/' in '/'+str(rel) and not reuse_obj:
        obj=target/'mesh.obj';mtl=target/'mesh.mtl'
        with mtl.open('w') as out:
            for i in range(f['nmtl']):
                tex_id=unpack('<i',h,f['amtl']+48*i+12)[0]
                out.write(f'newmtl material_{i}\nKd 1 1 1\n')
                if 0<=tex_id<len(textures):
                    ref=textures[tex_id].replace('\\','/')
                    candidate=path.parent/ref
                    if not candidate.exists():candidate=RAW/'data/character/texture'/ref
                    if candidate.exists():out.write('map_Kd '+os.path.relpath(candidate,target)+'\n')
                out.write('\n')
        with obj.open('w') as out:
            out.write('# Native coordinates. Static geometry only; use source X for skinning and animation.\nmtllib mesh.mtl\n')
            vi=1;ui=1
            for i in range(f['ngeo']):
                p=f['ageo']+124*i;g=unpack('<24I',h,p)
                name=string(h,g[2]);count,faces=g[7:9];bounds=unpack('<6fI',h,p+96)
                if count>10000000 or faces>10000000:raise ValueError('Implausible geometry count')
                if g[1]&1 and g[10]:
                    packed=unpack(f'<{count}I',d,g[10]-1000000000);seg=bounds[6]
                    vertices=[tuple(bounds[axis+3]+(bounds[axis]-bounds[axis+3])*((v>>(axis*10))&seg)/seg for axis in range(3)) for v in packed]
                else:
                    flat=unpack(f'<{count*3}f',d,g[9]-1000000000)
                    vertices=list(zip(flat[0::3],flat[1::3],flat[2::3]))
                if not all(math.isfinite(v) for xyz in vertices for v in xyz):raise ValueError('Non-finite vertices')
                uv=unpack(f'<{count*2}f',d,g[13]-1000000000) if g[13] else None
                indices=unpack(f'<{faces*3}H',d,g[19]-1000000000)
                if indices and max(indices)>=count:raise ValueError('Triangle index out of bounds')
                out.write(f'o mesh_{i}\n# {name}\nusemtl material_{g[4]}\n')
                for xyz in vertices:out.write('v '+' '.join(f'{v:.7g}' for v in xyz)+'\n')
                if uv:
                    for j in range(count):out.write(f'vt {uv[j*2]:.7g} {1-uv[j*2+1]:.7g}\n')
                for j in range(0,len(indices),3):
                    out.write('f '+' '.join(f'{vi+k}/{ui+k}' if uv else str(vi+k) for k in indices[j:j+3])+'\n')
                mesh_summary.append(dict(name=name,vertices=count,triangles=faces,material=g[4]))
                vi+=count
                if uv:ui+=count
        record.update(obj=str(obj.relative_to(ROOT)),meshes=mesh_summary,
            obj_note='Static mesh preview; native coordinate system, approximate material mapping. No skeleton or animation in OBJ.')
    (target/'model.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    return {k:v for k,v in record.items() if k not in ('bones','meshes')}

def eg3d(path):
    b=path.read_bytes();n=unpack('<I',b,8)[0]
    version=unpack('<I',b,4)[0]
    if b[12+n:13+n] in (b'[',b'{'):
        metadata=json.loads(b[12+n:].decode('utf-8'));buffer_offset=12
        buffer=b[12:12+n]
    else:
        metadata=json.loads(b[12:12+n].decode('utf-8'));buffer_offset=12+n
        buffer=b[buffer_offset:]
    rel=path.relative_to(RAW);target=OUT/rel.with_suffix('');target.mkdir(parents=True,exist_ok=True)
    (target/'eg3d-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    (target/'eg3d-buffer.bin').write_bytes(buffer)
    clips=[dict(name=x[0],start_frame='',end_frame='',hit_frame='',track_count=len(x[1])) for x in metadata[7]]
    record=dict(source=str(rel),format='EG3D',version=version,metadata=str((target/'eg3d-metadata.json').relative_to(ROOT)),
        clip_count=len(clips),clips=clips,bone_count=len(metadata[5]),native_buffer_offset=buffer_offset,
        binary=str((target/'eg3d-buffer.bin').relative_to(ROOT)),
        note='Native model, skeleton hierarchy and animation metadata preserved; standard mesh/animation conversion is pending.')
    (target/'model.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    return record

def process(task):
    path,export_obj=task
    try:
        with path.open('rb') as f:magic=f.read(5)
        if magic==b'JUMPX':
            record=jumpx(path,False)
            if export_obj:
                try:return jumpx(path,True),None
                except Exception as e:return record,dict(source=str(path.relative_to(RAW)),stage='obj_export',error=str(e))
            return record,None
        if magic.startswith(b'EG3D'):return eg3d(path),None
        return dict(source=str(path.relative_to(RAW)),format='unrecognized',note='Original retained'),None
    except Exception as e:return None,dict(source=str(path.relative_to(RAW)),error=str(e))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--obj',action='store_true');p.add_argument('--limit',type=int);p.add_argument('--workers',type=int,default=4);a=p.parse_args()
    models=sorted(x for x in RAW.rglob('*') if x.suffix.lower() in ('.x','.model'))
    if a.limit:models=models[:a.limit]
    results=[];errors=[]
    with concurrent.futures.ProcessPoolExecutor(max_workers=a.workers) as pool:
        for i,(r,error) in enumerate(pool.map(process,[(path,a.obj) for path in models],chunksize=8)):
            if error:errors.append(error)
            if r:results.append(r)
            if i%1000==0:print(json.dumps(dict(done=i+1,total=len(models),indexed=len(results),errors=len(errors))),flush=True)
    OUT.mkdir(exist_ok=True)
    with (OUT/'model-index.jsonl').open('w') as out:
        for r in results:out.write(json.dumps(r,ensure_ascii=False)+'\n')
    with (OUT/'animation-clips.csv').open('w',encoding='utf-8-sig',newline='') as out:
        writer=csv.writer(out);writer.writerow(['model','action','start_frame','end_frame','hit_frame','bone_count'])
        for r in results:
            for c in r.get('clips',[]):writer.writerow([r['source'],c['name'],c['start_frame'],c['end_frame'],c['hit_frame'],r['bone_count']])
    summary=dict(models=len(models),indexed=len(results),obj=sum('obj' in r for r in results),
        clips=sum(r.get('clip_count',0) for r in results),errors=errors)
    (ROOT/'evidence/300-model-extraction.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='errors'})+' errors='+str(len(errors)),flush=True)

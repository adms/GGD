"""Attach available source textures to OBJ previews without guessing ambiguous names."""
import collections
import json
import os
import struct
import zlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT/'300heroes/raw'
MODEL=ROOT/'300heroes/models'
records=[json.loads(s) for s in (ROOT/'300heroes/indexes/textures-native.jsonl').read_text().splitlines()]
names=collections.defaultdict(list);stems=collections.defaultdict(list);by_path={}
for item in records:
    p=RAW/item['path'];names[p.name.lower()].append(item);stems[p.stem.lower()].append(item);by_path[p]=item

def choose(items):
    if not items:return None
    if len(items)==1 or len({x['md5'] for x in items})==1:
        return sorted(items,key=lambda x:(not x['path'].startswith('data/magic/textures/'),len(x['path'])))[0]
    return None

def resolve(source,ref):
    name=ref.replace('\\','/').lower();base=Path(name).name
    direct=(source.parent/name).resolve()
    if direct in by_path:return by_path[direct],'relative_path'
    same_parent=[x for x in stems[Path(base).stem] if (RAW/x['path']).parent==source.parent]
    item=choose(same_parent)
    if item:return item,'same_directory_extension_fallback'
    item=choose(names[base])
    if item:return item,'unique_name_or_identical_content'
    item=choose(stems[Path(base).stem])
    if item:return item,'unique_stem_extension_fallback'
    return None,'unresolved_or_ambiguous'

stats=collections.Counter();unresolved=[]
for model in [json.loads(s) for s in (MODEL/'model-index.jsonl').read_text().splitlines()]:
    if 'obj' not in model:continue
    source=RAW/model['source'];target=(ROOT/model['obj']).parent
    with source.open('rb') as f:
        b=f.read(88);length=struct.unpack_from('<I',b,84)[0];tags=f.read(length);fields={}
        for p in range(0,length,12):
            name,size,value=struct.unpack_from('<4s2I',tags,p);fields[name.decode()]=value
        hr,dr,hc,dc=struct.unpack('<4I',f.read(16));h=zlib.decompress(f.read(hc))
    refs=[]
    for texture in model['textures']:
        item,method=resolve(source,texture)
        refs.append(dict(original=texture,resolved=item['path'] if item else None,method=method))
    materials=[]
    with (target/'mesh.mtl').open('w') as f:
        for i in range(fields['nmtl']):
            tex=struct.unpack_from('<i',h,fields['amtl']+48*i+12)[0]
            resolved=refs[tex] if 0<=tex<len(refs) else None
            f.write(f'newmtl material_{i}\nKd 1 1 1\n')
            if resolved and resolved['resolved']:
                f.write('map_Kd '+os.path.relpath(RAW/resolved['resolved'],target)+'\n');stats['mapped_materials']+=1
            elif resolved:
                unresolved.append(dict(source=model['source'],material=i,texture=resolved['original']));stats['unresolved_materials']+=1
            f.write('\n');materials.append(dict(index=i,texture_index=tex,texture=resolved))
    (target/'materials.json').write_text(json.dumps(dict(source=model['source'],materials=materials,textures=refs),ensure_ascii=False,indent=2)+'\n')
    stats['models']+=1
(ROOT/'evidence/300-material-resolution.json').write_text(json.dumps(dict(summary=dict(stats),unresolved=unresolved),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(stats)))

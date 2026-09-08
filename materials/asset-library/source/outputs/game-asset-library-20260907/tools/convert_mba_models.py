"""Convert standard DirectX MBA meshes/animations to GLB and embed PNG textures."""
import concurrent.futures,csv,io,json,struct,subprocess
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent;GAME=ROOT/'magical-battle-arena';RAW=GAME/'raw';OUT=GAME/'models'

def chunks(data):
    if data[:4]!=b'glTF':raise ValueError('Invalid GLB header')
    result={};p=12
    while p<len(data):
        n,kind=struct.unpack_from('<I4s',data,p);p+=8;result[kind]=data[p:p+n];p+=n
    return result

def convert(path):
    rel=path.relative_to(RAW);dest=OUT/rel.with_suffix('.glb');dest.parent.mkdir(parents=True,exist_ok=True)
    log=dest.with_suffix('.conversion.log')
    try:
        with log.open('w') as f:subprocess.run(['assimp','export',str(path),str(dest),'-fglb2'],stdout=f,stderr=subprocess.STDOUT,check=True,timeout=120)
        c=chunks(dest.read_bytes());d=json.loads(c[b'JSON']);binary=bytearray(c.get(b'BIN\0',b''));missing=[];embedded=0
        for image in d.get('images',[]):
            uri=image.get('uri')
            if not uri:continue
            name=uri.replace('\\','/');source=RAW/name
            if not source.exists():source=path.parent/name
            if not source.exists():missing.append(uri);continue
            buf=io.BytesIO()
            with Image.open(source) as img:img.convert('RGBA').save(buf,format='PNG')
            while len(binary)%4:binary.append(0)
            offset=len(binary);payload=buf.getvalue();binary.extend(payload)
            views=d.setdefault('bufferViews',[]);image['bufferView']=len(views)
            views.append(dict(buffer=0,byteOffset=offset,byteLength=len(payload)))
            image['mimeType']='image/png';image.pop('uri');embedded+=1
        d['buffers'][0]['byteLength']=len(binary)
        while len(binary)%4:binary.append(0)
        encoded=json.dumps(d,ensure_ascii=False,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
        total=12+8+len(encoded)+8+len(binary)
        dest.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
        clips=[]
        for animation in d.get('animations',[]):
            times=[]
            for sampler in animation['samplers']:
                accessor=d['accessors'][sampler['input']]
                if accessor.get('min'):times.append(accessor['min'][0])
                if accessor.get('max'):times.append(accessor['max'][0])
            clips.append(dict(name=animation.get('name',''),channels=len(animation['channels']),
                start_seconds=min(times) if times else None,end_seconds=max(times) if times else None))
        result=dict(source=str(rel),glb=str(dest.relative_to(GAME)),meshes=len(d.get('meshes',[])),
            skins=len(d.get('skins',[])),joints=sum(len(s['joints']) for s in d.get('skins',[])),
            animation_count=len(clips),animations=clips,embedded_textures=embedded,missing_textures=missing,
            bytes=total,status='converted')
        dest.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result
    except Exception as e:return dict(source=str(rel),status='failed',error=str(e),log=str(log.relative_to(GAME)))

if __name__=='__main__':
    models=sorted(p for p in RAW.rglob('*') if p.is_file() and p.suffix.lower()=='.x');results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i,r in enumerate(pool.map(convert,models)):
            results.append(r)
            if i%25==0 or r['status']=='failed':print(json.dumps(dict(done=i+1,total=len(models),source=r['source'],status=r['status'])),flush=True)
    (OUT/'model-index.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in results))
    with (OUT/'animation-clips.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['source_model','glb','animation','channels','start_seconds','end_seconds'])
        for r in results:
            for a in r.get('animations',[]):w.writerow([r['source'],r['glb'],a['name'],a['channels'],a['start_seconds'],a['end_seconds']])
    summary=dict(models=len(results),converted=sum(r['status']=='converted' for r in results),
        failed=[r for r in results if r['status']=='failed'],animations=sum(r.get('animation_count',0) for r in results),
        embedded_textures=sum(r.get('embedded_textures',0) for r in results),missing_textures=sum(len(r.get('missing_textures',[])) for r in results))
    (ROOT/'evidence/mba-model-conversion.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary),flush=True)

from pathlib import Path
import subprocess,json,hashlib,struct,urllib.parse
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-native-format-batch3/gmoloader')
SOURCE=next((ROOT/'extracted').iterdir())/'Resources/Models'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
results=[]
for name in ['Cloud','Sephiroth','Squall']:
 src=SOURCE/name/(name.lower()+'.smd');out=ROOT/'converted'/name.lower();out.mkdir(parents=True,exist_ok=True)
 p=out/'body.glb'
 run=subprocess.run(['/usr/local/bin/assimp','export',str(src),str(p),'-fglb2'],capture_output=True,text=True)
 (out/'assimp.log').write_text(run.stdout+'\n'+run.stderr);assert run.returncode==0,run.stderr
 b=p.read_bytes();jlen=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+jlen]);blen=struct.unpack_from('<I',b,20+jlen)[0];binary=bytearray(b[28+jlen:28+jlen+blen]);embedded=[]
 for im in doc.get('images',[]):
  if 'uri' not in im:raise ValueError('Unexpected already embedded image')
  namepart=urllib.parse.unquote(im.pop('uri'));tex=(src.parent/namepart).resolve()
  if tex.parent!=src.parent.resolve() or tex.suffix.lower()!='.png':raise ValueError('Unexpected external texture path')
  data=tex.read_bytes();assert data.startswith(b'\x89PNG\r\n\x1a\n')
  binary.extend(bytes(-len(binary)%4));off=len(binary);binary.extend(data);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(data)})
  im.update(bufferView=len(doc['bufferViews'])-1,mimeType='image/png');embedded.append({'path':str(tex.relative_to(ROOT)),'bytes':len(data),'sha256':sha(tex)})
 doc['buffers']=[{'byteLength':len(binary)}];head=json.dumps(doc,separators=(',',':')).encode();head+=b' '*(-len(head)%4);binary.extend(bytes(-len(binary)%4))
 p.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(head)+len(binary),len(head),0x4e4f534a)+head+struct.pack('<2I',len(binary),0x004e4942)+binary)
 r={'source':str(src.relative_to(ROOT)),'sourceSha256':sha(src),'model':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p),'meshes':len(doc.get('meshes',[])),'skins':len(doc.get('skins',[])),'joints':[len(x['joints']) for x in doc.get('skins',[])],'textures':len(doc.get('textures',[])),'embeddedTextureFiles':embedded,'animations':len(doc.get('animations',[])),'sourceGmoAnimationConverted':False,'runtimeReady':False,'scaleNormalization':'source units retained, metric scale pending','smdAnimationStatus':'Any pose track from SMD is not a conversion of the separate original GMO motion library.'}
 (out/'conversion.json').write_text(json.dumps(r,indent=2)+'\n');results.append(r);print(name,r['meshes'],r['joints'],r['textures'],r['animations'])
(ROOT/'analysis/smd-conversions.json').write_text(json.dumps(results,indent=2)+'\n')

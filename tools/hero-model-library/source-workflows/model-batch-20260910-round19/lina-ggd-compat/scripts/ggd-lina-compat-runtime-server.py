from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json, threading, subprocess, base64, re, shutil
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT')
DST=ROOT/'GGD-Asset-Library/intake/public-models-20260910/parallel-community-lina-ggd-compatibility'
RUN=DST/'evidence/runtime'; RUN.mkdir(exist_ok=True)
INPUT=json.loads((DST/'evidence/input.json').read_text())
ASSET='/content/'+INPUT['fixtureModel']['glbPath']
done=threading.Event(); requests=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  requests.append(self.path); print('GET '+self.path,flush=True)
  if self.path=='/': payload=b'<html><body style="margin:0"><canvas width="1024" height="1024"></canvas><script type="module">import("/bundle.js").catch(async e=>{await fetch("/save/bootstrap-error.json",{method:"POST",body:JSON.stringify({message:String(e),stack:e.stack})});await fetch("/done",{method:"POST"})})</script></body></html>'; mime='text/html'
  elif self.path=='/bundle.js': payload=Path('/private/tmp/ggd-lina-compat-runtime-bundle.js').read_bytes(); mime='text/javascript'
  elif self.path=='/input': payload=(DST/'evidence/input.json').read_bytes(); mime='application/json'
  elif self.path in ['/content/assets/textures/ground/stone/'+f+'.png' for f in ['albedo','normal','orm','macro']]: payload=(ROOT/'GGD-hero-model-options'/self.path.lstrip('/')).read_bytes(); mime='image/png'
  elif self.path==ASSET: payload=(DST/'fixture/content'/INPUT['fixtureModel']['glbPath']).read_bytes(); mime='model/gltf-binary'
  else: self.send_error(404); return
  self.send_response(200); self.send_header('Content-Type',mime); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
 def do_POST(self):
  if self.path=='/done': self.send_response(200); self.end_headers(); done.set(); return
  name=self.path.removeprefix('/save/'); length=int(self.headers.get('Content-Length','0'))
  if not self.path.startswith('/save/') or not re.fullmatch(r'[a-z0-9-]+\.(png|json|webm)',name) or length>16000000: self.send_error(400); return
  data=json.loads(self.rfile.read(length)); payload=base64.b64decode(data['png'],validate=True) if name.endswith('.png') else base64.b64decode(data['video'],validate=True) if name.endswith('.webm') else (json.dumps(data,indent=2)+'\n').encode()
  if name.endswith('.png') and not payload.startswith(b'\x89PNG\r\n\x1a\n'): self.send_error(400); return
  (RUN/name).write_bytes(payload); self.send_response(200); self.end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler); threading.Thread(target=server.serve_forever,daemon=True).start(); url=f'http://127.0.0.1:{server.server_address[1]}/'
args=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir=/private/tmp/ggd-lina-headless-profile',url]
with (RUN/'chrome-process.log').open('w') as log:
 proc=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  complete=done.wait(180)
  print(json.dumps({'complete':complete,'proofExists':(RUN/'runtime-proof.json').exists(),'errorExists':(RUN/'runtime-error.json').exists(),'localUrl':url}),flush=True)
 finally:
  proc.terminate()
  try: proc.wait(timeout=10)
  except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=5)
  server.shutdown(); server.server_close()
(RUN/'http-requests.json').write_text(json.dumps(requests,indent=2)+'\n')
for f in ['ggd-lina-compat-runtime-server.py','ggd-lina-compat-runtime.mjs']: shutil.copyfile('/private/tmp/'+f,DST/'scripts'/f)

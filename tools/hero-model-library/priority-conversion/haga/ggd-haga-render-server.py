from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
import json,threading,subprocess,base64,re,shutil
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');source=W/'outputs/haga-native-visibility-20260910';run=source/'render-v1';run.mkdir(exist_ok=False);(run/'tools').mkdir();done=threading.Event()
repo=W/'GGD-hero-model-options';doc=json.loads((repo/'content/models/ou99.495015-standard.json').read_text());clips=json.loads((source/'converted-v1/conversion.json').read_text())['clips'];assets={'original':repo/'content'/doc['glbPath'],'corrected':source/'runtime-v1/body.glb'};brief=[{'key':key,'clips':clips}for key in assets]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/':payload=b'<html><body style="margin:0"><canvas width="900" height="900"></canvas><script type="module" src="/bundle.js"></script></body></html>';mime='text/html'
  elif self.path=='/bundle.js':payload=Path('/private/tmp/ggd-haga-render-bundle.js').read_bytes();mime='text/javascript'
  elif self.path=='/manifest':payload=json.dumps(brief).encode();mime='application/json'
  elif self.path.startswith('/asset/')and self.path[7:]in assets:payload=assets[self.path[7:]].read_bytes();mime='model/gltf-binary'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 def do_POST(self):
  if self.path=='/done':self.send_response(200);self.end_headers();done.set();return
  name=self.path.removeprefix('/save/');length=int(self.headers.get('Content-Length','0'))
  if not self.path.startswith('/save/')or not re.fullmatch(r'[a-z0-9-]+\.(png|json)',name)or length>16000000:self.send_error(400);return
  data=json.loads(self.rfile.read(length));payload=base64.b64decode(data['png'],validate=True)if name.endswith('.png')else(json.dumps(data,indent=2)+'\n').encode()
  with(run/name).open('xb')as f:f.write(payload)
  self.send_response(200);self.end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_address[1]}/'
args=['/usr/bin/arch','-arm64','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir=/private/tmp/ggd-haga-render-headless-profile',url]
with(run/'chrome-process.log').open('w')as log:
 proc=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  complete=done.wait(55);print(json.dumps({'complete':complete,'pngCount':len(list(run.glob('*.png'))),'error':(run/'render-error.json').exists()}),flush=True)
 finally:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)
  server.shutdown();server.server_close()
for f in ['ggd-haga-render.mjs','ggd-haga-render-server.py']:shutil.copy2('/private/tmp/'+f,run/'tools'/f)

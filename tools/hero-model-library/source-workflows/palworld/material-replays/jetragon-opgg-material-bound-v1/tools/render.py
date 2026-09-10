"""Render a local Jetragon GLB in isolated headless Chrome; preserve every run."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import argparse,base64,hashlib,json,os,re,subprocess,tempfile,threading

parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
source=args.source.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(os.environ['GGD_REPO_ROOT']).resolve();done=threading.Event()
env=dict(os.environ,NODE_PATH=str(root/'node_modules/.pnpm/node_modules'))
subprocess.run([str(root/'node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild'),str(Path(__file__).with_suffix('.mjs')),'--bundle','--format=esm','--outfile='+str(out/'bundle.js')],check=True,env=env)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/':data=b'<canvas width="800" height="800"></canvas><script type="module" src="/bundle.js"></script>';mime='text/html'
  elif self.path=='/body.glb':data=source.read_bytes();mime='model/gltf-binary'
  elif self.path=='/bundle.js':data=(out/'bundle.js').read_bytes();mime='text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path=='/done':self.send_response(200);self.end_headers();done.set();return
  name=self.path.removeprefix('/save/');n=int(self.headers.get('Content-Length','0'))
  if not self.path.startswith('/save/') or not re.fullmatch(r'[a-z0-9-]+\.(png|json)',name) or n>16000000:self.send_error(400);return
  obj=json.loads(self.rfile.read(n));data=base64.b64decode(obj['png'],validate=True) if name.endswith('.png') else (json.dumps(obj,indent=2)+'\n').encode()
  with (out/name).open('xb') as stream:stream.write(data)
  self.send_response(200);self.end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
profile=Path(tempfile.mkdtemp(prefix='ggd-jetragon-chrome-'))
cmd=['/usr/bin/arch','-arm64',chrome,'--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+str(profile),f'http://127.0.0.1:{server.server_address[1]}/']
with (out/'chrome.log').open('w') as log:
 process=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:complete=done.wait(55)
 finally:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
  server.shutdown();server.server_close()
receipt={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'complete':complete,'proofExists':(out/'proof.json').is_file(),'errorExists':(out/'error.json').is_file(),'images':len(list(out.glob('*.png')))}
(out/'run.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
if not complete or not receipt['proofExists'] or receipt['errorExists']:raise SystemExit(1)

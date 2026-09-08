from pathlib import Path
import json, os, socket, subprocess, time, urllib.request, signal
root=Path(__file__).resolve().parent
repo=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge-s3')
proof=json.loads((root/'evidence/preparation.json').read_text())
secrets=json.loads((root/'credentials-private.json').read_text())
ports=proof['ports']
for port in ports.values():
 with socket.socket() as sock:
  if sock.connect_ex(('127.0.0.1',port))==0:raise RuntimeError(f'Port {port} already occupied; no service replaced')
(root/'redis').mkdir(exist_ok=True)
(root/'loopback-only.mjs').write_text('''import net from "node:net";
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  if (args[0] === Number(process.env.GAME_PORT)) {
    if (typeof args[1] === "string") args[1] = "127.0.0.1";
    else args.splice(1, 0, "127.0.0.1");
  }
  return original.apply(this, args);
};
''')
base={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']}
base.update({'GGD_DEPLOY_TIER':'dev','GGD_BUILD_STAMP':proof['codeCommit'],'REDIS_ADDR':f"127.0.0.1:{ports['redis']}",'GGD_PLATFORM_URL':f"http://127.0.0.1:{ports['platform']}",'CONTENT_DIR':str(root/'content')})
children=[]
def start(name,cmd,env,cwd=repo):
 log=open(root/'logs'/f'{name}.log','ab',buffering=0)
 p=subprocess.Popen(cmd,cwd=cwd,env={**base,**env},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 children.append((name,p,log));print(json.dumps({'service':name,'pid':p.pid}),flush=True)
 (root/'services-private.json').write_text(json.dumps({'processes':[{'name':n,'pid':c.pid} for n,c,l in children]},indent=2)+'\n')
 return p

def wait_url(url,seconds=40):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  for n,p,l in children:
   if p.poll() is not None:raise RuntimeError(f'{n} exited {p.returncode}; inspect its local log')
  try:
   with urllib.request.urlopen(url,timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(.5)
 raise RuntimeError(f'Health check timeout: {url}')
try:
 start('redis',['redis-server','--bind','127.0.0.1','--port',str(ports['redis']),'--dir',str(root/'redis'),'--appendonly','yes'],{})
 time.sleep(.5)
 start('platform',[str(root/'bin/platform')],{'PLATFORM_ADDR':f"127.0.0.1:{ports['platform']}",'PLATFORM_INTERNAL_URL':base['GGD_PLATFORM_URL'],'GAME_SERVER_ADDR':f"http://127.0.0.1:{ports['game']}",'DATA_DIR':str(root/'data'),'JWT_SIGNING_SECRET':secrets['jwt'],'PLATFORM_GAME_SHARED_SECRET':secrets['game'],'ADMIN_BOOTSTRAP_USERNAME':'model-reviewer','GGD_CONTENT_API_URL':f"http://127.0.0.1:{ports['importer']}",'GGD_HERO_IMPORT_SECRET':secrets['import']})
 wait_url(base['GGD_PLATFORM_URL']+'/api/v1/healthz')
 start('importer',['node','--import','tsx','apps/content-api/src/heroImportIndex.ts'],{'HOST':'127.0.0.1','PORT':str(ports['importer']),'GGD_CONTENT_DIR':str(root/'content'),'GGD_HERO_IMPORT_DIR':str(root/'imports'),'GGD_HERO_IMPORT_SECRET':secrets['import']})
 start('content-api',['node','--import','tsx','apps/content-api/src/index.ts'],{'HOST':'127.0.0.1','PORT':str(ports['contentApi']),'GGD_CONTENT_DIR':str(root/'content'),'GGD_CONTENT_BACKUP_DIR':str(root/'backups'),'GGD_EDITOR_ORIGINS':f"http://127.0.0.1:{ports['editor']}"})
 start('game',['node','--import',str(root/'loopback-only.mjs'),'--import','tsx','apps/game-server/src/index.ts'],{'GAME_PORT':str(ports['game']),'GAME_PUBLIC_ENDPOINT':f"ws://127.0.0.1:{ports['game']}",'PLATFORM_GAME_SHARED_SECRET':secrets['game'],'GGD_REPLAY_DIR':str(root/'replays'),'GGD_CONTENT_API_URL':f"http://127.0.0.1:{ports['importer']}",'GGD_HERO_IMPORT_SECRET':secrets['import']})
 start('editor',['pnpm','--filter','@ggd/editor','dev','--host','127.0.0.1','--port',str(ports['editor'])],{'VITE_CONTENT_API_URL':f"http://127.0.0.1:{ports['contentApi']}",'VITE_PLATFORM_API_URL':base['GGD_PLATFORM_URL']})
 wait_url(f"http://127.0.0.1:{ports['game']}/healthz",60)
 wait_url(f"http://127.0.0.1:{ports['editor']}/editor/hero-forge")
 print(json.dumps({'status':'ready','ports':ports,'codeCommit':proof['codeCommit']}),flush=True)
 while True:
  for n,p,l in children:
   if p.poll() is not None:raise RuntimeError(f'{n} exited {p.returncode}')
  time.sleep(2)
finally:
 for n,p,l in reversed(children):
  if p.poll() is None:
   os.killpg(p.pid,signal.SIGTERM)
 for n,p,l in reversed(children):
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL)
  l.close()

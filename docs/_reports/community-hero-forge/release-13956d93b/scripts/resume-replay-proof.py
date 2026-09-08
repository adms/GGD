from pathlib import Path
import json,os,subprocess,time
root=Path(__file__).resolve().parent
repo=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge-s3')
def await_report(rel):
 end=time.monotonic()+600
 while time.monotonic()<end:
  p=root/rel
  if p.exists():
   report=json.loads(p.read_text())
   if report['status']=='passed':return report
   if report['status']=='failed':raise RuntimeError('Prior phase failed: '+rel)
  time.sleep(1)
 raise RuntimeError('Prior phase did not finish: '+rel)
env=dict(os.environ)
env.update({'GGD_LOCAL_COMMUNITY_PROOF':'disposable-local-only','GGD_LOCAL_PROOF_PASSWORD':json.loads((root/'credentials-private.json').read_text())['password'],'GGD_LOCAL_PROOF_PLATFORM_PORT':'8097','GGD_LOCAL_PROOF_GAME_PORT':'2617','CONTENT_DIR':str(root/'content'),'GGD_LOCAL_PROOF_FULL_MATCH':'1','GGD_LOCAL_PROOF_COMBAT':'1'})
def run(script,log,extra={}):
 print(json.dumps({'phase':script,'status':'started'}),flush=True)
 with open(root/'logs'/log,'wb') as f:p=subprocess.run(['node','--import','tsx',str(root/script)],cwd=repo,env={**env,**extra},stdout=f,stderr=subprocess.STDOUT)
 print(json.dumps({'phase':script,'exitCode':p.returncode}),flush=True)
 if p.returncode:raise RuntimeError(script+' failed; preserve log and inspect actual error')
await_report('publication-37-attempt2/report.json')
run('replay-current.mts','replay-current.log',{'GGD_LOCAL_PROOF_REPORT':str(root/'evidence/replay.json'),'GGD_LOCAL_PROOF_RECORDING':str(root/'evidence/match.json')})
print(json.dumps({'status':'passed','steps':['37 publications','ordinary match','reconnection','settlement','fixed replay']}),flush=True)

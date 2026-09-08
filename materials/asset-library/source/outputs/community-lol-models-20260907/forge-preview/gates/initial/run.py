import subprocess,os,json,time,signal
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
base=Path('/private/tmp/ggd-hero-body-gates')
start=time.time()
commands=['skills:check','editor:accept:release','coord:check']
def run(command):
 path=base/(command.replace(':','-')+'.log')
 with path.open('w') as log:
  proc=subprocess.Popen(['pnpm',command],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=proc.wait(timeout=900)
  except subprocess.TimeoutExpired:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
   code=124
 return {'command':'pnpm '+command,'exitCode':code,'log':path.name}
with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,commands))
result={'schema':'ggd-required-gates@1','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'worktreeDirty':True,'startedAt':start,'finishedAt':time.time(),'results':results}
(base/'results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))

from pathlib import Path
import subprocess, json, sys, time
repo=Path(sys.argv[1]); pr=sys.argv[2]
chain=json.loads((repo/'package.json').read_text())['scripts']['skills:check'].split(' && ')
start=chain.index('pnpm decor:check')
results=[]
log=Path(f'/private/tmp/ggd-mvp-ci{pr}-skills-tail.log')
with log.open('w') as out:
 for command in chain[start:]:
  out.write('\n'+command+'\n');out.flush()
  began=time.monotonic()
  code=subprocess.run(command.split(),cwd=repo,stdout=out,stderr=subprocess.STDOUT).returncode
  results.append({'command':command,'exitCode':code,'elapsedSeconds':round(time.monotonic()-began,3)})
Path(f'/private/tmp/ggd-mvp-ci{pr}-skills-tail.json').write_text(json.dumps({'completedPrefixCommands':start,'results':results},indent=2)+'\n')
print(json.dumps({'pr':pr,'commands':len(results),'failures':[r for r in results if r['exitCode']]}))
sys.exit(1 if any(r['exitCode'] for r in results) else 0)

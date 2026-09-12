import concurrent.futures, hashlib, json, pathlib, urllib.request, urllib.error, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
JOBS=[
('steam-official-news.html','https://steamcommunity.com/app/1895810/allnews/'),
('square-enix-story-coverage.html','https://www.square-enix-games.com/en_US/home/infinity-strash-dragon-quest-adventure-dai-out-now'),
('dqtact-true-vearn.html','https://dq-tact.github.io/units/truedarkkingvearn.html'),
('dqtact-repository.json','https://api.github.com/repos/dq-tact/dq-tact.github.io'),
('official-hoshidora-vearn-event.html','https://www.dragonquest.jp/hoshidora/raid_event3/')]
def fetch(j):
 name,url=j; dst=ROOT/'evidence'/name
 row={'url':url,'path':str(dst.relative_to(ROOT)),'purpose':'source evidence only; not a character/game asset package'}
 if dst.exists():
  data=dst.read_bytes(); row.update(status='already-preserved',bytes=len(data),sha256=hashlib.sha256(data).hexdigest());return row
 try:
  cmd=['curl','--fail','--location','--silent','--show-error','--max-time','25','--max-filesize',str(8*1024*1024),'--output',str(dst),'--write-out','%{http_code} %{url_effective}',url]
  result=subprocess.run(cmd,capture_output=True,text=True)
  if result.returncode: raise RuntimeError(f'curl exit {result.returncode}: {result.stderr.strip()}')
  data=dst.read_bytes();row.update(status='downloaded-evidence',httpResult=result.stdout,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
 except Exception as e:row.update(status='not-acquired',error=str(e),stopWithoutBypass=True)
 return row
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: rows=list(pool.map(fetch,JOBS))
 (ROOT/'evidence-fetch-receipt.json').write_text(json.dumps({'schema':'ggd.public-evidence-fetch@1','files':rows},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(rows,ensure_ascii=False,indent=2))

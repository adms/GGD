import json,re,shutil
from pathlib import Path
repo=Path.cwd();root=Path('/private/tmp/ggd-community37-editor-publish')
rows=[]
for n,b in enumerate(json.loads((repo/'tools/community-hero-forge/library-bodies/community37.bindings.json').read_text())['entries'],1):
 d=root/f'{n:02}';a=json.loads((d/'author.json').read_text()) if (d/'author.json').exists() else {}
 p=json.loads((d/'publication.json').read_text()) if (d/'publication.json').exists() else {}
 response=(d/'published-confirmed.txt').read_text() if (d/'published-confirmed.txt').exists() else p.get('response','')
 published=bool(re.search(r'^.*第 \d+ 版 · 已發布',response,re.M))
 submitted=any(json.loads(f.read_text()).get('status')=='submitted' for f in d.glob('author*.json'))
 returned=(d/'return-vfx-review.json').exists() and a.get('status')!='submitted'
 summon_returned=n==17 and (d/'return-review.json').exists() and a.get('status')!='submitted'
 quota='今日英雄投稿已達政策上限' in a.get('error','')
 status='已發布（隔離驗收平台）' if published else '已退回；特效已修正，待重投' if returned else ('已退回；召喚依賴已補齊，待重投及畫面複查' if (d/'summon-package-proof.json').exists() else '已退回；召喚依賴待重建驗證') if summon_returned else '已建包，待投稿' if quota else '已送審，待畫面審查' if submitted else ('已建包；反轉機制保留，待重投及畫面複查' if a.get('status')=='built' else '既有退回稿，待接續') if n==32 else '投稿待排除問題' if a.get('status')=='needs-attention' else '已建包，待投稿' if a.get('status')=='built' else '本機草稿，待編輯器投稿'
 reviewPath=d/'author-preview'/'assessment.json'
 review=json.loads(reviewPath.read_text()) if reviewPath.exists() else None
 if not published and not submitted and review:
  if review['status']=='needs-attention':status='已建包；召喚畫面仍待修正' if n==17 else '已建包；草稿畫面仍待修正'
  elif n==17:status='已退回；召喚依賴與草稿畫面已修正，待重投'
  elif n==15:status='已退回；修正版草稿畫面已複查，待重投'
  elif n==32:status='反轉分支已於草稿驗證，待重投及固定審查'
  else:status='已建包；草稿畫面已複查，待投稿'
 v=re.search(r'目前上線版本：(hero-[a-f0-9]+)',response)
 rows.append(dict(number=n,name=b['name'],status=status,submitted=submitted,published=published,publishedVersion=v[1] if v else None))
 if published and (d/'summon-package-proof.json').exists() and not ((d/'fixed-summon-reviewed.json').exists() and json.loads((d/'fixed-summon-reviewed.json').read_text()).get('url')==p.get('reviewUrl')):
  rows[-1]['status']='已發布舊版；召喚依賴已重建，待重投及固定複查'
  rows[-1]['publicationFollowup']='Fixed published snapshot omitted summon dependency; current draft ZIP corrected, awaiting resubmission and review.'
 if review:rows[-1]['authorPreview']={key:review[key] for key in ['revision','status','scope']}
report=repo/'docs/_reports/community-hero-forge/editor-publication'
(report/'progress.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
p=report/'README.md';text=p.read_text();submitted=sum(r['submitted'] for r in rows);published=sum(r['published'] for r in rows)
text=re.sub(r'當前(?:完成|進度)：.*?尚未部署正式站。',f'當前進度：{submitted}/37 名已有當前服務建包與投稿紀錄（含退回待修訂），{published}/37 名發布至 127.0.0.1 隔離驗收平台。尚未部署正式站。',text)
text=re.sub(r'已發布的(?:武藤遊戲、八神庵、不知火舞| [0-9]+ 名英雄)均經',f'已發布的 {published} 名英雄均經',text)
text=text.split('| # | 英雄 | 目前狀態 |')[0]+'| # | 英雄 | 目前狀態 |\n| --- | --- | --- |\n'+''.join(f"| {r['number']:02} | {r['name']} | {r['status']} |\n" for r in rows)
p.write_text(text)
shutil.copytree(root,repo.parent/'outputs/community-hero-asset-integration/editor-publication-20260907',dirs_exist_ok=True)
print(json.dumps(dict(submitted=submitted,published=published),ensure_ascii=False))

"""Rebuild the acquired-model design queue from reviewed source identities and live heroes.

Source audits are retained separately. New acquisitions refresh those audits;
new or changed hero definitions are checked on every run. No hero IDs are invented.
"""
from pathlib import Path
import argparse,hashlib,json,re,unicodedata
from design_backlog_labels import labels_for, hero_check_label
from design_backlog_resources import resource_view, resource_cell, source_overview, audio_reserve_section
from fateubw_backlog_overlay import apply_fateubw_overlay
from mba_pilot_backlog_overlay import apply_mba_pilot_overlay

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'materials/hero-model-library'
DATA=BASE/'design-backlog'
TITLE='已取得模型待設計英雄'
def read(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def norm(value):return re.sub(r'[^\w]','',unicodedata.normalize('NFKC',str(value)).lower())
def text(value):return str(value).replace('|','／').replace('\n',' ')
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()

def candidate_role(candidate):
    role=str(candidate.get('resourceRole',''))
    if role in {'character-body','character-body-costume','character-body-mesh-source'}:return 'body'
    if role=='shared-source-container':return 'shared-container'
    if role in {'model-component-or-prop','independent-static-skinned-model-component'} or 'component' in role or 'prop' in role:return 'component'
    return 'other'

CLASSIFIED_ROLES={'character-body','character-body-costume','character-body-mesh-source','model-component-or-prop','shared-source-container','independent-static-skinned-model-component','independent-skinned-model-motion-component'}

def has_classified_roles(candidates):return any(candidate.get('resourceRole') in CLASSIFIED_ROLES for candidate in candidates)

def candidate_breakdown(candidates):
    counts={'characterBodySources':0,'standaloneCharacterBodies':0,'componentsOrProps':0,'sharedContainers':0,'otherCandidateFiles':0}
    for candidate in candidates:
        role=candidate_role(candidate)
        if role=='body':
            counts['characterBodySources']+=1
            if candidate.get('isStandaloneModelCandidate') is True or candidate.get('resourceRole')=='character-body-costume':counts['standaloneCharacterBodies']+=1
        elif role=='component':counts['componentsOrProps']+=1
        elif role=='shared-container':counts['sharedContainers']+=1
        else:counts['otherCandidateFiles']+=1
    return counts

def candidate_summary(candidates):
    if not has_classified_roles(candidates):return f'{len(candidates)} 份'
    counts=candidate_breakdown(candidates);parts=[]
    if counts['characterBodySources']:parts.append(f"角色本體來源 {counts['characterBodySources']}")
    if counts['componentsOrProps']:parts.append(f"元件／配件 {counts['componentsOrProps']}")
    if counts['sharedContainers']:parts.append(f"共享容器 {counts['sharedContainers']}")
    if counts['otherCandidateFiles']:parts.append(f"其他候選檔 {counts['otherCandidateFiles']}")
    return '；'.join(parts) if parts else '無可用候選檔'

def build_from_local_audits():
    files=[DATA/'sources-300-mba.json',DATA/'sources-community.json',DATA/'hero-design-coverage.json']
    inputs=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p)) for p in files]
    audits=[read(p) for p in files[:2]];coverage=read(files[2]);proof={r.get('heroId',r.get('id')):r for r in coverage['heroes']}
    locale_path=DATA/'localization-zh-TW.json'
    translations=read(locale_path) if locale_path.exists() else {}
    if locale_path.exists():inputs.append(dict(path=locale_path.relative_to(ROOT).as_posix(),sha256=sha(locale_path)))
    resource_path=DATA/'resource-coverage.json'
    resources=read(resource_path) if resource_path.exists() else {}
    voice_path=BASE/'voice-index.json'
    voice_groups={g['id']:g for g in read(voice_path)['groups']}
    source_path=BASE/'download-sources.json'
    public_sources={s['id']:s for s in read(source_path)['publicSources']}
    for p in [resource_path,voice_path,source_path]:
        if p.exists():inputs.append(dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p)))
    stale_inputs=[]
    for pin in coverage.get('inputFiles',[]):
        p=Path(pin['path']);p=p if p.is_absolute() else ROOT/p
        if not p.is_file() or sha(p)!=pin['sha256']:stale_inputs.append(pin['path'])
    if not coverage.get('inputFiles'):raise ValueError('Refresh hero-design-coverage with complete inputFiles before building the backlog.')
    if stale_inputs:raise ValueError('Refresh hero-design-coverage; changed inputs: '+', '.join(stale_inputs[:12]))
    supplemental=DATA/'sources-supplemental.json'
    if supplemental.exists():
        audits.append(read(supplemental));inputs.append(dict(path=supplemental.relative_to(ROOT).as_posix(),sha256=sha(supplemental)))
    forge_receipt_path=BASE/'priority-evidence/palworld-hero-integration/receipt.json'
    forge_proof={}
    if forge_receipt_path.exists():
        forge_receipt=read(forge_receipt_path)
        forge_proof={row['heroId']:row for row in forge_receipt.get('integrations',[])}
        inputs.append(dict(path=forge_receipt_path.relative_to(ROOT).as_posix(),sha256=sha(forge_receipt_path)))
    heroes={}
    for p in sorted((ROOT/'content/champions').glob('*.json')):
        if p.name.startswith('_'):continue
        hero=read(p);heroes[hero['id']]=hero;inputs.append(dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p)))
    inventory={r['runtimeHeroId']:r for r in read(BASE/'inventory.json')['heroes']}
    aliases=read(BASE/'workflow-model-options.json').get('aliases',{})
    # Existing audited aliases are explicit; same-name discoveries are suggestions only.
    rows=[];seen=set()
    all_raw=[row for audit in audits for row in audit['characters']]
    by_id={row['id']:row for row in all_raw}
    superseded=set()
    for row in all_raw:
        for old_id in row.get('supersedesAuditRows',[]):
            old=by_id.get(old_id)
            if old is None:continue
            # A supplemental audit can assign a more descriptive candidate ID to
            # the same immutable local file. The actual absolute path is the
            # preservation identity here; requiring a scanner-specific ID would
            # reject an unchanged source revision solely for a label change.
            old_candidates={str(Path(c['path']).resolve()) for c in old['modelCandidates']}
            new_candidates={str(Path(c['path']).resolve()) for c in row['modelCandidates']}
            if not old_candidates.issubset(new_candidates):raise ValueError('Supplemental review must preserve every candidate path of '+old_id)
            superseded.add(old_id)
    for audit in audits:
        for raw in audit['characters']:
            if raw['id'] in superseded:continue
            row=dict(raw);assert row['id'] not in seen,'Duplicate source identity: '+row['id'];seen.add(row['id'])
            candidates=[]
            for source in row['modelCandidates']:
                c=dict(source);p=Path(c['path']);p=p if p.is_absolute() else ROOT.parent/p
                c['absolutePath']=str(p.resolve());c['existsLocal']=p.is_file()
                c['localSizeMatches']=c['existsLocal'] and (c.get('bytes') is None or p.stat().st_size==c['bytes'])
                candidates.append(c)
            row['modelCandidates']=candidates
            if has_classified_roles(candidates):row['candidateBreakdown']=candidate_breakdown([c for c in candidates if c['localSizeMatches']])
            ids=sorted(set(aliases.get(i,i) for i in row.get('identityHeroIds',row.get('mappedHeroIds',[]))))
            row['mappedHeroIds']=ids
            checks=[]
            for hid in ids:
                if hid not in heroes:
                    if hid in forge_proof:
                        current=forge_proof[hid]
                        checks.append(dict(heroId=hid,name=current.get('name',hid),implemented=True,
                            mechanicsAuditStale=False,designComplete=None,missingRefs=[],
                            status='hero-forge-six-slot-package-verified',
                            availability='Hero Forge 成品及後台模型選項已通過本機驗證；正式站部署未驗證'))
                        continue
                    checks.append(dict(heroId=hid,name=hid,implemented=False,mechanicsAuditStale=False,designComplete=None,
                        missingRefs=['content/champions/'+hid+'.json'],status='mapped-id-without-current-definition',availability='目前無英雄檔案；來源索引曾登記此ID'))
                    continue
                current=heroes[hid];prior=proof.get(hid,{})
                champion=ROOT/'content/champions'/(hid+'.json')
                frozen=prior.get('championFile',{})
                stale=bool(frozen.get('sha256') and frozen['sha256']!=sha(champion))
                skill_rows=prior.get('skills',[])
                for skill in skill_rows:
                    if not skill.get('path'):continue
                    p=ROOT/skill['path']
                    if not p.is_file() or (skill.get('sha256') and sha(p)!=skill['sha256']):stale=True
                checks.append(dict(heroId=hid,name=current.get('name',hid),implemented=prior.get('implemented') if not stale else None,
                    mechanicsAuditStale=stale,designComplete=None,missingRefs=prior.get('missingRefs',[]),
                    status=prior.get('status','not-audited') if not stale else 'content-changed-requires-coverage-refresh',
                    availability=inventory.get(hid,{}).get('status','未核對上架狀態')))
            row['currentHeroChecks']=checks
            prior_status=row.get('designStatus','identity-review')
            if not any(c['localSizeMatches'] for c in candidates):status='source-unavailable'
            elif ids:
                status='designed' if all(c['implemented'] is True for c in checks) else 'definitions-incomplete'
            elif prior_status=='identity-review':status='identity-review'
            else:
                names={norm(row['name']),*(norm(a) for a in row.get('aliases',[]))};names.discard('')
                suggestions=[hid for hid,h in heroes.items() if norm(h.get('name','')) in names]
                row['suggestedHeroIds']=suggestions
                status='identity-review' if suggestions else 'not-defined'
            row['designStatus']=status
            row.update(labels_for(row, translations))
            row['resources']=resource_view(row, resources, voice_groups, public_sources)
            rows.append(row)
    # Source identities are not claimed to be unique fictional characters across libraries.
    counts={s:sum(r['designStatus']==s for r in rows) for s in ['not-defined','definitions-incomplete','identity-review','designed','source-unavailable']}
    result=dict(schema='ggd-acquired-model-design-backlog@1',sourceIdentityCount=len(rows),counts=counts,heroesInProject=len(heroes),
        heroForgeRecipesVerified=len(forge_proof),
        coverageSummary=coverage.get('summary',{}),availabilitySnapshot=coverage.get('availabilitySnapshot'),inputs=inputs,characters=rows,
        localization=dict(locale='zh-TW',identityUnchanged=True,
            pendingChineseNames=sum(r['nameTranslationBasis']=='pending-chinese-name' for r in rows),
            pendingChineseWorks=sum(r['workTranslationBasis']=='pending-chinese-title' for r in rows)),
        resourceCoverage=resources,
        boundaries=['Counts are source identities; forms and cross-library aliases remain explicit until reviewed.',
            'Mechanics present is not proof of faithful design, balance or gameplay acceptance.',
            'Unknown source identity is not a confirmed undesigned hero.','Local file size presence is not full model conversion acceptance.'])
    return result

def build(*, refresh_local_audits=False):
    """Build portably, or explicitly refresh the non-portable audit snapshot.

    The three large audit/cache files are deliberately not committed.  A clean
    checkout therefore retains non-Fate rows from the tracked generated JSON,
    while the Fate completion overlay is rebuilt from tracked source metadata
    and receipts on every invocation.
    """
    if refresh_local_audits:
        local_files=[DATA/'sources-300-mba.json',DATA/'sources-community.json',DATA/'resource-coverage.json']
        missing=[str(path) for path in local_files if not path.is_file()]
        if missing:
            raise ValueError('Local audit refresh requested with missing caches: '+', '.join(missing))
        base=build_from_local_audits()
    else:
        portable=BASE/(TITLE+'.json')
        if not portable.is_file():
            raise ValueError('Portable backlog base is missing and local audit caches are incomplete.')
        base=read(portable)
        if base.get('schema')!='ggd-acquired-model-design-backlog@1':
            raise ValueError('Portable backlog base schema drifted; refresh it with reviewed local audits.')
    return apply_mba_pilot_overlay(apply_fateubw_overlay(base, ROOT), ROOT)

def friendly_stage(value):
    value=str(value or 'unknown')
    if value=='accepted-independent-static-skinned-component-actions-missing':return '靜態蒙皮元件已驗收；動作、英雄綁定與後台切換仍缺'
    if value=='accepted-independent-procedural-six-state-fallback-not-hero-bound':return '程序化六態元件已驗收；非原生動作，英雄綁定與後台切換仍缺'
    if value=='native-body-identity-unreviewed':return '原生模型；外觀身份待核'
    if 'backend-standardized-option' in value:return '已登記後台選項；程序化動作另標'
    if 'shared-upload-and-runtime-motion' in value:return '已通過匯入與動作檢查'
    if 'historical-staging-path' in value:return '歷史暫存 GLB；凍結版本另留'
    if 'native-motion-khronos-webgl-phase-validated' in value:return '原生動作 GLB 已通過結構與分段 WebGL 驗證；待權利、曲線、事件映射與後台驗收'
    if 'static-mesh-khronos-webgl-validated' in value:return '靜態 GLB 已通過 Khronos 與 WebGL 驗證；待權利、骨架動作與後台驗收'
    if 'appearance-review' in value:return 'GLB 候選；外觀待驗'
    if 'visual' in value or 'review-sample' in value:return '已有轉換樣本；外觀／動作待驗'
    if 'standard' in value and ('candidate' in value or 'option' in value):return '標準化候選；待選用驗收'
    if 'glb' in value.lower():return 'GLB 候選；待選用驗收'
    return '原始素材已取得；待轉換驗收'

def render(data):
    n=data['counts'];lines=['# '+TITLE,'',
        '固定共編入口：`materials/hero-model-library/'+TITLE+'.md`。完整候選、來源及判定證據見同名 JSON；完整模型盤點見 [全角色模型盤點.md](全角色模型盤點.md)。','',
        '**用途：列出已取得模型、尚待建立英雄設計或實作的候選。人物與作品名稱以中文優先，括號保留原文供查找。** 模型是否已轉換、英雄是否有技能、是否上架分開記錄；不把已有英雄重新標成未設計。未知身份與缺少本機檔案另列，不混入確定待設計。','',
        f"本次逐庫來源身份記錄：尚未建立英雄 **{n['not-defined']}** 筆；已有定義但需補查／實作 **{n['definitions-incomplete']}** 筆；身份待確認 **{n['identity-review']}** 筆。另有 {n['designed']} 筆已對應有機制資料的英雄、{n['source-unavailable']} 筆無可核對本機模型，不列入可用待辦。跨庫同角色及形態未經核准合併前，這些數字不是去重後的新英雄總數。",'',
        f"目前專案有 {data['heroesInProject']} 份靜態英雄定義，另有 {data.get('heroForgeRecipesVerified',0)} 份已驗證 Hero Forge 配方被納入本索引的設計核對。技能檔存在與機制可解析，不等於平衡、實戰或正式站驗收完成；上架狀態只採盤點內既有快照，並非即時正式站檢查。",'',
        '## 維護方式','',
        '1. 新取得模型先歸檔，更新本機 `design-backlog/sources-300-mba.json`、`sources-community.json` 或 Git 內的精簡補充來源；每個角色保留全部來源／版本與實際檔案證據。大型解析 JSON 留在本機並備份到 S3 `legacy/`。','2. 建立或修改英雄後更新本機 `design-backlog/hero-design-coverage.json` 的技能核對；來源身份以明確角色／作品與映射確認，借用模型不算原角色已實作。','3. Git 追蹤收據的一般重建執行 `python3 tools/hero-model-library/build_model_design_backlog.py --workspace ..`，再執行同指令加 `--check`。只有在三個本機大型快取都已更新與核對時，才以 `--refresh-local-audits` 刷新非 Fate 基底。Git 提交同名固定索引、產生器與精簡驗證收據，另將大型輸入與前版快照備份到 S3。不要只手改這份產物。','4. 所有原始、半成品、轉換檔及轉換程式都有 S3 備份；Git 保留成品、程式與索引的共編版本，本機全保留。','']
    lines+=source_overview(data['resourceCoverage'])
    labels=[('not-defined','尚未建立對應英雄'),('definitions-incomplete','已有定義，需補查或實作'),('identity-review','來源身份／英雄對應待確認'),('designed','已有英雄設計：全部來源版本仍保留')]
    for status,label in labels:
        selected=[r for r in data['characters'] if r['designStatus']==status]
        lines+=['## '+label,'']
        if not selected:lines+=['目前沒有符合此分類的來源記錄。',''];continue
        lines+=['| 角色 | 作品 | 已取得來源／模型 | 動作／特效／音效／語音 | 轉換狀態 | 英雄定義／判定 | 本機位置 |','|---|---|---|---|---|---|---|']
        for r in sorted(selected,key=lambda x:(x.get('workZh') or '',x.get('nameZh') or '',x['id'])):
            cs=[c for c in r['modelCandidates'] if c['localSizeMatches']]
            libs=sorted({{'300heroes':'300英雄','mba':'MBA','community':'社群／MOD／遊戲來源','ou99':'OU99 論壇'}.get(c.get('library'),c.get('library','來源見JSON')) for c in cs});states=sorted({friendly_stage(c.get('readiness','待核')) for c in cs})
            if r['resources']['sourceLabels']:libs=r['resources']['sourceLabels']
            links=[]
            ordered=sorted(cs,key=lambda c:({'body':0,'component':1,'shared-container':2,'other':3}[candidate_role(c)],c['absolutePath'])) if has_classified_roles(cs) else cs
            for c in ordered[:2]:links.append(f"[{text(Path(c['absolutePath']).name)}](<{c['absolutePath']}>)")
            if len(cs)>2:links.append(f"另 {len(cs)-2} 份見同名 JSON：`{text(r['id'])}`")
            checks=r.get('currentHeroChecks',[])
            evidence='；'.join(hero_check_label(c) for c in checks) if checks else ('未建立對應英雄；保留來源原生 ID' if status=='not-defined' else '身份或同名對應尚未確認，暫不列為確定新英雄')
            lines.append('| '+' | '.join([text(r['displayName']),text(r['displayWork']),text('／'.join(libs)+' · '+candidate_summary(cs)),resource_cell(r['resources']),text('／'.join(states)),text(evidence),'<br>'.join(links)])+' |')
        lines+=['']
    lines+=audio_reserve_section(data['resourceCoverage'])
    lines+=['## 完整性與限制','',
        '中文名稱對照維護於 `design-backlog/localization-zh-TW.json`。原始名稱、作品、來源 ID 與模型路徑仍保留在同名 JSON；中文翻譯不會把身份待確認或道具模型改判為已確認角色。尚無可靠名稱時明列待確認，不猜測正式譯名。','',
        '完整來源候選、已設計角色對應、未取得／缺檔排除項及每筆證據保存在同名 JSON 與 `design-backlog/`。沒有模型本體、只有貼圖／圖示／音訊／技能特效的包不應計入待設計英雄。','',
        '原始來源位於 S3 `legacy/` 時只作人工指定用途；取得素材不代表已完成後台模型選項。待選用時再標準化、配骨架與動作、驗收，加入獨立選項，保留所有原版本。','']
    return ('\n'.join(lines)).encode()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--workspace',type=Path);p.add_argument('--refresh-local-audits',action='store_true',help='explicitly rebuild all rows from the three local-only audit caches before applying tracked overlays');a=p.parse_args()
    result=build(refresh_local_audits=a.refresh_local_audits);products={BASE/(TITLE+'.json'):encoded(result),BASE/(TITLE+'.md'):render(result)}
    if a.check:
        stale=[str(p) for p,b in products.items() if not p.exists() or p.read_bytes()!=b]
        if stale:raise SystemExit('STALE DESIGN BACKLOG: '+', '.join(stale))
    else:
        for p,b in products.items():p.write_bytes(b)
        if a.workspace:
            ws=a.workspace.resolve()
            for parent in [ws,ws/'GGD-Asset-Library']:
                if parent.is_dir():(parent/(TITLE+'.md')).write_bytes(products[BASE/(TITLE+'.md')])
    print(json.dumps(dict(check=a.check,sourceIdentities=result['sourceIdentityCount'],**result['counts']),ensure_ascii=False))
if __name__=='__main__':main()

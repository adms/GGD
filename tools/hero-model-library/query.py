#!/usr/bin/env python3
"""Query the Git inventory. No S3 access, local asset library, or binary downloads required."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from source_links import acquired_sources

REPO = Path(__file__).resolve().parents[2]

def public_match_scope(sources, query):
    hero_ids, entry_ids = set(), set()
    for source in sources:
        characters = [c for c in source.get('characters',[]) if query in json.dumps(c,ensure_ascii=False).casefold()]
        matches = characters or ([source] if query in json.dumps(source,ensure_ascii=False).casefold() else [])
        for match in matches:
            hero_ids.update(match['heroIds'])
            entry_ids.update(match.get('ownerEntryIds',[]))
    return hero_ids, entry_ids

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query', nargs='?', default='')
    parser.add_argument('--json', action='store_true', help='Return machine-readable records.')
    parser.add_argument('--downloads', action='store_true', help='Search the owner download plan instead of hero models.')
    args = parser.parse_args()
    check = subprocess.run([sys.executable, str(Path(__file__).with_name('inventory.py')), '--check'], capture_output=True, text=True)
    if check.returncode:
        raise SystemExit(check.stderr.strip() or check.stdout.strip())
    data = json.loads((REPO/'materials/hero-model-library/inventory.json').read_text())
    query = args.query.casefold()
    if args.downloads:
        direct = [e for e in data['downloadPlan']['entries'] if not query or query in json.dumps(e, ensure_ascii=False).casefold()]
        hero_ids, entry_ids = public_match_scope(acquired_sources(data['downloadPlan']) + data['downloadPlan'].get('publicSourceLeads',[]),query)
        records = direct or [e for e in data['downloadPlan']['entries'] if e['id'] in entry_ids or hero_ids.intersection(e['heroIds'])]
        # Keep deliveries outside the owner's original download list visible too.
        source_ids={sid for e in records for sid in e.get('acquiredSourceIds',[])}
        deliveries=[s for s in acquired_sources(data['downloadPlan'])
            if s['id'] in source_ids or not query or query in json.dumps(s,ensure_ascii=False).casefold()]
        delivery_ids={s['id'] for s in deliveries}
        if args.json:
            lead_ids={sid for e in records for sid in e.get('publicSourceLeadIds',[])}
            print(json.dumps({'release':data['release'], 'purchasePolicy':data['downloadPlan'].get('purchasePolicy',{}), 'ingestionPolicy':data['downloadPlan'].get('ingestionPolicy',{}), 'entries':records,
                'publicSourceLeads':[s for s in data['downloadPlan'].get('publicSourceLeads',[]) if s['id'] in lead_ids],
                'paidSources':[s for s in data['downloadPlan'].get('paidSources',[]) if s['id'] in delivery_ids],
                'publicSources':[s for s in data['downloadPlan'].get('publicSources',[]) if s['id'] in delivery_ids]}, ensure_ascii=False, indent=2))
        else:
            if data['downloadPlan'].get('purchasePolicy',{}).get('paidPurchaseAllowed') is False:
                print('本工作流不執行付費購買；不取消使用者另行授權的論壇下載工作流。')
            labels = {'defer-acquired-public':'來源已取得，先核對避免重買','defer-approved-derivative':'已有核准加工副本，暫緩付費下載','defer-existing-300':'已有 300，暫緩付費下載','owner-highest':'優先下載','needs-roster-mapping':'待對應角色 ID'}
            for e in records:
                print(f"{e['target']} | {labels[e['downloadPriority']]} | {', '.join(e['heroIds']) or '未對應'}")
                if e.get('purchaseHoldWithoutHeroId'):
                    print('  來源已取得，先核對避免重買：清單組 '+e['id']+'；尚待 GGD 角色 ID 對應')
                if e.get('purchaseHoldFor'):
                    print('  來源已取得，先核對避免重買：'+', '.join(e['purchaseHoldFor'])+'；先完成轉換／動作驗收')
                    if e.get('partialPurchaseHold'):
                        print('  其他形態尚未取得，保留原下載安排：'+', '.join(i for i in e['heroIds'] if i not in e['purchaseHoldFor']))
                if e.get('purchaseHold') or e.get('partialPurchaseHold'):
                    for s in acquired_sources(data['downloadPlan']):
                        if s['id'] in e['acquiredSourceIds']: print('    '+s['url']+' | '+s['verification'])
                for s in e['sources']: print('  '+s['submittedUrl'])
                for s in data['downloadPlan'].get('publicSourceLeads',[]):
                    if s['id'] in e.get('publicSourceLeadIds',[]):print('  來源線索（未取得）：'+s['url']+' | '+s['verification'])
                for note in e['ownerNotes']: print('  指定處理：'+note)
            for source in deliveries:
                if source['id'] not in source_ids:
                    print(source['id']+' | '+source['target']+' | 已取得來源，保留整合')
                    print('  '+source['url']+' | '+source['verification'])
        return 0 if records or deliveries else 1
    exact = [h for h in data['heroes'] if h['id'].casefold() == query]
    direct = [h for h in data['heroes'] if not query or query in json.dumps([h['id'],h['name'],h['work'],h['options']],ensure_ascii=False).casefold()]
    hero_ids, _ = public_match_scope(acquired_sources(data['downloadPlan']),query)
    records = exact or direct or [h for h in data['heroes'] if h['id'] in hero_ids]
    if args.json:
        print(json.dumps({'release':data['release'],'productionSnapshot':data['productionSnapshot'],'heroes':records},ensure_ascii=False,indent=2))
        return 0 if records else 1
    if not query:
        for h in records:print(f"{h['id']} | {h['name']} | {(h['default'] or {}).get('name','待轉換')} | 候選 {len(h['options'])}")
        return 0
    for h in records:
        default = h['default']
        print(f"\n{h['name']} [{h['id']}] — {h['work']}")
        print('  素材庫預設（'+h['defaultSelectionMode']+'）：'+(default['name']+'／'+default['tier'] if default else '尚無已核准預設'))
        choice=h['checkoutSelection'];current=h['current']
        print('  本分支實際選擇：'+(str(choice['modelKey'])+'（'+choice['mode']+'）' if choice else '尚無角色定義'))
        print('  正式機觀測快照：'+data['productionSnapshot']['observedAt']+'；'+(current['name'] if current else '當時未上架'))
        for i,option in enumerate(h['options'],1):
            print(f"  候選 {i}：{option['name']} | {option['tier']} | {option['work']} | {option['kind']} | {'可作預設' if option['defaultEligible'] else '未核准預設'}")
            asset=option['asset'];print('    modelKey: '+asset['modelKey'])
            if asset.get('gitPath'): print('    Git: '+asset['gitPath'])
            if asset.get('s3Uri'):
                print('    S3 副本: '+asset['s3Uri']);print('    SHA-256: '+asset['sha256'])
            else:print('    位置：專案既有模型，未列入此 S3 成品版本')
        for p in h['pending']: print('  待轉換：'+p['name'])
        for s in h.get('publicCandidates',[]) + h.get('paidCandidates',[]):
            print('  已取得來源（全部保留整合）：'+s['target']+' | '+s['url'])
            print('    '+s['verification'])
            if s.get('backendIntegration',{}).get('required'):
                print('    必須納入後台獨立選項；目前狀態：'+s['backendIntegration']['state'])
        if h['downloadSources']: print('  指定下載來源：'+', '.join(h['downloadSources'])+'；用 --downloads '+h['id']+' 查詢')
    return 0 if records else 1

if __name__ == '__main__':
    raise SystemExit(main())

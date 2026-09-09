#!/usr/bin/env python3
"""Query the Git inventory. No S3 access, local asset library, or binary downloads required."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

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
        records = [e for e in data['downloadPlan']['entries'] if not query or query in json.dumps(e, ensure_ascii=False).casefold()]
        if args.json:
            print(json.dumps({'release':data['release'], 'entries':records}, ensure_ascii=False, indent=2))
        else:
            labels = {'defer-approved-derivative':'已有核准加工副本，暫緩付費下載','defer-existing-300':'已有 300，暫緩付費下載','owner-highest':'優先下載','needs-roster-mapping':'待對應角色 ID'}
            for e in records:
                print(f"{e['target']} | {labels[e['downloadPriority']]} | {', '.join(e['heroIds']) or '未對應'}")
                for s in e['sources']: print('  '+s['submittedUrl'])
                for note in e['ownerNotes']: print('  指定處理：'+note)
        return 0 if records else 1
    exact = [h for h in data['heroes'] if h['id'].casefold() == query]
    records = exact or [h for h in data['heroes'] if not query or query in json.dumps([h['id'],h['name'],h['work'],h['options']],ensure_ascii=False).casefold()]
    if args.json:
        print(json.dumps({'release':data['release'],'productionSnapshot':data['productionSnapshot'],'heroes':records},ensure_ascii=False,indent=2))
        return 0 if records else 1
    if not query:
        for h in records:print(f"{h['id']} | {h['name']} | {(h['default'] or {}).get('name','待轉換')} | 候選 {len(h['options'])}")
        return 0
    for h in records:
        default = h['default']
        print(f"\n{h['name']} [{h['id']}] — {h['work']}")
        print('  素材庫預設：'+(default['name']+'／'+default['tier'] if default else '尚無已核准預設'))
        choice=h['checkoutSelection'];current=h['current']
        print('  本分支實際選擇：'+(str(choice['modelKey'])+'（'+choice['mode']+'）' if choice else '尚無角色定義'))
        print('  正式機觀測快照：'+data['productionSnapshot']['observedAt']+'；'+(current['name'] if current else '當時未上架'))
        for i,option in enumerate(h['options'],1):
            print(f"  候選 {i}：{option['name']} | {option['tier']} | {option['work']} | {option['kind']} | {'可作預設' if option['defaultEligible'] else '未核准預設'}")
            asset=option['asset'];print('    modelKey: '+asset['modelKey'])
            if asset.get('s3Uri'):
                print('    S3: '+asset['s3Uri']);print('    SHA-256: '+asset['sha256'])
            else:print('    位置：專案既有模型，未列入此 S3 成品版本')
        for p in h['pending']: print('  待轉換：'+p['name'])
        if h['downloadSources']: print('  指定下載來源：'+', '.join(h['downloadSources'])+'；用 --downloads '+h['id']+' 查詢')
    return 0 if records else 1

if __name__ == '__main__':
    raise SystemExit(main())

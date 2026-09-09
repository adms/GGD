"""Render owner-prioritized download sources without promoting them to ready assets."""
from copy import deepcopy
from default_policy import eligible


def plan_sources(data, manifest, policy):
    """Derive download priority from the current approved manifest, not old intake flags."""
    data = deepcopy(data)
    heroes = {h['id']: h for h in manifest['heroes']}
    for entry in data['entries']:
        available = []
        for hero_id in entry['heroIds']:
            ids = [o['sourceId'] for o in heroes.get(hero_id, {}).get('options', []) if o['source']['tier'] == '300heroes' and eligible(policy,hero_id,o['sourceId'],o['sourceModelKey'],o['source']['kind'])]
            if ids:
                available.append({'heroId': hero_id, 'sourceIds': ids})
        entry['available300'] = available
        entry['approvedDerivatives'] = [a['sourceId'] for a in policy['approvedDerivatives'] if a['heroId'] in entry['heroIds']]
        entry['needsDownloadFor'] = [i for i in entry['heroIds'] if i not in {a['heroId'] for a in available}]
        entry['downloadPriority'] = ('defer-approved-derivative' if entry['approvedDerivatives'] else 'defer-existing-300' if entry['heroIds'] and not entry['needsDownloadFor'] else
                                     'owner-highest' if entry['heroIds'] else 'needs-roster-mapping')
    return data

def render_sources(data):
    sources = {s['id']: s for s in data['sources']}
    entries = data['entries']
    count = sum(len(e['sources']) for e in entries)
    lines = [
        '## 指定下載來源與購買順位', '',
        '**已有可用 300英雄模型 → 預設使用 300英雄，付費來源暫緩；指定的 11 個核准加工副本也可預設。缺可用 300英雄模型 → 下列使用者來源為最高優先下載。**', '',
        f'清單共有 {len(entries)} 組角色／形態、{count} 個原始網址；去除同帖不同頁後為 {len(sources)} 個資源帖。', '',
        f'這 {len(entries)} 組來源中：**{sum(e["downloadPriority"] == "defer-existing-300" for e in entries)} 組已有 300、暫緩付費下載；{sum(e["downloadPriority"] == "owner-highest" for e in entries)} 組優先下載；{sum(e["downloadPriority"] == "needs-roster-mapping" for e in entries)} 組待對應角色 ID。** 數量按來源組計算，巴恩兩種形態各佔一組。', '',
        f'「待整合」{sum(e["category"] == "primary" for e in entries)} 組與「加購替換」{sum(e["category"] == "optional" for e in entries)} 組保留原分類；實際下載順位依上面的 300 優先規則。未取得並驗證的模型不會直接取代遊戲預設。', '',
        '來源狀態與後續共編欄位：[download-sources.json](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/download-sources.json)。網站登入、回覆或付費要求須逐帖核對；目前沒有因本清單而新增已下載／已轉換宣告。', '',
    ]
    for category, title in [('primary', '待整合來源'), ('optional', '加購替換選項')]:
        lines += [f'### {title}', '', '| 對應角色 | 下載來源頁 | 使用者指定處理 | 對應與下載狀態 |', '|---|---|---|---|']
        for entry in (e for e in entries if e['category'] == category):
            links = '、'.join(f'[{i}／{s["sourceId"].split(":")[-1]}]({s["submittedUrl"]})' for i, s in enumerate(entry['sources'], 1))
            notes = '；'.join(entry['ownerNotes']) or '按清單角色核對模型'
            ids = '、'.join(f'`{i}`' for i in entry['heroIds']) or '**現有盤點尚待對應 ID**'
            priority = entry['downloadPriority']
            state = '**核准加工副本，暫緩付費**' if priority == 'defer-approved-derivative' else '**已有 300，暫緩付費下載**' if priority == 'defer-existing-300' else '**優先下載**；網址未核' if priority == 'owner-highest' else '先對應角色 ID'
            if any(sources[s['sourceId']]['accessStatus'] == 'reply-required' for s in entry['sources']):
                state += '；頁面要求回覆解鎖，模型身分待核'
            if entry.get('mappingNote'): notes += '；' + entry['mappingNote']
            lines.append(f'| {entry["target"]} | {links} | {notes} | {ids}<br>{state} |')
        lines.append('')
    lines += ['同一資源帖只下載一次；不同外觀仍各自保留候選。拳四郎的變身維持放大皮卡丘；岩谷尚文移除刀劍；阿箱＋拉蜜絲加背後白色矩形販賣機；凱亞爾改綠斗篷與黃髮；幸運超人胸口補「大吉」；蒼月潮指定選項改黑髮與藍褲。', '']
    return lines

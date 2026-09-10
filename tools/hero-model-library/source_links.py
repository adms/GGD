"""Render owner-prioritized download sources without promoting them to ready assets."""
from copy import deepcopy
from default_policy import eligible


def plan_sources(data, manifest, policy):
    """Derive download priority from the current approved manifest, not old intake flags."""
    data = deepcopy(data)
    heroes = {h['id']: h for h in manifest['heroes']}
    for entry in data['entries']:
        entry['paidPurchaseAllowed'] = data.get('purchasePolicy', {}).get('paidPurchaseAllowed', False)
        entry['publicSourceLeadIds'] = [s['id'] for s in data.get('publicSourceLeads', [])
            if set(s['heroIds']) & set(entry['heroIds']) or entry['id'] in s.get('ownerEntryIds', [])]
        acquired = [s for s in data.get('publicSources', [])
            if (set(s['heroIds']) & set(entry['heroIds']) or entry['id'] in s.get('ownerEntryIds',[])) and s['acquisitionStatus'] == 'downloaded-verified']
        entry['acquiredPublicSources'] = [s['id'] for s in acquired]
        held_ids = {i for s in acquired if s.get('purchaseDecision') == 'hold-purchase-review-free-source' for i in s['heroIds']}
        entry['purchaseHoldFor'] = [i for i in entry['heroIds'] if i in held_ids]
        entry['purchaseHoldWithoutHeroId'] = not entry['heroIds'] and any(entry['id'] in s.get('ownerEntryIds',[]) and s.get('purchaseDecision') == 'hold-purchase-review-free-source' for s in acquired)
        entry['purchaseHold'] = entry['purchaseHoldWithoutHeroId'] or bool(entry['heroIds']) and all(i in held_ids for i in entry['heroIds'])
        entry['partialPurchaseHold'] = bool(entry['purchaseHoldFor']) and not entry['purchaseHold']
        available = []
        for hero_id in entry['heroIds']:
            ids = [o['sourceId'] for o in heroes.get(hero_id, {}).get('options', []) if o['source']['tier'] == '300heroes' and eligible(policy,hero_id,o['sourceId'],o['sourceModelKey'],o['source']['kind'])]
            if ids:
                available.append({'heroId': hero_id, 'sourceIds': ids})
        entry['available300'] = available
        entry['approvedDerivatives'] = [a['sourceId'] for a in policy['approvedDerivatives'] if a['heroId'] in entry['heroIds']]
        entry['needsDownloadFor'] = [i for i in entry['heroIds'] if i not in {a['heroId'] for a in available}]
        entry['downloadPriority'] = ('defer-approved-derivative' if entry['approvedDerivatives'] else 'defer-existing-300' if entry['heroIds'] and not entry['needsDownloadFor'] else
                                     'defer-acquired-public' if entry['purchaseHold'] else
                                     'owner-highest' if entry['heroIds'] else 'needs-roster-mapping')
    return data

def render_sources(data):
    sources = {s['id']: s for s in data['sources']}
    entries = data['entries']
    count = sum(len(e['sources']) for e in entries)
    public = data.get('publicSources', [])
    lines = []
    if data.get('purchasePolicy', {}).get('paidPurchaseAllowed') is False:
        lines += ['## 購買暫緩：其他工作流先讀', '',
            '**本輪清單的付費模型購買全部暫緩，先查找並處理免費公開來源。**「優先下載」是來源查找順位，不是付款授權；需要購買時，另由使用者明確同意。', '',
            '程序先讀 `download-sources.json → purchasePolicy.paidPurchaseAllowed=false`；逐角色下載查詢也回傳 `paidPurchaseAllowed=false`。`purchaseHoldFor` 只記已取得免費檔的角色／形態，不能把尚未取得的線索當成模型已到手。', '']
    if public:
        lines += ['## 已取得免費來源：先暫緩購買', '',
            '**以下角色已取得免費來源的實際檔案，其他工作流先不要重複付費購買。** 這是購買暫緩記錄，並非全部已完成標準化或可直接作預設。沿用 300 優先與 11 組核准加工副本規則。', '',
            '免費檔取得範圍只涵蓋表內明列的角色 ID／形態。同名的其他形態仍須各自核對；機器讀 `purchaseHoldFor`，不可只按角色名稱略過整組查找。整批付費暫緩另由上方 `purchasePolicy` 決定。', '',
            '| 角色／資源 | 已下載來源與署名 | 目前驗證結果 | 檔案保存狀態 | 購買安排 |', '|---|---|---|---|---|']
        for s in public:
            decision = '**暫緩購買，先處理已取得免費檔**' if s['heroIds'] or s.get('ownerEntryIds') else '地圖素材池；尚未認列角色'
            ids = '<br>' + '、'.join(f'`{i}`' for i in s['heroIds']) if s['heroIds'] else ''
            if s.get('ownerEntryIds'): ids += '<br>未對應角色 ID 的清單組：' + '、'.join(f'`{i}`' for i in s['ownerEntryIds'])
            storage = ('本機已保存；S3 legacy 備份已讀回驗證' if s.get('backup', {}).get('readbackVerified') is True else
                       '**僅本機已保存，S3 尚未上傳**' if s.get('pendingBackup', {}).get('status') == 'not-uploaded' else
                       '本機已保存；S3 備份狀態未確認')
            lines.append(f'| {s["target"]}{ids} | [{s["id"]}]({s["url"]})<br>{s["uploader"]}；{s["format"]} | {s["verification"]} | {storage} | {decision} |')
        lines += ['', '逐檔大小、SHA-256、本機與 S3 位置記於 `download-sources.json → publicSources`。`pendingBackup.plannedS3Uri` 只是預定上傳位置，不能當成已存在的 S3 檔案；已上傳以 `backup.readbackVerified=true` 為準。`readiness` 尚未通過的來源只供人工處理，不進入成品自動取用；來源使用條件另行保留，不把免費下載當成已確認可再散布。', '']
    if data.get('publicSourceLeads'):
        lines += ['## 已找到來源頁，尚未取得檔案', '',
            '以下來源尚未取得模型檔，不計入已下載數量，也不加入可用候選；同一角色可能已從上方其他來源取得模型。', '',
            '| 角色 | 公開來源頁 | 查核狀態 | 購買安排 |', '|---|---|---|---|']
        for s in data['publicSourceLeads']:
            ids = '、'.join(f'`{i}`' for i in s['heroIds'] + s.get('ownerEntryIds', []))
            lines.append(f'| {s["target"]}<br>{ids} | [{s["id"]}]({s["url"]}) | {s["verification"]} | **暫緩購買，繼續查找公開檔案** |')
        lines.append('')
    lines += [
        '## 指定下載來源與購買順位', '',
        '**已有可用 300英雄模型 → 預設使用 300英雄，付費來源暫緩；指定的 11 個核准加工副本也可預設。缺可用 300英雄模型 → 下列使用者來源為最高優先下載。**', '',
        f'清單共有 {len(entries)} 組角色／形態、{count} 個原始網址；去除同帖不同頁後為 {len(sources)} 個資源帖。', '',
        f'這 {len(entries)} 組來源中：**{sum(e["downloadPriority"] == "defer-existing-300" for e in entries)} 組已有 300、暫緩付費下載；{sum(e["downloadPriority"] == "defer-acquired-public" for e in entries)} 組免費來源已取得、暫緩購買；{sum(e["downloadPriority"] == "owner-highest" for e in entries)} 組優先下載；{sum(e["downloadPriority"] == "needs-roster-mapping" for e in entries)} 組待對應角色 ID。** 數量按來源組計算，巴恩兩種形態各佔一組。', '',
        f'其中 **{sum(e["partialPurchaseHold"] for e in entries)} 組只有部分形態取得免費來源**：`purchaseHoldFor` 所列 ID 已取得，其他形態仍待查找；不能因整批付費暫緩就省略未取得形態。', '',
        f'「待整合」{sum(e["category"] == "primary" for e in entries)} 組與「加購替換」{sum(e["category"] == "optional" for e in entries)} 組保留原分類；實際下載順位依上面的 300 優先規則。未取得並驗證的模型不會直接取代遊戲預設。', '',
        '來源狀態與後續共編欄位：[download-sources.json](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/download-sources.json)。網站登入、回覆或付費要求須逐帖核對；上方免費來源與原清單資源帖分開記錄，取得替代來源不代表已下載原帖附件。', '',
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
            if entry.get('purchaseHold'):
                state = '**免費來源已取得，暫緩購買**；' + '、'.join(entry['acquiredPublicSources']) + '；待完成標準化'
                if entry['purchaseHoldWithoutHeroId']:state += '；尚待 GGD 角色 ID 對應，保留購買暫緩'
            elif entry.get('partialPurchaseHold'):
                held = '、'.join(f'`{i}`' for i in entry['purchaseHoldFor'])
                remaining = '、'.join(f'`{i}`' for i in entry['heroIds'] if i not in entry['purchaseHoldFor'])
                state = f'**部分形態免費來源已取得**；{held} 暫緩購買；{remaining} 未取得、保留原下載安排；' + '、'.join(entry['acquiredPublicSources'])
            if entry.get('mappingNote'): notes += '；' + entry['mappingNote']
            if entry.get('publicSourceLeadIds'):
                state += '；**其他來源線索，尚未取得模型**：' + '、'.join(entry['publicSourceLeadIds'])
            lines.append(f'| {entry["target"]} | {links} | {notes} | {ids}<br>{state} |')
        lines.append('')
    lines += ['同一資源帖只下載一次；不同外觀仍各自保留候選。拳四郎的變身維持放大皮卡丘；岩谷尚文移除刀劍；阿箱＋拉蜜絲加背後白色矩形販賣機；凱亞爾改綠斗篷與黃髮；幸運超人胸口補「大吉」；蒼月潮指定選項改黑髮與藍褲。', '']
    return lines

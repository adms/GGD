"""Render owner-prioritized download sources without promoting them to ready assets."""
from copy import deepcopy
from default_policy import eligible

def acquired_sources(data):
    """Keep paid and public acquisitions in one integration path without renaming sources."""
    return data.get('publicSources', []) + data.get('paidSources', [])


def plan_sources(data, manifest, policy):
    """Derive download priority from the current approved manifest, not old intake flags."""
    data = deepcopy(data)
    heroes = {h['id']: h for h in manifest['heroes']}
    if data.get('ingestionPolicy', {}).get('requireIndependentBackendOptions'):
        for source in acquired_sources(data):
            integration = source.get('backendIntegration', {})
            assert integration.get('required') is True, source['id'] + ': missing required backend integration tracking'
            assert integration.get('state') and 'selectionVerified' in integration, source['id'] + ': missing backend integration state'
    ids = [s['id'] for s in acquired_sources(data)]
    assert len(ids) == len(set(ids)), 'Acquired source IDs must be unique across public and paid collections'
    for entry in data['entries']:
        entry['paidPurchaseAllowed'] = data.get('purchasePolicy', {}).get('paidPurchaseAllowed', False)
        entry['publicSourceLeadIds'] = [s['id'] for s in data.get('publicSourceLeads', [])
            if set(s['heroIds']) & set(entry['heroIds']) or entry['id'] in s.get('ownerEntryIds', [])]
        acquired = [s for s in acquired_sources(data)
            if (set(s['heroIds']) & set(entry['heroIds']) or entry['id'] in s.get('ownerEntryIds',[])) and s['acquisitionStatus'] == 'downloaded-verified']
        entry['acquiredPublicSources'] = [s['id'] for s in acquired if s in data.get('publicSources', [])]
        entry['acquiredPaidSources'] = [s['id'] for s in acquired if s in data.get('paidSources', [])]
        entry['acquiredSourceIds'] = [s['id'] for s in acquired]
        held_sources = [s for s in acquired if s.get('purchaseDecision') in {'hold-purchase-review-free-source', 'hold-purchase-review-acquired-source'} or s in data.get('paidSources', [])]
        held_ids = {i for s in held_sources for i in s['heroIds']}
        entry['purchaseHoldFor'] = [i for i in entry['heroIds'] if i in held_ids]
        entry['purchaseHoldWithoutHeroId'] = not entry['heroIds'] and any(entry['id'] in s.get('ownerEntryIds',[]) for s in held_sources)
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

def render_sources(data, policy):
    sources = {s['id']: s for s in data['sources']}
    entries = data['entries']
    count = sum(len(e['sources']) for e in entries)
    public = acquired_sources(data)
    lines = ['## 第一守則：所有取得資源完整歸檔，全部納入後台可選選項', '',
        '**所有工作流取得的模型、貼圖、骨架、動作、特效、音效與角色語音，包含免費來源與另一工作流從論壇付費取得的資源，都必須完整保存、登記角色與來源，完成標準化後成為對應角色後台下拉選單的獨立選項。不同來源與版本全部保留，不因已有本尊、已有較高順位模型、未選為預設、付費或免費、或不是本工作流找到，就省略、覆蓋或丟棄。**', '',
        '每筆依序完成：取得實檔 → 原始包與完整解包檔歸檔 → 角色／形態及來源 ID 對應 → 模型、貼圖、動作綁定與特效／音效／語音轉換 → 成品入庫 → 後台選項註冊與實際切換驗證 → 同批更新本盤點及 Git／S3 索引。尚未完成的步驟必須列為待辦；只有網址、只有備份、只有候選登記，都不能算完成上架。', '',
        '**語音也必須一起抓取。** 查找獨立音檔及包內音效庫，保留原始容器、全部音訊與不同語言／版本，轉換版另存並記錄角色、來源、原檔與轉換檔 SHA-256。對白、喊聲、音效與音樂分開分類；未聽審或事件對應未核實者標為待分類，不把音檔總數當成已確認語音數。已取得、已轉換、待角色／技能綁定與後台驗收分別記錄；包內沒有獨立音檔不等於沒有內嵌語音。', '',
        '原始與半成品存 S3 `legacy/`、本機留副本；標準化成品一律進 Git 固定成品庫。程式、角色設定、版本清單、SHA-256 與文件也進 Git。來源包內缺少的動作、特效、音效或語音要明列缺口並持續補齊，不能據此遺漏已取得的其他素材。', '',
        '預設依下方第二守則；**預設順位只決定預選哪個，不能拿來刪減可選來源。** 平行工作流使用相同角色 ID、獨立來源 ID 與逐檔 SHA-256 共編，合併來源後重建盤點，保留其他工作流登記。', '',
        '機器規則：`download-sources.json → ingestionPolicy`。免費來源放 `publicSources`，論壇付費交付放 `paidSources`，兩者走同一角色候選與整合流程；逐筆 `backendIntegration.required=true`，待完成轉換與後台切換驗證才可改為完成。目前實際上架狀態必須另有成品版本與驗證收據。', '']
    lines += ['## 第二守則：預設模型選用順序', '',
        '**' + ' > '.join(policy['priorityLabels'][key] for key in policy['priority']) + '**', '',
        '原著模型＝原作遊戲直接擷取；300英雄／MBA 即使是角色本尊，仍按第 6／7 位。原版指 GGD 既有原版模型，與原著模型分開。手動選擇優先；指定的 11 組加工副本列為手動指定，其他未核准代理仍保留選項並按其驗收／核准狀態處理。', '',
        '來源庫與選用類別分欄保存，不用相同角色名稱推定原著來源。只有已取得、完成轉換並符合預設資格的模型參與自動選用；候選、半成品與網址不因順位較高就自動上架。Git 的 `default-policy.json` 是現行規則；舊版 S3 快照內的四級排序只作歷史紀錄。', '',
        '## 第三守則：成品進 Git，其餘素材進 S3，本機全保留', '',
        '**成品一律上傳至 Git；半成品、原始來源、準備材料等進 S3；本機全部保留。** 成品包含已驗收的模型、貼圖、骨架／動作、特效、音效與語音。程式、角色／技能設定、版本清單、SHA-256 與文件仍以 Git 為準。', '',
        '成品入口：`materials/asset-library/git-release.json`，檔案位於 `materials/asset-library/releases/<版本>/`；半成品與來源放 S3 `legacy/`，不供程序自動取用。既有 S3 成品版本保留作副本；新的成品不能只上 S3 而未進 Git。大型解析 JSON 屬於半成品，仍進 S3。已解碼但未完成分類／綁定驗收的音訊不能當成成品入 Git。', '',
        '此規則取代先前「二進位一律 S3」的分類方式，改按完成狀態區分；詳細機器規則見 `materials/asset-library/STORAGE_POLICY.json`。', '']
    if data.get('purchasePolicy', {}).get('paidPurchaseAllowed') is False:
        lines += ['## 購買暫緩：其他工作流先讀', '',
            '**本工作流不執行付費購買；使用者另行授權的論壇付費工作流照其授權進行，交付素材必須整合並保留。**「優先下載」是來源查找順位，不是新的付款授權；已取得版本先核對以避免重買，不影響另行授權取得不同版本。', '',
            '程序同時讀 `purchasePolicy.scope` 與 `paidPurchaseAllowed=false`：限制範圍是本工作流，不是取消其他工作流的使用者授權。`purchaseHoldFor` 只記已有實檔的角色／形態，不能把尚未取得的線索當成模型已到手。', '']
    if public:
        lines += ['## 已取得來源：免費與付費全部保留', '',
            '**以下角色已取得實際檔案，購買前先核對已有版本。** 不同免費／付費來源全部保留整合；這不代表全部已完成標準化或可直接作預設。預設依第二守則與既有核准範圍。', '',
            '取得範圍只涵蓋表內明列的角色 ID／形態。同名的其他形態仍須各自核對；機器讀 `purchaseHoldFor`，不可只按角色名稱略過整組查找。付費權限依各工作流的使用者授權判斷。', '',
            '| 角色／資源 | 已下載來源與署名 | 目前驗證結果 | 檔案保存狀態 | 後台整合 | 購買安排 |', '|---|---|---|---|---|---|']
        for s in public:
            decision = '**已有實檔；保留來源，避免重買**' if s['heroIds'] or s.get('ownerEntryIds') else '素材池；待角色對應，仍須保留整合'
            ids = '<br>' + '、'.join(f'`{i}`' for i in s['heroIds']) if s['heroIds'] else ''
            if s.get('ownerEntryIds'): ids += '<br>未對應角色 ID 的清單組：' + '、'.join(f'`{i}`' for i in s['ownerEntryIds'])
            storage = ('**最新修訂僅本機已保存，S3 尚未上傳**；舊版備份仍保留' if s.get('pendingBackup', {}).get('status') == 'not-uploaded' and s.get('backup', {}).get('readbackVerified') is True else
                       '**僅本機已保存，S3 尚未上傳**' if s.get('pendingBackup', {}).get('status') == 'not-uploaded' else
                       '本機已保存；S3 legacy 備份已讀回驗證' if s.get('backup', {}).get('readbackVerified') is True else
                       '本機已保存；S3 備份狀態未確認')
            state = s.get('backendIntegration', {}).get('state')
            integration = {'pending-character-mapping': '必須整合；待角色 ID 對應', 'pending-standardization': '必須整合；待標準化／切換驗收'}.get(state, state or '尚未登記')
            method = '論壇付費' if s in data.get('paidSources', []) else '免費公開'
            lines.append(f'| {s["target"]}{ids} | [{s["id"]}]({s["url"]})<br>{method}；{s["uploader"]}；{s["format"]} | {s["verification"]} | {storage} | {integration} | {decision} |')
        lines += ['', '逐檔大小、SHA-256、本機與 S3 位置記於 `download-sources.json → publicSources／paidSources`；完整備份的逐檔清單統一在 `public-source-files.json`（沿用檔名，包含付費交付）。`pendingBackup.plannedS3Uri` 只是預定上傳位置，不能當成已存在的 S3 檔案；已上傳以 `backup.readbackVerified=true` 為準。`readiness` 尚未通過的來源只供人工處理，不進入成品自動取用；來源使用條件另行保留，不把下載或付款當成已確認可再散布。', '']
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
        '**下載與付款安排獨立於第二守則的模型預設順位。** 已有可用 300 或指定加工副本時先核對，避免重買；缺少可用來源時，下列使用者清單仍是最高優先查找來源。另行授權的付費工作流照其授權進行。', '',
        f'清單共有 {len(entries)} 組角色／形態、{count} 個原始網址；去除同帖不同頁後為 {len(sources)} 個資源帖。', '',
        f'這 {len(entries)} 組來源中：**{sum(e["downloadPriority"] == "defer-existing-300" for e in entries)} 組已有 300、暫緩付費下載；{sum(e["downloadPriority"] == "defer-acquired-public" for e in entries)} 組來源已取得（含免費／付費）、避免重買；{sum(e["downloadPriority"] == "owner-highest" for e in entries)} 組優先下載；{sum(e["downloadPriority"] == "needs-roster-mapping" for e in entries)} 組待對應角色 ID。** 數量按來源組計算，巴恩兩種形態各佔一組。', '',
        f'其中 **{sum(e["partialPurchaseHold"] for e in entries)} 組只有部分形態取得來源**：`purchaseHoldFor` 所列 ID 已取得，其他形態仍待查找；不能因已有同名模型就省略未取得形態。', '',
        f'「待整合」{sum(e["category"] == "primary" for e in entries)} 組與「加購替換」{sum(e["category"] == "optional" for e in entries)} 組保留原分類；下載安排與第二守則的預設順位分開記錄。未取得並驗證的模型不會直接取代遊戲預設。', '',
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
                state = ('**來源已取得（含論壇付費），保留全部選項**；' if entry['acquiredPaidSources'] else '**免費來源已取得，暫緩購買**；') + '、'.join(entry['acquiredSourceIds']) + '；待完成標準化'
                if entry['purchaseHoldWithoutHeroId']:state += '；尚待 GGD 角色 ID 對應，保留購買暫緩'
            elif entry.get('partialPurchaseHold'):
                held = '、'.join(f'`{i}`' for i in entry['purchaseHoldFor'])
                remaining = '、'.join(f'`{i}`' for i in entry['heroIds'] if i not in entry['purchaseHoldFor'])
                state = f'**部分形態來源已取得**；{held} 先核對避免重買；{remaining} 未取得、保留原下載安排；' + '、'.join(entry['acquiredSourceIds'])
            if entry.get('mappingNote'): notes += '；' + entry['mappingNote']
            if entry.get('publicSourceLeadIds'):
                state += '；**其他來源線索，尚未取得模型**：' + '、'.join(entry['publicSourceLeadIds'])
            lines.append(f'| {entry["target"]} | {links} | {notes} | {ids}<br>{state} |')
        lines.append('')
    lines += ['同一資源帖只下載一次；不同外觀仍各自保留候選。拳四郎的變身維持放大皮卡丘；岩谷尚文移除刀劍；阿箱＋拉蜜絲加背後白色矩形販賣機；凱亞爾改綠斗篷與黃髮；幸運超人胸口補「大吉」；蒼月潮指定選項改黑髮與藍褲。', '']
    return lines

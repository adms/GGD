"""Join resource references without changing source identities or design status."""


def resource_view(row, coverage, voice_groups, public_sources):
    override = coverage.get('characterOverrides', {}).get(row['id'], {})
    group_ids = set(override.get('voiceGroupIds', []))
    # Only exact source-character IDs are automatic. Shared packages and proxy
    # hero mappings must not attach another character's audio to this identity.
    exact_ids = {row['id'], *row.get('sourceIds', [])}
    group_ids.update(gid for gid in voice_groups if gid in exact_ids)
    missing = group_ids - voice_groups.keys()
    if missing:
        raise ValueError('Unknown audio group: ' + ', '.join(sorted(missing)))
    groups = [voice_groups[gid] for gid in sorted(group_ids)]
    count = sum(g['fileCount'] for g in groups)
    source_ids = set(row.get('sourceIds', []))
    source_groups = [g for g in voice_groups.values()
        if g['sourceId'] in source_ids and g['id'] not in group_ids]
    source_kinds = {kind for sid in source_ids
        for kind in public_sources.get(sid, {}).get('assetKinds', [])}
    native_entries = [dict(sourceId=sid, **coverage['nativeMotionCounts'][sid])
        for sid in sorted(exact_ids) if sid in coverage.get('nativeMotionCounts', {})]
    motion_entries = []
    for c in row['modelCandidates']:
        if not c['localSizeMatches']:
            continue
        value = c.get('nativeAnimationCount', c.get('animationClipCount',
            c.get('modelProof', {}).get('animationEntries')))
        if isinstance(value, int):
            motion_entries.append(dict(candidateId=c['id'], count=value,
                evidence='existing-candidate-metadata; not runtime acceptance'))
    motion = '尚未逐角色解析／建檔'
    if 'animation' in source_kinds:
        motion = '同來源包已含動作；角色與版本對應待核'
    if native_entries:
        motion = '；'.join(n['label'] for n in native_entries)
    elif motion_entries:
        maximum = max(x['count'] for x in motion_entries)
        motion = f'模型內最多 {maximum} 個動作條目；版本分列，未相加' if maximum else '已核對版本未含動作；其他來源待核'
    vfx = '尚未建立角色專屬特效對應'
    if 'vfx' in source_kinds:
        vfx = '同來源包已含特效；角色對應與轉換待核'
    sfx = f'共 {count} 個音訊檔，音效／語音待分型' if count else '尚未建立角色專屬音訊對應'
    voice = '已入音訊索引；語言／說話者待核' if count else '尚未建立角色專屬語音對應'
    if source_groups and not groups:
        sfx = f"同來源包 {sum(g['fileCount'] for g in source_groups)} 個音訊檔；角色／音效分型待核"
        voice = '同來源音訊已建檔；尚未逐角色確認語音'
    source_labels = [f['nameZh'] for f in coverage.get('sourceFamilies', [])
        if source_ids.intersection(f.get('sourceIds', []))
        or any(s.startswith(prefix) for s in source_ids for prefix in f.get('sourceIdPrefixes', []))]
    motion = override.get('motion', motion)
    if any(c['localSizeMatches'] and c.get('modelProof', {}).get('hasSequenceChunk')
           for c in row['modelCandidates']):
        motion += '；另保留 MDX 序列區塊，片段數與轉換可用性待核'
    return dict(
        motion=motion,
        vfx=override.get('vfx', vfx),
        sfx=override.get('sfx', sfx),
        voice=override.get('voice', voice),
        voiceGroupIds=sorted(group_ids), indexedAudioFileCount=count,
        unclassifiedAudioFileCount=sum(g.get('categoryCounts', {}).get('unclassified', 0) for g in groups),
        sourceAudioGroupsNotAssignedToCharacter=[g['id'] for g in source_groups],
        sourceLabels=source_labels,
        voiceIndex='materials/hero-model-library/voice-index.json',
        audioFileIndex='materials/hero-model-library/voice-files.jsonl.gz',
        motionCandidateCounts=motion_entries,
        nativeMotionSources=native_entries,
        evidencePaths=override.get('evidencePaths', []),
        classificationIsAcquisitionSnapshot=True,
    )


def resource_cell(resources):
    lines = []
    if resources['indexedAudioFileCount']:
        lines.append(f"音訊索引合計：{resources['indexedAudioFileCount']} 檔（中央未分類 {resources['unclassifiedAudioFileCount']} 檔）")
    lines += [label + '：' + str(resources[key]).replace('|', '／').replace('\n', ' ')
        for key, label in [('motion', '動作'), ('vfx', '特效'), ('sfx', '音效'), ('voice', '語音')]]
    return '<br>'.join(lines)


def source_overview(coverage):
    lines = []
    priorities = coverage.get('priorityRequests', [])
    if priorities:
        lines += ['## 已上架英雄優先補件', '',
            '依使用者指定優先處理以下角色；已上架為使用者確認，本次文件更新未重新驗證正式站。新來源完成標準化、動作與外觀驗收後保留為獨立選項，再提交合併上架。', '',
            '| 角色／形態 | 優先來源 | 目前進度 | 英雄對應 |', '|---|---|---|---|']
        for p in priorities:
            lines.append('| ' + ' | '.join([p['nameZh'], p['sourceWorkZh'], p['statusZh'], '、'.join(p['heroIds'])]) + ' |')
        lines += ['']
    lines += ['## 全來源素材範圍', '',
        '**第一守則：所有來源、所有已取得角色及版本都必須歸檔，不限 81 名新英雄，也不限是否已上架或已設計。模型、動作、特效、音效、語音分欄記錄；每個版本保留，完成標準化後登記成後台獨立選項。**', '',
        '下表是已取得程度，不代表該遊戲全角色、全類型均已下載完成。音訊包、貼圖包或動作補充包不能計為完整角色模型；只有音訊的角色另列儲備。', '',
        '| 來源作品 | 模型 | 動作 | 特效 | 音效 | 語音 | 固定索引／本機資料 |',
        '|---|---|---|---|---|---|---|']
    for family in coverage.get('sourceFamilies', []):
        links = [f'[{label}](<{path}>)' for label, path in family.get('links', [])]
        fields = [family['nameZh'], *(family[key] for key in ['model', 'motion', 'vfx', 'sfx', 'voice']), '<br>'.join(links)]
        lines.append('| ' + ' | '.join(str(x).replace('|', '／') for x in fields) + ' |')
    lines += ['', '各角色下方的音效／語音檔數引用已保存的音訊索引；分類、語言與說話者尚未驗證時保留待核，不把叫聲或共用音效當作可合成的角色對白。完整檔案位置以同名 JSON 的 `resources.voiceGroupIds` 查 [角色語音索引](角色語音索引.md)；原生動作條目數不代表已綁定 GGD。', '']
    return lines


def audio_reserve_section(coverage):
    rows = coverage.get('audioOnlyCharacters', []) + coverage.get('reservedResources', [])
    lines = ['## 音訊、動作及部件儲備：尚未確認同來源完整模型', '',
        '這些角色的音訊、動作或模型部件已取得；不能因此計入「已取得完整模型」筆數。若已有其他來源模型，仍須保留各來源的取得差異。', '',
        '| 角色 | 來源作品 | 已取得素材 | 模型狀態 | 索引／本機位置 |', '|---|---|---|---|---|']
    for row in rows:
        fields = [row['nameZh'], row['workZh'], row['resources'], row['modelStatus'],
                  '<br>'.join(f'[{label}](<{path}>)' for label, path in row.get('links', []))]
        lines.append('| ' + ' | '.join(str(x).replace('|', '／') for x in fields) + ' |')
    return lines + ['']

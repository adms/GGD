import collections,csv,hashlib,json,shutil,time,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;GAME=ROOT/'magical-battle-arena';RAW=GAME/'raw'
def read(p):return json.loads(p.read_text())
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
source_records=[json.loads(x) for x in (GAME/'asset-index.jsonl').read_text().splitlines()]
records={r['path']:r for r in source_records}
for p in sorted((GAME/'client/Files').iterdir()):
    if p.suffix.lower() not in ('.stg','.dat','.mpg'):continue
    dest=RAW/'ClientResources'/p.name
    if records.get(str(dest.relative_to(RAW)),{}).get('patch'):continue
    dest.parent.mkdir(exist_ok=True);shutil.copyfile(p,dest)
    rel=str(dest.relative_to(RAW));records[rel]=dict(path=rel,archive='loose_file',bytes=dest.stat().st_size,
        sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),extension=dest.suffix.lower())
(GAME/'asset-index.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in sorted(records.values(),key=lambda r:r['path'])))
models=[json.loads(x) for x in (GAME/'models/model-index.jsonl').read_text().splitlines()]
by_model={x['source'].casefold():x for x in models};characters=[]
for p in sorted((RAW/'CharacterDefinitions').glob('*.chr')):
    data=p.read_bytes();name=data[:32].split(b'\0')[0].decode('cp932');model=data[32:292].split(b'\0')[0].decode('cp932').replace('\\','/')
    converted=by_model.get(model.casefold(),{})
    characters.append(dict(definition=str(p.relative_to(RAW)),name=name,native_model=model,
        glb=converted.get('glb'),animations=converted.get('animation_count',0),joints=converted.get('joints',0)))
write(GAME/'character-candidates.json',characters)
with (GAME/'character-candidates.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['角色／形態定義','原始名稱','原生模型','GLB','動畫片段','關節數'])
    for r in characters:w.writerow([r['definition'],r['name'],r['native_model'],r['glb'],r['animations'],r['joints']])
indexes=GAME/'indexes';indexes.mkdir(exist_ok=True)
categories={
    'models':[r for r in records.values() if r['extension']=='.x'],
    'vfx':[r for r in records.values() if r['extension'] in ('.efc','.fx')],
    'textures':[r for r in records.values() if r['extension'] in ('.dds','.bmp')],
    'audio':[r for r in records.values() if r['extension'] in ('.wav','.ogg')],
}
for name,items in categories.items():
    (indexes/(name+'.jsonl')).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in items))
extraction=read(ROOT/'evidence/mba-gdp-extraction.json');conversion=read(ROOT/'evidence/mba-model-conversion.json')
patch_applied=(ROOT/'evidence/mba-patch160-import.json').exists()
version='Complete Form 1.60+' if patch_applied else 'Complete Form 1.60'
missing_characters=[r['name'] for r in characters if not (RAW/r['native_model']).is_file()]
failed_characters=[r['name'] for r in characters if (RAW/r['native_model']).is_file() and not r['glb']]
summary=dict(updated_at=time.strftime('%Y-%m-%dT%H:%M:%S%z'),version=version,
    status=version+' downloaded and extracted; 1.70 update not acquired.',
    source='https://www.myabandonware.com/game/magical-battle-arena-yqh',
    raw_files=len(records),raw_bytes=sum(r['bytes'] for r in records.values()),gdp_archives=10 if patch_applied else 9,
    patch_source='https://www.mediafire.com/?h7sndh7dmf7y075' if patch_applied else None,
    character_models_present=len(characters)-len(missing_characters),missing_character_models=missing_characters,
    character_glb_models=sum(bool(r['glb']) for r in characters),character_conversion_failures=failed_characters,
    categories={k:len(v) for k,v in categories.items()},character_forms=len(characters),
    character_body_animations=sum(r['animations'] for r in characters),glb_models=conversion['converted'],
    model_animations=conversion['animations'],conversion_failures=len(conversion['failed']),
    missing_glb_textures=conversion['missing_textures'],native_extraction_errors=len(extraction['errors']),
    original_archive='downloads/Magical-Battle-Arena_Complete-Edition-ISO.zip',
    version_limit='Magic Knight Rayearth content introduced in 1.70 is not included in this 1.60 extraction.')
write(GAME/'library-summary.json',summary)
write(ROOT/'evidence/mba-patch-source-status.json',dict(
    official='Old patch host redirected to its homepage.',
    mediafire='Community folder tp3pnt5xi600s reports Folder not found.',
    linkvertise='Legacy adf.ly/35JLN migrated to a page requiring about one hour of free waiting or a subscription; no subscription purchased.',
    mega='Browser site-safety policy blocked mega.nz/file/CIgAxYbB. No alternate access attempted.'))
doc=f'''> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。\n\n> 本頁為本機來源／候選資料。已標準化共享成品的固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`，以其中 current.json／catalog.json 為準。

# 魔法少女武鬥祭：GGD 候選素材

已取得並擷取 **Magical Battle Arena {version}**，基礎光碟為 1.60，追加版本由補丁內的 `パッチ導入方法.txt` 確認。来源為 [My Abandonware 社群存檔](https://www.myabandonware.com/game/magical-battle-arena-yqh)，完整 ZIP 與 ISO 保存在 [downloads](downloads/)。

| 素材 | 數量 | 入口 |
|---|---:|---|
| 原生 3D 模型（含角色、武器、場景、特效） | {summary['categories']['models']} | [模型清單](indexes/models.jsonl) · [原始模型](raw/Model/) |
| 含骨架／動畫及內嵌 PNG 貼圖的 GLB | {summary['glb_models']} | [GLB 模型](models/Model/) |
| 角色／形態定義 | {summary['character_forms']} | [角色候選 CSV](character-candidates.csv) · [JSON](character-candidates.json) |
| 角色主模型動畫片段 | {summary['character_body_animations']} | 各角色 GLB 內的動畫集合 |
| 所有模型動畫片段（含武器／場景等） | {summary['model_animations']} | [動作索引 CSV](models/animation-clips.csv) |
| 原生特效設定與 shader | {summary['categories']['vfx']} | [特效清單](indexes/vfx.jsonl) |
| 貼圖 | {summary['categories']['textures']} | [貼圖清單](indexes/textures.jsonl) |
| 可播放 WAV／OGG 音效、語音、音樂 | {summary['categories']['audio']} | [音訊清單](indexes/audio.jsonl) · [Sound](raw/Sound/) |

共 {summary['raw_files']:,} 個去重後的原生檔案，包含 {summary['gdp_archives']} 種 GDP 包（補丁版本覆蓋前的原檔另存備份）；擷取錯誤 {summary['native_extraction_errors']}，GLB 轉檔失敗 {summary['conversion_failures']}，GLB 未找到貼圖 {summary['missing_glb_textures']}。

`raw` 保留遊戲原檔；`models` 是 Assimp 6.0.5 轉出的 GLB，骨架和動畫已保留，DDS 貼圖轉成 PNG 並內嵌。部分模型本身沒有骨架或動畫。尚未對每個角色逐動作做視覺驗收或重綁 GGD 骨架。`.efc` 仍是原生特效設定，未重建成 GGD 特效。

角色主模型已對應 {summary['character_models_present']}/{summary['character_forms']} 份定義，原生主模型缺件 {len(missing_characters)}；GLB 成功 {summary['character_glb_models']} 份，角色轉換失敗：{failed_characters}。1.60+ 追加包來源：[社群分享頁](https://kazasou.wordpress.com/2011/05/19/doujin-game-magical-battle-arena/)；驗證見 [補丁下載紀錄](../evidence/mba-patch160-download.json)。

**版本範圍：本批為 {version}，未包含 1.70 追加的魔法騎士內容。** 社群 1.70 連結已有失效、等待限制及瀏覽器封鎖，詳見 [來源檢查紀錄](../evidence/mba-patch-source-status.json)。

下載 ZIP 已通過 CRC 檢查；ZIP／ISO 的 SHA-256 保存在 [下載驗證](../evidence/mba-download-verified.json)。GDP 格式依 [Acewell 公開的格式說明](https://zenhax.com/viewtopic.php%40t%3D7163.html) 擷取，逐筆檢查名稱與位址範圍，原生檔案 SHA-256 保存在 [全素材清單](asset-index.jsonl)。

工具：`../tools/extract_mba_gdp.py`、`../tools/convert_mba_models.py`、`../tools/build_mba_catalog.py`、`../tools/import_mba_patch160.py`。完整解包的遊戲檔案在 [client](client/)，本次沒有啟動遊戲或執行其安裝程式。
'''
(GAME/'ASSET_LIBRARY.md').write_text(doc);print(json.dumps(summary,ensure_ascii=False,indent=2))

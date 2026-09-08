"""Build the GGD candidate library entry point from extraction evidence."""
import collections
import csv
import json
import re
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
GAME=ROOT/'300heroes'
RAW=GAME/'raw'
EVIDENCE=ROOT/'evidence'

def read(path,default=None):return json.loads(path.read_text()) if path.exists() else default
def lines(path):return [json.loads(s) for s in path.read_text().splitlines()] if path.exists() else []
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def jsonl(path,records):path.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records))

def build():
    assets={}
    for p in sorted(EVIDENCE.glob('*.assets.jsonl')):
        for r in lines(p):assets[r['path']]=r
    for r in lines(EVIDENCE/'300-patch-assets.jsonl'):
        if r['status']=='downloaded':assets[r['path']]=dict(r,package='official_update_cdn')
    assets={k:v for k,v in assets.items() if (RAW/k).exists()}
    for path,r in assets.items():r['extension']=Path(path).suffix.lower()
    records=sorted(assets.values(),key=lambda x:x['path']);jsonl(GAME/'asset-index.jsonl',records)
    categories={
        'models-native':[r for r in records if r['extension'] in ('.x','.model')],
        'vfx-native':[r for r in records if r['path'].startswith(('data/effect/','data/magic/'))],
        'textures-native':[r for r in records if r['extension'] in ('.dds','.tga','.png','.bmp','.jpg')],
        'animation-files':[r for r in records if r['extension'] in ('.ani','.mtn')],
        'audio-native':[r for r in records if r['extension'] in ('.bank','.fsb','.wav','.ogg','.mp3')],
        'cutscene-video':[r for r in records if r['extension'] in ('.wmv','.mp4','.avi')],
    }
    index=GAME/'indexes';index.mkdir(exist_ok=True)
    for name,items in categories.items():jsonl(index/(name+'.jsonl'),items)
    models=lines(GAME/'models/model-index.jsonl')
    with (GAME/'models/character-animation-clips.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f);writer.writerow(['model','action','start_frame','end_frame','hit_frame','bone_count'])
        for model in models:
            if '/roleaction/' not in model['source']:continue
            for clip in model.get('clips',[]):writer.writerow([model['source'],clip['name'],clip['start_frame'],clip['end_frame'],clip['hit_frame'],model['bone_count']])
    audio=[];undecoded=[]
    for p in sorted((GAME/'audio').rglob('samples.json')):
        bank=read(p)
        for sample in bank['samples']:
            audio.append(dict(source_bank=bank['source'],path=str((p.parent/sample['file']).relative_to(GAME)),**sample))
        for error in bank['errors']:undecoded.append(dict(source_bank=bank['source'],**error))
    jsonl(index/'audio-playable.jsonl',audio);write(index/'audio-undecoded.json',undecoded)
    roster=read(ROOT/'300heroes-roster.json',{'characters':[]})['characters']
    native_groups=collections.defaultdict(list);audio_groups=collections.Counter()
    derived_by_source={m['source']:m for m in models}
    for item in categories['models-native']:
        match=re.match(r'^(\d+)(?:_|\.|$)',Path(item['path']).name)
        if '/roleaction/' in item['path'] and match:native_groups[int(match[1])].append(item)
    for item in audio:
        match=re.match(r'^(\d+)(?:_|\.|$)',Path(item['source_bank']).name)
        if '/hero/' in item['source_bank'] and match:audio_groups[int(match[1])]+=1
    candidates=[]
    for hero in roster:
        number=int(hero['id']);native=native_groups[number]
        derived=[derived_by_source[x['path']] for x in native if x['path'] in derived_by_source]
        candidates.append(dict(id=number,name=hero['name_original'],origin_work=hero.get('origin_work',''),
            client_base_model=hero['model_path'],base_model_present=(RAW/hero['model_path'].replace('\\','/').removeprefix('../').lower()).exists(),
            native_model_paths=[x['path'] for x in native],model_files=len(native),obj_files=sum('obj' in x for x in derived),
            animation_clips=sum(x.get('clip_count',0) for x in derived),playable_audio=audio_groups[number],
            matching_note='Variants associated by numeric filename prefix; full asset index also contains other naming schemes.'))
    write(GAME/'character-candidates.json',candidates)
    with (GAME/'character-candidates.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['ID','角色','作品來源','本體模型','基礎模型存在','模型檔數','OBJ數','動作片段','音效語音段數'])
        for h in candidates:w.writerow([h['id'],h['name'],h['origin_work'],h['client_base_model'],h['base_model_present'],h['model_files'],h['obj_files'],h['animation_clips'],h['playable_audio']])
    extraction=[read(p) for p in sorted(EVIDENCE.glob('Data*.jmp.extracted.json'))]
    model_report=read(EVIDENCE/'300-model-extraction.json',{})
    audit=read(EVIDENCE/'300-manifest-audit.json',{})
    material_report=read(EVIDENCE/'300-material-resolution.json',{})
    mba=read(ROOT/'magical-battle-arena/library-summary.json',{})
    summary=dict(updated_at=time.strftime('%Y-%m-%dT%H:%M:%S%z'),client_archive='300hero_v202609021.zip',
        archive_complete=(GAME/'downloads/300hero_v202609021.zip').exists(),jmp_packages=len(extraction),
        raw_files=len(records),raw_bytes=sum(x['bytes'] for x in records),
        categories={name:len(items) for name,items in categories.items()},
        model_formats=dict(collections.Counter(r.get('format','unknown') for r in models)),
        indexed_models=len(models),obj_files=sum('obj' in r for r in models),
        animation_clips=sum(r.get('clip_count',0) for r in models),
        character_animation_clips=sum(r.get('clip_count',0) for r in models if '/roleaction/' in r['source']),
        animation_binary_files=sum('animation_binary' in r for r in models),
        playable_audio=len(audio),undecoded_audio=len(undecoded),
        native_checksum_mismatches=sum(r['md5_mismatches'] for r in extraction),
        native_extraction_failures=sum(len(r['failures']) for r in extraction),
        model_conversion_issues=len(model_report.get('errors',[])),manifest_audit={k:v for k,v in audit.items() if k!='pending_assets'},
        material_resolution=material_report.get('summary',{}),
        mba_status=mba.get('status','Base game unavailable; no MBA game assets extracted.'),
        magical_battle_arena=mba,
        ggd_status='Candidate library only; not imported into GGD or retargeted to its rig.')
    write(ROOT/'asset-library-summary.json',summary)
    links=lambda path: f'[{path}]({path})'
    mba_section=(f"## 魔法少女武鬥祭\n\n已取得 **{mba['version']}**，完成 {mba['gdp_archives']} 個 GDP 包擷取：**{mba['glb_models']} 個 GLB、{mba['character_body_animations']} 個角色主模型動畫片段、{mba['categories']['audio']} 段音訊、{mba['categories']['vfx']} 個特效設定／shader**。\n\n[魔法少女武鬥祭素材入口](magical-battle-arena/ASSET_LIBRARY.md) · [角色候選清單](magical-battle-arena/character-candidates.csv)\n\n本批為 {mba['version']}，尚未包含 1.70 追加的魔法騎士內容。\n\n" if mba else '')
    mba_scope=(f'《魔法少女武鬥祭》{mba["version"]} 本體與素材已取得；1.70 更新尚未取得，版本與來源限制見該作素材入口。' if mba else '《魔法少女武鬥祭》本體尚未取得。')
    text=f'''> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。\n\n> 本頁為本機來源／候選資料。已標準化共享成品的固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`，以其中 current.json／catalog.json 為準。

# GGD 角色候選素材庫

更新：{summary['updated_at']}。本批以取得素材為主，角色出處沿用先前對照表。

## 已取得的《300英雄》素材

| 項目 | 數量 | 入口 |
|---|---:|---|
| 原始資源檔 | {summary['raw_files']:,} | [raw](300heroes/raw/) |
| 原生 3D 容器（含角色、場景與特效模型） | {len(categories['models-native']):,} | [模型清單](300heroes/indexes/models-native.jsonl) |
| 角色 OBJ 靜態模型 | {summary['obj_files']:,} | [模型及動作資料夾](300heroes/models/data/character/roleaction/) |
| 特效資源（含模型、貼圖、設定） | {len(categories['vfx-native']):,} | [Effect](300heroes/raw/data/effect/) · [Magic](300heroes/raw/data/magic/) |
| 已辨識角色動作片段 | {summary['character_animation_clips']:,} | [角色動作索引 CSV](300heroes/models/character-animation-clips.csv) |
| 全部動作片段（含怪物及特效） | {summary['animation_clips']:,} | [完整動作索引 CSV](300heroes/models/animation-clips.csv) |
| 拆出的角色動畫關鍵影格二進位檔 | {summary['animation_binary_files']:,} | 各模型目錄的 `animation-data.bin` 與 `model.json` |
| 獨立動畫檔（含 Live2D MTN） | {len(categories['animation-files']):,} | [動畫檔清單](300heroes/indexes/animation-files.jsonl) |
| 可播放音效／語音／音樂 | {summary['playable_audio']:,} | [音訊資料夾](300heroes/audio/) · [音訊清單](300heroes/indexes/audio-playable.jsonl) |
| 原始音訊容器與檔案 | {len(categories['audio-native']):,} | [原始音訊清單](300heroes/indexes/audio-native.jsonl) |
| 角色演出／過場影片 | {len(categories['cutscene-video']):,} | [影片清單](300heroes/indexes/cutscene-video.jsonl) |

分類有重疊，例如特效模型同時包含在 3D 容器和特效資源數量內；這些不是角色數量。

{mba_section}## 挑選角色

先開啟 [角色候選清單 CSV](300heroes/character-candidates.csv) 或 [JSON](300heroes/character-candidates.json)，用 ID 尋找 `roleaction` 與 `audio/data/audio/hero` 下的同編號素材。造型以檔名前綴協助歸組；其他命名的素材仍完整保留在全資源清單。

角色與動漫／作品出處見 [原有名冊](character-rosters.md)。這一輪沒有繼續校正出處。

## 檔案怎麼用

- `raw` 保留解包後的原始路徑與內容；不要只搬模型而漏掉相鄰貼圖、特效設定和引用檔。
- JUMPX 的 `.x` 是遊戲自訂容器。`mesh.obj` 可作靜態幾何預覽；骨架、動作、粒子與完整材質仍以原 `.x` 為準。OBJ 不含動畫，材質對應僅為初步轉出。
- OBJ 已連結能唯一辨識的現有貼圖，路徑與副檔名替代規則記在各模型的 `materials.json`；缺失或歧義引用見 [材質對應結果](evidence/300-material-resolution.json)。
- `model.json` 包含骨架、反向綁定矩陣、動作區段及關鍵影格位址。`bones[].exported_channels` 對應同目錄 `animation-data.bin`，保留原始數值和壓縮編碼；尚未轉成 FBX／GLB 動畫或 GGD 骨架，未自行假定 FPS。
- EG3D `.model` 拆出的 `eg3d-metadata.json` 與 `eg3d-buffer.bin` 保留模型、骨架及動畫資料；標準格式轉換尚未完成。
- Vorbis 音訊重建為 OGG；FADPCM 解碼為 PCM16 WAV。每個音效包目錄的 `samples.json` 記錄原名稱、取樣率、聲道與 SHA-256。

## 完成範圍與剩餘項目

- 完整官方 ZIP：{'已下載' if summary['archive_complete'] else '仍在下載'}；已解開 {summary['jmp_packages']} 個 JMP 包。包內資源 MD5 不符 {summary['native_checksum_mismatches']}，解包失敗 {summary['native_extraction_failures']}。
- 尚有 {summary['undecoded_audio']} 段音訊未成功轉成可播放格式，保留原 BANK 及獨立編碼 payload，見 [未解碼清單](300heroes/indexes/audio-undecoded.json)。
- 模型索引／OBJ 轉出問題 {summary['model_conversion_issues']} 項，原檔均保留，見 [處理結果](evidence/300-model-extraction.json)。
- 音訊已做 OGG／WAV 抽樣解碼檢查；OBJ 有幾何數值與索引邊界檢查，未逐角色做外觀驗收。
- {mba_scope}
- 目前是候選素材庫，尚未匯入 GGD、重綁骨架或重建遊戲特效。

## 來源與可重跑工具

《300英雄》來源：[官方下載頁](https://300.jumpw.com/download.html)、[本次 ZIP](https://dl3.jumpw.com/300hero_v202609021.zip)、官方更新 CDN 主清單與非同步清單（保存在 `evidence`）。《魔法少女武鬥祭》來源：[官方頁面](https://area-zero.net/product/mba/)。

工具與授權保存在 `tools`。模型格式參考 [JumpXToolchain](https://github.com/Gamepiaynmo/JumpXToolchain)；音訊使用 [python-fsb5](https://github.com/HearthSim/python-fsb5) 及 [vgmstream FADPCM 格式實作](https://github.com/vgmstream/vgmstream/blob/master/src/coding/fadpcm_decoder.c)。

流程：`download_300_ranges.py` → `extract_300_packages.py` → `sync_300_assets.py` → `extract_300_audio.py`／`index_300_models.py` → `build_asset_catalog.py`。音效工具需以 `arch -x86_64 /usr/local/bin/python3` 執行，使用本機已安裝的 Ogg／Vorbis 函式庫。

[機器可讀摘要](asset-library-summary.json) · [全資源清單](300heroes/asset-index.jsonl) · [官方清單比對](evidence/300-manifest-audit.json)
'''
    (ROOT/'ASSET_LIBRARY.md').write_text(text)
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':build()

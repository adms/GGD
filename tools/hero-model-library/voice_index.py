#!/usr/bin/env python3
"""Build a character audio handoff from existing local indexes and backup receipts.

No AWS access, binary conversion, playback, speaker inference or synthesis occurs.
The compact per-file SHA index is a Git control manifest; audio remains in S3/local.
"""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[2]
OUT = REPO/'materials/hero-model-library'


def language_rank(value):
    """Rank an explicit language label without treating it as listening proof."""
    value = str(value or '').casefold().replace('_', '-').strip()
    if value in {'ja', 'ja-jp', 'jp', 'japanese', 'japanese (jp filename label)', '日文', '日語'}:
        return 1
    if value in {'en', 'en-us', 'en-gb', 'english', '英文', '英語'}:
        return 2
    return 3


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def excluded_from_speech(role, source_is_synthetic=None, source_contains_synthetic=None):
    """Mixed synthetic banks stay excluded without labelling every clip synthetic."""
    for flag in (source_is_synthetic, source_contains_synthetic):
        assert flag is None or isinstance(flag, bool)
    return role in {'music', 'sound-effect'} or source_is_synthetic is True or source_contains_synthetic is True


def primary_audio(archived, declared=None, formats=None):
    """A full backup does not add alternate formats to an explicit delivery."""
    saved={f['path']:f for f in archived}
    selected=archived if declared is None else declared
    assert len(selected)==len({f['path'] for f in selected}), 'Duplicate delivery path'
    for f in selected:
        assert f['path'] in saved, 'Delivery missing from current backup: '+f['path']
        assert (f['sha256'],f['bytes'])==(saved[f['path']]['sha256'],saved[f['path']]['bytes'])
    allowed=set(formats or ['.wav','.ogg','.mp3','.flac'])
    assert allowed <= {'.wav','.ogg','.mp3','.flac'}
    return [f for f in selected if Path(f['path']).suffix.lower() in allowed]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=REPO.parent)
    args = parser.parse_args()
    ws = args.workspace.resolve()
    native = ws/'outputs/game-asset-library-20260907'
    inputs = []

    def read(path):
        inputs.append({'path':str(path.relative_to(ws)), 'sha256':sha(path)})
        return json.loads(path.read_text())

    def jsonlines(path):
        inputs.append({'path':str(path.relative_to(ws)), 'sha256':sha(path)})
        return [json.loads(line) for line in path.read_text().splitlines() if line]

    downloads = read(OUT/'download-sources.json')
    public_files = read(OUT/'public-source-files.json')
    models = read(OUT/'manifest.json')
    latest = read(ws/'GGD-Asset-Library/backups/latest.json')
    backup_path = ws/'GGD-Asset-Library/backups'/latest['snapshot']/'manifest-path-correction-20260908.json'
    assert sha(backup_path) == latest['manifest_sha256']
    backup = read(backup_path)
    assert '/legacy/' in backup['backup_uri'] and '/leagcy/' not in backup['backup_uri']
    groups, files, stores, native_audio, alternate_audio = {}, [], {}, [], []
    source_models = {m['id']:m for m in models['models']}

    def hero_ids(source_id):
        return sorted(h['id'] for h in models['heroes'] if any(o['sourceId']==source_id and o['source']['kind']=='exact' for o in h['options']))

    def group(key, name, library, source_id, mapping, ids=None):
        if key not in groups:
            groups[key] = dict(id=key, name=name, library=library, sourceId=source_id,
                heroIds=hero_ids(source_id) if ids is None else ids, mappingEvidence=mapping,
                language='unreviewed', speakerVerified=False, transcriptStatus='not-transcribed',
                confirmedVoiceCount=None, synthesisReady=False, listeningReviewComplete=False,
                fileCount=0, bytes=0, knownDurationSeconds=0.0, durationMeasuredFiles=0,
                voiceFilenameCandidates=0, originalBanks=[], backupIds=[])
        return groups[key]

    def add(g, rel, digest, size, store_id, member, seconds=None, role='unclassified', original_bank=None,
            source_is_synthetic=None, source_contains_synthetic=None):
        path=ws/rel
        local_ok=path.is_file() and path.stat().st_size==size
        row=dict(groupId=g['id'],path=rel,sha256=digest,bytes=size,backupId=store_id,
                 archiveMember=member,localSizeVerified=local_ok,category=role,synthesisReady=False)
        row['sourceIsSynthetic']=source_is_synthetic
        row['sourceContainsSynthetic']=source_contains_synthetic
        row['excludedFromSpeechInput']=excluded_from_speech(role,source_is_synthetic,source_contains_synthetic)
        if seconds is not None:
            row['seconds']=seconds;g['knownDurationSeconds']+=seconds;g['durationMeasuredFiles']+=1
        if original_bank:row['sourceBank']=original_bank
        files.append(row);g['fileCount']+=1;g['bytes']+=size
        if role=='voice-filename-candidate':g['voiceFilenameCandidates']+=1
        if store_id not in g['backupIds']:g['backupIds'].append(store_id)

    def backup_rows(group_id):
        bg=next(g for g in backup['groups'] if g['id']==group_id)
        index_path=backup_path.parent/bg['files_index']
        assert sha(index_path)==bg['files_index_sha256']
        rows=jsonlines(index_path)
        sid='legacy:'+group_id
        stores[sid]=dict(type='multipart-tar-gzip',baseUri=backup['backup_uri'],
            manifestUri=latest['manifest_uri'],manifestSha256=latest['manifest_sha256'],
            filesIndex=bg['files_index'],filesIndexSha256=bg['files_index_sha256'],parts=bg['parts'],
            verification='recorded snapshot receipt; current run compares local metadata and sizes, not a new S3 payload readback')
        return sid,{r['path']:r for r in rows}

    sid, archived = backup_rows('300heroes-audio')
    characters={str(c['id']):c for c in read(native/'300heroes/character-candidates.json')}
    for r in jsonlines(native/'300heroes/indexes/audio-playable.jsonl'):
        bank=r['source_bank'];match=re.search(r'/hero/(\d+)(?:_|\.bank)',bank)
        cid=match[1] if match else None
        key='300heroes:'+cid if cid else '300heroes:shared:'+str(Path(bank).parent).replace('/','-')
        name=characters.get(cid,{}).get('name','原生角色 ID '+cid) if cid else '共用音訊／'+str(Path(bank).parent)
        g=group(key,name,'300英雄',key,'來源 bank 數字 ID 對照遊戲角色索引；音檔說話者／語言尚未聽審' if cid else '非角色專屬音效庫；保留待分類',ids=None if cid else [])
        g['work']=characters.get(cid,{}).get('origin_work','待核')
        if bank not in g['originalBanks']:g['originalBanks'].append(bank)
        rel='outputs/game-asset-library-20260907/300heroes/'+r['path'];saved=archived[rel]
        assert saved['sha256']==r['sha256'] and saved['bytes']==r['bytes']
        add(g,rel,r['sha256'],r['bytes'],sid,rel,r.get('seconds'),original_bank=bank)

    sid, archived = backup_rows('magical-battle-arena')
    characters={Path(c['definition']).stem:c for c in read(native/'magical-battle-arena/character-candidates.json')}
    for r in jsonlines(native/'magical-battle-arena/indexes/audio.jsonl'):
        parts=Path(r['path']).parts
        cid=parts[1] if len(parts)>2 and parts[0]=='Sound' and parts[1].startswith('Chara') else 'shared:'+parts[0]
        key='mba:'+cid;model=source_models.get(key,{})
        related=sorted({m['sourceCharacter'] for k,m in source_models.items() if k.startswith(key+'_')} | {c['name'] for k,c in characters.items() if k.startswith(cid+'_')})
        name=model.get('sourceCharacter',characters.get(cid,{}).get('name','／'.join(related)+'（形態待核）' if related else cid))
        g=group(key,name,'MBA Complete Form 1.60',key,'Sound/Chara 目錄對照 CharacterDefinitions；不延伸到同名其他形態')
        g['work']=model.get('sourceWork','待核')
        if related:g['candidateCharactersFromDefinitionPrefix']=related
        rel='outputs/game-asset-library-20260907/magical-battle-arena/raw/'+r['path'];saved=archived[rel]
        assert saved['sha256']==r['sha256'] and saved['bytes']==r['bytes']
        role='voice-filename-candidate' if Path(r['path']).name.lower().startswith('vo_') else 'unclassified'
        add(g,rel,r['sha256'],r['bytes'],sid,rel,role=role)

    for source in downloads.get('publicSources',[])+downloads.get('paidSources',[]):
        if source.get('supersededPrimaryAudioBy'):
            replacement=next(s for s in downloads.get('publicSources',[])+downloads.get('paidSources',[])
                             if s['id']==source['supersededPrimaryAudioBy'])
            assert replacement.get('audioFormatRevisionOf')==source['id']
            parts=source.get('audioGroups',[])
            assert len(parts)<=1,'Format revisions spanning multiple groups require an explicit group mapping'
            old_group_id=source['id']+(':'+parts[0]['id'] if parts else '')
            assert replacement.get('primaryAudioGroupId')==old_group_id
            spec=source['audioFileIndex'];path=ws/source['localPath']/spec['reportPath']
            assert sha(path)==spec['reportSha256']
            report=read(path);old_files=primary_audio(report['files'],report['files'],source.get('primaryAudioFormats'))
            rows=[]
            for f in old_files:
                rel=source['localPath']+'/'+f['path'];local=ws/rel
                assert local.is_file() and local.stat().st_size==f['bytes'] and sha(local)==f['sha256']
                rows.append(dict(f,path=rel,groupId=old_group_id,sourceId=source['id'],
                                 primary=False,countAsNewPerformance=False,synthesisReady=False))
            alternate_audio.append(dict(id=source['id'],name=source['target'],heroIds=source['heroIds'],
                preferredSourceId=replacement['id'],preferredGroupId=old_group_id,
                localRoot=source['localPath'],sourceFileIndex=spec,files=rows,
                backup=source.get('backup'),pendingBackup=source.get('pendingBackup'),
                reason=source.get('audioFormatNote','Historical format retained; use the preferred revision.')))
            continue
        receipt=source.get('backup',{})
        pending=source.get('pendingBackup',{})
        local_only=False
        if pending:
            archived=next(s for s in public_files.get('pendingUploads',[]) if s['id']==source['id'] and s['sha256']==pending['sha256'])
            receipt={k:archived[k] for k in ['localArchive','plannedS3Uri','bytes','sha256']}
            receipt['readbackVerified']=False
            local_only=True
        elif receipt.get('readbackVerified'):
            archived=next(s for s in public_files['sources'] if s['id']==source['id'] and s['sha256']==receipt['sha256'])
        else:
            spec=source.get('audioFileIndex',source.get('audioConversion',{}))
            if source.get('acquisitionStatus')!='downloaded-verified' or not spec.get('reportPath'):continue
            report_path=(ws/source['localPath']/spec['reportPath']).resolve()
            assert report_path.is_relative_to((ws/source['localPath']).resolve())
            assert sha(report_path)==spec['reportSha256']
            archived=read(report_path)
            receipt=dict(readbackVerified=False)
            local_only=True
        declared=None
        if source.get('audioFileIndex',{}).get('reportPath'):
            spec=source['audioFileIndex'];path=(ws/source['localPath']/spec['reportPath']).resolve()
            assert path.is_relative_to((ws/source['localPath']).resolve()) and sha(path)==spec['reportSha256']
            declared=read(path)['files']
        audio=primary_audio(archived['files'],declared,source.get('primaryAudioFormats'))
        if source.get('audioConversion',{}).get('decodedFloatWavCount'):
            audio=[f for f in audio if not f['path'].startswith('decoded-audio/')]
        native_files=[];native_bank_count=0
        native_spec=source.get('nativeAudioIndex',{})
        if native_spec:
            native_path=(ws/source['localPath']/native_spec['reportPath']).resolve()
            assert native_path.is_relative_to((ws/source['localPath']).resolve())
            assert sha(native_path)==native_spec['reportSha256']
            report=read(native_path);saved={f['path']:f for f in archived['files']}
            for native_file in report['nativeAudioBanks']:
                f=saved[native_file['path']]
                assert native_file['sha256']==f['sha256']
                local=ws/source['localPath']/f['path']
                assert local.is_file() and local.stat().st_size==f['bytes']
                native_files.append(dict(path=source['localPath']+'/'+f['path'],archiveMember=f['path'],
                    sha256=f['sha256'],bytes=f['bytes'],kind='native-bank',decoded=False,synthesisReady=False))
            native_bank_count=len(native_files)
            for f in archived['files']:
                if Path(f['path']).suffix.lower() not in {'.idsp','.wem'}:continue
                local=ws/source['localPath']/f['path']
                assert local.is_file() and local.stat().st_size==f['bytes']
                native_files.append(dict(path=source['localPath']+'/'+f['path'],archiveMember=f['path'],
                    sha256=f['sha256'],bytes=f['bytes'],kind='native-standalone',decoded=False,synthesisReady=False))
        if not audio and not native_files:continue
        if local_only:
            for f in audio:
                local=(ws/source['localPath']/f['path']).resolve()
                assert local.is_relative_to((ws/source['localPath']).resolve())
                assert local.is_file() and local.stat().st_size==f['bytes'] and sha(local)==f['sha256']
            for f in native_files:assert sha(ws/f['path'])==f['sha256']
        sid='public:'+source['id'];stores[sid]=dict(type='zip' if receipt.get('sha256') else 'local-intake',
            **receipt,localRoot=source['localPath'],absoluteLocalRoot=str((ws/source['localPath']).resolve()),
            localUseAvailable=True,publicationStatus='local-verified-s3-pending' if local_only else 's3-readback-verified')
        if native_files:
            native_audio.append(dict(id=source['id'],name=source['target'],heroIds=source['heroIds'],sourceUrl=source['url'],
                backupId=sid,bankFileCount=native_bank_count,standaloneFileCount=len(native_files)-native_bank_count,files=native_files,confirmedVoiceCount=None,
                extractionReports=source.get('extractionReports',[]),
                status='native-banks-pending-decoding-and-listening',synthesisReady=False))
        if not audio:continue
        decoded_metadata={}
        conversion=source.get('audioFileIndex',source.get('audioConversion',{}))
        if conversion.get('reportPath'):
            report_path=(ws/source['localPath']/conversion['reportPath']).resolve()
            assert report_path.is_relative_to((ws/source['localPath']).resolve())
            assert sha(report_path)==conversion['reportSha256']
            decoded_metadata={f['path']:f for f in read(report_path)['files']}
        for f in audio:
            member=f['path'];part=None
            if source.get('audioGroups'):
                matches=[p for p in source['audioGroups'] if any(member.startswith(prefix) for prefix in p['pathPrefixes'])]
                assert len(matches)==1, 'Audio file requires one native-character group: '+member
                part=matches[0]
            elif source['id']=='dayjo-ssbb-zelda-audio':
                part=next((p for p in source['packages'] if member.startswith('extracted/'+p['id']+'/')),None)
            elif source['id']=='github-chiikawa':
                match=re.search(r'/sounds/([^/]+)/',member)
                if match:part=dict(id=match[1],name='吉伊卡哇素材包／'+match[1],heroIds=[])
            elif source['id']=='hive-anime-team-survival':
                part=dict(id=Path(member).stem,name='地圖音訊檔名／'+Path(member).stem,heroIds=[])
            key=source.get('primaryAudioGroupId') or source['id']+(':'+part['id'] if part else '')
            g=group(key,part['name'] if part else source['target'],'本機遊戲' if source.get('accessStatus')=='local-installed-game' else '公開來源',source['id'],
                '來源包／原生目錄對應；不把檔名或包名當成逐段說話者已確認',ids=part['heroIds'] if part else source['heroIds'])
            g['sourceUrl']=source['url'];g['work']=source.get('sourceGame','見來源頁')
            if source.get('audioFormatRevisionOf'):
                g['audioFormatRevisionOf']=source['audioFormatRevisionOf']
                g['countAsNewPerformance']=False
                g['aliasGroupIds']=[source['id'],source['audioFormatRevisionOf']]
            if 'audioConversion' in source:g['conversion']=source['audioConversion']
            if part and part.get('bankAliases'):
                g['bankAliases']=part['bankAliases']
                g['aliasGroupIds']=part.get('aliasGroupIds',[])
            reported_language=(part or {}).get('reportedLanguage') or source.get('reportedLanguage')
            if reported_language:
                g['reportedLanguage']=reported_language
                g['languageEvidence']=source.get('languageEvidence','source description or package label; per-clip listening not verified')
            decoded=decoded_metadata.get(member,{})
            if decoded:
                assert decoded['sha256']==f['sha256'] and decoded['bytes']==f['bytes']
                bank=decoded.get('sourceBank')
                if bank and bank not in g['originalBanks']:g['originalBanks'].append(bank)
            add(g,source['localPath']+'/'+member,f['sha256'],f['bytes'],sid,member,
                seconds=decoded.get('seconds'),original_bank=decoded.get('sourceBank'),
                role=(part or {}).get('audioCategory',source.get('audioCategory','unclassified')),
                source_is_synthetic=decoded.get('sourceIsSynthetic',(part or {}).get('sourceIsSynthetic',source.get('sourceIsSynthetic'))),
                source_contains_synthetic=(part or {}).get('sourceContainsSynthetic',source.get('sourceContainsSynthetic')))
            for field in ['sampleRate','channels','frames','sampleFormat','bitsPerSample',
                          'peakAbsFloat','samplesAboveUnity','gainDecisionRequired',
                          'sourcePath','sourceSha256','reportedLocale','sourceManifestLocale']:
                if field in decoded:files[-1][field]=decoded[field]
            for field in ['sourceContainsSynthetic','sourceIsSynthetic','sourceSynthesisProvider','classificationEvidence']:
                if field in (part or {}):g[field]=part[field]

    audio_leads=[s for s in downloads.get('publicSourceLeads',[])
                 if s.get('resourceRole')=='audio-supplement' or 'audio' in s.get('assetKinds',[])]
    for g in groups.values():
        g['languagePreferenceRank']=language_rank(g.get('reportedLanguage'))
        g['languagePreferenceBasis']='reported-language-only; listening review still required'
    categories={key:Counter() for key in groups}
    for f in files:categories[f['groupId']][f['category']]+=1
    for key,g in groups.items():g['categoryCounts']=dict(categories[key])

    summary=dict(schema='ggd-character-voice-index@1',sourceFileManifest='voice-files.jsonl.gz',
        sourceFileEncoding='gzip',localUncompressedFileManifest='voice-files.jsonl',
        localWorkspace=str(ws),localUseRequiresS3=False,
        languagePreference=['ja','en','other-or-unreviewed'],
        scope='All indexed 300/MBA audio and verified local public/paid source audio; S3 backup readiness is tracked separately. Not all files are character voices.',
        groups=list(groups.values()),backups=stores,inputs=inputs,audioSourceLeads=audio_leads,nativeAudioSources=native_audio,
        alternateAudioSources=alternate_audio,
        acquisitionPolicy=downloads['ingestionPolicy'],
            synthesisContract=dict(trainingInputValidated=False,perClipSpeakerReviewRequired=True,
            perClipLanguageAndTranscriptRequired=True,excludeEffectsAndMusic=True,keepOriginals=True,
            convertedAudioMustKeepSourceHash=True,generatedAudioMustBeLabeledSynthetic=True),
        summary=dict(groups=len(groups),audioFiles=len(files),bytes=sum(f['bytes'] for f in files),
            missingOrSizeChanged=sum(not f['localSizeVerified'] for f in files),
            confirmedVoiceCount=None,synthesisReadyGroups=0,
            alternateFormatFiles=sum(len(s['files']) for s in alternate_audio)))
    manifest=''.join(json.dumps(f,ensure_ascii=False,separators=(',',':'))+'\n' for f in files)
    (OUT/'voice-files.jsonl').write_text(manifest)
    compressed=gzip.compress(manifest.encode(),mtime=0)
    (OUT/'voice-files.jsonl.gz').write_bytes(compressed)
    summary['sourceFileManifestSha256']=hashlib.sha256(compressed).hexdigest()
    summary['uncompressedFileManifestSha256']=hashlib.sha256(manifest.encode()).hexdigest()
    (OUT/'voice-index.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    lines=['# 角色語音索引','',
        '固定共編入口：`materials/hero-model-library/角色語音索引.md`。機器讀 `voice-index.json`；逐檔路徑、SHA-256、大小、封包內路徑與歸屬，依 `sourceFileManifest` 讀取 `voice-files.jsonl.gz`。Git 保存完整 gzip 索引以免大量音訊清單超出單檔限制；解壓後為 JSONL，本機亦保留完整 `voice-files.jsonl`。`query_voice.py` 自動解壓並核對雜湊，無需另裝套件。', '',
        '**本機已驗證音訊立即供其他工作流讀取，不等待 S3 備份。** `query_voice.py --files --json` 回傳每檔 `absolutePath`；`voice-index.json.localWorkspace` 加上逐檔 `path` 也可直接定位。S3 狀態另列，待聽審不妨礙找檔、播放、轉錄及準備素材。', '',
        '**語音查找與選用優先順序：日文 → 英文 → 其他語言／待核。** 所有語言、版本仍完整保留。查詢按來源明列語言排序；作者或安裝包語系只算線索，不等於逐段聽審已確認。LOL 等已存在本機的素材先擷取建檔，不重複下載；缺少的日／英語版本另列補件。', '',
        '音樂、音效與已知含合成播報的來源保留，但 `excludedFromSpeechInput=true`；合成來源依明示證據標記，不把混合音訊庫的每一段都推定為合成。完整備份包含原始格式與轉換檔，主要輸入依不可變交付清單選取，備份完成不會把同一份音訊的 OGG／WAV 重複加入。', '',
        'KOF XV 的 Ash／Mai 優先讀 Float32，以保留原始 Vorbis 超過 1 的峰值；舊 PCM16 共 168 檔仍在 `alternateAudioSources`，`query_voice.py --files --json` 同時回傳 `alternateFiles`。格式修訂維持原 groupId，主要檔數不增加，也不當成新台詞；播放增益需另行決定，原樣本不裁切。', '',
        f'目前索引 **{len(groups)} 個來源角色／共用音訊組、{len(files):,} 個可播放格式檔案**。包含 300 英雄、MBA 與下表列出的公開／付費來源音訊；數字是音訊檔數，**不是已確認角色語音數**。同一音訊的舊備份及診斷 PCM16 不重複計入主要輸入；原始容器與歷史版本仍保留。', '',
        '**目前沒有完成逐段說話者、語言、逐字稿與品質驗收的合成輸入組。** 本索引供其他工作流找檔、聽審與製作輸入清單，不能把全部音效包直接當成角色語音訓練集。`Vo_` 僅是檔名線索；來源角色對應也不等於每段的說話者已確認。', '',
        '先按 groupId 選來源，再讀逐檔清單；逐段確認說話者、語言及台詞，排除技能音效、系統提示、音樂、多人混音與低品質片段。另存切句／轉錄／清理結果及來源 SHA-256，不覆寫原檔。悟空與利姆路優先用 `decoded-audio-float`，保留超過 1.0 的原始浮點峰值，聽審後另作增益處理。生成的語音需標記為合成內容，並記錄所用素材組與處理版本。', '',
        '原始及待聽審音訊存 S3 `legacy/` 並全留本機；索引、SHA-256、轉錄設定與程式進 Git，驗收成品依第三守則進 Git。這份索引不改變 `legacy/` 的人工指定用途規則；其他工作流不得將整個備份自動匯入正式遊戲。', '',
        '## 一鍵複製給工作流','', '```text',
        'Git 分支：codex/hero-model-library-options；PR：https://github.com/adms/GGD/pull/1152',
        '先讀 materials/hero-model-library/角色語音索引.md 與 voice-index.json。',
        '依 voice-index.json.sourceFileManifest 讀取完整 voice-files.jsonl.gz，解壓後按角色／來源 groupId 篩選；保留各版本，不把借用聲音標成本尊。',
        '來源角色、GGD heroIds 與逐段說話者是三個不同欄位；未確認值保持 unknown。',
        '先聽審、轉錄、檢查語言與品質，再建立合成輸入清單；不要把音檔數當成語音數。',
        '本機驗證完成即可取用，不用等待 S3；逐檔查詢的 absolutePath 可直接讀取。',
        '語音優先日文，其次英文；其他語言與版本全部保留。reportedLanguage 不是已確認逐段語言。',
        '本機 workspace：'+str(ws),
        '索引原始 path 相對於上述 workspace；使用 S3 時僅用 vibe-coding profile / ap-east-2。',
        'S3 位置、完整包 SHA-256 與分片順序見 voice-index.json.backups；逐檔 SHA-256 見 voice-files.jsonl。',
        '查詢例：python3 tools/hero-model-library/query_voice.py 莉娜',
        '逐檔例：python3 tools/hero-model-library/query_voice.py mba:Chara02 --files --json',
        '保留原檔；新產出的音訊、逐字稿與合成設定另存，附 source hash、來源角色與 synthetic 標記。',
        '```','', '## 角色與來源分組','',
        '| 角色／資源組 | 來源 ID／GGD 對應 | 可播放檔數 | 語音判定 | 取檔入口 |','|---|---|---:|---|---|']
    for g in groups.values():
        ids='、'.join(g['heroIds']) or '未綁 GGD ID／共用'
        status=('含合成播報的混合來源；排除語音輸入' if g.get('sourceContainsSynthetic') is True else
                '音樂；排除語音輸入' if g['categoryCounts'].get('music')==g['fileCount'] else
                '音效；排除語音輸入' if g['categoryCounts'].get('sound-effect')==g['fileCount'] else
                f'Vo_ 檔名候選 {g["voiceFilenameCandidates"]}；待聽審' if g['voiceFilenameCandidates'] else '待聽審分類')
        language='作者標示 '+g['reportedLanguage']+'；逐段待核' if g.get('reportedLanguage') else '語言待核'
        lines.append(f'| {g["name"].replace("|","／")} | `{g["id"]}`<br>{ids} | {g["fileCount"]} | {status}；{language} | '+ '、'.join('`'+b+'`' for b in g['backupIds'])+' |')
    if audio_leads:
        lines += ['', '## 尚未取得的語音來源','',
            '以下僅是來源線索，不列入已取得檔數；下載失敗不得用其他來源冒充，也不會取消對應模型的查找。','',
            '| 角色／來源 | 來源頁 | 目前狀態 |','|---|---|---|']
        for lead in audio_leads:
            lines.append(f'| {lead["target"]} | [{lead["id"]}]({lead["url"]}) | {lead["verification"]} |')
    if native_audio:
        lines += ['', '## 尚未解碼的原生音訊庫','',
            '原生音訊庫也已歸檔，可按來源 ID 查詢 `nativeAudioSources` 的逐檔 SHA、包內路徑及備份；不混入上方可播放檔數。音訊庫個數與索引條目數均不等於已確認語音數。','',
            '| 來源 | 原生庫檔數 | 備份與狀態 |','|---|---:|---|']
        for source in native_audio:
            lines.append(f'| [{source["name"]}]({source["sourceUrl"]})／`{source["id"]}` | {source["bankFileCount"]} 庫＋{source["standaloneFileCount"]} 原生單檔 | `{source["backupId"]}`；待解碼、逐段說話者／語言核對 |')
    lines += ['', '## 原始包與儲存位置','',
        '| 備份 ID | S3 入口 | 驗證與取用方式 |','|---|---|---|']
    for sid,s in stores.items():
        uri=s.get('s3Uri',s.get('baseUri',''))
        if s.get('publicationStatus')=='local-verified-s3-pending':
            uri='S3 尚未驗證；本機可立即讀取'
            note='本機：`'+s['absoluteLocalRoot']+'`；逐檔 SHA 已驗證，備份另行完成'
        else:
            note='完整 ZIP SHA-256：`'+s['sha256']+'`；`archiveMember` 是包內路徑' if s['type']=='zip' else '分片 tar.gz；依 `parts` 原順序合併，核對各片 SHA-256，再按 archiveMember 解出。原始快照收據，不是本次重新讀回整包。'
        lines.append(f'| `{sid}` | `{uri}` | {note} |')
    lines += ['', '## 驗證範圍與待辦','',
        f'- 本次比較 300／MBA 音訊索引與既有備份逐檔 SHA-256、大小，並檢查本機檔案存在及大小；異常 {summary["summary"]["missingOrSizeChanged"]} 筆。本次未重新雜湊全部音訊二進位，也未重新下載歷史 S3 整包。',
        '- 公開／付費來源的已驗證本機音訊可立即使用；最新本機修訂優先，S3 備份是否讀回另列。所有角色／形態、語言與台詞需在逐段聽審後確認，合成可用狀態仍維持未驗收。',
        '- 模型庫、原生音訊庫與已解碼音訊分別記錄。模型取得狀態見全角色模型盤點；來源語音是否已取得以本索引逐筆收據為準，尚未取得的目錄或分享頁不混入檔數。',
        '- NS 日語包的相同 bank 依 SHA 共用解碼，原始 350 banks／68 命名群與配色對照全部保留於 bankAliases；65 組解碼輸入涵蓋這些別名。vc_kirby_copy_cloud 是卡比複製能力音訊，不代表克勞德本人。查詢 aliasGroupIds 會返回明列別名的共用來源，不能據此推定說話者相同。',
        '- 尚無 GGD ID 的來源組仍可查詢及準備素材；不能因未上架而刪除。新增音訊來源後重跑本產生器，保留其他來源及不同語言版本。',
        '- 重建：`python3 tools/hero-model-library/voice_index.py --workspace ..`。模型／素材守則見 `全角色模型盤點.md`。','']
    report='\n'.join(lines)
    (OUT/'角色語音索引.md').write_text(report)
    for target in [ws/'角色語音索引.md',ws/'GGD-Asset-Library/角色語音索引.md']:
        target.write_text(report)
    print(json.dumps(summary['summary'],ensure_ascii=False))


if __name__=='__main__':main()

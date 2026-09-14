#!/usr/bin/env python3
"""Build a compact view from local source evidence, or check the view from Git only."""
import argparse,gzip,hashlib,json
from pathlib import Path
REPO=Path(__file__).resolve().parents[4]
DEST=REPO/'materials/hero-model-library/priority-evidence/ssbu-ultimate-nsandns2-20260914'
MOTIONS='materials/hero-model-library/source-inventories/ultimate14-native-motions.json'
WINDOWS='materials/hero-model-library/source-inventories/windows-game-library.json.gz'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def pin(p):return {'gitPath':p,'sha256':sha(REPO/p)}
MAP={'nuanmbPaths':'pathCount','bodyMotionPaths':'bodyMotionPathCount','accessoryMotionPaths':'accessoryMotionPathCount','modelMetadataPaths':'modelAnimationMetadataPathCount','uniqueTransformPayloads':'uniqueTransformMotionPayloadCount'}
def build(path):
    d=read(path);fighters=[]
    for f in d['fighters']:
        cs=f['otherSourceBodyCandidates']
        assert len(cs)==8 and all(c['existsLocal'] and c['freshSizeVerified'] and not c['freshShaVerified'] for c in cs)
        fighters.append({'nativeFighterId':f['nativeFighterId'],'nameZh':f['nameZh'],'originalName':f['originalName'],**{k:f['counts'][v] for k,v in MAP.items()},'motionTargets':sorted({x['targetId'] for x in f['formsAndCostumes']}),'motionCostumes':sorted({x['costumeId'] for x in f['formsAndCostumes']}),'bodyCandidateCount':len(cs)})
    ns=d['nsandns2'];remote=[]
    for r in ns['records']:
        if r['matchingGame']=='Super Smash Bros. Ultimate':
            remote.append({'windowsAbsolutePath':r['windowsAbsolutePath'],'bytes':int(r['rawScanRecord']['SizeBytes']),'payloadSha256':None,'status':'inventory-only','headerVerified':False,'memberInventoryVerified':False,'extracted':False,'converted':False,'fileNameLabelsUnverified':r['fileNameLabelsUnverified']})
    return {'schema':'ggd-ssbu-ultimate-nsandns2-compact-evidence@1','auditedAt':d['auditedAt'],'sourceId':'parallel-ns-ultimate14','sourceGame':'Super Smash Bros. Ultimate / Ultimate14 community MOD','platform':'Nintendo Switch','definitionOfSixteen':d['definitionOfSixteen'],'fixedMotionIndex':pin(MOTIONS),'fixedWindowsIndex':pin(WINDOWS),'motionSummary':d['authoritativeMotionSummary'],'fighters':fighters,'sourceArchive':d['sourceArchive'],'localSourceVerification':d['sourceFilesReverified'],
    'bodyCandidates':{'sourceId':'gitlab-ssbu-models','nativePathPattern':'fighter/{nativeFighterId}/model/body/{c00-c07}/*.blend','fighterCount':16,'filesPerFighter':8,'totalFiles':128,'existenceAndSizeChecked':True,'payloadHashesRecomputed':False,'skeletonPairingValidated':False,'conversionAcceptanceEstablished':False,'limitation':'A separate-source body candidate set; this audit checked paths and sizes only, not 128 new SHA verifications or model readiness.'},
    'sourceStageCounts':{
        'ultimate14CommunityMod':{'verifiedContainerFiles':1,'verifiedExtractedFiles':d['sourceFilesReverified']['files'],'identifiableFighterGroups':len(fighters),'fullCharacterBodyModels':0,'nuanmbPaths':d['authoritativeMotionSummary']['pathCount'],'uniqueTransformMotionPayloads':d['authoritativeMotionSummary']['uniqueTransformMotionPayloadCount'],'convertedAndAcceptedCharacters':0,'backendSelectableCharacters':0},
        'worldblenderBodyCandidates':{'identifiableFighterGroups':len(fighters),'bodyCandidateFiles':sum(len(f['otherSourceBodyCandidates']) for f in d['fighters']),'freshPayloadHashes':0,'skeletonValidatedModels':0,'convertedAndAcceptedModels':0,'backendSelectableModels':0},
        'nsandns2GameContainers':{'inventoryOnlyContainerFiles':len(remote),'payloadBytesRead':ns['originalScanReceipt']['romPayloadBytesRead'],'identifiableFightersFromPayload':0,'modelFilesIdentified':0,'motionFilesIdentified':0,'extractedFiles':0,'convertedFiles':0,'acceptedFiles':0,'backendSelectableModels':0}
    },
    'otherNativeGroups':{'parameterOrMotionListOnly':['common','mariod','samus'],'audioOnly':['luigi'],'notAddedToSixteenMotionFighters':True},
    'decodedAudioRevision':{'sourceId':d['audioDecodedRevision']['sourceId'],'indexSha256':d['audioDecodedRevision']['index']['sha256'],'counts':d['audioDecodedRevision']['counts'],'languageSpeakerEventsReviewed':False},
    'nsandns2':{'windowsRoot':r'E:\Game\單機遊戲\模擬器\NSandNS2','computerName':ns['originalScanReceipt']['computerName'],'scanGeneratedAt':ns['originalScanReceipt']['generatedAt'],'scanArchive':ns['archive'],'scanArchiveMemberCount':len(ns['archiveMembers']),'scanArchiveMembersMatchLocal':True,'originalScanPayloadBytesRead':ns['originalScanReceipt']['romPayloadBytesRead'],'records':remote,'mountSnapshot':ns['mountSnapshot'],'limitation':'Historical metadata only; NSP title/version/DLC, archive members and payload hashes remain unverified.'},
    'readiness':{'newAcquisitionCount':0,'fullCharacterModelsInUltimate14':0,'runtimeSelectable':False,'deployed':False,'marioExperimentNote':'A separate five-body-motion local conversion experiment does not establish a complete original moveset or 16-character completion.'},
    'localDetailReport':{'absolutePath':str(path.resolve()),'sha256':sha(path)},'workflowGitPath':'tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1','largeEvidencePolicy':'Archives, all-file hashes and full reconciliation remain local. This is a compact view of existing fixed indexes.'}
def md(d):
    out=['# Ultimate「16 名」與 NSandNS2 核對','', '「16 名」指 Ultimate14 社群 MOD 中有 NUANMB 的 16 個 fighter 路徑群。435 個路徑分為 282 個身體動作、129 個部件／複製動作及 24 個模型中繼資料；411 個變換動作路徑去重為 175 份內容。','', '既有固定入口：[原生動作 JSON](../../source-inventories/ultimate14-native-motions.json)、[Windows 來源索引](../../source-inventories/windows-game-library.json.gz)。本頁由同目錄 [reconciliation.json](reconciliation.json) 產生，完整逐檔關係仍由固定索引維護。','', '| 角色 | 原生 ID | NUANMB | 身體 | 部件／複製 | 中繼資料 |','|---|---|---:|---:|---:|---:|']
    for f in d['fighters']:out.append(f"| {f['nameZh']} | {f['nativeFighterId']} | {f['nuanmbPaths']} | {f['bodyMotionPaths']} | {f['accessoryMotionPaths']} | {f['modelMetadataPaths']} |")
    s=d['sourceStageCounts'];u=s['ultimate14CommunityMod'];w=s['worldblenderBodyCandidates'];n=s['nsandns2GameContainers']
    out+=['','重新 SHA 驗證 Ultimate14 原包及清單內 1,071 檔／112,082,424 bytes，0 不一致；435 aliases 全數吻合固定動作索引。','', '這三個來源層不能合併計數。NSandNS2 容器 payload 尚未讀取，所以目前從遊戲容器本身可辨識的角色、模型與動作都是 0；16 名只來自另一份 Ultimate14 MOD。','', '| 來源層 | 容器／候選檔 | 可辨識角色群 | 模型 | 動作 | 已轉換驗收 | 後台可選 |','|---|---:|---:|---:|---:|---:|---:|',f"| Ultimate14 社群 MOD | {u['verifiedContainerFiles']} 個已驗證原包／{u['verifiedExtractedFiles']} 個解包檔 | {u['identifiableFighterGroups']} | 0 個完整角色本體 | {u['nuanmbPaths']} 路徑／{u['uniqueTransformMotionPayloads']} 種變換內容 | 0 名 | 0 名 |",f"| Worldblender body 候選 | {w['bodyCandidateFiles']} | {w['identifiableFighterGroups']} | 128 個只核對大小的 `.blend` | 0 個本次驗收 | 0 個 | 0 個 |",f"| NSandNS2 遊戲容器 | {n['inventoryOnlyContainerFiles']} | {n['identifiableFightersFromPayload']} | {n['modelFilesIdentified']} | {n['motionFilesIdentified']} | {n['acceptedFiles']} | {n['backendSelectableModels']} |",'', '另一來源 Worldblender 的這 16 名，每人已有 c00–c07 body Blender 候選，共 128 份。本次只核對存在與大小，未重新計算這 128 份的 SHA、配對骨架或驗收模型。Ultimate14 本身不含完整角色本體。','', 'Kirby 的 daisybody／richterbody／samusdbody／sonicbody 是複製能力 target；common、mariod、samus 是參數／motion_list，Luigi 僅音訊，均不增加 16 名。已有獨立 19 WAV 解碼版，保留 56 個配色 bank 關係／152 個容器條目；說話者、語言與事件尚未聽審。','', 'NSandNS2：`'+d['nsandns2']['windowsRoot']+'`。LV99 原掃描 payload 讀取 0 bytes；以下只表示盤點時存在的 metadata，不表示格式、版本或 DLC 已驗證，也不表示已擷取、轉換或部署。','', '| 容器檔名 | 盤點大小 |','|---|---:|']
    for r in d['nsandns2']['records']:out.append(f"| `{r['windowsAbsolutePath'].split(chr(92))[-1]}` | {r['bytes']:,} B |")
    out+=['','核對當時 `/Volumes/game` 未掛載；Steam 的 `common` 分享不是此來源。若既有 game 分享可用，Finder Cmd-K → `smb://lv99/game`，沿用既有登入。Windows 可先用 `Get-SmbShare -Name game | Select-Object Name,Path` 只讀確認分享路徑；不必提供聊天密碼或改 ACL。','', '只讀 [工具與重跑方式](../../../../tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/README.md)。PowerShell helper 尚未在 Windows 執行；預設 metadata-only，`-InspectContainers` 只讀表頭／成員表，`-HashPayload` 才完整計算 SHA，不解密或執行來源內容。','', '固定 JSON 的 SHA、完整本機報告位置、128 份 body 候選的查核限制及分階段狀態皆保留於 reconciliation.json。這批沒有新增取得素材、後台選項或部署。']
    return '\n'.join(out)+'\n'
def check(d):
    for key in ['fixedMotionIndex','fixedWindowsIndex']:assert sha(REPO/d[key]['gitPath'])==d[key]['sha256'],key+' SHA mismatch'
    native=read(REPO/MOTIONS);assert d['motionSummary']==native['summary']
    assert len(d['fighters'])==16 and {f['nativeFighterId'] for f in d['fighters']}==set(native['fighters'])
    for f in d['fighters']:
        n=native['fighters'][f['nativeFighterId']]
        for k,v in MAP.items():assert f[k]==n[v],(f['nativeFighterId'],k)
        aliases=[a for a in native['aliases'] if a['fighterId']==f['nativeFighterId']]
        assert f['motionTargets']==sorted({a['target'] for a in aliases})
        assert f['motionCostumes']==sorted({a['costume'] for a in aliases})
    assert sum(f['bodyCandidateCount'] for f in d['fighters'])==128
    assert not d['bodyCandidates']['payloadHashesRecomputed'] and not d['bodyCandidates']['skeletonPairingValidated']
    s=d['sourceStageCounts']
    assert s['ultimate14CommunityMod']=={'verifiedContainerFiles':1,'verifiedExtractedFiles':1071,'identifiableFighterGroups':16,'fullCharacterBodyModels':0,'nuanmbPaths':435,'uniqueTransformMotionPayloads':175,'convertedAndAcceptedCharacters':0,'backendSelectableCharacters':0}
    assert s['worldblenderBodyCandidates']=={'identifiableFighterGroups':16,'bodyCandidateFiles':128,'freshPayloadHashes':0,'skeletonValidatedModels':0,'convertedAndAcceptedModels':0,'backendSelectableModels':0}
    assert s['nsandns2GameContainers']=={'inventoryOnlyContainerFiles':3,'payloadBytesRead':0,'identifiableFightersFromPayload':0,'modelFilesIdentified':0,'motionFilesIdentified':0,'extractedFiles':0,'convertedFiles':0,'acceptedFiles':0,'backendSelectableModels':0}
    assert d['nsandns2']['originalScanPayloadBytesRead']==0
    windows=json.loads(gzip.decompress((REPO/WINDOWS).read_bytes()))
    records={r['sourcePath']:r for r in windows['romCandidates']}
    assert len(d['nsandns2']['records'])==3
    for r in d['nsandns2']['records']:
        n=records[r['windowsAbsolutePath']];assert r['bytes']==n['sizeBytes']
        assert r['payloadSha256'] is None and r['status']=='inventory-only'
        assert not any(r[k] for k in ['headerVerified','memberInventoryVerified','extracted','converted'])
    assert d['readiness']['newAcquisitionCount']==0 and not d['readiness']['runtimeSelectable'] and not d['readiness']['deployed']
    assert (DEST/'README.md').read_text()==md(d),'Regenerate README with --build-from'
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-from',type=Path,help='Explicit full local report; regenerate compact JSON and README')
    parser.add_argument('--check',action='store_true',help='Read-only Git checks, also the default')
    args=parser.parse_args()
    if args.build_from:
        result=build(args.build_from);(DEST/'reconciliation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');(DEST/'README.md').write_text(md(result))
    check(read(DEST/'reconciliation.json'))
    print(json.dumps({'ok':True,'fighters':16,'nuanmbPaths':435,'transformPaths':411,'bodyCandidatesSizeOnly':128,'romRecordsMetadataOnly':3,'nsandns2IdentifiableFighters':0,'nsandns2IdentifiedModels':0,'nsandns2IdentifiedMotions':0}))

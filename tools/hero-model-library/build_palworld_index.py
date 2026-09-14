"""Publish the three requested Palworld reserves from pinned source deliveries."""
import argparse
import hashlib
import json
from pathlib import Path

from voice_index import audio_index_files, public_archive_member

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'materials/hero-model-library'
TITLE = '帕魯三角色素材索引'
IDENTITIES = [
    ('jetragon', '空渦龍', 'Jetragon', 'JetDragon', 'gamevault-palworld-jetragon-cries'),
    ('astralym', '枯星龍', 'Astralym', 'WorldTreeDragon', 'gamevault-palworld-astralym-audio'),
    ('cattiva', '搗蛋貓', 'Cattiva', 'PinkCat', 'palworld-cattiva-gamevault'),
]


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def model_components(data, repo=ROOT):
    """Expose verified component copies without inventing hero/runtime registration."""
    result = []
    for character in data['characters']:
        for candidate in character['modelCandidates']:
            if not candidate.get('componentReady'):
                continue
            assert candidate.get('runtimeSelectable') is False
            assert candidate.get('defaultEligible') is False
            relative = candidate['gitPath']
            expected = 'content/assets/models/community/' + candidate['sha256'] + '.glb'
            assert relative == expected, 'Unexpected component path: ' + relative
            path = repo / relative
            assert path.is_file() and path.stat().st_size == candidate['bytes']
            assert sha(path) == candidate['sha256'], 'Changed component: ' + relative
            result.append(dict(candidate, characterIdentity=character['backlogIdentity'],
                characterName=character['name'], gitAbsolutePath=str(path.resolve()),
                ggdHeroImplemented=False, runtimeDropdownRegistered=False))
    return result


def build(workspace):
    paths = [BASE / 'download-sources.json', BASE / 'public-source-files.json',
             BASE / 'design-backlog/sources-supplemental.json', BASE / 'palworld/character-settings.json',
             BASE / 'priority-evidence/palworld-hero-integration/receipt.json']
    downloads, archives, supplemental, settings, integration_receipt = [read(path) for path in paths]
    integrations = {row['identityId']: row for row in integration_receipt['integrations']}
    sources = {row['id']: row for row in downloads['publicSources']}
    archived = {row['id']: row for row in archives['sources']}
    identities = {row['id']: row for row in supplemental['characters']}
    characters = []
    for key, name, english, code, audio_id in IDENTITIES:
        identity = identities['community:palworld-' + key]
        models = []
        for candidate in identity['modelCandidates']:
            local = Path(candidate['path'])
            local = local if local.is_absolute() else workspace / local
            assert local.is_file() and local.stat().st_size == candidate['bytes']
            assert sha(local) == candidate['sha256']
            models.append(dict(candidate, absolutePath=str(local.resolve())))
        model_sources = []
        for source_id in identity['sourceIds']:
            source = sources[source_id]
            if source.get('modelCount', 0) == 0:
                continue
            backup = source['backup']
            assert backup['readbackVerified'] and archived[source_id]['sha256'] == backup['sha256']
            label = 'OP.GG' if 'opgg' in source_id else ('AtlasForge' if 'atlasforge' in source_id else 'ShinyPenguin FBX')
            model_sources.append(dict(id=source_id, label=label, sourceUrl=source['url'], localPath=source['localPath'],
                absoluteLocalRoot=str((workspace / source['localPath']).resolve()),
                nativeAnimationCount=source.get('nativeAnimationCount', 0),
                animationClipCount=source.get('animationClipCount', source.get('nativeAnimationCount', 0)),
                uniqueAnimationContentCount=source.get('uniqueAnimationContentCount'),
                backendIntegration=source['backendIntegration'], backup=backup))
        audio_source = sources[audio_id]
        audio = audio_index_files(audio_source, workspace)
        assert len(audio) == audio_source['audioCount'] == 6
        archive = archived[audio_id]
        saved = {row['path']: row for row in archive['files']}
        audio_files = []
        for row in audio:
            local = workspace / audio_source['localPath'] / row['path']
            assert row['bytes'] == saved[row['path']]['bytes'] == local.stat().st_size
            assert row['sha256'] == saved[row['path']]['sha256'] == sha(local)
            audio_files.append(dict(row, absolutePath=str(local.resolve()),
                archiveMember=public_archive_member(archive, row['path']),
                sourceUrl=audio_source['url'], category='sound-effect', synthesisReady=False))
        forms = [form for form in settings['forms'] if form['character'] == english]
        assert forms and forms[0]['factualFields']['Stats']['Code'] == code
        integration = integrations[identity['id']]
        assert integration['heroId'] in identity.get('mappedHeroIds', [])
        assert integration['backendDropdownRegistered'] is True
        assert integration['ggdHeroAuthoringComplete'] is True
        assert integration['heroForgePackageVerified'] is True
        assert integration['localHeroForgeModelSelectable'] is True
        assert integration['sourceFidelity']['sourceFaithfulAudiovisualComplete'] is False
        assert integration['productionDeploymentVerified'] is False
        characters.append(dict(id=key, name=name, englishName=english, sourceCode=code,
            backlogIdentity=identity['id'], modelCandidates=models, modelSources=model_sources,
            audioSourceId=audio_id, audioFiles=audio_files, audioBackup=audio_source['backup'],
            settingsForms=forms, spokenDialogueCount=0, standaloneVfxAcquired=False,
            skillSpecificSfxAcquired=False, ggdHeroImplemented=True,
            heroId=integration['heroId'], heroIntegration=integration,
            backendDropdownRegistered=True, productionDeploymentVerified=False,
            ggdHeroAuthoringComplete=True, localHeroForgeModelSelectable=True,
            sourceFaithfulAudiovisualComplete=False,
            formalModelAdoption=integration['formalModelAdoption'],
            productionRuntimeSelectableVerified=False,
            status=('ggd-authoring-complete-source-av-review-pending-production-unverified'
                if integration['formalModelAdoption']['currentPolicyEligible']
                else 'ggd-authoring-complete-formal-model-adoption-blocked-source-av-review-pending-production-unverified')))
    result = dict(schema='ggd-palworld-three-resource-index@1',
        inputs=[dict(gitPath=str(path.relative_to(ROOT)), sha256=sha(path)) for path in paths],
        characterCount=len(characters), modelSourceCount=sum(len(c['modelSources']) for c in characters),
        preservedModelFileCount=sum(len(c['modelCandidates']) for c in characters),
        distinctCryCount=sum(len(c['audioFiles']) for c in characters),
        characterSettingsGitPath='materials/hero-model-library/palworld/character-settings.json',
        heroIntegrationReceipt='materials/hero-model-library/priority-evidence/palworld-hero-integration/receipt.json',
        characters=characters,
        limitations=['Source copies and intermediate models require manual use from S3 legacy.',
            'Creature cries are sound effects, not Japanese or English spoken dialogue.',
            'PalDB settings are community snapshots, not original game DataTables or GGD abilities.',
        'Khronos structural validation does not prove material fidelity or GGD runtime acceptance.',
        'The three GGD Hero Forge authoring packages are complete and locally selectable. Astralym now has a separately validated 7,996-triangle historical candidate registered as a non-default option; production deployment remains unverified.',
        'Local authoring completeness does not prove original Palworld audiovisual fidelity or production deployment.',
        'Hero Forge package acceptance and dropdown registration are local authoring evidence; production deployment remains unverified.'])
    components = model_components(result)
    result['gitModelComponentCount'] = len(components)
    result['gitModelComponents'] = components
    return result


def render(data):
    lines = ['# ' + TITLE, '',
        '固定入口；模型、動作、叫聲與角色／技能設定可由同名 JSON 查詢。三位均已列入 [已取得模型待設計英雄](../已取得模型待設計英雄.md)。', '',
        '來源與半成品已保留本機並備份 S3 `legacy/`。三名均已是完整的 GGD Hero Forge authoring：六技能配方、六態模型文件、精確來源套件與 acquired-model 後台下拉選項已通過本機驗證。「尚未成為完整英雄」是過期標示；仍未完成的是原作獨立 VFX、招式專屬 SFX、叫聲與動作逐項審查，以及正式站部署驗證。', '',
        '| 角色 | 模型來源 | 動作 | 叫聲 | 設定資料 |',
        '|---|---|---|---|---|']
    for c in data['characters']:
        source_links = '、'.join(f"[{s['label']}]({s['sourceUrl']})" for s in c['modelSources'])
        motion = '；'.join(f"{s['label']}：{s['animationClipCount']} 段" +
            (f"／{s['uniqueAnimationContentCount']} 種內容" if s['uniqueAnimationContentCount'] else '') +
            (f"（{s['nativeAnimationCount']} 段有變動）" if s['nativeAnimationCount'] != s['animationClipCount'] else '')
            for s in c['modelSources'])
        form_labels = {'normal': '一般形態', 'Nullstar_Calamity_Zenara_%26_Astralym': '首領',
                       'Blightstar_Calamity_Zenara_%26_Astralym': '高難度首領'}
        forms = '；'.join(f"{form_labels.get(f['form'], f['form'])}：{len(f['activeSkills'])} 條技能" for f in c['settingsForms'])
        lines.append(f"| {c['name']}／{c['englishName']} | {source_links} | {motion} | 6 段非語言叫聲 | {forms} |")
    lines += ['', f"全部保留 {data['preservedModelFileCount']} 個原始、解壓與材質版本，其中 {data['gitModelComponentCount']} 份模型元件可從 Git 取得。這些版本不是不同角色。空渦龍的 `Carrying` 與 `Carrying_Start` 內容相同；枯星龍的 `HaloCutter_Loop_Ring` 為固定姿勢。搗蛋貓另有 AtlasForge 的單一待機版本。", '',
        '## Git 模型元件', '',
        '固定共用入口 `materials/asset-library/current-resources.json → modelComponents`。此處列的是可重用模型元件；Hero Forge 現行默認模型及下拉註冊見同名 JSON 的 `characters[].heroIntegration`。其他保留版本須有完整 model@1、六態映射與人工驗收後才能新增選項。', '',
        '| 角色 | Git 模型檔 | 本版動作條目 | 限制 |', '|---|---|---|---|']
    for c in data['gitModelComponents']:
        limitations = c.get('limitations', [])
        if isinstance(limitations, str):
            limitations = [limitations]
        lines.append(f"| {c['characterName']} | [{c['id']}](<{c['gitAbsolutePath']}>) | {c.get('animationClipCount', c.get('nativeAnimationCount', 0))} | "
            + '；'.join(str(x).replace('|', '／') for x in limitations + ['已有獨立 Hero Forge 成品；本元件本身仍待六態與候選選項驗收']) + ' |')
    lines += ['',
        '## 本機直接取用', '', '音訊事件包含 Normal、Joy、Anger、Sorrow、Pain、Death；MP3 與 WAV 編碼副本不重複計為新叫聲。', '']
    for c in data['characters']:
        lines += ['### ' + c['name'], '',
            '模型檔與 SHA：同名 JSON 的 `characters[] → modelCandidates`。全部來源根目錄：', '']
        for s in c['modelSources']:
            lines.append(f"- [{s['label']} 本機資料夾](<{s['absoluteLocalRoot']}>)；[來源]({s['sourceUrl']})")
        lines += ['', '| 保留版本 | 動作條目 | 處理狀態 | 本機檔案 |', '|---|---|---|---|']
        for m in c['modelCandidates']:
            stage = m['readiness'].lower()
            if m.get('componentReady'):
                label = '材質與限制檢查通過；待英雄綁定'
            elif 'diagnostic' in stage:
                label = '診斷中間檔保留；採用後續修正版'
            elif stage.startswith('material-bound'):
                label = '材質已綁定；資源限制／英雄綁定待處理'
            elif 'material' in stage:
                label = '待材質／GGD 標準化'
            else:
                label = '來源／修正版保留；待 GGD 標準化'
            lines.append(f"| {m.get('label', m['id'])} | {m.get('animationClipCount', m.get('nativeAnimationCount', 0))} | {label} | [{Path(m['path']).name}](<{m['absolutePath']}>) |")
        lines += ['', '| 事件 | 本機音訊 |', '|---|---|']
        for a in c['audioFiles']:
            event = a.get('event') or a.get('label') or a.get('eventName') or Path(a['path']).stem
            lines.append(f"| {event} | [{Path(a['path']).name}](<{a['absolutePath']}>) |")
        lines += ['', 'S3 音訊來源備份：`' + c['audioBackup']['s3Uri'] + '`。', '']
    lines += ['## 設定與待完成項目', '',
        '[角色與技能設定 JSON](character-settings.json) 保留 5 份資料頁、34 條技能與空渦龍／搗蛋貓各 5 階夥伴技能。枯星龍一般資料沒有學習技能列；兩個首領形態各 8 條，分別保存。', '',
        '三份 Hero Forge 成品已有六技能配方、六態映射、model@1 與後台 acquired-model 選項，現行 34 名批次的本機編譯、套件與精確來源檢查全數通過。因此三名在 GGD authoring 層已是完整英雄。空渦龍與搗蛋貓的現行模型符合正式採用幾何政策；枯星龍另有由 23,928 面歷史五動作原件產生的 7,996 面候選，材質／骨架／蒙皮／方向／五段原生動作／Khronos／現行 budget 及三視角 A/B 均驗證完成，已登記為非預設選項。三份 256px 獨立元件另行保留；另一份枯星龍元件版只有 Idle／Walk，不冒稱它等同五動作候選。原作影音保真仍未完成：未取得獨立招式特效、招式專屬音效、原始 Unreal／Wwise 資料庫或人類語句；18 段叫聲與 18 個現行动作語意候選仍待使用者逐項審查。正式站尚未驗證部署。', '',
        '維護：更新來源與補充身份索引後，執行 `python3 tools/hero-model-library/build_palworld_index.py --workspace ..`；加 `--check` 檢查文件是否與來源一致。', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=ROOT.parent)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build(args.workspace.resolve())
    products = {BASE / 'palworld' / (TITLE + '.json'): json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                BASE / 'palworld' / (TITLE + '.md'): render(data)}
    for path, value in products.items():
        if args.check:
            assert path.read_text() == value, 'Stale Palworld index: ' + str(path)
        else:
            path.write_text(value)
    print(json.dumps({k: data[k] for k in ['characterCount', 'modelSourceCount', 'preservedModelFileCount', 'distinctCryCount']}))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Admit Ultimate14's verified decoded audio as a non-hero supplement.

The upstream MOD remains the authoritative native-container source.  This
adds one decoded representation without assigning a hero, speaker, language,
event, default, or backend selection.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
LIBRARY = REPO / 'materials/hero-model-library'
ROOT = WORKSPACE / 'GGD-Asset-Library/conversions/ultimate14-audio-decoded-20260911-v1'
SOURCE_ID = 'parallel-ns-ultimate14-audio-decoded-v1'
UPSTREAM_ID = 'parallel-ns-ultimate14'
EXPECTED_REPORT_SHA = '773a70c4ec1527f14890a5ec5727e7273da49c009bb10fee05a5574c4466d77e'


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write_same(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if path.exists() and path.read_bytes() != data:
        raise ValueError('Refusing to overwrite different evidence: ' + str(path))
    if not path.exists():
        path.write_bytes(data)


def source_entry(report, upstream):
    groups = report['audioGroups']
    if (report.get('sourceId') != SOURCE_ID or report.get('upstreamSourceId') != UPSTREAM_ID
            or report.get('physicalBankAliasCount') != 56 or report.get('uniqueBankCount') != 7
            or report.get('physicalNativeEntryCount') != 152 or report.get('decodedWavCount') != 19
            or len(report.get('files', [])) != 19 or sum(group['fileCount'] for group in groups) != 19):
        raise ValueError('Unexpected Ultimate14 decoded report counts')
    for row in report['files']:
        local = ROOT / row['path']
        if (not local.is_file() or local.stat().st_size != row['bytes'] or sha(local) != row['sha256']
                or row.get('format') != 'wav-pcm' or row.get('heroIds') or row.get('synthesisReady') is not False):
            raise ValueError('Decoded audio row differs from verified report: ' + row['path'])
    return {
        'id': SOURCE_ID,
        'target': 'Ultimate14／NS 7 個原生 patch3audio 唯一內容／56 配色 alias 解碼音訊 v1',
        'heroIds': [], 'ownerEntryIds': [],
        'url': 'https://github.com/CSharpM7/Ultimate14-release/releases/tag/1.0',
        'author': 'CSharpM7', 'uploader': 'CSharpM7',
        'sourceGame': 'Super Smash Bros. Ultimate',
        'sourceWork': '任天堂明星大亂鬥 特別版／Ultimate14 MOD',
        'platform': 'Nintendo Switch', 'sourceVersion': 'Ultimate14 1.0',
        'selectionClass': 'community-mod', 'sourceClass': 'community-mod',
        'nativeCharacterId': 'multiple fighter sound-effect source labels; no verified speaker identity',
        'originalCharacterName': 'multiple source-labelled fighters',
        'originalCharacterWork': 'Super Smash Bros. Ultimate',
        'format': 'Nintendo patch3audio -> PCM16 WAV',
        'accessStatus': 'local-existing-source-conversion',
        'acquisitionStatus': 'downloaded-verified',
        'acquisitionMethod': 'decoded-existing-local-author-mod',
        'countsAsNewAcquisition': False, 'resourceRole': 'audio-supplement',
        'assetKinds': ['audio', 'sound-effect-candidate'],
        'modelCount': 0, 'audioCount': 19, 'nativeAnimationCount': 0, 'vfxCount': 0,
        'sourceBankAliasCount': 56, 'physicalNativeEntryCount': 152, 'uniqueNativeBankCount': 7,
        'defaultEligible': False, 'automaticEligible': False,
        'purchaseDecision': 'no-purchase-existing-source',
        'localPath': ROOT.relative_to(WORKSPACE).as_posix(),
        'audioFileIndex': {'reportPath': 'audioFileIndex.json', 'reportSha256': EXPECTED_REPORT_SHA},
        'primaryAudioFormats': ['.wav'], 'audioGroups': groups,
        'audioFormatRevisionOf': UPSTREAM_ID,
        'audioFormatNote': 'Decoded representation of seven byte-identical native bank contents. All 56 costume aliases and 152 source entries remain recorded; 19 decoded streams are not 152 unique clips or confirmed voices.',
        'upstreamSourceId': UPSTREAM_ID,
        'upstreamLocalRoot': str(WORKSPACE / upstream['localPath']),
        'upstreamNativeAudioIndex': upstream['nativeAudioIndex'],
        'upstreamBackupReference': copy.deepcopy(upstream['backup']),
        'sourceFileManifest': {'path': 'files-sha256.json', 'sha256': sha(ROOT / 'files-sha256.json')},
        'verification': '56 個原生 patch3audio 配色路徑逐檔 SHA-256 核對，保留為 7 個 byte-identical bank alias；依 r2117 metadata 解出 19 個 stream。每段 WAV 皆核對 PCM frames/rate/channels、ffmpeg 全檔解碼與 vgmstream byte-identical 重播。S3 ZIP 及逐檔讀回另行驗證；se_ 名稱不作語言、說話者或技能事件確認。',
        'readiness': 'decoded-local-verified-pending-listening-classification-and-character-mapping',
        'publicationStatus': 'local-verified-s3-pending',
        'reportedLanguage': 'unreviewed',
        'languageEvidence': 'se_ source labels do not establish language, speaker, dialogue, vocalization or skill-event identity.',
        'confirmedVoiceCount': None, 'synthesisReady': False, 'runtimeReady': False,
        'backendIntegration': {'required': True, 'state': 'pending-character-mapping', 'heroIds': [],
                               'selectionVerified': False, 'release': None,
                               'note': 'Audio-only derivative of a MOD without a character body; no dropdown/default/deployment.'},
        'audioAcquisition': {'decodedWavFiles': 19, 'uniqueNativeBanks': 7,
                             'physicalBankAliases': 56, 'physicalNativeEntries': 152,
                             'seconds': report['totalSeconds'], 'bytes': report['totalAudioBytes'],
                             'countAsNewPerformance': False},
        'limitations': report['limitations'] + ['No original-game character body is in this MOD delivery.',
                                                'No language/speaker/event listening classification or GGD hero mapping.']
    }


def merge_once(rows, item):
    matches = [row for row in rows if row.get('id') == item['id']]
    if not matches:
        rows.append(copy.deepcopy(item))
        return
    if len(matches) != 1:
        raise ValueError('Duplicate decoded source ID')
    existing = matches[0]
    for key, value in item.items():
        if key in existing and existing[key] != value and key != 'publicationStatus':
            raise ValueError('Existing source differs from verified proposal: ' + key)
    for key, value in item.items():
        existing.setdefault(key, copy.deepcopy(value))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report_path = ROOT / 'audioFileIndex.json'
    if sha(report_path) != EXPECTED_REPORT_SHA:
        raise ValueError('Decoded report pin changed')
    report = json.loads(report_path.read_text(encoding='utf-8'))
    downloads_path = LIBRARY / 'download-sources.json'
    before = downloads_path.read_bytes()
    downloads = json.loads(before)
    upstream_rows = [row for row in downloads['publicSources'] if row['id'] == UPSTREAM_ID]
    if len(upstream_rows) != 1:
        raise ValueError('Expected one Ultimate14 upstream source')
    upstream = upstream_rows[0]
    item = source_entry(report, upstream)
    addition = {'sourceId': SOURCE_ID, 'audioFormatRevisionOf': UPSTREAM_ID,
                'localRoot': str(ROOT), 'audioFileIndex': item['audioFileIndex'],
                'decodedFiles': 19, 'uniqueNativeBanks': 7, 'physicalBankAliases': 56,
                'physicalNativeEntries': 152, 'nativeSourcesPreserved': True,
                'countAsNewPerformance': False}
    admission = {'schema': 'ggd-audio-decoded-admission@1', 'source': item,
                 'upstreamAddition': addition, 'reportSha256': EXPECTED_REPORT_SHA}
    if not args.write:
        print(json.dumps({'id': SOURCE_ID, 'status': 'validated-no-write', 'decodedWavFiles': 19,
                          'uniqueNativeBanks': 7, 'physicalAliases': 56}, ensure_ascii=False))
        return
    # The original admission record was included in the immutable source ZIP.
    # Later catalog-only metadata may be additive, but may never rewrite that
    # archived evidence.  Verify its identity if it already exists.
    evidence = ROOT / 'central-admission.json'
    if evidence.exists():
        previous = json.loads(evidence.read_text(encoding='utf-8'))
        if (previous.get('schema') != admission['schema']
                or previous.get('reportSha256') != EXPECTED_REPORT_SHA
                or previous.get('source', {}).get('id') != SOURCE_ID):
            raise ValueError('Existing admission evidence does not identify this decoded delivery')
    else:
        write_same(evidence, admission)
    merge_once(downloads['publicSources'], item)
    for forbidden in ('supersededPrimaryAudioBy', 'audioIndexedBySourceId'):
        if forbidden in upstream:
            raise ValueError('Upstream preservation guard violated: ' + forbidden)
    revisions = upstream.setdefault('decodedAudioRevisions', [])
    prior = [row for row in revisions if row.get('sourceId') == SOURCE_ID]
    if prior and prior != [addition]:
        raise ValueError('Existing decoded revision relation differs')
    if not prior:
        revisions.append(copy.deepcopy(addition))
    if downloads_path.read_bytes() != before:
        raise ValueError('Download-source index changed during admission')
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'id': SOURCE_ID, 'decodedWavFiles': 19, 'uniqueNativeBanks': 7,
                      'physicalAliases': 56, 'publicationStatus': item['publicationStatus']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

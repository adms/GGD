#!/usr/bin/env python3
"""Admit the verified Alucard SSM decoded-WAV revision without inflating it.

The source package remains local until a separate S3 full-readback receipt is
available.  This tool only records the existing decoded representation, keeps
the upstream native NUS3AUDIO/IDSP entry intact, and refuses any audio byte,
path, group-count, or proposal-pin mismatch.
"""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
LIBRARY = REPO / 'materials/hero-model-library'
INTAKE = WORKSPACE / 'GGD-Asset-Library/intake/alucard-audio-registration-audit-20260911'
CONVERSION = WORKSPACE / 'GGD-Asset-Library/conversions/alucard-audio-20260911-v1'
SOURCE_ID = 'parallel-ns-alucard-ssbu-audio-decoded-v1'
UPSTREAM_ID = 'parallel-ns-alucard-ssbu'
ADAPTER_SHA256 = 'e7652b516ad41da867b774c5ed3258b63bc9023cef066a99f5b4f6558b96a179'
EXPECTED_AUDIO_COUNT = 135
EXPECTED_SILENT_COUNT = 2
VERIFICATION = ('revision-02 的 135 個 PCM16 WAV 逐檔大小與 SHA-256 已核對；保留 2 個全零 PCM dummy，'
                '其餘 133 段未聽審。原生 NUS3AUDIO／IDSP 與原始來源版本分開保留；不由 bank 名稱判定語言、說話者或技能事件。')


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe_member(root, member):
    member_path = Path(member)
    if not isinstance(member, str) or member_path.is_absolute() or '..' in member_path.parts:
        raise ValueError('Unsafe decoded-audio member: ' + repr(member))
    target = (root / member_path).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Decoded-audio member leaves the conversion root: ' + member)
    return target


def longest_group(groups, member):
    """Mirror the indexer's most-specific group rule before central writes."""
    matches=[]
    for group in groups:
        lengths=[len(prefix) for prefix in group['pathPrefixes'] if member.startswith(prefix)]
        if lengths:
            matches.append((max(lengths), group))
    if not matches:
        raise ValueError('No declared audio group for ' + member)
    longest=max(length for length, _ in matches)
    selected=[group for length, group in matches if length==longest]
    if len(selected) != 1:
        raise ValueError('Ambiguous declared audio group for ' + member)
    return selected[0]


def validate(source, upstream_additions, adapter):
    if source.get('id') != SOURCE_ID or source.get('upstreamSourceId') != UPSTREAM_ID:
        raise ValueError('Unexpected source lineage')
    if source.get('audioFormatRevisionOf') != UPSTREAM_ID:
        raise ValueError('Decoded revision must name its native upstream source')
    if source.get('heroIds') or source.get('defaultEligible') or source.get('automaticEligible'):
        raise ValueError('Unreviewed audio conversion cannot claim a hero/default')
    if source.get('audioCount') != EXPECTED_AUDIO_COUNT or source.get('sourceSilentPlaceholderCount') != EXPECTED_SILENT_COUNT:
        raise ValueError('Unexpected audio or silent-placeholder count')
    if source.get('countsAsNewAcquisition') is not False or source.get('resourceRole') != 'audio-supplement':
        raise ValueError('Decoded existing audio must remain a non-acquisition supplement')
    if source.get('audioFileIndex', {}).get('reportSha256') != ADAPTER_SHA256:
        raise ValueError('Source proposal does not pin the audited adapter')
    if source.get('supersededPrimaryAudioBy') or source.get('audioIndexedBySourceId'):
        raise ValueError('Native-only upstream must not be superseded or delegated')
    if upstream_additions.get('id') != UPSTREAM_ID or set(upstream_additions) != {'id', 'operation', 'additions', 'doNotSet', 'reason'}:
        raise ValueError('Unexpected upstream-additions proposal')
    if set(upstream_additions['doNotSet']) != {'supersededPrimaryAudioBy', 'audioIndexedBySourceId'}:
        raise ValueError('Upstream preservation guard changed')
    additions=upstream_additions['additions'].get('decodedAudioRevisions')
    if not isinstance(additions, list) or len(additions) != 1 or additions[0].get('sourceId') != SOURCE_ID:
        raise ValueError('Expected exactly one decoded revision link')
    if not isinstance(adapter.get('files'), list) or len(adapter['files']) != EXPECTED_AUDIO_COUNT:
        raise ValueError('Adapter does not contain the declared 135 decoded files')
    paths=set()
    group_counts={group['id']: 0 for group in source['audioGroups']}
    silent=[]
    for row in adapter['files']:
        member=row.get('path')
        if not isinstance(member, str) or member in paths:
            raise ValueError('Adapter has missing or duplicate audio path')
        paths.add(member)
        local=safe_member(CONVERSION, member)
        if not local.is_file() or local.stat().st_size != row.get('bytes') or sha256(local) != row.get('sha256'):
            raise ValueError('Decoded local WAV differs from adapter: ' + member)
        if row.get('format') != 'wav-pcm' or row.get('synthesisReady') is not False:
            raise ValueError('Unexpected decoded format or synthesis flag: ' + member)
        group=longest_group(source['audioGroups'], member)
        group_counts[group['id']]+=1
        if row.get('sourceSilentPlaceholder') or row.get('allSamplesZero'):
            if row.get('sourceSilentPlaceholder') is not True or row.get('allSamplesZero') is not True:
                raise ValueError('Silent placeholder must have both independent proofs: ' + member)
            silent.append(member)
    declared={group['id']: group['fileCount'] for group in source['audioGroups']}
    if group_counts != declared:
        raise ValueError('Audio group membership does not equal declared counts: ' + repr(group_counts))
    if len(silent) != EXPECTED_SILENT_COUNT:
        raise ValueError('Decoded silent-placeholder count changed')


def prepare():
    source_path=INTAKE/'source-entry-proposal.json'
    additions_path=INTAKE/'upstream-source-additions-proposal.json'
    adapter_path=INTAKE/'central-audioFileIndex.proposal.json'
    for path in (source_path, additions_path, adapter_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    if sha256(adapter_path) != ADAPTER_SHA256:
        raise ValueError('Audited adapter proposal hash mismatch')
    source=read_json(source_path)
    source.setdefault('verification', VERIFICATION)
    additions=read_json(additions_path)
    adapter=read_json(adapter_path)
    validate(source, additions, adapter)
    return source, additions, adapter_path


def merge_once(rows, item, label):
    matches=[row for row in rows if row.get('id') == item.get('id')]
    if not matches:
        rows.append(copy.deepcopy(item))
        return
    if len(matches) != 1:
        raise ValueError('Duplicate existing '+label)
    existing=matches[0]
    mutable_after_admission={'publicationStatus'}
    for key, value in item.items():
        if key in existing and existing[key] != value and key not in mutable_after_admission:
            raise ValueError('Existing '+label+' differs from audited proposal at '+key)
    # A completed backup may already have added its immutable receipt.  The
    # proposal can only add missing catalog metadata; it never overwrites it.
    for key, value in item.items():
        existing.setdefault(key, copy.deepcopy(value))


def write():
    source, additions, adapter_path=prepare()
    downloads_path=LIBRARY/'download-sources.json'
    before=downloads_path.read_bytes()
    downloads=json.loads(before)
    sources=downloads.get('publicSources', [])
    merge_once(sources, source, 'decoded source')
    upstream=[row for row in sources if row.get('id') == UPSTREAM_ID]
    if len(upstream) != 1:
        raise ValueError('Expected one upstream native source')
    for forbidden in additions['doNotSet']:
        if forbidden in upstream[0]:
            raise ValueError('Upstream preservation guard violated: '+forbidden)
    revisions=upstream[0].setdefault('decodedAudioRevisions', [])
    revision=additions['additions']['decodedAudioRevisions'][0]
    existing=[row for row in revisions if row.get('sourceId') == SOURCE_ID]
    if not existing:
        revisions.append(copy.deepcopy(revision))
    elif existing != [revision]:
        raise ValueError('Existing upstream decoded-revision link differs')
    target=CONVERSION/source['audioFileIndex']['reportPath']
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if sha256(target) != ADAPTER_SHA256:
            raise ValueError('Existing central adapter differs from audited proposal')
    else:
        shutil.copyfile(adapter_path, target)
    if sha256(target) != ADAPTER_SHA256:
        raise ValueError('Copied central adapter hash mismatch')
    if downloads_path.read_bytes() != before:
        raise RuntimeError('Central download-source index changed during integration')
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    saved=next(row for row in sources if row.get('id') == SOURCE_ID)
    print(json.dumps({'id': SOURCE_ID, 'audioFiles': EXPECTED_AUDIO_COUNT,
                      'silentPlaceholders': EXPECTED_SILENT_COUNT,
                      'adapter': str(target), 's3Status': saved.get('publicationStatus')}, ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Copy the pinned adapter and update the central source index.')
    args=parser.parse_args()
    if args.write:
        write()
    else:
        source, _, _=prepare()
        print(json.dumps({'id': source['id'], 'status': 'validated-no-write',
                          'audioFiles': EXPECTED_AUDIO_COUNT, 's3Status': 'local-verified-s3-pending'}, ensure_ascii=False))


if __name__ == '__main__':
    main()

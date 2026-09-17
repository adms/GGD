"""Publish a verified preparation manifest, or explicitly restore it outside Git.

Network upload/readback is performed by upload_scoped_tar.py. This tool never
downloads from legacy automatically and never overwrites a different file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tarfile

from upload_scoped_tar import scoped_members

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / 'materials/hero-model-library/pr1284-preparation-s3.json'
PREFIX = 's3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/pr1284-preparation-final-v1/'
DOC_START = '<!-- generated:pr1284-preparation-archive:start -->'
DOC_END = '<!-- generated:pr1284-preparation-archive:end -->'
LEGACY_README_PARAGRAPH = '本批準備材料另見 [PR #1284 歸檔清單](../hero-model-library/pr1284-preparation-s3.json)。以 `fullGetVerified` 判定是否已上傳讀回；`plannedS3Uri` 只是目的地。完整解析原件與審查圖保留在本機，未驗證上傳前不移除既有 Git 材料。'


def archive_doc_block(doc, *, readme=False):
    """Render only receipt-backed archive facts; never infer runtime readiness."""
    files = doc['files']
    if not isinstance(files, list) or doc['fileCount'] != len(files):
        raise ValueError('Archive fileCount must match its per-file manifest')
    flags = {key: doc.get(key) is True for key in (
        'fullGetVerified', 'allArchiveMembersSha256Verified',
    )}
    verified = all(flags.values()) and isinstance(doc.get('s3Uri'), str) and doc['s3Uri'].startswith(PREFIX)
    state = '已上傳，完整讀回與逐檔 SHA-256 驗證通過' if verified else '待上傳或讀回驗證，尚不能視為歸檔完成'
    uri = doc.get('s3Uri') or doc.get('plannedS3Uri')
    uri_label = 'S3 已驗證位置' if verified else 'S3 記錄位置（未完成驗證）' if doc.get('s3Uri') else 'S3 計畫位置（尚未證明已上傳）'
    index_link = '../hero-model-library/pr1284-preparation-s3.json' if readme else 'pr1284-preparation-s3.json'
    lines = [
        DOC_START, '',
        '### PR #1284 準備材料歸檔', '',
        f'**{state}**。本批限定 **{doc["fileCount"]:,} 份材料**，封裝 **{doc["bytes"]:,} bytes**；逐檔路徑、大小與 SHA-256 讀 [歸檔清單]({index_link})。', '',
        f'- 封裝 SHA-256：`{doc["sha256"]}`。',
        f'- {uri_label}：`{uri}`。' if uri else '- S3 位置尚未記錄。',
        '- 驗證旗標：' + '；'.join(f'`{key}={str(value).lower()}`' for key, value in flags.items()) + '。',
        f'- 本機原件保留：`localPreserved={str(doc.get("localPreserved") is True).lower()}`；本機封裝：`{doc.get("localArchive") or "未記錄"}`。',
        '',
        '範圍僅為清單列出的準備材料與完整解析收據，不代表全部本機材料已備份，也不證明英雄可切換或正式站已部署。', '',
        '人工唯讀下載封裝後，使用既有還原入口；將第一個參數換成下載檔絕對路徑，目的地須位於 checkout 外。此入口核對封裝與逐檔 SHA-256，不覆蓋不同內容的檔案，也不把完整解析 JSON 寫回 Git 的精簡清單。', '',
        '```bash',
        'python3 tools/hero-model-library/publish_pr1284_preparation_index.py \\\n  --restore-from "<已下載的封裝絕對路徑>" \\\n  --destination "../GGD-Asset-Library/restored/pr1284-preparation-final-v1"',
        '```', '',
        '此區由 `python3 tools/hero-model-library/publish_pr1284_preparation_index.py --sync-docs` 從歸檔清單生成；`--check` 驗證文件同步。',
        '', DOC_END,
    ]
    return '\n'.join(lines)


def replace_archive_doc_block(text, block, *, readme=False):
    """Replace only this generator's block, preserving all surrounding text."""
    if DOC_START in text or DOC_END in text:
        if text.count(DOC_START) != 1 or text.count(DOC_END) != 1:
            raise ValueError('Expected exactly one PR1284 archive generated block')
        start = text.index(DOC_START)
        end = text.index(DOC_END) + len(DOC_END)
        if end <= start:
            raise ValueError('Reversed PR1284 archive generated markers')
        return text[:start] + block + text[end:]
    if readme:
        if text.count(LEGACY_README_PARAGRAPH) != 1:
            raise ValueError('Expected the existing PR1284 README archive paragraph')
        return text.replace(LEGACY_README_PARAGRAPH, block, 1)
    return text + ('\n' if text.endswith('\n') else '\n\n') + block + '\n'


def sync_docs(*, check=False, root=ROOT):
    doc = json.loads((root / 'materials/hero-model-library/pr1284-preparation-s3.json').read_text())
    updates = []
    for relative, readme in (
        ('materials/asset-library/README.md', True),
        ('materials/hero-model-library/近四日新增模型動作特效清單.md', False),
    ):
        path = root / relative
        previous = path.read_text(encoding='utf-8')
        updated = replace_archive_doc_block(previous, archive_doc_block(doc, readme=readme), readme=readme)
        if updated != previous:
            updates.append((path, updated))
    if not check:
        for path, updated in updates:
            path.write_text(updated, encoding='utf-8')
    print(json.dumps({'checked': 2, 'changed': [path.relative_to(root).as_posix() for path, _ in updates], 'checkOnly': check}))
    return bool(updates)


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()


def publish(manifest_path, receipt_path):
    manifest = json.loads(manifest_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    assert receipt['s3Uri'].startswith(PREFIX)
    assert receipt['sha256'] == manifest['sha256']
    assert receipt['manifestSha256'] == sha(manifest_path)
    assert receipt['fullGetVerified'] and receipt['allArchiveMembersSha256Verified']
    assert receipt['profile'] == 'vibe-coding' and receipt['region'] == 'ap-east-2'
    readback = Path(receipt['localReadback'])
    assert sha(readback) == receipt['sha256']
    assert scoped_members(readback) == manifest['files']
    result = {
        'schema': 'ggd.pr1284-preparation-s3@1',
        'scope': 'Only the listed preparation evidence and full analysis receipts; not all local materials.',
        'status': 's3-full-readback-verified',
        's3Uri': receipt['s3Uri'], 'manifestUri': receipt['manifestUri'],
        'sha256': receipt['sha256'], 'bytes': receipt['bytes'],
        'fileCount': receipt['fileCount'], 'files': manifest['files'],
        'fullGetVerified': True, 'allArchiveMembersSha256Verified': True,
        'profile': 'vibe-coding', 'region': 'ap-east-2', 'localPreserved': True,
        'localArchive': receipt['localArchive'], 'localReadback': str(readback),
        'restorePolicy': 'Manual read-only retrieval only. Restore to a separate directory; full analysis JSON must not overwrite compact Git summaries.',
        'productionDeploymentVerified': False,
    }
    INDEX.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Published {result["fileCount"]} verified preparation files: {INDEX}')


def prepare(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    archive = Path(manifest['absoluteLocalArchive'])
    assert manifest['plannedS3Uri'].startswith(PREFIX)
    assert sha(archive) == manifest['sha256']
    assert scoped_members(archive) == manifest['files']
    if INDEX.exists() and json.loads(INDEX.read_text()).get('fullGetVerified'):
        raise ValueError('Preserve an already verified publication receipt')
    result = {
        'schema': 'ggd.pr1284-preparation-s3@1',
        'scope': 'Only the listed preparation evidence and full analysis receipts; not all local materials.',
        'status': 'local-frozen-awaiting-explicit-upload-approval',
        'plannedS3Uri': manifest['plannedS3Uri'], 's3Uri': None,
        'sha256': manifest['sha256'], 'bytes': manifest['bytes'],
        'fileCount': manifest['fileCount'], 'files': manifest['files'],
        'localArchive': str(archive), 'localPreserved': True,
        'fullGetVerified': False, 'allArchiveMembersSha256Verified': False,
        'localArchiveMembersSha256Verified': True,
        'productionDeploymentVerified': False,
    }
    INDEX.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared local-only manifest for {result["fileCount"]} files: {INDEX}')


def restore(archive, destination):
    doc = json.loads(INDEX.read_text())
    assert sha(archive) == doc['sha256'], 'Archive SHA-256 mismatch'
    assert scoped_members(archive) == doc['files'], 'Archive member manifest mismatch'
    destination = destination.resolve()
    if destination == ROOT or destination.is_relative_to(ROOT):
        raise ValueError('Restore full preparation outside the Git checkout')
    with tarfile.open(archive, 'r:gz') as tar:
        for row in doc['files']:
            target = destination / row['path']
            if not target.resolve().is_relative_to(destination):
                raise ValueError('Restore destination escapes through a symlink')
            if target.exists():
                if target.is_file() and sha(target) == row['sha256']:
                    continue
                raise ValueError(f'Preserve existing different file: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(row['path']) as source, target.open('xb') as output:
                for data in iter(lambda: source.read(1024 * 1024), b''):
                    output.write(data)
            assert sha(target) == row['sha256']
    print(f'Restored and verified {len(doc["files"])} files in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--restore-from', type=Path)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--prepare-manifest', type=Path)
    parser.add_argument('--sync-docs', action='store_true')
    parser.add_argument('--check', action='store_true', help='check the two generated archive documentation blocks')
    args = parser.parse_args()
    if args.sync_docs or args.check:
        if any((args.prepare_manifest, args.manifest, args.receipt, args.restore_from, args.destination)):
            parser.error('--sync-docs/--check cannot be combined with publication or restore actions')
        changed = sync_docs(check=args.check)
        raise SystemExit(1 if args.check and changed else 0)
    elif args.prepare_manifest and not any((args.manifest, args.receipt, args.restore_from, args.destination)):
        prepare(args.prepare_manifest)
    elif args.restore_from and args.destination and not args.manifest and not args.receipt:
        restore(args.restore_from, args.destination)
    elif args.manifest and args.receipt and not args.restore_from and not args.destination:
        publish(args.manifest, args.receipt)
    else:
        parser.error('Use --prepare-manifest, --manifest + --receipt, --restore-from + --destination, --sync-docs, or --check')

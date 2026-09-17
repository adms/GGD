"""Generated archive text follows the receipt and preserves other generators."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from publish_pr1284_preparation_index import (
    DOC_START, DOC_END, LEGACY_README_PARAGRAPH, PREFIX,
    archive_doc_block, replace_archive_doc_block, sync_docs,
)


class ArchiveDocsTests(unittest.TestCase):
    def setUp(self):
        self.doc = {
            'files': [{'path': 'review.json', 'bytes': 24, 'sha256': 'a' * 64}],
            'fileCount': 1, 'bytes': 1234, 'sha256': 'b' * 64,
            's3Uri': PREFIX + 'example.tar.gz', 'localPreserved': True,
            'localArchive': '/example/archive.tar.gz',
            'fullGetVerified': True, 'allArchiveMembersSha256Verified': True,
        }

    def test_verified_numbers_and_restore_command_are_receipt_derived(self):
        text = archive_doc_block(self.doc)
        self.assertIn('已上傳，完整讀回與逐檔 SHA-256 驗證通過', text)
        self.assertIn('**1 份材料**', text)
        self.assertIn('**1,234 bytes**', text)
        self.assertIn(self.doc['sha256'], text)
        self.assertIn(self.doc['s3Uri'], text)
        self.assertIn('--restore-from "<已下載的封裝絕對路徑>"', text)
        self.assertIn('--destination "../GGD-Asset-Library/restored/', text)
        self.assertNotIn('\n+  --', text)
        self.assertIn('不代表全部本機材料已備份', text)
        self.assertIn('不證明英雄可切換或正式站已部署', text)

    def test_pending_and_partial_readback_never_claim_verified(self):
        for field in ('fullGetVerified', 'allArchiveMembersSha256Verified'):
            doc = copy.deepcopy(self.doc)
            doc[field] = False
            text = archive_doc_block(doc)
            self.assertIn('待上傳或讀回驗證', text)
            self.assertNotIn('已上傳，完整讀回與逐檔 SHA-256 驗證通過', text)
        doc['plannedS3Uri'] = doc.pop('s3Uri')
        text = archive_doc_block(doc)
        self.assertIn('S3 計畫位置（尚未證明已上傳）', text)

    def test_only_own_block_is_replaced(self):
        other = '<!-- generated:other:start -->\nKEEP 190\n<!-- generated:other:end -->\n'
        text = other + DOC_START + '\nold\n' + DOC_END + '\nTAIL\n'
        updated = replace_archive_doc_block(text, archive_doc_block(self.doc))
        self.assertTrue(updated.startswith(other))
        self.assertTrue(updated.endswith('\nTAIL\n'))
        self.assertEqual(updated.count(DOC_START), 1)
        self.assertEqual(replace_archive_doc_block(updated, archive_doc_block(self.doc)), updated)

    def test_sync_check_never_writes_and_update_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = root / 'materials/hero-model-library/pr1284-preparation-s3.json'
            index.parent.mkdir(parents=True)
            index.write_text(json.dumps(self.doc))
            readme = root / 'materials/asset-library/README.md'
            readme.parent.mkdir(parents=True)
            readme.write_text('HEAD\n' + LEGACY_README_PARAGRAPH + '\nTAIL\n')
            report = index.parent / '近四日新增模型動作特效清單.md'
            report.write_text('<!-- generated:other:start -->KEEP<!-- generated:other:end -->\n')
            before = [readme.read_bytes(), report.read_bytes()]
            self.assertTrue(sync_docs(check=True, root=root))
            self.assertEqual(before, [readme.read_bytes(), report.read_bytes()])
            self.assertTrue(sync_docs(root=root))
            self.assertFalse(sync_docs(check=True, root=root))
            self.assertTrue(readme.read_text().endswith('\nTAIL\n'))
            self.assertTrue(report.read_text().startswith(before[1].decode()))


if __name__ == '__main__':
    unittest.main()

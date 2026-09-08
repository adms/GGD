import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('hero-finetune-archive.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


class ArchiveTests(unittest.TestCase):
    def fixture(self, root):
        research = root/'outputs/hero-forge-12b-restart-20260908'
        (research/'ir5-workflow-v1').mkdir(parents=True)
        (research/'ir5-workflow-v1/state.json').write_text(json.dumps({'status': 'completed-experiment-not-promoted'}))
        (research/'sample.py').write_text('print("research only")\n')
        (research/'.env').write_text('NOT_FOR_PUBLICATION=1')
        (research/'research-adapter').mkdir()
        (research/'research-adapter/adapters.safetensors').write_bytes(b'opaque-test-fixture-not-a-model')
        (root/'GGD-hero-auto-forge/tools/forge-training').mkdir(parents=True)
        for name in ['Finetune 英雄技能特效與機制全自動鑄造小模型全自動實作計畫.md', 'Finetune_英雄技能模型_最終研究報告_20260907.md']:
            (root/name).write_text('test only\n')
        return research

    def test_roundtrip_preserves_payload_and_excludes_environment(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root)
            out=Path(d)/'archive'; a.build(root,out); a.verify(out)
            dest=Path(d)/'restored'; a.extract(out,dest)
            rel='outputs/hero-forge-12b-restart-20260908/research-adapter/adapters.safetensors'
            self.assertEqual((root/rel).read_bytes(),(dest/rel).read_bytes())
            self.assertFalse((dest/'outputs/hero-forge-12b-restart-20260908/.env').exists())
            with self.assertRaisesRegex(AssertionError,'NEW_EXTRACTION'):
                a.extract(out,dest)

    def test_modified_blob_is_detected(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root); out=Path(d)/'archive'; a.build(root,out)
            next((out/'models').iterdir()).write_bytes(b'corrupted')
            with self.assertRaises(AssertionError): a.verify(out)

    def test_path_traversal_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root); out=Path(d)/'archive'; a.build(root,out)
            m=json.loads((out/'manifest.json').read_text()); m['entries'][0]['path']='../escape'
            (out/'manifest.json').write_text(json.dumps(m))
            with self.assertRaises(AssertionError): a.verify(out)

    def test_credential_pattern_blocks_publication(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; r=self.fixture(root); (r/'bad.json').write_text('ghp_'+'A'*40)
            with self.assertRaisesRegex(AssertionError,'POSSIBLE_SECRET'):
                a.build(root,Path(d)/'archive')

    def test_unregistered_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root); out=Path(d)/'archive'; a.build(root,out)
            m=json.loads((out/'manifest.json').read_text()); m['archives']=[]
            (out/'manifest.json').write_text(json.dumps(m))
            with self.assertRaisesRegex(AssertionError,'UNREGISTERED_ARCHIVE'): a.verify(out)


if __name__ == '__main__': unittest.main()

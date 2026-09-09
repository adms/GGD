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
            self.assertTrue((out/'sources/12b/sample.py.txt').exists())
            self.assertFalse((out/'sources/12b/sample.py').exists())
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

    def test_scoped_increment_requires_a_terminal_workflow(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; r=self.fixture(root)
            state=Path('outputs/hero-forge-12b-restart-20260908/ir5-workflow-v1/state.json')
            (root/state).write_text(json.dumps({'status':'running'}))
            include=[Path('outputs/hero-forge-12b-restart-20260908/sample.py')]
            with self.assertRaisesRegex(AssertionError,'WORKFLOW_NOT_TERMINAL'): a.build(root,Path(d)/'out',include,state)
            (root/state).write_text(json.dumps({'status':'completed-control-not-promoted'}))
            out=Path(d)/'out'; a.build(root,out,include,state)
            m=json.loads((out/'manifest.json').read_text())
            self.assertEqual([e['path'] for e in m['entries']],[str(include[0])])

    def test_scoped_increment_rejects_escaping_source(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'workspace'; self.fixture(root)
            with self.assertRaisesRegex(AssertionError,'RELATIVE_SOURCE_PATH'):
                a.build(root,Path(d)/'out',[Path('../outside')],Path('state.json'))

    def test_scoped_increment_accepts_only_complete_bound_training(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root)
            rel=Path('outputs/hero-forge-12b-restart-20260908/full-hero-distillation-v21')
            run=root/rel; train=run/'train'; checkpoint=train/'checkpoint-0002'
            checkpoint.mkdir(parents=True)
            adapter=checkpoint/'adapters.safetensors'; adapter.write_bytes(b'complete-test-adapter')
            (run/'manifest.json').write_text(json.dumps({'steps':2}))
            (train/'result.json').write_text(json.dumps({'phase':'train','steps':2,'uniqueTrainingTasks':2,
                'checkpoint':{'path':'checkpoint-0002','sha256':a.digest(adapter)}}))
            (train/'adapter-roundtrip.json').write_text(json.dumps({'passed':True}))
            state={'status':'completed','phase':'train','workerPid':None,
                'manifestSha256':a.digest(run/'manifest.json')}
            (train/'state.json').write_text(json.dumps(state))
            a.build(root,Path(d)/'out',[rel],rel/'train/state.json')
            state['workerPid']=123; (train/'state.json').write_text(json.dumps(state))
            with self.assertRaisesRegex(AssertionError,'TRAINING_STATE_INVALID'):
                a.build(root,Path(d)/'bad',[rel],rel/'train/state.json')

    def test_scoped_increment_accepts_complete_bound_evaluation(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            root=Path(d)/'workspace'; self.fixture(root)
            rel=Path('outputs/hero-forge-12b-restart-20260908/hero74-paired-evaluation-v1')
            run=root/rel; run.mkdir(parents=True)
            (run/'report-data.json').write_text('{}\n'); (run/'report.html').write_text('<p>report</p>\n')
            (run/'manifest.json').write_text(json.dumps({'schema':'ggd-distillation-evaluation-batch@1',
                'modelPromoted':False}))
            result={'schema':'ggd-distillation-evaluation-batch-result@1','modelPromoted':False,
                'reportDataSha256':a.digest(run/'report-data.json'),'reportHtmlSha256':a.digest(run/'report.html')}
            (run/'result.json').write_text(json.dumps(result))
            state={'schema':'ggd-distillation-evaluation-batch-state@1','status':'completed',
                'steps':[{'status':'completed'}],'modelPromoted':False}
            (run/'state.json').write_text(json.dumps(state))
            a.build(root,Path(d)/'out',[rel],rel/'state.json')
            (run/'report.html').write_text('<p>changed</p>\n')
            with self.assertRaisesRegex(AssertionError,'EVALUATION_REPORT_DRIFT'):
                a.build(root,Path(d)/'bad',[rel],rel/'state.json')

    def test_arbitrary_completed_state_is_not_terminal_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'workspace'; r=self.fixture(root)
            state=Path('outputs/hero-forge-12b-restart-20260908/arbitrary-state.json')
            (root/state).write_text(json.dumps({'status':'completed'}))
            include=[Path('outputs/hero-forge-12b-restart-20260908/sample.py')]
            with self.assertRaisesRegex(AssertionError,'UNKNOWN_COMPLETED_WORKFLOW'):
                a.build(root,Path(d)/'out',include,state)


if __name__ == '__main__': unittest.main()

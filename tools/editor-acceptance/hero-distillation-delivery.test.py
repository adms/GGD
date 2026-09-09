import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('delivery', HERE / 'hero-distillation-delivery.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, bytes): path.write_bytes(value)
    elif isinstance(value, str): path.write_text(value)
    else: path.write_text(json.dumps(value))


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.training = self.root / 'outputs/hero-forge-12b-restart-20260908/full-hero-distillation-v21'
        train = self.training / 'train'
        put(self.training / 'manifest.json', {'steps': 2})
        adapter = train / 'checkpoint-0002/adapters.safetensors'; put(adapter, b'adapter')
        put(train / 'result.json', {'phase': 'train', 'steps': 2, 'uniqueTrainingTasks': 2,
            'checkpoint': {'path': 'checkpoint-0002', 'sha256': d.digest(adapter)}})
        put(train / 'adapter-roundtrip.json', {'passed': True})
        for name in ['dev-before.json', 'dev-after.json', 'training-trace.json']:
            put(train / name, [])
        put(train / 'state.json', {'status': 'completed', 'phase': 'train', 'workerPid': None,
            'manifestSha256': d.digest(self.training / 'manifest.json')})
        self.evaluation = self.root / 'outputs/hero-forge-12b-restart-20260908/hero74-paired-evaluation-v1'
        put(self.evaluation / 'manifest.json', {'schema': 'ggd-distillation-evaluation-batch@1',
            'trainingDirectory': str(self.training), 'modelPromoted': False})
        put(self.evaluation / 'report-data.json', {'schema': 'fixture'})
        put(self.evaluation / 'report.html', '<p>fixture</p>')
        put(self.evaluation / 'result.json', {'schema': 'ggd-distillation-evaluation-batch-result@1',
            'reportDataSha256': d.digest(self.evaluation / 'report-data.json'),
            'reportHtmlSha256': d.digest(self.evaluation / 'report.html'), 'modelPromoted': False})
        put(self.evaluation / 'state.json', {'schema': 'ggd-distillation-evaluation-batch-state@1',
            'status': 'completed', 'steps': [{'status': 'completed'}], 'modelPromoted': False})

    def tearDown(self): self.temp.cleanup()

    def test_builds_readable_git_files_and_ignored_verified_payloads(self):
        out = self.root / 'delivery'; result = d.build(self.root, self.training, self.evaluation, out)
        self.assertEqual(len(result['readableEvidence']), 12)
        self.assertEqual((out / '.gitignore').read_text(), 'bundle/archives/\nbundle/models/\n')
        self.assertTrue((out / 'readable/evaluation/report.html').is_file())
        d.archive.verify(out / 'bundle')
        adapter_entries = [row for row in json.loads((out / 'bundle/manifest.json').read_text())['entries']
                           if 'modelBlob' in row]
        self.assertEqual(len(adapter_entries), 1)
        self.assertEqual(d.digest(out / 'bundle/manifest.json'), result['bundleManifest']['sha256'])

    def test_rejects_running_or_mismatched_evaluation(self):
        state = json.loads((self.evaluation / 'state.json').read_text()); state['status'] = 'running'
        put(self.evaluation / 'state.json', state)
        with self.assertRaisesRegex(AssertionError, 'WORKFLOW_NOT_TERMINAL'):
            d.build(self.root, self.training, self.evaluation, self.root / 'out')
        state['status'] = 'completed'; put(self.evaluation / 'state.json', state)
        manifest = json.loads((self.evaluation / 'manifest.json').read_text()); manifest['trainingDirectory'] = str(self.root / 'other')
        put(self.evaluation / 'manifest.json', manifest)
        with self.assertRaisesRegex(AssertionError, 'EVALUATION_TRAINING_BINDING_DRIFT'):
            d.build(self.root, self.training, self.evaluation, self.root / 'out2')


if __name__ == '__main__': unittest.main()

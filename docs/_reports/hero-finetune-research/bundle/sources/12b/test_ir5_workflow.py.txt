import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('workflow', Path(__file__).with_name('run-ir5-workflow.py'))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class WorkflowTests(unittest.TestCase):
    def test_mirror_accepts_only_identical_existing_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'a', Path(d)/'b'
            a.write_text('frozen')
            w.mirror(a, b)
            w.mirror(a, b)
            a.write_text('changed')
            with self.assertRaisesRegex(AssertionError, 'MIRROR_DRIFT'):
                w.mirror(a, b)
            self.assertEqual(b.read_text(), 'frozen')

    def test_declined_engineering_scope_writes_failure_report_without_gpu(self):
        with tempfile.TemporaryDirectory() as d, patch.object(w, 'HERE', Path(d)), patch.object(w, 'PILOT', Path(d)/'pilot'):
            out = Path(d)/'run'
            with self.assertRaises(SystemExit), patch.object(w, 'command') as command:
                w.main(out, False)
            command.assert_not_called()
            self.assertTrue((out/'REPORT.md').exists())
            self.assertEqual(w.gpu.read(out/'result.json')['qualifiedProductionHeroes'], 0)
            self.assertFalse(w.gpu.read(out/'data-issues.json')['acknowledgedEngineeringOnly'])

    def test_total_deadline_keeps_report_reserve(self):
        with tempfile.TemporaryDirectory() as d:
            state = {'deadline': w.time.time()+100, 'stages': []}
            with self.assertRaisesRegex(AssertionError, 'REPORT_RESERVE_REACHED'):
                w.command(Path(d), state, 'no-execution', ['never-run'], Path(d), 10)
            self.assertEqual(state['stages'], [])


if __name__ == '__main__':
    unittest.main()

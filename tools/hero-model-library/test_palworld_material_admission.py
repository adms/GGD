"""Admission must fail before a forged or stale review writes component files."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).parent / 'source-workflows/palworld/material-replays/integrate_materials.py'
SPEC = importlib.util.spec_from_file_location('palworld_material_integration', MODULE)
integration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(integration)


class ComponentAdmission(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name)
        pins = []
        for name in sorted(integration.REQUIRED_CODE_PINS):
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(name.encode())
            pins.append({'path': name, 'sha256': integration.sha(path)})
        self.review = {'candidates': []}
        rows = []
        for candidate_id, (key, _, eligible) in integration.CANDIDATE_SPECS.items():
            path = self.repo / 'input' / (candidate_id + '.glb')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(candidate_id.encode())
            model = {'path': str(path), 'sha256': integration.sha(path), 'bytes': path.stat().st_size}
            self.review['candidates'].append({
                'id': candidate_id, 'model': model, 'is256Candidate': eligible,
                'allSelectedNativeTrackSamplesIdenticalToFrozenSource': True,
            })
            if eligible:
                rows.append({
                    'id': key, **model, 'inspectPassed': True,
                    'budget': {'errors': [], 'warnings': []},
                    'proposedGitPath': 'content/assets/models/community/' + model['sha256'] + '.glb',
                })
        self.audit = {'schema': 'ggd-palworld-model-candidate-contract-audit@1', 'codeInputs': pins, 'rows': rows}

    def validate(self):
        return integration.validate_component_admission(self.review, self.audit, self.repo)

    def test_current_audited_components_pass_in_any_source_order(self):
        self.review['candidates'].reverse()
        self.assertEqual(self.validate(), 3)
        self.assertEqual(integration.CANDIDATE_SPECS[self.review['candidates'][0]['id']][1], '256px材質元件／33動作')

    def test_forged_ready_reserve_is_rejected_before_any_output_directory(self):
        self.review['candidates'][0]['is256Candidate'] = True
        review_path = self.repo / 'review.json'
        audit_path = self.repo / 'audit.json'
        review_path.write_text(json.dumps(self.review))
        audit_path.write_text(json.dumps(self.audit))
        before = set(self.repo.rglob('*'))
        original_cwd = Path.cwd()
        try:
            os.chdir(self.repo)
            with self.assertRaisesRegex(ValueError, 'Invalid component flag'):
                integration.main([str(review_path), '--audit', str(audit_path)])
        finally:
            os.chdir(original_cwd)
        self.assertEqual(set(self.repo.rglob('*')), before)
        self.assertFalse((self.repo / 'materials').exists())

    def test_audit_cannot_authorize_other_model_bytes(self):
        candidate = next(c for c in self.review['candidates'] if c['is256Candidate'])
        path = Path(candidate['model']['path'])
        path.write_bytes(b'replacement model')
        candidate['model'].update(bytes=path.stat().st_size, sha256=integration.sha(path))
        with self.assertRaisesRegex(ValueError, 'audit model pin mismatch'):
            self.validate()

    def test_changed_contract_code_requires_new_audit(self):
        pin = self.audit['codeInputs'][0]
        (self.repo / pin['path']).write_bytes(b'changed contract')
        with self.assertRaisesRegex(ValueError, 'Stale contract code pin'):
            self.validate()

    def test_missing_contract_pin_is_rejected(self):
        self.audit['codeInputs'].pop()
        with self.assertRaisesRegex(ValueError, 'Missing required contract code pin'):
            self.validate()

    def test_failed_inspection_or_budget_cannot_be_promoted(self):
        for key, value, message in [
            ('inspectPassed', False, 'inspection failed'),
            ('budget', {'errors': ['texture over limit']}, 'budget failed'),
        ]:
            with self.subTest(key=key):
                original = copy.deepcopy(self.audit['rows'][0])
                self.audit['rows'][0][key] = value
                with self.assertRaisesRegex(ValueError, message):
                    self.validate()
                self.audit['rows'][0] = original

    def test_native_sample_preservation_is_required(self):
        self.review['candidates'][0]['allSelectedNativeTrackSamplesIdenticalToFrozenSource'] = False
        with self.assertRaisesRegex(ValueError, 'Native sample preservation not verified'):
            self.validate()

    def test_duplicate_or_unknown_candidates_are_rejected(self):
        self.review['candidates'][0]['id'] = self.review['candidates'][1]['id']
        with self.assertRaisesRegex(ValueError, 'Unexpected frozen candidate set'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

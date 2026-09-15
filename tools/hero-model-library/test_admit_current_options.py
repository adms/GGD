import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('admission', Path(__file__).with_name('admit-current-options.py'))
admission = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admission)


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo, self.library = self.root / 'repo', self.root / 'library'
        self.receipt = self.repo / 'materials/hero-model-library/current-options-admission.json'
        self.old = {'schema': 'ggd-standardized-resource-catalog@1', 'updated_at': 'historical',
                    'entries': [{'id': f'old.{i}', 'kind': 'model-body', 'title': str(i),
                                 'provenance': {'limitations': ['old 160-channel statement']}}
                                for i in range(94)]}
        self.put(self.library / 'catalog.json', self.old)
        self.put(self.library / 'ready/historical/source.json', {'unchanged': '160'})
        self.put(self.repo / 'content/config/model-lod.json', {'championChannelLimit': 500})
        self.models, versions = [], []
        for index in range(2):
            key = f'community.body.model{index}'
            # Binary validity belongs to upstream ModelVersions; this test isolates admission integrity.
            binary = b'upstream-validated-fixture-' + str(index).encode()
            sha = admission.digest(binary)
            rel = f'assets/models/{sha}.glb'
            self.bytes(self.repo / 'content' / rel, binary)
            document = {'id': key, 'schema': 'model@1', 'glbPath': rel, 'scale': 1,
                        'clipMap': {state: state for state in ['idle', 'run', 'attack', 'cast', 'hurt', 'death']}}
            raw = admission.encoded(document)
            self.bytes(self.repo / f'content/models/{key}.json', raw)
            self.models.append({'id': f'source:{index}', 'modelKey': key, 'glbPath': rel,
                                'sha256': sha, 'documentSha256': admission.digest(raw),
                                'bytes': len(binary), 'sourceCharacter': f'Hero {index}'})
            frozen_key = f'version.body.model{index}'
            self.put(self.repo / f'content/models/{frozen_key}.json',
                     {**document, 'id': frozen_key, 'bodyVersion': {'sourceModelKey': key}})
            versions.append({'modelKey': frozen_key, 'sourceModelKey': key, 'binarySha256': sha,
                             'source': {'kind': 'exact'}})
        self.workflow = {'models': [self.models[0], {'id': 'not-ready', 'modelKey': 'missing.unregistered'}]}
        self.priority = {'models': [self.models[1]]}
        self.registration = {'heroes': [{'heroId': 'example:fixture', 'runtimeHeroId': 'lol-fixture',
                                        'after': {'versions': versions}}]}
        self.manifests()

    def bytes(self, path, raw):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)

    def put(self, path, value):
        self.bytes(path, admission.encoded(value))

    def manifests(self):
        base = self.repo / 'materials/hero-model-library'
        for name, value in [('workflow-model-options.json', self.workflow), ('priority-runtime-options.json', self.priority),
                            ('priority-registration.json', self.registration)]:
            self.put(base / name, value)

    def plan(self):
        return admission.build_plan(self.repo, self.library)

    def snapshot(self):
        return {str(p.relative_to(self.library)): p.read_bytes() for p in (self.library / 'ready').rglob('*') if p.is_file()}

    def test_append_preserves_94_entries_and_rerun_never_rewrites_ready_bytes(self):
        original = self.snapshot()
        result = admission.apply_plan(self.plan(), self.receipt)
        catalog = json.loads((self.library / 'catalog.json').read_bytes())
        self.assertEqual(catalog['entries'][:94], self.old['entries'])
        self.assertEqual((result['beforeCount'], result['afterCount']), (94, 96))
        self.assertEqual(len(result['new']), 2)
        self.assertEqual(result['configuredChampionChannelLimit'], 500)
        self.assertEqual(len(result['skipped']), 1)
        self.assertEqual(result['new'][0]['registeredHeroes'], ['lol-fixture'])
        for model in self.models:
            expected = f'ready/{model["documentSha256"][:24]}/{model["sha256"][:16]}/content/models/{model["modelKey"]}.json'
            self.assertTrue((self.library / expected).is_file())
        for name, raw in original.items():
            self.assertEqual((self.library / name).read_bytes(), raw)
        before, catalog_bytes = self.snapshot(), (self.library / 'catalog.json').read_bytes()
        self.workflow['models'][0]['sourceCharacter'] = 'Metadata changed outside frozen resource'
        self.manifests()
        second = admission.apply_plan(self.plan(), self.receipt)
        self.assertEqual(second['new'], [])
        self.assertEqual(len(second['existing']), 2)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), catalog_bytes)

    def test_all_source_hashes_are_preflighted_before_any_copy(self):
        self.models[1]['sha256'] = '0' * 64
        self.manifests()
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            self.plan()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(json.loads((self.library / 'catalog.json').read_bytes()), self.old)

    def test_registered_key_does_not_admit_different_current_bytes(self):
        self.registration['heroes'][0]['after']['versions'][0]['binarySha256'] = 'f' * 64
        self.manifests()
        with self.assertRaisesRegex(ValueError, 'No registered version matches'):
            self.plan()

    def test_existing_destination_conflict_does_not_change_catalog(self):
        model = self.models[1]
        relative = f'ready/{model["documentSha256"][:24]}/{model["sha256"][:16]}'
        self.put(self.library / relative / 'resource.json', {'id': 'conflicting-resource', 'model': 'models/other.json'})
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'ID/model conflict'):
            self.plan()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(json.loads((self.library / 'catalog.json').read_bytes()), self.old)

    def test_stale_catalog_plan_is_rejected_before_copy(self):
        plan = self.plan()
        concurrent = copy.deepcopy(self.old)
        concurrent['entries'].append({'id': 'another-workflow'})
        self.put(self.library / 'catalog.json', concurrent)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'Catalog changed since preflight'):
            admission.apply_plan(plan, self.receipt)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(json.loads((self.library / 'catalog.json').read_bytes()), concurrent)

    def test_race_during_copy_preserves_other_catalog_and_recovers_complete_orphans(self):
        original_publish = admission.publish_bundle
        concurrent = copy.deepcopy(self.old)
        concurrent['entries'].append({'id': 'another-workflow'})
        def concurrent_publish(library, item):
            original_publish(library, item)
            self.put(library / 'catalog.json', concurrent)
        with patch.object(admission, 'publish_bundle', side_effect=concurrent_publish):
            with self.assertRaisesRegex(ValueError, 'Catalog changed since preflight'):
                admission.apply_plan(self.plan(), self.receipt)
        self.assertEqual(json.loads((self.library / 'catalog.json').read_bytes()), concurrent)
        before = self.snapshot()
        result = admission.apply_plan(self.plan(), self.receipt)
        self.assertEqual(result['afterCount'], 97)
        self.assertEqual(self.snapshot(), before)

    def test_unsafe_receipt_is_rejected_before_any_mutation(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'Receipt must be a separate JSON'):
            admission.apply_plan(self.plan(), self.library / 'catalog.json')
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(json.loads((self.library / 'catalog.json').read_bytes()), self.old)


if __name__ == '__main__':
    unittest.main()

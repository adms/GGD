import hashlib
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from current_resource_index import apply_hero_integration_overlay, apply_option_registration_overlay, component_git_evidence, rebase_git_absolute_paths, verify_git_contents, verify_popp_approval_boundary


class CurrentResourceGitFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.repo = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q'], cwd=self.repo, check=True)
        self.path = self.repo / 'materials/source-index.json'
        self.path.parent.mkdir(parents=True)
        self.payload = b'{"records": 435}\n'
        self.path.write_bytes(self.payload)
        self.entry = {
            'gitPath': 'materials/source-index.json',
            'bytes': len(self.payload),
            'sha256': hashlib.sha256(self.payload).hexdigest(),
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_untracked_local_copy_does_not_satisfy_git_contract(self):
        with self.assertRaisesRegex(ValueError, 'absent from the Git index'):
            verify_git_contents([self.entry], self.repo)

    def test_staged_exact_blob_satisfies_git_contract(self):
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        verify_git_contents([self.entry], self.repo)

    def test_staged_mismatched_blob_is_rejected(self):
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        changed = dict(self.entry, sha256='0' * 64)
        with self.assertRaisesRegex(ValueError, 'differs from the index'):
            verify_git_contents([changed], self.repo)

    def test_component_evidence_is_deduplicated_and_verified(self):
        component = {
            'id': 'example-component',
            'gitPath': 'content/example.glb',
            'sha256': '1' * 64,
            'validationEvidence': self.entry,
            'visualEvidence': dict(self.entry),
        }
        evidence = component_git_evidence([component])
        self.assertEqual(evidence, [self.entry])
        with self.assertRaisesRegex(ValueError, 'absent from the Git index'):
            verify_git_contents(evidence, self.repo)
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        verify_git_contents(evidence, self.repo)

    def test_conflicting_component_evidence_is_rejected(self):
        components = [
            {'validationEvidence': self.entry},
            {'visualEvidence': dict(self.entry, sha256='0' * 64)},
        ]
        with self.assertRaisesRegex(ValueError, 'Conflicting component evidence'):
            component_git_evidence(components)

    def test_registration_receipt_overlays_the_newer_dropdown_state(self):
        component = {
            'id': 'historical-example',
            'gitPath': 'content/example.glb',
            'bytes': 123,
            'sha256': '1' * 64,
            'runtimeSelectable': False,
            'runtimeDropdownRegistered': False,
            'heroIds': [],
        }
        receipt = {'registrations': [{
            'componentId': 'historical-example',
            'heroId': 'acquired-example',
            'modelKey': 'community.body.example',
            'label': 'Example option',
            'modelGlb': {
                'gitPath': component['gitPath'],
                'bytes': component['bytes'],
                'sha256': component['sha256'],
            },
            'modelDocument': {'gitPath': 'content/models/community.body.example.json'},
            'productionDeploymentVerified': False,
        }], 'blocked': []}
        [current] = apply_option_registration_overlay([dict(component)], receipt)
        self.assertTrue(current['runtimeSelectable'])
        self.assertTrue(current['runtimeDropdownRegistered'])
        self.assertEqual(current['heroIds'], ['acquired-example'])
        self.assertEqual(current['runtimeModelKey'], 'community.body.example')
        self.assertFalse(current['registrationEvidence']['productionDeploymentVerified'])

    def test_hero_integration_receipt_joins_by_exact_glb_identity(self):
        component = {
            'id': 'palworld-example',
            'gitPath': 'content/pal.glb',
            'bytes': 456,
            'sha256': '2' * 64,
            'runtimeSelectable': False,
            'runtimeDropdownRegistered': False,
            'heroIds': [],
        }
        receipt = {'integrations': [{
            'heroId': 'acquired-pal',
            'backendDropdownRegistered': True,
            'backendDropdownScope': 'Hero Forge acquired-model selector',
            'authoringState': 'six-slot-package-verified',
            'defaultModelKey': 'community.body.pal',
            'modelGlb': {
                'gitPath': component['gitPath'],
                'bytes': component['bytes'],
                'sha256': component['sha256'],
            },
            'modelDocument': {'gitPath': 'content/models/community.body.pal.json'},
            'modelOptionEvidence': [{
                'modelKey': 'community.body.pal',
                'isDefault': True,
                'modelGlb': {
                    'gitPath': component['gitPath'],
                    'bytes': component['bytes'],
                    'sha256': component['sha256'],
                },
                'modelDocument': {'gitPath': 'content/models/community.body.pal.json'},
            }],
            'productionDeploymentVerified': False,
        }]}
        [current] = apply_hero_integration_overlay([dict(component)], receipt, 'receipt.json')
        self.assertTrue(current['runtimeSelectable'])
        self.assertTrue(current['runtimeDropdownRegistered'])
        self.assertEqual(current['heroIds'], ['acquired-pal'])
        self.assertEqual(current['modelDocumentGitPath'], 'content/models/community.body.pal.json')

    def test_git_absolute_links_can_target_the_integration_checkout(self):
        source = self.repo / 'isolated'
        target = self.repo / 'integration'
        value = {'gitAbsolutePath': str(source / 'content/model.glb'),
                 'sourceAbsolutePath': str(source / 'raw/source.glb')}
        rebase_git_absolute_paths(value, source, target)
        self.assertEqual(str((target / 'content/model.glb').resolve()), value['gitAbsolutePath'])
        self.assertEqual(str(source / 'raw/source.glb'), value['sourceAbsolutePath'])

    def test_popp_owner_approval_boundary_keeps_runtime_unbound(self):
        ledger = {'summary': {
            'eventAudioCandidates': 36, 'eventAudioReviewed': 36,
            'ggdVfxCandidates': 12, 'vfxVisuallyAccepted': 12,
            'runtimeBindingsAddedByThisWorkflow': 0,
        }}
        contract = {
            'schema': 'ggd.popp-integration-review@1',
            'portalOwnerReview': {
                'audio': {'candidateCount': 36, 'approvedCount': 36, 'runtimeBindingAuthorizedCount': 0},
                'vfx': {'candidateCount': 12, 'visuallyApprovedCount': 12, 'bindingApprovedCount': 0, 'runtimeBindingAuthorizedCount': 0},
                'runtimeMutationAllowed': False,
                'runtimeMutationAuthorizedForAll': False,
            },
            'eventAudioReviewGate': {
                'candidateCount': 36, 'reviewedCount': 36, 'sourceQueueReviewedCount': 0,
                'automaticBindingAllowed': False, 'runtimeSelectable': False,
            },
            'vfxRuntimeCandidates': {'summary': {
                'ggdVfxDocumentsBuilt': 12, 'visuallyAccepted': 12,
                'sourceManifestVisuallyAccepted': 0, 'skillBindingsCreated': 0,
                'runtimeSelectable': 0, 'productionDeployed': 0,
            }},
        }
        proposals = {'runtimeBindingsCreated': 0, 'policy': {'runtimeMutationAllowed': False}}
        verify_popp_approval_boundary(ledger, contract, proposals)
        ledger['summary']['eventAudioReviewed'] = 0
        with self.assertRaisesRegex(ValueError, 'Popp owner approvals are stale'):
            verify_popp_approval_boundary(ledger, contract, proposals)
        ledger['summary']['eventAudioReviewed'] = 36
        proposals['runtimeBindingsCreated'] = 1
        with self.assertRaisesRegex(ValueError, 'overclaim runtime binding'):
            verify_popp_approval_boundary(ledger, contract, proposals)


if __name__ == '__main__':
    unittest.main()

"""Accepted rigid props remain byte-pinned components, separate from heroes."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from current_resource_index import verify_component_git_contents
from intake_dai_weapon_components import PROP_IDS, SOURCE_ID, prepare_intake
from weapon_components import CONTRACT_PATHS, file_pin, source_weapon_components


class WeaponAdmission(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name)
        self.inputs = self.repo / 'inputs'
        self.inputs.mkdir()
        self.pins = []
        for name in sorted(CONTRACT_PATHS):
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name)
            self.pins.append(dict(path=name, sha256=file_pin(path)['sha256']))
        hero = self.repo / 'content/champions/existing-dai.json'
        hero.parent.mkdir(parents=True)
        hero.write_text(json.dumps(dict(id='existing-dai', model='manual-unchanged')))
        self.downloads = dict(publicSources=[dict(id=SOURCE_ID, sourceClass='community-mod-adaptation',
            author='Shinteo', heroIds=['existing-dai'], modelCandidates=[], modelCount=0,
            files=[dict(sha256='original-archive')], readiness='reserved-pending-dependencies')])
        props = []
        for number, prop_id in enumerate(sorted(PROP_IDS)):
            model = self.inputs / (prop_id + '.glb')
            model.write_bytes(prop_id.encode())
            pin = file_pin(model)
            validation = dict(schema='ggd.dai-rigid-prop-current-validation@1',
                role='independent-weapon-component', outputSha256=pin['sha256'], outputBytes=pin['bytes'],
                budget=dict(errors=[], warnings=[]), uploadReport=dict(issues=dict(numErrors=0, truncated=False)),
                allAccessorBytesPreserved=True, materialJsonPreserved=True, skins=0, clips=[],
                heroModelPreparationPerformed=False, backendRegistrationPerformed=False, toolPins=self.pins)
            vp = self.inputs / f'validation-{number}.json'
            vp.write_text(json.dumps(validation))
            visual = self.inputs / f'visual-{number}.json'
            visual.write_text(json.dumps(dict(view='full prop visible')))
            props.append(dict(id=prop_id, nameZh='達伊之劍', originalName='Sword of Dai', workZh='達伊的大冒險',
                sourceId=SOURCE_ID, sourceClass='community-mod-adaptation', sourceGame='Daz adaptation',
                sourceVersion='V2', platform='Daz', sourceUrl='https://example.invalid/source', component=pin,
                heroIds=[], defaultEligible=False, backendRegistration=False, rebuildByteIdentical=True,
                skins=0, nativeAnimations=0, proceduralAnimations=0, vfx=0, audio=0,
                triangles=1854, drawPrimitives=2, embeddedImages=7, textureMaxEdge=256,
                limitations=['Full body missing; attachment unverified'], validation=file_pin(vp), visualProof=file_pin(visual)))
        evidence = self.inputs / 'geometry-and-rebuild.json'
        evidence.write_text('{}')
        self.delivery = self.inputs / 'delivery.json'
        self.delivery.write_text(json.dumps(dict(schema='ggd.dai-rigid-props-delivery@1',
            sourceArchiveSha256='original-archive', props=props, sourceGeometryVerification=file_pin(evidence),
            rebuildVerification=file_pin(evidence))))
        self.acceptance = self.inputs / 'acceptance.json'
        self.acceptance.write_text(json.dumps(dict(schema='ggd-weapon-component-acceptance@1',
            deliverySha256=file_pin(self.delivery)['sha256'], components=[dict(id=prop['id'],
            sha256=prop['component']['sha256'], accepted=True, scope='independent-weapon-prop') for prop in props])))

    def prepare(self):
        return prepare_intake(self.repo, self.downloads, self.delivery, self.acceptance)

    def installed(self):
        result, copies = self.prepare()
        for source, destination in copies:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                shutil.copyfile(source, destination)
        return result

    def test_plan_preserves_source_hero_and_original_without_writing(self):
        before = set(self.repo.rglob('*'))
        source_before = copy.deepcopy(self.downloads['publicSources'][0])
        result, copies = self.prepare()
        self.assertEqual(set(self.repo.rglob('*')), before)
        self.assertEqual(self.downloads['publicSources'][0], source_before)
        source = result['publicSources'][0]
        self.assertEqual({k: v for k, v in source.items() if k != 'componentCandidates'}, source_before)
        self.assertEqual(len(source['componentCandidates']), 2)
        for component in source['componentCandidates']:
            self.assertEqual(component['resourceRole'], 'weapon-prop')
            self.assertEqual(component['heroIds'], [])
            self.assertEqual(component['relatedHeroIds'], ['existing-dai'])
            self.assertFalse(component['runtimeSelectable'])
            self.assertFalse(component['defaultEligible'])
        self.assertEqual(len(copies), 10)

    def test_parent_visual_acceptance_required_before_copies(self):
        data = json.loads(self.acceptance.read_text())
        data['components'][0]['accepted'] = False
        self.acceptance.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'acceptance pending'):
            self.prepare()
        self.assertFalse((self.repo / 'materials').exists())

    def test_stale_contract_or_changed_model_is_rejected(self):
        code = self.repo / self.pins[0]['path']
        original = code.read_bytes()
        code.write_bytes(b'new contract')
        with self.assertRaisesRegex(ValueError, 'Stale weapon contract pin'):
            self.prepare()
        code.write_bytes(original)
        prop = json.loads(self.delivery.read_text())['props'][0]
        Path(prop['component']['absolutePath']).write_bytes(b'replaced model')
        with self.assertRaisesRegex(ValueError, 'Changed pinned file'):
            self.prepare()

    def test_catalog_rejects_false_hero_readiness_noncanonical_path_and_changed_copy(self):
        result = self.installed()
        self.assertEqual(len(source_weapon_components(result, self.repo)), 2)
        for field, value in [('runtimeSelectable', True), ('defaultEligible', True),
                             ('heroIds', ['invented']), ('gitPath', '../outside.glb')]:
            changed = copy.deepcopy(result)
            changed['publicSources'][0]['componentCandidates'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                source_weapon_components(changed, self.repo)
        component = result['publicSources'][0]['componentCandidates'][0]
        (self.repo / component['gitPath']).write_bytes(b'changed copy')
        with self.assertRaisesRegex(ValueError, 'Changed pinned file'):
            source_weapon_components(result, self.repo)

    def test_replay_retains_later_backup_provenance(self):
        result = self.installed()
        component = result['publicSources'][0]['componentCandidates'][0]
        component.update(s3Uri='s3://authorized/example', backupReceipt='preserved-receipt')
        replay, _ = prepare_intake(self.repo, result, self.delivery, self.acceptance)
        self.assertEqual(replay, result)

    def test_git_index_must_contain_actual_canonical_component_bytes(self):
        result = self.installed()
        components = source_weapon_components(result, self.repo)
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        with self.assertRaisesRegex(ValueError, 'absent from the Git index'):
            verify_component_git_contents(components, self.repo)
        subprocess.run(['git', 'add', '--'] + [row['gitPath'] for row in components], cwd=self.repo, check=True)
        verify_component_git_contents(components, self.repo)
        path = self.repo / components[0]['gitPath']
        path.write_bytes(b'incorrect staged bytes')
        subprocess.run(['git', 'add', '--', components[0]['gitPath']], cwd=self.repo, check=True)
        with self.assertRaisesRegex(ValueError, 'Git blob differs'):
            verify_component_git_contents(components, self.repo)


if __name__ == '__main__':
    unittest.main()

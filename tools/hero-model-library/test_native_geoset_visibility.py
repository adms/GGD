import copy
import json
from pathlib import Path
import unittest

import restore_exclusive_geoset_visibility as conversion


class NativeVisibilityTest(unittest.TestCase):
    def setUp(self):
        repo = Path(__file__).resolve().parents[2]
        self.proof = json.loads((repo / 'materials/hero-model-library/priority-evidence/haga-native-visibility/native-geoset-proof.json').read_text())
        doc = json.loads((repo / 'content/models/ou99.495015-standard.json').read_text())
        self.original = (repo / 'content' / doc['glbPath']).read_bytes()
        self.gltf, self.binary = conversion.read_glb(self.original)

    def test_native_decay_transition_and_every_original_motion_are_preserved(self):
        before = copy.deepcopy(self.gltf)
        binary = bytes(self.binary)
        clips, node = conversion.transform(self.gltf, self.binary, self.proof)
        self.assertEqual(node, 0)
        self.assertEqual(len(clips), 13)
        flesh = next(c for c in clips if c['name'] == 'Decay Flesh')
        self.assertEqual(flesh['scaleKeys'], [(0.0, 0.0), (3.767, 1.0), (60.0, 1.0)])
        for name in ['Stand', 'Walk', 'Attack', 'Spell', 'Death', 'Stand Ready']:
            self.assertTrue(all(value == 0 for _, value in next(c for c in clips if c['name'] == name)['scaleKeys']))
        self.assertEqual(bytes(self.binary[:len(binary)]), binary)
        self.assertEqual(self.gltf['meshes'], before['meshes'])
        for old, new in zip(before['animations'], self.gltf['animations']):
            self.assertEqual(old['channels'], new['channels'][:-1])
            self.assertEqual(old['samplers'], new['samplers'][:-1])

    def test_refuses_joint_shared_with_body(self):
        self.gltf['meshes'][0]['primitives'].append(copy.deepcopy(self.gltf['meshes'][0]['primitives'][2]))
        with self.assertRaises(AssertionError):
            conversion.transform(self.gltf, self.binary, self.proof)

    def test_refuses_joint_with_children(self):
        self.gltf['nodes'][0]['children'] = [1]
        with self.assertRaises(AssertionError):
            conversion.transform(self.gltf, self.binary, self.proof)

    def test_refuses_existing_joint_animation(self):
        self.gltf['animations'][0]['channels'][0]['target']['node'] = 0
        with self.assertRaises(AssertionError):
            conversion.transform(self.gltf, self.binary, self.proof)

    def test_refuses_fractional_alpha_and_global_sequence(self):
        for field, value in [('keys', [[333, 0.5]]), ('gseq', 0), ('interp', 1)]:
            with self.subTest(field=field):
                proof = copy.deepcopy(self.proof)
                proof['mdxGeosetMatch']['nativeGeosetAnimation'][0]['tracks']['KGAO'][field] = value
                with self.assertRaises(AssertionError):
                    conversion.transform(self.gltf, self.binary, proof)


if __name__ == '__main__':
    unittest.main()

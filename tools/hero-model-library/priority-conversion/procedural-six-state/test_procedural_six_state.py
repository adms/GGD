import importlib.util,json,tempfile,unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[4]
SCRIPT=Path(__file__).with_name('ggd-procedural-six-state.py')
SPEC=importlib.util.spec_from_file_location('procedural_six_state',SCRIPT)
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)

class ProceduralSixStateTest(unittest.TestCase):
    def test_world_delta_conjugation(self):
        rest=np.eye(4);rest[:3,:3]=MODULE.quat_matrix(MODULE.euler([0,0,90]))
        local=MODULE.world_delta_to_local(rest,[30,0,0])
        actual=rest[:3,:3]@MODULE.quat_matrix(local)
        expected=MODULE.quat_matrix(MODULE.euler([30,0,0]))@rest[:3,:3]
        np.testing.assert_allclose(actual,expected,atol=1e-7)

    def test_ryu_build_is_deterministic_and_six_state(self):
        source=ROOT/'content/assets/models/community/cb216ec537d9ea1a5c5d01c3a8afe88de547c57b76282254c1b6da0e15193c5c.glb'
        config=Path(__file__).with_name('configs')/'ssbu-ryu-c00-v1.json'
        source_sha=MODULE.hashlib.sha256(source.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as td:
            a,b=Path(td)/'a',Path(td)/'b';MODULE.build(source,config,a);MODULE.build(source,config,b)
            self.assertEqual((a/'body.glb').read_bytes(),(b/'body.glb').read_bytes())
            glb,blob=MODULE.read_glb(a/'body.glb')
            self.assertEqual([x['name'] for x in glb['animations']],[f'GGD_procedural_{x}' for x in MODULE.STATES])
            self.assertEqual(glb['extras']['ggdProceduralFallback']['coordinateSpace'],'world-rest')
            for animation in glb['animations']:
                for sampler in animation['samplers']:
                    self.assertTrue(np.isfinite(MODULE.accessor(glb,blob,sampler['output'])).all())
            receipt=json.loads((a/'preparation.receipt.json').read_text())
            self.assertFalse(receipt['animationProvenance']['native'])
            self.assertFalse(receipt['animationProvenance']['retargeted'])
        self.assertEqual(MODULE.hashlib.sha256(source.read_bytes()).hexdigest(),source_sha)

if __name__=='__main__':unittest.main()

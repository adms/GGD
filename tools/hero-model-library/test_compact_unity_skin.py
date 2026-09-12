import io
import tempfile
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
from compact_unity_skin import accessor, common_bind_shape, compact, read_glb, srgb_to_linear
from convert_unity_prefab import GLB, trs_matrix


class CompactSkin(unittest.TestCase):
    def test_differing_per_joint_bind_shapes_are_rejected(self):
        base=np.array([np.eye(4),trs_matrix([0,1,2],[0,.4,0,.9],[1,1,1])])
        shape=trs_matrix([1,-2,3],[.3,0,0,.9],[2,2,2])
        result,error=common_bind_shape(base,base@shape)
        np.testing.assert_allclose(result,shape,atol=1e-12)
        self.assertLess(error,1e-12)
        invalid=base@shape;invalid[1,0,3]+=.01
        with self.assertRaises(ValueError):common_bind_shape(base,invalid)

    def test_complete_geometry_and_native_texture_resolution_survive_compaction(self):
        glb=GLB();glb.doc['nodes']=[{'children':[1]},{'name':'joint'},{'mesh':0,'skin':0},{'mesh':1,'skin':1}]
        glb.doc['scenes']=[{'nodes':[0,2,3]}]
        im=Image.new('RGB',(64,64),(220,220,210));im.paste((100,40,20),(32,32,56,56))
        stream=io.BytesIO();im.save(stream,format='PNG')
        glb.doc['images']=[{'bufferView':glb.view(stream.getvalue()),'mimeType':'image/png'}]
        glb.doc['textures']=[{'source':0,'sampler':0}]
        glb.doc['materials']=[{'name':'pattern','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.5}},
                             {'name':'solid','pbrMetallicRoughness':{'baseColorFactor':[.1,.2,.3,1],'metallicFactor':0,'roughnessFactor':1}}]
        for mid,bind in enumerate([np.eye(4),trs_matrix([1,2,3],[0,0,0,1],[2,2,2])]):
            attrs={'POSITION':glb.accessor([[0,0,0],[1,0,0],[0,1,0]],'VEC3',target=34962,bounds=True),
                   'NORMAL':glb.accessor([[0,0,1]]*3,'VEC3',target=34962),
                   'TEXCOORD_0':glb.accessor([[.5,.5],[.8,.5],[.5,.8]],'VEC2',target=34962),
                   'JOINTS_0':glb.accessor([[0,0,0,0]]*3,'VEC4',5123,34962),
                   'WEIGHTS_0':glb.accessor([[1,0,0,0]]*3,'VEC4',target=34962)}
            glb.doc['meshes'].append({'primitives':[{'attributes':attrs,'indices':glb.accessor([0,1,2],'SCALAR',5125,34963),'material':mid}]})
            glb.doc['skins'].append({'joints':[1],'skeleton':1,'inverseBindMatrices':glb.accessor(bind.T.reshape(1,16),'MAT4')})
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);src=root/'source.glb';glb.write(src);source_bytes=src.read_bytes()
            report=compact(src,root/'out');self.assertEqual(src.read_bytes(),source_bytes)
            self.assertEqual(report['output']['triangles'],2);self.assertEqual(report['output']['drawPrimitives'],1)
            self.assertEqual(report['patternedTextureResolutions'],[[64,64]])
            d,b=read_glb(root/'out/body.glb');p=d['meshes'][0]['primitives'][0]
            np.testing.assert_allclose(accessor(d,b,p['attributes']['POSITION']),[[0,0,0],[1,0,0],[0,1,0],[1,2,3],[3,2,3],[1,4,3]])
            np.testing.assert_allclose(accessor(d,b,p['attributes']['COLOR_0'])[3:,:3],[[.1,.2,.3]]*3)
            self.assertEqual(len(d['skins']),1);self.assertFalse(report['runtimeReady'])
            self.assertLessEqual(report['maxRoughnessQuantizationError'],.5/255+1e-9)

    def test_solid_colors_use_linear_not_srgb_multipliers(self):
        np.testing.assert_allclose(srgb_to_linear([0,.5,1]),[0,.21404114048223255,1])


if __name__=='__main__':unittest.main()

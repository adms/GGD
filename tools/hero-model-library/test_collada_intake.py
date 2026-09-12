import unittest
import xml.etree.ElementTree as ET
from convert_collada_intake import repair_uv


class ColladaUVRepair(unittest.TestCase):
    def test_single_source_uv_repairs_only_missing_reference(self):
        tree = ET.fromstring('''<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema">
          <input semantic="TEXCOORD" set="0"/><bind_vertex_input input_semantic="TEXCOORD" input_set="0"/>
        </COLLADA>''')
        doc = {'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0, 'texCoord': 6}}}],
               'meshes': [{'primitives': [{'material': 0, 'attributes': {'TEXCOORD_0': 2, 'POSITION': 1}}]}]}
        fixed, repairs = repair_uv(doc, tree)
        self.assertEqual(fixed['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['texCoord'], 0)
        self.assertEqual(len(repairs), 1)
        self.assertEqual(doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['texCoord'], 6)
        self.assertEqual(fixed['meshes'], doc['meshes'])

    def test_multiple_uv_sets_are_not_guessed(self):
        tree = ET.fromstring('''<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema">
          <input semantic="TEXCOORD" set="0"/><input semantic="TEXCOORD" set="1"/>
          <bind_vertex_input input_semantic="TEXCOORD" input_set="0"/>
        </COLLADA>''')
        doc = {'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0, 'texCoord': 6}}}],
               'meshes': [{'primitives': [{'material': 0, 'attributes': {'TEXCOORD_0': 2}}]}]}
        with self.assertRaisesRegex(ValueError, 'Ambiguous UV'):
            repair_uv(doc, tree)


if __name__ == '__main__':
    unittest.main()

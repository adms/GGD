import io
import json
import struct
import unittest
from PIL import Image
from convert_jumpx_body import encode_glb
from normalize_opaque_alpha import normalize

class OpaqueAlphaTest(unittest.TestCase):
    def test_ignored_alpha_bakes_without_changing_rgb_or_motion_buffer(self):
        image=Image.new('RGBA',(2,2),(71,43,29,0)); encoded=io.BytesIO();image.save(encoded,format='PNG')
        binary=b'original rig and motion'+encoded.getvalue()
        doc=dict(asset=dict(version='2.0'),buffers=[dict(byteLength=len(binary))],bufferViews=[dict(buffer=0,byteOffset=23,byteLength=len(encoded.getvalue()))],images=[dict(bufferView=0,mimeType='image/png')],textures=[dict(source=0)],materials=[dict(pbrMetallicRoughness=dict(baseColorTexture=dict(index=0)))])
        original=encode_glb(doc,binary);result,changed=normalize(original)
        self.assertEqual(changed,[0]);n=struct.unpack_from('<I',result,12)[0];d=json.loads(result[20:20+n]);data=result[28+n:]
        self.assertEqual(data[:len(binary)],binary)
        view=d['bufferViews'][d['images'][0]['bufferView']]
        with Image.open(io.BytesIO(data[view['byteOffset']:view['byteOffset']+view['byteLength']])) as after:
            self.assertEqual(after.convert('RGB').tobytes(),image.convert('RGB').tobytes())
            self.assertEqual(after.getchannel('A').getextrema(),(255,255))
        self.assertEqual(normalize(result),(result,[]))
        doc['materials'][0]['alphaMode']='BLEND'
        original=encode_glb(doc,binary);self.assertEqual(normalize(original),(original,[]))

if __name__=='__main__':unittest.main()

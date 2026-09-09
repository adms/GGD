"""Downloaded archives must not write outside their intake directory."""
import stat
import struct
import json
import lzma
import zlib
import tempfile
import unittest
import zipfile
from pathlib import Path
from extract_public_sources import unpack_zip, unpack_gma, extract_map_references


class PublicArchive(unittest.TestCase):
    def test_compressed_gma_verifies_bytes_crc_and_paths(self):
        body=b'IDST-model-payload'
        def gma(name,crc):
            header=b'GMAD\x03'+b'\0'*16+b'\0model\0description\0author\0'+struct.pack('<i',1)
            index=struct.pack('<I',1)+name.encode()+b'\0'+struct.pack('<qI',len(body),crc)+struct.pack('<I',0)
            return lzma.compress(header+index+body+b'\0'*4,format=lzma.FORMAT_ALONE)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);src=root/'addon.gma.lzma';src.write_bytes(gma('models/body.mdl',zlib.crc32(body)))
            unpack_gma(src,root/'ok')
            self.assertEqual((root/'ok/models/body.mdl').read_bytes(),body)
            for name,crc in [('../escape',zlib.crc32(body)),('models/body.mdl',1)]:
                src.write_bytes(gma(name,crc))
                with self.assertRaises(ValueError):unpack_gma(src,root/'bad')
                self.assertFalse((root/'bad').exists())

    def test_map_without_listfile_follows_unit_model_and_texture_references(self):
        def integer(n): return struct.pack('<i', n)
        unit = b'hfoo'+b'H000'+integer(1)+b'umdl'+integer(3)+b'war3mapImported\\hero.mdl\0'+b'H000'
        objects = integer(2)+integer(0)+integer(1)+unit
        texture = integer(0)+b'hero.blp'.ljust(260,b'\0')+integer(0)
        model = b'MDLX'+b'TEXS'+integer(len(texture))+texture
        files = {'war3map.w3u': objects, 'war3mapimported\\hero.mdx': model, 'hero.blp': b'BLP1example'}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            errors = extract_map_references(lambda name: files.get(name.lower()), root)
            self.assertEqual(errors, [])
            self.assertEqual((root/'war3mapImported/hero.mdx').read_bytes(),model)
            self.assertEqual((root/'hero.blp').read_bytes(),b'BLP1example')
            report=json.loads((root/'map-reference-extraction.json').read_text())
            self.assertEqual(report['missingReferences'], [])
            self.assertEqual(len(report['files']),3)

    def test_nested_model_bytes_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); src=root/'input.zip'
            with zipfile.ZipFile(src,'w') as z:z.writestr('model/body.mdx',b'MDLX\0\x10\xff')
            unpack_zip(src,root/'out')
            self.assertEqual((root/'out/model/body.mdx').read_bytes(),b'MDLX\0\x10\xff')

    def test_traversal_and_archive_symlink_are_rejected(self):
        for name in ['../escape','model/../../escape','/escape','C:\\escape']:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); src=root/'input.zip'
                with zipfile.ZipFile(src,'w') as z:z.writestr(name,b'no')
                with self.assertRaises(ValueError):unpack_zip(src,root/'out')
                self.assertFalse((root/'escape').exists())
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); src=root/'input.zip';info=zipfile.ZipInfo('link')
            info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16
            with zipfile.ZipFile(src,'w') as z:z.writestr(info,'../escape')
            with self.assertRaises(ValueError):unpack_zip(src,root/'out')


if __name__=='__main__':unittest.main()

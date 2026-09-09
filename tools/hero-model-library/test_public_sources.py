"""Downloaded archives must not write outside their intake directory."""
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path
from extract_public_sources import unpack_zip


class PublicArchive(unittest.TestCase):
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

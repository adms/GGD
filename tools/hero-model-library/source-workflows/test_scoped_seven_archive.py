import hashlib,importlib.util,io,json,os,tarfile,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('archiver',Path(__file__).with_name('build_scoped_seven_archive.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class ScopedArchiveTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)/'root';self.root.mkdir();(self.root/'a.txt').write_bytes(b'payload\0\xff');self.row={'path':'a.txt','bytes':9,'sha256':hashlib.sha256(b'payload\0\xff').hexdigest()}
 def test_deterministic_and_readback(self):
  a=Path(self.tmp.name)/'a.tar.gz';b=Path(self.tmp.name)/'b.tar.gz';mod.create_archive(self.root,[self.row],a);os.utime(self.root/'a.txt',(1111111111,1111111111));mod.create_archive(self.root,[self.row],b);self.assertEqual(a.read_bytes(),b.read_bytes());self.assertTrue(mod.verify_archive(a,[self.row])[0]['localArchiveReadbackVerified'])
 def test_path_rejection(self):
  for s in ['/abs','../escape','a/../escape','a//b','a/./b','C:/file','a\\b','a\0b']:
   with self.assertRaises(ValueError):mod.safe_name(s)
 def test_duplicate_rejection(self):
  with self.assertRaises(ValueError):mod.normalize_rows([self.row,self.row])
 def test_symlink_file_and_parent_rejection(self):
  (self.root/'link').symlink_to(self.root/'a.txt');(self.root/'dirlink').symlink_to(self.root,target_is_directory=True)
  for s in ['link','dirlink/a.txt']:
   with self.assertRaises(ValueError):mod.safe_file(self.root,s)
 def test_changed_payload_rejected(self):
  (self.root/'a.txt').write_bytes(b'changed!!')
  with self.assertRaises(ValueError):mod.create_archive(self.root,[self.row],Path(self.tmp.name)/'bad.tar.gz')
 def test_extra_member_rejected(self):
  a=Path(self.tmp.name)/'a.tar.gz';mod.create_archive(self.root,[self.row],a)
  with self.assertRaises(ValueError):mod.verify_archive(a,[])
 def test_delivery_exact_copy_and_no_overwrite(self):
  p=Path(self.tmp.name)/'delivery.json';p.write_bytes(b'{"files":[]}\n');digest=mod.digest_file(p);r=mod.copy_delivery(p,digest,self.root,'deliveries/a.json');self.assertEqual((self.root/r['path']).read_bytes(),p.read_bytes());mod.copy_delivery(p,digest,self.root,'deliveries/a.json');p.write_bytes(b'{}\n')
  with self.assertRaises(ValueError):mod.copy_delivery(p,mod.digest_file(p),self.root,'deliveries/a.json')
 def test_delivery_symlink_parent_creates_nothing(self):
  p=Path(self.tmp.name)/'delivery.json';p.write_bytes(b'{}');outside=Path(self.tmp.name)/'outside';outside.mkdir();(self.root/'link').symlink_to(outside,target_is_directory=True)
  with self.assertRaises(ValueError):mod.copy_delivery(p,mod.digest_file(p),self.root,'link/newdir/delivery.json')
  self.assertFalse((outside/'newdir').exists())
if __name__=='__main__':unittest.main()

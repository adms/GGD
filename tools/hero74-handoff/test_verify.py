import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('verify_handoff',Path(__file__).with_name('verify.py'));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class IntegrityTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.f=self.root/'materials/hero74-handoff/frozen';self.a=self.f/'archive';self.a.mkdir(parents=True)
  self.snapshot=self.f/'snapshots/source.json';self.snapshot.parent.mkdir();self.snapshot.write_bytes(b'{"version":1}\n')
  data=b'payload';h=v.sha(data);self.member={'path':'example/hero.zip','bytes':len(data),'sha256':h}
  self.part={'path':'payload.tar.gz.part000','bytes':3,'sha256':v.sha(b'abc')}
  self.write(self.a/'manifest.json',{'files':[self.member],'parts':[self.part]});mh=v.sha((self.a/'manifest.json').read_bytes())
  self.write(self.a/'s3-location.json',{'manifestSha256':mh,'prefix':'example/','bucket':'example'})
  self.write(self.a/'s3-upload-receipt.json',{'manifestSha256':mh,'prefix':'example/','bucket':'example','objects':[self.part,{'path':'manifest.json'}]})
  self.write(self.a/'s3-restore-receipt.json',{'manifestSha256':mh,'restoredFiles':1,'verifiedParts':1,'fileHashesVerified':True,'freshDownload':True})
  self.index={'existingArchives':[],'files':[{'path':'original/source.json','sha256':v.sha(self.snapshot.read_bytes()),'delivery':{'kind':'git-snapshot','path':str(self.snapshot.relative_to(self.root)),'payloadSha256':v.sha(self.snapshot.read_bytes())}},{'path':'example/hero.zip','sha256':h,'delivery':{'kind':'new-s3','member':'example/hero.zip','payloadSha256':h}}],'summary':{'files':2,'unclassified':0,'byDelivery':{'git-snapshot':1,'new-s3':1}}}
  self.write(self.f/'inventory.json',self.index)
 def write(self,p,x):p.write_text(json.dumps(x))
 def test_intact_manifest_and_snapshot(self):self.assertEqual(v.verify(self.root)['files'],2)
 def test_snapshot_tampering_is_rejected(self):
  self.snapshot.write_bytes(b'changed')
  with self.assertRaisesRegex(AssertionError,'SNAPSHOT_CHANGED'):v.verify(self.root)
 def test_archive_source_mismatch_is_rejected(self):
  self.index['files'][1]['sha256']='0'*64;self.write(self.f/'inventory.json',self.index)
  with self.assertRaisesRegex(AssertionError,'NEW_ARCHIVE_SOURCE_CHANGED'):v.verify(self.root)
 def test_manifest_cannot_escape_repository(self):
  self.index['files'][0]['delivery']['path']='../escape';self.write(self.f/'inventory.json',self.index)
  with self.assertRaises(AssertionError):v.verify(self.root)
if __name__=='__main__':unittest.main()

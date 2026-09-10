"""Scoped uploader safety tests: AWS is stubbed before importing the uploader."""
import contextlib,gzip,hashlib,importlib.util,io,json,sys,tarfile,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch

def file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

stub=types.ModuleType('backup_intake');stub.BUCKET='ggd-390630837668-ap-east-2-an';stub.sha=file_sha
stub.aws=lambda *a,**k:(_ for _ in ()).throw(AssertionError('AWS was not mocked'))
# Even an accidental call cannot reach subprocess, credentials, or the network.
with patch.dict(sys.modules,{'backup_intake':stub}):
    spec=importlib.util.spec_from_file_location('uploader_under_test',Path(__file__).with_name('upload_scoped_tar.py'));uploader=importlib.util.module_from_spec(spec);spec.loader.exec_module(uploader)

class ScopedUploaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='ggd-scoped-upload-test-');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.path=self.root/'manifest.json';self.calls=[];self.objects={};self.mode=None;self.make_fixture()
    def make_fixture(self,extra=None):
        archive=self.root/'fixture.tar.gz';payload=b'payload'
        with archive.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,filename='') as gz,tarfile.open(fileobj=gz,mode='w|') as tf:
            item=tarfile.TarInfo('a.txt');item.size=len(payload);tf.addfile(item,io.BytesIO(payload))
            if extra:
                name,kind=extra;item=tarfile.TarInfo(name)
                if kind=='symlink':item.type=tarfile.SYMTYPE;item.linkname='../outside';tf.addfile(item)
                elif kind=='directory':item.type=tarfile.DIRTYPE;tf.addfile(item)
                else:item.size=len(payload);tf.addfile(item,io.BytesIO(payload))
        digest=file_sha(archive);self.manifest={'sourceId':'scoped-test','sha256':digest,'plannedS3Uri':f's3://{uploader.BUCKET}/legacy/public-model-sources/scoped-test/{digest}.tar.gz','archiveFormat':'tar-gzip','absoluteLocalArchive':str(archive),'bytes':archive.stat().st_size,'files':[{'path':'a.txt','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}],'fileCount':1};self.path.write_text(json.dumps(self.manifest));self.original=self.path.read_bytes()
    def mutate(self):
        m=json.loads(self.path.read_bytes());m['sourceId']='changed-after-validation';self.path.write_text(json.dumps(m))
    def aws(self,args,action,resource):
        self.calls.append((action,resource))
        if action=='sts:GetCallerIdentity':return 'arn:aws:sts::390630837668:assumed-role/'+('wrong' if self.mode=='wrong-role' else 'vibe-coding-s3-role')+'/test'
        if self.mode=='denied':raise RuntimeError(action+' '+resource+': AccessDenied')
        src,dest=args[2:4]
        if src.startswith('s3://'):
            Path(dest).write_bytes(b'corrupt' if self.mode=='corrupt-get' else self.objects[src])
            if src.endswith('.files.json'):
                if self.mode=='mutate-before-receipt':self.mutate()
                if self.mode=='receipt-race':(self.root/'s3-verified-receipt.json').write_text('other-workflow')
        else:
            if dest.endswith('.files.json') and self.mode=='mutate-during-manifest-put':self.mutate()
            self.objects[dest]=Path(src).read_bytes()
            if dest.endswith('.tar.gz') and self.mode=='mutate-before-manifest-put':self.mutate()
        return ''
    def run_main(self):
        with patch.object(uploader,'aws',self.aws),patch.object(sys,'argv',['upload_scoped_tar.py',str(self.path)]),contextlib.redirect_stdout(io.StringIO()):uploader.main()
    def assert_no_receipt(self):self.assertFalse((self.root/'s3-verified-receipt.json').exists())
    def test_valid_pinned_receipt(self):
        self.run_main();r=json.loads((self.root/'s3-verified-receipt.json').read_text());self.assertEqual(r['manifestSha256'],hashlib.sha256(self.original).hexdigest());self.assertTrue(r['allArchiveMembersSha256Verified']);self.assertEqual([a for a,_ in self.calls],['sts:GetCallerIdentity','s3:PutObject','s3:GetObject','s3:PutObject','s3:GetObject'])
    def test_all_existing_outputs_and_dangling_symlinks_rejected_before_aws(self):
        for name in ['s3-full-readback.tar.gz','s3-manifest-readback.json','s3-verified-receipt.json']:
            for symlink in [False,True]:
                with self.subTest(name=name,symlink=symlink):
                    p=self.root/name
                    if symlink:p.symlink_to(self.root/'missing')
                    else:p.write_bytes(b'preserve')
                    with self.assertRaisesRegex(ValueError,'Preserve existing'):self.run_main()
                    self.assertEqual(self.calls,[])
                    if not symlink:self.assertEqual(p.read_bytes(),b'preserve')
                    p.unlink()
    def test_changed_before_manifest_put_rejected(self):
        self.mode='mutate-before-manifest-put'
        with self.assertRaisesRegex(ValueError,'Frozen manifest'):self.run_main()
        self.assertEqual(len(self.calls),3);self.assert_no_receipt()
    def test_changed_during_manifest_put_rejected_by_pinned_readback(self):
        self.mode='mutate-during-manifest-put'
        with self.assertRaisesRegex(ValueError,'Remote file manifest differs'):self.run_main()
        self.assert_no_receipt()
    def test_changed_before_receipt_rejected(self):
        self.mode='mutate-before-receipt'
        with self.assertRaisesRegex(ValueError,'Frozen manifest'):self.run_main()
        self.assert_no_receipt()
    def test_receipt_race_does_not_overwrite(self):
        self.mode='receipt-race'
        with self.assertRaises(FileExistsError):self.run_main()
        self.assertEqual((self.root/'s3-verified-receipt.json').read_text(),'other-workflow')
    def test_nonregular_duplicate_traversal_or_unlisted_members_rejected(self):
        for extra in [('extra-link','symlink'),('dir','directory'),('a.txt','file'),('../escape','file'),('extra.txt','file')]:
            with self.subTest(extra=extra):
                self.make_fixture(extra)
                with self.assertRaises(ValueError):self.run_main()
                self.assert_no_receipt()
                back=self.root/'s3-full-readback.tar.gz'
                if back.exists():back.unlink()
    def test_wrong_role_and_access_denied_stop(self):
        self.mode='wrong-role'
        with self.assertRaisesRegex(ValueError,'authorized role'):self.run_main()
        self.assertEqual([a for a,_ in self.calls],['sts:GetCallerIdentity']);self.calls=[];self.mode='denied'
        with self.assertRaisesRegex(RuntimeError,'s3:PutObject .*AccessDenied'):self.run_main()
        self.assertEqual([a for a,_ in self.calls],['sts:GetCallerIdentity','s3:PutObject']);self.assert_no_receipt()
    def test_corrupt_full_get_stops(self):
        self.mode='corrupt-get'
        with self.assertRaisesRegex(ValueError,'Remote archive'):self.run_main()
        self.assertEqual(len(self.calls),3);self.assert_no_receipt()
    def test_wrong_bucket_rejected_without_aws(self):
        self.manifest['plannedS3Uri']='s3://not-authorized/legacy/a';self.path.write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError,'Unexpected bucket'):self.run_main()
        self.assertEqual(self.calls,[])
if __name__=='__main__':unittest.main()

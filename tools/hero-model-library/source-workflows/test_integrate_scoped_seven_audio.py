"""Admission contract tests use isolated temporary JSON; never contact AWS."""
from copy import deepcopy
import contextlib,hashlib,importlib.util,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('admission',Path(__file__).with_name('integrate_scoped_seven_audio.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x))
class AdmissionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='ggd-admission-test-');self.addCleanup(self.tmp.cleanup);self.ws=Path(self.tmp.name);self.repo=self.ws/'GGD';self.base=self.repo/'materials/hero-model-library';self.proposals=self.ws/'proposals';self.groups=[];self.files=[];self.counts={k:1 for k in mod.COUNTS}
  for native in self.counts:
   key=native.split('.')[0].lower();prefix=f'audio/decoded/{native}/wav/';self.groups.append({'id':f'lol-{key}-ja-jp-16-18-8159717','nativeId':native,'pcmWavCount':1,'heroIds':[f'example:{key}',f'lol-{key}'],'pathPrefixes':[prefix]});self.files.append({'path':prefix+'one.wav','nativeId':native,'bytes':1,'sha256':'1'*64})
  self.report={'sourceId':mod.SOURCE_ID,'deliveryFrozen':True,'packages':[{'nativeId':x} for x in self.counts],'files':deepcopy(self.files),'allFiles':deepcopy(self.files)};self.reportpath=self.ws/'intake/exact/delivery.json';write(self.reportpath,self.report);self.deliverysha=mod.sha(self.reportpath)
  self.archivepath=self.ws/'backup/archive.tar.gz';self.archivepath.parent.mkdir(parents=True);self.archivepath.write_bytes(b'fixture-container');digest=mod.sha(self.archivepath);uri=f's3://{mod.BUCKET}/legacy/public-model-sources/{mod.SOURCE_ID}/{digest}.tar.gz';rows=[{k:r[k] for k in ['path','bytes','sha256']} for r in self.files]+[{'path':'delivery.json','bytes':self.reportpath.stat().st_size,'sha256':self.deliverysha}]
  self.archive={'id':mod.SOURCE_ID,'sha256':digest,'bytes':self.archivepath.stat().st_size,'fileCount':len(rows),'files':rows,'archiveFormat':'tar-gzip','archiveMemberRoot':'','plannedS3Uri':uri,'localArchive':'backup/archive.tar.gz','readbackVerified':False};self.frozen={**self.archive,'sourceId':mod.SOURCE_ID,'absoluteLocalArchive':str(self.archivepath)};self.frozenpath=self.ws/'backup/manifest.json';write(self.frozenpath,self.frozen);self.frozensha=mod.sha(self.frozenpath)
  self.source={'id':mod.SOURCE_ID,'audioGroups':deepcopy(self.groups),'localPath':'intake/exact','audioFileIndex':{'reportPath':'delivery.json','reportSha256':self.deliverysha},'pendingBackup':{k:self.archive[k] for k in ['sha256','bytes','plannedS3Uri','archiveFormat','archiveMemberRoot']},'backupStatus':{'manifestAbsolutePath':str(self.frozenpath),'manifestSha256':self.frozensha},'backendIntegration':{'state':'pending-audio-review'}};self.receipt={'id':mod.SOURCE_ID,'sha256':digest,'bytes':self.archive['bytes'],'fileCount':len(rows),'s3Uri':uri,'manifestUri':uri.removesuffix('.tar.gz')+'.files.json','manifestSha256':self.frozensha,'profile':'vibe-coding','region':'ap-east-2','archiveFormat':'tar-gzip','archiveMemberRoot':'','readbackVerified':True,'fullGetVerified':True,'allArchiveMembersSha256Verified':True,'localPreserved':True,'localArchive':str(self.archivepath),'localManifest':str(self.frozenpath),'localReadback':str(self.ws/'backup/readback.tar.gz')};self.receiptpath=self.ws/'receipt.json';write(self.receiptpath,self.receipt);self.saveproposals()
  write(self.base/'download-sources.json',{'publicSources':[{'id':'other-workflow','custom':{'keep':True}}],'paidSources':[{'id':'paid-preserve'}]});write(self.base/'public-source-files.json',{'sources':[{'id':'other-verified','sha256':'9'*64}],'pendingUploads':[{'id':'other-pending','sha256':'8'*64,'custom':'keep'}]})
  for key,val in [('REPO',self.repo),('BASE',self.base),('COUNTS',self.counts),('DELIVERY_SHA256',self.deliverysha),('SCOPED_MANIFEST_SHA256',self.frozensha)]:patcher=patch.object(mod,key,val);patcher.start();self.addCleanup(patcher.stop)
 def saveproposals(self):
  write(self.proposals/'lol-seven-source-entry-proposal.json',self.source);write(self.proposals/'public-source-files-pending-uploads-proposal.json',{'pendingUploads':[self.archive]})
 def invoke(self,receipt=False):
  argv=['admission','--proposals',str(self.proposals)]+(['--receipt',str(self.receiptpath)] if receipt else [])
  with patch.object(sys,'argv',argv),contextlib.redirect_stdout(io.StringIO()):mod.main()
 def central_bytes(self):return [(self.base/p).read_bytes() for p in ['download-sources.json','public-source-files.json']]
 def invalid(self,receipt=False):
  before=self.central_bytes()
  with self.assertRaises((ValueError,KeyError)):self.invoke(receipt)
  self.assertEqual(before,self.central_bytes())
 def test_pending_idempotent_and_unrelated_records_preserved(self):
  self.invoke();first=self.central_bytes();self.invoke();self.assertEqual(first,self.central_bytes());d=json.loads(first[0]);i=json.loads(first[1]);self.assertEqual(d['publicSources'][0],{'id':'other-workflow','custom':{'keep':True}});self.assertEqual(d['paidSources'],[{'id':'paid-preserve'}]);self.assertEqual(i['pendingUploads'][0]['id'],'other-pending')
 def test_promotion_idempotent_preserves_other_workflow_annotations(self):
  self.invoke();d=mod.read(self.base/'download-sources.json');d['publicSources'][-1]['editorReview']={'keep':True};d['publicSources'][-1]['backendIntegration']['otherWorkflowNote']='keep';write(self.base/'download-sources.json',d);i=mod.read(self.base/'public-source-files.json');i['pendingUploads'][-1]['otherWorkflowNote']='keep';write(self.base/'public-source-files.json',i);self.invoke(True);first=self.central_bytes();self.invoke(True);self.assertEqual(first,self.central_bytes());d=json.loads(first[0]);i=json.loads(first[1]);self.assertTrue(d['publicSources'][-1]['editorReview']['keep']);self.assertEqual(d['publicSources'][-1]['backendIntegration']['otherWorkflowNote'],'keep');self.assertEqual(i['sources'][-1]['otherWorkflowNote'],'keep');self.assertEqual(len(i['pendingUploads']),1)
 def test_duplicate_group_rejected(self):self.source['audioGroups'].append(deepcopy(self.groups[0]));self.saveproposals();self.invalid()
 def test_wrong_group_prefix_rejected(self):self.source['audioGroups'][0]['pathPrefixes']=['audio/decoded/Ahri.ja_JP/wav/'];self.saveproposals();self.invalid()
 def test_wrong_group_native_count_rejected(self):self.source['audioGroups'][0]['pcmWavCount']=2;self.saveproposals();self.invalid()
 def test_extra_roster_archive_member_rejected(self):self.archive['files'].append({'path':'audio/decoded/Ahri.ja_JP/wav/one.wav','bytes':1,'sha256':'1'*64});self.archive['fileCount']+=1;self.saveproposals();self.invalid()
 def test_duplicate_archive_member_rejected(self):self.archive['files'].append(deepcopy(self.archive['files'][0]));self.saveproposals();self.invalid()
 def test_missing_delivery_member_rejected(self):self.archive['files'].pop();self.archive['fileCount']-=1;self.saveproposals();self.invalid()
 def test_changed_delivery_and_scoped_manifest_rejected(self):
  self.report['files'][0]['nativeId']='Ahri.ja_JP';write(self.reportpath,self.report);self.invalid();write(self.reportpath,{'changed':True});self.invalid()
 def test_wrong_actual_native_counts_rejected_even_with_test_pin(self):
  self.report['files'][0]['nativeId']='Ahri.ja_JP';write(self.reportpath,self.report);self.source['audioFileIndex']['reportSha256']=mod.sha(self.reportpath);self.saveproposals()
  with patch.object(mod,'DELIVERY_SHA256',mod.sha(self.reportpath)):self.invalid()
 def test_wrong_receipt_identity_manifest_scope_and_flags_rejected(self):
  original=deepcopy(self.receipt)
  for key,bad in [('id','other'),('sha256','0'*64),('bytes',1),('fileCount',999),('s3Uri','s3://wrong/a'),('manifestUri','s3://wrong/b'),('manifestSha256','0'*64),('profile','default'),('region','us-east-1'),('archiveFormat','zip'),('archiveMemberRoot','other'),('readbackVerified',1),('fullGetVerified',False),('allArchiveMembersSha256Verified',False),('localPreserved',False),('localManifest',str(self.ws/'other.json')),('localArchive',str(self.ws/'other.tar'))]:
   with self.subTest(key=key):r=deepcopy(original);r[key]=bad;write(self.receiptpath,r);self.invalid(True)
 def test_wrong_authorized_archive_uri_rejected(self):self.archive['plannedS3Uri']='s3://wrong/legacy/a';self.source['pendingBackup']['plannedS3Uri']=self.archive['plannedS3Uri'];self.saveproposals();self.invalid()
 def test_unsafe_report_path_rejected(self):self.source['audioFileIndex']['reportPath']='../outside.json';self.saveproposals();self.invalid()
 def test_verified_record_cannot_be_downgraded(self):self.invoke(True);self.invalid()
if __name__=='__main__':unittest.main()

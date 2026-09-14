"""Ready component copies remain separate from runtime hero registration."""
import hashlib,subprocess,tempfile,unittest
from pathlib import Path
from build_palworld_index import model_components
from current_resource_index import verify_component_git_contents
class ComponentIndex(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.repo=Path(self.temp.name)
  raw=b'verified immutable component fixture';digest=hashlib.sha256(raw).hexdigest()
  self.c=dict(id='palworld.test.256',componentReady=True,runtimeSelectable=False,defaultEligible=False,sha256=digest,bytes=len(raw),gitPath='content/assets/models/community/'+digest+'.glb')
  self.path=self.repo/self.c['gitPath'];self.path.parent.mkdir(parents=True);self.path.write_bytes(raw)
  self.data={'characters':[{'name':'測試帕魯','backlogIdentity':'community:palworld-test','modelCandidates':[self.c,{'id':'original','componentReady':False}]}]}
 def test_only_ready_component_is_exposed_without_hero_registration(self):
  rows=model_components(self.data,self.repo);self.assertEqual(len(rows),1)
  self.assertFalse(rows[0]['runtimeDropdownRegistered']);self.assertFalse(rows[0]['ggdHeroImplemented'])
  self.assertFalse(rows[0]['defaultEligible']);self.assertEqual(rows[0]['characterIdentity'],'community:palworld-test')
 def test_changed_copy_is_rejected(self):
  self.path.write_bytes(b'x'*self.c['bytes'])
  with self.assertRaises(AssertionError):model_components(self.data,self.repo)
 def test_component_cannot_silently_become_runtime_or_default(self):
  for key in ['runtimeSelectable','defaultEligible']:
   with self.subTest(key=key):
    self.c[key]=True
    with self.assertRaises(AssertionError):model_components(self.data,self.repo)
    self.c[key]=False
 def test_component_path_must_match_sha_not_escape_repo(self):
  self.c['gitPath']='../component.glb'
  with self.assertRaises(AssertionError):model_components(self.data,self.repo)
 def test_untracked_component_cannot_pass_git_publication_check(self):
  subprocess.run(['git','init','--quiet',str(self.repo)],check=True)
  with self.assertRaisesRegex(ValueError,'absent from the Git index'):
   verify_component_git_contents([self.c],self.repo)
  subprocess.run(['git','add','--',self.c['gitPath']],cwd=self.repo,check=True)
  verify_component_git_contents([self.c],self.repo)
 def test_unstaged_repair_does_not_hide_wrong_staged_bytes(self):
  subprocess.run(['git','init','--quiet',str(self.repo)],check=True)
  original=self.path.read_bytes();self.path.write_bytes(b'wrong staged payload')
  subprocess.run(['git','add','--',self.c['gitPath']],cwd=self.repo,check=True)
  self.path.write_bytes(original)
  with self.assertRaisesRegex(ValueError,'Git blob differs'):
   verify_component_git_contents([self.c],self.repo)
if __name__=='__main__':unittest.main()

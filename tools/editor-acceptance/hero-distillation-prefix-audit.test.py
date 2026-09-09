import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('prefix_audit',Path(__file__).with_name('hero-distillation-prefix-audit.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)


class PrefixAuditTests(unittest.TestCase):
    def test_lcp_handles_empty_different_and_equal_tokens(self):
        self.assertEqual(audit.lcp([1,2,3],[1,2,4]),[1,2])
        self.assertEqual(audit.lcp([],[1]),[])
        self.assertEqual(audit.lcp([1],[1,2]),[1])

    def test_hypothetical_reordering_keeps_frozen_bytes_and_never_tokenizes_answer(self):
        class Tokenizer:
            def apply_chat_template(self,messages,**kwargs):
                self_test.assertFalse(kwargs['return_dict'])
                self_test.assertEqual([m['role'] for m in messages],['system','user'])
                self_test.assertNotIn('PRIVATE_TEACHER',str(messages))
                return list(map(ord,audit.dumps(messages)))
        self_test=self
        fake=SimpleNamespace(AutoTokenizer=SimpleNamespace(from_pretrained=lambda *a,**kw:Tokenizer()))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);rows=[]
            for name,split in [('alpha','train'),('beta','dev')]:
                payload={'request':{'heroName':name},'allowedCatalog':{'public':['skill-a']*20},'assets':{'models':['proxy']}}
                rows.append({'split':split,'messages':[{'role':'system','content':'PUBLIC_SYSTEM'},
                    {'role':'user','content':audit.dumps(payload)},{'role':'assistant','content':'PRIVATE_TEACHER'}]})
            data=audit.dumps(rows).encode();(root/'examples.json').write_bytes(data)
            (root/'manifest.json').write_text(audit.dumps({'outputs':{'examples.json':audit.digest(data)},'counts':{'train':1,'dev':1}}))
            out=root/'audit.json'
            with patch.dict('sys.modules',{'transformers':fake}):audit.audit(root,root/'model',out)
            result=json.loads(out.read_text());self.assertFalse(result['datasetModified'])
            self.assertFalse(result['speedupMeasured']);self.assertEqual(len(result['groups']),1)
            group=result['groups'][0];self.assertGreater(group['reorderedCommonPrefixTokens'],group['oldCommonPrefixTokens'])
            self.assertEqual((root/'examples.json').read_bytes(),data)
            with self.assertRaisesRegex(AssertionError,'REFUSE_OVERWRITE'):audit.audit(root,root/'model',out)


if __name__=='__main__':unittest.main()

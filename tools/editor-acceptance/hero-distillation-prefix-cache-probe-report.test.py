import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('probe_report', Path(__file__).with_name(
    'hero-distillation-prefix-cache-probe-report.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PrefixCacheProbeReportTests(unittest.TestCase):
    def test_records_parity_without_copying_raw_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); ids = ['h:HERO', 'h:Q']; arms = []
            for number, raws in enumerate([['a','b'], ['a','b'], ['x','y']]):
                parent = root/f'r{number}'; arm = parent/'base'; arm.mkdir(parents=True)
                (parent/'manifest.json').write_text('{}')
                for index, raw in enumerate(raws):
                    row = {'id':ids[index], 'raw':raw, 'rawSha256':hashlib.sha256(raw.encode()).hexdigest(),
                           'seconds':index+1, 'promptTokens':10, 'cachedPromptTokens':5 if number==2 else 0,
                           'complete':True, 'outputFormatMatches':True}
                    (arm/f'case-{index:04d}.json').write_text(json.dumps(row))
                arms.append(arm)
            user={'allowedCatalog':{},'assets':{},'request':{},'outputContract':{}}
            public=root/'public.jsonl';public.write_text('\n'.join(json.dumps({'id':identity,'messages':[{'role':'system','content':'s'},{'role':'user','content':json.dumps(user)}]}) for identity in ids)+'\n')
            out=root/'report.json';result=p.report(*arms,public,out)
            self.assertEqual(result['runs']['postTurnCache']['rawParity'],[True,True])
            self.assertEqual(result['runs']['exactApc']['rawParity'],[False,False])
            self.assertNotIn('"raw":',json.dumps(result))


if __name__ == '__main__': unittest.main()

"""Integration checks for the portable handoff and owner approval boundaries."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'materials/hero-model-library'

class InventoryHandoff(unittest.TestCase):
    def test_links_and_approved_defaults_are_complete(self):
        inventory = json.loads((DATA/'inventory.json').read_text())
        sources = json.loads((DATA/'download-sources.json').read_text())
        policy = json.loads((DATA/'default-policy.json').read_text())
        report = (DATA/'全角色模型盤點.md').read_text()
        heroes = {h['id']:h for h in inventory['heroes']}
        self.assertEqual(len(heroes), len(inventory['heroes']))
        for entry in sources['entries']:
            self.assertIn(entry['target'], report)
            for source in entry['sources']: self.assertIn(source['submittedUrl'], report)
        for approved in policy['approvedDerivatives']:
            default = heroes[approved['heroId']]['default']
            self.assertEqual(default['id'], approved['sourceId'])
            self.assertEqual(default['asset']['sha256'], approved['sha256'])
        for hero in heroes.values():
            if hero['default']: self.assertTrue(hero['default']['defaultEligible'])
        # Similar strings must not cause an extra character mapping.
        nico = next(e for e in sources['entries'] if e['target'] == '尼古貓貓')
        self.assertEqual(nico['heroIds'], ['community-review-30-20260907'])
        kenshiro = next(e for e in sources['entries'] if e['target'] == '拳四郎')
        self.assertNotIn('godie-u00l', kenshiro['heroIds'])
        self.assertEqual(kenshiro['preserve']['heroId'], 'godie-u00l')
        public = {s['id']:s for s in inventory['downloadPlan'].get('publicSources',[])}
        for entry in inventory['downloadPlan']['entries']:
            if entry.get('purchaseHold'):
                self.assertTrue(entry['downloadPriority'].startswith('defer-'))
                for sid in entry['acquiredPublicSources']:
                    self.assertEqual(public[sid]['acquisitionStatus'],'downloaded-verified')
                    self.assertTrue(set(entry['heroIds']) & set(public[sid]['heroIds']))
                    self.assertFalse(public[sid]['defaultEligible'])
        maomao=heroes['b2-maomao']['publicCandidates']
        self.assertEqual([s['id'] for s in maomao],['thunderstore-maomao'])
        self.assertEqual(heroes['community-review-30-20260907']['publicCandidates'],[])

    def test_clean_checkout_needs_no_library_and_detects_stale_inputs(self):
        with tempfile.TemporaryDirectory(prefix='ggd-handoff-') as folder:
            target = Path(folder) / 'GGD'
            for rel in ['materials/hero-model-library','materials/community-hero-forge/recipes','content/champions']:
                shutil.copytree(REPO/rel, target/rel)
            for name in ['inventory.py','source_links.py','default_policy.py','query.py']:
                dest=target/'tools/hero-model-library'/name
                dest.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(REPO/'tools/hero-model-library'/name, dest)
            script=target/'tools/hero-model-library/inventory.py'
            subprocess.run([sys.executable,str(script),'--check'],check=True,capture_output=True)
            result=subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-popp','--json'],text=True)
            self.assertEqual(json.loads(result)['heroes'][0]['default']['id'],'derivative:popp')
            self.assertFalse((target.parent/'GGD-Asset-Library').exists())
            inputs=target/'materials/hero-model-library/download-sources.json'
            changed=json.loads(inputs.read_text());changed['entries'][0]['ownerNotes'].append('changed handoff fixture')
            inputs.write_text(json.dumps(changed,ensure_ascii=False))
            self.assertNotEqual(subprocess.run([sys.executable,str(script),'--check'],capture_output=True).returncode,0)

if __name__ == '__main__': unittest.main()

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
    def test_audio_reserve_cannot_close_a_model_gap_even_when_paid(self):
        from source_links import plan_sources
        for role in ['audio-supplement','animation-supplement','vfx-supplement','component-supplement','texture-supplement','validation-evidence','research-evidence']:
            with self.subTest(role=role):
                source={'id':'supplement-only','heroIds':['hero'],'resourceRole':role,'acquisitionStatus':'downloaded-verified','purchaseDecision':'hold-purchase-review-acquired-source'}
                data={'entries':[{'id':'owner-one','heroIds':['hero']}], 'publicSources':[], 'paidSources':[source]}
                result=plan_sources(data, {'heroes':[]}, {'approvedDerivatives':[]})
                entry=result['entries'][0]
                self.assertFalse(entry['purchaseHold'])
                self.assertEqual(entry['needsDownloadFor'], ['hero'])
                self.assertEqual(entry['downloadPriority'], 'owner-highest')
        inventory=json.loads((DATA/'inventory.json').read_text())
        link=next(h for h in inventory['heroes'] if h['id']=='godie-h00l')
        self.assertIn('dayjo-ssbb-zelda-audio', [s['id'] for s in link['audioSources']])
        self.assertNotIn('dayjo-ssbb-zelda-audio', [s['id'] for s in link['publicCandidates']])

    def test_source_release_priority_uses_verified_calendar_dates(self):
        from default_policy import source_release_rank
        newest={'sourceGameReleasedAt':'2018-12-07'}
        older={'sourceGameReleasedAt':'2008-01-31'}
        self.assertLess(source_release_rank(newest), source_release_rank(older))
        self.assertLess(source_release_rank(older), source_release_rank({}))
        self.assertEqual(source_release_rank({'sourceGameReleasedAt':'2026-02-31'}),0)

    def test_not_alias_cannot_attach_a_source_to_a_different_character(self):
        from query import public_match_scope, source_matches
        vearn_source = {
            'id': 'vearn-research',
            'heroIds': ['godie-ubal'],
            'target': '巴恩大魔王',
            'notAliases': ['Baran', '巴蘭', 'バラン'],
        }
        self.assertTrue(source_matches(vearn_source, '巴恩'))
        self.assertFalse(source_matches(vearn_source, '巴蘭'))
        self.assertEqual(public_match_scope([vearn_source], '巴蘭'), (set(), set()))

    def test_links_and_approved_defaults_are_complete(self):
        inventory = json.loads((DATA/'inventory.json').read_text())
        sources = json.loads((DATA/'download-sources.json').read_text())
        policy = json.loads((DATA/'default-policy.json').read_text())
        report = (DATA/'全角色模型盤點.md').read_text()
        self.assertTrue(report.index('## 第一守則') < report.index('## 購買暫緩'))
        self.assertTrue(sources['ingestionPolicy']['requireIndependentBackendOptions'])
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
            if hero['default'] and hero['defaultSelectionMode'] != 'manual': self.assertTrue(hero['default']['defaultEligible'])
            if hero['defaultSelectionMode'] == 'manual':
                self.assertEqual(hero['checkoutSelection']['mode'], 'manual')
        # Similar strings must not cause an extra character mapping.
        nico = next(e for e in sources['entries'] if e['target'] == '尼古貓貓')
        self.assertEqual(nico['heroIds'], ['community-review-30-20260907'])
        kenshiro = next(e for e in sources['entries'] if e['target'] == '拳四郎')
        self.assertNotIn('godie-u00l', kenshiro['heroIds'])
        self.assertEqual(kenshiro['preserve']['heroId'], 'godie-u00l')
        public = {s['id']:s for s in inventory['downloadPlan'].get('publicSources',[])}
        for source in public.values():
            row = next(line for line in report.splitlines() if f'[{source["id"]}](' in line)
            pending = source.get('pendingBackup', {}).get('status') == 'not-uploaded'
            self.assertEqual('僅本機已保存，S3 尚未上傳' in row, pending)
            if pending:
                self.assertFalse(source['pendingBackup']['readbackVerified'])
                self.assertNotIn('S3 legacy 備份已讀回驗證', row)
        self.assertFalse(inventory['downloadPlan']['purchasePolicy']['paidPurchaseAllowed'])
        for entry in inventory['downloadPlan']['entries']:
            self.assertFalse(entry['paidPurchaseAllowed'])
            if entry.get('purchaseHold'):
                self.assertTrue(entry['downloadPriority'].startswith('defer-'))
                for sid in entry['acquiredPublicSources']:
                    self.assertEqual(public[sid]['acquisitionStatus'],'downloaded-verified')
                    self.assertTrue(set(entry['heroIds']) & set(public[sid]['heroIds']) or entry['id'] in public[sid].get('ownerEntryIds',[]))
                    self.assertFalse(public[sid]['defaultEligible'])
        maomao=heroes['b2-maomao']['publicCandidates']
        self.assertEqual([s['id'] for s in maomao],['thunderstore-maomao'])
        self.assertEqual(heroes['community-review-30-20260907']['publicCandidates'],[])
        for target in ['犬夜叉','刀劍神域 阿絲娜']:
            entry=next(e for e in inventory['downloadPlan']['entries'] if e['target']==target)
            self.assertEqual(entry['heroIds'],[])
            self.assertTrue(entry['purchaseHoldWithoutHeroId'])
            self.assertTrue(entry['purchaseHold'])
            self.assertEqual(entry['downloadPriority'],'defer-acquired-public')
        gon = next(e for e in inventory['downloadPlan']['entries'] if 'godie-ucrl' in e['heroIds'])
        self.assertEqual(gon['purchaseHoldFor'], ['godie-ucrl'])
        self.assertTrue(gon['partialPurchaseHold'])
        self.assertFalse(gon['purchaseHold'])
        self.assertEqual(gon['downloadPriority'], 'owner-highest')
        self.assertEqual([s['id'] for s in heroes['godie-ucrl']['publicCandidates']], ['thunderstore-gon'])
        self.assertEqual(heroes['godie-u034']['publicCandidates'], [])
        # A publicly visible Workshop page is not a downloaded model.
        naofumi = next(e for e in inventory['downloadPlan']['entries'] if 'b2-naofumi' in e['heroIds'])
        self.assertEqual(naofumi['publicSourceLeadIds'], ['steam-naofumi'])
        self.assertTrue(naofumi['purchaseHold'])
        self.assertEqual([s['id'] for s in heroes['b2-naofumi']['publicCandidates']], ['gtainside-naofumi'])
        pikachu = next(e for e in inventory['downloadPlan']['entries'] if 'godie-ofar' in e['heroIds'])
        self.assertEqual(pikachu['purchaseHoldFor'], ['godie-ofar'])
        self.assertTrue(pikachu['partialPurchaseHold'])
        self.assertEqual(heroes['godie-o02l']['publicCandidates'], [])
        shinchan = next(e for e in inventory['downloadPlan']['entries'] if 'b2-shinchan' in e['heroIds'])
        self.assertTrue(shinchan['purchaseHold'])
        self.assertEqual([s['id'] for s in heroes['b2-shinchan']['publicCandidates']], ['gta5mod-shinchan-sd2', 'gta5mod-shinchan-kstamil'])
        self.assertEqual(shinchan['publicSourceLeadIds'], ['gtainside-shinchan-locator'])
        goku = next(e for e in inventory['downloadPlan']['entries'] if 'godie-ogrh' in e['heroIds'])
        self.assertEqual(goku['purchaseHoldFor'], ['godie-ogrh'])
        self.assertEqual([s['id'] for s in heroes['godie-ogrh']['publicCandidates']], ['thunderstore-goku'])
        self.assertEqual(heroes['godie-o00x']['publicCandidates'], [])
        billy = next(e for e in inventory['downloadPlan']['entries'] if 'community-review-15-20260907' in e['heroIds'])
        self.assertTrue(billy['purchaseHold'])
        self.assertEqual(billy['acquiredPublicSources'], ['steam-billy-herrington'])
        for hero_id, held in [('godie-ucrl', True), ('godie-u034', False)]:
            row = next(line for line in report.splitlines() if f'<br>`{hero_id}`' in line and '職業獵人' in line)
            self.assertEqual('免費來源已取得，暫緩購買' in row, held)

    def test_clean_checkout_needs_no_library_and_detects_stale_inputs(self):
        with tempfile.TemporaryDirectory(prefix='ggd-handoff-') as folder:
            target = Path(folder) / 'GGD'
            for rel in ['materials/hero-model-library','materials/community-hero-forge/recipes','content/champions','content/config']:
                shutil.copytree(REPO/rel, target/rel)
            for name in ['inventory.py','source_links.py','default_policy.py','query.py']:
                dest=target/'tools/hero-model-library'/name
                dest.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(REPO/'tools/hero-model-library'/name, dest)
            script=target/'tools/hero-model-library/inventory.py'
            subprocess.run([sys.executable,str(script),'--check'],check=True,capture_output=True)
            result=subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-popp','--json'],text=True)
            self.assertEqual(json.loads(result)['heroes'][0]['default']['id'],'derivative:popp')
            result=subprocess.check_output([sys.executable,str(script.with_name('query.py')),'小傑','--downloads','--json'],text=True)
            self.assertEqual(json.loads(result)['entries'][0]['purchaseHoldFor'],['godie-ucrl'])
            result=subprocess.check_output([sys.executable,str(script.with_name('query.py')),'岩谷尚文','--downloads','--json'],text=True)
            record=json.loads(result)
            self.assertFalse(record['purchasePolicy']['paidPurchaseAllowed'])
            self.assertTrue(record['ingestionPolicy']['requireIndependentBackendOptions'])
            self.assertTrue(record['publicSources'][0]['backendIntegration']['required'])
            self.assertFalse(record['entries'][0]['paidPurchaseAllowed'])
            self.assertEqual([s['id'] for s in record['publicSources']], ['gtainside-naofumi'])
            self.assertEqual(record['publicSourceLeads'][0]['id'], 'steam-naofumi')
            for query, expected_target in [('犬夜叉','犬夜叉'),('亞絲娜','刀劍神域 阿絲娜')]:
                result=subprocess.check_output([sys.executable,str(script.with_name('query.py')),query,'--downloads','--json'],text=True)
                self.assertEqual([e['target'] for e in json.loads(result)['entries']],[expected_target])
            self.assertFalse((target.parent/'GGD-Asset-Library').exists())
            inputs=target/'materials/hero-model-library/download-sources.json'
            paid_data=json.loads(inputs.read_text())
            paid=json.loads(json.dumps(next(s for s in paid_data['publicSources'] if s['id']=='gtainside-naofumi')))
            paid.update(id='paid-fixture-naofumi',target='論壇付費尚文驗證樣本',purchaseDecision='hold-purchase-review-acquired-source')
            paid_data['paidSources']=[paid]
            inputs.write_text(json.dumps(paid_data,ensure_ascii=False))
            subprocess.run([sys.executable,str(script)],check=True,capture_output=True)
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-naofumi','--json'],text=True))
            self.assertEqual([s['id'] for s in result['heroes'][0]['paidCandidates']],['paid-fixture-naofumi'])
            self.assertEqual([s['id'] for s in result['heroes'][0]['publicCandidates']],['gtainside-naofumi'])
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-naofumi','--downloads','--json'],text=True))
            self.assertEqual([s['id'] for s in result['paidSources']],['paid-fixture-naofumi'])
            paid_report=(target/'materials/hero-model-library/全角色模型盤點.md').read_text()
            self.assertIn('論壇付費尚文驗證樣本',paid_report)
            self.assertIn('gtainside-naofumi',paid_report)
            # A paid delivery must remain queryable even with no public alternative.
            paid_data['publicSources']=[s for s in paid_data['publicSources'] if s['id']!='gtainside-naofumi']
            inputs.write_text(json.dumps(paid_data,ensure_ascii=False))
            subprocess.run([sys.executable,str(script)],check=True,capture_output=True)
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-naofumi','--json'],text=True))
            self.assertEqual(result['heroes'][0]['publicCandidates'],[])
            self.assertEqual([s['id'] for s in result['heroes'][0]['paidCandidates']],['paid-fixture-naofumi'])
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-naofumi','--downloads','--json'],text=True))
            self.assertTrue(result['entries'][0]['purchaseHold'])
            self.assertEqual(result['entries'][0]['acquiredSourceIds'],['paid-fixture-naofumi'])
            unmapped=json.loads(json.dumps(paid))
            unmapped.update(id='paid-fixture-unmapped',target='Unmapped paid delivery fixture',heroIds=[],ownerEntryIds=[])
            unmapped['backendIntegration'].update(state='pending-character-mapping',heroIds=[],ownerEntryIds=[])
            paid_data['paidSources'].append(unmapped)
            inputs.write_text(json.dumps(paid_data,ensure_ascii=False))
            subprocess.run([sys.executable,str(script)],check=True,capture_output=True)
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'paid-fixture-unmapped','--downloads','--json'],text=True))
            self.assertEqual(result['entries'],[])
            self.assertEqual([s['id'] for s in result['paidSources']],['paid-fixture-unmapped'])
            # A second paid model version must remain alongside both the first and public source.
            from copy import deepcopy
            version2 = deepcopy(paid)
            version2.update(id='paid-fixture-naofumi-v2', version='2')
            paid_data['paidSources'].append(version2)
            original_sources=json.loads((DATA/'download-sources.json').read_text())['publicSources']
            paid_data['publicSources'].append(next(s for s in original_sources if s['id']=='gtainside-naofumi'))
            inputs.write_text(json.dumps(paid_data, ensure_ascii=False))
            subprocess.run([sys.executable,str(script)],check=True,capture_output=True)
            result=json.loads(subprocess.check_output([sys.executable,str(script.with_name('query.py')),'b2-naofumi','--json'],text=True))
            self.assertEqual([s['id'] for s in result['heroes'][0]['paidCandidates']], ['paid-fixture-naofumi','paid-fixture-naofumi-v2'])
            self.assertEqual([s['id'] for s in result['heroes'][0]['publicCandidates']], ['gtainside-naofumi'])
            valid_paid_text=inputs.read_text()
            # A parallel workflow cannot register an acquisition without tracking its required UI integration.
            del paid_data['paidSources'][0]['backendIntegration']
            inputs.write_text(json.dumps(paid_data,ensure_ascii=False))
            failed=subprocess.run([sys.executable,str(script)],capture_output=True,text=True)
            self.assertNotEqual(failed.returncode,0)
            self.assertIn('missing required backend integration tracking',failed.stderr)
            # Restore a valid source so the stale-input check fails for freshness, not validation.
            inputs.write_text(valid_paid_text)
            subprocess.run([sys.executable,str(script),'--check'],check=True,capture_output=True)
            changed=json.loads(valid_paid_text);changed['entries'][0]['ownerNotes'].append('changed handoff fixture')
            inputs.write_text(json.dumps(changed,ensure_ascii=False))
            self.assertNotEqual(subprocess.run([sys.executable,str(script),'--check'],capture_output=True).returncode,0)

    def test_latest_pending_revision_does_not_look_fully_uploaded(self):
        from source_links import render_sources
        data=json.loads((DATA/'inventory.json').read_text())['downloadPlan']
        source=next(s for s in data['publicSources'] if s.get('backup',{}).get('readbackVerified'))
        source['pendingBackup']={'status':'not-uploaded','readbackVerified':False}
        report='\n'.join(render_sources(data, json.loads((DATA/'default-policy.json').read_text())))
        row=next(line for line in report.splitlines() if f'[{source["id"]}](' in line)
        self.assertIn('最新修訂僅本機已保存，S3 尚未上傳',row)
        self.assertIn('舊版備份仍保留',row)
        self.assertNotIn('S3 legacy 備份已讀回驗證',row)

if __name__ == '__main__': unittest.main()

import copy, importlib.util, json, unittest
from pathlib import Path
from default_policy import eligible, selection_class

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('model_map',ROOT/'tools/ship-81/model_map.py')
mapping=importlib.util.module_from_spec(spec);spec.loader.exec_module(mapping)

class PriorityIntegrationTests(unittest.TestCase):
    def test_workflow_approval_is_exact_and_does_not_become_manual_derivative(self):
        p={'approvedDerivatives':[], 'approvedWorkflowDefaults':[{'heroId':'h','sourceId':'ou99:x','modelKey':'ou99.x-standard'}]}
        self.assertTrue(eligible(p,'h','ou99:x','ou99.x-standard','style-proxy'))
        self.assertFalse(eligible(p,'other','ou99:x','ou99.x-standard','style-proxy'))
        self.assertFalse(eligible(p,'h','ou99:x','ou99.x','style-proxy'))
        self.assertEqual(selection_class(p,'h','ou99:x','ou99.x-standard',{'tier':'w3x','kind':'style-proxy'}),'similar-proxy')

    def test_display_name_cannot_override_explicit_inventory_key(self):
        row={'defaultModel':'陌生顯示名称<br>`version.body.abc123`','modelSource':'OU99'}
        self.assertEqual(mapping.resolve(row,{},'fighter')['modelKey'],'version.body.abc123')

    def test_regeneration_preserves_manual_selection_and_every_version(self):
        previous={'modelKey':'version.body.original','modelSelectionMode':'manual','modelVersions':[
            {'modelKey':'version.body.original','sourceModelKey':'ou99.old'},
            {'modelKey':'version.body.new','sourceModelKey':'community.body.new'}]}
        saved=copy.deepcopy(previous)
        generated=mapping.preserve_model_history({'id':'h','modelKey':'community.body.new'},previous)
        self.assertEqual(generated['modelKey'],previous['modelKey'])
        self.assertEqual(generated['modelVersions'],previous['modelVersions'])
        self.assertEqual(previous,saved)

    def test_automatic_regeneration_resolves_source_to_retained_version(self):
        previous={'modelKey':'version.body.old','modelVersions':[
            {'modelKey':'version.body.old','sourceModelKey':'ou99.old'},
            {'modelKey':'version.body.new','sourceModelKey':'community.body.new'}]}
        generated=mapping.preserve_model_history({'id':'h','modelKey':'community.body.new'},previous)
        self.assertEqual(generated['modelKey'],'version.body.new')
        with self.assertRaisesRegex(ValueError,'not registered'):
            mapping.preserve_model_history({'id':'h','modelKey':'ou99.unknown'},previous)

    def test_shipped_aliases_are_one_to_one_and_exactly_seven(self):
        aliases=json.loads((ROOT/'materials/hero-model-library/workflow-model-options.json').read_text())['aliases']
        self.assertEqual(len(aliases),7);self.assertEqual(len(set(aliases.values())),7)
        self.assertEqual(aliases['example:leesin'],'lol-leesin')
        self.assertEqual(aliases['example:yasuo'],'lol-yasuo')

if __name__=='__main__':unittest.main()

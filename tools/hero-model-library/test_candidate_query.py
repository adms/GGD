"""A multi-character source pack cannot assign one hero's identity to siblings."""
import unittest
from query import public_match_scope, candidate_records


class CandidateQuery(unittest.TestCase):
    def setUp(self):
        self.source=dict(id='slayers',url='https://example.com/slayers',localPath='intake/slayers',
            readiness='pending-review',heroIds=['lina'],modelCandidates=[
                dict(candidateId='lina-default',nativeCharacter='Lina',heroIds=['lina']),
                dict(candidateId='gourry-default',nativeCharacter='Gourry',heroIds=[]),
                dict(candidateId='gourry-sword',label='Gourry sword',resourceRole='weapon-accessory',heroIds=[])])

    def test_unmapped_character_never_inherits_another_hero_in_pack(self):
        self.assertEqual(public_match_scope([self.source],'gourry'),(set(),set()))
        self.assertEqual(public_match_scope([self.source],'lina'),({'lina'},set()))
        rows=candidate_records([self.source],'gourry')
        self.assertEqual(len(rows),2)
        self.assertTrue(all(c['heroIds']==[] for c in rows))
        self.assertEqual(rows[1]['resourceRole'],'weapon-accessory')

    def test_source_id_lists_all_variants_without_setting_readiness(self):
        rows=candidate_records([self.source],'slayers')
        self.assertEqual(len(rows),3)
        self.assertTrue(all(c['sourceReadiness']=='pending-review' for c in rows))
        self.assertNotIn('runtimeReady',rows[0])

    def test_shared_provenance_does_not_make_every_character_a_name_match(self):
        for c in self.source['modelCandidates']:
            c['sourceGameHint']='This archive contains Gourry and Lina.'
        rows=candidate_records([self.source],'lina')
        self.assertEqual([r['candidateId'] for r in rows],['lina-default'])


if __name__=='__main__':unittest.main()

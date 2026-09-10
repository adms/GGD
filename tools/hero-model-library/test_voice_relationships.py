"""Shared local audio retains each source group without inflated file totals."""
import unittest

from voice_index import audio_file_counts, primary_audio_relationships, verify_prefetch_alias


class VoiceRelationships(unittest.TestCase):
    def setUp(self):
        self.old = dict(path='shared/Lux.wav', groupId='lol-old:Lux', sha256='original', bytes=12,
                        backupId='original-archive')
        self.subset = dict(self.old, groupId='lol-project-seven:Lux', backupId='subset-archive')
        self.alias = dict(self.old, byteExactPrefixVerified=True, completeRiffLengthVerified=True,
                          alreadyCountedPrimaryAudio=True)

    def test_subset_sharing_path_cannot_shadow_original_prefetch_group(self):
        for files in [[self.old, self.subset], [self.subset, self.old]]:
            with self.subTest(order=[row['groupId'] for row in files]):
                relationships = primary_audio_relationships(files)
                self.assertEqual(len(relationships), 2)
                target = verify_prefetch_alias(self.alias, relationships)
                self.assertIs(target, self.old)
                self.assertEqual(target['backupId'], 'original-archive')

    def test_original_alias_cannot_bind_only_the_subset_group(self):
        with self.assertRaisesRegex(ValueError, 'no primary path/group'):
            verify_prefetch_alias(self.alias, primary_audio_relationships([self.subset]))

    def test_wrong_alias_digest_or_size_is_rejected(self):
        relationships = primary_audio_relationships([self.old, self.subset])
        for field, value in [('sha256', 'wrong'), ('bytes', 13)]:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'bytes differ'):
                verify_prefetch_alias(dict(self.alias, **{field: value}), relationships)

    def test_conflicting_same_path_group_is_rejected(self):
        for field, value in [('sha256', 'wrong'), ('bytes', 13)]:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'Conflicting audio bytes'):
                primary_audio_relationships([self.old, dict(self.old, **{field: value})])

    def test_duplicate_identical_group_relationship_is_not_content_conflict(self):
        duplicate = dict(self.old, backupId='another-retained-backup')
        rows = [self.old, duplicate]
        self.assertIs(verify_prefetch_alias(self.alias, primary_audio_relationships(rows)), self.old)
        self.assertEqual(audio_file_counts(rows)['sourceFileRelationshipRows'], 2)

    def test_row_path_and_payload_counts_have_distinct_bases(self):
        another_path = dict(self.old, path='copy/Lux.wav')
        other_content = dict(self.old, path='shared/Yasuo.wav', sha256='other', bytes=24)
        files = [self.old, self.subset, another_path, other_content]
        self.assertEqual(audio_file_counts(files), dict(
            audioFiles=4, bytes=60, sourceFileRelationshipRows=4,
            uniqueLocalPaths=3, uniqueSha256Payloads=2, uniqueLocalPathBytes=48))
        self.assertEqual(len(files), 4)
        self.assertEqual(files[1]['backupId'], 'subset-archive')

    def test_one_local_path_cannot_claim_conflicting_payloads_across_groups(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting indexed content for local audio path'):
            audio_file_counts([self.old, dict(self.subset, sha256='stale')])

    def test_unverified_prefetch_evidence_is_rejected(self):
        relationships = primary_audio_relationships([self.old])
        for field in ['byteExactPrefixVerified', 'completeRiffLengthVerified', 'alreadyCountedPrimaryAudio']:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'lacks complete verification'):
                verify_prefetch_alias(dict(self.alias, **{field: False}), relationships)


if __name__ == '__main__':
    unittest.main()

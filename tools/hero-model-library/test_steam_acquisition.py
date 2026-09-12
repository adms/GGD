"""Workshop metadata must positively authorize a public file download."""
from copy import deepcopy
import unittest
from acquire_steam import public_details


class SteamMetadata(unittest.TestCase):
    def test_public_file_is_accepted_and_private_unavailable_or_mismatched_files_are_rejected(self):
        base={'publishedfileid':'123','result':1,'visibility':0,'banned':False,
              'file_url':'https://cdn.steamusercontent.com/ugc/1/hash/','file_size':'100'}
        def metadata(record):return {'response':{'publishedfiledetails':[record]}}
        self.assertEqual(public_details(metadata(base),'123'),base)
        for changes in [{'result':9},{'visibility':2},{'banned':True},{'publishedfileid':'456'},
                        {'file_url':''},{'file_url':'https://example.com/file'},
                        {'file_url':'https://name:password@cdn.steamusercontent.com/file'},
                        {'file_size':'0'},{'file_size':'2000000001'}]:
            with self.subTest(changes=changes):
                record=deepcopy(base);record.update(changes)
                with self.assertRaises(ValueError):public_details(metadata(record),'123')


if __name__=='__main__':unittest.main()

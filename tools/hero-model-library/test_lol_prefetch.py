import struct
import unittest
import hashlib
import json
import tempfile
from pathlib import Path
from resolve_lol_prefetch import exact_prefetch, resolve


class PrefetchIdentity(unittest.TestCase):
    def test_requires_full_byte_prefix_and_declared_complete_length(self):
        full=b'RIFF'+struct.pack('<I',100)+b'WAVE'+bytes(range(96))
        self.assertTrue(exact_prefetch(full[:24],full))
        self.assertFalse(exact_prefetch(full[:24],full[:-1]))
        self.assertFalse(exact_prefetch(full,full))
        changed=bytearray(full);changed[15]^=1
        self.assertFalse(exact_prefetch(full[:24],changed))
        self.assertFalse(exact_prefetch(b'not-riff',full))

    def test_freeze_excludes_later_packages_and_rejects_changed_or_missing_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'intake';first=root/'decoded/First/decoding.json';later=root/'decoded/Later/decoding.json'
            first.parent.mkdir(parents=True);later.parent.mkdir(parents=True)
            first.write_text('{"files": []}');later.write_text('unfinished newer package')
            delivery=root/'delivery.json'
            delivery.write_text(json.dumps({'decodingReports':[{'path':'decoded/First/decoding.json','sha256':hashlib.sha256(first.read_bytes()).hexdigest()}]}))
            self.assertEqual(resolve(root,Path(tmp),delivery)['resolvedCount'],0)
            first.write_text('{"files": [], "changed": true}')
            with self.assertRaisesRegex(AssertionError,'Frozen decoding report changed'):
                resolve(root,Path(tmp),delivery)
            first.unlink()
            with self.assertRaises(FileNotFoundError):resolve(root,Path(tmp),delivery)


if __name__=='__main__':unittest.main()

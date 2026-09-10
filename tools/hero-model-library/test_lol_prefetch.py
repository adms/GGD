import struct
import unittest
from resolve_lol_prefetch import exact_prefetch


class PrefetchIdentity(unittest.TestCase):
    def test_requires_full_byte_prefix_and_declared_complete_length(self):
        full=b'RIFF'+struct.pack('<I',100)+b'WAVE'+bytes(range(96))
        self.assertTrue(exact_prefetch(full[:24],full))
        self.assertFalse(exact_prefetch(full[:24],full[:-1]))
        self.assertFalse(exact_prefetch(full,full))
        changed=bytearray(full);changed[15]^=1
        self.assertFalse(exact_prefetch(full[:24],changed))
        self.assertFalse(exact_prefetch(b'not-riff',full))


if __name__=='__main__':unittest.main()

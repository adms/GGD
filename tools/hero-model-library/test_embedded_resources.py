import struct
import unittest
from embedded_resources import wwise_media


def chunk(kind, data):
    return kind + struct.pack('<I', len(data)) + data


class WwiseMedia(unittest.TestCase):
    def test_media_offsets_preserve_bytes_and_event_only_banks(self):
        header = chunk(b'BKHD', struct.pack('<I', 134))
        index = struct.pack('<III', 15, 3, 4) + struct.pack('<III', 92, 9, 3)
        payload = b'padRIFF__Ogg'
        bank = header + chunk(b'DIDX', index) + chunk(b'DATA', payload) + chunk(b'HIRC', b'events')
        self.assertEqual(wwise_media(bank), [(15, b'RIFF'), (92, b'Ogg')])
        self.assertEqual(wwise_media(header + chunk(b'HIRC', b'events')), [])

    def test_invalid_indices_and_truncation_are_not_exported(self):
        header = chunk(b'BKHD', struct.pack('<I', 134))
        for index in [b'x', struct.pack('<III', 1, 2, 99), struct.pack('<III', 1, 0, 0),
                      struct.pack('<III', 1, 0, 1) * 2]:
            with self.subTest(index=index), self.assertRaises(ValueError):
                wwise_media(header + chunk(b'DIDX', index) + chunk(b'DATA', b'abc'))
        for bank in [header+b'x', header+chunk(b'DATA', b'abc'), header+header,
                     header+chunk(b'DATA', b'abc')[:-1], b'nope', chunk(b'BKHD', b'')]:
            with self.subTest(bank=bank), self.assertRaises(ValueError):
                wwise_media(bank)


if __name__ == '__main__':
    unittest.main()

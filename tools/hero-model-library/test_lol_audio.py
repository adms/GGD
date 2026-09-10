"""Container integrity and language policy boundaries for local audio intake."""
import struct
import unittest

from extract_lol_audio import wpk_media
from voice_index import language_rank


class LocalAudio(unittest.TestCase):
    def sample(self, name='42.wem'):
        encoded = name.encode('utf-16-le')
        payload = b'RIFFtestWAVE'
        return (b'r3d2' + struct.pack('<III', 1, 1, 16) +
                struct.pack('<III', 28 + len(encoded), len(payload), len(name)) +
                encoded + payload)

    def test_numeric_media_identity_and_exact_payload(self):
        self.assertEqual(wpk_media(self.sample()), [('42.wem', b'RIFFtestWAVE')])

    def test_truncated_and_out_of_bounds_payload_rejected(self):
        with self.assertRaises(ValueError):
            wpk_media(self.sample()[:-1])
        blob = bytearray(self.sample())
        struct.pack_into('<I', blob, 16, 2**32-1)
        with self.assertRaises(ValueError):
            wpk_media(blob)

    def test_paths_and_non_numeric_names_cannot_be_extracted(self):
        for name in ['../1.wem', '/1.wem', 'voice.wem']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                wpk_media(self.sample(name))

    def test_language_priority_does_not_guess_mixed_or_unknown(self):
        self.assertLess(language_rank('ja_JP'), language_rank('English'))
        self.assertLess(language_rank('English'), language_rank('zh-TW'))
        self.assertEqual(language_rank('Japanese (JP filename label)'), 1)
        self.assertEqual(language_rank('Japanese / English mixed'), 3)
        self.assertEqual(language_rank(None), 3)


if __name__ == '__main__':
    unittest.main()

"""A parser compatibility copy must preserve every meaningful source byte."""
import struct
import unittest
from inspect_renderware import remove_empty_frame_padding


class FramePadding(unittest.TestCase):
    def test_only_padding_after_declared_frames_is_removed(self):
        def chunk(kind, payload): return struct.pack('<III', kind, len(payload), 0x1803ffff) + payload
        frames = chunk(1, struct.pack('<I', 1) + bytes(range(56))) + chunk(3, b'')
        geometry = chunk(0x0f, b'geometry bytes must remain identical')
        expected = chunk(0x10, chunk(0x0e, frames) + geometry)
        original = chunk(0x10, chunk(0x0e, frames + b'\0' * 12) + geometry)
        corrected, repairs = remove_empty_frame_padding(original)
        self.assertEqual(corrected, expected)
        self.assertEqual(len(repairs), 1)
        self.assertEqual(original[repairs[0]['rawOffset']:repairs[0]['rawOffset'] + 12], b'\0' * 12)
        self.assertEqual(remove_empty_frame_padding(expected), (expected, []))
        versioned_null = chunk(0x10, chunk(0x0e, frames + chunk(0, b'')) + geometry) + b'\0' * 5
        corrected, repairs = remove_empty_frame_padding(versioned_null)
        self.assertEqual(corrected, expected + b'\0' * 5)
        self.assertEqual(len(repairs), 1)
        # A non-empty extension or incomplete record must not be silently dropped.
        for tail in [chunk(3, b'data'), b'\0' * 4, b'\1' + b'\0' * 11]:
            meaningful = chunk(0x10, chunk(0x0e, frames + tail) + geometry)
            self.assertEqual(remove_empty_frame_padding(meaningful), (meaningful, []))


if __name__ == '__main__': unittest.main()

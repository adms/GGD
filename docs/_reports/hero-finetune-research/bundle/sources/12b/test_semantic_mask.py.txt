import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('mask', Path(__file__).with_name('prepare-semantic-mask.py'))
mask = importlib.util.module_from_spec(spec); spec.loader.exec_module(mask)

class AlignmentTests(unittest.TestCase):
    def test_unicode_overlap_and_shift(self):
        # One token contains the excluded Unicode value and a neighboring comma.
        text = 'P{"字":"😀", "count":4}'
        lo = len('P{"字":'.encode()); hi = len('P{"字":"😀"'.encode())
        offsets = [(0,1),(1,6),(6,10),(10,len(text))]
        labels, _, touched = mask.align_loss_mask(text, offsets, 1, 1, [{'startByte':lo-1,'endByte':hi-1}])
        self.assertEqual(labels, [0,1,0,1]); self.assertEqual(touched,[1]); self.assertEqual(labels[1:],[1,0,1])

    def test_unaligned_span_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'NO_TOKENS'):
            mask.align_loss_mask('Pabc', [(0,1),(1,2)], 1, 1, [{'startByte':2,'endByte':3}])

    def test_prompt_overlap_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'INTERSECTS_PROMPT'):
            mask.align_loss_mask('Pabc', [(0,2),(2,4)], 1, 1, [{'startByte':0,'endByte':1}])

    def test_unverifiable_completion_offsets_are_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'ZERO_WIDTH'):
            mask.align_loss_mask('Pa', [(0,1),(0,0)], 1, 1, [])

    def test_all_labels_excluded_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'EMPTY_OR_PROMPT'):
            mask.align_loss_mask('Pa', [(0,1),(1,2)], 1, 1, [{'startByte':0,'endByte':1}])

if __name__ == '__main__': unittest.main()

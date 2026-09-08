import unittest
from semantic_training_loss import prediction_positions

class PredictionPositionTests(unittest.TestCase):
    def test_shift_targets_and_exclude_context(self):
        self.assertEqual(prediction_positions([10,20,30,40,50],[0,0,1,0,1]),([1,3],[30,50]))

    def test_only_final_token_can_be_supervised(self):
        self.assertEqual(prediction_positions([1,2,3],[0,0,1]),([1],[3]))

    def test_invalid_masks_fail_closed(self):
        for ids, labels in [([1,2],[0]),([1,2],[1,0]),([1,2],[0,2]),([1,2],[0,False]),([1,2],[0,0])]:
            with self.assertRaises(AssertionError): prediction_positions(ids, labels)

if __name__ == '__main__': unittest.main()

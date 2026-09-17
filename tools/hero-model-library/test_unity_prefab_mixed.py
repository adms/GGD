"""Mixed Unity renderer handling must preserve explicit source semantics."""
import unittest

import numpy as np

from convert_unity_prefab import skin_positions, trs_matrix
from convert_unity_prefab_mixed import renderer_skin_arrays


class MixedPrefabSkin(unittest.TestCase):
    def test_zero_bone_renderer_becomes_one_joint_hierarchy_attachment(self):
        joints, weights, implicit, bones, synthesized = renderer_skin_arrays(
            None, None, [], 2, 91,
        )
        np.testing.assert_array_equal(joints, [[0, 0, 0, 0], [0, 0, 0, 0]])
        np.testing.assert_array_equal(weights, [[1, 0, 0, 0], [1, 0, 0, 0]])
        self.assertTrue(implicit)
        self.assertEqual(bones, [91])
        self.assertTrue(synthesized)

        positions = np.array([[1.0, 2.0, 3.0], [-2.0, 0.5, 4.0]])
        attachment = trs_matrix([3, 4, 5], [0, 0, 0, 1], [1, 1, 1])
        actual = skin_positions(positions, joints, weights, attachment[None, :, :])
        expected = (attachment @ np.column_stack([positions, np.ones(2)]).T).T[:, :3]
        np.testing.assert_allclose(actual, expected)

    def test_native_skin_remains_native(self):
        joints, weights, implicit, bones, synthesized = renderer_skin_arrays(
            [[1, 0]], [[0.75, 0.25]], [100, 101], 1, 91,
        )
        np.testing.assert_array_equal(joints, [[1, 0, 0, 0]])
        np.testing.assert_allclose(weights, [[0.75, 0.25, 0, 0]])
        self.assertFalse(implicit)
        self.assertEqual(bones, [100, 101])
        self.assertFalse(synthesized)

    def test_partial_skin_payload_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing native joint indices"):
            renderer_skin_arrays(None, None, [100], 1, 91)
        with self.assertRaisesRegex(ValueError, "unexpected skin channels"):
            renderer_skin_arrays([[0]], [[1]], [], 1, 91)


if __name__ == "__main__":
    unittest.main()

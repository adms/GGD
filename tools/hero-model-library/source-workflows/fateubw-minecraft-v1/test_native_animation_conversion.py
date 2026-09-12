#!/usr/bin/env python3
"""Focused tests for the bounded FateUBW Bedrock animation converter."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("fateubw_native", HERE / "convert_bedrock_native_animation.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeAnimationConversionTest(unittest.TestCase):
    def test_scalar_accessor_bounds_are_gltf_arrays(self):
        glb = native.GLB()
        index = glb.acc(np.asarray([0.0, 0.5, 1.0], dtype=np.float32), "SCALAR", bounds=True)
        self.assertEqual(glb.g["accessors"][index]["min"], [0.0])
        self.assertEqual(glb.g["accessors"][index]["max"], [1.0])

    def test_numeric_curve_interpolates_componentwise(self):
        keys = native.source_curve({"0": [0, 0, 0], "1": [2, 4, 6]}, "rotation", 1.0, "clip/bone")
        np.testing.assert_allclose(native.interpolate(keys, 0.25), [0.5, 1.0, 1.5])

    def test_formula_and_pre_post_curves_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "formula/nonfinite"):
            native.source_curve(["query.life_time", 0, 0], "position", 1.0, "formula")
        with self.assertRaisesRegex(ValueError, "pre/post"):
            native.source_curve({"0": {"pre": [0, 0, 0], "post": [1, 1, 1]}},
                                "rotation", 1.0, "prepost")

    def test_no_duration_pose_is_retained_without_inventing_playback(self):
        glb = native.GLB()
        index, row = native.add_animation(glb, "summon", {"bones": {"item": {"scale": [0, 0, 0]}}},
                                          {"item": 0}, [np.zeros(3)], 60)
        self.assertIsNone(index)
        self.assertFalse(row["converted"])
        self.assertIn("without inventing playback duration", row["reason"])
        self.assertNotIn("animations", glb.g)

    def test_rotation_sampling_keeps_source_keys_and_duration(self):
        keys = [(0.0, np.zeros(3)), (0.33, np.ones(3)), (1.0, np.zeros(3))]
        times = native.sampled_times(keys, 1.0, 10, True)
        self.assertIn(0.33, times)
        self.assertEqual(times[0], 0.0)
        self.assertEqual(times[-1], 1.0)

    def test_leaf_rest_rotation_requires_explicit_mode(self):
        bones = [
            {"name": "root"},
            {"name": "armor", "parent": "root", "rotation": [0, 0, 25]},
        ]
        by_name = {bone["name"]: index for index, bone in enumerate(bones)}
        with self.assertRaisesRegex(ValueError, "static rest rotations"):
            native.validate_leaf_rest_rotations(bones, by_name, {"walk": {"bones": {}}}, False)
        self.assertEqual(
            native.validate_leaf_rest_rotations(bones, by_name, {"walk": {"bones": {"root": {}}}}, True),
            ["armor"],
        )

    def test_animated_or_parent_rest_rotation_remains_rejected(self):
        animated = [
            {"name": "root"},
            {"name": "armor", "parent": "root", "rotation": [0, 0, 25]},
        ]
        by_name = {bone["name"]: index for index, bone in enumerate(animated)}
        with self.assertRaisesRegex(ValueError, "has an animation track"):
            native.validate_leaf_rest_rotations(
                animated, by_name, {"walk": {"bones": {"armor": {"rotation": [0, 0, 0]}}}}, True)

        parent = [
            {"name": "root", "rotation": [0, 0, 25]},
            {"name": "child", "parent": "root"},
        ]
        by_name = {bone["name"]: index for index, bone in enumerate(parent)}
        with self.assertRaisesRegex(ValueError, "must be terminal"):
            native.validate_leaf_rest_rotations(parent, by_name, {"walk": {"bones": {}}}, True)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Focused tests for FateUBW durationless-source derivative policy."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("convert_static_pose_derivatives.py")
SPEC = importlib.util.spec_from_file_location("fateubw_static_pose_derivatives", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StaticPoseDerivativeTest(unittest.TestCase):
    def test_bounded_policy_matrix(self):
        candidates = MODULE.CANDIDATES
        self.assertEqual(len(candidates), 5)
        self.assertEqual(sum(row["classification"] == "derived-static-pose-hold" for row in candidates), 3)
        self.assertEqual(sum(row["classification"] == "derived-procedural-formula-loop" for row in candidates), 2)
        for row in candidates:
            if row["classification"] == "derived-static-pose-hold":
                self.assertEqual(row["duration"], 1.0)
                self.assertIsNone(row["formulaPeriodEvidence"])
            else:
                evidence = row["formulaPeriodEvidence"]
                self.assertEqual(360 / evidence["angularRateDegreesPerSecond"], row["duration"])

    def test_glb_rewrite_removes_native_duration_claim(self):
        document = {"asset": {"version": "2.0"}, "scenes": [{"nodes": []}], "scene": 0,
                    "extras": {"ggd": {"nativeAnimationIncluded": True}},
                    "animations": [{"name": "injected", "samplers": [], "channels": [],
                                    "extras": {"ggd": {"sourceAnimationLength": 1.0,
                                                         "nativeClassification": "community-mod-native-animation-json"}}}]}
        encoded = json.dumps(document, separators=(",", ":")).encode()
        encoded += b" " * ((-len(encoded)) % 4)
        binary = b"\0\0\0\0"
        data = bytearray(struct.pack("<4sII", b"glTF", 2, 0))
        data += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        data += struct.pack("<II", len(binary), 0x004E4942) + binary
        struct.pack_into("<I", data, 8, len(data))
        config = MODULE.CANDIDATES[0]
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.glb", Path(directory) / "output.glb"
            source.write_bytes(data)
            MODULE.rewrite_glb(source, output, config)
            result = output.read_bytes(); length = struct.unpack_from("<I", result, 12)[0]
            rewritten = json.loads(result[20:20 + length].decode().rstrip(" \0"))
        root = rewritten["extras"]["ggd"]
        animation = rewritten["animations"][0]
        self.assertFalse(root["nativeAnimationIncluded"])
        self.assertTrue(root["derivedAnimationIncluded"])
        self.assertFalse(root["sourceAnimationLengthProvided"])
        self.assertFalse(root["nativeDurationClaim"])
        self.assertNotIn("sourceAnimationLength", animation["extras"]["ggd"])
        self.assertEqual(animation["name"], config["derivedClip"])


if __name__ == "__main__":
    unittest.main()

"""MP3 duration compatibility without changing audio bytes or acceptance limits."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("audio_intake", Path(__file__).with_name("audio_intake.py"))
intake = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(intake)


class Mp3PaddingTests(unittest.TestCase):
    def setUp(self):
        self.packets = [{"duration_time": "0.052245"} for _ in range(34)]
        self.packets[0]["side_data_list"] = [{"side_data_type": "Skip Samples", "skip_samples": 1105, "discard_padding": 0}]
        for index, padding in ((31, 197), (32, 576), (33, 576)):
            self.packets[index]["side_data_list"] = [{"side_data_type": "Skip Samples", "skip_samples": 0, "discard_padding": padding}]
        self.policy = intake.load_policy()

    def measured(self, header, *, packets=None, samples=34260, packet_error=False, codec="mp3"):
        probe = {"streams": [{"codec_name": codec, "sample_rate": "11025", "channels": 2, "bit_rate": "32000"}],
                 "format": {"format_name": "mp3", "duration": str(header)}}
        replies = [SimpleNamespace(returncode=0, stdout=json.dumps(probe), stderr=""),
                   SimpleNamespace(returncode=0, stdout="", stderr=f"n_samples: {samples}\nmax_volume: -1.5 dB\n"),
                   SimpleNamespace(returncode=1 if packet_error else 0,
                                   stdout=json.dumps({"packets": self.packets if packets is None else packets}), stderr="")]
        with patch.object(intake, "_run", side_effect=replies) as run:
            result = intake.measure("unchanged.mp3")
        return result, run.call_count

    def codes(self, measurement):
        return [code for code, _ in intake.problems_of(self.policy, "sfx", measurement)]

    def test_old_ffprobe_header_includes_padding(self):
        result, calls = self.measured(1.77633)
        self.assertEqual(calls, 3)
        self.assertEqual(result["rawHeaderSeconds"], 1.77633)
        self.assertEqual(result["paddingEvidence"]["skipSamples"], 1105)
        self.assertEqual(result["paddingEvidence"]["discardPaddingSamples"], 1349)
        self.assertAlmostEqual(result["headerSeconds"], 1.553745, places=5)
        self.assertEqual(self.codes(result), [])

    def test_new_ffprobe_header_is_not_adjusted_twice(self):
        result, calls = self.measured(1.553741)
        self.assertEqual(calls, 2)
        self.assertEqual(result["headerSeconds"], 1.553741)
        self.assertNotIn("paddingEvidence", result)
        self.assertEqual(self.codes(result), [])

    def test_missing_packets_cannot_be_explained_by_padding(self):
        result, _ = self.measured(2.3)
        self.assertNotIn("paddingEvidence", result)
        self.assertEqual(result["headerSeconds"], 2.3)
        self.assertIn("truncated", self.codes(result))

    def test_decoded_audio_shorter_than_adjusted_duration_still_fails(self):
        result, _ = self.measured(1.77633, samples=20000)
        self.assertIn("paddingEvidence", result)
        self.assertIn("truncated", self.codes(result))

    def test_no_padding_or_incomplete_evidence_does_not_weaken_gate(self):
        incomplete = copy.deepcopy(self.packets)
        incomplete[1].pop("duration_time")
        negative = copy.deepcopy(self.packets)
        negative[0]["side_data_list"][0]["skip_samples"] = -1105
        for packets in ([], [{"duration_time": "1.77633"}], incomplete, negative):
            with self.subTest(packets=packets):
                result, _ = self.measured(1.77633, packets=packets)
                self.assertNotIn("paddingEvidence", result)
                self.assertIn("truncated", self.codes(result))

    def test_failed_packet_probe_keeps_original_failure(self):
        result, _ = self.measured(1.77633, packet_error=True)
        self.assertEqual(result["rawHeaderSeconds"], 1.77633)
        self.assertIn("truncated", self.codes(result))

    def test_non_mp3_codec_never_gets_padding_adjustment(self):
        result, calls = self.measured(1.77633, codec="aac")
        self.assertEqual(calls, 2)
        self.assertNotIn("paddingEvidence", result)
        self.assertIn("truncated", self.codes(result))

    def test_real_repository_mp3_passes_and_is_unchanged(self):
        audio = Path(intake.ROOT) / "content/assets/audio/sfx/up.mp3"
        before = hashlib.sha256(audio.read_bytes()).hexdigest()
        result = intake.measure(str(audio))
        self.assertEqual(self.codes(result), [])
        self.assertEqual(hashlib.sha256(audio.read_bytes()).hexdigest(), before)


if __name__ == "__main__":
    unittest.main()

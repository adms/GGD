"""Unit tests for the voice-reference pipeline (stdlib unittest).

Run:  .venv/bin/python -m unittest discover -s tests -v
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import numpy as np  # noqa: E402

import audio_metrics  # noqa: E402
import build_manifest  # noqa: E402
import pipeline_util as pu  # noqa: E402
import search_candidates  # noqa: E402


class TestHeroesCsv(unittest.TestCase):
    def setUp(self) -> None:
        self.heroes = pu.load_heroes()

    def test_48_unique_heroes(self) -> None:
        self.assertEqual(len(self.heroes), 48)
        ids = [h["id"] for h in self.heroes]
        self.assertEqual(len(set(ids)), 48)

    def test_initial_status_missing(self) -> None:
        self.assertTrue(all(h["status"] == "missing" for h in self.heroes))

    def test_bom_present(self) -> None:
        raw = (pu.CONFIG_DIR / "heroes.csv").read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "heroes.csv must be UTF-8 with BOM")


class TestCsvBom(unittest.TestCase):
    def test_write_read_roundtrip_with_bom(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.csv"
            pu.write_csv_rows(path, [{"a": "中文", "b": "x"}], ("a", "b"))
            self.assertTrue(path.read_bytes().startswith(b"\xef\xbb\xbf"))
            rows = pu.read_csv_rows(path)
            self.assertEqual(rows, [{"a": "中文", "b": "x"}])


class TestFilenameConvention(unittest.TestCase):
    def test_parse(self) -> None:
        self.assertEqual(pu.parse_ref_filename("godie-e001.wav"), ("godie-e001", 1))
        self.assertEqual(pu.parse_ref_filename("godie-e001.2.wav"), ("godie-e001", 2))
        self.assertEqual(pu.parse_ref_filename("godie-e001.3.mp3"), ("godie-e001", 3))
        self.assertIsNone(pu.parse_ref_filename("godie-e001.wav.txt"))
        self.assertIsNone(pu.parse_ref_filename("godie-e001.0.wav"))
        self.assertIsNone(pu.parse_ref_filename("notes.md"))


class TestConfigs(unittest.TestCase):
    def test_processing_yaml_thresholds(self) -> None:
        cfg = pu.load_processing_config()
        sep = cfg["separation"]
        self.assertLess(sep["review_threshold"], sep["high_collision_threshold"])
        self.assertIn(pu.license_mode(cfg), {"strict", "private_research"})
        self.assertEqual(len(cfg["non_human_ids"]), 6)

    def test_search_sources_parse(self) -> None:
        sources = pu.load_search_sources()
        self.assertGreaterEqual(len(sources), 5)
        names = {s["name"] for s in sources}
        self.assertTrue(any("つくよみ" in n for n in names))

    def test_instruct_seeds_cover_all_heroes(self) -> None:
        seeds = pu.load_instruct_seeds()
        ids = {h["id"] for h in pu.load_heroes()}
        self.assertEqual(ids - set(seeds), set())


class TestRecommendedAction(unittest.TestCase):
    def test_auto_download_requires_all_flags_and_confidence(self) -> None:
        base = {"download_allowed": True, "commercial_use": True,
                "derivative_use": True, "ai_use": True,
                "confidence": "high", "url": "https://example.com/x"}
        self.assertEqual(search_candidates.recommended_action(base, "strict"), "auto_download")
        self.assertEqual(search_candidates.recommended_action(
            {**base, "ai_use": "unknown"}, "strict"), "manual_review")
        self.assertEqual(search_candidates.recommended_action(
            {**base, "ai_use": False}, "strict"), "reject")
        self.assertEqual(search_candidates.recommended_action(
            {**base, "confidence": "medium"}, "strict"), "manual_review")
        self.assertEqual(search_candidates.recommended_action(
            {**base, "confidence": "medium", "negotiable": True}, "strict"),
            "request_permission")


class TestSegmentScoring(unittest.TestCase):
    def _series(self, sr: int = 16000) -> audio_metrics.FrameSeries:
        # 30 s: first 15 s flat quiet tone, last 15 s loud dynamic sweep
        t = np.arange(30 * sr) / sr
        quiet = 0.02 * np.sin(2 * np.pi * 150 * t[: 15 * sr])
        mod = 0.5 * (1 + np.sin(2 * np.pi * 1.5 * t[15 * sr:]))
        loud = (0.6 * mod * np.sin(2 * np.pi * (200 + 150 * np.sin(2 * np.pi * 0.8 * t[15 * sr:])) * t[15 * sr:]))
        return audio_metrics.frame_analysis(np.concatenate([quiet, loud]).astype(np.float32), sr)

    def test_best_segment_prefers_dynamic_half(self) -> None:
        fs = self._series()
        cfg = pu.load_processing_config()
        start, end, score = audio_metrics.best_segment(fs, 30.0, cfg)
        self.assertGreaterEqual(start, 10.0, "should pick the loud dynamic half")
        self.assertGreater(score, 0.0)
        self.assertGreaterEqual(end - start, 5.0)
        self.assertLessEqual(end - start, 16.5)

    def test_short_clip_passes_through(self) -> None:
        fs = self._series()
        cfg = pu.load_processing_config()
        self.assertEqual(audio_metrics.best_segment(fs, 10.0, cfg), (0.0, 10.0, 1.0))


class TestInstructGeneration(unittest.TestCase):
    def test_all_scenes_for_all_heroes(self) -> None:
        rows = build_manifest.build_instructs(pu.load_heroes(), pu.load_instruct_seeds())
        self.assertEqual(len(rows), 48)
        for row in rows:
            for scene in ("default", "attack", "ultimate", "hurt", "death"):
                text = row[f"{scene}_instruct_ja"]
                self.assertTrue(text, f"{row['id']} {scene} empty")
                self.assertIn("模倣しない", text)

    def test_scene_override_applied(self) -> None:
        rows = {r["id"]: r for r in build_manifest.build_instructs(
            pu.load_heroes(), pu.load_instruct_seeds())}
        self.assertIn("チート", rows["godie-udea"]["ultimate_instruct_ja"])
        self.assertIn("放電", rows["godie-ofar"]["ultimate_instruct_ja"])


class TestCosine(unittest.TestCase):
    def test_cosine_similarity(self) -> None:
        self.assertAlmostEqual(audio_metrics.cosine_similarity([1, 0], [1, 0]), 1.0)
        self.assertAlmostEqual(audio_metrics.cosine_similarity([1, 0], [0, 1]), 0.0)
        self.assertEqual(audio_metrics.cosine_similarity([0, 0], [1, 1]), 0.0)


if __name__ == "__main__":
    unittest.main()

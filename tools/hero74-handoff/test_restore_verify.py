#!/usr/bin/env python3
"""Focused tests for the hero-74 archive restore and verification boundary."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from restore import restore_archive  # noqa: E402
from verify import load_metadata, require_absolute_outside_git, summary, verify_restored  # noqa: E402


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ArchiveFixture:
    def __init__(self, root: Path, unsafe_member: bool = False):
        self.manifest_dir = root / "manifest"
        self.parts_dir = root / "parts"
        self.manifest_dir.mkdir()
        self.parts_dir.mkdir()
        alpha = b"alpha\n"
        files = [
            {"path": "nested/alpha.txt", "bytes": len(alpha), "sha256": _sha(alpha), "mode": 0o644},
            {"path": "copy.txt", "bytes": len(alpha), "sha256": _sha(alpha), "mode": 0o600},
        ]

        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode="w") as archive:
            first = tarfile.TarInfo("../escape.txt" if unsafe_member else "nested/alpha.txt")
            first.size = len(alpha)
            first.mode = 0o644
            archive.addfile(first, io.BytesIO(alpha))
            link = tarfile.TarInfo("copy.txt")
            link.type = tarfile.LNKTYPE
            link.linkname = "nested/alpha.txt"
            link.mode = 0o600
            archive.addfile(link)
        compressed = gzip.compress(tar_buffer.getvalue(), mtime=0)
        split = max(1, len(compressed) // 2)
        payloads = (compressed[:split], compressed[split:])
        parts = []
        for index, payload in enumerate(payloads):
            name = f"payload.tar.gz.part{index:03d}"
            (self.parts_dir / name).write_bytes(payload)
            parts.append({"path": name, "bytes": len(payload), "sha256": _sha(payload)})

        manifest = {
            "schema": "ggd-community-materials-archive@1",
            "sources": ["synthetic-test"],
            "files": files,
            "parts": parts,
            "excluded": [],
            "summary": {
                "files": 2,
                "uniquePayloads": 1,
                "bytes": len(alpha) * 2,
                "compressedBytes": len(compressed),
                "redactedFiles": 0,
            },
        }
        manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
        manifest_sha = _sha(manifest_bytes)
        (self.manifest_dir / "manifest.json").write_bytes(manifest_bytes)
        location = {
            "schema": "ggd-community-materials-s3@1",
            "bucket": "unit-test-bucket",
            "region": "unit-test-region",
            "profile": "unit-test-profile",
            "manifestSha256": manifest_sha,
            "prefix": f"community-hero-forge/{manifest_sha}/",
        }
        (self.manifest_dir / "s3-location.json").write_text(json.dumps(location), encoding="utf-8")


class RestoreVerifyTests(unittest.TestCase):
    def test_metadata_summary_and_complete_restore(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fixture = ArchiveFixture(root)
            metadata = load_metadata(fixture.manifest_dir)
            self.assertEqual(summary(metadata)["uniquePayloads"], 1)
            output = root / "restored"
            receipt = restore_archive(fixture.manifest_dir, fixture.parts_dir, output)
            self.assertEqual(receipt["restoredFiles"], 2)
            self.assertEqual((output / "nested/alpha.txt").read_bytes(), b"alpha\n")
            self.assertEqual((output / "copy.txt").read_bytes(), b"alpha\n")
            self.assertEqual(verify_restored(metadata, output), 2)

    def test_corrupt_part_is_rejected_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fixture = ArchiveFixture(root)
            part = fixture.parts_dir / "payload.tar.gz.part000"
            payload = bytearray(part.read_bytes())
            payload[0] ^= 0xFF
            part.write_bytes(payload)
            output = root / "restored"
            with self.assertRaisesRegex(ValueError, "Corrupt archive part"):
                restore_archive(fixture.manifest_dir, fixture.parts_dir, output)
            self.assertFalse(output.exists())

    def test_archive_traversal_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            fixture = ArchiveFixture(root, unsafe_member=True)
            output = root / "restored"
            with self.assertRaisesRegex(ValueError, "Unsafe archive path"):
                restore_archive(fixture.manifest_dir, fixture.parts_dir, output)
            self.assertFalse(output.exists())
            self.assertFalse((root.parent / "escape.txt").exists())

    def test_cache_and_output_must_be_outside_git(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            worktree = Path(raw) / "worktree"
            (worktree / ".git").mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "outside a Git worktree"):
                require_absolute_outside_git(worktree / "cache", "Part cache")


if __name__ == "__main__":
    unittest.main()

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extract_batch = load("extract_batch")


FAKE_REPAK = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
if "--aes-key" not in args or "unpack" not in args:
    raise SystemExit(2)
key = args[args.index("--aes-key") + 1]
output = Path(args[args.index("--output") + 1])
if not output.parent.is_dir():
    raise SystemExit(10)
members = []
for index, arg in enumerate(args):
    if arg in {"--include", "-i"}:
        members.append(args[index + 1])
pak = Path(args[-1])
if os.environ.get("FAKE_REPAK_FAIL") == pak.name:
    raise SystemExit(9)
for member in members:
    destination = output / member
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes((pak.name + ":" + member).encode())
with Path(os.environ["FAKE_REPAK_LOG"]).open("a", encoding="utf-8") as stream:
    stream.write(json.dumps({"container": pak.name, "members": members, "keySeen": bool(key)}) + "\n")
'''


def row(container, path, native_id="chr0430"):
    return {
        "batch": 1,
        "nativeCharacterId": native_id,
        "characterName": "Dai",
        "assetClass": "model",
        "packageStem": path.rsplit(".", 1)[0],
        "path": path,
        "container": container,
        "containerOrder": int(container[3]),
        "containerSha256": "fixture-container-sha",
        "selectedByPatchOrder": True,
        "extractionState": "planned-not-extracted",
    }


class ExtractBatchTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.containers = []
        self.mirror_rows = []
        self.paks = {}
        for order in range(6):
            path = self.root / f"pak{order}.pak"
            payload = f"container-{order}".encode()
            path.write_bytes(payload)
            digest = hashlib.sha256(payload).hexdigest()
            self.containers.append({"name": path.name, "order": order, "bytes": len(payload), "sha256": digest})
            self.mirror_rows.append({"name": path.name, "absolutePath": str(path), "bytes": len(payload), "sha256": digest})
            self.paks[path.name] = path
        self.key = "12" * 32
        self.authority = {
            "sourceId": extract_batch.SOURCE_ID,
            "containers": self.containers,
            "indexEncryption": {"keySha256": hashlib.sha256(bytes.fromhex(self.key)).hexdigest()},
        }
        self.manifest = {
            "sourceId": extract_batch.SOURCE_ID,
            "summary": {"allSha256Verified": True},
            "containers": self.mirror_rows,
        }
        self.verified = extract_batch.verify_mirror(self.manifest, self.authority)
        os.environ["TEST_JUMP_KEY"] = self.key
        self.addCleanup(os.environ.pop, "TEST_JUMP_KEY", None)
        self.accepted_key = extract_batch.validate_key(self.authority, "TEST_JUMP_KEY")
        self.repak = self.root / "fake-repak"
        self.repak.write_text(FAKE_REPAK, encoding="utf-8")
        self.repak.chmod(0o755)
        self.log = self.root / "repak-invocations.jsonl"
        os.environ["FAKE_REPAK_LOG"] = str(self.log)
        self.addCleanup(os.environ.pop, "FAKE_REPAK_LOG", None)

    def test_groups_members_by_container_and_live_verifies_existing_file(self):
        output = self.root / "output"
        rows = [
            row("pak0.pak", "Character/chr0430/body.uasset"),
            row("pak0.pak", "Character/chr0430/body.uexp"),
            row("pak1.pak", "Character/chr0430/face.uasset"),
            row("pak2.pak", "Character/chr0430/existing.ubulk"),
        ]
        existing = output / "raw" / "pak2.pak" / rows[-1]["path"]
        existing.parent.mkdir(parents=True)
        existing.write_bytes(b"verified-existing")

        receipt = extract_batch.extract(self.repak, self.accepted_key, self.verified, rows, output)

        self.assertEqual(receipt["summary"]["extractedOrVerifiedFiles"], 4)
        self.assertEqual(receipt["summary"]["containerBatchesWithNewFiles"], 2)
        self.assertEqual(receipt["summary"]["repakUnpackInvocations"], 2)
        self.assertEqual(receipt["summary"]["preExistingFilesLiveVerified"], 1)
        self.assertEqual(receipt["summary"]["newFilesExtracted"], 3)
        self.assertFalse(receipt["summary"]["oneProcessPerMember"])
        self.assertNotIn(self.key, json.dumps(receipt))
        invocations = [json.loads(line) for line in self.log.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(invocations), 2)
        self.assertEqual([len(item["members"]) for item in invocations], [2, 1])
        self.assertNotIn(self.key, self.log.read_text(encoding="utf-8"))
        for item in receipt["files"]:
            path = Path(item["absolutePath"])
            self.assertEqual(item["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_failure_before_promotion_leaves_no_partial_raw_output(self):
        os.environ["FAKE_REPAK_FAIL"] = "pak1.pak"
        self.addCleanup(os.environ.pop, "FAKE_REPAK_FAIL", None)
        output = self.root / "failed-output"
        rows = [
            row("pak0.pak", "Character/chr0430/body.uasset"),
            row("pak1.pak", "Character/chr0430/face.uasset"),
        ]

        with self.assertRaisesRegex(ValueError, "pak1.pak chunk 1"):
            extract_batch.extract(self.repak, self.accepted_key, self.verified, rows, output)

        self.assertFalse((output / "raw").exists())

    def test_command_budget_splits_large_container_without_losing_members(self):
        members = [f"Character/chr0430/Textures/{index:04d}-" + "x" * 80 + ".uasset" for index in range(100)]
        chunks = extract_batch.chunk_members(["repak", "unpack", "--output", "/tmp/stage", "pak0.pak"], members, 4096)
        self.assertGreater(len(chunks), 1)
        self.assertEqual([member for chunk in chunks for member in chunk], members)

    def test_rejects_non_winner_or_unsafe_planned_paths_before_repak(self):
        output = self.root / "rejected-output"
        non_winner = row("pak0.pak", "Character/chr0430/body.uasset")
        non_winner["selectedByPatchOrder"] = False
        with self.assertRaisesRegex(ValueError, "not the patch winner"):
            extract_batch.extract(self.repak, self.accepted_key, self.verified, [non_winner], output)
        with self.assertRaisesRegex(ValueError, "unsafe PAK member path"):
            extract_batch.extract(
                self.repak,
                self.accepted_key,
                self.verified,
                [row("pak0.pak", "../outside.uasset")],
                output,
            )
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()

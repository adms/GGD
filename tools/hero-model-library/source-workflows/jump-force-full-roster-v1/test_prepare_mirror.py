import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prepare = load("prepare_mirror")


class PrepareMirrorTest(unittest.TestCase):
    def test_verifies_and_copies_only_authority_paks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            mirror = root / "mirror"
            source.mkdir()
            containers = []
            for order in range(6):
                path = source / f"pak{order}.pak"
                payload = f"pak-{order}".encode()
                path.write_bytes(payload)
                containers.append({
                    "name": path.name,
                    "order": order,
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                })
            authority = root / "authority.json"
            authority.write_text(json.dumps({"sourceId": prepare.SOURCE_ID, "containers": containers}))
            receipt = prepare.build_manifest(source, authority, mirror, None)
            self.assertEqual(receipt["operation"], "mirrored-and-verified")
            self.assertEqual(receipt["summary"]["verifiedContainers"], 6)
            self.assertTrue(receipt["summary"]["allSha256Verified"])
            self.assertFalse(receipt["scope"]["steamLibraryRescanRequired"])
            self.assertEqual(sorted(path.name for path in mirror.iterdir()), [f"pak{i}.pak" for i in range(6)])

    def test_refuses_mismatched_payload(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            containers = []
            for order in range(6):
                path = root / f"pak{order}.pak"
                path.write_bytes(b"wrong")
                containers.append({"name": path.name, "order": order, "bytes": 5, "sha256": "0" * 64})
            authority = root / "authority.json"
            authority.write_text(json.dumps({"sourceId": prepare.SOURCE_ID, "containers": containers}))
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                prepare.build_manifest(root, authority, None, None)

    def test_refuses_default_style_incomplete_upstream_mirror(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            authority = root / "authority.json"
            authority.write_text(json.dumps({"sourceId": prepare.SOURCE_ID, "containers": []}))
            with self.assertRaisesRegex(FileNotFoundError, "source mirror is not complete"):
                prepare.build_manifest(root, authority, None, root / "mirror-complete.json")


if __name__ == "__main__":
    unittest.main()

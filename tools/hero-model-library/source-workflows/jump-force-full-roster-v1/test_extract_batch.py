import hashlib
import importlib.util
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


class ExtractBatchTest(unittest.TestCase):
    def test_extract_receipt_never_contains_key(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            containers = []
            mirror_rows = []
            paks = {}
            for order in range(6):
                path = root / f"pak{order}.pak"
                payload = f"container-{order}".encode()
                path.write_bytes(payload)
                digest = hashlib.sha256(payload).hexdigest()
                containers.append({"name": path.name, "order": order, "bytes": len(payload), "sha256": digest})
                mirror_rows.append({"name": path.name, "absolutePath": str(path), "bytes": len(payload), "sha256": digest})
                paks[path.name] = path
            key = "12" * 32
            authority = {
                "sourceId": extract_batch.SOURCE_ID,
                "containers": containers,
                "indexEncryption": {"keySha256": hashlib.sha256(bytes.fromhex(key)).hexdigest()},
            }
            manifest = {
                "sourceId": extract_batch.SOURCE_ID,
                "summary": {"allSha256Verified": True},
                "containers": mirror_rows,
            }
            verified = extract_batch.verify_mirror(manifest, authority)
            self.assertEqual(set(verified), set(paks))
            os.environ["TEST_JUMP_KEY"] = key
            self.addCleanup(os.environ.pop, "TEST_JUMP_KEY", None)
            accepted_key = extract_batch.validate_key(authority, "TEST_JUMP_KEY")
            repak = root / "fake-repak"
            repak.write_text("#!/bin/sh\nprintf 'fixture-member'\n")
            repak.chmod(0o755)
            rows = [{
                "batch": 1,
                "nativeCharacterId": "chr0430",
                "characterName": "Dai",
                "assetClass": "model",
                "packageStem": "Character/chr0430/body",
                "path": "Character/chr0430/body.uasset",
                "container": "pak0.pak",
                "containerOrder": 0,
                "containerSha256": containers[0]["sha256"],
                "selectedByPatchOrder": True,
                "extractionState": "planned-not-extracted",
            }]
            receipt = extract_batch.extract(repak, accepted_key, verified, rows, root / "output")
            self.assertEqual(receipt["summary"]["extractedOrVerifiedFiles"], 1)
            self.assertNotIn(key, str(receipt))
            self.assertFalse(receipt["stages"]["runtimeSelectable"])
            self.assertEqual(receipt["files"][0]["sha256"], hashlib.sha256(b"fixture-member").hexdigest())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("decrypt_bonds_blobs.py")
SPEC = importlib.util.spec_from_file_location("decrypt_bonds_blobs", MODULE_PATH)
assert SPEC and SPEC.loader
decrypt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(decrypt)

META_PATH = Path(__file__).with_name("decrypt_il2cpp_metadata.py")
META_SPEC = importlib.util.spec_from_file_location("decrypt_il2cpp_metadata", META_PATH)
assert META_SPEC and META_SPEC.loader
metadata = importlib.util.module_from_spec(META_SPEC)
META_SPEC.loader.exec_module(metadata)


class AcpbTests(unittest.TestCase):
    def test_known_title_vector(self) -> None:
        encrypted = bytes.fromhex(
            "a4eff29cba5bdae86f9b401c05ae719afcc26d16254902d903f383fe1c10ce0b"
            "0b59b9ad73b0e591c3378b37563fda345b1b849664fd2d6b76d385d73252f41c"
        )
        key = bytes.fromhex(
            "ce410c5c4f0d16932752e0fb03d2e6764fdfc5194d7ee55db80470a48b299126"
        )
        plain, turn_index, turns = decrypt.decrypt_bytes(
            encrypted, key, "4e6967da86aa875c"
        )
        self.assertEqual(turn_index, 11)
        self.assertEqual(turns, 5)
        self.assertEqual(plain[:8], b"UnityFS\x00")
        self.assertIn(b"2020.3.15f2", plain)

    def test_random_access_matches_full_stream(self) -> None:
        key = bytes(range(32))
        encrypted = bytes(range(256))
        full, _, _ = decrypt.decrypt_bytes(encrypted, key, "0123456789abcdef")
        part, _, _ = decrypt.decrypt_bytes(
            encrypted[73:211], key, "0123456789abcdef", stream_offset=73
        )
        self.assertEqual(part, full[73:211])

    def test_metadata_title_wrapper(self) -> None:
        plain = bytearray(0x110)
        plain[:4] = metadata.STANDARD_SANITY.to_bytes(4, "little")
        plain[4:8] = (27).to_bytes(4, "little")
        plain[8:12] = (0x100).to_bytes(4, "little")
        wrapped = bytearray(b"seed" + plain)
        for index in range(12, len(wrapped)):
            wrapped[index] ^= metadata.XOR_KEY[(index - 12) % len(metadata.XOR_KEY)]
        self.assertEqual(metadata.decrypt_metadata(bytes(wrapped)), bytes(plain))


if __name__ == "__main__":
    unittest.main()

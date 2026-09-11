import tempfile
import unittest
from pathlib import Path

from scan_mounted_steam import scan


class MountedSteamScanTest(unittest.TestCase):
    def test_combines_drives_and_marks_duplicate_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            roots = [Path(tmp) / 'drive-a', Path(tmp) / 'drive-b']
            fixtures = [
                ('123', 'JUMP FORCE', 'JUMP_FORCE', '44'),
                ('123', 'JUMP FORCE', 'JUMP_FORCE_COPY', '45'),
            ]
            for root, (app_id, name, install_dir, build_id) in zip(roots, fixtures):
                apps = root / 'steamapps'
                (apps / 'common' / install_dir).mkdir(parents=True)
                (apps / f'appmanifest_{app_id}.acf').write_text(
                    f'"AppState"\n{{\n"appid" "{app_id}"\n"name" "{name}"\n'
                    f'"installdir" "{install_dir}"\n"buildid" "{build_id}"\n}}\n'
                )
            result = scan(roots)
            self.assertEqual(result['libraryCount'], 2)
            self.assertEqual(result['gameInstallCount'], 2)
            self.assertEqual(result['distinctAppCount'], 1)
            self.assertTrue(all(row['duplicateInstall'] for row in result['games']))
            self.assertTrue(all(row['prioritySource'] for row in result['games']))

    def test_accepts_share_root_that_is_steamapps_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            share = Path(tmp) / 'GGDSteam01'
            (share / 'common' / 'KOFXV').mkdir(parents=True)
            (share / 'appmanifest_1498570.acf').write_text(
                '"AppState"\n{\n"appid" "1498570"\n"name" "THE KING OF FIGHTERS XV"\n'
                '"installdir" "KOFXV"\n"buildid" "99"\n}\n'
            )
            result = scan([share])
            self.assertEqual(result['libraries'][0]['steamappsPath'], str(share.resolve()))
            self.assertEqual(result['games'][0]['name'], 'THE KING OF FIGHTERS XV')
            self.assertTrue(result['games'][0]['prioritySource'])


if __name__ == '__main__':
    unittest.main()

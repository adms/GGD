import gzip
import json
import tempfile
import unittest
from pathlib import Path

from scan_mounted_steam import load_catalog, scan


class MountedSteamScanTest(unittest.TestCase):
    def test_loads_saved_gzip_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'windows-game-library.json.gz'
            rows = [{'appId': '1895810', 'installDirectory': 'Strash'}]
            path.write_bytes(gzip.compress(json.dumps({'steamGames': rows}).encode()))
            self.assertEqual(load_catalog(path), rows)

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

    def test_marks_palworld_as_priority_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            share = Path(tmp) / 'GGDSteam01'
            (share / 'common' / 'Palworld').mkdir(parents=True)
            (share / 'appmanifest_1623730.acf').write_text(
                '"AppState"\n{\n"appid" "1623730"\n"name" "Palworld"\n'
                '"installdir" "Palworld"\n"buildid" "25094871"\n}\n'
            )
            result = scan([share])
            self.assertTrue(result['games'][0]['prioritySource'])

    def test_accepts_direct_common_share_and_joins_saved_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            common = Path(tmp) / 'common'
            (common / 'Strash').mkdir(parents=True)
            (common / 'Uncatalogued Game').mkdir()
            catalog = [{
                'appId': '1895810',
                'buildId': '12283352',
                'title': 'Infinity Strash: DRAGON QUEST The Adventure of Dai',
                'installDirectory': 'Strash',
            }]
            result = scan([common], catalog)
            self.assertEqual(result['libraries'][0]['layout'], 'direct-common-share')
            self.assertIsNone(result['libraries'][0]['steamappsPath'])
            self.assertEqual(result['games'][0]['appId'], '1895810')
            self.assertEqual(result['games'][0]['buildId'], '12283352')
            self.assertTrue(result['games'][0]['catalogMatched'])
            self.assertTrue(result['games'][0]['prioritySource'])
            self.assertEqual(result['games'][1]['inventoryMethod'], 'direct-common-directory')
            self.assertFalse(result['games'][1]['catalogMatched'])
            self.assertFalse(result['games'][1]['duplicateInstall'])
            self.assertEqual(result['distinctAppCount'], 2)

    def test_marks_direct_common_duplicates_only_when_catalog_has_app_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            roots = [Path(tmp) / 'drive-a' / 'common', Path(tmp) / 'drive-b' / 'common']
            for root in roots:
                (root / 'Palworld').mkdir(parents=True)
            catalog = [{
                'appId': '1623730',
                'buildId': '25094871',
                'title': 'Palworld',
                'installDirectory': 'Palworld',
            }]
            result = scan(roots, catalog)
            self.assertEqual(result['distinctAppCount'], 1)
            self.assertTrue(all(row['duplicateInstall'] for row in result['games']))


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Copy the owner's two train selections into the existing combat audio format.

The immutable intake stays local/S3; this writes only two finished MP3s, their
source mappings and a reproducible conversion receipt. Run combat builder with
--hero b2-kisaragi and index-lines afterwards to generate runtime bindings.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'taunt': 'ede6e2a4fff56342f55fb3bdb48172792fd761291b5181fbcaf5915ae67d4ee1',
    'victory': 'e437c81e1d18fa3e7216901c52894e354566d5de7f948e58aec96e217749f0cd',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--intake', type=Path, required=True)
    args = parser.parse_args()
    intake = args.intake.resolve()
    manifest_path = intake / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    sources = {s['proposedCategory']: s for s in manifest['sources']}
    assert set(sources) == set(EXPECTED)
    for category, source in sources.items():
        assert source['sha256'] == EXPECTED[category]
        assert sha(intake / source['relativePath']) == EXPECTED[category]
    originals_path = ROOT / 'content/assets/audio/voices/lines/COMBAT_ORIGINALS.json'
    originals = json.loads(originals_path.read_text())
    mapped = originals['champions'].setdefault('b2-kisaragi', {})
    receipt = {'schema': 'ggd.kisaragi-train-audio@1', 'heroId': 'b2-kisaragi',
               'sourceManifestSha256': sha(manifest_path), 'sourceManifestLocalPath': str(manifest_path),
               'conversion': {'codec': 'libmp3lame', 'bitrate': '128k', 'sampleRate': 44100,
                              'channels': 1, 'filter': 'loudnorm=I=-16:TP=-1.5:LRA=11',
                              'trimmed': False, 'metadataCopied': False},
               'sourceAudioLicense': 'unverified; website map CC attribution is not an audio license',
               'listeningReviewComplete': False, 'files': []}
    for category, source in sources.items():
        src = intake / source['relativePath']
        dst = ROOT / f'content/assets/audio/voices/lines/b2-kisaragi/{category}.mp3'
        prior = mapped.get(category, {})
        if prior and prior.get('sha256') != source['sha256']:
            raise ValueError(f'Refusing to replace another source: {category}')
        with tempfile.TemporaryDirectory(prefix='ggd-train-audio-') as temp:
            encoded = Path(temp) / dst.name
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(src), '-map_metadata', '-1',
                            '-af', receipt['conversion']['filter'], '-c:a', 'libmp3lame', '-b:a', '128k',
                            '-ar', '44100', '-ac', '1', str(encoded)], check=True)
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(encoded), '-f', 'null', '-'], check=True)
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                                                       '-show_format', '-of', 'json', str(encoded)]))
            stream = probe['streams'][0]
            assert stream['codec_name'] == 'mp3' and stream['channels'] == 1 and stream['sample_rate'] == '44100'
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(encoded.read_bytes())
        mapped[category] = {
            'src': str(src.relative_to(ROOT.parent)), 'name': src.stem, 'group': 'public-railway:yamanote-app',
            'sourceId': source['sourceId'], 'sha256': source['sha256'], 'seconds': source['seconds'],
            'importedAt': prior.get('importedAt', manifest['checkedAt']), 'url': source['downloadUrl'],
            'sourcePage': source['sourcePage'], 'lang': 'ja' if category == 'taunt' else 'und',
            'assetKind': 'station-announcement' if category == 'taunt' else 'departure-melody',
            'selection': 'owner-requested-train-audio', 'originalCharacterVoice': False,
            'rightsStatus': source['rightsStatus'], 'listeningReviewComplete': False,
            'excludedFromSpeechInput': True,
        }
        receipt['files'].append({'category': category, 'gitPath': dst.relative_to(ROOT).as_posix(),
                                 'sha256': sha(dst), 'bytes': dst.stat().st_size,
                                 'seconds': float(probe['format']['duration']), 'fullDecodePassed': True,
                                 'source': mapped[category]})
    originals_path.write_text(json.dumps(originals, ensure_ascii=False, indent=1) + '\n')
    save(ROOT / 'materials/hero-model-library/priority-evidence/kisaragi-train-audio/conversion.json', receipt)
    print(json.dumps({'heroId': 'b2-kisaragi', 'finishedClips': len(receipt['files']), 'fullDecodePassed': True}))


if __name__ == '__main__':
    main()

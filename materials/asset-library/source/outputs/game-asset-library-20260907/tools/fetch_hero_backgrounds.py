"""Archive read-only public hero descriptions to verify character aliases."""
import concurrent.futures
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'evidence' / 'hero-backgrounds'
DEST.mkdir(exist_ok=True)
rows = json.loads((ROOT / '300heroes-roster.json').read_text())['characters']

def fetch(row):
    target = DEST / f"{row['id']}.json"
    if target.exists():
        data = json.loads(target.read_text())
        if data.get('info', {}).get('id') == row['id']:
            return row['id'], True
    url = f"https://300data.com/data/api/hero_info/id/{row['id']}"
    result = subprocess.run(['curl', '-fLsS', '--connect-timeout', '15', '--max-time', '45', '--retry', '2',
                             '-X', 'POST', url, '-o', str(target) + '.part'], capture_output=True, text=True)
    if result.returncode:
        return row['id'], result.stderr
    try:
        data = json.loads(Path(str(target) + '.part').read_text())
        if data.get('info', {}).get('id') != row['id']:
            raise ValueError('Hero identity mismatch')
        Path(str(target) + '.part').replace(target)
        return row['id'], True
    except Exception as error:
        return row['id'], str(error)

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(fetch, rows))
(DEST / 'fetch-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print('Fetched', sum(result is True for _, result in results), 'of', len(rows), flush=True)
for hero_id, result in results:
    if result is not True:
        print(hero_id, result, flush=True)

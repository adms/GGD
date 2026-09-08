"""Preserve character cut-in videos and launcher music stored outside JMP."""
import hashlib
import json
import shutil
from pathlib import Path
from extract_300_packages import ROOT,RAW,EVIDENCE,extract_member,safe_path

records=[]
for item in json.loads((EVIDENCE/'300heroes-zip-index.json').read_text()):
    if Path(item['name']).suffix.lower() not in ('.wmv','.mp3','.wav','.ogg'):continue
    rel='client-media/'+safe_path(item['name'])
    source=extract_member(item)
    if source is None:raise RuntimeError('Required ZIP member has not downloaded')
    dest=RAW/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    records.append(dict(path=rel,original_path=item['name'],package='client_zip',bytes=dest.stat().st_size,
        md5=hashlib.md5(dest.read_bytes()).hexdigest(),source_zip_crc32=item['crc32'],
        category='cutscene_video' if dest.suffix=='.wmv' else 'audio'))
(EVIDENCE/'ClientMedia.assets.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records))
print(json.dumps(dict(client_media=len(records),bytes=sum(r['bytes'] for r in records))))

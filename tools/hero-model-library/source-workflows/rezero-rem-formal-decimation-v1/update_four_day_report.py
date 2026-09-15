#!/usr/bin/env python3
"""Add Rem formal-decimation status to the generated four-day asset report."""
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];REPORT=ROOT/'materials/hero-model-library/近四日新增模型動作特效清單.md';AUDIT=ROOT/'materials/hero-model-library/priority-evidence/current-component-policy-audit.json';S='<!-- rezero-rem-formal-decimation-v1:start -->';E='<!-- rezero-rem-formal-decimation-v1:end -->'
def main():
 a=argparse.ArgumentParser();a.add_argument('--check',action='store_true');x=a.parse_args();txt=REPORT.read_text();audit=json.loads(AUDIT.read_text());r=next(v for v in audit['records'] if v['id']=='rezero-rem-thunderstore-0.1.1-formal-decimated-v1');m=r['metrics'];block=f'{S}\n- Re:Zero 蕾姆正式減面靜態元件：原 18,328 面元件保留；新 `c05904af…` 為 **{m["triangles"]:,} 面**、{m["meshes"]} draw、{m["joints"]} joints、{m["embeddedImages"]} 張最大 256px 貼圖。Khronos 0/0、GGD budget 0 error/0 warning、逐 accessor 184,720 個有限浮點、骨架權重與三視圖 A/B 均通過；最大 silhouette XOR/union 4.7482%。它仍是零原生動作、未綁英雄／下拉／部署的獨立靜態元件。\n{E}'
 import re
 pat=re.escape(S)+r'.*?'+re.escape(E)
 out=re.sub(pat,block,txt,flags=re.S) if re.search(pat,txt,flags=re.S) else txt.replace('- Zero Lancer P1／P2：',block+'\n- Zero Lancer P1／P2：',1)
 if x.check:
  if out!=txt:raise SystemExit('stale Rem report')
 else:REPORT.write_text(out)
 print(json.dumps({'report':str(REPORT.relative_to(ROOT)),'check':x.check},ensure_ascii=False))
if __name__=='__main__':main()

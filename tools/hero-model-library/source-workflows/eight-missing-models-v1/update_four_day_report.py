#!/usr/bin/env python3
"""Insert the generated eight-hero correction into the four-day report."""
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
REPORT=ROOT/'materials/hero-model-library/近四日新增模型動作特效清單.md'
AUDIT=ROOT/'materials/hero-model-library/priority-evidence/eight-missing-models-v1/audit.json'
START='<!-- generated:eight-missing-models:start -->'; END='<!-- generated:eight-missing-models:end -->'
BOUNDARY='\n## 八、限制與自動化工具'
def block():
 d=json.loads(AUDIT.read_text()); lines=[START,'','### 八位先前標成「只有骨架」角色的現況修正','',f"8 位已有 {d['summary']['acceptedIndependentComponents']} 個 Git 內已驗收模型元件，不能再寫成沒有模型。逐角現況由 `tools/hero-model-library/source-workflows/eight-missing-models-v1/build_audit.py` 重算：",'', '| 角色 | 狀態 | 動作 | 後台候選 |','|---|---|---:|---|']
 for h in d['heroes']:
  option='Ryu 本尊非預設選項已登記' if h['runtimeDropdownRegistered'] else '待完整動作／model@1'
  lines.append(f"| {h['name']}（`{h['heroId']}`） | {h['status']} | {h['sourceOrProceduralMotionCount']} | {option} |")
 lines += ['', 'Ryu 的六段動作是 GGD 程序化備援；Mario 五段是 Ultimate14 社群 MOD 原生特殊動作。兩者都沒有冒稱任天堂或原作完整原生動作。正式站部署仍為 0。','',END]
 return '\n'.join(lines)
def expected(s):
 b=block()
 if START in s or END in s:
  if s.count(START)!=1 or s.count(END)!=1: raise ValueError('markers malformed')
  return s.split(START,1)[0]+b+s.split(END,1)[1]
 if s.count(BOUNDARY)!=1: raise ValueError('report boundary missing')
 return s.replace(BOUNDARY,'\n\n'+b+BOUNDARY)
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); a=ap.parse_args(); old=REPORT.read_text(); new=expected(old)
 if a.write: REPORT.write_text(new)
 elif old!=new: raise ValueError('four-day report stale')
 print(json.dumps({'report':str(REPORT.relative_to(ROOT)),'written':a.write},ensure_ascii=False))
if __name__=='__main__': main()

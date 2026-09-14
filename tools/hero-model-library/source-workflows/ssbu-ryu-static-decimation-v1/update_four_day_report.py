#!/usr/bin/env python3
"""Refresh the Ryu and aggregate-policy rows in the four-day asset report."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
REPORT=ROOT/'materials/hero-model-library/近四日新增模型動作特效清單.md'
AUDIT=ROOT/'materials/hero-model-library/priority-evidence/current-component-policy-audit.json'
MARKER_START='<!-- ssbu-ryu-static-decimation-v1:start -->'; MARKER_END='<!-- ssbu-ryu-static-decimation-v1:end -->'

def expected(text:str)->str:
 audit=json.loads(AUDIT.read_text()); totals=audit['totals']
 ryu=next(row for row in audit['records'] if row['id']=='ssbu-ryu-c00-static-decimated-v1')
 m=ryu['metrics']; adoption=ryu['formalHeroAdoption']
 totals_line=(f"現行元件政策稽核涵蓋 {totals['audited']} 顆 Git GLB：{totals['runtimeBudgetPass']} 顆都在 runtime 硬上限內，"
              f"{totals['heroAdoptionEligible']} 顆符合可適用的正式英雄模型採用條件，{totals['requiresDecimatedCandidate']} 顆來源超過 10,000 面而仍需各自的減面候選；"
              "另外 2 顆是武器道具，不適用完整英雄採用判定。")
 text=re.sub(r'現行元件政策稽核涵蓋 \d+ 顆 Git GLB：.*?另外 \d+ 顆是武器道具，不適用完整英雄採用判定。',totals_line,text,count=1)
 text=re.sub(r'- SSBU 靜態／動作元件：[^\n]*',
             '- SSBU 靜態／動作元件：Zero、Mario、Mewtwo、Steve、Alex、Pokémon Trainer 男／女、Ryu；另有 Kirby、Mario v2、Link、Sonic、Chrom、Ganondorf、Lucina、Daisy、Peach、Toon Link 的 c00 靜態標準化模型。這些是獨立元件狀態，不代表角色已成為後台完整英雄選項。',text,count=1)
 text=re.sub(r'\| Ryu \| 6 段 \| GGD 程序化 \| [^\n]*',
             '| Ryu | 6 段 | GGD 程序化 | 程序化六態與 7,979 面 SSBU 靜態元件均為獨立元件；尚未綁定英雄或下拉選項 |',text,count=1)
 block=(f'{MARKER_START}\n'
        f'- Ryu c00 正式減面靜態元件：原 14,621 面版本完整保留；新 `abd8b271…` 為 **{m["triangles"]:,} 面**、{m["meshes"]} draw、{m["joints"]} joints、{m["embeddedImages"]} 張最大 256px 貼圖。Khronos 0 error／0 warning、GGD hard errors 0、{adoption["decimatedCandidateTargetMax"]:,} 面正式採用幾何目標、逐 accessor 117,948 個有限浮點與 source/candidate 三視圖 A/B 都通過；最大 lit-pixel XOR 0.411563%。已建立 Git 成品、中央索引和 S3 完整讀回封裝，但來源與輸出皆無原生動作、沒有 GGD 英雄定義，因此後台下拉與部署仍為 0。\n'
        f'{MARKER_END}')
 pattern=re.escape(MARKER_START)+r'.*?'+re.escape(MARKER_END)
 if re.search(pattern,text,flags=re.S): text=re.sub(pattern,block,text,flags=re.S)
 else:
  anchor='- Zero Lancer P1／P2：'
  assert anchor in text,'Ryu report insertion anchor missing'
  text=text.replace(anchor,block+'\n'+anchor,1)
 return text

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');a=p.parse_args()
 out=expected(REPORT.read_text())
 if a.check:
  if REPORT.read_text()!=out: raise SystemExit('stale four-day Ryu report')
 else: REPORT.write_text(out)
 print(json.dumps({'report':str(REPORT.relative_to(ROOT)),'check':a.check},ensure_ascii=False))
if __name__=='__main__':main()

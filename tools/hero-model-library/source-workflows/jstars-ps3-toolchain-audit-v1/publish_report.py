#!/usr/bin/env python3
"""Refresh only this toolchain audit's block in the shared delivery report."""
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[4]
base = root / 'materials/hero-model-library/source-inventories/jstars-ps3-toolchain-audit-v1'
audit = json.loads((base / 'audit.json').read_text())
acquisition = json.loads((base / 'public-rigged-acquisition.json').read_text())
audio = json.loads((base.parent / 'jstars-owner-archive-extract-v1/audio-extract.json').read_text())
path = root / 'materials/hero-model-library/近四日新增模型動作特效清單.md'
start, end = '<!-- generated:jstars-ps3-toolchain-v1:start -->', '<!-- generated:jstars-ps3-toolchain-v1:end -->'
result = audit['result']
body = f"""{start}

### J-STARS PS3 解碼工具實測

查核 {len(audit['upstreams'])} 組公開工具鏈：{', '.join(row['name'] for row in audit['upstreams'])}。工具版本、來源網址、授權與逐檔 SHA 已固定在 [解碼器收據](source-inventories/jstars-ps3-toolchain-audit-v1/audit.json)。完整原生解碼 **{result['completeNativeDecodes']}**、本批新增標準模型 **{result['standardizedModels']}**；既有六名優先角的日文 CV/PV {audio['summary']['decodedWavFiles']:,} 段解碼成果仍保留，等待聽審。

現成工具無法完整解 `$CH0`；PS3 `0x0702` 頂點／蒙皮格式、骨架矩陣與貼圖排列仍待實作驗證。已取得奇犽 SRD／SRDI 的結構與範圍證據，不把 partial STPK 當完整模型。作者公開替代包已下載 **{acquisition['summary']['downloaded']}**、受阻 **{acquisition['summary']['blocked']}**；匿名下載的 HTTP 404 已記錄在 [取得收據](source-inventories/jstars-ps3-toolchain-audit-v1/public-rigged-acquisition.json)，沒有繞過登入。

目前是「原始素材已留底、格式探測完成、模型轉換受阻」，新增後台模型選項與正式部署皆為 0。

{end}
"""
old = path.read_text()
if start in old:
    if old.count(start) != 1 or old.count(end) != 1: raise ValueError('Duplicate or incomplete toolchain block')
    before, rest = old.split(start, 1)
    _, after = rest.split(end, 1)
    new = before + body.rstrip() + after
else:
    new = old.rstrip() + '\n\n' + body
if '--check' in sys.argv:
    if new != old: raise SystemExit('Stale J-STARS toolchain report')
else:
    path.write_text(new)
print('J-STARS PS3 toolchain report current')

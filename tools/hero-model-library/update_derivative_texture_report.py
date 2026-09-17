"""Build the Bojji/Azazel texture-revision handoff from registered receipts."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'materials/hero-model-library'
PATH = BASE / '近四日新增模型動作特效清單.md'
START, END = '<!-- generated:derivative-textures-v2:start -->', '<!-- generated:derivative-textures-v2:end -->'
bojji_path = BASE / 'source-inventories/bojji-crown-v2/registration-receipt.json'
azazel_path = BASE / 'priority-evidence/approved-derivative-azazel-wings-v2/inventory.json'
bojji, azazel = [json.loads(path.read_text()) for path in (bojji_path, azazel_path)]
rows = [
    ('波吉', '黑髮／膚色臉手／藍衣／白褲／黑鞋／金冠；保留原眼睛像素',
     bojji['validation'], bojji['registeredVersion']['modelKey'],
     bojji['status']['runtimeSelectable'], bojji['status']['currentAutomaticSelected'],
     bojji_path.relative_to(BASE).as_posix()),
    ('阿薩謝爾', '參考圖裁切閉眼與眉毛，橘髮／膚色上身／深咖啡褲，保留翅膀',
     azazel['candidate']['metrics'], azazel['candidate']['versionModelKey'],
     azazel['status']['selectable'], azazel['status']['automaticSelected'],
     azazel_path.relative_to(BASE).as_posix()),
]
lines = [START, '', '### 波吉／阿薩謝爾貼圖修正版', '',
         '兩名均沿用已核准代理模型的完整身體、骨架與借用動作。新版各自保留成獨立模型選項；外觀終審待 owner 確認，正式部署尚未驗證。', '',
         '| 角色 | 本批修正 | 三角面／draw／最大貼圖／最多動畫通道 | 本分支選項 | 證據 |',
         '|---|---|---|---|---|']
for name, changes, metrics, key, selectable, selected, evidence in rows:
    state = ('可選' if selectable else '待註冊') + ('；目前預選' if selected else '；保留原預選')
    lines.append(f"| {name} | {changes} | {metrics['triangles']:,}／{metrics['drawPrimitives']}／{metrics['maxTextureEdge']}px／{metrics['maxChannelsPerClip']} | {state}<br>`{key}` | [收據]({evidence}) |")
lines += ['', '本批沒有新增原生動作、特效或語音；保留原動作不另計為新增。舊版與被取代的中途候選完整保留，未通過外觀確認者不自動套用。', '', END]
block = '\n'.join(lines)
old = PATH.read_text()
if START in old:
    if old.count(START) != 1 or old.count(END) != 1: raise ValueError('Malformed derivative texture block')
    before, rest = old.split(START, 1)
    _, after = rest.split(END, 1)
    new = before + block + after
else:
    new = old.rstrip() + '\n\n' + block + '\n'
if '--check' in sys.argv:
    if new != old: raise SystemExit('Stale derivative texture report')
else:
    PATH.write_text(new)
print('Derivative texture report current')

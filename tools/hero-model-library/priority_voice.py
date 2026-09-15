"""Render the seven project heroes without recounting overlapping reserve audio."""
import json, re, argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
START='<!-- project-seven-voice:start -->'
END='<!-- project-seven-voice:end -->'
def insert_priority_voice(text):
    path=ROOT/'materials/hero-model-library/lol-project-seven/seven-voice-index.json'
    if not path.exists():return text
    data=json.loads(path.read_text())
    rows=['## 優先合併的 81 名英雄音訊','',
        '[81 英雄成品與缺口](81英雄優先合併清單.md) · [逐檔機器索引](priority-81-handoff.json)。讀取各角色 `audio.currentBranchFiles`；未有分支補件者使用 `audio.mainCommittedFiles`。每檔有 Git 路徑與 SHA-256，可直接從本機讀取。',
        '', '如月列車另補「嘲諷」關門廣播與「勝利」JR 發車旋律：[轉換與來源收據](priority-evidence/kisaragi-train-audio/conversion.json)。這兩段是指定鐵路音源；旋律不作語音合成輸入，原有九類音訊保留。',
        '', '## 七名 LOL 日文音訊','',
        '後續 LOL 擷取僅限這七名。已取得 **4,927 個 WAV**，可直接讀本機；此子集與下方整庫索引有重疊，不能相加計總數。原有其他角色檔案保留，不再擴抓全人物。',
        '', '[七名專用機器索引](lol-project-seven/seven-voice-index.json) · [擷取範圍設定](lol-project-seven/project-seven-config.json)', '',
        '逐檔路徑與 SHA-256 讀上述索引的 `audioFileIndex.reportPath`，依 `reportSha256` 驗證後篩選 `files`。`example:*` 是規格 ID，出貨 ID 為 `lol-*`；兩者是同一角色。', '',
        '| 角色 | 出貨 ID | 日文 WAV |','|---|---|---:|']
    for c in data['characters']:
        count=c.get('pcmWavCount',c.get('audioFiles',c.get('fileCount')))
        # Compact receipt totals are authoritative; avoid inferring from directory names.
        if count is None:
            receipt=json.loads((path.parent/'delivery-receipt.json').read_text())
            count=next(x['pcmWavCount'] for x in receipt['characters'] if x['heroId']==c['heroId'])
        rows.append(f"| {c['name']} | `lol-{c['heroId'].split(':')[-1]}` | {count:,} |")
    rows+=['','日文是官方語言包來源證據；尚未逐段聽審說話者、台詞或合成品質。', '', '```text',
        '只處理 GGD 七名 LOL：Karthus、LeeSin、Lux、MissFortune、Warwick、Xerath、Yasuo。',
        '先讀 materials/hero-model-library/lol-project-seven/seven-voice-index.json。',
        '依 audioFileIndex.reportPath 讀本機逐檔清單並核對 reportSha256；不用等待 S3。',
        '日文優先，原檔保留；篩除音效和混音後再製作語音輸入，不將整包視為已確認語音。',
        '```','']
    block=START+'\n'+'\n'.join(rows)+'\n'+END
    if START in text:return re.sub(re.escape(START)+r'.*?'+re.escape(END),lambda _:block,text,flags=re.S)
    head,rest=text.split('\n',1)
    return head+'\n\n'+block+'\n'+rest
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--workspace',type=Path);args=parser.parse_args()
    doc=ROOT/'materials/hero-model-library/角色語音索引.md';report=insert_priority_voice(doc.read_text());doc.write_text(report)
    if args.workspace:
        for p in [args.workspace/'角色語音索引.md',args.workspace/'GGD-Asset-Library/角色語音索引.md']:p.write_text(report)

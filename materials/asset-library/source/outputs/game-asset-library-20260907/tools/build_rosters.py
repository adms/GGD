"""Read the downloaded protobuf-style hero table and retain source evidence."""
import csv
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from hero_origins import crosswalk

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'evidence'

def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(data):
            raise ValueError('Truncated varint')
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError('Oversized varint')

def fields(data):
    result, pos = {}, 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        number, wire = tag >> 3, tag & 7
        if number == 0:
            raise ValueError('Invalid field number')
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            size, pos = varint(data, pos)
            if pos + size > len(data):
                raise ValueError('Truncated string/message')
            value, pos = data[pos:pos + size], pos + size
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            value = struct.unpack_from('<d' if wire == 1 else '<f', data, pos)[0]
            pos += size
        else:
            raise ValueError(f'Unsupported wire type {wire}')
        result.setdefault(number, []).append(value)
    return result

def text_field(record, key):
    return record.get(key, [b''])[0].decode('gb18030')

def main():
    formal = json.loads((EVIDENCE / '300data-formal-roster.json').read_text())
    extra = json.loads((EVIDENCE / '300data-extra-roster.json').read_text())
    formal_ids = {row['id'] for row in formal}
    extra_ids = {row['id'] for row in extra}
    assert not formal_ids & extra_ids
    raw = (EVIDENCE / 'hero_c.dat').read_bytes()
    rows = [fields(row) for row in fields(raw)[1]]
    records = []
    for row in rows:
        hero_id = row[1][0]
        records.append({
            'id': hero_id, 'name_original': text_field(row, 90),
            'name_key': text_field(row, 7), 'model_path': text_field(row, 44),
            'category': 'formal' if hero_id in formal_ids else 'extra' if hero_id in extra_ids else 'unclassified',
            'source': 'official_client_hero_c.dat',
            'classification_source': '300data.com',
        })
    records.sort(key=lambda x: x['id'])
    ids = {row['id'] for row in records}
    assert len(ids) == len(records)
    assert ids == formal_ids | extra_ids
    community = {row['id']: row['name'] for row in formal + extra}
    mismatches = [{'id': row['id'], 'client': row['name_original'], 'community': community[row['id']]}
                  for row in records if row['name_original'] != community[row['id']]]
    origins = crosswalk(records)
    for record in records:
        record.update(origins[record['id']])
        background = json.loads((ROOT / record['origin_local_evidence']).read_text())
        assert background['info']['id'] == record['id']
        assert background['info']['name'] == record['name_original']
        assert record['origin_work'] and record['origin_sources']
    origin_counts = Counter(record['origin_work'] for record in records)
    status_counts = Counter(record['origin_status'] for record in records)
    document = {
        'checked_on': '2026-09-07', 'scope': 'Downloaded official client hero table; not an all-time deleted-character census',
        'formal_entries': len(formal_ids), 'extra_entries': len(extra_ids),
        'total_entries': len(records), 'unique_names': len({x['name_original'] for x in records}),
        'client_sha256': hashlib.sha256(raw).hexdigest(),
        'sources': ['https://update.300hero.jumpwgame.com/xclient_unpack/excel/hero_c.dat.gz',
                    'https://300data.com/hero_list.html',
                    'https://datasite.jumpw.com/data/info-heros'],
        'official_website_only_entries': len(json.loads((EVIDENCE / '300heroes-official-roster.json').read_text())['data']),
        'origin_crosswalk': {
            'mapped_entries': len(origins),
            'work_groups': len(origin_counts),
            'status_counts': dict(status_counts),
            'method': 'Curated character identity/work crosswalk using client names, keys, public background/achievement records, artwork, and release announcements. A linked background may not explicitly name the original work; it can preserve older lore after redesigns.',
            'scope': 'Hero-level identity and work; not a complete skin roster or file-level extracted-asset audit.',
            'curated_source': 'tools/hero_origins.py',
        },
        'name_mismatches': mismatches, 'characters': records,
    }
    (ROOT / '300heroes-roster.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
    with (ROOT / '300heroes-roster.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows({key: '; '.join(value) if isinstance(value,list) else value
                          for key,value in record.items()} for record in records)
    lines = ['# 兩作角色清單', '', '核對日期：2026-09-07。', '',
             '## 300英雄', '',
             f'官方客戶端英雄表共 {len(records)} 筆；依 300data 分類為 {len(formal_ids)} 筆正式英雄與 {len(extra_ids)} 筆非正式／特殊單位。',
             '按資料 ID 列出，保留遊戲內簡體原名。同名不同 ID、變身與複合角色不能視為相同數量的獨立人物。',
             '這是本次取得的客戶端資料表清單，不宣稱涵蓋歷年已刪除角色，也不代表所有條目都能在目前版本選用。', '',
             '官方網站的 155 筆公開角色名單較少；本清單使用客戶端英雄表補全。', '',
             '[官方客戶端英雄表](https://update.300hero.jumpwgame.com/xclient_unpack/excel/hero_c.dat.gz) · [社群分類資料站](https://300data.com/hero_list.html)', '']
    lines += [f'全部 {len(records)} 筆已補上作品出處，共 {len(origin_counts)} 個作品／題材分組。',
              '作品欄是原作角色身分的對照，包含動漫、遊戲、原創、真人劇與特攝；不是所有角色都源自動畫。',
              '對照依據包括角色名、內部代碼、背景、成就、目前立繪和改版公告。資料站背景未必明寫原作名稱，也可能保留改名前的設定；特殊情況見狀態與備註。',
              '本表保留遊戲內簡體原名，別名欄補上原作人物；不含所有跨作品皮膚角色。',
              '[按作品分組閱讀](300heroes-by-origin.md) · [完整 CSV](300heroes-roster.csv) · [含逐筆證據的 JSON](300heroes-roster.json)', '']
    for category, title in [('formal', '正式英雄條目'), ('extra', '非正式／特殊單位條目')]:
        lines += [f'### {title}', '', '| ID | 遊戲內原名 | 原作人物／別名 | 作品出處 | 類型 | 狀態／備註 | 依據 |', '|---:|---|---|---|---|---|---|']
        for x in records:
            if x['category'] != category:
                continue
            urls = x['origin_sources']
            refs = [f'[角色頁]({urls[0]})', f"[存檔]({x['origin_local_evidence']})"]
            refs += [f'[補充{i+1}]({url})' for i,url in enumerate(urls[2:])]
            related = f"；另涉及 {x['related_origin_work']}" if x['related_origin_work'] else ''
            lines.append(f"| {x['id']} | {x['name_original']} | {x['canonical_character']} | {x['origin_work']}{related} | {x['origin_type']} | {x['origin_status']}。{x['origin_note']} | {' · '.join(refs)} |")
        lines += ['']
    grouped = ['# 300英雄：按原作分組的角色清單', '',
               '核對日期：2026-09-07。範圍為本次官方客戶端表的 276 筆英雄／特殊單位，保留資料 ID。',
               '共 262 筆正式英雄、14 筆額外／特殊條目；變身、同名 ID、雙人組合與召喚物不能直接當成獨立人物數。',
               '依作品角色身分整理；遊戲原創、民間故事、真人劇及特攝均直接標明。未指定全部皮膚的作品出處。',
               '角色連結通往資料站；詳細表另保存逐筆背景、公告與疑義說明。',
               '[完整逐筆表與兩作清單](character-rosters.md) · [CSV](300heroes-roster.csv) · [JSON](300heroes-roster.json)', '',
               '| 原作／題材 | 類型 | 筆數 | 角色（遊戲內名 → 原作身分；★ 為特殊條目） |',
               '|---|---|---:|---|']
    for work,count in sorted(origin_counts.items(),key=lambda pair:(-pair[1],pair[0])):
        rr = [r for r in records if r['origin_work'] == work]
        labels = []
        for r in rr:
            label = r['name_original']
            if r['canonical_character'] != label:
                label += ' → ' + r['canonical_character']
            label += f"〔{r['id']}〕" + ('★' if r['category'] == 'extra' else '')
            labels.append(f"[{label}](https://300data.com/hero/{r['id']}.html)")
        grouped.append(f"| {work} | {rr[0]['origin_type']} | {count} | {'；'.join(labels)} |")
    grouped += ['', '## 需要保留的歸屬說明', '']
    for r in records:
        if r['id'] in (18,23,30,51,54,56,61,86,87,88,89,119,126,153,187,210,289,314,319,320,327,334,335,336,390,391,392):
            urls = r['origin_sources']
            cite_url = urls[-1] if len(urls)>2 else urls[0]
            grouped.append(f"- **{r['name_original']}〔{r['id']}〕**：{r['origin_note']} [依據]({cite_url})")
    grouped += ['', '上述分組是作品身分對照；「依模型路徑推定」條目只表示本遊戲的技能歸屬，未當成原作獨立人物。', '']
    (ROOT / '300heroes-by-origin.md').write_text('\n'.join(grouped))
    (EVIDENCE / 'origin-verification.json').write_text(json.dumps({
        'checked_on': '2026-09-07',
        'client_rows': len(records), 'mapped_rows': len(origins),
        'background_files_identity_checked': len(records),
        'work_groups': len(origin_counts), 'status_counts': dict(status_counts),
        'name_mismatches': mismatches,
        'missing_origin_ids': sorted(ids-set(origins)),
        'unexpected_origin_ids': sorted(set(origins)-ids),
        'client_sha256': document['client_sha256'],
        'crosswalk_source_sha256': hashlib.sha256((ROOT/'tools/hero_origins.py').read_bytes()).hexdigest(),
        'validation_scope': 'Checks coverage and stable IDs/names; does not prove every factual attribution independently or inspect model/VFX/animation payloads.',
    }, ensure_ascii=False, indent=2)+'\n')
    mba = [
        ('nanoha', '高町奈葉（少女版）', '高町なのは', '魔法少女奈葉', '本體'),
        ('fate', '菲特·泰斯塔羅莎（少女版）', 'フェイト・テスタロッサ', '魔法少女奈葉', '本體'),
        ('sakura', '木之本櫻', '木之本さくら', '庫洛魔法使', '本體'),
        ('kirara', '星空綺羅羅', '星空きらら', '原創', '本體'),
        ('sarara', '星空紗羅羅', '星空さらら', '原創', '本體'),
        ('ruru', '露露·傑拉德', 'ルル・ジェラード', '原創', '本體／隱藏'),
        ('nowel', '諾威爾·迪亞斯塔西斯', 'ノウェル・ディアスタシス', '原創', '本體／隱藏'),
        ('gajet', 'Gadget Drone I 型', 'ガジェットドローンI型', '魔法少女奈葉', '本體／隱藏'),
        ('lina', '莉娜·因巴斯', 'リナ＝インバース', '秀逗魔導士', '免費追加'),
        ('naga', '白蛇娜卡', '白蛇のナーガ', '秀逗魔導士', '免費追加'),
        ('kukuri', '柯柯麗', 'ククリ', '咕嚕咕嚕魔法陣', '免費追加'),
        ('hayate', '八神疾風', '八神はやて', '魔法少女奈葉', 'Lyrical Pack'),
        ('vita', '薇塔', 'ヴィータ', '魔法少女奈葉', 'Lyrical Pack'),
        ('nanohasts', '高町奈葉（StrikerS 成年版）', '高町なのは（StS）', '魔法少女奈葉', 'Lyrical Pack'),
        ('lsama', '金色魔王／惡夢之王', '金色の魔王', '秀逗魔導士', '免費追加／隱藏'),
        ('oyaji', '吉他吉他老伯（阿德巴古·艾魯多魯）', 'アドバーグ・エルドル', '咕嚕咕嚕魔法陣', '免費追加／隱藏'),
        ('fatests', '菲特（StrikerS 成年版）', 'フェイト（StS）', '魔法少女奈葉', 'Complete Form'),
        ('ray', '魔法騎士組：獅堂光、龍咲海、鳳凰寺風', '魔法騎士', '魔法騎士雷阿斯', '1.70+ 免費追加'),
    ]
    mba_records = [dict(zip(['id', 'name_zh', 'name_ja', 'series', 'availability'], row)) for row in mba]
    for row in mba_records:
        row['source'] = 'https://area-zero.net/product/mba/charalist.htm#' + row['id']
    (ROOT / 'magical-battle-arena-roster.json').write_text(json.dumps({
        'checked_on': '2026-09-07', 'scope': 'Magical Battle Arena Complete Form 1.70+; excludes NEXT',
        'entries': 18, 'note': 'The Magic Knights share one group entry; Nanoha and Fate each have young and StS versions. Chinese names for original characters are transliterations; retain Japanese source names.',
        'characters': mba_records,
    }, ensure_ascii=False, indent=2) + '\n')
    lines += ['## 魔法少女武鬥祭', '',
              '範圍：Magical Battle Arena／Complete Form，含 Lyrical Pack 與 1.70+ 追加角色；不含另一作 NEXT。',
              '共 18 個角色／形態條目。魔法騎士三人組共用一個條目；奈葉與菲特的少女、成年版本各自計算。',
              '原創角色中文姓名為音譯，同時保留日文原名。', '',
              '[官方角色頁](https://area-zero.net/product/mba/chara.htm) · [官方追加包頁](https://area-zero.net/product/mba/dl_mbac.htm)', '',
              '| 角色 | 日文原名 | 作品 | 收錄範圍 |', '|---|---|---|---|']
    lines += [f"| {x['name_zh']} | {x['name_ja']} | {x['series']} | {x['availability']} |" for x in mba_records]
    lines += ['', '## 檔案狀態', '', '本文件是角色資料清單，不是遊戲本體或模型／特效／動作擷取完成報告。',
              '兩作的下載與擷取進度、版本及素材數量請見 [素材庫入口](ASSET_LIBRARY.md)。', '']
    (ROOT / 'character-rosters.md').write_text('\n'.join(lines))
    print(json.dumps({k: v for k, v in document.items() if k != 'characters'}, ensure_ascii=False, indent=2))
    for category in ['formal', 'extra']:
        rr = [x for x in records if x['category'] == category]
        print(category)
        for i in range(0, len(rr), 20):
            print(f'{i+1}–{min(i+20,len(rr))}: ' + '、'.join(x['name_original'] + (f"〔ID {x['id']}〕" if x['name_original'] == '梅普露' else '') for x in rr[i:i+20]))

if __name__ == '__main__':
    main()

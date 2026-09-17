#!/usr/bin/env python3
"""Build the J-Stars roster and conversion priority plan from one authority table."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "owner-jstars-victory-vs-plus-20260917"
ARCHIVE_NAME = "J-Stars Victory Vs+.7z"
SOURCE_URL = "https://blog.playstation.com/archive/2015/06/26/anime-brawler-j-stars-victory-vs-hits-ps4-ps3-ps-vita-today"
ROSTER_REFERENCE_URL = "https://en.wikipedia.org/wiki/J-Stars_Victory_VS"
SOURCE_REFERENCES = [
    {
        "label": "VIZ J-Stars VICTORY VS+ overview",
        "url": "https://www.viz.com/blog/posts/j-stars-victory-vs",
        "purpose": "39 playable and 13 support count cross-check",
    },
    {
        "label": "PlayStation release article",
        "url": SOURCE_URL,
        "purpose": "title, release and platform provenance",
    },
    {
        "label": "J-Stars Victory VS roster",
        "url": ROSTER_REFERENCE_URL,
        "purpose": "full 52-character roster cross-check",
    },
]

# Do not invent native IDs. `nativeId` is only filled when a local source receipt proves it.
ROSTER = [
    ("暗殺教室", "殺老師", "Koro-sensei", "playable"),
    ("惡魔奶爸", "男鹿辰巳＋小貝魯", "Tatsumi Oga + Baby Beel", "playable"),
    ("BLEACH 死神", "黑崎一護", "Ichigo Kurosaki", "playable"),
    ("BLEACH 死神", "藍染惣右介", "Sosuke Aizen", "playable"),
    ("鼻毛真拳", "波波波＋首領巴奇", "Bobobo-bo Bo-bobo + Don Patch", "playable"),
    ("珍遊記", "山田太郎", "Taro Yamada", "playable"),
    ("怪博士與機器娃娃", "則卷阿拉蕾＋卡斯拉", "Arale Norimaki + Gatchan", "playable"),
    ("七龍珠", "孫悟空", "Son Goku", "playable"),
    ("七龍珠", "貝吉塔", "Vegeta", "playable"),
    ("七龍珠", "弗利沙", "Frieza", "playable"),
    ("北斗神拳", "拳四郎", "Kenshiro", "playable"),
    ("北斗神拳", "拉歐", "Raoh", "playable"),
    ("銀魂", "坂田銀時", "Gintoki Sakata", "playable"),
    ("靈異教師神眉", "鵺野鳴介", "Meisuke Nueno", "playable"),
    ("HUNTER×HUNTER", "小傑·富力士", "Gon Freecss", "playable"),
    ("HUNTER×HUNTER", "奇犽·揍敵客", "Killua Zoldyck", "playable"),
    ("JoJo 的奇妙冒險", "喬納森·喬斯達", "Jonathan Joestar", "playable"),
    ("JoJo 的奇妙冒險", "喬瑟夫·喬斯達", "Joseph Joestar", "playable"),
    ("烏龍派出所", "兩津勘吉", "Kankichi Ryotsu", "playable"),
    ("最強學生會長", "黑神目瀧", "Medaka Kurokami", "playable"),
    ("火影忍者", "漩渦鳴人", "Naruto Uzumaki", "playable"),
    ("火影忍者", "宇智波佐助", "Sasuke Uchiha", "playable"),
    ("火影忍者", "宇智波斑", "Madara Uchiha", "playable"),
    ("ONE PIECE", "蒙其·D·魯夫", "Monkey D. Luffy", "playable"),
    ("ONE PIECE", "波特卡斯·D·艾斯", "Portgas D. Ace", "playable"),
    ("ONE PIECE", "波雅·漢考克", "Boa Hancock", "playable"),
    ("ONE PIECE", "赤犬／薩卡斯基", "Akainu", "playable"),
    ("家庭教師HITMAN REBORN!", "澤田綱吉＋里包恩", "Tsuna Sawada + Reborn", "playable"),
    ("神劍闖江湖", "緋村劍心", "Kenshin Himura", "playable"),
    ("神劍闖江湖", "志志雄真實", "Makoto Shishio", "playable"),
    ("聖鬥士星矢", "天馬座星矢", "Pegasus Seiya", "playable"),
    ("魁!!男塾", "劍桃太郎", "Momotaro Tsurugi", "playable"),
    ("齊木楠雄的災難", "齊木楠雄", "Kusuo Saiki", "playable"),
    ("幸運超人", "幸運超人", "Luckyman", "playable"),
    ("美食獵人 TORIKO", "阿虜", "Toriko", "playable"),
    ("美食獵人 TORIKO", "澤布拉", "Zebra", "playable"),
    ("幽遊白書", "浦飯幽助", "Yusuke Urameshi", "playable"),
    ("幽遊白書", "飛影", "Hiei", "playable"),
    ("幽遊白書", "戶愚呂弟", "Younger Toguro", "playable"),
    ("BLEACH 死神", "朽木露琪亞", "Rukia Kuchiki", "support"),
    ("D.Gray-man", "亞連·沃克", "Allen Walker", "support"),
    ("銀魂", "神樂＋定春", "Kagura + Sadaharu", "support"),
    ("排球少年!!", "日向翔陽", "Shoyo Hinata", "support"),
    ("HUNTER×HUNTER", "西索", "Hisoka", "support"),
    ("影子籃球員", "黑子哲也", "Tetsuya Kuroko", "support"),
    ("最強學生會長", "球磨川禊", "Misogi Kumagawa", "support"),
    ("魔人偵探腦嚙涅羅", "腦嚙涅羅", "Neuro Nogami", "support"),
    ("偽戀", "桐崎千棘", "Chitoge Kirisaki", "support"),
    ("搞怪吹笛手", "皮尤彥／捷豹", "Jaguar Junichi", "support"),
    ("魁!!男塾", "江田島平八", "Heihachi Edajima", "support"),
    ("SKET DANCE", "SKET 團三人組", "Bossun + Himeko + Switch", "support"),
    ("出包王女", "菈菈·撒塔林·戴比路克", "Lala Satalin Deviluke", "support"),
]

GGD_MATCHES = {
    "Koro-sensei": ["community-review-14-20260907"],
    "Ichigo Kurosaki": ["godie-h01o", "godie-h01n"],
    "Son Goku": ["godie-ogrh", "godie-o00x"],
    "Kenshiro": ["godie-u00l", "godie-umal"],
    "Gintoki Sakata": ["community-review-23-20260907"],
    "Meisuke Nueno": ["b2-nube"],
    "Gon Freecss": ["godie-ucrl"],
    "Killua Zoldyck": ["community-review-24-20260907"],
    "Sasuke Uchiha": ["godie-edem"],
    "Monkey D. Luffy": ["godie-u00n", "godie-u00o"],
    "Luckyman": ["b2-luckyman"],
    "Hiei": ["godie-u010", "godie-uvng"],
    "Hisoka": ["community-review-07-20260907"],
}

GGD_NAME_TOKENS = {
    "community-review-14-20260907": "殺老師",
    "godie-h01o": "黑崎一護",
    "godie-h01n": "黑崎一護",
    "godie-ogrh": "悟空",
    "godie-o00x": "悟空",
    "godie-u00l": "拳四郎",
    "godie-umal": "拳四郎",
    "community-review-23-20260907": "坂田銀時",
    "b2-nube": "鵺野鳴介",
    "godie-ucrl": "富力士",
    "community-review-24-20260907": "奇犽",
    "godie-edem": "宇智波佐助",
    "godie-u00n": "魯夫",
    "godie-u00o": "魯夫",
    "b2-luckyman": "幸運超人",
    "godie-u010": "飛影",
    "godie-uvng": "飛影",
    "community-review-07-20260907": "西索",
}

KNOWN_NATIVE_IDS = {
    "Monkey D. Luffy": "000",
    "Toriko": "013",
    "Zebra": "014",
    "Killua Zoldyck": "018",
}

# First new-hero batch: native playable assets and strong franchise reuse value.
NEW_HERO_PRIORITY = {
    name: rank
    for rank, name in enumerate(
        [
            "Toriko", "Zebra", "Naruto Uzumaki", "Yusuke Urameshi",
            "Younger Toguro", "Sosuke Aizen", "Vegeta", "Frieza",
            "Kenshin Himura", "Makoto Shishio", "Pegasus Seiya",
            "Medaka Kurokami",
        ],
        start=1,
    )
}


def validate_authority(repo: Path) -> None:
    playable = [row for row in ROSTER if row[3] == "playable"]
    support = [row for row in ROSTER if row[3] == "support"]
    if (len(ROSTER), len(playable), len(support)) != (52, 39, 13):
        raise ValueError(
            "J-Stars authority roster must stay at 52 total / 39 playable / 13 support; "
            f"got {len(ROSTER)} / {len(playable)} / {len(support)}"
        )
    names = [row[2] for row in ROSTER]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ValueError(f"duplicate J-Stars names: {duplicates}")
    known_names = set(names)
    unknown_matches = sorted(set(GGD_MATCHES) - known_names)
    unknown_native_ids = sorted(set(KNOWN_NATIVE_IDS) - known_names)
    unknown_priorities = sorted(set(NEW_HERO_PRIORITY) - known_names)
    if unknown_matches or unknown_native_ids or unknown_priorities:
        raise ValueError(
            "authority tables reference names outside the roster: "
            f"matches={unknown_matches}, nativeIds={unknown_native_ids}, priorities={unknown_priorities}"
        )
    non_playable_priorities = sorted(
        name for name in NEW_HERO_PRIORITY
        if next(row[3] for row in ROSTER if row[2] == name) != "playable"
    )
    if non_playable_priorities:
        raise ValueError(f"new hero priority contains support-only entries: {non_playable_priorities}")
    missing_hero_files = sorted(
        hero_id
        for hero_ids in GGD_MATCHES.values()
        for hero_id in hero_ids
        if not (repo / "content/champions" / f"{hero_id}.json").is_file()
    )
    if missing_hero_files:
        raise ValueError(f"configured GGD hero files are missing: {missing_hero_files}")
    configured_hero_ids = {hero_id for hero_ids in GGD_MATCHES.values() for hero_id in hero_ids}
    if set(GGD_NAME_TOKENS) != configured_hero_ids:
        raise ValueError("GGD name-token validation table does not match configured hero IDs")
    mismatched_hero_names = []
    for hero_id, token in GGD_NAME_TOKENS.items():
        payload = json.loads((repo / "content/champions" / f"{hero_id}.json").read_text(encoding="utf-8"))
        actual_name = str(payload.get("name", ""))
        if token not in actual_name:
            mismatched_hero_names.append(f"{hero_id}: expected {token!r} in {actual_name!r}")
    if mismatched_hero_names:
        raise ValueError("configured GGD identity mismatch: " + "; ".join(mismatched_hero_names))


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def workspace_root(repo: Path) -> Path:
    return repo.parent


def archive_candidates(workspace: Path) -> list[Path]:
    return [
        workspace / "GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917" / ARCHIVE_NAME,
        Path.home() / "Downloads" / ARCHIVE_NAME,
        Path.home() / "Desktop" / ARCHIVE_NAME,
    ]


def asset_recommendation(role: str) -> dict[str, str]:
    if role == "playable":
        return {
            "model": "保留原生模型、貼圖、骨架與形態；通過限制後建立獨立 J-Stars 選項",
            "motion": "優先使用原生可操作角色動作；映射 idle/run/attack/cast/hurt/death，缺 death 才用已核准 fallback",
            "vfxSfx": "特效與音效先依原生事件分組；編號不明者進逐項播放審查，不自動綁 Q/W/E/R",
            "voice": "日語語音逐檔保留並分離戰鬥喊聲、劇情對白；說話者與事件未核實者維持待審",
        }
    return {
        "model": "保存原生支援角色模型、貼圖與道具，先登記元件／候選，不冒稱完整英雄",
        "motion": "支援角色通常沒有完整六狀態；原生片段照實保留，借用／程序化動作須另行播放審查",
        "vfxSfx": "保存支援技特效與音效，可成為獨立技能元件；未核准前不綁正式英雄事件",
        "voice": "保存日語語音；先辨識說話者與支援技事件，再進逐項聽審",
    }


def build() -> dict:
    repo = repo_root()
    validate_authority(repo)
    workspace = workspace_root(repo)
    found_archive = next((p for p in archive_candidates(workspace) if p.is_file()), None)
    rows = []
    for roster_order, (work, zh, en, role) in enumerate(ROSTER, start=1):
        hero_ids = list(GGD_MATCHES.get(en, []))
        native_id = KNOWN_NATIVE_IDS.get(en)
        if native_id:
            status = "已有原生 PAK/STPK 對照樣本，等待 $CH0 解碼與標準化轉換"
        elif found_archive:
            status = "完整 owner archive 已到位，等待逐檔 inventory 與原生 ID 對照"
        else:
            status = "等待 owner archive 在本機可見；不得用推測 ID 代替擷取收據"
        rows.append({
            "rosterOrder": roster_order,
            "workZhTW": work,
            "nameZhTW": zh,
            "nameEnglish": en,
            "role": role,
            "sourceId": SOURCE_ID,
            "sourceUrl": SOURCE_URL,
            "rosterReferenceUrl": ROSTER_REFERENCE_URL,
            "nativeId": native_id,
            "ggdHeroIds": hero_ids,
            "alreadyInGgd": bool(hero_ids),
            "newHeroPriority": NEW_HERO_PRIORITY.get(en),
            "status": status,
            "recommendation": asset_recommendation(role),
        })
    gon_community = workspace / "GGD-Asset-Library/conversions/jumpforce-gon-thunderstore-v1/optimized-256/body.glb"
    gon_candidate = None
    if gon_community.is_file():
        gon_candidate = {
            "sourceClass": "community-mod",
            "localPath": str(gon_community),
            "bytes": gon_community.stat().st_size,
            "sha256": hashlib.sha256(gon_community.read_bytes()).hexdigest(),
            "triangles": 2245,
            "drawCalls": 5,
            "joints": 56,
            "textures": 5,
            "maxTextureDimension": 256,
            "animations": 0,
            "status": "標準化靜態模型候選；不可標成 J-Stars 原作，動作與正式選項尚未註冊",
        }
    return {
        "schema": "ggd.jstars-owner-archive-plan@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "J-Stars Victory VS+",
        "platformRequested": "PS3 archive; verify contents before assigning platform/version",
        "archiveFileName": ARCHIVE_NAME,
        "preferredIntakePath": str(archive_candidates(workspace)[0]),
        "archiveFound": bool(found_archive),
        "archivePath": str(found_archive) if found_archive else None,
        "sourceReferences": SOURCE_REFERENCES,
        "rosterCounts": {"total": len(rows), "playable": sum(r["role"] == "playable" for r in rows), "support": sum(r["role"] == "support" for r in rows)},
        "policy": {
            "modelOrder": "同角色且皆合格時，較新的 JUMP FORCE 原作模型預選；J-Stars 保留為獨立原作選項",
            "triangleRule": "超過 10000 面啟動減面，成品目標低於 8000 面",
            "audioReview": "未核實編號音效與語音不得直接綁技能；先產生逐項播放審查清單",
            "supportRule": "支援角色不因擁有模型或支援技就宣稱完整英雄",
        },
        "gonCommunityFallback": gon_candidate,
        "characters": rows,
    }


def markdown(plan: dict) -> str:
    def native_cell(row: dict) -> str:
        return f"`{row['nativeId']}`" if row["nativeId"] else "待 inventory"

    def hero_cell(row: dict) -> str:
        return ", ".join(f"`{hero_id}`" for hero_id in row["ggdHeroIds"]) or "尚無"

    lines = [
        "# J-Stars Victory VS+ 全角色素材更新計畫",
        "",
        f"- 來源 ID：`{plan['sourceId']}`",
        f"- 名單：{plan['rosterCounts']['playable']} 名可操作角色＋{plan['rosterCounts']['support']} 名支援角色，共 {plan['rosterCounts']['total']} 名。",
        f"- owner archive：{'已在本機找到' if plan['archiveFound'] else '尚未在本機路徑找到'}。",
        f"- 建議放置：`{plan['preferredIntakePath']}`",
        "- 名單核對：[VIZ 39 playable＋13 support](https://www.viz.com/blog/posts/j-stars-victory-vs)；[PlayStation 發售／平台資訊](https://blog.playstation.com/archive/2015/06/26/anime-brawler-j-stars-victory-vs-hits-ps4-ps3-ps-vita-today)；[52 名完整角色表](https://en.wikipedia.org/wiki/J-Stars_Victory_VS)。",
        "- 本文件由 `build_plan.py` 產生；角色 ID、來源狀態與政策不要只手改本 MD。",
        "",
        "## 第一批：現有 GGD 英雄，直接增加 J-Stars 獨立選項",
        "",
        "| 作品 | 角色 | 原文／英文名稱 | GGD ID | 原生 ID | 現況 |",
        "|---|---|---|---|---|---|",
    ]
    for r in plan["characters"]:
        if r["alreadyInGgd"] and r["role"] == "playable":
            lines.append(f"| {r['workZhTW']} | {r['nameZhTW']} | {r['nameEnglish']} | {hero_cell(r)} | {native_cell(r)} | {r['status']} |")
    lines += [
        "",
        "## 第二批：建議新增英雄",
        "",
        "| 順位 | 作品 | 角色 | 原文／英文名稱 | 原生 ID | 理由 |",
        "|---:|---|---|---|---|---|",
    ]
    for r in sorted((x for x in plan["characters"] if x["newHeroPriority"]), key=lambda x: x["newHeroPriority"]):
        reason = "已有原生對照樣本" if r["nativeId"] else "J-Stars 可操作角，預期模型／骨架／動作／戰鬥資源較完整"
        lines.append(f"| {r['newHeroPriority']} | {r['workZhTW']} | {r['nameZhTW']} | {r['nameEnglish']} | {native_cell(r)} | {reason} |")
    lines += [
        "",
        "## 完整名單",
        "",
        "| 類型 | 作品 | 角色 | 原文／英文名稱 | GGD 對應 | 狀態 |",
        "|---|---|---|---|---|---|",
    ]
    for r in plan["characters"]:
        lines.append(f"| {'可操作' if r['role'] == 'playable' else '支援'} | {r['workZhTW']} | {r['nameZhTW']} | {r['nameEnglish']} | {hero_cell(r)} | {r['status']} |")
    lines += [
        "",
        "## 轉換與上架建議",
        "",
        "1. 模型：同角色同級候選都合格時，依既定規則以較新的 JUMP FORCE 原作模型預選，J-Stars 仍保留為獨立下拉選項。超過 10,000 面才啟動減面，目標壓到 8,000 面以下。",
        "2. 動作：可操作角先取原生六狀態；支援角不假設有完整動作。缺 death 時可用已核准的 hurt＋半透明升天淡出，並在來源欄標示 fallback。",
        "3. 特效／音效：先依原生事件與容器拆分；只有編號而無事件證據的檔案要進播放審查頁，不能自動綁 Q/W/E/R。",
        "4. 語音：保留原容器和解碼母檔，優先日語。說話者、語言或事件未核實的檔案標待確認，不把劇情語音冒充戰鬥喊聲。",
        "5. 支援角：模型、支援技、音效與語音可進元件庫；缺完整身體或六狀態前維持待設計／待綁定，不能算完整英雄。",
        "",
    ]
    return "\n".join(lines)


def master_section(plan: dict) -> str:
    existing_playable = [r for r in plan["characters"] if r["alreadyInGgd"] and r["role"] == "playable"]
    existing_support = [r for r in plan["characters"] if r["alreadyInGgd"] and r["role"] == "support"]
    known_ids = [r for r in plan["characters"] if r["nativeId"]]
    priorities = sorted((r for r in plan["characters"] if r["newHeroPriority"]), key=lambda r: r["newHeroPriority"])
    gon = plan["gonCommunityFallback"]
    lines = [
        "<!-- generated:jstars-owner-archive-v1:start -->",
        "### J-Stars Victory VS+ owner archive 與新英雄候選",
        "",
        f"J-Stars 名單重新核對為 **{plan['rosterCounts']['playable']} 名可操作角色＋{plan['rosterCounts']['support']} 名支援角色，共 {plan['rosterCounts']['total']} 名**。現有 GGD 可直接增加獨立 J-Stars 模型選項者為 {len(existing_playable)} 名可操作角；另有 {len(existing_support)} 名支援角已有英雄定義，但支援角不能因有模型或單一支援技就算完整英雄。",
        "",
        f"owner archive `{plan['archiveFileName']}` 目前為 **{'已在本機找到，待 inventory' if plan['archiveFound'] else '尚未在已知本機路徑找到'}**；因此本批新增取得／轉換／註冊／部署均為 0。已由原生 PAK/STPK 對照樣本證明的 ID 只有 " + "、".join(f"{r['nameZhTW']}=`{r['nativeId']}`" for r in known_ids) + "，其餘不得用推測 ID 填入。",
        "",
        "名單來源已交叉核對 VIZ 的 39＋13 統計、PlayStation 的發售／平台資訊與 52 名完整角色表；原生 ID 與素材可用性仍只採本機收據。",
        "",
        "| 分組 | 角色 | 模型 | 動作 | 特效／音效 | 語音 |",
        "|---|---|---|---|---|---|",
        "| 現有 GGD 可操作角 | " + "、".join(r["nameZhTW"] for r in existing_playable) + " | 原作候選通過後成為獨立下拉選項 | 優先原生六態 | 編號不明者先逐項播放審查 | 日語優先，身份／事件未核實不綁定 |",
        "| 建議下一批新英雄 | " + "、".join(r["nameZhTW"] for r in priorities) + " | 都是可操作角，完整身體機率較高 | 預期有原生戰鬥動作，仍逐檔驗證 | 依容器與事件拆分 | 分離戰鬥喊聲與劇情對白 |",
        "| 13 名支援角 | 朽木露琪亞、亞連·沃克、神樂＋定春、日向翔陽、西索、黑子哲也、球磨川禊、腦嚙涅羅、桐崎千棘、捷豹、江田島平八、SKET 團、菈菈 | 先進模型／道具元件庫 | 不假設有完整六態；借用動作須播放審查 | 支援技可獨立成元件 | 先辨識說話者與事件 |",
        "",
    ]
    if gon:
        lines += [
            f"小傑另有一顆**社群來源**一般形態靜態候選：{gon['triangles']:,} 面、{gon['drawCalls']} draw、{gon['joints']} joints、{gon['textures']} 張 {gon['maxTextureDimension']}px 貼圖，SHA-256 `{gon['sha256']}`。它沒有原生動作，會保留為非 J-Stars／非 JUMP 的候選，不能取代等待中的原作擷取。",
            "",
        ]
    lines += [
        "完整 52 名名單與來源建議：`materials/hero-model-library/source-inventories/jstars-owner-archive-v1/J-STARS全角色素材更新計畫.md`。",
        "",
        "<!-- generated:jstars-owner-archive-v1:end -->",
    ]
    return "\n".join(lines)


def update_generated_section(text: str, section: str) -> str:
    start = "<!-- generated:jstars-owner-archive-v1:start -->"
    end = "<!-- generated:jstars-owner-archive-v1:end -->"
    if start in text and end in text:
        before = text.split(start, 1)[0]
        after = text.split(end, 1)[1]
        return before.rstrip() + "\n\n" + section + after
    return text.rstrip() + "\n\n" + section + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    out = repo / "materials/hero-model-library/source-inventories/jstars-owner-archive-v1"
    plan = build()
    generated = {
        out / "plan.json": json.dumps(plan, ensure_ascii=False, indent=2) + "\n",
        out / "J-STARS全角色素材更新計畫.md": markdown(plan),
    }
    master = repo / "materials/hero-model-library/近四日新增模型動作特效清單.md"
    generated[master] = update_generated_section(master.read_text(encoding="utf-8"), master_section(plan))
    if args.check:
        stale = [str(path.relative_to(repo)) for path, data in generated.items() if not path.is_file() or path.read_text(encoding="utf-8") != data]
        if stale:
            print("stale generated files:")
            print("\n".join(stale))
            return 1
        print(f"ok: {plan['rosterCounts']}, archiveFound={plan['archiveFound']}")
        return 0
    out.mkdir(parents=True, exist_ok=True)
    for path, data in generated.items():
        path.write_text(data, encoding="utf-8")
    print(f"wrote {len(generated)} files; {plan['rosterCounts']}; archiveFound={plan['archiveFound']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

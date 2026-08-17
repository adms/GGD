#!/usr/bin/env python3
"""聖杯願望 60 張的圖示特徵守衛（#333 / owner 2026-08-17）。

守的**機制**是一句話：**沒有兩張聖杯願望共用同一句特徵，也沒有一張掉進通用退路。**

為什麼這是機制不是潔癖：聖杯願望是**三選一**——一次同時出三張，玩家要在幾秒內
分辨。而在 `GRAIL_SUBJECT` 出現之前，把出貨的 `augment_keywords` 跑過這 60 份文件
只長出 16 種特徵，其中 33 張（55%）掉在同一句 "a glowing heraldic power sigil"。
那個畫面就是 #110 當初要修的「根本不知道哪招是哪招」原地重演。

⛔ 這支測試**刻意不斷言任何一句特徵的字面內容** —— 那 60 句是**內容**，owner 會改，
把它們抄進測試就是替一個預期會變的東西上鎖（第二守則：驗機制⛔不驗數字）。

Run:  python3 tools/icon-gen/local/test_grail_subjects.py
      （或 `python3 -m pytest tools/icon-gen/local/test_grail_subjects.py`）
"""
import glob
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
# keywords.py 需要 ../src 在 sys.path 上（它 `import prompt`），batch.py 也是這樣做的。
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import keywords  # noqa: E402

GRAIL_GLOB = os.path.join(REPO, "content", "augments", "grail-*.json")


def _grail_docs() -> list[dict]:
    docs = []
    for path in sorted(glob.glob(GRAIL_GLOB)):
        with open(path, encoding="utf-8") as fh:
            docs.append(json.load(fh))
    return docs


class GrailSubjects(unittest.TestCase):
    def test_every_wish_has_its_own_drawable_subject(self):
        docs = _grail_docs()
        self.assertGreater(len(docs), 0, "找不到任何 content/augments/grail-*.json")

        subjects: dict[str, list[str]] = {}
        fell_back = []
        for doc in docs:
            subject, _hue, signal = keywords.augment_keywords(doc)
            if signal != "grail":
                fell_back.append(f"{doc['id']} (signal={signal})")
            subjects.setdefault(subject, []).append(doc["id"])

        # ① 沒有一張退回通用啟發式/fallback（退回 = 那張卡跟別張撞圖）。
        self.assertEqual(
            fell_back, [],
            "這些聖杯願望沒有在 GRAIL_SUBJECT 裡，會退回通用圖：" + ", ".join(fell_back))

        # ② 相異特徵數 == 文件數（＝沒有兩張共用同一句）。
        collisions = {s: ids for s, ids in subjects.items() if len(ids) > 1}
        self.assertEqual(
            collisions, {},
            "這些聖杯願望共用同一句特徵，畫出來會是同一張圖："
            + "; ".join(f"{s!r} <- {ids}" for s, ids in collisions.items()))
        self.assertEqual(len(subjects), len(docs))


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env python3
"""tools/engine-vocab/test_engine_vocab.py — 「產生器不可以再手抄清單」的閘。

它守的是**一種**失敗，而那種失敗 2026-08-18 一次發生在四支產生器上：
一份手抄的枚舉表在引擎長出新成員之後過期，於是產物開始說謊（靜默刪掉一條
modifier、印裸 key、印 `—`），⛔ **而沒有任何東西會紅**。

所以每一條斷言都對應一種當時真的發生的說謊方式：

  * 屬性／事件的**清單**是從出貨的 TS 推導的（⛔ 不是這裡寫死的數字）
  * 每一條屬性、每一個事件都**查得到中文名** —— 少一個就 raise
  * 缺漏的行為是 **raise**，⛔ 不是回 `None` / 印裸 token / 印 `—`
  * 每一個 `ModOp` 都要有呈現方式 —— 少一個就 raise（`capRaise` 被折進加總
    印出「攻擊速度+1000%」就是這條沒關起來）

Run:  python3 tools/engine-vocab/test_engine_vocab.py     (stdlib only)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine_vocab as V  # noqa: E402


class Derived(unittest.TestCase):
    """清單是**推導**出來的 —— 這裡只驗形狀與覆蓋率，⛔ 不抄出貨的數字。"""

    def test_stats_come_from_the_shipped_enum(self):
        self.assertIn("maxHealth", V.stats())
        # 出貨的 `Stat` 每一條都要有中文名（`STAT_LABEL_ZH` 是 Record<Stat,…>）
        self.assertEqual(sorted(V.stat_labels()), sorted(V.stats()))

    def test_hook_events_and_ops_come_from_the_shipped_source(self):
        self.assertIn("onKill", V.hook_events())
        self.assertIn("flat", V.mod_ops())
        # curated.json 兩個方向都要對得上（引擎有→有名字；有名字→引擎認得）
        self.assertEqual(sorted(V.hook_labels()), sorted(V.hook_events()))

    def test_stat_caps_only_names_real_stats(self):
        self.assertTrue(set(V.stat_caps()) <= set(V.stats()))


class MissingIsLoud(unittest.TestCase):
    """⭐ 承重的那一條：**缺漏一定要吵**。這四個以前全是靜默的。"""

    def test_unknown_hook_event_raises(self):
        with self.assertRaises(V.VocabError):
            V.hook_label("onSomethingNobodyNamed")

    def test_reconcile_raises_when_a_token_has_no_label(self):
        with self.assertRaises(V.VocabError):
            V.reconcile({"a": "甲"}, ["a", "b"], "測試")

    def test_label_table_covers_every_stat_and_rejects_unknown_ones(self):
        table = V.label_table({})
        self.assertEqual(sorted(table), sorted(V.stats()))
        with self.assertRaises(V.VocabError):
            V.label_table({"notAStat": "假的"})

    def test_require_ops_raises_when_an_op_has_no_rendering(self):
        with self.assertRaises(V.VocabError):
            V.require_ops({"flat": None}, "測試")


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env python3
"""tools/economy/test_regen_descriptions.py — 三種「文案說了但不是那個意思」的閘。

三條都是 2026-08-18 在**出貨道具上量到**的，共同形狀是：產生器安靜地寫出一句
帶著數字的話，而那個數字沒有任何一位英雄拿得到。

  A `requires` 被折進加總 → 貫雷槍 `+4（近戰）`/`+2（遠程）` 印成「攻擊距離+6」
  B 舊用字不被認得       → 「魔抗+40%」與「魔法抗性+66.7」並排（22 件）
  C 閾值被當成加成       → 「單發傷害上限+20%」，語意與引擎**相反**

Run:  python3 tools/economy/test_regen_descriptions.py     (stdlib only)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import regen_descriptions as R  # noqa: E402


def _mod(stat, value, op="flat", **kw):  # noqa: D103
    return dict(stat=stat, op=op, value=value, **kw)


class GatedModifiersStandAlone(unittest.TestCase):
    """A —— 有條件的加成 ⛔ 不可以跟別人相加（加總是無條件的）。"""

    def test_two_gates_on_one_stat_never_merge(self):
        lines = R.stat_lines([
            _mod("range", 4, requires={"attackType": "melee"}),
            _mod("range", 2, requires={"attackType": "ranged"}),
        ])
        self.assertEqual(lines, ["攻擊距離+4（近戰）", "攻擊距離+2（遠程）"])

class ThresholdStatsAreNotBonuses(unittest.TestCase):
    """C —— 閾值型屬性 ⛔ 永遠不印 `+`（`+` 會讓語意整個相反）。"""

    def test_threshold_stats_read_as_ceilings_not_bonuses(self):
        self.assertEqual(R.stat_lines([_mod("maxHitPctMaxHp", 0.2)]),
                         ["單發傷害上限＝最大生命20%"])
        for stat in R.STAT_PHRASE:
            self.assertNotIn("+", R.stat_lines([_mod(stat, 0.5)])[0], stat)


class OldWordingIsOwned(unittest.TestCase):
    """B —— 認不得舊用字的代價不是少改一行，是**多一行**。"""

    def test_shipped_spellings_are_recognised(self):
        for line in ("防禦+20", "AP+130", "魔抗+40%", "MP + 600",
                     "每秒生命回復+12", "普攻吸血+20%", "吸血+15％"):
            self.assertTrue(R.is_owned(line), line)

    def test_a_replaced_block_states_each_stat_once(self):
        # 祕銀鎖子甲的形狀：兩行舊用字 vs 兩條 modifier。
        new = R.rewrite("防具\n效能\n防禦+40\n魔抗+40%\n\n解說\n略\n",
                        [_mod("armor", 40), _mod("mr", 66.7)])
        self.assertEqual(R.block_conflicts(new), [])
        self.assertNotIn("魔抗+40%", new)


class TheGeneratorOwnsWhatItWrites(unittest.TestCase):
    """⭐ 承重的那一條：產生器寫得出來的每一種行，它下一次都要認得自己。

    ⛔ 少認一種 = 每跑一次就多一行重複，而且**會累積**。
    """

    def test_every_emitted_form_is_owned(self):
        for mods in ([_mod("ad", 10)], [_mod("as", 0.5, op="pctAdd")],
                     [_mod("as", 10, op="capRaise")], [_mod("ms", 0.33, op="capRaisePct")],
                     [_mod("ad", 5, op="override")], [_mod("maxHitPctMaxHp", 0.2)],
                     [_mod("unavoidablePct", 1)], [_mod("cooldownDrainRate", 0.5)],
                     [_mod("ap", 0.05, op="percentOf", fromResource="mp")],
                     [_mod("range", 4, requires={"attackType": "melee"})]):
            for line in R.stat_lines(mods):
                self.assertTrue(R.is_owned(line), line)


if __name__ == "__main__":
    unittest.main(verbosity=2)

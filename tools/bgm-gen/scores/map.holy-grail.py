"""map.holy-grail — 大聖杯洞窟 的專屬戰鬥曲（GH#531）。

stone · 金邊 towers · grail · mud gates ⇒ 厚、儀式感、低男聲

⛔ 這份檔案刻意只有三行。整條五段弧線（導入→熱血→收束靜止低潮→轉折→高潮→LOOP）、
Sawano/進擊的巨人 調色盤、以及這張場地的真實場景錄音，全部住在 `ggd/aot.py` 的
`MAPS["arena.holy-grail"]` 那一列裡。⭐ 十三首只差參數，所以差異是**一張表**而不是十三份
會各自腐爛的程式（第零守則⑨）。要改這首，改那一列，⛔ 不要在這裡加層。
"""
from ggd import aot
from ggd.score import Score


def build() -> Score:
    return aot.build("arena.holy-grail")

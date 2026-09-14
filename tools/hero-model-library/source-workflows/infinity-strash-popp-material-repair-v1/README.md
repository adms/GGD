# PN020 貼圖修復候選

`build.py` 由已保留的 Kagayaki runtime GLB，以及來源匯出的 Face／Hair Base 與 Shade 貼圖，產生獨立的視覺審查候選。它只把 Base RGB 與 Shade RGB 相乘並保留 Base alpha；不猜測 Unreal Cel 材質、Bundle／Filter 通道或 shader 參數。

輸出先經正常 GGD 模型檢查與視覺審查。通過前，不更新 `b2-popp` 的手動選定 Kagayaki 模型、後台選項或 runtime。

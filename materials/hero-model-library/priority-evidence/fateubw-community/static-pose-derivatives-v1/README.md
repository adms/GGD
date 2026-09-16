# FateUBW 無原生時長姿勢的衍生動作候選

這批只處理原始動作 JSON 中沒有 `animation_length` 的五筆資料。轉換結果均標成衍生或程序化動作，不主張來源有原生播放時長。

| 候選 | 來源片段 | 轉換結果 | 衍生時長 |
| --- | --- | --- | ---: |
| `fateubw-cu_chulainn_lancer` | `summon` | 純定值姿勢，衍生 hold | 1 秒 |
| `fateubw-diarmuid_ua_duibhne_lancer` | `summon` | 純定值姿勢，衍生 hold | 1 秒 |
| `fateubw-medea_caster` | `summon` | 180°/秒正弦上下浮動，烘焙程序 loop | 2 秒 |
| `fateubw-sasaki_kojiro_assassin` | `summon` | 純定值姿勢，衍生 hold | 1 秒 |
| `fateubw-heracles_berserker` | `idle` | 90°/秒雙臂正餘弦，烘焙程序 loop | 4 秒 |

結構驗證為 5/5 Khronos 錯誤 0、警告 0，GGD 預算錯誤 0。三個 hold 的 GLB 通道只有開頭與結尾兩個相同鍵；兩個公式 loop 在週期中確實改變，且終點回到起點。`contact-sheet.png` 為 Babylon WebGL 載入後 0/25/50/75/100% 的視覺證據。

可重現指令（在 GGD repository 根目錄執行，輸出目錄必須是新目錄）：

```bash
python3 tools/hero-model-library/source-workflows/fateubw-minecraft-v1/convert_static_pose_derivatives.py \
  --repo . \
  --source-root ../GGD-Asset-Library/intake/public-models-20260911/fate-bounded-batch10/extracted/FateUBW-07e9d79b332c82b8fd10dada04cadbd84f4e6ce9 \
  --output ../GGD-Asset-Library/conversions/fateubw-static-pose-derivatives-v2

node --import tsx \
  tools/hero-model-library/source-workflows/fateubw-minecraft-v1/validate_static_pose_derivatives.mts \
  . ../GGD-Asset-Library/conversions/fateubw-static-pose-derivatives-v2

python3 tools/hero-model-library/source-workflows/fateubw-minecraft-v1/render_static_pose_derivatives.py \
  --repo . \
  --batch ../GGD-Asset-Library/conversions/fateubw-static-pose-derivatives-v2 \
  --output ../GGD-Asset-Library/conversions/fateubw-static-pose-derivatives-visual-v3
```

這批仍缺人工視覺核准、GGD 事件對應、重新散佈權限、後台選項註冊、實機切換與部署驗證，因此不是已上架或可部署狀態。

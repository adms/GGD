# J-Stars 優先角色：坂田銀時、小傑、奇犽

> 由 `build_inventory.py` 生成；請不要只手改本檔。

- J-Stars owner archive：`blocked-owner-archive-not-found`
- J-Stars 已轉換人物：0 / 3
- 已驗證可複用模型：3 / 3
- JUMP FORCE 已解碼但待聽審音訊：494 檔

| 角色 | J-Stars 模型 | 現有模型／骨架／動作 | VFX | SFX／語音 | J-Stars 註冊 |
|---|---|---|---|---|---|
| 坂田銀時 | existing-registered-fallback | existing-validated-fallback；existing-native-fallback | jstars-source-not-observed | jstars-source-not-observed；jstars-source-not-observed | 否 |
| 小傑·富力士 | community-static-fallback-converted-unregistered | community-fallback-validated；missing | jump-force-path-indexed-not-extracted | no-character-sfx-in-decoded-package；jump-force-decoded-pending-owner-review | 否 |
| 奇犽·揍敵客 | jstars-source-extracted-conversion-blocked; existing-300-fallback-registered | existing-300-fallback-validated; jstars-skin-conversion-blocked；existing-native-fallback | jstars-embedded-member-and-jump-force-path-indexed-unvalidated | jump-force-decoded-pending-owner-review；jump-force-decoded-pending-owner-review | 否 |

## 精確缺口

1. `J-Stars Victory Vs+.7z` 未出現在本機標準接收位置，銀時與小傑沒有已觀察的 J-Stars 原生容器。
2. 奇犽 `018` 已有 J-Stars SRD/SRDI/SRDV 實檔，但 `$CH0` 與 PS3 SRD 幾何／貼圖／蒙皮轉換尚未驗證。
3. 小傑／奇犽 JUMP FORCE 音訊已解碼與逐檔雜湊，但未逐段聽審，不得直接綁定技能事件。
4. 現有 300／社群候選可供遊戲使用或後續整合，但不是 J-Stars 轉換成果。

## 重建

```bash
node --import tsx tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/validate_models.mts
python3 tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/build_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/test_inventory.py
```

# J-Stars 優先三名素材盤點

本表由 `build_inventory.py` 產生。它只記錄可由本機實檔重現的證據；不同遊戲的素材會明列為替代來源，不會冒充 J-Stars 原生素材。

- Owner archive：`本機未找到`
- J-Stars 已證明原生 ID：0
- J-Stars 已轉換模型／動作／特效：0／0／0
- 已註冊／已部署：0／0

| 角色 | GGD ID | J-Stars 原生 ID | 模型 | 骨架 | 動作 | 特效 | 音效 | 語音 | 精確狀態 |
|---|---|---|---|---|---|---|---|---|---|
| 鵺野鳴介／神眉 | `b2-nube` | 未證明 | not-observed | not-observed | not-observed | not-observed | not-observed | not-observed | blocked-archive-not-found |
| 幸運超人 | `b2-luckyman` | 未證明 | not-observed | not-observed | not-observed | not-observed | not-observed | not-observed | blocked-archive-not-found |
| 飛影 | `godie-u010`, `godie-uvng` | 未證明 | not-observed | not-observed | not-observed | not-observed | not-observed | not-observed | blocked-archive-not-found |

## 可立即使用的替代來源證據

飛影已有 JUMP FORCE 音訊儲備：239 個已解碼 OGG（220 voice、19 SFX），來源 archive SHA-256 `49acb22c8278fafa68e0d44af58bd21ae83c854d8248c3eeacebeb61e8836cbb`。它尚未逐檔確認說話者、語言與技能事件，也不是 J-Stars 素材，因此目前只算待聽審替代候選。

## 重跑

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/test_inventory.py
```

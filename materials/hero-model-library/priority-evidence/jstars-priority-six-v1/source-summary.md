# J-Stars 第一優先六名來源與擷取準備

- 狀態：`owner-archive-inventoried-native-conversion-blocked`
- owner archive 精確檔名命中：0
- 原生 ID 已證明：6 / 6
- 可直接上架預設：0 / 6

owner archive 與 7 個 CPK 已盤點；六名原生 ID 均已由 partial STPK 內部成員名唯一對應，並可對應模型、動作、VFX、SFX 與語音容器候選。

| 順位 | 角色 | 原生 ID | 模型 | 動作 | VFX | SFX | 語音 | 預設使用 |
|---:|---|---|---|---|---|---|---|---|
| 1 | 坂田銀時 | 028 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |
| 2 | 鵺野鳴介／神眉 | 041 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |
| 3 | 小傑·富力士 | 017 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |
| 4 | 奇犽·揍敵客 | 018 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |
| 5 | 幸運超人 | 037 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |
| 6 | 飛影 | 012 | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | native-containers-present-hashed-conversion-blocked | blocked |

## 精確 blocker

1. 六名原生 ID 已確證：銀時 `028`、神眉 `041`、小傑 `017`、奇犍 `018`、幸運超人 `037`、飛影 `012`。
2. 六名的模型、動作、VFX、SFX 與語音容器候選已逐檔雜湊；它們仍是原生容器，不是 runtime 成品。
3. 原生資料尚受 `$CMP/$CH0` 完整解碼與 PS3 SRD/SRDI/SRDV 轉換器驗證所擋，所以不能標示已轉換、已上架或可預設。

## 來源完整性

- 公開原樣本 S3 receipt：`receipt-and-local-readback-present`
- 公開轉換分拆 S3 receipt：`receipt-and-local-readback-present`
- 原盤的 19,471 個 CPK 成員已有本機 deterministic JSONL.gz manifest；S3 receipt 仍只覆蓋先前的四角色公開樣本。

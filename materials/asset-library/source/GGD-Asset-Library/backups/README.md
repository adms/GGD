# 原始素材與半成品備份紀錄

此區只供備份及人工明確許可使用；其他程序不得自動取用。規則見 [BACKUP_README.md](../BACKUP_README.md)。

最近完成快照：`20260908T075704221576Z`
來源檔案：233,280；來源大小 58.88 GiB；壓縮備份 47.69 GiB。
220 個 S3 物件逐一讀回並核對 SHA-256 通過。本機來源及壓縮副本保留；刪除數為 0。

- [S3 備份指標](latest.json)
- [目前路徑清單](20260908T075704221576Z/manifest-path-correction-20260908.json)
- [上傳及讀回紀錄](20260908T075704221576Z/receipt.json)
- [壓縮內容完整性檢查](20260908T075704221576Z/archive-integrity.json)

| 來源 | 檔案數 | 原始 bytes |
|---|---:|---:|
| 300heroes-audio | 72,442 | 6087393336 |
| 300heroes-client | 33 | 13413515079 |
| 300heroes-downloads | 71 | 13375494650 |
| 300heroes-indexes | 8 | 85463186 |
| 300heroes-models | 44,736 | 10077347035 |
| 300heroes-raw | 111,198 | 17242464814 |
| 300heroes-snapshot-originals | 3 | 48074 |
| 300heroes-indexes-root | 3 | 41105655 |
| magical-battle-arena | 3,240 | 1985025906 |
| game-source-docs-tools | 730 | 88354913 |
| lol-intermediate | 501 | 318572919 |
| candidate-registry | 10 | 365855347 |
| community37-handoff | 236 | 144853875 |
| intake | 2 | 447493 |
| staging | 67 | 449491 |

目前備份入口已更正為 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`。原始上傳、清單及雜湊驗證紀錄保留當時路徑，不改寫歷史證據。搬移後已確認原始清單 SHA-256 與 216 個分段／索引物件的存在及大小；未重新下載全部 47.7 GiB 內容。

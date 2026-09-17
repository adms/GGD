# J-Stars 優先六角色容器與上架契約

- owner archive 狀態：`blocked-archive-not-found`
- 已知原生 ID：1 / 6（目前只有奇犚 `018`）
- 已轉換／已註冊／已部署：0 / 0 / 0

## 現行政策（由程式即時讀取）

- 來源超過 **10,000** 三角面才啟動減面；owner 驗收要求減面候選低於 **8,000** 面，程式上限為 **7,999**。
- 契約差異：正式 `adoptionPolicy.json` 把 8,000 寫成 `Max`，`prepare_runtime_candidate.mts` 今日會放行剛好 8,000；本稽核已列為 shared policy 缺口，未在本 lane 跨界修改。
- runtime 三角面警戒／上限：16,000 / 28,000。
- draw primitive 警戒／上限：3 / 6。
- 貼圖最長邊：256px；動畫通道警戒／上限：300 / 500。

## 六角色證據狀態

| 順位 | 角色 | 作品 | native ID | 模型 | 動作 | VFX | SFX | 語音 |
|---:|---|---|---|---|---|---|---|---|
| 1 | 坂田銀時 | 銀魂 | 未證明 | `not-observed` | `not-observed` | `not-observed` | `not-observed` | `not-observed` |
| 2 | 鵺野鳴介／神眉 | 靈異教師神眉 | 未證明 | `not-observed` | `not-observed` | `not-observed` | `not-observed` | `not-observed` |
| 3 | 小傑·富力士 | HUNTER×HUNTER | 未證明 | `not-observed` | `not-observed` | `not-observed` | `not-observed` | `not-observed` |
| 4 | 奇犽·揍敵客 | HUNTER×HUNTER | 018 | `observed-native-pak-stpk-and-split-members` | `not-observed` | `related-member-observed-not-decoded` | `not-observed` | `related-lps-member-observed-not-audio-confirmed` |
| 5 | 幸運超人 | 幸運超人 | 未證明 | `not-observed` | `not-observed` | `not-observed` | `not-observed` | `not-observed` |
| 6 | 飛影 | 幽遊白書 | 未證明 | `not-observed` | `not-observed` | `not-observed` | `not-observed` | `not-observed` |

## 格式與現有程式

- 原生模型流程是 `$CMP PAK -> STPK -> SRD/SRDI/SRDV`。現有程式可做 table/bounds 檢查與 STPK 安全分拆。
- `$CLH` 裡的 `$CH0` 解碼與 PS3 SRD 幾何／骨架／貼圖轉 GLB 還沒有通過本機驗證。
- 有 skinned GLB 以後，已有的 `prepare_runtime_candidate.mts` 會呼叫正式減面器、貼圖正規化、六態動作映射與 runtime 驗證。
- VFX／SFX／voice 必須先逐檔確認身分與事件；只有容器或 LPS 成員不能算已轉換或已綁定。

## 下一步

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py --archive "/absolute/path/J-Stars Victory Vs+.7z"
python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py
python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py --check
```

完整逐角色容器位置、下一步命令、轉換器可用性與缺口在 `inventory.json`。

# J-Stars 優先六角色轉換契約稽核

這條工作流只整理坂田銀時、鵺野鳴介／神眉、小傑、奇犚、幸運超人、飛影的容器格式、現有轉換器、現行上架政策與精確缺口。它不取代擷取、轉換或 runtime 驗收，也不會把檔名、容器路徑或 split member 寫成已轉換／已上架。

「超過 10,000 面才啟動減面」、貼圖邊長、draw primitive 與動畫通道限制都由 `emit_runtime_policy.mts` 即時 import 正式 runtime 常數。owner 現行規則是減面後必須低於 8,000 面；正式 `adoptionPolicy.json` 已改為最多 7,999 面，runtime preparer 用 `<= 7,999` 驗收，與 owner 規則一致。

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py
python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-contract-v1/test_build_contract.py
```

產出固定在：

```text
materials/hero-model-library/source-inventories/jstars-priority-contract-v1/inventory.json
materials/hero-model-library/source-inventories/jstars-priority-contract-v1/README.md
```

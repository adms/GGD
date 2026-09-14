# SSBU 四組模型與動作缺口複核

此工作流只讀本機已取得的 Worldblender 固定模型快照、Ultimate14 社群 MOD 動作及 Git 內成品，重新驗證 Mario、Mewtwo、Pokémon Trainer、Steve／Alex 的來源身分、逐檔 SHA-256、模型政策與六態缺口。

```bash
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_audit.py --write --update-report
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_audit.py --update-report
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_review_page.py --write
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_review_page.py
python3 -m unittest tools/hero-model-library/source-workflows/ssbu-missing-four-v1/test_build_audit.py
```

第二行是 check 模式：任何來源檔、Git GLB、中央元件、政策收據、Hero Forge 選項／預設或產生檔不同都會失敗。

`model@1` 需要六態具名 clip map。現有 Mario 五段 `d01special*` 仍未核准語意，其餘三組固定來源沒有 body motion；因此本工作流不建立假的 model 文件，不改手動預設，也不把 death 替代提案自動綁定。Pokémon Trainer 男／女已有通過正式採用幾何門檻的 7,896／7,892 面減面候選，但尚無目標骨架動作。

產生器會實際重驗 Mario 已有的 15 張 Babylon WebGL 目標骨架播放圖，並把每個角色的 Ultimate14 fighter／costume token、預期 NUANMB 目錄、Worldblender 內嵌 action 數、本機絕對路徑與 SHA-256 寫入 `audit.json`。Mewtwo 的精確缺口是 `fighter/mewtwo/motion/body/c00`；Trainer 是 `fighter/ptrainer/motion/body/c00|c01`；Steve／Alex 是 `fighter/pickel/motion/body/c00|c01`。NSandNS2 仍是 metadata-only，未讀任何容器 payload。

`apps/client/public/ssbu-missing-four-motion-review.html` 會直接播放 Git 內 Mario GLB 的 5 段 clip，可逐段匯出視覺核准／不核准 JSON。裁決 schema 固定 `semanticMappingApproved=false` 與 `runtimeBindingAuthorized=false`，不會把這五段特殊動作當成六態授權。

# SSBU 四組模型與動作缺口複核

此工作流只讀本機已取得的 Worldblender 固定模型快照、Ultimate14 社群 MOD 動作及 Git 內成品，重新驗證 Mario、Mewtwo、Pokémon Trainer、Steve／Alex 的來源身分、逐檔 SHA-256、模型政策與六態缺口。

```bash
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_audit.py --write --update-report
python3 tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_audit.py --update-report
python3 -m unittest tools/hero-model-library/source-workflows/ssbu-missing-four-v1/test_build_audit.py
```

第二行是 check 模式：任何來源檔、Git GLB、中央元件、政策收據、Hero Forge 選項／預設或產生檔不同都會失敗。

`model@1` 需要六態具名 clip map。現有 Mario 五段 `d01special*` 仍未核准語意，其餘三組固定來源沒有 body motion；因此本工作流不建立假的 model 文件，不改手動預設，也不把 death 替代提案自動綁定。Pokémon Trainer 男／女的現有模型另超過 10,000 面來源觸發值，仍需不高於 8,000 面候選與視覺 A/B，不能只用 28,000 面 runtime 硬上限宣稱正式採用完成。

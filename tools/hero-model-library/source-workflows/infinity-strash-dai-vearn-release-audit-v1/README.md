# Infinity Strash 達伊／巴恩交付狀態稽核

`audit.py` 從當前 Git 實檔、`current-resources.json`、模型預算報告、減面驗收證據與巴恩形態索引重建一份簡短狀態報告。它會重新計算 GLB SHA-256、位元組與動作數，並驗證六狀態動作映射、角色版本、後台候選與視覺證據。

它也會重讀本機素材庫的 5,530 筆原始 package 索引，對 PN010／EN801 的 4,740 個 package 逐檔重算 SHA-256；音訊則同時核對 WEM 母檔與解碼 WAV。原始 VFX package、已轉成 GGD VFX、已聽審音訊與 runtime 綁定會分開計數，避免把取得素材寫成上架。

巴恩形態邊界是硬性檢查：EN801 只得記為變身前老巴恩；EN653 是密斯特巴恩；EN680/EN681 是巴蘭。如果來源索引日後找到第二個 EN801 身體，程式會停止，要求重新人工辨識，不會直接把其當成變身後巴恩。

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --write
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/update_four_day_report.py --write
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/update_four_day_report.py
python3 -m unittest -v tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/test_audit.py
```

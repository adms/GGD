# Infinity Strash 達伊／巴恩交付狀態稽核

`audit.py` 從當前 Git 實檔、`current-resources.json`、模型預算報告、減面驗收證據與巴恩形態索引重建一份簡短狀態報告。它會重新計算 GLB SHA-256、位元組與動作數，並驗證六狀態動作映射、角色版本、後台候選與視覺證據。

巴恩形態邊界是硬性檢查：EN801 只得記為變身前老巴恩；EN653 是密斯特巴恩；EN680/EN681 是巴蘭。如果來源索引日後找到第二個 EN801 身體，程式會停止，要求重新人工辨識，不會直接把其當成變身後巴恩。

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --write
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --check
python3 -m unittest -v tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/test_audit.py
```

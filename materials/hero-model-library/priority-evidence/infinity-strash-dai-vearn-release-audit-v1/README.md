# Infinity Strash 達伊／巴恩高品質候選現況

> 本檔由 `audit.py` 從 Git 實檔、模型預算報告、驗收證據與角色版本清單產生；請勿手改數字。

| 角色／形態 | 三角面 | Draw primitives | 貼圖最長邊 | 骨骼 | 原生動作 | 後台候選 | 目前預選 |
|---|---:|---:|---:|---:|---:|---|---|
| 小呆／達伊（PN010/02） | 7,917 | 6 | 256 px | 429 | 5 | yes | no |
| 小呆／達伊（PN010/05，達伊之劍） | 7,918 | 6 | 256 px | 429 | 5 | yes | yes |
| 巴恩大魔王（EN801，變身前／老巴恩） | 7,998 | 6 | 256 px | 292 | 5 | yes | yes |

## 狀態邊界

- 達伊 PN010/02、PN010/05＋達伊之劍、變身前老巴恩 EN801：Git 實檔、五段原生動作、預算、視覺驗收與後台候選均已驗證。
- 達伊預選為 PN010/05＋達伊之劍減面版；老巴恩預選為 EN801 減面版。高面數版仍保留在各角色版本清單。
- 巴恩變身後／年輕真身：兩個主 PAK 索引沒有第二個 EN801 身體，目前候選實檔為 0；須另取允許共用的來源。
- EN653 是密斯特巴恩；EN680／EN681 是巴蘭與其形態，均不可當作變身後巴恩。
- BowlRoll 鯖缶359 v0.87 只有老巴恩，且原作者禁止商用與再散布，所以只作私有儲備，不可轉成共用後台選項。
- 達伊／老巴恩原始 package 逐檔驗證：4,740 檔；PN010／EN801 VFX package 分別為 182／169，GGD VFX 與技能綁定仍為 0。
- 可播放音訊已解碼且母檔／WAV 逐檔驗 SHA：達伊 359 檔、老巴恩 140 檔；說話者、語言與技能事件仍待逐項聽審，runtime 綁定為 0。
- 本輪未驗證 Main 合併或正式站部署。

## 重建

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --write
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --check
```

# JUMP FORCE 未加密素材唯讀稽核

> 由 `build_audit.py` 生成。只讀既有本機鏡像與已擷取副本；沒有讀取或嘗試解密 PAK。

## 保留與驗證

- 完整鏡像：3,466 檔／23,856,777,652 bytes；六個 authority PAK SHA-256 全數通過。
- Streaming 音訊：43 個 AWB，凍結副本名稱與位元完全相同；已解碼 4,034 WAV。
- `chr0430` 達伊：已保留原生套件、模型匯出、貼圖與 Unreal 特效套件；v6 alpha-normalized 模型候選已固定為 7,930 面／6 draw／256px，且通過 Khronos、三視角 WebGL 與 conversion stage 的完整 S3 讀回驗證。

## 不可升級的狀態

- 結論：`no eligible pilot`。
- 全角色模型、動作、VFX 與設定仍在加密 PAK；本工作流不尋找、猜測、繞過或使用 AES key。
- 已解碼音訊的角色、語言、台詞與技能事件仍是未審查；不能自動綁英雄或技能。
- 達伊 v6 候選技術上符合正式採用門檻，但沒有原生或已聽審借用動作，且 owner 視覺審查仍待完成；不能杜撰六態映射來加入後台下拉。

## 重跑

```sh
python3 tools/hero-model-library/source-workflows/jumpforce-unencrypted-readonly-audit-v1/build_audit.py --workspace ..
python3 tools/hero-model-library/source-workflows/jumpforce-unencrypted-readonly-audit-v1/build_audit.py --workspace .. --check
```

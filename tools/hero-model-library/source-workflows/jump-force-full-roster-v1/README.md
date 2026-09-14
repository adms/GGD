# JUMP FORCE 全角色批次流程

這個工作流把既有完整 PAK path index 與 63 個高信度 `chr####` 身份轉成可執行的抽取／轉換計畫。LV99 不必再分享或掃描整個遊戲資料夾；只需一次提供下列目錄內的原始檔：

```text
JUMP_FORCE/Content/Paks/
```

正式 authority 固定六顆 PAK 的名稱、大小、SHA-256 與 base-to-patch 次序。`prepare_mirror.py` 只讀這六顆檔案；不讀執行檔、Steam 帳號、使用者設定或其他遊戲。

## 1. 重建 63 名角色計畫

```bash
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/build_plan.py \
  --repo . \
  --workspace ..

python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/build_plan.py \
  --repo . \
  --workspace .. \
  --check
```

來源：

- `kof-jump-container-coverage-v1/identity-map.json`：224 個 `chr####` token 中的 63 個高信度角色 family。
- `jump-force-steam-pak-index.json`：六顆 PAK authority、patch 次序與 AES key identity digest。
- `GGD-Asset-Library/.../full-path-index.jsonl.gz`：256,619 筆容器關係／221,877 個目前路徑；不需再讀 LV99。

產物：

- `plan.json`：63 個 native ID、分批與各素材類別計數。
- `selected-paths.jsonl.gz`：逐 container／member 的抽取計畫，保留 patch winner。
- `README.md`：本批可讀摘要。
- `current-resource-entry.json`：中央索引候選。

查單一角色或批次：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/query.py chr0430
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/query.py --batch 1 --json
```

## 2. 一次性鏡像六顆 PAK

目前一次性鏡像目標固定為：

```text
/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/raw-game
```

流程只會取用其中的 `JUMP_FORCE/Content/Paks`。只有同層 `mirror-complete.json` 已產生後，預設命令才開始逐顆 PAK 驗證；檔案仍在複製時會停止，不把半套鏡像當完成。

驗證目前本機鏡像：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/prepare_mirror.py \
  --receipt ../GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/pak-authority-verification.json
```

如需從其他已完成來源重建镜像，明確傳入來源、完成收據與目標：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/prepare_mirror.py \
  --paks-root '/Volumes/common/JUMP FORCE/JUMP_FORCE/Content/Paks' \
  --completion-receipt /absolute/path/to/source-mirror-complete.json \
  --mirror-root ../GGD-Asset-Library/intake/jump-force-full-roster-v1/original \
  --receipt ../GGD-Asset-Library/intake/jump-force-full-roster-v1/pak-mirror-receipt.json
```

鏡像總量以 authority 為準，約 22.38 GB。既有 path index 已完整，因此鏡像後不必保持 LV99 掛載。

## 3. 按 native ID／批次抽取

此遊戲的 PAK index 加密。腳本不搜尋、推導、保存或輸出金鑰；只接受使用者有權使用且明確放入 `UNREAL_PAK_AES_KEY` 的 32-byte hexadecimal key，並只比對既有 authority 的 key SHA-256。缺 key、key identity 不符、PAK SHA 不符或 repak 拒絕時，該批停止。

```bash
UNREAL_PAK_AES_KEY='<authorized-key>' \
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/extract_batch.py \
  --repak /absolute/path/to/repak \
  --batch 1 \
  --receipt ../GGD-Asset-Library/extracted/jump-force-full-roster-v1/receipts/batch-01.json
```

單一角色可改用 `--native-id chr0430`。抽取器每次先重驗六顆 PAK 的大小與 SHA，依 full path index 的 patch winner 從指定 container 取出原始 member，並保存逐檔 SHA。AES 值不會進收據。

同一 PAK 的所有待抽取 member 會用一次 `repak unpack`與重複的 `--include`參數批次處理，不再每檔啟動一次 repak。當命令列過長時，會按 `--max-command-bytes`（預設 200,000 bytes）切成數個容器 chunk；因此實際 repak 啟動次數只會隨 PAK 與 chunk 數增加，不會隨全部 member 數線性增加。

每個 chunk 先抽到交易暫存目錄，全部命令成功且逐檔存在、大小與 SHA-256 已取得後，才整批移入正式 `raw/`。任一 PAK 或 member 失敗時，正式輸出不會留下半批新檔。已存在的正式檔會直接重算 live SHA-256 並跳過重複抽取；若其他流程在交易期間寫入相同檔案，只會在大小與 SHA-256 相等時接受。收據會分別記錄容器批次數、repak 啟動數、新增檔與已存在檔的即時驗證數。

## 4. 轉換界線

抽取完成後依序進行 dependency closure、UE Viewer 4.19 匯出、JUMP 專用 Blender／GLB 組裝、貼圖與透明層修正、GGD policy gate、三視角／動畫／音訊審查，再建立後台候選。

- 模型超過 10,000 面時減面，正式候選須到 8,000 面以下或等於 8,000。
- JUMP 的臉、眼球、眼影、鏡片與受傷覆蓋層須保留 primitive／UV seam；不可沿用一刀式全模型減面。
- `AnimBP` 與 `*_anim` 是動作 dependency root，不是已取得的 native `AnimSequence`。
- ActVoice／ActSE 只保留來源類別；語言、說話者與技能事件未聽審前維持待確認。
- VFX 的 package／貼圖取得不代表 Niagara／材質／時序／掛點已轉成可用 GGD 特效。

目前 Git 產物只證明計畫可重建。`已抽取`、`已轉換`、`已驗收`、`已註冊`、`可切換` 與 `已部署` 必須由後續收據分開更新。

## 測試

```bash
python3 -m unittest discover \
  -s tools/hero-model-library/source-workflows/jump-force-full-roster-v1 \
  -p 'test_*.py'
```

固定五日清單中的 JUMP 區塊也由 `plan.json` 產生：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/update_four_day_report.py --write
python3 tools/hero-model-library/source-workflows/jump-force-full-roster-v1/update_four_day_report.py --check
```

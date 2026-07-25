# 《去死團的逆襲》角色參考音收集與處理管線

為 48 位角色建立 CosyVoice 3 可用的 5–15 秒參考音（`prompt_wav`），
搭配自動生成的日文情緒指令（`instruct_text`），供
`inference_instruct2(tts_text, instruct_text, prompt_wav)` 使用。

目標不是模仿特定聲優本人，而是：**跨角色聲線分離度 + 角色個性與情緒張力**。

## 1. 安裝

```bash
brew install python@3.14 ffmpeg          # macOS
cd voice-reference-pipeline
python3.14 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

- **Python**：3.14+（開發環境 3.14.6；3.11 以上可運作但請用專案 venv）。
- **FFmpeg**：8.x（`ffmpeg`/`ffprobe` 需在 PATH 上；管線用它解碼、量測
  EBU R128 響度、two-pass loudnorm 正規化）。
- 可選：`pip install speechbrain torch torchaudio` 啟用 ECAPA-TDNN speaker
  embedding（Phase 7）。未安裝時自動退回 `spectral_proxy` 代理特徵並在
  log 明示——代理結果僅供排序參考。

## 2. 一鍵執行

```bash
./.venv/bin/python scripts/run_pipeline.py --all            # 完整管線
./.venv/bin/python scripts/run_pipeline.py --dry-run --all  # 演練（不寫 approved/、不下載；報表導向 logs/dry-run-reports/）
./.venv/bin/python scripts/run_pipeline.py --research           # 只跑 Phase 2+3
./.venv/bin/python scripts/run_pipeline.py --scan-incoming      # 只跑收件+品質檢查
./.venv/bin/python scripts/run_pipeline.py --process            # 只跑切段+正規化
./.venv/bin/python scripts/run_pipeline.py --analyze-separation # 只跑分離度
./.venv/bin/python scripts/run_pipeline.py --build-manifest     # 只跑指令+Manifest
```

每一步可重跑且不破壞既有結果（已存在的輸出會跳過；要重做加 `--force`）。
下載（Phase 4）**不**包含在 `--all` 內，需人工核准佇列後另行執行：

```bash
./.venv/bin/python scripts/download_permitted.py --dry-run   # 先看會下載什麼
./.venv/bin/python scripts/download_permitted.py
```

## 3. 如何放入自有音檔（檔名規則）

把音檔放進對應授權櫃：

| 目錄 | 意義 |
|---|---|
| `incoming/user_owned/` | 你自己錄的/你擁有的音檔 |
| `incoming/licensed/` | 有合約授權的音檔 |
| `incoming/downloaded_permitted/` | 管線下載的合法音檔（附 `.license.json`） |

檔名 = `英雄ID.wav`（第 2、3 個變體：`英雄ID.2.wav`、`英雄ID.3.wav`）。
接受 `.wav .mp3 .m4a .flac .ogg`。理想長度 5–15 秒；<3 秒直接拒絕；
>20 秒會自動抽出情緒最強的片段。內容不必是日文、不必是原作台詞——吼叫、
狂笑、冷語、喘息都可以；空耳與咬字不清**不是**拒絕理由。

然後：

```bash
./.venv/bin/python scripts/run_pipeline.py --scan-incoming --process --analyze-separation --build-manifest
```

## 4. 授權模式（重要）

`config/processing.yaml` → `license.mode`：

- `private_research`（**目前預設**，2026-07-24 使用者指示）：授權欄位僅
  記錄、不攔截。任何放進 `incoming/` 的檔案都會處理，`approved` 不要求
  授權證明，manifest 的 `license_status` 仍如實記錄供日後盤點。
- `strict`：對外發行前切回。授權未知 → 拒收；`approved=true` 需要
  `permitted / user_owned / licensed` 之一。

查證事實（2026-07-24，來源條款 URL 見 `config/search_sources.yaml`）：
つくよみちゃん / あみたろ / 刻鳴時雨 明示允許 AI 音聲合成；
**効果音ラボ明文禁止 AI 學習利用**（我們的 SFX credits 授權是另一回事，
聲素材不可作 CosyVoice 參考音）；声優統計・JVS 為研究限定。

## 4.5 人工覆核覆蓋（review overrides）

`config/review_overrides.csv` 記錄人工聽審決定。品檢中**僅啟發式**
（`background_music` / `multi_speaker` 估計）造成的拒絕,若該檔在此名單中
`decision=accept`,會降級為 `needs_review` 並註記覆核者——硬性缺陷
（<3 秒、爆音、靜音>60%、損毀）**不可**覆蓋。目前收錄 AudioGen
2026-07-25 交付的 51 檔 `locked_pass` 紀錄（出處見
`provenance/audiogen-2026-07-25/`）。

## 5. 如何人工核准候選來源

1. 跑 `--research` 產出 `reports/license_review_queue.csv`。
2. 打開該 CSV（UTF-8 BOM，Excel 直開）。`recommended_action` 為
   `manual_review` / `request_permission` 的列，逐一查 `license_url`。
3. 確認後把該列 `recommended_action` 改為 `auto_download`，並把
   `candidate_url` 換成**具體音檔 URL**（目錄頁不會被下載）。
4. 執行 `download_permitted.py`。四個旗標
   （download/commercial/derivative/ai）必須全為 `true` 才會下載。

## 6. 如何調整分離度門檻

`config/processing.yaml`：

```yaml
separation:
  high_collision_threshold: 0.78   # >= 高風險
  review_threshold: 0.68           # 0.68–0.78 需人工覆核
  embedding_backend: auto          # auto | speechbrain | spectral_proxy
```

非人類角色（初號機、妙蛙花、皮卡丘、基廉列克、Berserker、草泥馬 →
`non_human_ids`）不以 speaker embedding 作唯一判斷，改用聲學特徵
（pitch range / centroid / rolloff / harmonicity / roughness / tempo /
attack）比較。特徵比較用**距離型相似度** `exp(-‖a−b‖/scale)`
（`proxy_distance_scale`）——z-score 向量用 cosine 會被共同大分量支配而
嚴重虛高（實測低吼 vs 尖叫可到 0.98）。12 人同場對戰任何角色都可能同時
出現，因此報表涵蓋全部配對，依相似度由高到低排序。

本專案 venv 已安裝 `speechbrain + torch`（ECAPA-TDNN），人聲配對走真
speaker embedding；音檔改由專案內 ffmpeg 解碼餵入（不依賴 torchcodec）。

## 7. 如何重新處理單一角色

```bash
./.venv/bin/python scripts/run_pipeline.py --hero godie-e001 --scan-incoming --process --force
./.venv/bin/python scripts/run_pipeline.py --analyze-separation --build-manifest
```

## 8. 如何新增 `.2.wav` 變體

同一角色的第二個參考音：命名 `godie-e001.2.wav` 放入 `incoming/…`，重跑
上面的流程即可；產物是 `approved/processed/godie-e001.2.wav`，manifest 中
`variant=2`。分離度分析會把同角色多變體平均成一個 profile。

## 9. 如何匯出 CosyVoice 3 使用清單

- `reports/voice_reference_manifest.csv` — `approved=true` 的列即可交付；
  `file_path` 指向 `approved/processed/{hero_id}.wav`（24 kHz/mono/16-bit）。
- `reports/cosyvoice_instructs.csv` — 每角色 5 種場景的日文 instruct
  （default/attack/ultimate/hurt/death），皆以「特定の実在人物の声を模倣
  しない。」結尾。

```python
row = manifest[hero_id]
inference_instruct2(tts_text, instructs[hero_id]["attack_instruct_ja"], row["file_path"])
```

## 10. 報表總覽

| 檔案 | 內容 |
|---|---|
| `reports/research_report.csv` | 48 角色聲優查證（雙來源 URL）＋聲線特徵 |
| `reports/license_review_queue.csv` | 候選來源×角色的授權旗標與建議動作 |
| `reports/processing_report.csv` | 每一步處理紀錄（append-only） |
| `reports/separation_report.csv` | 兩兩相似度、碰撞風險、建議修正 |
| `reports/missing_characters.csv` | 尚無參考音的角色與建議來源 |
| `reports/rejected_clips.csv` | 被拒音檔與原因 |
| `reports/voice_reference_manifest.csv` | 最終交付清單 |
| `reports/cosyvoice_instructs.csv` | 日文情緒指令 |

備註：`music_probability` 與 `multiple_speaker_probability` 是**啟發式估
計**（頻譜連續性/雙峰音高分佈），用於觸發人工覆核，不是精確判定。品質
中的「怪叫、空耳、非日文、誇張笑聲」一律不自動拒絕。

## 11. 測試

```bash
./.venv/bin/python -m unittest discover -s tests -v
```

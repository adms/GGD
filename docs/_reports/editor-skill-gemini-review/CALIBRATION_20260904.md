# Gemini VFX 圖片審閱校準（2026-09-04）

狀態：**適合在金鑰存在時預設開啟為 advisory 時序 issue finder；不適合授予通過。**

## 實測

| 模型 | 案例 | 結果 | 判定 |
| --- | --- | --- | --- |
| `gemini-flash-latest` | 龍破斬 | HTTP 503 high demand | alias 不適合做可靠預設 |
| `gemini-2.5-flash-lite` | 龍破斬 | HTTP 404；API 指示改用 3.5 | 已下架，不可使用 |
| `gemini-3.5-flash-lite` | 龍破斬（正例） | 11.36 秒、5,431 tokens、pass 0.95 | 能辨識先投射後爆炸 |
| `gemini-3.5-flash-lite` | 理想鄉 EX（已知負例） | 3.03 秒、5,351 tokens、pass 0.90 | **錯誤放行**；四幀沒有完整終結砲，模型卻聲稱可見 |
| `gemini-3.1-pro-preview`（low） | 龍破斬（正例） | 6.23 秒、5,384 tokens、pass 0.90 | 正確辨識投射後遠端爆炸 |
| `gemini-3.1-pro-preview`（low） | 理想鄉 EX（已知負例） | 7.75 秒、5,392 tokens、uncertain 0.80 | 正確指出只見部分斬擊、未見終結砲 |

第一次負例還發現 runtime phase label 會洩漏答案，因此審閱器已改成盲測：遠端只收到匿名 Frame 編號與時間，不傳 `anim`、`第 N 段` 等標籤，prompt revision 也納入 digest，舊快取不會被重用。盲測後 Flash Lite 仍錯誤放行負例；Pro low 能正確區分這一正一負，但兩案不足以估算誤放率。

2026-09-04 另以相同像素與 rubric 重跑 Pro low 三輪（正例與已知負例各三次）：6/6 完成、標註一致 6/6、false accept 0、false reject 0；正例三次皆為 `pass`，負例三次皆為 `uncertain`。p50 6.352 秒、p95／max 6.952 秒，平均 5,432 tokens。這證明同一小型校準集上的輸出穩定，但案例仍只有兩種場景，不足以把 100% 當成整體準確率；目前只支持「Pro low 可穩定協助找時序疑點，Flash Lite 不可用來預審」。

## 落地政策

- `GEMINI_API_KEY` 存在時自動啟用；`--no-gemini` 或 `GGD_VFX_GEMINI_ENABLED=0` 可強制關閉。
- package scripts 會自動載入 Git 忽略的 `.env.gemini.local`；tracked `.env.example` 只保留空白欄位與非敏感預設值。
- 啟用時預設使用 `gemini-3.1-pro-preview`、`thinkingLevel: low`；不使用已驗出誤放的 Flash Lite 作正式預審。
- 固定 Google 官方 host，不接受自訂遠端 URL。
- 每案傳 2～18 張依 Sim／VFX 事件點自動挑選的非診斷關鍵格；一般技能最多 8 張，嚴格電影式／連段技能最多 18 張，同時間點去重。
- Owner `「對白」`、本機路徑、phase label 與 API key 不進 prompt／receipt。
- 缺 key、503、429、timeout、schema 錯誤全部降級為 `needs-human-review`，不阻斷確定性驗收。
- Gemini 可提供疑點或拒絕建議；任何正向 pass 強制降為 `needs-human-review`，直到有具人類標記的校準集證明誤放率可接受。
- SimWorld/event trace、framebuffer 安全閘與 Owner 人工批核仍是正式驗收來源。

## 可重複量測

`pnpm vfx:review:benchmark` 會對相同人工標註案例預設重跑三次，輸出 availability、labelled accuracy、false accept、false reject、p50/p95 latency 與 token。第一次 provider 失敗即停止，避免 429/503 重試風暴。沒有 `GEMINI_API_KEY` 時仍輸出 unavailable 收據並以 0 結束。filled key 只存在 Git 忽略的本機環境檔，report、prompt、cache key 與 console 都不會保存或輸出它。

# 完整英雄生成訓練：資料凍結與完整序列 GPU 預檢

2026-09-09。本報告不是生成品質或上場認證。

**最新入口：** [兩批 74 名凍結資料](hero74-training-v2/README.md)（500 train／119 internal dev）與 [完整長度記憶體修正進度](HERO74_MEMORY_PROGRESS.md)。以下 124／110 筆資料、舊 exclusion 與 v2–v7 失敗描述均保留為歷史，不得當作現行訓練選樣或最新探針狀態。

## 追加：目錄無損壓縮與 Metal 記憶體路徑修正

`frozen-factorized/` 用完全相同後綴集合做 Cartesian factoring，並逐筆展開比對原目錄：124 筆需求／契約／答案／分組不變，全部 2,146 個 public catalog／icon IDs 與 34 個 uploaded model metadata 不變，不加入不存在的副檔名或技能槽。train 完整 tokens 降至 2,368,283（答案仍 83,711），dev 304,204；最長由 29,957 降至 25,909。

新預檢依四種格式事先選取最大輸入與最大答案的既有 train 樣本，不使用 dev 梯度：native-content（11 train／2 dev）、native-slot（76／12）、hero-plan（1／0）、hero-slot（22／0）。單輪估算為各格式實測最慢 gradient ×（train 數＋2×dev 數），加總後乘 1.5、再加 300 秒；這是准入估算而非時間保證，所有原有硬保護不變。

這個僅壓縮目錄的 v3 probe 仍然失敗：96.333 秒後 supervisor 偵測到 `SWAP_GROWTH`，最後監測增量 2.966 GiB（2 秒取樣可超越 2 GiB 門檻才停止），最低可用 RAM 18.26 GiB；接電與電池 100% 維持。沒有完成第一個全英雄 gradient，沒有 optimizer 更新。worker／supervisor 已確認不存在，鎖已釋放。完整證據在 `probe-factorized/`；`worker.py.txt` 重建後 SHA-256 與實際執行的 worker hash 完全相等。

確定環境是 MLX 0.32.2、mlx-vlm 0.6.17。MLX 同版本 Metal SDPA 在 training trace 預設選 unfused；其 Metal VJP 也固定 fallback（非融合），forward fallback 會顯式計算 Q×Kᵀ。[Metal SDPA 固定版本](https://github.com/ml-explore/mlx/blob/v0.32.2/mlx/backend/metal/scaled_dot_product_attention.cpp#L670)、[fallback 固定版本](https://github.com/ml-explore/mlx/blob/v0.32.2/mlx/fast.cpp#L766)。本模型最後兩層為 sliding/full attention，head dim 256／512、16 query heads。25,908 個輸入 token 的單個 float32 scores 理論體積約 40.008 GiB；這是形狀計算，不是假裝量到的 peak Metal。不能只用模型權重大小估完整序列訓練 RAM。

因此停止用目錄縮短反覆碰運氣，改為 `hero-distillation-memory.py` 的受限文字訓練路徑：query 分塊、完整因果／1024 滑動視窗不變、反向逐塊調用 MLX 自己的 VJP，K/V 梯度以 float32 累加；frozen vocabulary head 的 CE 也逐塊計算與重算梯度。全部來源與答案 token 保留，不更新 installed library、不改模型架構、不改資料答案。禁止把此 uncached/text-only 路徑套用到視覺、音訊、cache 或 attention sinks。

CPU primitive equivalence 3 項測試（含 5 組 attention 子案例）通過，float32 forward／Q/K/V／hidden-loss gradients 使用 2e-5 絕對容許差，涵蓋 GQA、非整除 block、長度 1、滑動視窗、256／512 head dimension 與最後一個答案 token。真實 12B control 另在新 manifest 事先固定 1,153 tokens，跨 256 query-block、128 CE-block 和 1024 滑動邊界；BF16 loss 差須 ≤0.02、每個 adapter tensor 梯度 relative L2 ≤0.02，非 bitwise 宣稱，不於看結果後放寬。該 control 通過才進完整序列預檢，目前不得據此宣稱單輪训练已完成。

以下保留首版完整上下文 probe 的歷史證據。

## 已完成與實際結果

首個完整序列 GPU 預檢在 120 秒 gradient-probe 單步上限停止，worker／supervisor 均已退出、全域鎖已釋放。沒有 optimizer update、没有產出新 adapter。保留完整失敗證據，不把 kernel control 或資料凍結當成已訓練。

- 資料來源：既有已採用英雄＋37 名社群教師，不增加英雄、不自行修英雄／引擎。108 份教師記錄形成 756 個完整英雄／單槽候選；同版本來源配對與原有三項排除後 358 個候選。
- 固定品質篩選：124 個可用任務＝14 完整英雄＋110 單槽；222 社群槽逐槽保留既有 review／compiled gameplay，22 槽保留，其餘保守隔離。隔離不等同全部證實引擎缺陷，單槽有問題不排除同英雄其他可靠槽。
- 更正追蹤：[37 名機制修正 #1132](https://github.com/adms/GGD/issues/1132)、[六例固定教師重現 #1133](https://github.com/adms/GGD/pull/1133)。取得已修正固定版本後再重驗；不把永久排除當修正完成。
- 完整英雄正例為 13 份 native＋1 份 community。依英雄／變身家族、名稱與六槽來源近重複分組：train 110 任務（12 完整＋98 槽、30 群），dev 14 任務（2 完整＋12 槽、2 群）。dev 為 godie-edem、godie-h02v；不以這個小 dev 宣稱泛化。
- 目前沒有新的近重複合併邊；未達門檻的最大四字元 Jaccard 為 0.0711253。這只是不跨群的確定性篩選，不是語意獨立證明。新盲測英雄尚未由使用者提供，沒有捏造或拿它調參。

## 冻結輸入與預檢成本

資料位於 `distillation-training-v1/frozen-grouped/`；原來 `frozen-final` 和 CPU-only v1 是歷史版本，不覆寫。包含全部可用目錄索引、輸出契約、152 模型／702 特效／21 投射物／48 狀態／71 英雄 ID、34 上傳模型、1152 圖示路徑。每個輸入收到相同全目錄，不依教師答案篩選候選。

| 指標 | 實測 |
| --- | ---: |
| train 完整序列總 tokens | 2,813,563 |
| train completion tokens | 83,711 |
| dev 完整序列總 tokens | 360,876 |
| 最長實際序列 | 29,957 |
| 最長實際答案 | 4,799 |
| 最長樣本 | godie-h02k:HERO |

預檢執行 Gemma 4 12B IT 8-bit，revision `200bb6db075e137a4deb08838865ac4ddb86292e`。最後兩層 q/o LoRA，rank 8、scale 8、dropout 0；正式候選預設單輪 110 步、LR 2e-5、batch 1、固定最終 checkpoint，不挑 dev 最佳點。

損失只計 completion，但完整 prompt 保留 attention；只對 completion 的 hidden states 做 vocabulary projection。先以 64-token kernel control 比對完整 logits 路徑：loss 差 0、8 個 trainable tensor 的最大梯度差 0；此 control 不是截短的訓練樣本。其後真正運算 29,957-token 完整樣本，在單步限時停止。

完整 supervisor 歷時 131.011 秒（包含約 9 秒載入／前置檢查與關閉時間）。全程接電、電量 100%、swap 新增 0；最低可用記憶體 27.50 GiB。由於梯度尚未完成，沒有完整 loss／梯度／peak Metal／單輪耗時量測，不編造數值。配置仍為 Metal 28 GiB、可用 RAM 至少 6 GiB、swap 增量最多 2 GiB、電池下降 2 點停止、单步 120 秒、probe 1200 秒、單輪 7200 秒；未放寬任何保護。

固定證據：`distillation-training-v1/probe-full-context/` 的 manifest、token-preflight、kernel-equivalence、state、worker-progress。真正輸出目錄為 workspace `outputs/hero-forge-12b-restart-20260908/full-hero-distillation-v2/`。權重未改變，無需新 S3 權重上傳。

## 已驗證的程序保護

40 項 Node 測試通過（pairs 12、catalog 6、adapter 13、freeze 6、quality 3），10 項 Python CPU 測試通過（tokens 4、trainer guards 6）。涵蓋資料版本／來源 hash、只排受影響任務、全任務保留、近重複群組隔離、精確圖示前綴還原、權威欄位 materialization，以及斷電／記憶體／swap／電池、他人鎖、mkdir／spawn 失敗、禁止覆寫與 failed probe 不得開訓。

## 下一步：處理實測瓶頸，不重跑相同設定

對最長樣本拆分 CPU token 成本：需求 1325、輸出契約 633、能力索引 3336、素材索引 19773。素材中圖示 8784、上傳模型 3495、public asset IDs 7421（其中 VFX 5932）；各部分分開 tokenize，不假稱相加恰等於 chat 序列。

先用精確集合因式分解消除重複目錄字串，保留所有合法素材 ID 與完整教師答案，不裁來源、不削六槽、不增加資料、不放寬算力限制。再按實际輸出格式量完整長度的代表上限，依樣本數估單輪，而不是拿最長完整英雄乘全部單槽。這是成本預檢修正，不是超參數 sweep；仍需新固定輸入版本及同一套 A/B 流程。完整模型訓練、推論及可上場驗證尚未完成，目標維持 active。

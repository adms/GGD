# 原作語音上架收尾計畫（2026-09-15 暫緩，待排時間執行）

票：#1252 · 分支：`feat/owner-0915-models-voices` · 審核頁：https://claude.ai/code/artifact/265a762b-a576-46b2-ac33-ff2a9aa9f2a2

## owner 原話（2026-09-15，逐字）

> 原作語音上架審核 我全部勾完了

> 你不要自己比 你做一頁 我幫你比較勾選就好 不要浪費 token

> 你自己可以用 whisper 本地端測試超過 1秒以上的語音是否為中文 就不要上架

> 我已經全部判斷完了

> 好了 請你全部整理告一個段落 讓 main 合併上架

> 你可以先暫緩 先寫個 plan 我們找時間再執行

> whisper 判斷中文還需兩三分鐘 => 請你停掉 下次在座

> 你可以先把計畫寫好 commit + push

以下沒有引言格式的句子都是我（Claude）寫的整理與建議，⛔ 不是 owner 的需求。

---

## 一、已經做完的

| 項目 | 狀態 | 在哪裡 |
|---|---|---|
| owner 的審核決定 | 全部讀回（54 位） | 見「工作資料」 |
| 第二輪挑選 | 哥布林殺手三格都選 **齊勒斯（LoL）＋頭盔悶音**；莉娜三段都選 **切在第 3 個停頓** | `export0915/_picks` |
| 第二輪否決 | 小呆**已上線**原作 4 格標「不是小呆」：`attack-heavy`、`defeat.2`、`defeat.3`、`victory`；中文：承太郎 12 段、悟空 8 段、銀時 15 段 | `export0915/<pack>.vetoes` |
| whisper 判中文（>1 秒） | 2,497 段判完 2,472 段（**剩 25 段**，owner 叫停） | `lang/whisper-lang.jsonl` |
| 語音／音效入庫檢查腳本 | 本次提交 | `tools/audio-intake/audio_intake.py`、`packages/shared/src/ops/audioIntake.test.ts` |

**whisper 目前的結果**（2,472 段）：日文 2,037、英文 364、**中文 35**、韓文 17、其他 9。
- 中文候選 33 段：承太郎 10、銀時 15、悟空 8 —— ⭐ **全部都是 owner 在頁面上已經標成中文的**（機器與人工一致）。
- 中文**已上線**原作 2 段：
  - `b2-goblin/kill-1`（1.49 秒，無聲佔位檔被放大的雜音，本來就要換掉）
  - `community-review-13-20260907/attack-light`（朝田詩乃，300 英雄 167，1.06 秒，p=0.64）
- ⚠️ 英文 364 段不在 owner 的規則裡（他只說中文不上），這一版不處理，只記下來。

**語音／音效檢查腳本量到的**（5,492 檔）：上架角色語音 **4,971 檔全部已是 128k／44.1kHz／mp3**，不必轉；不合格 134 檔 = WC3 的 WAV 132 檔（要改內容引用才能轉）＋ 192k 音效 2 檔（`zombie-bite`、`zombie-roar`，`--fix` 省約 22 KB）。守衛 vitest 2/2 綠（主 session 2026-09-15 20:12 跑過一次；突變由寫腳本的 lane 做過：上限改 64k ⇒ 紅）。

### 工作資料（⚠️ 在 `/private/tmp`，重開機會被清掉）

已打包上 S3 並讀回比對 SHA-256 一致：
`s3://ggd-390630837668-ap-east-2-an/voice-review-0915/review0915-state-20260915.tgz`
（53 MB，sha256 `db1b46c3be5ac381b03ee244a21999d578dddf4fb911621150468d41966b4aa1`）

內含：`plan2.json`（3,003 段候選）、`v1map.json`、`db-export2/`（頁面送出）、`db-export3/`（資料庫直讀的 42 位）、`final_decisions.py`、`lang_detect.py`、`round2.py`、`r2.json`（剪句切點、悶音候選）、`build_review2.py`、審核頁模板。
⛔ 不含音檔（候選音檔可從素材庫重建；審核頁音訊在 Artifact 資產裡）。

---

## 二、下次執行的步驟（照順序）

| # | 做什麼 | 指令／規則 |
|---:|---|---|
| 0 | 工作資料若被清掉就取回 | `aws s3 cp s3://…/review0915-state-20260915.tgz . --profile vibe-coding --region ap-east-2` → 解到 scratchpad `review0915/` |
| 1 | 補判剩下 25 段 | `/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python lang_detect.py`（MPS，可續跑，約 10 秒） |
| 2 | 算最終決定 | `python3 final_decisions.py` → `final.json`（每包：要上的段、否決、已上線要撤的格） |
| 3 | 產生對應表（`build_maps.py` 待寫） | → `tools/voice-gen/originals/<pack>.review0915.json`，規則見下 |
| 4 | 擴充 `import-original-direct.py` | 見下「匯入工具要補的四件」 |
| 5 | 套用 | `import-original-direct.py <對應表> --write --archive <outbox>`（被取代的檔先上 S3 `voice-archive/`，逐檔 SHA-256 讀回） |
| 6 | 撤下要撤的已上線原作 | 見「問題②」的做法 |
| 7 | 音效轉檔 | `python3 tools/audio-intake/audio_intake.py --fix` → 棘輪改 `sfx=132` → 改 `CREDITS.md` 與 `sfx/lab/MANIFEST.json` 裡「192k」的描述 |
| 8 | 產物 | `pnpm combat:build` → `pnpm assets:manifest`（⛔ 不跑 `skills:sync`；ggd-a0 的閘在跑時不跑） |
| 9 | 驗證（vitest ≤3 次） | `pnpm combat:check`、`pnpm assets:manifest:check`、`audioIntake.test.ts`、語音相關守衛 |
| 10 | 提交＋交接 | `git commit -F <訊息> --pathspec-from-file=<清單>` → push 分支 → 交 ggd-a0 合 main、上架 |

### 對應表的規則（第 3 步）

- 每格最多 **3 段**（那格原本就有的原作算在內），照審核頁的排序取；放不下的列表回報（審核頁寫給 owner 的規則）。
- **否決優先**：頁面標「不是本人／中文」、whisper 判中文（>1 秒）的段一律不上。
- **莉娜五段照 owner 指定的位置**（2026-09-15 原話見 #1252）：

  | 檔 | 放到 | 剪到 |
  |---|---|---|
  | `vc_zelda_win02（b847be9e34d5….wav）` | `quote`（名言） | 全段 |
  | `Vo_lina_attack_2.wav` | `skill-name.w`（W 炸彈陣） | 全段 |
  | `00-0011-46_voice_joke_1.ogg` | `skill-name.r` 額外句（R 神滅斬） | 4.62 秒（第 3 個停頓） |
  | `00-0004-46_voice_joke_2.ogg` | `skill-name.e` 額外句（E 龍破斬） | 5.68 秒（第 3 個停頓） |
  | `Vo_lina_sp5_2.wav` | `skill-name.ex` | 4.60 秒（第 3 個停頓） |

  ⚠️ `joke_1` 與 `sp5_2` 的停頓位置幾乎一模一樣（差 0.03 秒內），可能是同一段錄音 ⇒ R 和 EX 會播同一句。頁面上已提醒 owner，他仍選兩段都用。
- **哥布林殺手** `hurt`／`hurt-heavy`／`kill-1`：借 `lol-xerath` 同一格的原作，套頭盔悶音濾鏡 `highpass=f=110,lowpass=f=1900,aecho=0.8:0.6:5|11:0.35|0.22,volume=1.4`，**取代**現有的無聲佔位原作。
- **LoL 七位**保留原音量（不做 loudnorm），其他包照舊 `loudnorm=I=-16:TP=-1.5:LRA=11`。
- `tools/voice-gen/originals/godie-h020.mba-chara02.json`（莉娜 MBA 18 格直接對應）是審核頁之前的舊做法、**從沒套用過**，已被審核結果取代 ⇒ ⛔ 不套用、這次也沒提交。

### 匯入工具要補的四件（第 4 步）

1. `trimEnd`：剪到指定秒數（尾端 60 ms 淡出）。
2. `af`：額外濾鏡（哥布林悶音）。
3. `replaceOriginal`：允許取代「已經是原作」的格 —— ⛔ 必須帶 owner 原話（目前唯一的例子是哥布林殺手那三格雜音）。
4. `remove`＋**補號**：撤下原作後，同一類的 `cat`／`cat.2`／`cat.3` 不能留空號 —— `build-combat-lines.mjs` 會照順序重新編號寫進 status.json，但 `current` 讀的是原本那個檔 ⇒ 空號會讓 index-lines 的位元組閘紅。

---

## 三、發現的問題

**① 審核頁讀取會漏資料（我寫的頁面的缺陷）**
頁面同時開了約 300 條即時監聽，後面 42 位英雄的監聽沒接上，錯誤又被靜默吞掉 ⇒ 「送出給 Claude」的結果少了這 42 位，畫面上也把 owner 已經按過的決定顯示成「還沒決定」。資料庫本身沒掉（逐位直讀確認：例如索隆、犽宿都是「整位允許上架」）。
⇒ 下次再用這一頁之前先修：改成逐一讀取（不用即時監聽），讀取失敗要顯示在頁面上。

**② 撤下已上線原作沒有現成的退路**
這一版要撤的：小呆 4 格（不是小呆）＋ 朝田詩乃 `attack-light`（whisper 判中文）。（哥布林 `kill-1` 會被取代，不算撤。）
- 合成管線自己的包：撤掉後會退回「待合成」，要跑一次合成才有聲音。
- 51 位 daemon 包（小呆 `godie-n01c` 屬於這一類）：status.json 還記著原作的雜湊 ⇒ 要從 git 歷史把被原作取代之前的合成檔**和那一格的 status 紀錄**一起還原。

建議做法：一律從 git 歷史還原成原本的合成檔（依據 owner 2026-09-15「沒有原作語音還是可以用合成比什麼都沒有好」）；找不到合成檔的格才留空。

**③ 小呆「混進悟空」的根因還沒查**
owner 標「不是小呆」的 4 段全是**已經上線**的原作（候選 226 段裡沒有標）⇒ 下次先查這 4 格的來源資料夾、檔名、當初是哪一批匯入的。

**④ ✅ 已修（owner 2026-09-16「1 2 都作」）**
`.gitignore` 只忽略 `reference.wav`，而後台上傳參考音是寫進 `<hero>/reference/<檔名>`（`tools/voice-gen/src/serve.mjs` 的 `champDir` + `reference`）⇒ 會被 git 收進去。
⇒ 補上 `content/assets/audio/voices/lines/**/reference/`；`git check-ignore` 驗過：上傳路徑被忽略、出貨的 `quote.mp3` 沒有被誤傷。

**⑤ ✅ 已修（同上）：出貨音訊格式收成一個住處**
`packages/shared/src/content/audioAssetPolicy.ts` 是唯一住處（新增 `SFX_MIN_SECONDS = 0.02`，理由寫在該處註解）；
`tools/audio-intake/audio_intake.py` 新增 `--print-policy [--shell]` 把門檻印給別的語言讀；
`tools/voice-gen/engine.py` 與 `tools/audio-optimize/optimize.sh` 改成**讀**它，⛔ 兩邊都不再有 128k／44100 的字面值。
閘：`packages/shared/src/ops/audioPolicySingleHome.test.ts`（跑起來比對＋掃第二份字面值；突變驗過：把 `MP3_RATE = "44100"` 塞回 engine.py ⇒ 紅）。

---

## 四、坂田銀時 / J-Stars Victory —— ⛔ 先不做（owner 2026-09-16）

> 銀時的 J-Stars Victory 這個我們先不作

⇒ 銀時這一版**維持現狀**（18 格全部來自 300 英雄，其中 12 格原作、6 格合成，而合成的參考音也是從 300 英雄複製的）。
owner 2026-09-15 說過「不使用300英雄裡的中文語音」與「whisper 判中文就不要上架」⇒ **執行計畫時銀時那 15 段中文一律不上**，但**不另找替代來源**，直到 owner 說要做。

之後若要做，現況記在這裡免得重查：
- 檔在 LV99（192.168.0.127）`E:\Game\單機遊戲\模擬器\PSV\`，PS Vita 北美版 PCSE00595：`.7z` 1.76 GB、`.vpk` 1.52 GB。
- 分享已經開了（SMB share `Game`），我也掛得起來（唯讀），⛔ 但 **macOS 隱私權擋住這個 app 讀網路磁碟**（`ls` 回 Operation not permitted）⇒ 要 owner 在「系統設定 → 隱私權與安全性 → 檔案與檔案夾 → Claude」勾「網路卷宗」，或由 owner 把 `.vpk` 拷到本機。
- 還需要 owner 同意安裝兩個開源工具：`vgmstream`（遊戲音訊轉檔）、必要時 `PyCriCodecs`（拆 CRI 封包）。
- PS3 樣本的語音 cue 名是 `cv_<三碼角色ID><三碼編號>_jp` ⇒ 高機率可以照檔名分出銀時。同一款遊戲裡另有 12 位 GGD 英雄的原作語音（奇犽也在）。
- 明細：工作資料 `jstars/findings.json`。

---

## 五、名言缺口：owner 2026-09-17 的逐位裁決（待執行）

審查頁：https://claude.ai/code/artifact/2366abb7-9a96-494a-92d4-8b6ab8f90301 （決定寫 db `quotegap/choices/heroes/<id>`，送出寫 `quotegap/export/all`）

實況（照**執行期**解析，`resolveVoicePackId`）：出貨 130 位 · 有名言 116 · 有語音沒名言 12 · 完全沒聲音 2 · 靠變身共用本尊 10。

| 英雄 | owner 的裁決（逐字） | 要做什麼 |
|---|---|---|
| 全體變身型態 | 「變身都用本尊的就好」 | ⭐ 已經是現況（執行期借本尊的包），⛔ 不用動 |
| 其餘缺名言的 | 「若沒有第二順位是勝利 第三順位是嘲諷」「其他都可以用勝利宣言」 | 把該位的 `victory` 複製成 `quote`（沒有 victory 才用 `taunt`），跑 `combat:build` |
| 波吉 `b2-bojji` | 「波吉 不會講話 應該全部都沒語音才對」 | ⛔ **整包語音下架**：刪 `lines/b2-bojji/*.mp3` 與 status.json、`COMBAT_CASTING.json` 移進 `excluded` 並寫這句理由，重跑 `voice:index` |
| 如月電車 `b2-kisaragi` | 「勝利 跟 名言都是 https://www.youtube.com/shorts/Ih9ZTaDsznM」 | ⚠️ 本機沒有 yt-dlp ⇒ 要 owner 同意安裝，或由 owner 給音檔；抓到後 victory 與 quote 都用它 |
| 米瑟利 `b2-misery` | 「米瑟利 是性感大姊姊聲音 你生成錯了」 | 重配音：`COMBAT_CASTING.json` 換 voiceClass／參考音（要一段大姊姊聲的參考），整包重合成 |
| 白木卡迪那 `godie-e00s` | 「可以借用 Berserker」 | 借 `godie-hapm` 的包。⚠️ 現行借用機制**只認變身對**（`voiceFormSharing`）⇒ 要加一張「指定借用」表（owner 指定，⛔ 不是名字猜的），或替它登記一對 |
| 傑富力士 `godie-ucrl` | 「JUMP大亂鬥系列應該有」 | ⭐ 找到了：JUMP FORCE 的 Gon 共 250 段（本機 `GGD-Asset-Library`，含 25 段劇情語音）。頁面放了最長的 18 段給 owner 挑名言；整包對應要再派一輪 lane |

⛔ 這一節只是把裁決寫下來，⛔ 還沒有套用到任何語音檔。

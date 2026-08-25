# 新英雄上架 SOP — task #214

> 這份清單是從 **實際開放 godie-efur（揍敵客桀諾 #13）與 godie-hblm（賈修貝爾 #05）所需要的每一個檔案** 反推出來的，
> 不是憑空設計的理想流程。每一列都寫「改哪個檔」「為什麼」「漏了會怎樣」。
>
> 機器版在 `tools/hero-onboarding/audit_hero.py`：
> ```
> python3 tools/hero-onboarding/audit_hero.py godie-xxxx      # 稽核一隻
> python3 tools/hero-onboarding/audit_hero.py --all-starter   # 稽核整個首發名單
> ```
> 有任何 FAIL 就 exit 1，可以直接當上架 gate。

---

## 0. 為什麼需要這份 SOP（#212 的教訓）

`#212` 原本被記成「揍敵客已開放、賈修待辦」。實際去看程式碼：**兩隻都沒開**。

`4114a25` 只改了 efur 的 4 個技能名字並重建索引。內容層看起來完全就緒 —
champion 文件在、六支技能在、`_index` 有註冊、EX 對照有、日文名字有、語音包有 —
所以任何用眼睛檢查的人都會勾完打勾。但真正決定「champ-select 裡點得到」的兩道閘，
一道都沒過：

| 閘 | 檔案 | 版控？ | 效果 |
| --- | --- | --- | --- |
| 首發開放名單 | `apps/platform/internal/curation/starter.go` `starterChampions` | ✅ 版控 | 新安裝 seed 的名單；所有測試（castability sweep、telegraph coverage、game-server whitelist）都從這裡解析 |
| 營運白名單 | `data/curation/whitelist.json` | ❌ gitignore | **正在跑的那台機器**唯一會讀的東西 |

**「在 `content/champions/_index.json` / `content/abilities/_index.json` 裡」不等於開放。**
那兩份 index 是整棵內容樹的 hash manifest（英雄數／技能數以 `_index.json` 實數為準，
`pnpm content:build` 產生的），它不 gate 任何東西。

這就是為什麼下面第 12–16 列存在，也是為什麼這份 SOP 附了一支腳本 —
純文字清單會被用完全一樣的方式讀過去、勾過去。

---

## 1. 清單（16 列）

### 內容層 — 「這隻英雄存在」

| # | 做什麼 | 檔案 | 漏了會怎樣 |
| --- | --- | --- | --- |
| 1 | champion 文件 | `content/champions/<id>.json`（`schema: champion@1`） | 載入器直接找不到英雄 |
| 2 | 六支技能文件 | `content/abilities/<id>.{passive,q,w,e,r,ex}.json` | 缺 `.ex` = 熱鍵 F 是死的（白名單唯一真的 gate 的技能） |
| 3 | **mirror 同步** | champion 文件內嵌的 `abilities.Q/W/E/R` 必須等於各自的 standalone 文件（只差一個 `schema` key） | 兩份數值各說各話；`abilityMirror` 測試變紅 |
| 4 | 重建索引 | `pnpm content:build` → `_index.json` ×2 + `bundle.json` + `manifest.json` | `shippedBundleIsCurrent.test.ts` 變紅（`bundle.test.ts` 刻意在 temp 樹重建，抓不到出貨那一份過期）|
| 5 | 英雄編號規約（#11） | 六支技能共用同一個 2–3 位編號，尾碼恰好是 `{00,01,02,03,04,002}` | `TestStarterSetMatchesContentTree` R2 變紅 |

> **編號規約的細節**：規則是「同一個英雄編號 + 尾碼集合」，**不是**「Q 一定是 01」。
> w3x 原本的技能順序被忠實保留，所以賈修 Q=`05-01` 而 Saber Q=`20-02`，兩個都對。

### 資產層 — 「這隻英雄看得到、聽得到」

| # | 做什麼 | 檔案 | 備註 |
| --- | --- | --- | --- |
| 6 | 日文名字普查 | `tools/tts-gen/src/build-champ-names.mjs` 加一列 → 產生 `voices/names/<id>{.mp3,.name.mp3,.title.mp3}` + `MANIFEST.json` | 選角確認時唸全名（#35/#120）。若 `withTitle` 總數變了，同步 `championNamesJa.test.ts` |
| 7 | 名言 | `build-champ-quotes.mjs` 加一列 → `voices/quotes/<id>.mp3` | 選角面板顯示＋確認時唸 |
| 8 | EX rawcode 對照 | `tools/w3x-import/out/GoDieEX22s/EX_MAP.json` `heroes.<id>.exAbility` 非空，且**不在** `withoutEx` | `ex-skills.test.ts` 要求兩份名單剛好切分 godie 全體 |
| 9 | 戰鬥語音包 | `content/assets/audio/voices/lines/<id>/`（CosyVoice 46 clips + `status.json`）＋ `lines/ROSTER.json` 一列 | 受傷/施法/死亡語音 |
| 10 | 點擊語音 | `content/config/champion-voices.json` 一筆 `{select, source, soundset}` | 見下方警語 |
| 11 | 圖示（advisory） | `assets/icons/champions/<id>.{png,webp}` + `assets/icons/abilities/<id>.<slot>.webp` | starter.go 刻意**不**用圖示當閘（stock-art 英雄本來就沒有）；缺的算 #72/#178 的債 |

> **第 10 列有一個機器抓不到的坑，必須人工看。**
> 腳本能檢查「這個 clip 有沒有跟名單內另一隻英雄共用」，但檢查不了
> **「這句台詞到底是不是這個角色講的」**。
> `#40` 把 `87joke`（飛影「不要小看邪眼的力量！」）暫存在 `godie-efur` 上。
> efur 沒開放時沒人聽得到；`#212` 一開放，**點揍敵客桀諾就會講飛影的台詞**。
> 本次已改掛回飛影本人 `godie-u010`。
> 上架前請實際點一次自己的英雄聽聽看。

### 啟用層 — 「這隻英雄真的選得到」（#212 漏掉的整段）

| # | 做什麼 | 檔案 | 漏了會怎樣 |
| --- | --- | --- | --- |
| 12 | 加進**首發開放名單** | `apps/platform/internal/curation/starter.go` `starterChampions`，**照字母序**插入，一行一個 id + `// 顯示名 - 稱號 #編號` 註解 | 這是「開放」本身。註解格式不能亂改：`packages/shared/testkit/starterRoster.ts` 和 `apps/game-server/src/curation/whitelist.test.ts` 都在正則解析這個區塊。`starterAbilities` 是**衍生**的（`buildStarterAbilities`），所以 10 支技能含 `.ex` 會自動跟上，不用另外加 |
| 13 | 同步 Go 釘死名單 | `starter_content_test.go` 的 `firstOpenRoster` 字面值 + `require.Len(..., N)` | `TestFirstOpenRoster` 變紅（它就是為了讓這個改動必須是刻意的） |
| 14 | 營運白名單（advisory，**但少不得**） | `data/curation/whitelist.json`：`champions` 加 id **且** `abilities` 加 `<id>.ex` | gitignore 的機器狀態。`ApplyStarterSet` 在白名單非空時**不會**再跑，所以只改 starter.go **不會**讓擁有者的機器或 ggd.adms.ai 開放這隻英雄 — 要走後台「內容白名單」手動加開，或 #179 的營運狀態遷移包 |
| 15 | 棘輪可施放掃描 | `packages/shared/src/sim/castabilitySweep.test.ts`：`ROSTER_SIZE` 加、`WORKING_CELL_FLOOR` 依**實測值**上調 | 下限只能往上，永遠不能為了讓 run 變綠而往下調。跑完看 `docs/_castability-128.md` 的實際數字再填，不要用猜的 |
| 16 | ~~商店目錄~~ **這一步 2026-07-30 起不存在了** | — | owner:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」。`content/config/store.json` 的 53 筆 `championPrices` map 已被 `championUnlockCost`（統一價）+ `freeChampionIds`（免費名單）取代，商店目錄改由 `content/champions/_index.json` 決定。**只要英雄的 content doc 存在，他就自動是統一價**，不用也不能再補一列 —— 這一步正是為了消滅「漏補一列 = 免費送出去」（godie-e00s / godie-ucrl 就是這樣中的）。真的要讓某隻免費，才去後台「商店經濟」把它加進免費名單 |

### 驗收指令

```bash
pnpm content:build
python3 tools/hero-onboarding/audit_hero.py <id>          # 16 列全 PASS
cd apps/platform && go test ./internal/curation/...        # TestFirstOpenRoster / MatchesContentTree / ChampionIdentityRule
pnpm --filter @ggd/shared     test                         # bundle / abilityMirror / championNamesJa / ex-skills / castabilitySweep
pnpm --filter @ggd/game-server test                        # whitelist / curationVsContentModel
pnpm --filter @ggd/client     test                         # telegraphCoverage
```

---

## 2. 稽核結果 — 對 godie-hblm 與 godie-efur 逐列跑一次

這份 SOP 的可信度，取決於它能不能抓出**它自己是從哪兩隻英雄推導出來的**那兩隻的漏洞。
下面是本次改動**之前**的稽核結果。

| # | 列 | godie-hblm 賈修貝爾 | godie-efur 揍敵客桀諾 |
| --- | --- | --- | --- |
| 1 | champion 文件 | ✅ | ✅ |
| 2 | 六支技能文件 | ✅ | ✅ |
| 3 | mirror 同步 | ✅ | ✅ |
| 4 | `_index` 註冊 | ✅ | ✅ |
| 5 | 英雄編號規約 | ✅ `05` | ✅ `13` |
| 6 | 日文名字普查 | ✅ | ✅ |
| 7 | 名言 | ✅ | ✅ |
| 8 | EX 對照 | ✅ `A0LE` | ✅ `A10S` |
| 9 | 戰鬥語音包 | ✅ 46 clips | ✅ 46 clips |
| 10 | 點擊語音 | ⚠️ `source:"none"` + Blizzard soundset 提示（DEV-only 疊層），production 點下去是靜音 → 落到語音階梯第 2 階自己的語音包 | ❌ **綁到 `87joke` = 飛影的台詞** |
| 11 | 圖示 | ✅（`.png`，合法；無 `.method` 出處旁註，純美觀） | ✅ |
| 12 | **首發開放名單** | ❌ **不在 starter.go** | ❌ **不在 starter.go**（`#212` 宣稱已開放，實際沒有） |
| 13 | Go 釘死名單 | ❌ | ❌ |
| 14 | 營運白名單 | ❌ 不在（該檔只有 48 首發 + `godie-zombiex`） | ❌ 不在 |
| 15 | 可施放掃描 | ❌ 從未被掃過（掃描名單來自 starter.go） | ❌ 從未被掃過 |
| 16 | 商店目錄（**該稽核當下的狀態**；此步驟已於 2026-07-30 隨統一價廢除） | ❌ 不在 `championPrices`（48 筆 = 首發名單）→ 無法設「喜愛」 | ❌ 不在 |

**結論：兩隻英雄的狀態完全一樣 —— 1–11 全過、12–16 全掛。**
`#212` 把它們記成「一隻做完、一隻待辦」，是因為只有內容層被檢查過。

### 修正後（本次改動）

| # | godie-hblm | godie-efur |
| --- | --- | --- |
| 10 | ✅ 維持 `source:"none"`，落到自己的 46-clip 語音包 | ✅ `87joke` 改掛回飛影 `godie-u010`；efur 落到自己的語音包 |
| 12 / 13 | ✅ 加入 starter.go（第 50 位）＋ 釘死名單 | ✅ 加入 starter.go（第 49 位）＋ 釘死名單 |
| 14 | ⚠️ 版控端無此檔；**部署主機仍需人工在後台「內容白名單」加開 champion + `<id>.ex`** | ⚠️ 同左 |
| 15 | ✅ 6/6 格全部 ✅ | ✅ 6/6 格全部 ✅ |
| 16 | ✅ 300 水晶 | ✅ 300 水晶 |

可施放棘輪：**287/288（48 隻）→ 299/300（50 隻）**。
新增的 12 格全部實測會噴效果，所以下限就照實測往上調 12，沒有預估成分。

---

## 3. 順手跑出來的既有債（不是本次造成的）

`--all-starter` 掃完 50 隻，除了上面兩隻以外還有 4 個 FAIL。都是**既有**問題，各自有主：

| 英雄 | 列 | 內容 |
| --- | --- | --- |
| `godie-ogld` 黑人牙膏 #72 | 2 / 4 / 5 | **缺 `passive` 技能文件**，所以也沒進 `_index`、編號集合湊不齊 |
| `godie-e00r` 初號機 #59 | 5 | 六支技能的編號尾碼不是 `{00,01,02,03,04,002}` |
| `godie-u00h` 鬼畜狂刀KYO #39 | 5 | EX 的名字前綴解析不出來 |
| `godie-u00n` 魯夫 #76 | 15 | R 那格是掃描報告裡唯一的 ❌ — 見下 |

**`godie-u00n.r` 的 ❌ 已經找到根因，而且是量測器的問題不是技能的問題。**
`godie-u00n.r` / `godie-u00o.r` 的 `castTimeSec` 是 0.9，`abilitySystem.ts` 在
`round(0.9 × 30) = 第 27 tick` 結算；掃描器施放後只步進 `WINDOW = 26` tick，
剛好**早一格收手**，所以記成「接受了但量不到效果」。
（原本註解寫「最長前搖 0.6s=18 tick」是錯的，已更正。）
把 `WINDOW` 調到 ~34 很可能讓這格變綠、下限進到 300/300 —— 但那是改變**量測定義**，
歸 #128／#198（非決定性獵殺）一起處理，本次刻意不動。

---

## 4. 上架前最後三件事

1. **部署主機的白名單**：只改 starter.go 不會讓 ggd.adms.ai 開放新英雄。
   走後台「內容白名單」加開 champion + `<id>.ex`，或用 #179 的營運狀態遷移包。
2. **雙胞胎檢查**：同一個英雄編號只能有一隻進名單。
   賈修貝爾（`godie-hblm`）和阿強一號（`godie-h021`）同為 `05`，
   所以**開了賈修就不能再開阿強一號**，否則 `TestStarterSetMatchesContentTree` 的
   R4（same-character）會擋下來。
3. **實際點一次**：聽自己英雄的點擊語音、按過 Q/W/E/R/EX。
   掃描器只保證「有可量測的效果」，保證不了「效果是對的角色、對的特效」。

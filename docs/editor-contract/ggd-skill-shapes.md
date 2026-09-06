# 全技能形狀掃描 —— 群 → 支數 → 有沒有模板 → 建議

> ⛔ **這一份是產生的**（`tools/skill-templates/scan_shapes.py`）。手改會被下一次掃描寫回去。
> 重生成：`python3 tools/skill-templates/scan_shapes.py --out docs/editor-contract/ggd-skill-shapes.md`
> 知識住在 `tools/skill-templates/shape_axes.json`（實作側）與 `prose_markers.json`（宣稱側）。
> ⚠️ 刻意沒有產生日期 —— 帶時鐘的欄位會逼 `--check` 從逐位元組比對被放寬成模糊比對，
> 而一條被放寬的閘等於沒有閘。

## 這一份在編輯器契約裡回答哪一題

| 契約文件 | 回答 |
|---|---|
| `ggd-runtime-capabilities.md` | 這個**名字**存不存在（effect kind / hook event 有沒有處理器） |
| `docs/技能標記機制與效果規則.md` | 它**怎麼用**（參數、上下界、範例） |
| ⭐ **這一份** | 一支技能的**形狀**是什麼，那個形狀**有沒有模板**，以及**還有幾支在等它** |

⇒ 外部編輯器要做一支新技能時，先在第 1 節找到它的形狀那一列：
有模板就沿用（`實測產出這個形狀的模板` 那一欄），沒有就看第 4 節那條軸擋住幾支。
⛔ 支數是**唯一的排序依據**（CLAUDE.md 第〇·五守則：按擋住的支數做機制，不是按技能順序做技能）。

owner 技能模板群組 **⑨** 逐字：

> 「以上範例技能模板請**重新掃描套用在全部技能**，檢查是否有**動畫效果等待、迴圈、持續特效**等機制，**形成新模板及套用設定**」

## 0. 一眼看完

| | |
|---|---:|
| 掃到的技能 | **421** |
| 不同的形狀（群） | **40** |
| 已經接上模板的技能 | **181**（42%） |
| ⛔ 還沒接模板的技能 | **240** |
| 模板文件總數 | **51** |
| ⛔ 一支技能都沒引用的模板 | **34** |

## 1. 形狀群 → 支數 → 有沒有模板 → 建議

⭐ 「形狀」＝六條軸的子集合。軸的定義與**每一格欄位為什麼算數**住在 `shape_axes.json`。

| # | 形狀（軸的組合） | 支數 | 已接模板 | 實測產出這個形狀的模板 | 建議 |
|---:|---|---:|---:|---|---|
| 1 | 持續 | **123** | 66 | tpl-buff-self・tpl-proxy-cast・tpl-transform | 沿用（57 支還沒接） |
| 2 | （無時序形狀） | **93** | 46 | tpl-blink・tpl-blink-strike・tpl-heal・tpl-instant-blast・tpl-single-strike | ⛔ 逐支確認是**真的沒有**還是**沒實作**（見第 2 節差集） |
| 3 | 續效特效 | **34** | 26 | tpl-apply-status・tpl-proxy-fanout・tpl-single-strike | 沿用（8 支還沒接） |
| 4 | 持續＋續效特效 | **24** | 6 | tpl-buff-self・tpl-instant-blast・tpl-proxy-cast・tpl-transform | 沿用（18 支還沒接） |
| 5 | 持續＋續效特效＋路徑 | **15** | 3 | tpl-buff-self・tpl-single-strike | 沿用（12 支還沒接） |
| 6 | 等待＋持續＋續效特效＋多段＋路徑 | **13** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-dragon-quake（另有 15 份較不貼合） |
| 7 | 路徑 | **12** | 7 | tpl-projectile-strike | 沿用（5 支還沒接） |
| 8 | 續效特效＋路徑 | **10** | 6 | tpl-projectile-strike・tpl-single-strike | 沿用（4 支還沒接） |
| 9 | 持續＋多段 | **9** | 3 | tpl-summon-agent | 沿用（6 支還沒接） |
| 10 | 迴圈＋持續 | **8** | 3 | tpl-periodic-field | 沿用（5 支還沒接） |
| 11 | 迴圈＋持續＋多段 | **7** | 5 | tpl-drain-leech | 沿用（2 支還沒接） |
| 12 | 持續＋路徑 | **6** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-leap-strike・tpl-mark-stacks・tpl-pull-throw |
| 13 | 等待＋路徑 | **6** | 1 | tpl-single-strike | 沿用（5 支還沒接） |
| 14 | 等待＋持續＋續效特效＋路徑 | **5** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-line-blast・tpl-locust-strike・tpl-locust-travel（另有 5 份較不貼合） |
| 15 | 等待＋迴圈＋持續＋多段＋路徑 | **5** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-lock-combo（另有 7 份較不貼合） |
| 16 | 持續＋續效特效＋多段＋路徑 | **4** | 1 | tpl-proxy-cast | 沿用（3 支還沒接） |
| 17 | 等待＋迴圈＋持續＋多段 | **4** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-growth-charge・tpl-random-barrage |
| 18 | 等待＋迴圈＋持續＋續效特效 | **4** | 2 | tpl-periodic-field | 沿用（2 支還沒接） |
| 19 | 等待＋續效特效 | **3** | 1 | tpl-single-strike | 沿用（2 支還沒接） |
| 20 | 等待＋迴圈＋多段＋路徑 | **3** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-lock-combo（另有 3 份較不貼合） |
| 21 | 迴圈＋持續＋多段＋路徑 | **3** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-lock-combo（另有 5 份較不貼合） |
| 22 | 多段＋路徑 | **2** | 2 | tpl-line-sweep・tpl-orbit-array | ✅ 全部接上了 |
| 23 | 等待＋多段＋路徑 | **2** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-charge-push・tpl-teleport |
| 24 | 等待＋持續＋路徑 | **2** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-charge-push・tpl-leap-strike・tpl-mark-stacks（另有 2 份較不貼合） |
| 25 | 等待＋迴圈 | **2** | 0 | — | 併進既有模板的參數 |
| 26 | 等待＋迴圈＋持續＋續效特效＋多段 | **2** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-combo-finisher（另有 2 份較不貼合） |
| 27 | 等待＋迴圈＋持續＋續效特效＋多段＋路徑 | **2** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-dragon-quake（另有 19 份較不貼合） |
| 28 | 等待＋迴圈＋續效特效 | **2** | 0 | — | 併進既有模板的參數 |
| 29 | 續效特效＋多段＋路徑 | **2** | 0 | — | 併進既有模板的參數 |
| 30 | 迴圈 | **2** | 0 | — | 併進既有模板的參數 |
| 31 | 迴圈＋多段 | **2** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-random-barrage |
| 32 | 迴圈＋持續＋續效特效＋路徑 | **2** | 2 | tpl-projectile-strike | ✅ 全部接上了 |
| 33 | 等待＋持續＋多段＋路徑 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-charge-push・tpl-leap-strike・tpl-mark-stacks（另有 2 份較不貼合） |
| 34 | 等待＋持續＋續效特效 | **1** | 0 | — | 併進既有模板的參數 |
| 35 | 等待＋續效特效＋多段＋路徑 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-beam-roll・tpl-dragon-serpent・tpl-locust-line（另有 8 份較不貼合） |
| 36 | 等待＋續效特效＋路徑 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-line-blast・tpl-locust-strike・tpl-locust-travel（另有 2 份較不貼合） |
| 37 | 等待＋迴圈＋多段 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-random-barrage |
| 38 | 迴圈＋多段＋路徑 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-lock-combo（另有 1 份較不貼合） |
| 39 | 迴圈＋持續＋續效特效＋多段 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-combo-finisher（另有 2 份較不貼合） |
| 40 | 迴圈＋續效特效＋多段＋路徑 | **1** | 1 | tpl-traveling-wave | ✅ 全部接上了 |

## 2. ⭐ 宣稱 vs 實作 —— 有幾支技能在等一個不存在的模板

**說明裡寫了、JSON 裡一格都沒有**的那幾支。宣稱側先剝掉整段 `「…」` 對白與 `{{…}}` 佔位
（第〇·六守則②，owner 2026-08-12：「「」代表角色施展技能的對白，不是真正的效果」）。

| 軸 | 說明宣稱 | JSON 實作 | ⛔ 宣稱了但沒實作 | 這一格擋住的是什麼 |
|---|---:|---:|---:|---|
| 等待 | 24 | 60 | **17** | 延遲結算／吟唱／飛行時間 —— 躲不躲得掉 |
| 迴圈 | 54 | 52 | **18** | 每隔 T 秒重複 —— 排程與終止條件 |
| 持續 | 145 | 241 | **26** | 有期間的狀態，到期自己收掉 |
| 續效特效 | 10 | 127 | **0** | 特效自己的壽命／掛載／分層（⚠️ 宣稱側很弱，差集不計） |
| 多段 | 9 | 66 | **6** | 一次施放拆成多下（連段／連鎖） |
| 路徑 | 42 | 99 | **17** | 效果沿著空間移動 |

⇒ ⭐ **最擋人的一條軸是「持續」，26 支技能的說明宣稱它而 JSON 裡沒有。**

⚠️ **前搖（`castTimeSec`）不在上表**：336/421 支有它，27 個相異值連續分布在 0.067–2.267 秒，中位數 0.833 秒。
它是**每一支技能都有的施法動作長度**（多半是 w3x 匯進來的），⛔ 不是作者寫下的機制 ——
算進「等待」軸的話這條軸會命中 421 支裡的 345 支，於是它分不出任何一群。

<details><summary>「等待」缺口逐支（17 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `godie-e002.e` | 20-03 約束與勝利之劍 | — | 持續＋續效特效＋路徑 |
| `godie-e007.r` | 12-04 龍氣爆發 | — | 迴圈＋多段 |
| `godie-e007.w` | 12-02 仙氣．採藥 | — | （無時序形狀） |
| `godie-e00l.e` | 20-03 約束與勝利之劍 | — | 持續＋續效特效＋路徑 |
| `godie-e00r.r` | 59-04 野戰型陽電子砲 | — | 續效特效＋路徑 |
| `godie-emfr.ex` | 15-002 敵彈吸收陣。太陰道 | — | 持續＋續效特效＋路徑 |
| `godie-emns.ex` | 44-002 交換筆記本 | — | （無時序形狀） |
| `godie-emns.q` | 44-01 死神之眼 | — | 持續 |
| `godie-ewar.r` | 12-04 龍氣爆發 | — | 迴圈＋多段 |
| `godie-ewar.w` | 12-02 仙氣．採藥 | — | （無時序形狀） |
| `godie-h01o.q` | 79-01 瞬步 | — | 續效特效＋路徑 |
| `godie-h02r.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-hapm.w` | 52-02 蹂躪編年史 | — | 持續＋路徑 |
| `godie-hgam.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-osam.ex` | 34-002 冥道殘月破 | tpl-instant-blast | 持續＋續效特效 |
| `godie-u034.ex` | 06-002 殺意 | — | （無時序形狀） |
| `godie-ucrl.ex` | 06-002 殺意 | — | （無時序形狀） |

</details>

<details><summary>「迴圈」缺口逐支（18 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `godie-e007.w` | 12-02 仙氣．採藥 | — | （無時序形狀） |
| `godie-etyr.ex` | 14-002 魔力激發 | — | （無時序形狀） |
| `godie-ewar.w` | 12-02 仙氣．採藥 | — | （無時序形狀） |
| `godie-h01o.ex` | 79-002 虛化 | — | 持續 |
| `godie-huth.passive` | 28-00 無限再生 | — | （無時序形狀） |
| `godie-o00l.q` | 53-01 獸王牙操彈 | tpl-projectile-strike | 路徑 |
| `godie-o030.w` | 30-02 酒精灌腸 | tpl-single-strike | 續效特效 |
| `godie-orkn.w` | 30-02 酒精灌腸 | tpl-single-strike | 續效特效 |
| `godie-osam.passive` | 34-00 靈魂吞噬 | tpl-buff-self | 持續 |
| `godie-u00k.passive` | 71-00 暗夜契約 | — | 持續＋續效特效 |
| `godie-u00n.passive` | 76-00 二檔 | tpl-transform | 持續 |
| `godie-u00o.passive` | 76-00 二檔 | tpl-buff-self | 持續 |
| `godie-u01u.passive` | 11-00 三刀流 | — | 持續 |
| `godie-u034.e` | 06-03 山形修煉-強 | — | （無時序形狀） |
| `godie-u034.ex` | 06-002 殺意 | — | （無時序形狀） |
| `godie-ucrl.e` | 06-03 山形修煉-強 | — | （無時序形狀） |
| `godie-ucrl.ex` | 06-002 殺意 | — | （無時序形狀） |
| `godie-udre.passive` | 11-00 三刀流 | — | 持續 |

</details>

<details><summary>「持續」缺口逐支（26 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `godie-e00w.ex` | 77-002 御雷劍 | — | （無時序形狀） |
| `godie-e00x.e` | 77-03 GLADIARIA ALAT | — | （無時序形狀） |
| `godie-efur.passive` | 13-00 念。攻防轉換 | — | 等待＋迴圈＋續效特效 |
| `godie-etyr.passive` | 14-00 召喚式神 | tpl-instant-blast | （無時序形狀） |
| `godie-h02r.w` | 90-02 麻痺粉 | tpl-apply-status | 續效特效 |
| `godie-h02v.ex` | 92-002 最終戈壁 | — | 等待＋迴圈＋多段 |
| `godie-hgam.w` | 90-02 麻痺粉 | tpl-apply-status | 續效特效 |
| `godie-n00p.e` | 18-03 妖狐變化 | tpl-single-strike | （無時序形狀） |
| `godie-n00p.q` | 18-01 風華圓舞陣 | tpl-single-strike | （無時序形狀） |
| `godie-n00p.r` | 18-04 億年樹 | — | 等待＋迴圈＋多段＋路徑 |
| `godie-n01c.q` | 08-01 雙龍紋 | tpl-heal | （無時序形狀） |
| `godie-nbbc.q` | 08-01 雙龍紋 | tpl-heal | （無時序形狀） |
| `godie-nsjs.q` | 18-01 風華圓舞陣 | tpl-single-strike | （無時序形狀） |
| `godie-nsjs.r` | 18-04 億年樹 | — | 等待＋迴圈＋多段＋路徑 |
| `godie-o00x.e` | 09-03 超級賽亞人 | — | （無時序形狀） |
| `godie-o02l.r` | 58-04 瘋狂皮卡丘 | tpl-single-strike | （無時序形狀） |
| `godie-o02p.r` | 99-04 世界第一的公主殿下 | — | 等待＋迴圈＋多段＋路徑 |
| `godie-o030.w` | 30-02 酒精灌腸 | tpl-single-strike | 續效特效 |
| `godie-ogld.e` | 72-03 超亮白 | tpl-single-strike | （無時序形狀） |
| `godie-ogld.ex` | 72-002 億萬衛星殞落 | — | 等待＋迴圈 |
| `godie-ogld.q` | 72-01洗刷刷 | tpl-single-strike | （無時序形狀） |
| `godie-orkn.w` | 30-02 酒精灌腸 | tpl-single-strike | 續效特效 |
| `godie-u00l.r` | 25-04 ChangeDNA | — | 續效特效 |
| `godie-u01u.e` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | tpl-single-strike | 續效特效 |
| `godie-ubal.r` | 37-04 魔界之王 | tpl-single-strike | （無時序形狀） |
| `godie-udre.e` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | tpl-single-strike | 續效特效 |

</details>

<details><summary>「多段」缺口逐支（6 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `godie-n003.r` | 42-04 世界終結 | — | 等待＋持續＋續效特效＋路徑 |
| `godie-n00p.passive` | 18-00 薔薇荊棘之刃 | — | 路徑 |
| `godie-n01g.r` | 42-04 世界終結 | — | 等待＋持續＋續效特效＋路徑 |
| `godie-nsjs.passive` | 18-00 薔薇荊棘之刃 | — | 路徑 |
| `godie-u00l.r` | 25-04 ChangeDNA | — | 續效特效 |
| `godie-umal.r` | 25-04 ChangeDNA | — | 持續＋續效特效 |

</details>

<details><summary>「路徑」缺口逐支（17 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `godie-e00w.e` | 77-03 GLADIARIA ALAT | — | 持續 |
| `godie-e00x.q` | 77-01 百烈櫻華斬 | — | 持續＋續效特效 |
| `godie-h020.passive` | 04-00 翔封界 | — | （無時序形狀） |
| `godie-h02r.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-hapm.passive` | 52-00 十二道試煉 | — | 持續 |
| `godie-hgam.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-hjai.passive` | 04-00 翔封界 | — | （無時序形狀） |
| `godie-hpb1.w` | 07-02 者、皆、陣 | — | 持續 |
| `godie-n01c.passive` | 08-00 龍紋記憶 | — | 持續＋續效特效 |
| `godie-nbbc.passive` | 08-00 龍紋記憶 | — | 持續＋續效特效 |
| `godie-o00k.e` | 86-03 神鳴 | tpl-instant-blast | （無時序形狀） |
| `godie-o00k.passive` | 86-00 裝可愛 | — | 持續＋續效特效 |
| `godie-u00h.w` | 39-02 無明神風流-朱雀 | tpl-instant-blast | （無時序形狀） |
| `godie-u00n.w` | 76-02 伸縮自如的橡膠火箭砲 | tpl-single-strike | 續效特效 |
| `godie-u00o.w` | 76-02 伸縮自如的橡膠火箭砲 | tpl-single-strike | 續效特效 |
| `godie-u010.q` | 38-01 邪王炎殺劍 | — | 持續 |
| `godie-uvng.q` | 38-01 邪王炎殺劍 | — | 持續 |

</details>

## 3. 模板覆蓋 —— 51 份文件，實際被引用的有幾份

`宣告形狀` = 這份模板的**參數槽**與 `requires` 加起來寫得出什麼（11 個 draft 一支技能都沒接，
實測形狀算不出來 —— 這一欄是它們唯一的聲音）。`實測形狀` = 引用它的技能真的落在哪一群。

| 模板 | 名稱 | 狀態 | 參數格 | 引用支數 | 宣告形狀 | 實測形狀 |
|---|---|---|---:|---:|---|---|
| `tpl-buff-self` | 變身強化-數值面 | enabled | 3 | 49 | 持續 | 持續×44・持續＋續效特效×3・持續＋續效特效＋路徑×2 |
| `tpl-single-strike` | 單體斬擊 | enabled | 4 | 44 | 續效特效 | 續效特效×20・（無時序形狀）×20・等待＋續效特效×1・持續＋續效特效＋路徑×1・續效特效＋路徑×1・等待＋路徑×1 |
| `tpl-instant-blast` | 瞬發點爆 | enabled | 4 | 14 | — | （無時序形狀）×13・持續＋續效特效×1 |
| `tpl-projectile-strike` | 投射物一發 | enabled | 7 | 14 | 迴圈＋持續＋續效特效＋路徑 | 路徑×7・續效特效＋路徑×5・迴圈＋持續＋續效特效＋路徑×2 |
| `tpl-proxy-cast` | 代理錨點施法 | enabled | 8 | 13 | 持續＋多段 | 持續×11・持續＋續效特效×1・持續＋續效特效＋多段＋路徑×1 |
| `tpl-transform` | 變身 | enabled | 6 | 12 | 持續＋續效特效 | 持續×11・持續＋續效特效×1 |
| `tpl-blink` | 純位移瞬移 | enabled | 1 | 7 | — | （無時序形狀）×7 |
| `tpl-apply-status` | 只上狀態 | enabled | 3 | 5 | 續效特效 | 續效特效×5 |
| `tpl-drain-leech` | 汲取吸附 | enabled | 8 | 5 | 迴圈＋持續＋多段 | 迴圈＋持續＋多段×5 |
| `tpl-heal` | 回血 | enabled | 4 | 5 | — | （無時序形狀）×5 |
| `tpl-periodic-field` | 週期領域 | enabled | 9 | 5 | 迴圈＋持續＋續效特效 | 迴圈＋持續×3・等待＋迴圈＋持續＋續效特效×2 |
| `tpl-summon-agent` | 召喚代理 | enabled | 12 | 3 | 持續＋多段 | 持續＋多段×3 |
| `tpl-blink-strike` | 瞬移突斬 | enabled | 6 | 1 | — | （無時序形狀）×1 |
| `tpl-line-sweep` | 直線分段掃擊 | enabled | 6 | 1 | 多段＋路徑 | 多段＋路徑×1 |
| `tpl-orbit-array` | 環形放射陣 | enabled | 7 | 1 | 迴圈＋多段＋路徑 | 多段＋路徑×1 |
| `tpl-proxy-fanout` | 範圍逐一施法 | enabled | 5 | 1 | 續效特效 | 續效特效×1 |
| `tpl-traveling-wave` | 行進波動 | enabled | 9 | 1 | 迴圈＋續效特效＋多段＋路徑 | 迴圈＋續效特效＋多段＋路徑×1 |
| `tpl-barrier-domain` | 結界領域 | draft | 0 | **0** | — | — |
| `tpl-beam-roll` | 翻滾光束（橫放光束砲） | enabled | 21 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-channel-beam` | 引導通魔 | draft | 0 | **0** | — | — |
| `tpl-charge-push` | 衝鋒推撞 | enabled | 11 | **0** | 等待＋路徑 | — |
| `tpl-combo-finisher` | 龍虎亂舞（自動連段→收尾重招） | enabled | 13 | **0** | 持續＋續效特效＋多段 | — |
| `tpl-data-no-trigger` | 無觸發（路由桶，不是機器） | draft | 0 | **0** | — | — |
| `tpl-death-mechanic` | 死亡機制 | draft | 0 | **0** | — | — |
| `tpl-dragon-quake` | 動地剁落點環 | enabled | 15 | **0** | 等待＋持續＋續效特效＋多段＋路徑 | — |
| `tpl-dragon-serpent` | 多實例龍形推進 | enabled | 17 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-dragon-shockwave` | 沿路衝擊波 | draft | 9 | **0** | 等待＋迴圈＋續效特效＋路徑 | — |
| `tpl-global-rule` | 全場規則 | draft | 0 | **0** | — | — |
| `tpl-ground-nova` | 原地震波 | enabled | 4 | **0** | — | — |
| `tpl-growth-charge` | 成長蓄能 | enabled | 9 | **0** | 迴圈＋持續 | — |
| `tpl-leap-strike` | 跳躍落地 | enabled | 8 | **0** | 持續＋路徑 | — |
| `tpl-life-manipulate` | 生命操作 | enabled | 4 | **0** | — | — |
| `tpl-line-blast` | 直線衝擊波（落點大爆炸） | enabled | 15 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-lock-combo` | 鎖定連段 | enabled | 10 | **0** | 迴圈＋多段＋路徑 | — |
| `tpl-locust-line` | 沿線 N 具（蝗蟲群·一次擺出整條線） | enabled | 11 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-orb` | 球體定點（蝗蟲群·不動的那一群） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-strike` | 定點打擊（蝗蟲群·擺在腳下的那一具） | enabled | 11 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-locust-swarm` | 推進多具（蝗蟲群·等分散開各自推進） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-travel` | 推進單具（蝗蟲群·一具沿面向推出去） | enabled | 11 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-mark-stacks` | 具名標記-層數與免死 | enabled | 20 | **0** | 持續＋路徑 | — |
| `tpl-on-attack` | 攻擊觸發 | enabled | 6 | **0** | — | — |
| `tpl-on-hit-react` | 受擊反應 | enabled | 5 | **0** | — | — |
| `tpl-pull-throw` | 拉扯投擲 | enabled | 12 | **0** | 持續＋路徑 | — |
| `tpl-pure-cosmetic` | 純演出物件資料 | draft | 0 | **0** | — | — |
| `tpl-radial-burst` | 圓周噴發（大冰塊） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-random-barrage` | 亂數彈幕轟炸 | enabled | 9 | **0** | 迴圈＋多段 | — |
| `tpl-range-gamble` | 距離博弈 | draft | 0 | **0** | — | — |
| `tpl-resource-ops` | 資源運營 | draft | 0 | **0** | — | — |
| `tpl-strip-transform` | 剝奪變化 | draft | 0 | **0** | — | — |
| `tpl-team-synergy` | 隊伍協同 | draft | 0 | **0** | — | — |
| `tpl-teleport` | 瞬移貼身 | enabled | 6 | **0** | 等待＋路徑 | — |

## 4. ⭐ 該做什麼 —— 按**擋住的支數**排序

CLAUDE.md 第〇·五守則：「⛔ **不要逐支實作。** 按**擋住的支數**做機制，不是按技能順序做技能。」
⇒ 這張表的排序就是那條規則：左邊擋得多的先做。

| 軸 | 擋住幾支 | 現成的模板 | 狀態 | 該做什麼 |
|---|---:|---|---|---|
| 持續 | **26** | `tpl-buff-self`・`tpl-drain-leech` | enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 26 支接上去（改內容，⛔ 不必動引擎） |
| 迴圈 | **18** | `tpl-drain-leech`・`tpl-periodic-field` | draft・enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 18 支接上去（改內容，⛔ 不必動引擎） |
| 等待 | **17** | `tpl-beam-roll`・`tpl-charge-push` | draft・enabled | ⚠️ **模板做好了卻 0 支使用** ⇒ 先驗一支，再把這 17 支接上去 |
| 路徑 | **17** | `tpl-line-sweep`・`tpl-orbit-array` | draft・enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 17 支接上去（改內容，⛔ 不必動引擎） |
| 多段 | **6** | `tpl-drain-leech`・`tpl-line-sweep` | enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 6 支接上去（改內容，⛔ 不必動引擎） |

⚠️ **另一個方向的浪費**：有 **22** 份模板參數面已經做好（≥5 格參數）卻**一支技能都沒引用** ——
　`tpl-beam-roll`(21格/enabled)・`tpl-charge-push`(11格/enabled)・`tpl-combo-finisher`(13格/enabled)・`tpl-dragon-quake`(15格/enabled)・`tpl-dragon-serpent`(17格/enabled)・`tpl-dragon-shockwave`(9格/draft)・`tpl-growth-charge`(9格/enabled)・`tpl-leap-strike`(8格/enabled)・`tpl-line-blast`(15格/enabled)・`tpl-lock-combo`(10格/enabled)・`tpl-locust-line`(11格/enabled)・`tpl-locust-orb`(12格/enabled)・`tpl-locust-strike`(11格/enabled)・`tpl-locust-swarm`(12格/enabled)・`tpl-locust-travel`(11格/enabled)・`tpl-mark-stacks`(20格/enabled)・`tpl-on-attack`(6格/enabled)・`tpl-on-hit-react`(5格/enabled)・`tpl-pull-throw`(12格/enabled)・`tpl-radial-burst`(12格/enabled)・`tpl-random-barrage`(9格/enabled)・`tpl-teleport`(6格/enabled)

⛔ 它們與上表是**同一個問題的兩半**：一邊有技能在等機制，一邊有機制在等技能。

## 5. 閘 —— 未分類欄位

✅ 出貨技能裡的**每一個**欄位名都在 `shape_axes.json` 裡有決定
（帶軸，或在 `ignored` 裡帶著一個能被反駁的理由）。

⇒ 引擎哪天多一個 `windUpSec` 而沒有人分類它，`--check` 會**紅**並指名它 ——
⛔ 不是安靜地把那一族技能算成「沒有等待」。


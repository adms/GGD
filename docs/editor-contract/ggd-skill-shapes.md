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
| 掃到的技能 | **907** |
| 不同的形狀（群） | **46** |
| 已經接上模板的技能 | **626**（69%） |
| ⛔ 還沒接模板的技能 | **281** |
| 模板文件總數 | **58** |
| ⛔ 一支技能都沒引用的模板 | **9** |

## 1. 形狀群 → 支數 → 有沒有模板 → 建議

⭐ 「形狀」＝六條軸的子集合。軸的定義與**每一格欄位為什麼算數**住在 `shape_axes.json`。

| # | 形狀（軸的組合） | 支數 | 已接模板 | 實測產出這個形狀的模板 | 建議 |
|---:|---|---:|---:|---|---|
| 1 | 持續＋續效特效 | **181** | 141 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8・hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.981b52af12fc60fb0494218d7db3d4c24f9fc57ecd93cf4b・hero-template.bdc30b4f4711cc9d5e3decf5c46c5956dd1456ff54ec6692・hero-template.c9ccb3b440c3024518be1a4ec531f04e61a6c134c3f55010・tpl-apply-status・tpl-buff-self・tpl-instant-blast・tpl-proxy-cast・tpl-single-strike・tpl-transform | 沿用（40 支還沒接） |
| 2 | 持續 | **150** | 101 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8・hero-template.bdc30b4f4711cc9d5e3decf5c46c5956dd1456ff54ec6692・hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77・tpl-buff-self・tpl-proxy-cast・tpl-single-strike・tpl-transform | 沿用（49 支還沒接） |
| 3 | （無時序形狀） | **126** | 81 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8・hero-template.16f23c69538e8c5a49c65df27bd650ec576288086a204b71・hero-template.976b12ed3cd5fd7dd9a18c993e399b1207c0a8b014e2ca68・hero-template.a0174c3324e732c421ab641d1e36cd2f49f758475f851ee4・hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77・tpl-area-strike・tpl-blink・tpl-blink-strike・tpl-heal・tpl-instant-blast・tpl-single-strike | ⛔ 逐支確認是**真的沒有**還是**沒實作**（見第 2 節差集） |
| 4 | 續效特效 | **119** | 67 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8・hero-template.5e32c7c7058f94bde709b5227a3055b220279f0e74f0eda6・hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・tpl-apply-status・tpl-area-strike・tpl-ground-nova・tpl-proxy-fanout・tpl-single-strike | 沿用（52 支還沒接） |
| 5 | 持續＋續效特效＋路徑 | **37** | 29 | hero-template.231f0dfefbb7bfcdc79c8bd7390d325dd53050127edd7cd6・hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.c908c89286a452169fdeb648106cf65dac155753e5cc6b52・tpl-buff-self・tpl-leap-strike・tpl-line-strike・tpl-pull-throw・tpl-single-strike | 沿用（8 支還沒接） |
| 6 | 續效特效＋路徑 | **37** | 35 | hero-template.4943347c4d1f7e52606a8e42024c3ca0fd53449f7b045f16・hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.895ceb9c437ad0cf6b74a583c7dcc6d6c978841f3076cb71・hero-template.8ad74d5c99ca88a9cf4b5ef5ae62dd670596b201d42e78b4・tpl-line-strike・tpl-projectile-strike・tpl-single-strike | 沿用（2 支還沒接） |
| 7 | 等待＋迴圈＋續效特效＋多段＋路徑 | **30** | 27 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・tpl-line-sweep・tpl-traveling-wave | 沿用（3 支還沒接） |
| 8 | 等待＋持續＋續效特效＋路徑 | **25** | 20 | hero-template.0e807c24299291d3e0b66bc67f569a749b0f1d3ce797209b・hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.ee4e26d179d0e2f6552c666a0b6354e588bb4a18cdc92368・tpl-charge-push・tpl-projectile-strike・tpl-teleport | 沿用（5 支還沒接） |
| 9 | 等待＋續效特效＋路徑 | **14** | 13 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550 | 沿用（1 支還沒接） |
| 10 | 等待＋持續＋續效特效＋多段＋路徑 | **13** | 5 | tpl-area-strike・tpl-instant-blast・tpl-single-strike | 沿用（8 支還沒接） |
| 11 | 路徑 | **12** | 7 | tpl-projectile-strike | 沿用（5 支還沒接） |
| 12 | 迴圈＋持續＋續效特效＋多段 | **12** | 12 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.eeb97623763a184bab0219a940b43f3db6560ce19bb58990・tpl-area-strike・tpl-random-barrage | ✅ 全部接上了 |
| 13 | 迴圈＋持續＋續效特效＋多段＋路徑 | **12** | 12 | hero-template.e4284bb72d791d2863042dd5fdcec2a19e0bf561c115771c・tpl-lock-combo | ✅ 全部接上了 |
| 14 | 迴圈＋持續＋多段 | **10** | 9 | hero-template.34fc1fc2579e395212180f244209347185c83466671e8b1d・hero-template.eeb97623763a184bab0219a940b43f3db6560ce19bb58990・tpl-area-strike・tpl-drain-leech | 沿用（1 支還沒接） |
| 15 | 持續＋多段 | **9** | 6 | tpl-area-strike・tpl-summon-agent | 沿用（3 支還沒接） |
| 16 | 迴圈＋續效特效＋多段 | **8** | 3 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550 | 沿用（5 支還沒接） |
| 17 | 迴圈＋持續 | **7** | 5 | tpl-periodic-field・tpl-single-strike | 沿用（2 支還沒接） |
| 18 | 持續＋續效特效＋多段 | **6** | 6 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・tpl-summon-agent | ✅ 全部接上了 |
| 19 | 持續＋路徑 | **6** | 2 | hero-template.c832024454c5bec84a56a76245785eca7d93c5dc2d37b7c8・hero-template.c908c89286a452169fdeb648106cf65dac155753e5cc6b52 | 沿用（4 支還沒接） |
| 20 | 等待＋路徑 | **6** | 1 | tpl-single-strike | 沿用（5 支還沒接） |
| 21 | 等待＋迴圈＋多段＋路徑 | **6** | 3 | hero-template.431130d91b0e5931e4733fe4bd0977b7fae69cbf48285699 | 沿用（3 支還沒接） |
| 22 | 等待＋迴圈＋持續＋多段 | **6** | 2 | hero-template.8d382489b905a2e77aac79e44ffaf19d847e9aa247a45806 | 沿用（4 支還沒接） |
| 23 | 等待＋迴圈＋持續＋多段＋路徑 | **6** | 1 | hero-template.8d382489b905a2e77aac79e44ffaf19d847e9aa247a45806 | 沿用（5 支還沒接） |
| 24 | 等待＋迴圈＋持續＋續效特效＋多段 | **6** | 4 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・hero-template.8d382489b905a2e77aac79e44ffaf19d847e9aa247a45806・tpl-periodic-field | 沿用（2 支還沒接） |
| 25 | 迴圈＋持續＋續效特效 | **6** | 4 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・tpl-single-strike | 沿用（2 支還沒接） |
| 26 | 持續＋續效特效＋多段＋路徑 | **5** | 4 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550・tpl-projectile-strike・tpl-proxy-cast | 沿用（1 支還沒接） |
| 27 | 迴圈＋持續＋多段＋路徑 | **5** | 2 | hero-template.e4284bb72d791d2863042dd5fdcec2a19e0bf561c115771c | 沿用（3 支還沒接） |
| 28 | 等待＋持續＋路徑 | **4** | 2 | hero-template.ee4e26d179d0e2f6552c666a0b6354e588bb4a18cdc92368 | 沿用（2 支還沒接） |
| 29 | 等待＋迴圈＋持續＋續效特效 | **4** | 2 | tpl-periodic-field | 沿用（2 支還沒接） |
| 30 | 等待＋迴圈＋持續＋續效特效＋多段＋路徑 | **4** | 2 | hero-template.8d382489b905a2e77aac79e44ffaf19d847e9aa247a45806 | 沿用（2 支還沒接） |
| 31 | 迴圈＋持續＋續效特效＋路徑 | **4** | 2 | tpl-projectile-strike | 沿用（2 支還沒接） |
| 32 | 多段＋路徑 | **3** | 3 | tpl-line-sweep・tpl-orbit-array | ✅ 全部接上了 |
| 33 | 等待＋持續＋續效特效 | **3** | 2 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550 | 沿用（1 支還沒接） |
| 34 | 等待＋續效特效 | **3** | 2 | tpl-area-strike・tpl-single-strike | 沿用（1 支還沒接） |
| 35 | 迴圈 | **3** | 1 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 沿用（2 支還沒接） |
| 36 | 等待＋多段＋路徑 | **2** | 1 | tpl-area-strike | 沿用（1 支還沒接） |
| 37 | 等待＋迴圈 | **2** | 0 | — | 併進既有模板的參數 |
| 38 | 等待＋迴圈＋續效特效 | **2** | 0 | — | 併進既有模板的參數 |
| 39 | 等待＋迴圈＋續效特效＋多段 | **2** | 2 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550 | ✅ 全部接上了 |
| 40 | 續效特效＋多段＋路徑 | **2** | 1 | tpl-heal | 沿用（1 支還沒接） |
| 41 | 迴圈＋多段 | **2** | 0 | — | 併進既有模板的參數 |
| 42 | 迴圈＋多段＋路徑 | **2** | 1 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8 | 沿用（1 支還沒接） |
| 43 | 迴圈＋續效特效＋多段＋路徑 | **2** | 2 | tpl-single-strike・tpl-traveling-wave | ✅ 全部接上了 |
| 44 | 等待＋持續＋多段＋路徑 | **1** | 0 | — | ⚠️ 模板已在、**0 支使用**：tpl-mark-stacks（另有 2 份較不貼合） |
| 45 | 等待＋續效特效＋多段＋路徑 | **1** | 1 | tpl-area-strike | ✅ 全部接上了 |
| 46 | 等待＋迴圈＋多段 | **1** | 0 | — | 併進既有模板的參數 |

## 2. ⭐ 宣稱 vs 實作 —— 有幾支技能在等一個不存在的模板

**說明裡寫了、JSON 裡一格都沒有**的那幾支。宣稱側先剝掉整段 `「…」` 對白與 `{{…}}` 佔位
（第〇·六守則②，owner 2026-08-12：「「」代表角色施展技能的對白，不是真正的效果」）。

| 軸 | 說明宣稱 | JSON 實作 | ⛔ 宣稱了但沒實作 | 這一格擋住的是什麼 |
|---|---:|---:|---:|---|
| 等待 | 42 | 141 | **24** | 延遲結算／吟唱／飛行時間 —— 躲不躲得掉 |
| 迴圈 | 110 | 142 | **50** | 每隔 T 秒重複 —— 排程與終止條件 |
| 持續 | 169 | 522 | **26** | 有期間的狀態，到期自己收掉 |
| 續效特效 | 22 | 538 | **0** | 特效自己的壽命／掛載／分層（⚠️ 宣稱側很弱，差集不計） |
| 多段 | 18 | 156 | **8** | 一次施放拆成多下（連段／連鎖） |
| 路徑 | 126 | 239 | **35** | 效果沿著空間移動 |

⇒ ⭐ **最擋人的一條軸是「迴圈」，50 支技能的說明宣稱它而 JSON 裡沒有。**

⚠️ **前搖（`castTimeSec`）不在上表**：741/907 支有它，41 個相異值連續分布在 0.067–3.367 秒，中位數 0.667 秒。
它是**每一支技能都有的施法動作長度**（多半是 w3x 匯進來的），⛔ 不是作者寫下的機制 ——
算進「等待」軸的話這條軸會命中 907 支裡的 750 支，於是它分不出任何一群。

<details><summary>「等待」缺口逐支（24 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `community-review-08-20260907.r` | 雷槍 | tpl-random-barrage | 迴圈＋持續＋續效特效＋多段 |
| `community-review-17-20260907.r` | 墜落天空 | tpl-ground-nova | 續效特效 |
| `community-review-24-20260907.q` | 落雷 | tpl-ground-nova | 續效特效 |
| `community-review-32-20260907.r` | THE END OF SON | tpl-single-strike | 續效特效 |
| `community-review-33-20260907.passive` | 〔不死者再生〕 | — | 持續＋續效特效 |
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
| `lol-karthus.q` | 暮點 | hero-template.976b12ed3cd5fd7dd9a18c993e399b1207c0a8b014e2ca68 | （無時序形狀） |
| `lol-karthus.r` | 暮鐘終曲 | hero-template.976b12ed3cd5fd7dd9a18c993e399b1207c0a8b014e2ca68 | （無時序形狀） |

</details>

<details><summary>「迴圈」缺口逐支（50 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `b2-aladdin.passive` | 吹錯音先喘口氣 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-albus.passive` | 速通途中順便回血 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-bojji.passive` | 你揮空我就安心了 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-elma.passive` | 物理疼痛換攻略魔力 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-goblin.passive` | 工安控制換安全帽 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-guts.passive` | 工傷先別打卡 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-haga.passive` | 重現工單才可報魔力 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-kaede.passive` | 劍上又跳出更新通知 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-keyaru.passive` | 病歷影印需要工本費 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-kisaragi.passive` | 列車延誤請攻擊客服 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-klaus.e` | 更改辦公室位置 | hero-template.8ad74d5c99ca88a9cf4b5ef5ae62dd670596b201d42e78b4 | 續效特效＋路徑 |
| `b2-luckyman.passive` | 剛好撿到零錢 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-maple.passive` | 客服固定金額回禮 | hero-template.a0174c3324e732c421ab641d1e36cd2f49f758475f851ee4 | （無時序形狀） |
| `b2-misery.passive` | 異界店主不包售後 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-naofumi.passive` | 隊友受傷我先回魔 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-ned.passive` | 我真的是劍士不是坐騎 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-noor.passive` | 反彈成功才發收據 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-nube.passive` | 班導還不能下班 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-orphen.passive` | 催收電話無須長談 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-popp.passive` | 撤退路線也是回魔路線 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-rem.passive` | 負評客人我來回覆 | hero-template.a0174c3324e732c421ab641d1e36cd2f49f758475f851ee4 | （無時序形狀） |
| `b2-rin.passive` | 普攻也要開發票 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-shadow.passive` | 講完大招才想起防護 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-shinchan.passive` | 動感超人不用補習 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-sinbad.passive` | 剪綵也是一種續航 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-takopi.passive` | 大家不要哭嗶 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-touka.passive` | 工頭撤退有體力補貼 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-uncle.passive` | 結界客服退通話費 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-yogiri.passive` | 睡眠品質調查表 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-zenitsu.passive` | 逃跑也算打卡 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `community-review-14-20260907.passive` | 〔教師的觀察〕 | — | 續效特效 |
| `community-review-24-20260907.r` | 神速・疾風迅雷 | tpl-buff-self | 持續＋續效特效 |
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
| `godie-u01u.passive` | 11-00 三刀流 | tpl-buff-self | 持續 |
| `godie-u034.e` | 06-03 山形修煉-強 | — | （無時序形狀） |
| `godie-u034.ex` | 06-002 殺意 | — | （無時序形狀） |
| `godie-ucrl.e` | 06-03 山形修煉-強 | — | （無時序形狀） |
| `godie-ucrl.ex` | 06-002 殺意 | — | （無時序形狀） |
| `godie-udre.passive` | 11-00 三刀流 | tpl-buff-self | 持續 |

</details>

<details><summary>「持續」缺口逐支（26 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `community-review-04-20260907.ex` | 〔歐拉終結拳〕 | — | 續效特效 |
| `godie-e00w.ex` | 77-002 御雷劍 | — | （無時序形狀） |
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

<details><summary>「多段」缺口逐支（8 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `b2-ned.q` | 蛙跳出差交通費 | hero-template.c908c89286a452169fdeb648106cf65dac155753e5cc6b52 | 持續＋續效特效＋路徑 |
| `community-review-33-20260907.passive` | 〔不死者再生〕 | — | 持續＋續效特效 |
| `godie-n003.r` | 42-04 世界終結 | tpl-projectile-strike | 等待＋持續＋續效特效＋路徑 |
| `godie-n00p.passive` | 18-00 薔薇荊棘之刃 | — | 路徑 |
| `godie-n01g.r` | 42-04 世界終結 | tpl-projectile-strike | 等待＋持續＋續效特效＋路徑 |
| `godie-nsjs.passive` | 18-00 薔薇荊棘之刃 | — | 路徑 |
| `godie-u00l.r` | 25-04 ChangeDNA | — | 續效特效 |
| `godie-umal.r` | 25-04 ChangeDNA | — | 持續＋續效特效 |

</details>

<details><summary>「路徑」缺口逐支（35 支）</summary>

| 技能 | 名稱 | 已接模板 | 目前形狀 |
|---|---|---|---|
| `b2-ned.passive` | 我真的是劍士不是坐騎 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `b2-ned.w` | 不是舌頭是近身劍 | hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550 | 續效特效 |
| `b2-popp.passive` | 撤退路線也是回魔路線 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-sinbad.passive` | 剪綵也是一種續航 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-touka.passive` | 工頭撤退有體力補貼 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | （無時序形狀） |
| `b2-zenitsu.passive` | 逃跑也算打卡 | hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77 | 持續 |
| `community-review-03-20260907.passive` | 〔不知火流身法〕 | — | 續效特效 |
| `community-review-05-20260907.e` | Leaf Shield | tpl-buff-self | 持續＋續效特效 |
| `community-review-17-20260907.r` | 墜落天空 | tpl-ground-nova | 續效特效 |
| `community-review-18-20260907.w` | 天之鎖 | tpl-single-strike | 持續＋續效特效 |
| `community-review-20-20260907.ex` | 〔電磁過載〕 | — | 持續＋續效特效 |
| `community-review-29-20260907.r` | 〔葬送連射〕 | tpl-random-barrage | 迴圈＋持續＋續效特效＋多段 |
| `community-review-30-20260907.q` | 〔菸灰缸飛過去〕 | tpl-ground-nova | 續效特效 |
| `community-review-31-20260907.e` | Repel Counter | tpl-buff-self | 持續＋續效特效 |
| `community-review-31-20260907.passive` | 〔糞作獵人的讀招〕 | — | 續效特效 |
| `community-review-32-20260907.q` | 肩パンチ | tpl-single-strike | 續效特效 |
| `godie-e00w.e` | 77-03 GLADIARIA ALAT | — | 持續 |
| `godie-e00x.q` | 77-01 百烈櫻華斬 | tpl-proxy-cast | 持續＋續效特效 |
| `godie-h020.passive` | 04-00 翔封界 | — | （無時序形狀） |
| `godie-h02r.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-hapm.passive` | 52-00 十二道試煉 | — | 持續 |
| `godie-hgam.e` | 90-03 藤鞭 | tpl-single-strike | （無時序形狀） |
| `godie-hjai.passive` | 04-00 翔封界 | — | （無時序形狀） |
| `godie-hpb1.w` | 07-02 者、皆、陣 | tpl-single-strike | 持續＋續效特效 |
| `godie-n01c.passive` | 08-00 龍紋記憶 | — | 持續＋續效特效 |
| `godie-nbbc.passive` | 08-00 龍紋記憶 | — | 持續＋續效特效 |
| `godie-o00k.e` | 86-03 神鳴 | tpl-instant-blast | （無時序形狀） |
| `godie-o00k.passive` | 86-00 裝可愛 | — | 持續＋續效特效 |
| `godie-u00h.w` | 39-02 無明神風流-朱雀 | tpl-instant-blast | （無時序形狀） |
| `godie-u00n.w` | 76-02 伸縮自如的橡膠火箭砲 | tpl-single-strike | 續效特效 |
| `godie-u00o.w` | 76-02 伸縮自如的橡膠火箭砲 | tpl-single-strike | 續效特效 |
| `godie-u010.q` | 38-01 邪王炎殺劍 | tpl-single-strike | 持續 |
| `godie-uvng.q` | 38-01 邪王炎殺劍 | tpl-single-strike | 持續 |
| `lol-leesin.q` | 聽雷探手 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8 | （無時序形狀） |
| `lol-xerath.e` | 奧能拘束 | hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8 | 持續 |

</details>

## 3. 模板覆蓋 —— 58 份文件，實際被引用的有幾份

`宣告形狀` = 這份模板的**參數槽**與 `requires` 加起來寫得出什麼（11 個 draft 一支技能都沒接，
實測形狀算不出來 —— 這一欄是它們唯一的聲音）。`實測形狀` = 引用它的技能真的落在哪一群。

| 模板 | 名稱 | 狀態 | 參數格 | 引用支數 | 宣告形狀 | 實測形狀 |
|---|---|---|---:|---:|---|---|
| `tpl-buff-self` | 變身強化-數值面 | enabled | 6 | 98 | 持續＋續效特效 | 持續×50・持續＋續效特效×46・持續＋續效特效＋路徑×2 |
| `tpl-single-strike` | 單體斬擊 | enabled | 6 | 75 | 迴圈＋持續＋續效特效 | 續效特效×30・（無時序形狀）×19・持續＋續效特效×12・持續＋續效特效＋路徑×3・等待＋持續＋續效特效＋多段＋路徑×2・迴圈＋持續×2・持續×2・迴圈＋續效特效＋多段＋路徑×1・等待＋續效特效×1・迴圈＋持續＋續效特效×1・續效特效＋路徑×1・等待＋路徑×1 |
| `tpl-line-sweep` | 直線分段掃擊 | enabled | 6 | 20 | 多段＋路徑 | 等待＋迴圈＋續效特效＋多段＋路徑×19・多段＋路徑×1 |
| `tpl-projectile-strike` | 投射物一發 | enabled | 7 | 18 | 迴圈＋持續＋續效特效＋路徑 | 路徑×7・續效特效＋路徑×5・等待＋持續＋續效特效＋路徑×2・迴圈＋持續＋續效特效＋路徑×2・持續＋續效特效＋多段＋路徑×2 |
| `tpl-instant-blast` | 瞬發點爆 | enabled | 4 | 16 | — | （無時序形狀）×13・等待＋持續＋續效特效＋多段＋路徑×2・持續＋續效特效×1 |
| `tpl-leap-strike` | 跳躍落地 | enabled | 10 | 14 | 持續＋續效特效＋路徑 | 持續＋續效特效＋路徑×14 |
| `tpl-proxy-cast` | 代理錨點施法 | enabled | 8 | 14 | 持續＋多段 | 持續×11・持續＋續效特效×2・持續＋續效特效＋多段＋路徑×1 |
| `tpl-charge-push` | 衝鋒推撞 | enabled | 11 | 12 | 等待＋路徑 | 等待＋持續＋續效特效＋路徑×12 |
| `tpl-transform` | 變身 | enabled | 6 | 12 | 持續＋續效特效 | 持續×11・持續＋續效特效×1 |
| `tpl-area-strike` | 範圍打擊 | enabled | 12 | 11 | 持續＋續效特效＋多段 | 持續＋多段×3・等待＋續效特效＋多段＋路徑×1・續效特效×1・迴圈＋持續＋續效特效＋多段×1・迴圈＋持續＋多段×1・等待＋續效特效×1・（無時序形狀）×1・等待＋多段＋路徑×1・等待＋持續＋續效特效＋多段＋路徑×1 |
| `tpl-lock-combo` | 鎖定連段 | enabled | 10 | 11 | 迴圈＋多段＋路徑 | 迴圈＋持續＋續效特效＋多段＋路徑×11 |
| `tpl-random-barrage` | 亂數彈幕轟炸 | enabled | 9 | 9 | 迴圈＋多段 | 迴圈＋持續＋續效特效＋多段×9 |
| `tpl-blink` | 純位移瞬移 | enabled | 1 | 7 | — | （無時序形狀）×7 |
| `tpl-periodic-field` | 週期領域 | enabled | 9 | 7 | 迴圈＋持續＋續效特效 | 迴圈＋持續×3・等待＋迴圈＋持續＋續效特效＋多段×2・等待＋迴圈＋持續＋續效特效×2 |
| `tpl-traveling-wave` | 行進波動 | enabled | 9 | 7 | 迴圈＋續效特效＋多段＋路徑 | 等待＋迴圈＋續效特效＋多段＋路徑×6・迴圈＋續效特效＋多段＋路徑×1 |
| `tpl-apply-status` | 只上狀態 | enabled | 3 | 6 | 續效特效 | 續效特效×5・持續＋續效特效×1 |
| `tpl-heal` | 回血 | enabled | 4 | 6 | — | （無時序形狀）×5・續效特效＋多段＋路徑×1 |
| `tpl-summon-agent` | 召喚代理 | enabled | 12 | 6 | 持續＋多段 | 持續＋續效特效＋多段×3・持續＋多段×3 |
| `tpl-drain-leech` | 汲取吸附 | enabled | 8 | 5 | 迴圈＋持續＋多段 | 迴圈＋持續＋多段×5 |
| `tpl-ground-nova` | 原地震波 | enabled | 4 | 5 | — | 續效特效×5 |
| `tpl-pull-throw` | 拉扯投擲 | enabled | 12 | 5 | 持續＋路徑 | 持續＋續效特效＋路徑×5 |
| `tpl-line-strike` | 直線貫穿 | enabled | 6 | 4 | 路徑 | 續效特效＋路徑×2・持續＋續效特效＋路徑×2 |
| `tpl-orbit-array` | 環形放射陣 | enabled | 7 | 2 | 迴圈＋多段＋路徑 | 多段＋路徑×2 |
| `tpl-blink-strike` | 瞬移突斬 | enabled | 6 | 1 | — | （無時序形狀）×1 |
| `tpl-proxy-fanout` | 範圍逐一施法 | enabled | 5 | 1 | 續效特效 | 續效特效×1 |
| `tpl-teleport` | 瞬移貼身 | enabled | 6 | 1 | 等待＋路徑 | 等待＋持續＋續效特效＋路徑×1 |
| `tpl-ally-shield` | 友軍護盾 | enabled | 6 | **0** | 持續 | — |
| `tpl-barrier-domain` | 結界領域 | draft | 0 | **0** | — | — |
| `tpl-beam-roll` | 翻滾光束（橫放光束砲） | enabled | 21 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-channel-beam` | 引導通魔 | draft | 0 | **0** | — | — |
| `tpl-charge-resource` | 事件累積資源 | enabled | 6 | **0** | 持續 | — |
| `tpl-combo-finisher` | 龍虎亂舞（自動連段→收尾重招） | enabled | 13 | **0** | 持續＋續效特效＋多段 | — |
| `tpl-data-no-trigger` | 無觸發（路由桶，不是機器） | draft | 0 | **0** | — | — |
| `tpl-death-mechanic` | 死亡機制 | draft | 0 | **0** | — | — |
| `tpl-dragon-quake` | 動地剁落點環 | enabled | 15 | **0** | 等待＋持續＋續效特效＋多段＋路徑 | — |
| `tpl-dragon-serpent` | 多實例龍形推進 | enabled | 17 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-dragon-shockwave` | 沿路衝擊波 | draft | 9 | **0** | 等待＋迴圈＋續效特效＋路徑 | — |
| `tpl-effect-sequence` | 自訂效果序列 | enabled | 5 | **0** | — | — |
| `tpl-event-passive` | 自訂事件被動 | enabled | 1 | **0** | — | — |
| `tpl-global-rule` | 全場規則 | draft | 0 | **0** | — | — |
| `tpl-growth-charge` | 成長蓄能 | enabled | 9 | **0** | 迴圈＋持續 | — |
| `tpl-life-manipulate` | 生命操作 | enabled | 4 | **0** | — | — |
| `tpl-line-blast` | 直線衝擊波（落點大爆炸） | enabled | 15 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-locust-line` | 沿線 N 具（蝗蟲群·一次擺出整條線） | enabled | 11 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-orb` | 球體定點（蝗蟲群·不動的那一群） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-strike` | 定點打擊（蝗蟲群·擺在腳下的那一具） | enabled | 11 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-locust-swarm` | 推進多具（蝗蟲群·等分散開各自推進） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-locust-travel` | 推進單具（蝗蟲群·一具沿面向推出去） | enabled | 11 | **0** | 等待＋續效特效＋路徑 | — |
| `tpl-mark-stacks` | 具名標記-層數與免死 | enabled | 20 | **0** | 持續＋路徑 | — |
| `tpl-on-attack` | 攻擊觸發 | enabled | 6 | **0** | — | — |
| `tpl-on-hit-react` | 受擊反應 | enabled | 5 | **0** | — | — |
| `tpl-pure-cosmetic` | 純演出物件資料 | draft | 0 | **0** | — | — |
| `tpl-radial-burst` | 圓周噴發（大冰塊） | enabled | 12 | **0** | 等待＋續效特效＋多段＋路徑 | — |
| `tpl-range-gamble` | 距離博弈 | draft | 0 | **0** | — | — |
| `tpl-resource-ops` | 資源運營 | draft | 0 | **0** | — | — |
| `tpl-spend-resource` | 消耗資源施放 | enabled | 6 | **0** | — | — |
| `tpl-strip-transform` | 剝奪變化 | draft | 0 | **0** | — | — |
| `tpl-team-synergy` | 隊伍協同 | draft | 0 | **0** | — | — |

## 4. ⭐ 該做什麼 —— 按**擋住的支數**排序

CLAUDE.md 第〇·五守則：「⛔ **不要逐支實作。** 按**擋住的支數**做機制，不是按技能順序做技能。」
⇒ 這張表的排序就是那條規則：左邊擋得多的先做。

| 軸 | 擋住幾支 | 現成的模板 | 狀態 | 該做什麼 |
|---|---:|---|---|---|
| 迴圈 | **50** | `tpl-drain-leech`・`tpl-lock-combo` | draft・enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 50 支接上去（改內容，⛔ 不必動引擎） |
| 路徑 | **35** | `tpl-charge-push`・`tpl-leap-strike` | draft・enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 35 支接上去（改內容，⛔ 不必動引擎） |
| 持續 | **26** | `tpl-area-strike`・`tpl-buff-self` | enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 26 支接上去（改內容，⛔ 不必動引擎） |
| 等待 | **24** | `tpl-charge-push`・`tpl-teleport` | draft・enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 24 支接上去（改內容，⛔ 不必動引擎） |
| 多段 | **8** | `tpl-area-strike`・`tpl-drain-leech` | enabled | ⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 8 支接上去（改內容，⛔ 不必動引擎） |

⚠️ **另一個方向的浪費**：有 **20** 份模板參數面已經做好（≥5 格參數）卻**一支技能都沒引用** ——
　`tpl-ally-shield`(6格/enabled)・`tpl-beam-roll`(21格/enabled)・`tpl-charge-resource`(6格/enabled)・`tpl-combo-finisher`(13格/enabled)・`tpl-dragon-quake`(15格/enabled)・`tpl-dragon-serpent`(17格/enabled)・`tpl-dragon-shockwave`(9格/draft)・`tpl-effect-sequence`(5格/enabled)・`tpl-growth-charge`(9格/enabled)・`tpl-line-blast`(15格/enabled)・`tpl-locust-line`(11格/enabled)・`tpl-locust-orb`(12格/enabled)・`tpl-locust-strike`(11格/enabled)・`tpl-locust-swarm`(12格/enabled)・`tpl-locust-travel`(11格/enabled)・`tpl-mark-stacks`(20格/enabled)・`tpl-on-attack`(6格/enabled)・`tpl-on-hit-react`(5格/enabled)・`tpl-radial-burst`(12格/enabled)・`tpl-spend-resource`(6格/enabled)

⛔ 它們與上表是**同一個問題的兩半**：一邊有技能在等機制，一邊有機制在等技能。

## 5. 閘 —— 未分類欄位

⛔ 下面這些欄位出現在出貨技能裡，而 `shape_axes.json` 沒有替它們做過決定：

| 欄位 | 出現次數 |
|---|---:|
| `shield.onExisting` | 74 |
| `chance.p` | 36 |
| `consumeStatus.onConsumed` | 28 |
| `knockback.launchHeight` | 18 |
| `dot.tickOnApply` | 13 |
| `dispel.order` | 10 |
| `knockback.subtractGap` | 7 |
| `knockback.uncontrollable` | 7 |
| `summon.formation` | 6 |
| `summon.maxAlive` | 6 |
| `summon.spread` | 6 |
| `pull.destination` | 5 |
| `pull.stopDistance` | 5 |
| `(hook).on=onDashOrBlink` | 5 |
| `summon.championId` | 4 |
| `spendHealth.minimumHp` | 4 |
| `spendHealth.pctMaxHealth` | 4 |
| `(hook).on=onCrowdControlApplied` | 4 |
| `dot.onCasterDeath` | 4 |
| `(hook).on=onUltimateCast` | 3 |
| `evasion.chance` | 3 |
| `evasion.dodgesAbilities` | 3 |
| `(hook).on=onAllyDamaged` | 3 |
| `spendMana.bankAs` | 2 |
| `damage.bankedBonus` | 2 |
| `(hook).on=onHeal` | 2 |
| `applyStatus.healingTakenMult` | 2 |
| `(hook).on=onCrowdControlReceived` | 2 |
| `chainLightning.revisit` | 2 |
| `chainLightning.maxTotalJumps` | 2 |
| `applyStatus.sourceScope` | 1 |
| `status.appliedBy` | 1 |
| `(hook).on=onUltimateHit` | 1 |
| `damage.distanceScale` | 1 |
| `applyStatus.lifestealMult` | 1 |
| `applyStatus.regenMult` | 1 |
| `(hook).on=onShieldGained` | 1 |


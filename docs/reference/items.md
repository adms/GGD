# 道具總表 / Item reference

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_1c68c834dac0`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**214**　·　開放名單來源：`data/curation/whitelist.json`（updatedAt `2026-07-22T15:49:20.043229Z`）

`content/items/*.json` 共 **214** 份，依 `content/items/<id>.json` 的 **`craftRole`** 標記分類（來源：source-map triggers，見 `tools/w3x-import/extract_item_roles.py`）。實際能在商店買到的只有 **28** 件最終合成武器（`craftRole:final` 且有效果）＋ **2** 項服務；三選一 draft 抽 **13** 件任務道具，傳說寶玉抽 **14** 件傳說。其餘（107 組件、8 代幣、36 無角色、6 無 payload 的 final）是配方半成品或 w3x 殘件，不會單獨出現在任何商店或抽卡。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> **上架規則（task #70）**：`shopCatalogue` / `buyItem` 只讓 `craftRole === "final"` **且** 真有效果的武器上架（`packages/shared/src/sim/economy/shop.ts:110`、`apps/client/src/ui/panels/champSelectFilter.ts:150`）。元件、製作書、任務、代幣一律拒賣，即使有價格、有效果、被白名單放行也一樣。
>
> **6 件 `final` 沒有 payload**（雷神之鎚／黑色魔書…）：item@1 目前只能存 `modifiers` / `passive`，它們的主動效果 schema 還裝不下（卡在 #56），所以留在 `final` 分類但不上架，避免變成花 1200g 的空按鈕。
>
> **三選一 draft 抽的是 13 件 `quest` 道具**（`content/loot-tables/quest-rewards.json`；`仙后座` = `godie-i01s`）。只有兩種商店價格：簡易 **300g**、強力 **1200g**（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。
>
> `tier` 欄是 doc 上的 1..5 分級，那是 w3x 匯入的遺留欄位，**與 craftRole 無關**。
>
> `暴擊率` / `暴擊傷害` / `吸血` 的 `flat` 值是**小數比例**，不是百分點：`暴擊率 +0.17` 就是 17%。標了 `%` 的欄位才是 `pctAdd`。
>
> 背包 6 格、賣出退 40%（`packages/shared/src/sim/economy/shop.ts:11,18`）。

---

## 1. 商店貨架 shop shelf — final 且有效果（28）

真正能用金幣買的最終合成武器：`craftRole:final` 且有 `modifiers`／`passive`。白名單啟用時可能再縮小，但永遠不會放進非 final 的東西。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i00f` | 霸王槍 | 最終合成 final | 1200g | T2 | — | ✅ | 攻擊力 +30.2 · 生命 +222 | onBasicAttack→damage |
| `godie-i00i` | 炎龍巨弩 | 最終合成 final | 1200g | T2 | — | — | 護甲 +4.5 · 攻速 +30% · 攻擊力 +37.6 | — |
| `godie-i00j` | 奇門盾甲 | 最終合成 final | 1200g | T2 | — | ✅ | 生命 +186 · 回血 +3.9 | — |
| `godie-i016` | 晨曦之光 | 最終合成 final | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i018` | 朗基努斯之槍 | 最終合成 final | 1200g | T2 | — | — | 護甲 +3.8 · 攻速 +25.3% · 攻擊力 +12.6 · 生命 +278 | — |
| `godie-i01j` | 靈魂魔石 | 最終合成 final | 1200g | T2 | — | — | 生命 +217 · 魔力 +136 | — |
| `godie-i01o` | 死神裝束 | 最終合成 final | 1200g | T2 | — | — | 攻速 +33.3% · 生命 +55 · 攻擊力 +2.8 · 魔力 +33 · 移速 +0.33 | — |
| `godie-i01v` | 螺旋劍 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +45.6 · 生命 +54 · 魔力 +32 | — |
| `godie-i027` | 光魔杖 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +93.2 · 魔力 +279 · 攻擊力 +23.3 | onBasicAttack→damage |
| `godie-i02e` | 狂暴軒轅劍 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +32.2 · 生命 +202 | onBasicAttack→damage |
| `godie-i02r` | 奇蹟之墜 | 最終合成 final | 1200g | T2 | — | — | 法強 +28.9 · 魔力 +87 · 生命 +174 | — |
| `godie-i031` | 天生牙 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +8.2 · 生命 +181 | — |
| `godie-i039` | 幻之匕首 | 最終合成 final | 1200g | T2 | — | — | 護甲 +5.2 · 攻速 +56.9% | — |
| `godie-i03b` | 真．雅典娜的驚嘆號 | 最終合成 final | 1200g | T2 | — | — | 法強 +81.6 · 魔力 +245 · 回魔 +81.6% | — |
| `godie-i03d` | 光明虎徹 | 最終合成 final | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i03f` | 甘豆腐之袍 | 最終合成 final | 300g | T1 | — | — | 回魔 +22.3% · 生命 +59 · 護甲 +1.2 | — |
| `godie-i040` | 破甲槍 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +26 | onBasicAttack→applyBuff |
| `godie-i041` | 火閃電 | 最終合成 final | 300g | T1 | — | — | 移速 +0.83 | — |
| `godie-i045` | 寂靜刃 - 詠月 | 最終合成 final | 1200g | T2 | — | ✅ | 魔力 +450 · 回魔 +300% | — |
| `godie-i049` | 賢者之石 | 最終合成 final | 1200g | T2 | — | — | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i04d` | 冰晶虎魄 - 改 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +5.5 · 生命 +122 · 法強 +27.7 · 魔力 +83 | onBasicAttack→applyStatus |
| `godie-i04i` | 厄夜鐮刀 | 最終合成 final | 1200g | T2 | — | — | 回魔 +300% | — |
| `godie-i05h` | 失心匕首 | 最終合成 final | 1200g | T2 | — | — | 攻擊力 +14.1 · 攻速 +28.2% | — |
| `godie-i05o` | 刺針 | 最終合成 final | 300g | T1 | — | — | 攻擊力 +5.2 · 生命 +11 · 魔力 +7 | — |
| `godie-i067` | 惡夢魔王碎片 | 最終合成 final | 1200g | T2 | — | — | 回魔 +229.8% · 魔力 +689 | — |
| `godie-i06d` | 斬龍刀 | 最終合成 final | 1200g | T2 | — | ✅ | 護甲 +3.6 · 攻速 +23.9% · 暴擊率 +0.18 · 暴擊傷害 +0.45 · 攻擊力 +32.9 | — |
| `godie-i06f` | 月神槍 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +99 · 魔力 +297 · 護甲 +13.2 · 回血 +8.29 | — |
| `godie-i06i` | 炎神弩 | 最終合成 final | 1200g | T2 | — | ✅ | 攻擊力 +35.1 · 護甲 +5.3 · 攻速 +35.1% | — |

## 2. 商店服務 services（2）

真的是 `item@1` 文件，但 `buyItem` 在進背包路徑前就以 id 攔截它們：不佔格、可重複買（傳說寶玉 2400g／能力屬性強化 375g）。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `legendary-orb` | 傳說寶玉 | 商店服務 service | 2400g | T3 | — | — | — | — |
| `stat-attunement` | 能力屬性強化 | 商店服務 service | 375g | T1 | — | — | — | — |

## 3. 三選一 draft — quest（三選一 augment/武器卡）（13）

每回合三選一 draft 從這 13 件抽 3 張。買不到，只能抽到。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i004` | 魔戒 | 任務獎勵 quest | — | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i00z` | 四魂之玉 | 任務獎勵 quest | — | T2 | — | — | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i01k` | 火焰泰坦腰帶 | 任務獎勵 quest | — | T2 | — | — | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | — |
| `godie-i01n` | 天堂之劍 | 任務獎勵 quest | — | T2 | — | — | 生命 -500 · 暴擊率 +0.03 · 暴擊傷害 +48.25 | — |
| `godie-i01s` | 仙后座 | 任務獎勵 quest | — | T1 | — | — | — | — |
| `godie-i02h` | 戰旗 | 任務獎勵 quest | — | T5 | — | — | — | — |
| `godie-i02j` | 復仇之袍 | 任務獎勵 quest | — | T5 | — | — | — | — |
| `godie-i02k` | 惡魔吉他 | 任務獎勵 quest | — | T5 | — | — | — | — |
| `godie-i034` | 大地泰坦角盔 | 任務獎勵 quest | — | T2 | — | — | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | — |
| `godie-i035` | 海潮泰坦護盾 | 任務獎勵 quest | — | T2 | — | — | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | — |
| `godie-i05y` | 蜂蜜罐 | 任務獎勵 quest | — | T2 | — | — | 回魔 +200.1% · 回血 +12.06 | — |
| `godie-i06j` | 獸人船長十字鎬 | 任務獎勵 quest | — | T2 | — | — | 攻擊力 +26 | — |
| `godie-i06n` | 老衲的棒子 | 任務獎勵 quest | — | T2 | — | — | 攻擊力 +26 | onBasicAttack→applyStatus |

## 4. 傳說池 legendary pool（14）

`content/loot-tables/legendary-weapons.json`，等權重抽取。買不到，只能從武器三選一或 2400g 傳說寶玉取得。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i000` | 丈八蛇矛 | 無角色 none | — | T3 | ✅ | — | 攻擊力 +28.7 · 生命 +237 | — |
| `godie-i007` | 妖刀村正 | 無角色 none | — | T3 | ✅ | ✅ | 吸血 +0.36 · 攻擊力 +43.2 | — |
| `godie-i00l` | 落魂的嗜血劍 | 無角色 none | — | T3 | ✅ | — | 吸血 +0.23 · 攻擊力 +46.3 | — |
| `godie-i00u` | 名刀-天狼 | 組件 component | — | T3 | ✅ | — | 攻速 +123.2% | — |
| `godie-i012` | 熾天使之弓 | 組件 component | — | T3 | ✅ | — | 護甲 +16.3 · 攻速 +108.5% | onBasicAttack→damage |
| `godie-i013` | 八取武士刀 | 組件 component | — | T3 | ✅ | — | 攻擊力 +32.2 · 生命 +202 | onBasicAttack→damage |
| `godie-i014` | 天叢雲劍 | 組件 component | — | T3 | ✅ | — | 攻擊力 +38.8 · 生命 +111 · 魔力 +67 | — |
| `godie-i01d` | 死之王的長槍 | 無角色 none | — | T3 | ✅ | — | 生命 +308 · 攻擊力 +15.4 · 魔力 +185 | — |
| `godie-i01g` | 貫雷槍 | 組件 component | — | T3 | ✅ | — | 護甲 +3.8 · 攻速 +25.3% · 攻擊力 +12.6 · 生命 +278 | — |
| `godie-i02x` | 斬岩刃 | 組件 component | — | T3 | ✅ | ✅ | 攻擊力 +30.2 · 生命 +222 | onBasicAttack→damage |
| `godie-i04v` | 正義之杖 | 無角色 none | — | T3 | ✅ | — | 生命 +308 · 攻擊力 +15.4 · 魔力 +185 | — |
| `godie-i06e` | 月牙魔杖 | 無角色 none | — | T3 | ✅ | — | 魔抗 +200 | — |
| `godie-i06g` | 殺豬刀 | 無角色 none | — | T3 | ✅ | — | 護甲 +4.5 · 攻速 +30% · 攻擊力 +37.6 | — |
| `godie-i06s` | 龍騎士之劍 | 組件 component | — | T3 | ✅ | ✅ | 護甲 +3.4 · 攻速 +23% · 攻擊力 +34.5 · 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |

## 5. final 但無 payload（暫不上架）（6）

分類是最終合成，但沒有 `modifiers`／`passive`，主動效果 schema 還裝不下（#56），所以商店拒賣。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i00c` | 風行天衣 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i01i` | 雷神之鎚 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i02t` | 盾甲天書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i030` | 黑色魔書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i038` | 嗜血邪書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i03h` | 天地崩裂魔杖 | 最終合成 final | 1200g | T2 | — | — | — | — |

## 6. 組件 component（107）

配方半成品：只在合成路徑上，不單獨上架。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i002` | 武聖手鐲 | 組件 component | 300g | T1 | — | ✅ | 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |
| `godie-i003` | 聖光石 | 組件 component | 1450g | T2 | — | ✅ | — | — |
| `godie-i005` | 初心者寶石 | 組件 component | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i006` | 雅典娜的驚嘆號 | 組件 component | 1200g | T2 | — | — | 法強 +82.1 · 魔力 +246 · 回魔 +68.4% | — |
| `godie-i009` | 分手之鎚製作書 | 組件 component | 1150g | T2 | — | — | — | — |
| `godie-i00a` | 刺針製作書 | 組件 component | 500g | T2 | — | — | — | — |
| `godie-i00b` | 失心匕首製作書 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i00g` | 奇美拉之翼 | 組件 component | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i00h` | 風行天衣製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i00k` | 女神之淚 | 組件 component | 300g | T1 | — | — | 護甲 +0.8 · 魔力 +42 · 生命 +48 | — |
| `godie-i00m` | 米索莉護板 | 組件 component | 300g | T1 | — | ✅ | 護甲 +17 | — |
| `godie-i00n` | 分手之鎚 | 組件 component | 1200g | T2 | — | — | 攻擊力 +26 | onBasicAttack→applyBuff |
| `godie-i00p` | 聖誕之靴 | 組件 component | 300g | T1 | — | — | 攻速 +11.2% · 移速 +0.23 | — |
| `godie-i00q` | 伊娃之盾 | 組件 component | 300g | T1 | — | — | 回魔 +22.3% · 生命 +59 · 護甲 +1.2 | — |
| `godie-i00r` | 山之書 | 組件 component | 2785g | T3 | — | — | — | — |
| `godie-i00t` | 風之書 | 組件 component | 1950g | T3 | — | — | — | — |
| `godie-i00v` | 四魂之玉的碎片-荒魂 | 組件 component | — | T1 | — | — | 攻擊力 +6 · 生命 +132 | — |
| `godie-i00w` | 四魂之玉的碎片-和魂 | 組件 component | — | T1 | — | — | 生命 +40 · 攻擊力 +2 · 魔力 +24 | — |
| `godie-i00x` | 四魂之玉的碎片-幸魂 | 組件 component | — | T1 | — | — | 護甲 +1.8 · 攻速 +12% | — |
| `godie-i00y` | 四魂之玉的碎片-奇魂 | 組件 component | — | T1 | — | — | 法強 +30 · 魔力 +90 | — |
| `godie-i010` | 熱戀魔杖 | 組件 component | 300g | T1 | — | ✅ | 法強 +21.1 · 魔力 +63 | — |
| `godie-i011` | 名刀-天狼製作書 | 組件 component | 1750g | T3 | — | — | — | — |
| `godie-i015` | 瑪那魔杖製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i017` | 祕銀鎖子甲製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i019` | 霸王槍製作書 | 組件 component | 3650g | T4 | — | — | — | — |
| `godie-i01b` | 林之書 | 組件 component | 2550g | T3 | — | — | — | — |
| `godie-i01c` | 火之書 | 組件 component | 2040g | T3 | — | — | — | — |
| `godie-i01e` | 和道一文字製作書 | 組件 component | 1200g | T2 | — | — | — | — |
| `godie-i01f` | 和道一文字 | 組件 component | 300g | T1 | — | — | 護甲 +1.2 · 攻速 +14.3% | — |
| `godie-i01h` | 貫雷槍製作書 | 組件 component | 2000g | T3 | — | — | — | — |
| `godie-i01l` | 雷神之鎚製作書 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i01m` | 黑核晶 | 組件 component | 300g | T1 | — | — | 回魔 +115.9% · 魔力 +155 | — |
| `godie-i01p` | 聖誕之靴製作書 | 組件 component | 500g | T2 | — | — | — | — |
| `godie-i01q` | 光魔杖製作書 | 組件 component | 3700g | T4 | — | — | — | — |
| `godie-i01r` | 一克拉鑽戒製作書 | 組件 component | 150g | T1 | — | — | — | — |
| `godie-i01t` | 晨曦之光製作書 | 組件 component | — | T1 | — | — | — | — |
| `godie-i01u` | 伊娃之盾製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i01w` | 祕銀鎖子甲 | 組件 component | 300g | T1 | — | ✅ | 護甲 +17 | — |
| `godie-i01x` | 思念的守護製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i01y` | 熾天使之弓製作書 | 組件 component | 500g | T2 | — | — | — | — |
| `godie-i01z` | 八取武士刀製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i020` | 瑪那魔杖 | 組件 component | 1200g | T2 | — | — | 法強 +79 · 魔力 +237 · 回魔 +158.1% | — |
| `godie-i021` | 天叢雲劍製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i022` | 龍騎士之劍製作書 | 組件 component | 800g | T2 | — | — | — | — |
| `godie-i024` | 朗基努斯之槍製作書 | 組件 component | 3750g | T4 | — | — | — | — |
| `godie-i025` | 惡夢魔王碎片製作書 | 組件 component | 4500g | T4 | — | — | — | — |
| `godie-i026` | 雅典娜的驚嘆號製作書 | 組件 component | 4500g | T4 | — | — | — | — |
| `godie-i028` | 月神槍製作書 | 組件 component | 4150g | T4 | — | — | — | — |
| `godie-i029` | 斬龍刀製作書 | 組件 component | 4500g | T4 | — | — | — | — |
| `godie-i02a` | 炎神弩製作書 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i02c` | 狂暴軒轅劍製作書 | 組件 component | 5000g | T4 | — | — | — | — |
| `godie-i02f` | 死神裝束製作書 | 組件 component | 4500g | T4 | — | — | — | — |
| `godie-i02i` | 泰坦之魂 | 組件 component | — | T1 | — | — | — | — |
| `godie-i02l` | 舊系服 | 組件 component | — | T1 | — | — | — | — |
| `godie-i02m` | 牛蒡男 | 組件 component | — | T1 | — | — | — | — |
| `godie-i02n` | 斯巴達圓盾 | 組件 component | — | T1 | — | — | — | — |
| `godie-i02o` | 空罐頭 | 組件 component | — | T1 | — | — | — | — |
| `godie-i02p` | 網友手環 | 組件 component | 300g | T1 | — | — | 護甲 +17 | — |
| `godie-i02q` | 澤之書 | 組件 component | 2785g | T3 | — | — | — | — |
| `godie-i02s` | 奇蹟之墜製作書 | 組件 component | 2500g | T3 | — | — | — | — |
| `godie-i02u` | 黑色魔書製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i02v` | 黑核晶製作書 | 組件 component | 150g | T1 | — | — | — | — |
| `godie-i02w` | 靈魂魔石製作書 | 組件 component | 2750g | T3 | — | — | — | — |
| `godie-i02y` | 斬岩刃製作書 | 組件 component | 800g | T2 | — | — | — | — |
| `godie-i02z` | 盾甲天書製作書 | 組件 component | 2500g | T3 | — | — | — | — |
| `godie-i032` | 天生牙製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i036` | 嗜血邪書製作書 | 組件 component | 3000g | T4 | — | — | — | — |
| `godie-i037` | 隱密介紹信 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i03a` | 幻之匕首製作書 | 組件 component | 4500g | T4 | — | — | — | — |
| `godie-i03c` | 雅典娜的驚嘆號．改 | 組件 component | 1200g | T2 | — | — | 法強 +81.8 · 魔力 +245 · 回魔 +76.7% | — |
| `godie-i03e` | 光明虎徹製作書 | 組件 component | 600g | T2 | — | — | — | — |
| `godie-i03g` | 甘豆腐之袍製作書 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i03i` | 天地崩裂魔杖製作書 | 組件 component | 2750g | T3 | — | — | — | — |
| `godie-i03o` | 死之王長槍的碎片 | 組件 component | 4300g | T4 | — | — | — | — |
| `godie-i03p` | 死之王意志的碎片 | 組件 component | 4600g | T4 | — | — | — | — |
| `godie-i03q` | 死之王神盾的碎片 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i03x` | 破甲槍製作書 | 組件 component | 4000g | T4 | — | — | — | — |
| `godie-i03z` | 螺旋劍製作書 | 組件 component | 4700g | T4 | — | — | — | — |
| `godie-i042` | 火閃電製作書 | 組件 component | 1500g | T3 | — | — | — | — |
| `godie-i044` | 寂靜刃 - 詠月製作書 | 組件 component | 2200g | T3 | — | — | — | — |
| `godie-i04a` | 賢者之石製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i04b` | 冰晶虎魄 | 組件 component | 1200g | T2 | — | ✅ | 法強 +27.7 · 魔力 +83 · 攻擊力 +5.5 · 生命 +122 | onBasicAttack→applyStatus |
| `godie-i04c` | 冰晶虎魄製作書 | 組件 component | 2000g | T3 | — | — | — | — |
| `godie-i04e` | 冰晶虎魄 - 改製作書 | 組件 component | 3750g | T4 | — | — | — | — |
| `godie-i04g` | 奇門遁甲製作書 | 組件 component | 4700g | T4 | — | — | — | — |
| `godie-i04h` | 炎龍巨弩製作書 | 組件 component | 4150g | T4 | — | — | — | — |
| `godie-i04k` | 厄夜鐮刀製作書 | 組件 component | 2000g | T3 | — | — | — | — |
| `godie-i053` | 仙后座殘骸 | 組件 component | — | T1 | — | — | — | — |
| `godie-i05g` | 世界樹的果實 | 組件 component | 1800g | T3 | — | — | — | — |
| `godie-i05r` | 吸血石 | 組件 component | 300g | T1 | — | ✅ | 吸血 +0.27 | — |
| `godie-i05s` | 嚇人假面 | 組件 component | 300g | T1 | — | — | 回魔 +300% | — |
| `godie-i05t` | 定情戒指 | 組件 component | 300g | T1 | — | ✅ | 回血 +3.28 | — |
| `godie-i05u` | 熱舞之靴 | 組件 component | 300g | T1 | — | ✅ | 移速 +0.83 | — |
| `godie-i05v` | 破壞王手套 | 組件 component | 300g | T1 | — | ✅ | 攻速 +15.4% | — |
| `godie-i05w` | 觀音菩薩護身符 | 組件 component | 1650g | T3 | — | — | — | — |
| `godie-i05x` | 辣妹護腕 | 組件 component | 300g | T1 | — | ✅ | 魔抗 +37.8 | — |
| `godie-i065` | godie-i065 | 組件 component | 1150g | T2 | — | — | 生命 +320 | — |
| `godie-i066` | 復仇之玉 | 組件 component | 300g | T1 | — | — | — | onBasicAttack→applyBuff |
| `godie-i068` | 瑪那寶石 | 組件 component | 300g | T1 | — | ✅ | 魔力 +190 | — |
| `godie-i069` | 女神之淚製作書 | 組件 component | 350g | T1 | — | — | — | — |
| `godie-i06b` | 思念的守護 | 組件 component | 300g | T1 | — | ✅ | 法強 +17.6 · 魔力 +53 · 護甲 +2.8 | — |
| `godie-i06c` | 恐龍之斧 | 組件 component | 1200g | T2 | — | ✅ | 攻擊力 +8.2 · 生命 +181 | — |
| `godie-i06h` | 求生護腕 | 組件 component | 300g | T1 | — | ✅ | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i06k` | 奧理哈魯根劍身 | 組件 component | 1200g | T2 | — | ✅ | 攻擊力 +26 | — |
| `godie-i06m` | 真知之石 | 組件 component | 950g | T2 | — | — | — | — |
| `godie-i06p` | godie-i06p | 組件 component | 1250g | T2 | — | — | 護甲 +3 · 攻速 +20% | — |
| `godie-i06r` | 一克拉鑽戒 | 組件 component | 300g | T1 | — | — | 護甲 +0.8 · 生命 +63 | — |

## 7. 代幣 token（8）

任務／成就代幣，不是可裝備的道具。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i04y` | 兌換空罐頭 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i051` | 兌換仙后座 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i054` | 認領寵物 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i055` | 兌換牛蒡男 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i056` | 交換寵物 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i059` | 兌換舊系服 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i05a` | 兌換泰坦之魂 | 代幣 token | — | T1 | — | — | — | — |
| `godie-i05e` | 兌換斯巴達圓盾 | 代幣 token | — | T1 | — | — | — | — |

## 8. 其餘 none（36）

沒有 craftRole 角色的殘件，留著做 w3x 對照與未來策展。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `ember-rod` | 餘燼魔杖 | 無角色 none | 300g | T1 | — | — | 法強 +31.6 | — |
| `godie-i001` | 出動怨念射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i008` | 初級傳送捲軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i00d` | 出動戀愛戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00e` | 出動兄貴戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00o` | 金雞蛋 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i00s` | 黃金聖鬥衣 | 無角色 none | 1200g | T2 | — | — | 攻速 +39.2% · 移速 +0.26 · 生命 +44 · 攻擊力 +2.2 · 魔力 +26 | — |
| `godie-i01a` | 好像有毒的生肉 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i023` | 妖刀村正製作書 | 無角色 none | 500g | T2 | — | — | — | — |
| `godie-i02b` | 妖物碎殺牙製作書 | 無角色 none | 5500g | T4 | — | — | — | — |
| `godie-i02d` | 消失的密室 | 無角色 none | 300g | T1 | — | — | 生命 +23 · 攻擊力 +1.1 · 魔力 +14 · 移速 +0.34 | — |
| `godie-i02g` | 奇美拉之翼(電腦) | 無角色 none | 1200g | T2 | — | — | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i033` | 初心者護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.7 · 生命 +35 · 攻擊力 +1.7 · 魔力 +21 | — |
| `godie-i03j` | 黃昏公主的血脈 | 無角色 none | 450g | T1 | — | ✅ | — | — |
| `godie-i03l` | 我愛一條柴 | 無角色 none | 200g | T1 | — | — | — | — |
| `godie-i03m` | 反射之盾 | 無角色 none | 300g | T1 | — | — | 護甲 +17 | — |
| `godie-i03n` | 餅乾 | 無角色 none | 150g | T1 | — | — | — | — |
| `godie-i04j` | 金幣(寶箱) | 無角色 none | — | T1 | — | — | — | — |
| `godie-i04m` | 殺豬刀製作書 | 無角色 none | 5500g | T4 | — | — | — | — |
| `godie-i05k` | 打我阿笨蛋卷軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i05l` | 力量護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +0.8 · 攻擊力 +2 · 生命 +43 | — |
| `godie-i05m` | 敏捷護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +4.2 · 攻速 +11.6% | — |
| `godie-i05n` | 智慧護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.6 · 法強 +19.2 · 魔力 +57 | — |
| `godie-i05q` | 友情呼喚號角 | 無角色 none | 1200g | T2 | — | — | 攻速 +61.6% | — |
| `godie-i05z` | 出動正義射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i060` | 死之王的意志 | 無角色 none | 1200g | T2 | — | ✅ | 生命 +144 · 回血 +5.98 | — |
| `godie-i061` | 死之王的神盾 | 無角色 none | 300g | T1 | — | — | 護甲 +17 | — |
| `godie-i062` | 飛鼠跳刀 | 無角色 none | 1550g | T3 | — | — | — | — |
| `godie-i063` | 防狼電擊棒 | 無角色 none | 300g | T1 | — | — | 魔力 +185 · 回魔 +16.8% | — |
| `godie-i06a` | 妖物碎殺牙 | 無角色 none | 1200g | T2 | — | — | 吸血 +0.16 · 攻擊力 +22.2 | — |
| `godie-i06l` | 生肉 | 無角色 none | 150g | T1 | — | — | — | — |
| `godie-i06o` | 血染八月 | 無角色 none | 1200g | T2 | — | — | 攻擊力 +26 | onBasicAttack→damage |
| `godie-i06q` | 鍊金術之盾 | 無角色 none | 300g | T1 | — | — | 護甲 +17 | — |
| `ironhide-vest` | 鐵皮護甲背心 | 無角色 none | 1200g | T2 | — | — | 護甲 +36.7 · 生命 +122 | — |
| `serrated-edge` | 鋸齒之刃 | 無角色 none | 1200g | T2 | — | ✅ | 攻擊力 +26 | onBasicAttack→damage |
| `swift-boots` | 疾風之靴 | 無角色 none | 300g | T1 | — | ✅ | 移速 +0.83 | — |


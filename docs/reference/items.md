# 道具總表 / Item reference

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_07059e40820e`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**239**　·　開放名單來源：`data/curation/whitelist.json`（updatedAt `2026-07-24T11:14:58.268286Z`）

`content/items/*.json` 共 **239** 份，依 `content/items/<id>.json` 的 **`craftRole`** 標記分類（來源：source-map triggers，見 `tools/w3x-import/extract_item_roles.py`）。實際能在商店買到的只有 **38** 件最終合成武器（`craftRole:final` 且有效果）＋ **2** 項服務；三選一 draft 抽 **13** 件任務道具，傳說寶玉抽 **49** 件傳說。其餘（106 組件、8 代幣、51 無角色、4 無 payload 的 final）是配方半成品或 w3x 殘件，不會單獨出現在任何商店或抽卡。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> **上架規則（task #70）**：`shopCatalogue` / `buyItem` 只讓 `craftRole === "final"` **且** 真有效果的武器上架（`packages/shared/src/sim/economy/shop.ts:110`、`apps/client/src/ui/panels/champSelectFilter.ts:150`）。元件、製作書、任務、代幣一律拒賣，即使有價格、有效果、被白名單放行也一樣。
>
> **4 件 `final` 沒有 payload**（雷神之鎚／黑色魔書…）：item@1 目前只能存 `modifiers` / `passive`，它們的主動效果 schema 還裝不下（卡在 #56），所以留在 `final` 分類但不上架，避免變成花 1200g 的空按鈕。
>
> **三選一 draft 抽的是 13 件 `quest` 道具**（`content/loot-tables/quest-rewards.json`；`仙后座` = `godie-i01s`）。只有兩種商店價格：簡易 **300g**、強力 **1200g**（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。
>
> `tier` 欄是 doc 上的 1..5 分級，那是 w3x 匯入的遺留欄位，**與 craftRole 無關**。
>
> `暴擊率` / `暴擊傷害` / `吸血` 的 `flat` 值是**小數比例**，不是百分點：`暴擊率 +0.17` 就是 17%。標了 `%` 的欄位才是 `pctAdd`。
>
> 背包 6 格、賣出退 40%（`packages/shared/src/sim/economy/shop.ts:11,18`）。

---

## 1. 商店貨架 shop shelf — final 且有效果（38）

真正能用金幣買的最終合成武器：`craftRole:final` 且有 `modifiers`／`passive`。白名單啟用時可能再縮小，但永遠不會放進非 final 的東西。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i006` | 雅典娜的驚嘆號 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +33% · 回魔 +13 · 法強 +333 | onBasicAttack→damage |
| `godie-i00f` | 霸王破甲槍 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +10% · 攻擊力 +10% | — |
| `godie-i00i` | 炎龍巨弩 | 最終合成 final | — | T2 | ✅ | ✅ | 魔力 +20% · 法強 +228 | onBasicAttack→damageArea |
| `godie-i00j` | 奇門盾甲 | 最終合成 final | — | T2 | ✅ | ✅ | — | onInterval→heal |
| `godie-i00u` | 名刀-天狼 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +60% · 吸血 +0.1 | onBasicAttack→damage |
| `godie-i012` | 熾天使之弓 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% | onBasicAttack→spendMana/dot |
| `godie-i013` | 緣一零式 | 最終合成 final | — | T3 | ✅ | ✅ | 攻擊力 +38 | onBasicAttack→damage/applyStatus |
| `godie-i014` | 天叢雲劍 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% · 移速 +20% | — |
| `godie-i016` | 晨曦之光 | 最終合成 final | — | T1 | ✅ | ✅ | 回魔 +8 · 冷卻縮減 +0.3 | onDamageTaken→applyBuff |
| `godie-i018` | 朗基努斯之槍 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→damage · onBasicAttack→dispel |
| `godie-i01g` | 貫雷槍 | 最終合成 final | — | T3 | ✅ | ✅ | 射程 +4 · 射程 +2 | onBasicAttack→applyStatus · onDamageTaken→applyBuff |
| `godie-i01i` | 雷神之鎚 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +20 · 法強 +130 | onBasicAttack→damageArea/applyStatus · onDamageTaken→applyBuff |
| `godie-i01j` | 靈魂魔石 | 最終合成 final | 1200g | T2 | — | ✅ | 生命 +217 · 魔力 +136 | — |
| `godie-i01o` | 死神裝束 | 最終合成 final | 1200g | T2 | — | ✅ | 攻速 +33.3% · 生命 +55 · 攻擊力 +2.8 · 魔力 +33 · 移速 +0.33 | — |
| `godie-i01v` | 螺旋劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +100% · 移速 +2 | onBasicAttack→spendMana/damageLine |
| `godie-i01w` | 祕銀鎖子甲 | 最終合成 final | — | T1 | ✅ | ✅ | 護甲 +40 · 魔抗 +66.7 | onDamageTaken→applyBuff |
| `godie-i020` | 瑪那魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +78 · 魔力 +520 · 回魔 +12 | onBasicAttack→damage |
| `godie-i027` | 光魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +目前魔力的 5% · 回魔 +18 | onBasicAttack→spendMana/damage |
| `godie-i02e` | 狂暴軒轅劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +200% | onBasicAttack→applyStatus |
| `godie-i02r` | 奇蹟之墜 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +28.9 · 魔力 +87 · 生命 +174 | — |
| `godie-i031` | 天生牙 | 最終合成 final | — | T2 | ✅ | ✅ | 回血 +20 | onKill→revive · onKill→restore · onInterval→dispel |
| `godie-i039` | 幻之匕首 | 最終合成 final | — | T2 | ✅ | ✅ | 迴避 +0.1 | onBasicAttack→damage |
| `godie-i03b` | 真．雅典娜的驚嘆號 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +81.6 · 魔力 +245 · 回魔 +81.6% | — |
| `godie-i03d` | 光明虎徹 | 最終合成 final | 300g | T1 | — | ✅ | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i03f` | 甘豆腐之袍 | 最終合成 final | — | T1 | ✅ | ✅ | 魔力 +600 · 回魔 +4 | onKill→grantAttribute |
| `godie-i03h` | 天地崩裂魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +255 · 法強 +10% | onAbilityCast→damageArea/applyStatus |
| `godie-i040` | 破甲槍 | 最終合成 final | 1200g | T2 | — | ✅ | 攻擊力 +26 | onBasicAttack→applyBuff |
| `godie-i041` | 火閃電 | 最終合成 final | 300g | T1 | — | ✅ | 移速 +0.83 | — |
| `godie-i045` | 寂靜刃 - 詠月 | 最終合成 final | 1200g | T2 | — | ✅ | 魔力 +450 · 回魔 +300% | — |
| `godie-i049` | 賢者之石 | 最終合成 final | 1200g | T2 | — | ✅ | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i04d` | 冰晶虎魄 - 改 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus · onBasicAttack→damageArea/applyStatus |
| `godie-i04i` | 厄夜鐮刀 | 最終合成 final | 1200g | T2 | — | ✅ | 回魔 +300% | — |
| `godie-i05h` | 失心匕首 | 最終合成 final | 1200g | T2 | — | ✅ | 攻擊力 +14.1 · 攻速 +28.2% | — |
| `godie-i05o` | 刺針 | 最終合成 final | 300g | T1 | — | ✅ | 攻擊力 +5.2 · 生命 +11 · 魔力 +7 | — |
| `godie-i067` | 惡夢魔王碎片 | 最終合成 final | — | T2 | ✅ | ✅ | 魔力 +2200 · 回魔 +50 · 法強 +100% | — |
| `godie-i06d` | 斬龍刀 | 最終合成 final | — | T2 | ✅ | ✅ | 攻擊力 +128 · 護甲 +12 · 暴擊率 +0.2 · 暴擊傷害 +0.25 | — |
| `godie-i06f` | 傲慢水龍王 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +300% · 回魔 +7 | — |
| `godie-i06i` | 炎神弩 | 最終合成 final | — | T2 | ✅ | ✅ | 攻擊力 +42 · 攻速 +60% | onBasicAttack→damage |

## 2. 商店服務 services（2）

真的是 `item@1` 文件，但 `buyItem` 在進背包路徑前就以 id 攔截它們：不佔格、可重複買（傳說寶玉 2400g／能力屬性強化 375g）。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `legendary-orb` | 傳說寶玉 | 商店服務 service | 2400g | T3 | — | ✅ | — | — |
| `stat-attunement` | 能力屬性強化 | 商店服務 service | 375g | T1 | — | ✅ | — | — |

## 3. 三選一 draft — quest（三選一 augment/武器卡）（13）

每回合三選一 draft 從這 13 件抽 3 張。買不到，只能抽到。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i004` | 至尊魔戒 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 魔力 +1000 · 技能吸血 +0.2 | — |
| `godie-i00z` | 四魂之玉 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 魔力 +300 | — |
| `godie-i01k` | 火焰泰坦腰帶 | 任務獎勵 quest | — | T2 | — | ✅ | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | onBasicAttack→damageArea |
| `godie-i01n` | 天堂之劍 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 生命 -50% | — |
| `godie-i01s` | 仙后座 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 迴避 +0.25 · 魔力 +100% · 回魔 +25 · 冷卻縮減 +0.5 | onInterval→dispel |
| `godie-i02h` | 戰旗 | 任務獎勵 quest | — | T5 | — | ✅ | — | — |
| `godie-i02j` | 復仇之袍 | 任務獎勵 quest | — | T5 | — | ✅ | 護甲 +12 | — |
| `godie-i02k` | 惡魔吉他 | 任務獎勵 quest | — | T5 | — | ✅ | — | — |
| `godie-i034` | 大地泰坦角盔 | 任務獎勵 quest | — | T2 | — | ✅ | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | — |
| `godie-i035` | 海潮泰坦護盾 | 任務獎勵 quest | — | T2 | — | ✅ | 攻擊力 +8 · 生命 +175 · 護甲 +2.1 | — |
| `godie-i05y` | 蜂蜜罐 | 任務獎勵 quest | — | T2 | — | ✅ | 回魔 +200.1% · 回血 +12.06 | — |
| `godie-i06j` | 獸人船長十字鎬 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |
| `godie-i06n` | 老衲的棒子 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |

## 4. 傳說池 legendary pool（49）

`content/loot-tables/legendary-weapons.json`，等權重抽取。買不到，只能從武器三選一或 2400g 傳說寶玉取得。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `bulwark-charge-greaves` | 近擊的巨人鎧 | 無角色 none | — | T5 | ✅ | ✅ | 護甲 +100 · 回血 +12 | onAbilityCast→dash |
| `cleaver-of-the-warden` | 泰坦九頭蛇 | 無角色 none | — | T5 | ✅ | ✅ | 生命 +10% | onBasicAttack→damage/damageLine |
| `endless-edge` | 無盡連刃 | 無角色 none | — | T5 | ✅ | ✅ | 攻速上限解鎖至 10 | onBasicAttack→applyBuff |
| `godie-i000` | 丈八蛇矛 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +87 · 生命 +872 | onBasicAttack→damageArea |
| `godie-i004` | 至尊魔戒 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 魔力 +1000 · 技能吸血 +0.2 | — |
| `godie-i006` | 雅典娜的驚嘆號 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +33% · 回魔 +13 · 法強 +333 | onBasicAttack→damage |
| `godie-i007` | 虛哭神去 | 無角色 none | — | T3 | ✅ | ✅ | 吸血 +0.2 | onBasicAttack→damage |
| `godie-i00f` | 霸王破甲槍 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +10% · 攻擊力 +10% | — |
| `godie-i00i` | 炎龍巨弩 | 最終合成 final | — | T2 | ✅ | ✅ | 魔力 +20% · 法強 +228 | onBasicAttack→damageArea |
| `godie-i00j` | 奇門盾甲 | 最終合成 final | — | T2 | ✅ | ✅ | — | onInterval→heal |
| `godie-i00l` | 落魂的嗜血劍 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +128 · 攻速 +200% · 攻速上限解鎖至 10 · 吸血 +0.3 · 技能吸血 +0.3 | onInterval→damage |
| `godie-i00s` | 黃金聖鬥衣 | 無角色 none | — | T2 | ✅ | ✅ | 生命 +1200 · 魔力 +1200 · 攻速 +120% · 移速 +20% | — |
| `godie-i00u` | 名刀-天狼 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +60% · 吸血 +0.1 | onBasicAttack→damage |
| `godie-i00z` | 四魂之玉 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 魔力 +300 | — |
| `godie-i012` | 熾天使之弓 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% | onBasicAttack→spendMana/dot |
| `godie-i013` | 緣一零式 | 最終合成 final | — | T3 | ✅ | ✅ | 攻擊力 +38 | onBasicAttack→damage/applyStatus |
| `godie-i014` | 天叢雲劍 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% · 移速 +20% | — |
| `godie-i016` | 晨曦之光 | 最終合成 final | — | T1 | ✅ | ✅ | 回魔 +8 · 冷卻縮減 +0.3 | onDamageTaken→applyBuff |
| `godie-i018` | 朗基努斯之槍 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→damage · onBasicAttack→dispel |
| `godie-i01d` | 死之王的長槍 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +17% | onBasicAttack→restore |
| `godie-i01g` | 貫雷槍 | 最終合成 final | — | T3 | ✅ | ✅ | 射程 +4 · 射程 +2 | onBasicAttack→applyStatus · onDamageTaken→applyBuff |
| `godie-i01i` | 雷神之鎚 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +20 · 法強 +130 | onBasicAttack→damageArea/applyStatus · onDamageTaken→applyBuff |
| `godie-i01n` | 天堂之劍 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 生命 -50% | — |
| `godie-i01s` | 仙后座 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 迴避 +0.25 · 魔力 +100% · 回魔 +25 · 冷卻縮減 +0.5 | onInterval→dispel |
| `godie-i01v` | 螺旋劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +100% · 移速 +2 | onBasicAttack→spendMana/damageLine |
| `godie-i01w` | 祕銀鎖子甲 | 最終合成 final | — | T1 | ✅ | ✅ | 護甲 +40 · 魔抗 +66.7 | onDamageTaken→applyBuff |
| `godie-i020` | 瑪那魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +78 · 魔力 +520 · 回魔 +12 | onBasicAttack→damage |
| `godie-i027` | 光魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +目前魔力的 5% · 回魔 +18 | onBasicAttack→spendMana/damage |
| `godie-i02d` | 消失的密室 | 無角色 none | — | T1 | ✅ | ✅ | 護甲 +100 · 魔抗 +200 · 攻速 +100% · 攻速上限解鎖至 10 · 移速 +4 | onBasicAttack→applyStatus |
| `godie-i02e` | 狂暴軒轅劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +200% | onBasicAttack→applyStatus |
| `godie-i031` | 天生牙 | 最終合成 final | — | T2 | ✅ | ✅ | 回血 +20 | onKill→revive · onKill→restore · onInterval→dispel |
| `godie-i039` | 幻之匕首 | 最終合成 final | — | T2 | ✅ | ✅ | 迴避 +0.1 | onBasicAttack→damage |
| `godie-i03f` | 甘豆腐之袍 | 最終合成 final | — | T1 | ✅ | ✅ | 魔力 +600 · 回魔 +4 | onKill→grantAttribute |
| `godie-i03h` | 天地崩裂魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +255 · 法強 +10% | onAbilityCast→damageArea/applyStatus |
| `godie-i03m` | 反射之盾 | 無角色 none | — | T1 | ✅ | ✅ | — | onDamageTaken→damage |
| `godie-i04d` | 冰晶虎魄 - 改 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus · onBasicAttack→damageArea/applyStatus |
| `godie-i060` | 死之王的意志 | 無角色 none | — | T2 | ✅ | ✅ | 法強 +174 | onBasicAttack→damage |
| `godie-i061` | 死之王的神盾 | 無角色 none | — | T1 | ✅ | ✅ | — | onInterval→damageArea |
| `godie-i067` | 惡夢魔王碎片 | 最終合成 final | — | T2 | ✅ | ✅ | 魔力 +2200 · 回魔 +50 · 法強 +100% | — |
| `godie-i06a` | 妖物碎殺牙 | 無角色 none | — | T2 | ✅ | ✅ | 攻擊力 +112 · 吸血 +0.15 | onBasicAttack→dot |
| `godie-i06d` | 斬龍刀 | 最終合成 final | — | T2 | ✅ | ✅ | 攻擊力 +128 · 護甲 +12 · 暴擊率 +0.2 · 暴擊傷害 +0.25 | — |
| `godie-i06e` | 月牙魔杖 | 無角色 none | — | T3 | ✅ | ✅ | 魔抗 +200 · 法強 +369 | onInterval→damageArea |
| `godie-i06f` | 傲慢水龍王 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +300% · 回魔 +7 | — |
| `godie-i06g` | 殺豬刀 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +37 · 護甲 +13 · 攻速 +30% | onBasicAttack→applyStatus |
| `godie-i06i` | 炎神弩 | 最終合成 final | — | T2 | ✅ | ✅ | 攻擊力 +42 · 攻速 +60% | onBasicAttack→damage |
| `godie-i06j` | 獸人船長十字鎬 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |
| `godie-i06n` | 老衲的棒子 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |
| `godie-i06o` | 血染八月 | 無角色 none | — | T2 | ✅ | ✅ | 攻擊力 +88 | onBasicAttack→dot · onBasicAttack→applyStatus |
| `godie-i06q` | 鍊金術之盾 | 無角色 none | — | T1 | ✅ | ✅ | — | onInterval→taunt · onDamageTaken→damage/grantGold |

## 5. final 但無 payload（暫不上架）（4）

分類是最終合成，但沒有 `modifiers`／`passive`，主動效果 schema 還裝不下（#56），所以商店拒賣。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i00c` | 風行天衣 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i02t` | 盾甲天書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i030` | 黑色魔書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i038` | 嗜血邪書 | 最終合成 final | 1200g | T2 | — | — | — | — |

## 6. 組件 component（106）

配方半成品：只在合成路徑上，不單獨上架。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i002` | 武聖手鐲 | 組件 component | 300g | T1 | — | ✅ | 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |
| `godie-i003` | 聖光石 | 組件 component | 1450g | T2 | — | ✅ | — | — |
| `godie-i005` | 初心者寶石 | 組件 component | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
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
| `godie-i01x` | 思念的守護製作書 | 組件 component | 1000g | T2 | — | — | — | — |
| `godie-i01y` | 熾天使之弓製作書 | 組件 component | 500g | T2 | — | — | — | — |
| `godie-i01z` | 八取武士刀製作書 | 組件 component | 1000g | T2 | — | — | — | — |
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
| `godie-i02x` | 斬岩刃 | 組件 component | — | T3 | — | ✅ | 攻擊力 +30.2 · 生命 +222 | onBasicAttack→damageArea |
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
| `godie-i06s` | 龍騎士之劍 | 組件 component | — | T3 | — | ✅ | 護甲 +3.4 · 攻速 +23% · 攻擊力 +34.5 · 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |

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

## 8. 其餘 none（51）

沒有 craftRole 角色的殘件，留著做 w3x 對照與未來策展。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `book-of-gospel` | 福音書 | 無角色 none | — | T5 | — | — | — | onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff · onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff · onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff |
| `collar-of-the-deadly-soul` | 致命魂之首輪 | 無角色 none | — | T5 | — | — | — | onKill→applyBuff |
| `ember-rod` | 餘燼魔杖 | 無角色 none | 300g | T1 | — | — | 法強 +31.6 | — |
| `fingerless-gloves` | 指貫手套 | 無角色 none | — | T5 | — | — | 攻擊力 +20% | onInterval→applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff |
| `godie-i001` | 出動怨念射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i008` | 初級傳送捲軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i00d` | 出動戀愛戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00e` | 出動兄貴戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00o` | 金雞蛋 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i01a` | 好像有毒的生肉 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i023` | 妖刀村正製作書 | 無角色 none | 500g | T2 | — | — | — | — |
| `godie-i02b` | 妖物碎殺牙製作書 | 無角色 none | 5500g | T4 | — | — | — | — |
| `godie-i02g` | 奇美拉之翼(電腦) | 無角色 none | 1200g | T2 | — | — | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i033` | 初心者護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.7 · 生命 +35 · 攻擊力 +1.7 · 魔力 +21 | — |
| `godie-i03j` | 黃昏公主的血脈 | 無角色 none | 450g | T1 | — | ✅ | — | — |
| `godie-i03l` | 我愛一條柴 | 無角色 none | 200g | T1 | — | — | — | — |
| `godie-i03n` | 餅乾 | 無角色 none | 150g | T1 | — | — | — | — |
| `godie-i04j` | 金幣(寶箱) | 無角色 none | — | T1 | — | — | — | — |
| `godie-i04m` | 殺豬刀製作書 | 無角色 none | 5500g | T4 | — | — | — | — |
| `godie-i04v` | 正義之杖 | 無角色 none | — | T3 | — | ✅ | 生命 +308 · 攻擊力 +15.4 · 魔力 +185 | — |
| `godie-i05k` | 打我阿笨蛋卷軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i05l` | 力量護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +0.8 · 攻擊力 +2 · 生命 +43 | — |
| `godie-i05m` | 敏捷護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +4.2 · 攻速 +11.6% | — |
| `godie-i05n` | 智慧護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.6 · 法強 +19.2 · 魔力 +57 | — |
| `godie-i05q` | 友情呼喚號角 | 無角色 none | 1200g | T2 | — | — | 攻速 +61.6% | — |
| `godie-i05z` | 出動正義射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i062` | 飛鼠跳刀 | 無角色 none | 1550g | T3 | — | — | — | — |
| `godie-i063` | 防狼電擊棒 | 無角色 none | 300g | T1 | — | — | 魔力 +185 · 回魔 +16.8% | onBasicAttack→damageArea |
| `godie-i06l` | 生肉 | 無角色 none | 150g | T1 | — | — | — | — |
| `gravity-sword-black-rod` | 重力劍〈黑棒〉 | 無角色 none | — | T5 | — | — | — | onInterval→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyStatus |
| `ironhide-vest` | 鐵皮護甲背心 | 無角色 none | 1200g | T2 | — | — | 護甲 +36.7 · 生命 +122 | — |
| `lance-kongotetsu` | 神槍・金剛徹 | 無角色 none | — | T5 | — | — | 射程 +1 | onBasicAttack→applyBuff · onBasicAttack→applyBuff |
| `magic-armor-type-zero` | 魔導鎧・零式 | 無角色 none | — | T5 | — | — | — | onAbilityCast→applyBuff · onAbilityCast→applyBuff |
| `meat-cleaver` | 肉切菜刀 | 無角色 none | — | T5 | — | — | — | onInterval→applyBuff · onBasicAttack→applyBuff · onBasicAttack→damageArea |
| `meteor-ring` | 流星之戒 | 無角色 none | — | T5 | — | — | — | onUltimateCast→applyBuff/modifyCooldown/applyBuff/applyBuff/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff |
| `mystery-scrap-of-paper` | 謎之紙片 | 無角色 none | — | T5 | — | — | 單發傷害上限 +0.2 | onDamageTaken→applyBuff |
| `odm-gear` | 立體機動裝置 | 無角色 none | — | T5 | — | — | 移速上限解鎖 +33.33% · 移速 +50% | onDashOrBlink→applyBuff |
| `pale-moon-requiem-crown` | 蒼月葬送・千年彼方花冠 | 無角色 none | — | T5 | — | — | — | onOverheal→applyBuff/shield · onOverheal→applyBuff/shield |
| `piercer-crossbow` | 穿甲弩 | 無角色 none | — | T5 | — | — | 攻擊力 +38 · 攻速 +45% | onBasicAttack→damage |
| `sage-ward-amulet` | 賢者的護身符 | 無角色 none | — | T5 | — | — | 法強 +35 · 魔力 +220 | onDamageTaken→shield |
| `serrated-edge` | 鋸齒之刃 | 無角色 none | 1200g | T2 | — | ✅ | 攻擊力 +26 | onBasicAttack→damage |
| `shining-golden-orbs` | 閃耀金玉 | 無角色 none | — | T5 | — | — | — | onStatCapReached→applyBuff/applyBuff |
| `soul-eater` | 噬魂者 | 無角色 none | — | T5 | — | — | — | onKill→restore · onKill→applyBuff · onKill→applyBuff |
| `spear-of-lightning` | 雷槍 | 無角色 none | — | T5 | — | — | — | onInterval→applyBuff · onBasicAttack→damageArea/applyStatus · onAbilityHit→damageArea/applyStatus |
| `staff-of-ainz-ooal-gown` | 安茲・烏爾・恭之杖 | 無角色 none | — | T5 | — | — | — | onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onBasicAttack→applyBuff · onAbilityCast→applyBuff |
| `stone-mask` | 石鬼面 | 無角色 none | — | T5 | — | — | — | onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff |
| `swift-boots` | 疾風之靴 | 無角色 none | 300g | T1 | — | ✅ | 移速 +0.83 | — |
| `teardrop-of-rebirth` | 再誕之淚珠 | 無角色 none | — | T5 | — | — | — | onDeath→applyBuff/delayed |
| `torch-master` | 火把師父 | 無角色 none | — | T5 | — | — | — | onBasicAttack→applyBuff · onAbilityHit→applyBuff |
| `ultimate-mod-shiranui` | 終極魔改・不知火 | 無角色 none | — | T5 | — | — | 攻擊力 +50% · 攻速 +50% · 暴擊傷害 +50% · 攻速上限解鎖至 10 | onBasicAttack→applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus · onStatCapReached→applyBuff |
| `usagizuki-twin-crescents` | 兎月【雙弦月】 | 無角色 none | — | T5 | — | — | — | onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff |


# 道具總表 / Item reference

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_a758307a451e`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**142**　·　開放名單來源：快照 `docs/reference/_curation-snapshot.json`（whitelist updatedAt `2026-08-20T16:58:56.072938Z`；英雄 49 · 道具 101 · 技能 245）；即時名單 `GET /api/v1/curation/whitelist`

`content/items/*.json` 共 **142** 份，依 `content/items/<id>.json` 的 **`craftRole`** 標記分類（來源：source-map triggers，見 `tools/w3x-import/extract_item_roles.py`）。實際能在商店買到的只有 **38** 件最終合成武器（`craftRole:final` 且有效果）＋ **2** 項服務；三選一 draft 抽 **6** 件任務道具，傳說寶玉抽 **84** 件傳說。其餘（16 組件、0 代幣、24 無角色、4 無 payload 的 final）是配方半成品或 w3x 殘件，不會單獨出現在任何商店或抽卡。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> 🗄️ **另有 112 件已退場道具不列在本表**（製作書系列 55、合成過渡期道具 38、兌換券 8）—— 它們在出貨的商店貨架與每一張抽獎表上都不存在，所以玩家拿不到。全文原封不動保存於 [`content/_legacy/items/`](../../content/_legacy/items/)，逐筆索引見 [`docs/legacy-index.md`](../../docs/legacy-index.md)。⛔ 這一行是**指標**不是清單：退場與否由檔案在哪個目錄決定，沒有第二份名單。
>
> **上架規則（task #70）**：`shopCatalogue` / `buyItem` 只讓 `craftRole === "final"` **且** 真有效果的武器上架（`packages/shared/src/sim/economy/shop.ts:110`、`apps/client/src/ui/panels/champSelectFilter.ts:150`）。元件、製作書、任務、代幣一律拒賣，即使有價格、有效果、被白名單放行也一樣。
>
> **4 件 `final` 沒有 payload**（雷神之鎚／黑色魔書…）：item@1 目前只能存 `modifiers` / `passive`，它們的主動效果 schema 還裝不下（卡在 #56），所以留在 `final` 分類但不上架，避免變成花 1200g 的空按鈕。
>
> **帶著 `quest` 舊標記的有 6 件**（owner 2026-08-18：這個標籤在競技場新玩法**完全不考慮**，它們現在照樣住在三階寶具池裡）。只有兩種商店價格：簡易 **300g**、強力 **1200g**（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。
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
| `godie-i014` | 天叢雲劍 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% · 移速 ? | — |
| `godie-i016` | 晨曦之光 | 最終合成 final | — | T1 | ✅ | ✅ | 回魔 +8 · 冷卻縮減 +0.3 | onDamageTaken→applyBuff |
| `godie-i018` | 朗基努斯之槍 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→damage · onBasicAttack→dispel |
| `godie-i01g` | 貫雷槍 | 最終合成 final | — | T3 | ✅ | ✅ | 射程 +4 · 射程 +2 | onBasicAttack→applyStatus · onDamageTaken→applyBuff |
| `godie-i01i` | 雷神之鎚 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +20 · 法強 +130 | onBasicAttack→damageArea · onDamageTaken→applyBuff |
| `godie-i01j` | 靈魂魔石 | 最終合成 final | 1200g | T2 | — | ✅ | 生命 +217 · 魔力 +136 | — |
| `godie-i01o` | 死神裝束 | 最終合成 final | 1200g | T2 | — | ✅ | 攻速 +33.3% · 生命 +55 · 攻擊力 +2.8 · 魔力 +33 · 移速 +0.33 | — |
| `godie-i01v` | 螺旋劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +100% · 移速 +2 | onBasicAttack→spendMana/damageLine/spawnModelFx |
| `godie-i01w` | 祕銀鎖子甲 | 最終合成 final | — | T1 | ✅ | ✅ | 護甲 +40 · 魔抗 +66.7 | onDamageTaken→applyBuff |
| `godie-i020` | 瑪那魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +78 · 魔力 +520 · 回魔 +12 | onBasicAttack→damage |
| `godie-i027` | 光魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +目前魔力的 5% · 回魔 +18 | onBasicAttack→spendMana/damage |
| `godie-i02e` | 狂暴軒轅劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +200% | onBasicAttack→applyStatus |
| `godie-i02r` | 奇蹟之墜 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +28.9 · 魔力 +87 · 生命 +174 | — |
| `godie-i031` | 天生牙 | 最終合成 final | — | T2 | ✅ | ✅ | 回血 +20 | onKill→revive · onKill→restore · onInterval→dispel |
| `godie-i039` | 幻之匕首 | 最終合成 final | — | T2 | ✅ | ✅ | 迴避 +0.1 | onBasicAttack→damage/spawnVfx |
| `godie-i03b` | 真．雅典娜的驚嘆號 | 最終合成 final | 1200g | T2 | — | ✅ | 法強 +81.6 · 魔力 +245 · 回魔 +81.6% | — |
| `godie-i03d` | 光明虎徹 | 最終合成 final | 300g | T1 | — | ✅ | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i03f` | 甘豆腐之袍 | 最終合成 final | — | T1 | ✅ | ✅ | 魔力 +600 · 回魔 +4 | onKill→grantAttribute |
| `godie-i03h` | 天地崩裂魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +255 · 法強 +10% | onAbilityCast→damageArea |
| `godie-i040` | 破甲槍 | 最終合成 final | 1200g | T2 | — | ✅ | 攻擊力 +26 | onBasicAttack→applyBuff |
| `godie-i041` | 火閃電 | 最終合成 final | 300g | T1 | — | ✅ | 移速 +0.83 | — |
| `godie-i045` | 寂靜刃 - 詠月 | 最終合成 final | 1200g | T2 | — | ✅ | 魔力 +450 · 回魔 +300% | — |
| `godie-i049` | 賢者之石 | 最終合成 final | 1200g | T2 | — | ✅ | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i04d` | 冰晶虎魄 - 改 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus · onBasicAttack→damageArea |
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

## 3. 舊標記 quest（⚠️ 已不是一個取得面）（6）

這 6 件帶著 w3x 匯入留下的 `craftRole:"quest"` 標記。owner 2026-08-18：「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮這個標籤**」—— 它們的取得路徑跟其他寶具一樣，就是三階寶具池。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i004` | 至尊魔戒 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 魔力 +1000 · 技能吸血 +0.2 | — |
| `godie-i00z` | 四魂之玉 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 魔力 +300 | — |
| `godie-i01n` | 天堂之劍 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 生命 -50% | — |
| `godie-i01s` | 仙后座 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 迴避 +0.25 · 魔力 +100% · 回魔 +25 · 冷卻縮減 +0.5 | onEvade→dash · onInterval→dispel |
| `godie-i06j` | 獸人船長十字鎬 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |
| `godie-i06n` | 老衲的棒子 | 任務獎勵 quest | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus |

## 4. 寶具池 weapon pools（三階）（84）

三張表等權重抽取（`legendary-weapons` · `ex-release-weapons` · `ex-origin-weapons`）。買不到，只能從寶具三選一或 2400g 傳說寶玉取得。⭐ 一件寶具**只屬於一個池**。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `all-might-hair` | 歐爾麥特的頭髮 | 無角色 none | — | T5 | ✅ | — | — | onAllyDeath→applyBuff |
| `bezoar-of-the-apothecary` | 藥師少女的牛黃 | 無角色 none | — | T5 | ✅ | — | — | onStatusApplied→dispel/restore/applyBuff |
| `book-of-gospel` | 福音書 | 無角色 none | — | T5 | ✅ | ✅ | — | onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff · onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff · onAbilityCast→applyBuff/modifyCooldown/applyBuff/applyBuff |
| `bulwark-charge-greaves` | 近擊的巨人鎧 | 無角色 none | — | T5 | ✅ | ✅ | 護甲 +100 · 回血 +12 | onAbilityCast→dash |
| `cleaver-of-the-warden` | 泰坦九頭蛇 | 無角色 none | — | T5 | ✅ | ✅ | 生命 +10% | onBasicAttack→damage/damageLine |
| `collar-of-the-deadly-soul` | 致命魂之首輪 | 無角色 none | — | T5 | ✅ | ✅ | — | onKill→applyBuff |
| `endless-edge` | 無盡連刃 | 無角色 none | — | T5 | ✅ | ✅ | 攻速上限解鎖至 10 | onBasicAttack→applyBuff |
| `fingerless-gloves` | 指貫手套 | 無角色 none | — | T5 | ✅ | ✅ | 攻擊力 +20% | onInterval→applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff/applyBuff |
| `gantz-suit` | GANTZ Suit | 無角色 none | — | T5 | ✅ | — | — | — |
| `godie-i000` | 丈八蛇矛 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +87 · 生命 +872 | onBasicAttack→damageArea |
| `godie-i004` | 至尊魔戒 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 魔力 +1000 · 技能吸血 +0.2 | — |
| `godie-i006` | 雅典娜的驚嘆號 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +33% · 回魔 +13 · 法強 +333 | onBasicAttack→damage |
| `godie-i007` | 虛哭神去 | 無角色 none | — | T3 | ✅ | ✅ | 吸血 +0.2 | onBasicAttack→damage |
| `godie-i00f` | 霸王破甲槍 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +10% · 攻擊力 +10% | — |
| `godie-i00i` | 炎龍巨弩 | 最終合成 final | — | T2 | ✅ | ✅ | 魔力 +20% · 法強 +228 | onBasicAttack→damageArea |
| `godie-i00j` | 奇門盾甲 | 最終合成 final | — | T2 | ✅ | ✅ | — | onInterval→heal |
| `godie-i00l` | 落魂的嗜血劍 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +128 · 攻速 +200% · 攻速上限解鎖至 10 · 吸血 +0.3 · 技能吸血 +0.3 | onInterval→damage |
| `godie-i00s` | 黃金聖鬥衣 | 無角色 none | — | T2 | ✅ | ✅ | 生命 +1200 · 魔力 +1200 · 攻速 +120% · 移速 ? | — |
| `godie-i00u` | 名刀-天狼 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +60% · 吸血 +0.1 | onBasicAttack→damage |
| `godie-i00z` | 四魂之玉 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 魔力 +300 | — |
| `godie-i012` | 熾天使之弓 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% | onBasicAttack→spendMana/dot |
| `godie-i013` | 緣一零式 | 最終合成 final | — | T3 | ✅ | ✅ | 攻擊力 +38 | onBasicAttack→damage/applyStatus |
| `godie-i014` | 天叢雲劍 | 最終合成 final | — | T3 | ✅ | ✅ | 攻速 +30% · 移速 ? | — |
| `godie-i016` | 晨曦之光 | 最終合成 final | — | T1 | ✅ | ✅ | 回魔 +8 · 冷卻縮減 +0.3 | onDamageTaken→applyBuff |
| `godie-i018` | 朗基努斯之槍 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→damage · onBasicAttack→dispel |
| `godie-i01d` | 死之王的長槍 | 無角色 none | — | T3 | ✅ | ✅ | 攻擊力 +17% | onBasicAttack→restore/damage |
| `godie-i01g` | 貫雷槍 | 最終合成 final | — | T3 | ✅ | ✅ | 射程 +4 · 射程 +2 | onBasicAttack→applyStatus · onDamageTaken→applyBuff |
| `godie-i01i` | 雷神之鎚 | 最終合成 final | — | T2 | ✅ | ✅ | 護甲 +20 · 法強 +130 | onBasicAttack→damageArea · onDamageTaken→applyBuff |
| `godie-i01n` | 天堂之劍 | 任務獎勵 quest | — | T2 | ✅ | ✅ | 生命 -50% | — |
| `godie-i01s` | 仙后座 | 任務獎勵 quest | — | T1 | ✅ | ✅ | 迴避 +0.25 · 魔力 +100% · 回魔 +25 · 冷卻縮減 +0.5 | onEvade→dash · onInterval→dispel |
| `godie-i01v` | 螺旋劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +100% · 移速 +2 | onBasicAttack→spendMana/damageLine/spawnModelFx |
| `godie-i01w` | 祕銀鎖子甲 | 最終合成 final | — | T1 | ✅ | ✅ | 護甲 +40 · 魔抗 +66.7 | onDamageTaken→applyBuff |
| `godie-i020` | 瑪那魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +78 · 魔力 +520 · 回魔 +12 | onBasicAttack→damage |
| `godie-i027` | 光魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +目前魔力的 5% · 回魔 +18 | onBasicAttack→spendMana/damage |
| `godie-i02d` | 消失的密室 | 無角色 none | — | T1 | ✅ | ✅ | 護甲 +100 · 魔抗 +200 · 攻速 +100% · 攻速上限解鎖至 10 · 移速 +4 | onBasicAttack→applyStatus |
| `godie-i02e` | 狂暴軒轅劍 | 最終合成 final | — | T2 | ✅ | ✅ | 攻速 +200% | onBasicAttack→applyStatus |
| `godie-i031` | 天生牙 | 最終合成 final | — | T2 | ✅ | ✅ | 回血 +20 | onKill→revive · onKill→restore · onInterval→dispel |
| `godie-i039` | 幻之匕首 | 最終合成 final | — | T2 | ✅ | ✅ | 迴避 +0.1 | onBasicAttack→damage/spawnVfx |
| `godie-i03f` | 甘豆腐之袍 | 最終合成 final | — | T1 | ✅ | ✅ | 魔力 +600 · 回魔 +4 | onKill→grantAttribute |
| `godie-i03h` | 天地崩裂魔杖 | 最終合成 final | — | T2 | ✅ | ✅ | 法強 +255 · 法強 +10% | onAbilityCast→damageArea |
| `godie-i03m` | 反射之盾 | 無角色 none | — | T1 | ✅ | ✅ | — | onDamageTaken→damage |
| `godie-i04d` | 冰晶虎魄 - 改 | 最終合成 final | — | T2 | ✅ | ✅ | — | onBasicAttack→applyStatus · onBasicAttack→damageArea |
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
| `gravity-sword-black-rod` | 重力劍〈黑棒〉 | 無角色 none | — | T5 | ✅ | ✅ | — | onInterval→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyStatus |
| `grief-seed` | 悲嘆之種 | 無角色 none | — | T5 | ✅ | — | — | onStatusApplied→applyStatus · onStatusApplied→applyStatus/dispel/restore/modifyCooldown/modifyCooldown/modifyCooldown/modifyCooldown/modifyCooldown |
| `icha-icha-paradise` | 親熱天堂 | 無角色 none | — | T5 | ✅ | — | — | onAbilityCast→restore · onAbilityHit→applyStatus/knockback |
| `lance-kongotetsu` | 神槍・金剛徹 | 無角色 none | — | T5 | ✅ | ✅ | 射程 +1 | onBasicAttack→applyBuff · onBasicAttack→applyBuff |
| `magic-armor-type-zero` | 魔導鎧・零式 | 無角色 none | — | T5 | ✅ | ✅ | — | onAbilityCast→applyBuff · onAbilityCast→applyBuff |
| `master-ball` | 大師球 | 無角色 none | — | T5 | ✅ | — | — | onDamageDealt→convertTeam/applyBuff/restore |
| `meat-cleaver` | 肉切菜刀 | 無角色 none | — | T5 | ✅ | ✅ | — | onInterval→applyBuff · onBasicAttack→applyBuff · onBasicAttack→damageArea |
| `meteor-ring` | 流星之戒 | 無角色 none | — | T5 | ✅ | ✅ | — | onUltimateCast→applyBuff/modifyCooldown/applyBuff/applyBuff/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff · onAbilityCast→applyBuff/restore/modifyCooldown/applyBuff |
| `millennium-puzzle` | 千年積木 | 無角色 none | — | T5 | ✅ | — | — | — |
| `mystery-scrap-of-paper` | 謎之紙片 | 無角色 none | — | T5 | ✅ | ✅ | 單發傷害上限 +0.2 | onDamageTaken→applyBuff |
| `nezuko-box` | 禰豆子的木箱 | 無角色 none | — | T5 | ✅ | — | — | onInterval→carry |
| `odm-gear` | 立體機動裝置 | 無角色 none | — | T5 | ✅ | ✅ | 移速上限解鎖 +33.33% · 移速 ? | onDashOrBlink→applyBuff |
| `pale-moon-requiem-crown` | 蒼月葬送・千年彼方花冠 | 無角色 none | — | T5 | ✅ | ✅ | — | onOverheal→applyBuff/shield · onOverheal→applyBuff/shield |
| `red-comet-mask` | 赤色面具 | 無角色 none | — | T5 | ✅ | — | — | onAllyDeath→applyBuff |
| `sasumata` | 討伐叉 | 無角色 none | — | T5 | ✅ | — | — | — |
| `scouter` | 戰鬥力探測器 | 無角色 none | — | T5 | ✅ | — | — | onDamageTaken→taunt |
| `senzu-bean` | 仙豆 | 無角色 none | — | T5 | ✅ | — | — | onDamageTaken→restore/dispel/applyBuff · onAllyDamaged→applyBuff/restore/dispel/applyBuff |
| `shining-golden-orbs` | 閃耀金玉 | 無角色 none | — | T5 | ✅ | ✅ | — | onStatCapReached→applyBuff/applyBuff |
| `slime-suit` | 史萊姆裝 | 無角色 none | — | T5 | ✅ | — | — | — |
| `soul-eater` | 噬魂者 | 無角色 none | — | T5 | ✅ | ✅ | — | onKill→restore · onKill→applyBuff · onKill→applyBuff |
| `soul-gem` | 魂之寶石 | 無角色 none | — | T5 | ✅ | — | — | onDeath→applyBuff/delayed/delayed · onKill→applyBuff/restore |
| `spear-of-lightning` | 雷槍 | 無角色 none | — | T5 | ✅ | ✅ | — | onInterval→applyBuff · onBasicAttack→damageArea · onAbilityHit→damageArea |
| `staff-of-ainz-ooal-gown` | 安茲・烏爾・恭之杖 | 無角色 none | — | T5 | ✅ | ✅ | — | onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onAbilityCast→applyBuff · onBasicAttack→applyBuff · onAbilityCast→applyBuff |
| `stone-mask` | 石鬼面 | 無角色 none | — | T5 | ✅ | ✅ | — | onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff · onDamageTaken→applyBuff |
| `teardrop-of-rebirth` | 再誕之淚珠 | 無角色 none | — | T5 | ✅ | ✅ | — | onDeath→applyBuff/delayed |
| `torch-master` | 火把師父 | 無角色 none | — | T5 | ✅ | ✅ | — | onBasicAttack→applyBuff · onAbilityHit→applyBuff |
| `touyako` | 洞爺湖 | 無角色 none | — | T5 | ✅ | — | — | onCrowdControlReceived→dispel · onCrowdControlReceived→damage/applyStatus |
| `ultimate-mod-shiranui` | 終極魔改・不知火 | 無角色 none | — | T5 | ✅ | ✅ | 攻擊力 +50% · 攻速 +50% · 暴擊傷害 +50% · 攻速上限解鎖至 10 | onBasicAttack→applyStatus/applyBuff/applyStatus/applyStatus/dot/applyStatus/applyStatus/applyStatus/applyStatus/applyStatus/applyBuff/applyStatus/applyStatus/applyBuff/applyStatus/applyStatus/applyStatus/applyStatus · onStatCapReached→applyBuff |
| `usagizuki-twin-crescents` | 兎月【雙弦月】 | 無角色 none | — | T5 | ✅ | ✅ | — | onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff · onBasicAttack→applyBuff |

## 5. final 但無 payload（暫不上架）（4）

分類是最終合成，但沒有 `modifiers`／`passive`，主動效果 schema 還裝不下（#56），所以商店拒賣。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i00c` | 風行天衣 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i02t` | 盾甲天書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i030` | 黑色魔書 | 最終合成 final | 1200g | T2 | — | — | — | — |
| `godie-i038` | 嗜血邪書 | 最終合成 final | 1200g | T2 | — | — | — | — |

## 6. 組件 component（16）

配方半成品：只在合成路徑上，不單獨上架。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i002` | 武聖手鐲 | 組件 component | 300g | T1 | — | ✅ | 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |
| `godie-i003` | 聖光石 | 組件 component | 1450g | T2 | — | ✅ | — | — |
| `godie-i00m` | 米索莉護板 | 組件 component | 300g | T1 | — | ✅ | 護甲 +17 | — |
| `godie-i010` | 熱戀魔杖 | 組件 component | 300g | T1 | — | ✅ | 法強 +21.1 · 魔力 +63 | — |
| `godie-i02x` | 斬岩刃 | 組件 component | — | T3 | — | ✅ | 攻擊力 +30.2 · 生命 +222 | onBasicAttack→damageArea |
| `godie-i04b` | 冰晶虎魄 | 組件 component | 1200g | T2 | — | ✅ | 法強 +27.7 · 魔力 +83 · 攻擊力 +5.5 · 生命 +122 | onBasicAttack→applyStatus |
| `godie-i05r` | 吸血石 | 組件 component | 300g | T1 | — | ✅ | 吸血 +0.27 | — |
| `godie-i05t` | 定情戒指 | 組件 component | 300g | T1 | — | ✅ | 回血 +3.28 | — |
| `godie-i05u` | 熱舞之靴 | 組件 component | 300g | T1 | — | ✅ | 移速 +0.83 | — |
| `godie-i05v` | 破壞王手套 | 組件 component | 300g | T1 | — | ✅ | 攻速 +15.4% | — |
| `godie-i05x` | 辣妹護腕 | 組件 component | 300g | T1 | — | ✅ | 魔抗 +37.8 | — |
| `godie-i068` | 瑪那寶石 | 組件 component | 300g | T1 | — | ✅ | 魔力 +190 | — |
| `godie-i06c` | 恐龍之斧 | 組件 component | 1200g | T2 | — | ✅ | 攻擊力 +8.2 · 生命 +181 | — |
| `godie-i06h` | 求生護腕 | 組件 component | 300g | T1 | — | ✅ | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i06k` | 奧理哈魯根劍身 | 組件 component | 1200g | T2 | — | ✅ | 攻擊力 +26 | — |
| `godie-i06s` | 龍騎士之劍 | 組件 component | — | T3 | — | ✅ | 護甲 +3.4 · 攻速 +23% · 攻擊力 +34.5 · 暴擊率 +0.17 · 暴擊傷害 +0.29 | — |

## 7. 代幣 token（0）

任務／成就代幣，不是可裝備的道具。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|

## 8. 其餘 none（24）

沒有 craftRole 角色的殘件，留著做 w3x 對照與未來策展。

| id | 名稱 | craftRole | 價格 | tier | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |
|---|---|---|---|---|---|---|---|---|
| `godie-i001` | 出動怨念射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i008` | 初級傳送捲軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i00d` | 出動戀愛戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00e` | 出動兄貴戰士兵團 | 無角色 none | 1600g | T3 | — | — | — | — |
| `godie-i00o` | 金雞蛋 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i01a` | 好像有毒的生肉 | 無角色 none | — | T1 | — | — | — | — |
| `godie-i02g` | 奇美拉之翼(電腦) | 無角色 none | 1200g | T2 | — | — | 生命 +154 · 攻擊力 +7.7 · 魔力 +93 | — |
| `godie-i033` | 初心者護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.7 · 生命 +35 · 攻擊力 +1.7 · 魔力 +21 | — |
| `godie-i03j` | 黃昏公主的血脈 | 無角色 none | 450g | T1 | — | ✅ | — | — |
| `godie-i03l` | 我愛一條柴 | 無角色 none | 200g | T1 | — | — | — | — |
| `godie-i03n` | 餅乾 | 無角色 none | 150g | T1 | — | — | — | — |
| `godie-i04j` | 金幣(寶箱) | 無角色 none | — | T1 | — | — | — | — |
| `godie-i04v` | 正義之杖 | 無角色 none | — | T3 | — | ✅ | 生命 +308 · 攻擊力 +15.4 · 魔力 +185 | — |
| `godie-i05k` | 打我阿笨蛋卷軸 | 無角色 none | 300g | T1 | — | — | 生命 +39 · 攻擊力 +1.9 · 魔力 +23 | — |
| `godie-i05l` | 力量護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +0.8 · 攻擊力 +2 · 生命 +43 | — |
| `godie-i05m` | 敏捷護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +4.2 · 攻速 +11.6% | — |
| `godie-i05n` | 智慧護腕 | 無角色 none | 300g | T1 | — | — | 護甲 +1.6 · 法強 +19.2 · 魔力 +57 | — |
| `godie-i05q` | 友情呼喚號角 | 無角色 none | 1200g | T2 | — | — | 攻速 +61.6% | — |
| `godie-i05z` | 出動正義射手兵團 | 無角色 none | 1200g | T2 | — | — | — | — |
| `godie-i062` | 飛鼠跳刀 | 無角色 none | 1550g | T3 | — | — | — | — |
| `godie-i063` | 防狼電擊棒 | 無角色 none | — | T1 | — | — | 魔力 +185 · 回魔 +16.8% | onBasicAttack→damageArea |
| `godie-i06l` | 生肉 | 無角色 none | 150g | T1 | — | — | — | — |
| `piercer-crossbow` | 穿甲弩 | 無角色 none | — | T5 | — | — | 攻擊力 +38 · 攻速 +45% | onBasicAttack→damage |
| `sage-ward-amulet` | 賢者的護身符 | 無角色 none | — | T5 | — | — | 法強 +35 · 魔力 +220 | onDamageTaken→shield |


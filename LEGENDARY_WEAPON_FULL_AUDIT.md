# 49 件傳說武器全量收容稽核

狀態：**規劃證據；全部收容；本專案的新 Editor 與完整 mechanics + 3D Preview 尚未實作**  
日期：2026-08-04  
GGD 基線：`main@81826f9ffc8f1561fe99dbd5628576645f321664`

## 1. 收容邊界

傳說武器的權威集合是 `content/loot-tables/legendary-weapons.json`，不使用 tag、tier、名稱或 `craftRole` 推測。基線實際為：

- 49 個 entries、49 個 unique item ids、49 份 `item@1` documents，沒有缺檔。
- Go starter curation whitelist 49／49，沒有漏項。
- Arena round 2 與 round 5 會使用此 table。
- 49 份的 `draftEligible:false` 為 0。
- 49 份的 explicit VFX-like refs 為 0；不得由道具名稱或附近 asset 猜綁定。

GGD 現有 `tools/legendary-status/status.py --print` 在此 commit 回報 49／49 件、139／139 條「效能」文案行有對應資料。Round-card 通道可跨職業到達全部 49 件，但 effective reachability 會依通道與攻擊型態改變：round 初始池 melee 48／ranged 44，Legendary Orb 初始池 melee 41／ranged 36；Orb 另排除 8 件 `craftRole:component`：`i006`、`i00u`、`i012`、`i013`、`i014`、`i01g`、`i01w`、`i020`。這是已實際執行的**淺層收容檢查**；產生器自己明言，它不證明 handler 行為、交互、VFX 或 Preview 正確。

Editor 的「收容」因此代表：

1. 可無損讀取、編輯、重開與編譯此 49 件。
2. 每件都有至少一個 deterministic mechanics scenario。
3. 每種實際 payload／hook／interaction 都在 capability matrix 有正例、邊界與反例。
4. 每件都完成 stat／mechanics／visual 三層 verdict；unknown 不計 passed。
5. 部分／完整 JSON／ZIP 都能經 importer dry-run 重建可達的同一結果。

## 2. 全量 capability 盤點

| Authoring surface | 收容件數 |
|---|---:|
| modifiers | 40 |
| attributes | 2 |
| passive hooks | 39 |
| auras | 3 |
| sets | 3 |
| recipes | 18 |
| requiresAttackType | 6 |
| vision | 2 |
| flight | 1 |
| damageTypeOverride | 3 |
| block | 4 |
| critStrike | 1 |

Hook event coverage（含該 hook 的 item 文件數／節點 occurrence）：`onBasicAttack` 27／29、`onDamageTaken` 6／6、`onInterval` 5／5、`onAbilityCast` 2／2、`onKill` 2／3。目前沒有 `onEvade`；`godie-i01s` 的文案正是已知 runtime 缺口。

Effect kind 收容：

| Effect kind | item 文件數／節點數 | Effect kind | item 文件數／節點數 |
|---|---:|---|---:|
| damage | 14／14 | applyStatus | 11／12 |
| damageArea | 8／8 | applyBuff | 5／5 |
| dot | 3／3 | spendMana | 3／3 |
| restore | 2／2 | damageLine | 1／1 |
| dash | 1／1 | grantAttribute | 1／1 |
| grantGold | 1／1 | heal | 1／1 |
| revive | 1／1 | taunt | 1／1 |

上表是 corpus presence，不是 semantic coverage。例如 `damageArea` 與 `applyStatus` 各自存在，仍無法證明兩者使用同一 victims set。

## 3. 49 件完整 inventory

「收容；scenario 待 Editor 實作」不等於 production-ready；它表示該 ID 已被正式納入必做驗收清單，不再抽樣排除。

| Item id | 名稱 | 實際 authoring surfaces | 收容狀態 |
|---|---|---|---|
| `bulwark-charge-greaves` | 近擊的巨人鎧 | stats×2; hooks:onAbilityCast→dash; gate:melee+STR | 收容；description gate review |
| `cleaver-of-the-warden` | 泰坦九頭蛇 | stats×1; hooks:onBasicAttack→damage/damageArea; gate:melee | 收容；scenario 待 Editor 實作 |
| `endless-edge` | 無盡連刃 | stats×1; hooks:onBasicAttack→applyBuff; gate:melee | 收容；scenario 待 Editor 實作 |
| `godie-i000` | 丈八蛇矛 | stats×2; hooks:onBasicAttack→damageArea; gate:melee | 收容；scenario 待 Editor 實作 |
| `godie-i004` | 至尊魔戒 | stats×1; vision | 收容；scenario 待 Editor 實作 |
| `godie-i006` | 雅典娜的驚嘆號 | stats×2; hooks:onBasicAttack→damage | 收容；scenario 待 Editor 實作 |
| `godie-i007` | 虛哭神去 | stats×1; hooks:onBasicAttack→damage | 收容；scenario 待 Editor 實作 |
| `godie-i00f` | 霸王破甲槍 | stats×2; damageTypeOverride; gate:melee; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i00i` | 炎龍巨弩 | stats×1; hooks:onBasicAttack→damageArea; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i00j` | 奇門盾甲 | hooks:onInterval→heal; block; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i00l` | 落魂的嗜血劍 | stats×4; hooks:onInterval→damage | 收容；scenario 待 Editor 實作 |
| `godie-i00s` | 黃金聖鬥衣 | stats×4; block | 收容；scenario 待 Editor 實作 |
| `godie-i00u` | 名刀-天狼 | stats×2; hooks:onBasicAttack→damage | 收容；scenario 待 Editor 實作 |
| `godie-i00z` | 四魂之玉 | stats×1; attributes; auras×1 | 收容；scenario 待 Editor 實作 |
| `godie-i012` | 熾天使之弓 | stats×1; hooks:onBasicAttack→spendMana/dot; gate:ranged | 收容；scenario 待 Editor 實作 |
| `godie-i013` | 緣一零式 | stats×1; hooks:onBasicAttack→damage/applyStatus | 收容；scenario 待 Editor 實作 |
| `godie-i014` | 天叢雲劍 | stats×2; flight | 收容；scenario 待 Editor 實作 |
| `godie-i016` | 晨曦之光 | stats×1; hooks:onDamageTaken→applyBuff; vision; block; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i018` | 朗基努斯之槍 | attributes; hooks:onBasicAttack→damage; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i01d` | 死之王的長槍 | stats×1; hooks:onBasicAttack→restore; set; damageTypeOverride | 收容；missing documented damage review |
| `godie-i01g` | 貫雷槍 | stats×2; hooks:onBasicAttack/onDamageTaken→applyStatus/applyBuff | 收容；scenario 待 Editor 實作 |
| `godie-i01i` | 雷神之鎚 | stats×2; hooks:onBasicAttack/onDamageTaken→damageArea/applyStatus/applyBuff; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i01n` | 天堂之劍 | stats×1; critStrike | 收容；scenario 待 Editor 實作 |
| `godie-i01s` | 仙后座 | stats×3; missing onEvade hook | 收容；runtime blocker |
| `godie-i01v` | 螺旋劍 | stats×2; hooks:onBasicAttack→spendMana/damageLine; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i01w` | 祕銀鎖子甲 | stats×2; hooks:onDamageTaken→applyBuff | 收容；scenario 待 Editor 實作 |
| `godie-i020` | 瑪那魔杖 | stats×3; hooks:onBasicAttack→damage | 收容；scenario 待 Editor 實作 |
| `godie-i027` | 光魔杖 | stats×2; hooks:onBasicAttack→spendMana/damage; recipe | 收容；current-vs-max mana review |
| `godie-i02d` | 消失的密室 | stats×5; hooks:onBasicAttack→applyStatus | 收容；scenario 待 Editor 實作 |
| `godie-i02e` | 狂暴軒轅劍 | stats×1; hooks:onBasicAttack→applyStatus; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i031` | 天生牙 | stats×1; hooks:onKill→revive/restore; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i039` | 幻之匕首 | stats×1; hooks:onBasicAttack→damage; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i03f` | 甘豆腐之袍 | stats×2; hooks:onKill→grantAttribute; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i03h` | 天地崩裂魔杖 | stats×2; hooks:onAbilityCast→damageArea/applyStatus; recipe | 收容；target-set runtime blocker |
| `godie-i03m` | 反射之盾 | hooks:onDamageTaken→damage | 收容；scenario 待 Editor 實作 |
| `godie-i04d` | 冰晶虎魄 - 改 | hooks:onBasicAttack→applyStatus/damageArea; gate:melee; recipe | 收容；target-set review |
| `godie-i060` | 死之王的意志 | hooks:onBasicAttack→damage; auras×1; set | 收容；scenario 待 Editor 實作 |
| `godie-i061` | 死之王的神盾 | hooks:onInterval→damageArea; auras×1; set | 收容；scenario 待 Editor 實作 |
| `godie-i067` | 惡夢魔王碎片 | stats×3; damageTypeOverride; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i06a` | 妖物碎殺牙 | stats×2; hooks:onBasicAttack→dot | 收容；scenario 待 Editor 實作 |
| `godie-i06d` | 斬龍刀 | stats×4; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i06e` | 月牙魔杖 | stats×1; hooks:onInterval→damageArea | 收容；scenario 待 Editor 實作 |
| `godie-i06f` | 傲慢水龍王 | stats×2; recipe | 收容；scenario 待 Editor 實作 |
| `godie-i06g` | 殺豬刀 | stats×3; hooks:onBasicAttack→applyStatus; block | 收容；visual fidelity review |
| `godie-i06i` | 炎神弩 | stats×2; hooks:onBasicAttack→damage; recipe | 收容；description/cooldown review |
| `godie-i06j` | 獸人船長十字鎬 | hooks:onBasicAttack→applyStatus | 收容；scenario 待 Editor 實作 |
| `godie-i06n` | 老衲的棒子 | hooks:onBasicAttack→applyStatus | 收容；scenario 待 Editor 實作 |
| `godie-i06o` | 血染八月 | stats×1; hooks:onBasicAttack→dot/applyStatus | 收容；timing/damage mismatch；stacking 待 scenario 確認 |
| `godie-i06q` | 鍊金術之盾 | hooks:onInterval/onDamageTaken→taunt/damage/grantGold | 收容；kill/reward edge review |

## 4. 已知不能由淺層「49／49」蓋掉的問題

| 類型 | 代表 items | Editor／遊戲端必做的處理 |
|---|---|---|
| 共用 AOE target set | `i01i`、`i03h`、`i04d` | `damageArea` victims 必須明示傳入後續 `applyStatus`；不得以平面 effects 假通過 |
| 區域每位受害者的 child DoT | `i00i` | 除 victims propagation 外，還要表達每位區域受害者各自套 3 秒 DoT／分時傷害 |
| 缺 runtime hook | `i01s` | 遊戲端 `hook.on-evade@1`；完成前 blocker |
| 時間量化／DoT 總量 | `i06o` | 已證實 29.33×3=87.99 對文案 88、0.034s 對文案 0.01s；UI 顯示 authored seconds／ticks／actual seconds。重複 proc 的 refresh／stack／independent 尚待 scenario／owner 確認，不冒充已證實衝突 |
| 文案詞義與 runtime 數學不同 | `i00l`、`i01g` | 產生 owner decision；依既有 typed mechanism 重做或接受 runtime；缺能力才提出新機制 |
| 文案已可用現有 primitive 表達 | `i01d`、`i027` | `i01d` 文案的敵方現存 MP 10% 傷害已有 `damage.resourcePct`；JSON 只做 restore。`i027` 文案的現存 MP 5% 已有 `spendMana.pctCurrentMana`；JSON 使用 `pctMaxMana`。兩者由 owner 選文案或現況，不需先新增 runtime primitive |
| 描述未寫 runtime 限制 | `bulwark-charge-greaves`、`i06i` | 詢問 owner 是改機制還是改 description；不自動選 |
| 視覺承諾無權威綁定 | `i03h`、`i06g` 及全 49 件 explicit VFX=0 | 顯示 runtime-derived／missing；不由名稱猜 asset |
| authoringNote 新舊句衝突 | `i004`、`i014` 等 | note 只作 evidence，capability 必須從 typed fields／handler／tests 計算 |
| Preview 只做 equip + stat recompute | 完全零 stat-delta：`i00j`、`i03m`、`i04d`、`i060`、`i061`、`i06j`、`i06n`、`i06q` | 現有 `previewItem()` 已 `attachItemSource()` 到 sandbox SimWorld；真正缺的是建立敵我實體、觸發 attack／cast／damage／interval／kill、推進 ticks、消費事件並 render。`i00s`、`i031` 有 stat delta，但 block／revive 仍未預覽 |

## 5. 全量 release 完成條件

- 49／49 都有 item-authoring round-trip 與至少一個 mechanics scenario。
- 49／49 都有新鮮的 Fidelity Decision：接受 runtime、依 description／JASS 使用現有 typed mechanism 重做，或 request-new-capability；無裁決 conflict 與尚未實作的新 capability 不得計 passed。
- 全部 top-level payload、hook event、effect kind 與交互組合至少有一個正例／邊界／反例。
- 全部 recipe／set／aura hook／distribution／attack gate／VFX／asset refs 由 schema-driven walker 嚴格掃描。
- 每件項目顯示 `contentReachable` 與 `effectiveReachableUnderCuration`，不只顯示「文件存在」。
- 全 49 件都通過 partial delta JSON／ZIP 及 full snapshot JSON／ZIP 的 reopen、recompile、digest compare。
- stat、mechanics、visual 結果分開；任何 missing runtime capability／provenance／asset 都是 `unknown` 或 blocker，不是 passed。

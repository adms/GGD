# 43 主題／46 技能 Codex 視覺與 no-code 審閱

- 證據包指紋：`597e43726af004b5aeac1420d716d0980bd7c8ea9c24c8bbd2b844b7cef118ea`
- 過期單位：逐份技能文件（改一份只作廢一份，其餘保留原審閱）
- 分母：驗收包 47 列 · 已擷取 46 份 · 本頁審閱 46 份 · ⚠️ 等待擷取 1（godie-u034.passive）
- 審閱新鮮度：current 45 · stale 1
- 審閱時間：2026-09-04T06:19:27+08:00
- 視覺平均分（只算 current）：4.62/10
- 分流：editor-rework 30 · main-blocked 7 · ready-for-owner-review 8
- no-code：ready 29 · effect-graph bridge 16 · blocked 0

> 這是 Codex advisory，不是 Owner 批核。SimWorld／事件 trace 判定機制；Owner 肉眼 verdict 決定是否可套用。任何 framebuffer、Main 積木或 authoring blocker 都不得被分數掩蓋。

## 缺哪一顆積木擋住幾支（機器計數，分母＝審查包裡帶同一 brickId 的列數）

| brickId | 擋住技能數 | 主題數 | 技能 |
|---|---:|---:|---|
| `solid-beam` | 7 | 5 | `godie-e002.ex`、`godie-e00l.ex`、`godie-hart.r`、`godie-hvsh.r`、`godie-nbbc.e`、`godie-o00x.r`、`godie-ogrh.r` |

| 技能 | 分數 | 分流 | 新鮮度 | no-code | 機器問題 | 肉眼審閱 |
|---|---:|---|---|---|---|---|
| `godie-hart.r` 01-04 超究武神霸斬 | 4 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 逐段位移、每刀一個角色揮砍與單一主斬弧都已存在；剩餘失敗集中在黃藍直立終結光柱只能成為細 trace，與橫向氣功砲同屬 Main 實心光束積木缺口。 |
| `godie-hjai.e` 04-03 龍破斬 | 7 | ready-for-owner-review | current | ready | — | 飛行火團與遠端爆炸前後分明，爆炸有體積且沒有底板；已具備讓 Owner 判斷速度、距離與爆炸尺度的基本畫面。 |
| `godie-h020.e` 04-03 龍破斬 | 7 | ready-for-owner-review | current | ready | — | 與另一份龍破斬呈現一致，投射與爆炸階段可辨；可進 Owner 逐欄一致性複核。 |
| `godie-hjai.r` 04-04 神滅斬 | 7 | ready-for-owner-review | current | ready | — | 角色 dash 接近、單一放大黑紫主斬弧、目標受擊與命中 bloom 已對齊，沒有以多個月牙取代動作；可交 Owner 判斷速度與暈眩提示是否需要再加強。 |
| `godie-nbbc.r` 08-04 阿邦快速劍X | 7 | ready-for-owner-review | current | ready | — | A 式藍色直線動勢、B 式近身角色斬擊與交叉點爆發已有不同時間與顏色語彙，可交 Owner 做最後節奏裁決。 |
| `godie-nbbc.e` 08-03 龍鬥氣砲咒文 | 3 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 角色前方只形成數條細 trace，沒有藍色寬而連續的橫向氣功砲；禁止再用珠串或多條細線假裝完成。 |
| `godie-ogrh.r` 09-04 龜派氣功 | 3 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 橘色方向可辨，但畫面仍是稀疏細線與粒子，沒有龜派氣功應有的連續實心寬光束。 |
| `godie-o00x.r` 09-04 龜派氣功 | 3 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 與另一份龜派氣功維持一致，但兩份同樣缺連續實心光束，因此只能保留安全 fallback 證據。 |
| `godie-e002.ex` 20-002 解放.約束勝利劍MAX | 4 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 七段位移與攻擊節點可見，但畫面被重複大月牙取代角色斬擊，終結只剩細 trace；反擊連段尚不具成品說服力。 |
| `godie-e00l.r` 20-04 Avalon-永恆的理想鄉 | 7 | ready-for-owner-review | current | effect graph → onDamageTaken | — | 金白防禦圈、角色 guard 動作與反彈成功閃光已分層，事件 trace 另證明一次成功只送一則反彈事件；可交 Owner 最後裁決。 |
| `godie-e00l.ex` 20-002 解放.約束勝利劍MAX | 4 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 連段節點存在但目標與逐擊關係很弱，大月牙重複且終結砲仍是細線，無法完成理想鄉 EX 的反擊高潮。 |
| `godie-hvsh.r` 48-04 騎英之疆繩 | 4 | main-blocked | current | ready | MISSING_VISUAL_BRICK/main#solid-beam | 衝刺與接敵可辨，但飛馬載人感很弱，後段藍色橫向砲仍只有細 trace，無法驗收衝撞接光束。 |
| `godie-hvwd.e` 02-03 魂飛魄散 | 4 | editor-rework | current | ready | — | 只看到目標周邊小型紫色命中，完全無法判讀卡面所述直線；Editor 必須把形狀衝突與換積木結果一起呈現。 |
| `godie-o00k.e` 86-03 神鳴 | 4 | editor-rework | current | ready | — | 稀疏白點不足以表達神鳴或前方直線雷擊，現況仍像瞬發小範圍粒子。 |
| `godie-hjai.w` 04-02 炸彈陣 | 2 | editor-rework | current | ready | — | 多個時間點幾乎只有角色站立，五秒炸彈陣、週期火柱與殘留 DoT 三者皆無可讀視覺。 |
| `godie-nbbc.w` 08-02 萊丁快速劍 | 6 | editor-rework | current | ready | — | 瞬移近身與斬擊月牙清楚，但附近雷擊作為第二個範圍效果不夠可見。 |
| `godie-u00v.r` 78-04 死亡噴射肘擊 | 6 | editor-rework | current | ready | — | 火焰撞擊圈有重量，但只有前後兩格，仍看不出飛奔路徑、沿途動勢與擊退是否不是 blink。 |
| `godie-hapm.w` 52-02 蹂躪編年史 | 4 | editor-rework | current | ready | — | 遠端白點不能說明抓取、拋出、沿線碰撞三階段；角色與目標的連續動作需要補齊。 |
| `godie-e001.r` 22-04 雛見澤症候群L5 | ~~6~~ | editor-rework | stale | ready | — | 紅色暴走／變身氣氛可讀，但證據未顯示速度、最大生命副作用與結束後完整復原。 |
| `godie-e00s.w` 70-02 大怒石 | 3 | editor-rework | current | effect graph → onBasicAttack | — | 紫色方塊像 placeholder，普攻觸發的小範圍擴散與逐級比例沒有形成自然的落石／濺射視覺。 |
| `godie-etyr.r` 14-04 聖夜降臨 | 5 | editor-rework | current | ready | — | 召喚瞬間有金色環與第三單位跡象，但式神身份、八秒存在與到期消失在兩格證據中不夠清楚。 |
| `godie-ogld.ex` 72-002 億萬衛星殞落 | 2 | editor-rework | current | ready | — | 只有施法者旁的小型閃點，沒有三十個隨機落點、衛星落下路徑或逐顆範圍感。 |
| `godie-udea.r` 65-04 天譴 | 6 | editor-rework | current | ready | — | 多段命中與橫向動勢可見，但二十個起點、各自連鎖與逐跳衰減的空間拓樸仍無法從畫面驗證。 |
| `godie-h01n.r` 79-04 卍解 | 6 | editor-rework | current | ready | — | 紅黑變身爆發與餘韻可讀，但外觀變化、瞬步冷卻規則及八秒後恢復仍需更完整時間點。 |
| `godie-h00l.r` 60-04 完美盾反 | 4 | editor-rework | current | effect graph → onDamageTaken | — | 畫面像主動斬擊月牙，不像格擋／完美盾反；應先呈現一次防禦動作，再於成功反彈時顯示回復與擊退。 |
| `godie-hvsh.e` 48-03 鮮血神殿 | 5 | editor-rework | current | effect graph → onInterval,onKill | — | 紅色血域氣氛可辨，但領域邊界、逐秒傷害／治療與十四擊殺永久成長沒有視覺分層。 |
| `godie-n00b.passive` 57-00 四次元口袋 | 5 | editor-rework | current | ready | — | 紫色被動觸發光點可見，但金錢、回復、增益三種互斥結果及後續嘲諷沒有各自可辨提示。 |
| `godie-e00r.ex` 59-001 完全暴走 | 8 | ready-for-owner-review | current | effect graph → onDamageTaken,onInterval | — | 紅色暴走圈、持續脈動與攻擊節奏明確，沒有假 cast，也沒有不透明底板；可交 Owner 檢查十五秒與狀態細節。 |
| `godie-e00s.ex` 70-002 樹海降臨 | 2 | editor-rework | current | effect graph → onAbilityCast | — | 巨大紫色膠囊與方塊像除錯替身，不像樹海或樹精；追加傷害、友軍治療與限定由千年練成觸發都不可讀。 |
| `godie-e00w.passive` 77-00 浮雲-旋一閃 | 3 | editor-rework | current | effect graph → onEvade | — | 前後畫面幾乎相同，無法看出物理攻擊被迴避、旋轉反擊、範圍命中與暈眩同點發生。 |
| `godie-edem.r` 45-04 哥哥 | 7 | ready-for-owner-review | current | effect graph → onAbilityHit | — | 紅色雷電爆發、圓形邊界與命中焦點明確，視覺高潮足以交 Owner 檢查是否只在千鳥命中燃燒目標後觸發。 |
| `godie-emfr.e` 15-03 獄炎煉我 | 4 | editor-rework | current | effect graph → onBasicAttack,onDamageDealt | — | 只有施法者旁橘色粒子，無法區分變身、普攻火傷、技能命中爆炎與移速減半四個狀態。 |
| `godie-nbbc.passive` 08-00 龍紋記憶 | 6 | editor-rework | current | effect graph → onStunned | — | 最新重擷取已移除舊證據的大型不透明三角面，紅色覺醒圈與近身效果可讀；仍需顯示三秒刷新而非疊加。 |
| `godie-e00l.passive` 20-00 銀色甲胄 | 2 | editor-rework | current | effect graph → onDamageTaken | — | 兩張畫面幾乎沒有呈現層差異，魔力門檻、機率格擋、盾量消耗與新版差異皆無法肉眼判讀。 |
| `godie-e00r.q` 59-01 吞噬 | 2 | editor-rework | current | effect graph → onInterval | — | 只有兩個角色與極小光點，看不出自動找最近低血目標、吞噬處決、暴走門檻加倍或等值回復。 |
| `godie-e00s.r` 70-04 千年練成 | 3 | editor-rework | current | ready | — | 紫色方塊與小粒子不足以表達多棵樹精隨機出生、各自範圍傷害、定身加倍與八秒清除。 |
| `godie-h02k.ex` 89-002 俄羅斯輪盤 | 5 | editor-rework | current | ready | — | 橘色爆發能表示隨機結果已發生，但一般／致盲／混亂權重與死亡、恐懼互斥分支沒有不同視覺語彙。 |
| `godie-edem.e` 45-03 千鳥 | 3 | editor-rework | current | ready | — | 只看到小型白色效果，角色沿直線衝刺與沿途傷害線皆不清楚，無法排除退化成瞬移或終點爆炸。 |
| `godie-edem.ex` 45-002 天照 | 4 | editor-rework | current | ready | — | 紫色短暫光點不像大範圍持續十秒黑炎；燃燒、沉默與攻擊力降低三層狀態也沒有共同存在的證據。 |
| `godie-efur.passive` 13-00 念。攻防轉換 | 6 | editor-rework | current | effect graph → onBasicAttack | — | 普攻命中時的紅色 proc 清楚，但 AP、AD、防禦、魔抗四色／四狀態輪替與一秒並存仍不可辨。 |
| `godie-emfr.ex` 15-002 敵彈吸收陣。太陰道 | 7 | ready-for-owner-review | current | effect graph → onDamageTaken | — | 向施法者匯聚的放射狀效果能表達敵彈吸收，構圖乾淨；可交 Owner 檢查反彈、MP／AP轉換與五秒歸零。 |
| `godie-emns.ex` 44-002 交換筆記本 | 6 | editor-rework | current | ready | — | 目標周邊紫色狀態可見，但雙方現存生命交換的連線與交換瞬間不夠明確。 |
| `godie-emns.passive` 44-00 機警 | 5 | editor-rework | current | ready | — | 角色身上有被動防禦光效且沒有假施法，但1MP抵3傷害與魔力耗盡後才扣生命仍只能靠事件數據驗證。 |
| `godie-h01u.r` 80-04 赤兔咆哮 | 5 | editor-rework | current | effect graph → onBasicAttack,onDamageTaken | — | 白色咆哮／增益粒子可見，但普攻與受傷各20%代理弒鬼神、且同事件不重複的視覺因果不足。 |
| `godie-h02u.ex` 92-002 最終戈壁 | 2 | editor-rework | current | ready | — | 八張時間序列除開頭綠色粒子外幾乎完全靜止，六次每秒經驗增加沒有逐 tick 回饋，無法驗證排程結束。 |
| `godie-hapm.q` 52-01 狂戰士之怒 | 6 | editor-rework | current | effect graph → onDamageTaken | — | 藍色狂怒氣場可讀且沒有主動攻擊假動作，但承受每5%最大生命延長兩秒與單門檻只延長一次仍需時間軸提示。 |

## Main 外部阻塞

- `godie-hart.r` 01-04 超究武神霸斬：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-nbbc.e` 08-03 龍鬥氣砲咒文：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-ogrh.r` 09-04 龜派氣功：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-o00x.r` 09-04 龜派氣功：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-e002.ex` 20-002 解放.約束勝利劍MAX：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-e00l.ex` 20-002 解放.約束勝利劍MAX：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法
- `godie-hvsh.r` 48-04 騎英之疆繩：[solid-beam] 現有 Main primitive 無法組出驗收指定的視覺文法

## 重建

```bash
pnpm skillforge:visual-review:check
pnpm skillforge:visual-sheets:check
pnpm skillforge:visual-advisory:check
```

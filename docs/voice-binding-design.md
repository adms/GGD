# 語音場景綁定設計 (Voice Scene Binding) — 充分利用 51 英雄語音包

> 狀態: **設計待審** · 起案 2026-07-26 · owner: Takuro
> 前置盤點: 46 類語音中 **21 LIVE / 6 click-only / 19 設定但不會播**(見對話 wf_37ff8f50 盤點)
> 關聯: #184(破除雙聲壟斷) · #142(名言 VO) · #141「鑄技工坊」(狀態語音靠它定義)
> owner 硬性約束(2026-07-26):**語音要隨機發出,且「同一個語音不會同時播放」**——避免聲音重複造成污染。

## 一、目標

把 51 英雄 × 46 類生成語音,全部綁定到「適合時機 + 正確指令」。現況 19 類「clip 有出貨、
但邏輯上永遠不會播」。本設計把可行的全部接上,不可行的明確標記依賴(對齊鑄技工坊落差分)。

## 二、防污染機制(owner 硬性要求,先做這層再談個別綁定)

現有 `apps/client/src/audio/contextualVoice.ts` 已有三層節流:
1. `GLOBAL_MIN_GAP_MS = 1200`(全場一次一句)
2. `CHAMP_MIN_GAP_MS = 1500`(單一英雄不連珠炮)
3. per-(champ,category) cooldown + per-category 機率

**本設計新增兩條,滿足「隨機 + 同語音不重疊」:**
- **同一 clip 不同時播(in-flight 去重)**:維護 `activeClips: Set<string>`(以 clip src 為 key)。
  `playContextualVoice` 播放前:若該 clip 已在 `activeClips` → **直接跳過**(不疊播、不排隊);
  播放時加入,`audio.ended`/停止時移除。保證「同一句語音」永遠不會兩份同時響。
- **隨機發出**:clip pick 已用 client rng(`Math.random`,非 `world.rng`)。當一類別未來有多變體時,
  隨機挑一個;跨英雄選擇也隨機化,避免總是同一隻先喊。**client-only,不碰 sim 決定論。**

> 這兩條是全類別共用的地基,任何新綁定都走同一顆 `playContextualVoice`,自動享有去重+隨機。

## 三、每類別綁定表(時機 · 指令/訊號 · 鑄技工坊能力依賴 · 引擎支援 badge)

badge:🟢 訊號現成可綁 · 🟡 需鑄技工坊 P2 位移詞彙 · 🔴 需鑄技工坊 P3 狀態詞彙 / 新 UI

| 類別 | 時機 | 訊號/指令(file 依據) | 依賴 | badge |
|---|---|---|---|---|
| quote(語音包版) | 選角確認 + 結算 + 點自己 | **接上語音包 `lines.quote`**,與 quotes.json(#139)並存、隨機挑一;不動 #139 確認流程 | — | 🟢 |
| attack-light | 自己一般攻擊(非暴擊) | `ENTITY_FLAG.WINDUP(32)` 上升邊緣,`es.id===localId`(仿 stun/slow/bind at GameApp.ts:1525-1527);**低機率+高 cooldown**(普攻約 0.7s/次,絕不每刀喊) | — | 🟢 |
| attack-heavy | 自己暴擊 | damage 事件 `d.crit===true`(GameApp.ts:1487);與現有 `crit` 類別**二擇一隨機**避免雙響 | — | 🟢 |
| block | 自己擋下/反彈技生效 | damage 事件 `blocked===true`(damage.ts:376 `isBlock`)或 `isCounter` 反擊,target===localId | — | 🟢 |
| dodge | 自己迴避生效 | evasion/dodge 事件(combatText.ts:237 已有 dodge 浮字訊號可轉接),target===localId | — | 🟢 |
| sprint | 自己衝刺生效 | `ENTITY_FLAG.DASHING(1)` 上升邊緣,localId | — | 🟢 |
| healed | 自己被補血 | `heal` 事件(restore.ts:79-87 → eventFanout.ts:112,離散補血才發、regen 不發),target===localId;復活另接 `reviveComplete` | — | 🟢 |
| hum | 閒置 N 秒無動作 | **client 閒置計時器**:`IntentSender.onSent`(IntentSender.ts:54-63)+ localId 參與的 damage/heal 事件重置;過 N 秒低機率播,client rng | — | 🟢 |
| curse | 對敵施加硬控 / 自己被硬控的怒罵 | 綁「施加/承受 CC」事件(可用現成 stun/slow/root 邊緣),低機率,與 taunt 區隔 | — | 🟢 |
| jump | 自己跳躍起跳 | 起跳事件 | 鑄技工坊 P2 `leap`(拋物線) | 🟡 |
| knockdown | 自己被擊倒 | 擊倒事件 | 鑄技工坊 P2 `knockback` | 🟡 |
| poison | 中毒套用於自己 | `POISONED` 狀態上升邊緣 | 鑄技工坊 P3 `periodicDamage/DoT` + **新增 `ENTITY_FLAG.POISONED` 位元**(schema.ts:534 目前無) | 🔴 |
| blind | 致盲套用 | `BLINDED` 位元 | P3 新狀態機制 + 新 ENTITY_FLAG bit | 🔴 |
| confused | 混亂套用 | `CONFUSED` 位元 | P3 新狀態機制 + 新 ENTITY_FLAG bit | 🔴 |
| paralyzed | 麻痺套用 | `PARALYZED` 位元(或 STUNNED 變體) | P3 新狀態機制 + 新 ENTITY_FLAG bit | 🔴 |
| thumbs-up | 讚賞隊友 | comms/ping 輪盤 | 新 UI(Tier 4) | 🔴 |
| retreat | 呼叫撤退 | comms/ping 輪盤 | 新 UI | 🔴 |
| charge | 帶頭衝鋒 | comms/ping 輪盤 | 新 UI | 🔴 |
| watch | 待命/觀察 | comms/ping 輪盤 | 新 UI | 🔴 |
| free-move | 分頭行動 | comms/ping 輪盤 | 新 UI | 🔴 |

> 另外 6 類已是 **click-only**(taunt / respond.ok·no / love / thanks / puzzled):目前只在點自己英雄時
> 以隨機池播。Tier 4 做 ping 輪盤時,把它們從「只有點角色」升級成真正的 comms ping。

## 四、與「鑄技工坊」整合(#141)

狀態語音(poison/blind/knockdown/confused/paralyzed)的訊號,**來自鑄技工坊 template 產生的
「狀態套用」事件**。做法對齊 `skill-forge-design.md` 的落差治理:

- 鑄技工坊的 `requires` 能力表新增狀態詞彙:`poison(DoT) / blind / knockback / stun-variants`。
- 一個 template 施加某狀態 → sim 對目標設對應 `ENTITY_FLAG` 位元 → 客端邊緣偵測 → 播該狀態語音。
- **狀態不存在 = 語音無訊號可綁**,編輯器以落差分 badge(🔴)明示「語音已備、待狀態機制」,
  不偷偷播、不假裝有。
- 因此 Tier 3 狀態語音的前置 = 鑄技工坊 P3 的狀態詞彙落地。這讓「鑄技工坊」與「語音」同一套依賴治理。

## 五、漸進路線(對齊鑄技工坊 P1/P2/P3)

| Tier | 內容 | 前置 | 交付 |
|---|---|---|---|
| **T1** | quote-pack · attack-light/heavy · block · dodge · sprint · healed · hum · curse | 無(訊號現成,純 client) | 防污染地基 + 8 類上線;普攻不洗頻測試 |
| **T2** | jump · knockdown | 鑄技工坊 P2 `leap`/`knockback` | 位移語音隨位移詞彙一起 |
| **T3** | poison · blind · confused · paralyzed | 鑄技工坊 P3 狀態詞彙 + 新 ENTITY_FLAG 位元 | 狀態語音隨狀態機制一起 |
| **T4** | comms/ping 輪盤:thumbs-up/retreat/charge/watch/free-move + 升級 respond/thanks/taunt/love/puzzled 成真 ping | 新 ping UI(lobby/中場/戰鬥皆可用) | 補上目前**零語音綁定**的 lobby 與中場 |

## 六、檔案計畫(T1,可立即動工)

1. `apps/client/src/audio/contextualVoice.ts` — 加 `activeClips` 去重 + 新類別的 `CategoryPolicy`
   (attack-light 要低機率高 cooldown);`dispatchContextualVoice` 加 `heal` 分支。
2. `apps/client/src/audio/*` — quote-pack 讀取(與 quotes.json 並存隨機)。
3. `apps/client/src/GameApp.ts` — WINDUP/DASHING 邊緣接 attack-light/sprint;heal 事件接 healed;
   閒置計時器接 hum;CC 邊緣接 curse。**全 client,不動 `packages/shared/src/sim`。**
4. 測試:每新類別在其事件上有 live 派發;普攻連打不超過節流(不洗頻);同 clip 不重疊(去重測試);
   16 隻既有 map-quip 不回歸。

## 七、非目標

- 不碰 `packages/shared/src/sim`(語音是 client 裝飾,clip pick 用 client rng)。
- T1 不新增 sim 詞彙 / ENTITY_FLAG 位元 —— 需要的狀態語音明示 🔴 等鑄技工坊,不偷擴 schema。
- 不做付費/造型相關。

## 八、聽眾加權(#223,2026-07-26 owner 實測回報)

回報:「語音綁定似乎沒有落實,例如敵人被我攻擊沒發出受傷或死亡等語音」。

**根因**:`hurt` / `hurt-heavy` / `defeat` 三類被硬綁 `target === localId`,所以打到敵人完全沒聲、
隊友被打也沒聲 —— 整座競技場只用你自己的嗓子講話。當初這樣綁是怕 12 人團戰吵成一團;
§二 的防污染層(in-flight 去重 + 三層節流)落地後,上限已由節流保證,這道閘就沒有理由再留。

**改法**:三類放給**全部英雄**,並新增 `apps/client/src/audio/voiceAudience.ts` 這層純函式加權,
把「誰講」變成排序問題而不是開關問題:

| 頻帶 | 定義 | 機率倍率 | 距離處理 |
|---|---|---|---|
| self | 講話的就是你 | 1.0 | 不衰減、不裁切 |
| engaged | 事件另一端是你(你打的敵人 / 打你的人 / 你殺掉的人) | 0.85 | 不衰減、不裁切 |
| enemy | 場上其他敵隊英雄 | 0.3 | 線性衰減,超過 `FOCUS_FAR` 直接不派發 |
| ally | 場上其他隊友 | 0.2 | 同上 |
| third | 隊伍不明 / 你正在觀戰 | 0.12 | 同上 |

**12 人仍然清楚的三個理由**:(1) `GLOBAL_MIN_GAP_MS` 1.2s 是全場硬上限,放寬聽眾只換「誰用掉這格」,
不換總量;(2) 一幀的候選先 `orderVoiceCandidates` 依頻帶排序再派發 —— 否則 1.2s 那格會被封包到達順序
決定,路人的悶哼吃掉你自己的悶哼,那才是真正的退步(這正是 `SpatialSfxQueue` 對音效做的同一件事);
(3) 倍率只會往下調,永遠 ≤ 1,不會讓任何既有台詞比 owner 調好的頻率更常出現。

**另外兩處連帶修正**:輕重傷判定改用**受害者自己的 maxHp**(舊碼讀 `hudStore.localMaxHp`,對敵人一律錯);
`defeat` 在 self / engaged 兩帶給 preempt,免得「你殺掉的那隻」的慘叫被團戰悶哼吃掉。

**刻意不動**:`attack-light` / `sprint`(owner 硬性規定只有自己,普攻 1.4 次/秒 × 12 人會洗頻)、
`block` / `healed` / `dodge`(是對「你的操作」的回應)、`curse`(自己的怒罵)、
`abilityCast` / `crit`(本來就沒有 localId 閘,重接會有雙響風險)、
`victory` / 名言確認(#139 地盤)。

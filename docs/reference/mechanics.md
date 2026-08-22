# 技能機制詞彙 —— 逐筆清單

> ⛔ **這份文件是產生的。** 由 `pnpm docs:readme` 從四份 JSON 讀出來：
> `content/editor-target-profile.json` 的 `runtimeCapabilities`（引擎真的有什麼，
> 由 `buildCapabilityManifest()` 從出貨註冊表推導）、`content/abilities/*.json`、
> `content/augments/*.json`、`content/status-effects/*.json`、`content/vfx/*.json`。
>
> 每個效果**每一格參數與上下界**在 [`docs/技能標記機制與效果規則.md`](../技能標記機制與效果規則.md)。
> 這一份回答的是「**誰在用它**」。

contentVersion `cv_25c69162b991`

---

## 效果（effect kind） —— 46 種

| token | 中文 | 用它的內容 | 例（前 12 份） |
|---|---|--:|---|
| `applyBuff` | 增益／減益（改屬性） | 105 | `godie-e001.passive`、`godie-e001.q`、`godie-e001.r`、`godie-e002.r`、`godie-e008.w`、`godie-e00n.ex`、`godie-e00n.passive`、`godie-e00n.q`、`godie-e00n.r`、`godie-e00n.w`、`godie-e00r.ex`、`godie-e00r.passive` …（共 105） |
| `applyStatus` | 掛狀態 | 98 | `godie-e001.e`、`godie-e001.passive`、`godie-e007.ex`、`godie-e007.q`、`godie-e008.e`、`godie-e008.q`、`godie-e00n.e`、`godie-e00n.passive`、`godie-e00r.ex`、`godie-e00r.passive`、`godie-e00r.q`、`godie-e00s.e` …（共 98） |
| `blink` | 瞬移 | 15 | `godie-efur.q`、`godie-h01o.q`、`godie-n00b.e`、`godie-n01c.r`、`godie-n01c.w`、`godie-nbbc.r`、`godie-nbbc.w`、`godie-o00k.w`、`godie-o00x.w`、`godie-o02l.passive`、`godie-ofar.passive`、`godie-ogrh.w` …（共 15） |
| `carry` | 背負（帶著隊友移動 + 不可被選取） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `chainLightning` | 連鎖閃電 | 2 | `godie-o00k.r`、`godie-udea.r` |
| `championForm` | 變身／切換形態 | 23 | `godie-e001.r`、`godie-e002.w`、`godie-e00l.w`、`godie-e00s.passive`、`godie-e00w.e`、`godie-e010.passive`、`godie-h01n.r`、`godie-h02v.q`、`godie-hgam.ex`、`godie-hjai.ex`、`godie-n003.ex`、`godie-n01c.ex` …（共 23） |
| `comboStrikes` | 連段（多次獨立斬擊＋可選收尾） | 1 | `godie-hart.r` |
| `convertTeam` | 陣營轉換（把一個既有單位借到自己這一隊） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `cycleBuff` | 輪替增益 | 1 | `godie-efur.passive` |
| `damage` | 傷害 | 162 | `godie-e001.e`、`godie-e002.e`、`godie-e002.ex`、`godie-e002.r`、`godie-e002.w`、`godie-e007.e`、`godie-e007.ex`、`godie-e007.q`、`godie-e007.r`、`godie-e008.e`、`godie-e008.ex`、`godie-e008.q` …（共 162） |
| `damageArea` | 範圍傷害 | 40 | `godie-e001.passive`、`godie-e002.w`、`godie-e008.ex`、`godie-e00n.passive`、`godie-e00s.e`、`godie-e00s.q`、`godie-e00s.r`、`godie-e00s.w`、`godie-e00w.ex`、`godie-e00w.q`、`godie-e00w.r`、`godie-e00w.w` …（共 40） |
| `damageLine` | 直線傷害 | 12 | `godie-e002.e`、`godie-e002.ex`、`godie-e00l.e`、`godie-e00l.ex`、`godie-e00r.r`、`godie-edem.e`、`godie-emfr.q`、`godie-h01n.e`、`godie-h01u.e`、`godie-h02v.e`、`godie-n00p.passive`、`godie-nsjs.passive` |
| `dash` | 衝刺（腳不離地） | 8 | `godie-edem.e`、`godie-h01n.q`、`godie-h01u.e`、`godie-hapm.r`、`godie-u00j.w`、`godie-udea.r`、`godie-zombiex.w`、`thorne.q` |
| `delayed` | 延遲落地／排程 | 12 | `godie-e002.ex`、`godie-e00l.ex`、`godie-h020.e`、`godie-h02v.ex`、`godie-h02v.q`、`godie-hapm.ex`、`godie-hapm.passive`、`godie-hjai.e`、`godie-n01g.r`、`grail-a-08`、`grail-ex-05`、`grail-ex-16` |
| `devour` | 吞噬 | 3 | `godie-e00r.q`、`godie-h02v.w`、`grail-ex-13` |
| `dispel` | 淨化／驅散 | 8 | `godie-ewar.r`、`godie-ewar.w`、`godie-h00l.passive`、`grail-c-01`、`grail-c-08`、`grail-a-06`、`grail-a-15`、`grail-ex-14` |
| `dot` | 持續傷害（燃燒／流血／中毒） | 3 | `godie-edem.ex`、`godie-edem.q`、`godie-h02v.e` |
| `evasion` | 迴避 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `eventValueConversion` | 把事件的數值換算成別的 | 5 | `godie-emfr.ex`、`grail-c-04`、`grail-a-02`、`grail-ex-12`、`grail-ex-18` |
| `extendBuff` | 延長既有增益 | 1 | `godie-hapm.q` |
| `floatingText` | 特效文字（原作的 TextTag，例「1Hit…7Hit」） | 5 | `godie-e002.e`、`godie-e00l.e`、`godie-h020.e`、`godie-hjai.e`、`godie-n01g.r` |
| `grantAttribute` | 加三圍（力／敏／智） | 5 | `godie-hpb1.passive`、`godie-hvsh.e`、`godie-n01c.passive`、`godie-nbbc.passive`、`grail-c-10` |
| `grantGold` | 發錢 | 1 | `godie-n00b.passive` |
| `heal` | 治療（吃係數） | 10 | `godie-e007.w`、`godie-etyr.q`、`godie-h02r.passive`、`godie-hvsh.e`、`godie-n003.w`、`godie-n01c.q`、`godie-n01g.w`、`godie-nbbc.q`、`godie-o02p.r`、`godie-o02p.w` |
| `invulnerable` | 免疫／魔免／免控 | 16 | `godie-hapm.ex`、`godie-hapm.passive`、`godie-hapm.w`、`godie-hart.r`、`godie-hpb1.w`、`godie-u00j.q`、`godie-u00n.r`、`godie-u00o.r`、`godie-u010.q`、`godie-uvng.q`、`grail-c-12`、`grail-a-06` …（共 16） |
| `knockback` | 擊退／擊飛／拉扯／擊倒 | 12 | `godie-e00w.q`、`godie-efur.w`、`godie-ewar.ex`、`godie-h00l.q`、`godie-h00l.r`、`godie-h01u.w`、`godie-h02k.r`、`godie-hapm.ex`、`godie-hapm.passive`、`godie-u00v.r`、`grail-c-02`、`grail-a-01` |
| `leap` | 跳躍（拋物線離地） | 7 | `godie-h00l.w`、`godie-hapm.w`、`godie-hart.q`、`godie-hart.w`、`godie-hpb1.e`、`godie-u00n.r`、`godie-u00o.r` |
| `manaBarrier` | 魔力護盾 | 1 | `godie-emns.passive` |
| `modifyCooldown` | 改冷卻 | 13 | `godie-h00l.ex`、`godie-h01n.r`、`grail-c-11`、`grail-c-13`、`grail-c-14`、`grail-a-05`、`grail-a-07`、`grail-a-17`、`grail-a-18`、`grail-ex-02`、`grail-ex-03`、`grail-ex-11` …（共 13） |
| `proxyCast` | 代放別的技能 | 6 | `godie-h01u.r`、`grail-a-08`、`grail-ex-04`、`grail-ex-05`、`grail-ex-08`、`grail-ex-15` |
| `pull` | 吸引（把目標拉到落點／錨點環） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `randomArea` | 隨機落點 | 7 | `godie-e008.ex`、`godie-e00s.r`、`godie-e010.r`、`godie-efur.r`、`godie-ogld.ex`、`grail-c-19`、`grail-ex-09` |
| `restore` | 回復（按最大值百分比） | 17 | `godie-e00s.ex`、`godie-emfr.passive`、`godie-ewar.w`、`godie-h00l.r`、`godie-h02v.ex`、`godie-h02v.q`、`godie-hapm.passive`、`godie-n00b.passive`、`godie-o02p.ex`、`grail-c-03`、`grail-a-02`、`grail-a-06` …（共 17） |
| `revive` | 復活 | 1 | `grail-ex-10` |
| `screenFlash` | 畫面閃爍（全螢幕） | 2 | `godie-e002.ex`、`godie-e00l.ex` |
| `screenShake` | 畫面震動 | 11 | `godie-e002.e`、`godie-e002.ex`、`godie-e00l.e`、`godie-e00l.ex`、`godie-h020.e`、`godie-hjai.e`、`godie-n01g.r`、`godie-u010.e`、`godie-u010.ex`、`godie-uvng.e`、`godie-uvng.ex` |
| `shield` | 吸收（護盾） | 10 | `godie-e00l.passive`、`godie-e00r.e`、`godie-h00l.ex`、`godie-o00l.e`、`sela.w`、`thorne.w`、`grail-c-17`、`grail-a-16`、`aegis-surge`、`guardian-ward` |
| `shieldBreak` | 破盾 | 2 | `grail-c-09`、`grail-ex-14` |
| `spawnModelFx` | 模型特效（帶模型的單位沿路徑移動 —— 光束／砲擊／衝擊波） | 9 | `godie-e002.e`、`godie-e00l.e`、`godie-h020.e`、`godie-hjai.e`、`godie-n01g.r`、`godie-u010.e`、`godie-u010.ex`、`godie-uvng.e`、`godie-uvng.ex` |
| `spawnProjectile` | 投射物 | 24 | `godie-e008.e`、`godie-e010.q`、`godie-h02r.r`、`godie-n003.e`、`godie-n00p.w`、`godie-n01c.e`、`godie-n01g.e`、`godie-n01g.r`、`godie-nbbc.e`、`godie-nsjs.w`、`godie-o00l.q`、`godie-o00x.r` …（共 24） |
| `spawnVfx` | 純演出（特效／音效） | 23 | `godie-e002.e`、`godie-e002.ex`、`godie-e00l.e`、`godie-e00l.ex`、`godie-e00r.r`、`godie-e00s.q`、`godie-e00s.r`、`godie-e00x.r`、`godie-e010.r`、`godie-emfr.r`、`godie-h01n.q`、`godie-h01o.e` …（共 23） |
| `spendMana` | 燒魔 | 4 | `godie-e00l.w`、`godie-emfr.passive`、`godie-u00k.passive`、`godie-udea.r` |
| `summon` | 召喚 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `swapResource` | 資源互換 | 1 | `godie-emns.ex` |
| `taunt` | 嘲諷 | 2 | `godie-n00b.passive`、`godie-o00k.passive` |
| `weightedBranch` | 加權分支（隨機挑一段） | 5 | `godie-e00s.ex`、`godie-h02k.ex`、`godie-h02v.ex`、`godie-n00b.passive`、`grail-ex-08` |

## 觸發事件（hook event） —— 33 種

| token | 中文 | 用它的內容 | 例（前 12 份） |
|---|---|--:|---|
| `onAbilityCast` | 施法時 | 22 | `godie-e00s.ex`、`godie-emfr.r`、`godie-h02v.ex`、`godie-u00j.ex`、`godie-u00j.ex`、`godie-u00k.passive`、`grail-c-12`、`grail-c-20`、`grail-a-08`、`grail-a-08`、`grail-a-08`、`grail-a-08` …（共 22） |
| `onAbilityHit` | 技能命中時 | 21 | `godie-edem.r`、`godie-edem.r`、`godie-edem.r`、`godie-efur.ex`、`godie-h01n.w`、`godie-h01n.w`、`godie-h01o.w`、`godie-h01o.w`、`grail-c-08`、`grail-c-09`、`grail-c-16`、`grail-c-18` …（共 21） |
| `onAllyDamaged` | 隊友受傷時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onAllyDeath` | 隊友陣亡時 | 3 | `grail-c-15`、`grail-a-06`、`grail-ex-10` |
| `onBasicAttack` | 普攻時 | 72 | `godie-e002.w`、`godie-e002.w`、`godie-e002.w`、`godie-e002.w`、`godie-e00l.w`、`godie-e00r.w`、`godie-e00r.w`、`godie-e00r.w`、`godie-e00r.w`、`godie-e00s.w`、`godie-e00s.w`、`godie-e00s.w` …（共 72） |
| `onBossSpawn` | 殭屍王出現時 | 1 | `grail-c-13` |
| `onBoundaryTouch` | 碰到場地邊界時（＝踏進火圈） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onCrowdControlApplied` | 對別人施加控場時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onCrowdControlReceived` | 自己被控場時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onDamageDealt` | 造成傷害時 | 7 | `godie-emfr.e`、`godie-h02k.q`、`godie-h02k.q`、`godie-h02k.q`、`godie-h02k.q`、`grail-a-10`、`grail-a-18` |
| `onDamageTaken` | 受到傷害時 | 31 | `godie-e002.r`、`godie-e00l.passive`、`godie-e00r.ex`、`godie-e00r.passive`、`godie-edem.passive`、`godie-emfr.ex`、`godie-h00l.ex`、`godie-h00l.r`、`godie-h01u.r`、`godie-h02k.e`、`godie-h02k.e`、`godie-h02k.e` …（共 31） |
| `onDashOrBlink` | 位移時（衝刺／閃現／跳躍） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onDeath` | 死亡時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onEvade` | 迴避成功時 | 10 | `godie-e00w.passive`、`godie-h02k.r`、`godie-h02k.r`、`godie-h02k.r`、`grail-c-02`、`grail-c-03`、`grail-a-01`、`grail-a-02`、`grail-a-14`、`grail-ex-08` |
| `onFireRingIgnite` | 火圈點燃時 | 1 | `grail-ex-09` |
| `onGuardianDown` | 守衛塔倒下時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onHeal` | 治療真的補到血時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onInterval` | 週期（每 N 秒） | 9 | `godie-e00r.e`、`godie-e00r.e`、`godie-e00r.e`、`godie-e00r.e`、`godie-e00r.q`、`godie-emfr.passive`、`godie-hvsh.e`、`grail-c-19`、`grail-ex-02` |
| `onKill` | 擊殺時 | 14 | `godie-h01u.passive`、`godie-hpb1.passive`、`godie-hvsh.e`、`godie-o00x.passive`、`godie-ogrh.passive`、`godie-zombiex.passive`、`godie-zombiex.passive`、`grail-c-10`、`grail-c-14`、`grail-a-05`、`grail-ex-03`、`conqueror` …（共 14） |
| `onLethalDamage` | 受到致命傷害時（免死有沒有生效都會發） | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onOverheal` | 治療溢出時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onProjectileExpire` | 自己的投射物消失時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onReflectSuccess` | 反彈成功時 | 12 | `godie-e002.ex`、`godie-e00l.ex`、`godie-emfr.ex`、`godie-h00l.ex`、`godie-h00l.r`、`godie-h00l.r`、`godie-h02k.w`、`grail-c-02`、`grail-c-03`、`grail-a-01`、`grail-a-02`、`grail-ex-08` |
| `onRevive` | 被復活時 | 2 | `grail-a-07`、`grail-ex-11` |
| `onRoundEnd` | 回合結束時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onRoundStart` | 回合開始時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onShieldBroken` | 護盾破碎時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onShieldGained` | 獲得護盾時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onStatCapReached` | 屬性首次到頂時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onStatusApplied` | 被掛上狀態時 | 3 | `grail-c-01`、`grail-c-11`、`grail-a-15` |
| `onStunned` | 被暈眩時 | 2 | `godie-n01c.passive`、`godie-nbbc.passive` |
| `onUltimateCast` | 大招（R）施放時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `onUltimateHit` | 大招（R）命中時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |

## 條件葉（condition leaf） —— 5 種

| token | 中文 | 用它的內容 | 例（前 12 份） |
|---|---|--:|---|
| `chance` | 機率 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `equipment` | 裝備了某道具時 | 0 | ⚠️ 0 —— 機制在，還沒有內容用 |
| `kind` | 對象是誰（小兵／英雄／BOSS） | 1 | `godie-h02k.ex` |
| `stat` | 屬性門檻（血量低於 X%…） | 8 | `godie-e002.w`、`godie-e00l.w`、`godie-e00r.ex`、`godie-e00r.passive`、`godie-emfr.passive`、`godie-h00l.ex`、`godie-h02v.w`、`grail-ex-13` |
| `status` | 身上有某狀態時 | 25 | `godie-e00r.q`、`godie-edem.r`、`godie-efur.ex`、`godie-emns.e`、`godie-emns.r`、`godie-ewar.e`、`godie-h00l.e`、`godie-h01n.e`、`godie-h01n.w`、`godie-h01o.w`、`godie-h01u.e`、`godie-h02k.ex` …（共 25） |

## 狀態標籤 —— 106 個

開放詞彙（自由字串）。條件葉 `status` 的**類別分支**查的就是它。

| 標籤 | 帶它的狀態文件 |
|---|---|
| `accuracy-down` | `blind`、`curse` |
| `ai-override` | `berserk`、`confusion`、`fear` |
| `alcohol-enema` | `alcohol-enema` |
| `antiheal` | `grievous-wounds`、`no-heal` |
| `armor-break` | `armor-break` |
| `armor-down` | `armor-break` |
| `attack-debuff` | `blind`、`curse` |
| `attack-denied` | `burnstun`、`fang-stun`、`fear`、`ingredient`、`omnislash-lock`、`omnislash-perform`、`stun`、`trial-stun` |
| `auto-target` | `berserk` |
| `bankai` | `bankai` |
| `banked` | `light-wand-banked`、`nen-banked` |
| `berserk` | `berserk` |
| `blind` | `blind` |
| `buff` | `bankai`、`berserk`、`grail-strengthened-projection`、`grief-seed-charge`、`light-wand-banked`、`millennium-plot-armor`、`moon-combo`、`nen-banked`、`octuple-slash-window`、`omnislash-perform`、`rage`、`red-comet`、`triforce-courage`、`united-states-of-smash`、`witch-form` |
| `burn` | `burn` |
| `burnstun` | `burnstun` |
| `cast-denied` | `burnstun`、`fang-stun`、`ingredient`、`omnislash-lock`、`omnislash-perform`、`stun`、`trial-stun` |
| `cc` | `blind`、`burnstun`、`charmed`、`confusion`、`curse`、`fang-stun`、`fear`、`ingredient`、`numbness`、`omnislash-lock`、`paralysis`、`root`、`slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60`、`stun`、`trial-stun` |
| `channel` | `omnislash-perform` |
| `charmed` | `charmed` |
| `combo` | `moon-combo`、`octuple-slash-window` |
| `confusion` | `confusion` |
| `cooldown` | `devour-cooldown` |
| `counter` | `grief-seed-charge`、`triforce-courage` |
| `curse` | `curse` |
| `damage-bank` | `light-wand-banked`、`nen-banked` |
| `debuff` | `alcohol-enema`、`armor-break`、`blind`、`burn`、`burnstun`、`charmed`、`confusion`、`curse`、`fang-stun`、`fear`、`grievous-wounds`、`ingredient`、`magic-break`、`no-heal`、`numbness`、`omnislash-lock`、`paralysis`、`root`、`slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60`、`stun`、`trial-stun` |
| `devour-cooldown` | `devour-cooldown` |
| `disable` | `burnstun`、`fang-stun`、`fear`、`ingredient`、`numbness`、`omnislash-lock`、`omnislash-perform`、`paralysis`、`root`、`stun`、`trial-stun` |
| `dot` | `burn` |
| `drunk` | `alcohol-enema` |
| `elemental` | `burn` |
| `empowered` | `millennium-plot-armor` |
| `empowered-next` | `united-states-of-smash` |
| `fang-stun` | `fang-stun` |
| `fear` | `fear` |
| `fire` | `burn`、`burnstun` |
| `flee` | `fear` |
| `form` | `bankai`、`witch-form` |
| `frenzy` | `rage` |
| `friendly-fire` | `confusion` |
| `generic` | `stun` |
| `grail-strengthened-projection` | `grail-strengthened-projection` |
| `grail-wish` | `grail-strengthened-projection` |
| `grief-seed-charge` | `grief-seed-charge` |
| `grievous-wounds` | `grievous-wounds` |
| `hard-cc` | `burnstun`、`fang-stun`、`ingredient`、`omnislash-lock`、`stun`、`trial-stun` |
| `haste` | `rage`、`red-comet` |
| `heal-block` | `no-heal` |
| `heal-down` | `grievous-wounds`、`no-heal` |
| `immobilize` | `root` |
| `ingredient` | `ingredient` |
| `internal-cooldown` | `devour-cooldown` |
| `lifesteal-down` | `grievous-wounds`、`no-heal` |
| `lifesteal-up` | `rage` |
| `light-wand-banked` | `light-wand-banked` |
| `magic-break` | `magic-break` |
| `magic-resist-down` | `magic-break` |
| `magical` | `magic-break` |
| `mana-banked` | `light-wand-banked`、`nen-banked` |
| `marker` | `alcohol-enema`、`burn`、`devour-cooldown` |
| `mechanism-on-card` | `bankai`、`numbness`、`paralysis`、`triforce-courage` |
| `millennium-plot-armor` | `millennium-plot-armor` |
| `miss` | `blind`、`curse` |
| `moon-combo` | `moon-combo` |
| `move-denied` | `burnstun`、`charmed`、`fang-stun`、`ingredient`、`omnislash-lock`、`omnislash-perform`、`root`、`stun`、`trial-stun` |
| `move-speed-down` | `slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60` |
| `named-variant` | `burnstun`、`fang-stun`、`ingredient`、`omnislash-lock`、`omnislash-perform`、`trial-stun` |
| `nen-banked` | `nen-banked` |
| `next-attack` | `grail-strengthened-projection` |
| `no-heal` | `no-heal` |
| `no-stat-change` | `devour-cooldown` |
| `numbness` | `numbness` |
| `octuple-slash-window` | `octuple-slash-window` |
| `omnislash-lock` | `omnislash-lock` |
| `omnislash-perform` | `omnislash-perform` |
| `paralysis` | `paralysis` |
| `physical` | `armor-break` |
| `projectile` | `grail-strengthened-projection` |
| `rage` | `rage` |
| `red-comet` | `red-comet` |
| `regen-down` | `grievous-wounds`、`no-heal` |
| `resist-down` | `armor-break`、`magic-break` |
| `root` | `root` |
| `self` | `devour-cooldown` |
| `self-lock` | `omnislash-perform` |
| `shred` | `armor-break`、`magic-break` |
| `slow` | `alcohol-enema`、`slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60` |
| `slow20` | `slow20` |
| `slow25` | `slow25` |
| `slow30` | `slow30` |
| `slow35` | `slow35` |
| `slow40` | `slow40` |
| `slow50` | `slow50` |
| `slow60` | `slow60` |
| `soft-cc` | `blind`、`curse`、`slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60` |
| `stat-down` | `armor-break`、`magic-break`、`slow20`、`slow25`、`slow30`、`slow35`、`slow40`、`slow50`、`slow60` |
| `stat-up` | `rage` |
| `stun` | `burnstun`、`fang-stun`、`ingredient`、`omnislash-lock`、`omnislash-perform`、`stun`、`trial-stun` |
| `timed-window` | `moon-combo`、`octuple-slash-window`、`witch-form` |
| `trial-stun` | `trial-stun` |
| `triforce-courage` | `triforce-courage` |
| `uncontrollable` | `berserk`、`confusion`、`fear` |
| `united-states-of-smash` | `united-states-of-smash` |
| `witch-form` | `witch-form` |
| `wound` | `grievous-wounds`、`no-heal` |

## 特效（vfx）—— 643 份

由 `spawnVfx.vfxId`、技能的 `vfxKey`、彈道的 `vfxKey` 引用。

- `attach.ex.midchilder-aura` · `attach.godie-e00x.awing` · `attach.godie-o00x.hands` · `attach.godie-u01u.poweraura`
- `fx.avalon.reflect-burst` · `fx.avalon.reflect-spark` · `fx.barkskin` · `fx.basic-attack`
- `fx.bramble-burst` · `fx.cinder-ward` · `fx.dragon-awaken` · `fx.ember-bolt`
- `fx.ember-bolt-cast` · `fx.fam.blink.arcane.s65` · `fx.fam.blink.arcane.s90` · `fx.fam.blink.ki.s65`
- `fx.fam.blink.lightning.s90` · `fx.fam.bolt-strike.lightning.s115` · `fx.fam.bolt-strike.lightning.s345` · `fx.fam.bolt-strike.physical.s345`
- `fx.fam.breath.blood.s110` · `fx.fam.breath.nature.s110` · `fx.fam.burst.fire.s100` · `fx.fam.burst.fire.s105`
- `fx.fam.burst.holy.s100` · `fx.fam.burst.ki.s150` · `fx.fam.burst.physical.s100` · `fx.fam.burst.physical.s105`
- `fx.fam.burst.w3x-646464.s100` · `fx.fam.burst.w3x-646464.s150` · `fx.fam.burst.w3x-ff0000.s150` · `fx.fam.burst.w3x-ff0000.s170`
- `fx.fam.burst.w3x-ffaaaa.s100` · `fx.fam.cloud.physical.s120` · `fx.fam.cloud.void.s180` · `fx.fam.cloud.wind.s120`
- `fx.fam.dissipate.physical.s125` · `fx.fam.dissipate.void.s85` · `fx.fam.dissipate.w3x-0a0a0a.s100` · `fx.fam.dissipate.w3x-ff0000.s85`
- `fx.fam.flame-pillar.w3x-ff0000.s115` · `fx.fam.ground-dust.earth.s80` · `fx.fam.ground-dust.ki.s120` · `fx.fam.ground-dust.nature.s80`
- `fx.fam.kaboom.fire.s115` · `fx.fam.level-up.holy.s90` · `fx.fam.level-up.ki.s65` · `fx.fam.light-column.arcane.s100`
- `fx.fam.light-column.arcane.s240` · `fx.fam.light-column.fire.s150` · `fx.fam.light-column.holy.s100` · `fx.fam.light-column.holy.s150`
- `fx.fam.light-column.ice.s100` · `fx.fam.light-column.w3x-00ffff.s150` · `fx.fam.light-column.w3x-ff00ff.s205` · `fx.fam.mark.w3x-ff6400.s125`
- `fx.fam.mark.w3x-ff6400.s85` · `fx.fam.mirror-image.arcane.s100` · `fx.fam.mirror-image.holy.s150` · `fx.fam.mirror-image.physical.s100`
- `fx.fam.mirror-image.physical.s150` · `fx.fam.mirror-image.void.s100` · `fx.fam.missile.fire.s205` · `fx.fam.portal.holy.s160`
- `fx.fam.portal.void.s160` · `fx.fam.resurrect.fire.s95` · `fx.fam.resurrect.holy.s95` · `fx.fam.resurrect.lightning.s95`
- `fx.fam.resurrect.sound.s95` · `fx.fam.resurrect.w3x-ff0000.s170` · `fx.fam.shine.ki.s150` · `fx.fam.shine.nature.s150`
- `fx.fam.shockwave-ring.arcane.s100` · `fx.fam.shockwave-ring.arcane.s150` · `fx.fam.shockwave-ring.earth.s100` · `fx.fam.shockwave-ring.fire.s100`
- `fx.fam.shockwave-ring.fire.s150` · `fx.fam.shockwave-ring.holy.s150` · `fx.fam.shockwave-ring.ki.s100` · `fx.fam.shockwave-ring.lightning.s100`
- `fx.fam.shockwave-ring.lightning.s150` · `fx.fam.shockwave-ring.physical.s100` · `fx.fam.shockwave-ring.physical.s150` · `fx.fam.shockwave-ring.void.s100`
- `fx.fam.shockwave-ring.void.s150` · `fx.fam.shockwave-ring.void.s70` · `fx.fam.shockwave-ring.w3x-00ffff.s100` · `fx.fam.shockwave-ring.w3x-00ffff.s150`
- `fx.fam.tornado.w3x-9696ff.s135` · `fx.fam.tornado.w3x-c86464.s170` · `fx.fam.tornado.wind.s100` · `fx.fam.tornado.wind.s150`
- `fx.firestorm` · `fx.prim.arcane.beam` · `fx.prim.arcane.beam-lg` · `fx.prim.arcane.bolt`
- `fx.prim.arcane.bolt-lg` · `fx.prim.arcane.dash` · `fx.prim.arcane.explosion` · `fx.prim.arcane.nova`
- `fx.prim.arcane.nova-lg` · `fx.prim.arcane.pulse` · `fx.prim.arcane.pulse-lg` · `fx.prim.arcane.pulse-sm`
- `fx.prim.arcane.slash` · `fx.prim.arcane.slash-lg` · `fx.prim.arcane.summon` · `fx.prim.arcane.summon-lg`
- `fx.prim.arcane.swarm` · `fx.prim.blood.nova` · `fx.prim.blood.nova-lg` · `fx.prim.blood.pulse-lg`
- `fx.prim.blood.pulse-sm` · `fx.prim.blood.slash` · `fx.prim.blood.summon` · `fx.prim.earth.beam`
- `fx.prim.earth.bolt` · `fx.prim.earth.nova-lg` · `fx.prim.earth.pulse-sm` · `fx.prim.earth.shockwave`
- `fx.prim.fire.beam` · `fx.prim.fire.bolt` · `fx.prim.fire.explosion` · `fx.prim.fire.explosion-lg`
- `fx.prim.fire.nova` · `fx.prim.fire.pulse` · `fx.prim.fire.pulse-sm` · `fx.prim.fire.slash`
- `fx.prim.fire.slash-lg` · `fx.prim.holy.beam` · `fx.prim.holy.beam-flat` · `fx.prim.holy.beam-lg`
- `fx.prim.holy.dash` · `fx.prim.holy.explosion` · `fx.prim.holy.nova` · `fx.prim.holy.nova-lg`
- `fx.prim.holy.pulse` · `fx.prim.holy.pulse-lg` · `fx.prim.holy.pulse-sm` · `fx.prim.holy.slash`
- `fx.prim.holy.slash-lg` · `fx.prim.holy.swarm-lg` · `fx.prim.holy.tornado-lg` · `fx.prim.ice.beam`
- `fx.prim.ice.bolt` · `fx.prim.ice.bolt-lg` · `fx.prim.ice.explosion-lg` · `fx.prim.ice.nova`
- `fx.prim.ice.pulse-lg` · `fx.prim.ice.pulse-sm` · `fx.prim.ice.shockwave` · `fx.prim.ki.beam`
- `fx.prim.ki.beam-lg` · `fx.prim.ki.bolt` · `fx.prim.ki.bolt-lg` · `fx.prim.ki.explosion-lg`
- `fx.prim.ki.nova` · `fx.prim.ki.nova-lg` · `fx.prim.ki.pulse` · `fx.prim.ki.pulse-lg`
- `fx.prim.ki.pulse-sm` · `fx.prim.ki.shockwave` · `fx.prim.ki.slash` · `fx.prim.lightning.beam`
- `fx.prim.lightning.beam-flat` · `fx.prim.lightning.beam-lg` · `fx.prim.lightning.bolt` · `fx.prim.lightning.dash`
- `fx.prim.lightning.explosion-lg` · `fx.prim.lightning.nova` · `fx.prim.lightning.nova-lg` · `fx.prim.lightning.pulse`
- `fx.prim.lightning.pulse-lg` · `fx.prim.lightning.pulse-sm` · `fx.prim.lightning.slash` · `fx.prim.nature.beam`
- `fx.prim.nature.beam-lg` · `fx.prim.nature.bolt` · `fx.prim.nature.explosion` · `fx.prim.nature.explosion-lg`
- `fx.prim.nature.nova` · `fx.prim.nature.nova-lg` · `fx.prim.nature.pulse` · `fx.prim.nature.pulse-lg`
- `fx.prim.nature.pulse-sm` · `fx.prim.nature.shockwave-lg` · `fx.prim.nature.slash` · `fx.prim.nature.slash-lg`
- `fx.prim.nature.swarm` · `fx.prim.nature.swarm-lg` · `fx.prim.physical.beam` · `fx.prim.physical.beam-lg`
- `fx.prim.physical.bolt` · `fx.prim.physical.explosion-lg` · `fx.prim.physical.nova` · `fx.prim.physical.nova-lg`
- `fx.prim.physical.pulse` · `fx.prim.physical.pulse-lg` · `fx.prim.physical.pulse-sm` · `fx.prim.physical.shockwave`
- `fx.prim.physical.shockwave-lg` · `fx.prim.physical.slash` · `fx.prim.physical.slash-lg` · `fx.prim.physical.swarm`
- `fx.prim.sound.explosion` · `fx.prim.sound.nova` · `fx.prim.sound.nova-lg` · `fx.prim.sound.pulse`
- `fx.prim.sound.pulse-sm` · `fx.prim.sound.swarm-lg` · `fx.prim.void.beam` · `fx.prim.void.beam-lg`
- `fx.prim.void.bolt` · `fx.prim.void.bolt-lg` · `fx.prim.void.dash` · `fx.prim.void.explosion`
- `fx.prim.void.explosion-lg` · `fx.prim.void.nova` · `fx.prim.void.nova-lg` · `fx.prim.void.pulse`
- `fx.prim.void.pulse-lg` · `fx.prim.void.pulse-sm` · `fx.prim.void.shockwave` · `fx.prim.void.slash`
- `fx.prim.void.summon` · `fx.prim.void.swarm` · `fx.prim.void.swarm-lg` · `fx.prim.wind.beam`
- `fx.prim.wind.nova` · `fx.prim.wind.pulse` · `fx.prim.wind.pulse-lg` · `fx.prim.wind.pulse-sm`
- `fx.prim.wind.slash` · `fx.prim.wind.summon-lg` · `fx.prim.wind.tornado` · `fx.prim.wind.tornado-lg`
- `fx.ribbon-slash` · `fx.root-snare` · `fx.scorch-ring` · `fx.thorn`
- `fx.thorn-lash` · `fx.w3x.locust.boomnl.p00` · `fx.w3x.locust.boomnl.p01` · `fx.w3x.locust.boomnl.p02`
- `fx.w3x.locust.boomnl.p03` · `fx.w3x.locust.boomnl.p04` · `fx.w3x.locust.darkraor.p00` · `fx.w3x.locust.darkraor.p01`
- `fx.w3x.locust.darkraor.p02` · `fx.w3x.locust.frostnova.p00` · `fx.w3x.locust.frostnova.p01` · `fx.w3x.locust.frostnova.p02`
- `fx.w3x.locust.frostnova.p03` · `fx.w3x.orb.1hswd-01.p00` · `fx.w3x.orb.1hswd-01.p01` · `fx.w3x.orb.1hswd-01.p02`
- `fx.w3x.orb.bloodbreathstream.p00` · `fx.w3x.orb.bloodbreathstream.p01` · `fx.w3x.orb.bloodbreathstream.p02` · `fx.w3x.orb.darkbreathdamage.p00`
- `fx.w3x.orb.demonfilth.p00` · `fx.w3x.orb.demonfilth.p01` · `fx.w3x.orb.demonfilth.p02` · `fx.w3x.orb.demonfilth.p03`
- `fx.w3x.orb.demonfilth.p04` · `fx.w3x.orb.divinering.p00` · `fx.w3x.orb.divinering.p01` · `fx.w3x.orb.divinering.p02`
- `fx.w3x.orb.divinering.p03` · `fx.w3x.orb.divinering.p04` · `fx.w3x.orb.divinering.p05` · `fx.w3x.orb.divinering.p06`
- `fx.w3x.orb.divinering.p07` · `fx.w3x.orb.divinering.p08` · `fx.w3x.orb.divinering.p09` · `fx.w3x.orb.divinering.p10`
- `fx.w3x.orb.divinering.p11` · `fx.w3x.orb.divinering.p12` · `fx.w3x.orb.divinering.p13` · `fx.w3x.orb.divinering.p14`
- `fx.w3x.orb.divinering.p15` · `fx.w3x.orb.divinering.p16` · `fx.w3x.orb.divinering.p17` · `fx.w3x.orb.divinering.p18`
- `fx.w3x.orb.divinering.p19` · `fx.w3x.orb.herocloudkfksword.p00` · `fx.w3x.orb.herosaber.p00` · `fx.w3x.orb.herosaber.p01`
- `fx.w3x.orb.lightningnova.p00` · `fx.w3x.orb.lightningnova.p01` · `fx.w3x.orb.magical-sword.p00` · `fx.w3x.orb.minitypeflame.p00`
- `fx.w3x.orb.minitypeflame.p01` · `fx.w3x.particle.babyface.p00` · `fx.w3x.particle.blackhole.p00` · `fx.w3x.particle.blackhole.p01`
- `fx.w3x.particle.blackhole.p02` · `fx.w3x.particle.blackhole.p03` · `fx.w3x.particle.blackhole.p04` · `fx.w3x.particle.blackhole.p05`
- `fx.w3x.particle.blackhole.p06` · `fx.w3x.particle.blackhole1.p00` · `fx.w3x.particle.blackhole1.p01` · `fx.w3x.particle.blackhole1.p02`
- `fx.w3x.particle.enchant.p00` · `fx.w3x.particle.enchant.p01` · `fx.w3x.particle.enchant.p02` · `fx.w3x.particle.enchant.p03`
- `fx.w3x.particle.enchant.p04` · `fx.w3x.particle.flamessmoke.p00` · `fx.w3x.particle.flamessmoke.p01` · `fx.w3x.particle.flamessmoke.p02`
- `fx.w3x.particle.flamessmoke.p03` · `fx.w3x.particle.flash.p00` · `fx.w3x.particle.flash.p01` · `fx.w3x.particle.gx.p00`
- `fx.w3x.particle.gxhuge.p00` · `fx.w3x.particle.heroeva01s2.p00` · `fx.w3x.particle.heroeva01s2.p01` · `fx.w3x.particle.heroluffeattack.p00`
- `fx.w3x.particle.heronarutos4effect.p00` · `fx.w3x.particle.heronarutos4effect.p01` · `fx.w3x.particle.heronarutos4effect.p02` · `fx.w3x.particle.heronarutos4effect.p03`
- `fx.w3x.particle.heronarutos4effect.p04` · `fx.w3x.particle.heronarutos4effect.p05` · `fx.w3x.particle.heroraichus3.p00` · `fx.w3x.particle.heroraichus3.p01`
- `fx.w3x.particle.holyawakening.p00` · `fx.w3x.particle.holyawakening.p01` · `fx.w3x.particle.holyawakening.p02` · `fx.w3x.particle.holyawakening.p03`
- `fx.w3x.particle.holyawakening.p04` · `fx.w3x.particle.holyawakening.p05` · `fx.w3x.particle.lasercannonfinalred.p00` · `fx.w3x.particle.lasercannonfinalred.p01`
- `fx.w3x.particle.lasercannonfinalred.p02` · `fx.w3x.particle.lasercannonfinalred.p03` · `fx.w3x.particle.lasercannonfinalred.p04` · `fx.w3x.particle.lasercannonfinalred.p05`
- `fx.w3x.particle.lasercannonfinalred.p06` · `fx.w3x.particle.lasercannonfinalred.p07` · `fx.w3x.particle.lavabreathdamage.p00` · `fx.w3x.particle.musiccast.p00`
- `fx.w3x.particle.musiccast.p01` · `fx.w3x.particle.oblivionaura.p00` · `fx.w3x.particle.sephboom.p00` · `fx.w3x.particle.sephboom.p01`
- `fx.w3x.particle.sephboom.p02` · `fx.w3x.particle.sephboom.p03` · `fx.w3x.particle.sephboom.p04` · `fx.w3x.particle.sephboom.p05`
- `fx.w3x.particle.sephboom.p06` · `fx.w3x.particle.sonicbreathstream.p00` · `fx.w3x.particle.sonicbreathstream.p01` · `fx.w3x.particle.sonicbreathstream.p02`
- `fx.w3x.particle.supershinythingy.p00` · `fx.w3x.particle.supershinythingy.p01` · `fx.w3x.particle.supershinythingy.p02` · `fx.w3x.stock.thunderclapcaster.p00`
- `fx.w3x.stock.warstompcaster.p00` · `godie-1hswd-01-p0` · `godie-1hswd-01-p1` · `godie-1hswd-01-p2`
- `godie-aquaspikeversion2-p0` · `godie-aquaspikeversion2-p1` · `godie-aquaspikeversion2-p10` · `godie-aquaspikeversion2-p11`
- `godie-aquaspikeversion2-p2` · `godie-aquaspikeversion2-p3` · `godie-aquaspikeversion2-p4` · `godie-aquaspikeversion2-p5`
- `godie-aquaspikeversion2-p6` · `godie-aquaspikeversion2-p7` · `godie-aquaspikeversion2-p8` · `godie-aquaspikeversion2-p9`
- `godie-babyface-p0` · `godie-billy-p0` · `godie-blackhole-p0` · `godie-blackhole-p1`
- `godie-blackhole-p2` · `godie-blackhole-p3` · `godie-blackhole-p4` · `godie-blackhole-p5`
- `godie-blackhole-p6` · `godie-blackhole-r0` · `godie-blackhole-r1` · `godie-blackhole1-p0`
- `godie-blackhole1-p1` · `godie-blackhole1-p2` · `godie-bladestorm-swordeffect-p0` · `godie-bloodbreathstream-p0`
- `godie-bloodbreathstream-p1` · `godie-bloodbreathstream-p2` · `godie-boomnl-p0` · `godie-boomnl-p1`
- `godie-boomnl-p2` · `godie-boomnl-p3` · `godie-boomnl-p4` · `godie-bulbasaur-p0`
- `godie-cloud-p0` · `godie-cloud-r0` · `godie-darkbreathdamage-p0` · `godie-darkraor-p0`
- `godie-darkraor-p1` · `godie-darkraor-p2` · `godie-deathwave-p0` · `godie-deathwave-r0`
- `godie-deathwave-r1` · `godie-deathwave-r2` · `godie-demonfilth-p0` · `godie-demonfilth-p1`
- `godie-demonfilth-p2` · `godie-demonfilth-p3` · `godie-demonfilth-p4` · `godie-divinering-p0`
- `godie-divinering-p1` · `godie-divinering-p10` · `godie-divinering-p11` · `godie-divinering-p12`
- `godie-divinering-p13` · `godie-divinering-p14` · `godie-divinering-p15` · `godie-divinering-p16`
- `godie-divinering-p17` · `godie-divinering-p18` · `godie-divinering-p19` · `godie-divinering-p2`
- `godie-divinering-p3` · `godie-divinering-p4` · `godie-divinering-p5` · `godie-divinering-p6`
- `godie-divinering-p7` · `godie-divinering-p8` · `godie-divinering-p9` · `godie-earthtornado2-p0`
- `godie-earthtornado2-p1` · `godie-earthtornado2-p10` · `godie-earthtornado2-p11` · `godie-earthtornado2-p12`
- `godie-earthtornado2-p13` · `godie-earthtornado2-p2` · `godie-earthtornado2-p3` · `godie-earthtornado2-p4`
- `godie-earthtornado2-p5` · `godie-earthtornado2-p6` · `godie-earthtornado2-p7` · `godie-earthtornado2-p8`
- `godie-earthtornado2-p9` · `godie-enchant-p0` · `godie-enchant-p1` · `godie-enchant-p2`
- `godie-enchant-p3` · `godie-enchant-p4` · `godie-fireblast-p0` · `godie-fireblast-p1`
- `godie-fireblast-p2` · `godie-fireblast-p3` · `godie-flamessmoke-p0` · `godie-flamessmoke-p1`
- `godie-flamessmoke-p2` · `godie-flamessmoke-p3` · `godie-flash-p0` · `godie-flash-p1`
- `godie-fox-p0` · `godie-fox2-p0` · `godie-frostnova-p0` · `godie-frostnova-p1`
- `godie-frostnova-p2` · `godie-frostnova-p3` · `godie-gumdam-p0` · `godie-gumdam-p1`
- `godie-gumdam-p2` · `godie-gumdam-p3` · `godie-gumdam-p4` · `godie-gx-p0`
- `godie-gx-r0` · `godie-gxhuge-p0` · `godie-gxhuge-r0` · `godie-herobuu-p0`
- `godie-herocloudkfksword-p0` · `godie-herocloudstrife-p0` · `godie-herocloudstrife-p1` · `godie-herocloudstrife-r0`
- `godie-heroeva01s2-p0` · `godie-heroeva01s2-p1` · `godie-herofate-p0` · `godie-herofate-p1`
- `godie-herofate-r0` · `godie-herogirl-r0` · `godie-herogirl-r1` · `godie-herohanzouhattori-p0`
- `godie-herohanzouhattori-r0` · `godie-herohehi-p0` · `godie-herohehi-r0` · `godie-herohimurakenshin-p0`
- `godie-herohimurakenshin-p1` · `godie-herohimurakenshin-r0` · `godie-heroichigo-p0` · `godie-heroichigo-r0`
- `godie-heroichigo-r1` · `godie-herokunoichi-r0` · `godie-herokunoichi-r1` · `godie-herokyo-p0`
- `godie-herokyo-r0` · `godie-heroluffeattack-p0` · `godie-heromiku-p0` · `godie-heromiku-p1`
- `godie-heromusashimiyamoto-p0` · `godie-heromusashimiyamoto-r0` · `godie-heromusashimiyamoto-r1` · `godie-heronarutos4effect-p0`
- `godie-heronarutos4effect-p1` · `godie-heronarutos4effect-p2` · `godie-heronarutos4effect-p3` · `godie-heronarutos4effect-p4`
- `godie-heronarutos4effect-p5` · `godie-herooichi-p0` · `godie-herooichi-p1` · `godie-heroraichus3-p0`
- `godie-heroraichus3-p1` · `godie-herorider-p0` · `godie-heroryuk-p0` · `godie-herosaber-p0`
- `godie-herosaber-p1` · `godie-herosaber-r0` · `godie-herosasuke-p0` · `godie-herosasuke-p1`
- `godie-herosasuke-p2` · `godie-herosasuke-p3` · `godie-herosasuke-r0` · `godie-herosasuke-r1`
- `godie-herosephiroth-p0` · `godie-herosephiroth-r0` · `godie-heroshana-p0` · `godie-heroshana-p1`
- `godie-heroshana-p2` · `godie-heroshana-r0` · `godie-herotoshiiemaeda-p0` · `godie-herotoshiiemaeda-r0`
- `godie-heroxelloss-p0` · `godie-heroxelloss-p1` · `godie-holyawakening-p0` · `godie-holyawakening-p1`
- `godie-holyawakening-p2` · `godie-holyawakening-p3` · `godie-holyawakening-p4` · `godie-holyawakening-p5`
- `godie-holyawakening-r0` · `godie-holyawakening-r1` · `godie-holyawakening-r2` · `godie-holyawakening-r3`
- `godie-holyawakening-r4` · `godie-holyawakening-r5` · `godie-holyawakening-r6` · `godie-holyawakening-r7`
- `godie-horse-p0` · `godie-lasercannonfinalred-p0` · `godie-lasercannonfinalred-p1` · `godie-lasercannonfinalred-p2`
- `godie-lasercannonfinalred-p3` · `godie-lasercannonfinalred-p4` · `godie-lasercannonfinalred-p5` · `godie-lasercannonfinalred-p6`
- `godie-lasercannonfinalred-p7` · `godie-lavabreathdamage-p0` · `godie-lightningnova-p0` · `godie-lightningnova-p1`
- `godie-lightningtornado-p0` · `godie-lightningtornado-p1` · `godie-lightningtornado-p10` · `godie-lightningtornado-p11`
- `godie-lightningtornado-p12` · `godie-lightningtornado-p13` · `godie-lightningtornado-p2` · `godie-lightningtornado-p3`
- `godie-lightningtornado-p4` · `godie-lightningtornado-p5` · `godie-lightningtornado-p6` · `godie-lightningtornado-p7`
- `godie-lightningtornado-p8` · `godie-lightningtornado-p9` · `godie-linainvers-p0` · `godie-linainvers-p1`
- `godie-linainvers-p2` · `godie-lubu-p0` · `godie-lubu-p1` · `godie-lubu-p2`
- `godie-lubu-r0` · `godie-ma-p0` · `godie-ma-p1` · `godie-magical-sword-p0`
- `godie-meteor-p0` · `godie-meteor-p1` · `godie-meteor-p2` · `godie-meteor-p3`
- `godie-meteor-p4` · `godie-meteor-p5` · `godie-meteor-p6` · `godie-meteor-p7`
- `godie-mfls-r0` · `godie-mfls-r1` · `godie-minitypeflame-p0` · `godie-minitypeflame-p1`
- `godie-negi-p0` · `godie-negi-p1` · `godie-netherstrike-p0` · `godie-netherstrike-p1`
- `godie-netherstrike-p2` · `godie-netherstrike-p3` · `godie-netherstrike-p4` · `godie-niya-p0`
- `godie-niya-p1` · `godie-niya-r0` · `godie-oblivionaura-p0` · `godie-picacugy-r0`
- `godie-renaryugu2-p0` · `godie-renaryugu2-p1` · `godie-renaryugu2-r0` · `godie-sd2-r0`
- `godie-sd2-r1` · `godie-sd2-r2` · `godie-sd2-r3` · `godie-sesshomaru-p0`
- `godie-sesshomaru-r0` · `godie-sonicbreathstream-p0` · `godie-sonicbreathstream-p1` · `godie-sonicbreathstream-p2`
- `godie-supershinythingy-p0` · `godie-supershinythingy-p1` · `godie-supershinythingy-p2` · `godie-supershinythingy-r0`
- `godie-supershinythingy-r1` · `godie-supershinythingy-r2` · `godie-tectonicfury-p0` · `godie-tectonicfury-p1`
- `godie-windmissle-r0` · `godie-windmissle-r1` · `godie-windmissle-r2` · `godie-ye-wuqi1-p0`
- `godie-ye-wuqi1-p1` · `godie-ye-wuqi1-p2` · `godie-ye-wuqi1-r0`

## ⛔ 已知壞掉 / 未支援

- ⛔ `hook:onDeath` —— 已知壞掉（GH#296）
- ⛔ `action.copy-buff@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.create-portal@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.create-terrain@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.evolve-item@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.modify-arena-boundary@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.redirect-damage@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.release-stored-damage@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.rewind-state@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.sacrifice-item@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.store-damage@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.swap-position@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `action.transfer-cooldown@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `condition.ability-state@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `effect.attack-dash@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON
- ⛔ `effect.control-restriction@1` —— 宣告為 unsupported，⛔ 不要寫進 JSON


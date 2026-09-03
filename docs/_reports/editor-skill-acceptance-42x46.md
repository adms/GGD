# Editor 技能自我驗收：42 個主題／46 份實際技能

產生時間（至分鐘）：2026-09-03T23:36+08:00

> JSON/schema/單元測試通過不等於視覺通過。每列必須有真 framebuffer 關鍵格與人工裁決；八招另做逐階段嚴格比對。

- 範圍：42 個主題／46 份技能（Owner 25＋runtime 補集 21）
- 嚴格視覺子集：8
- 全體視覺判定：已通過 1；失敗 23；待看圖 0；被接縫阻塞 22
- GPU 批次：已擷取 20；畫面守衛失敗 4；契約／素材阻塞 22
- 自動根因：APPEARANCE_STAND_IN 7、CAPTURE_TIMEOUT 1、FRAMEBUFFER_CARRIER 3、LOW_VISUAL_HYGIENE 2、PRESENTATION_ARTIFACT 12、UNSUPPORTED_EVENT_BRICK 16
- 自動分工：editor 15、editor-then-main 3、main 23
- VFX 自訂事件缺口：onAbilityCast、onAbilityHit、onBasicAttack、onDamageDealt、onDamageTaken、onEvade、onInterval、onKill、onStunned

| 技能 | 主題 | 設計師路徑 | 事件演出 | 畫面證據 | 自動根因 | 狀態 |
|---|---|---|---|---|---|---|
| `godie-hart.r` 01-04 超究武神霸斬 | `ability:godie-hart.r` | preset-stack-plus-advanced-form（combo） | complete | failed／1 格／pending | CAPTURE_TIMEOUT/editor | **fail** |
| `godie-hjai.e` 04-03 龍破斬 | `ability:godie-hjai.e` | preset-stack-plus-advanced-form（projectile-blast） | complete | captured／4 格／fail／2分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-h020.e` 04-03 龍破斬 | `ability:godie-hjai.e` | preset-stack-plus-advanced-form（projectile-blast） | complete | captured／2 格／fail／0分 | PRESENTATION_ARTIFACT/editor、LOW_VISUAL_HYGIENE/editor | **fail** |
| `godie-hjai.r` 04-04 神滅斬 | `ability:godie-hjai.r` | advanced-no-code-effect-form | complete | captured／3 格／fail／2分 | — | **fail** |
| `godie-nbbc.r` 08-04 阿邦快速劍X | `ability:godie-nbbc.r` | advanced-no-code-effect-form | complete | captured／4 格／fail／2分 | — | **fail** |
| `godie-nbbc.e` 08-03 龍鬥氣砲咒文 | `ability:godie-nbbc.e` | advanced-no-code-effect-form | complete | captured／4 格／fail／2分 | — | **fail** |
| `godie-ogrh.r` 09-04 龜派氣功 | `ability:godie-ogrh.r` | preset-stack-plus-advanced-form（beam） | complete | failed／1 格／pending | FRAMEBUFFER_CARRIER/editor-then-main | **fail** |
| `godie-o00x.r` 09-04 龜派氣功 | `ability:godie-ogrh.r` | preset-stack-plus-advanced-form（beam） | complete | failed／1 格／pending | FRAMEBUFFER_CARRIER/editor-then-main | **fail** |
| `godie-e002.ex` 20-002 解放.約束勝利劍MAX | `chain:avalon-ex` | preset-stack-plus-advanced-form（reactive） | complete | captured／4 格／fail／2分 | — | **fail** |
| `godie-e00l.r` 20-04 Avalon-永恆的理想鄉 | `chain:avalon-ex` | advanced-no-code-effect-form | partial：onDamageTaken | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00l.ex` 20-002 解放.約束勝利劍MAX | `chain:avalon-ex` | preset-stack-plus-advanced-form（reactive） | complete | captured／2 格／fail／1分 | — | **fail** |
| `godie-hvsh.r` 48-04 騎英之疆繩 | `ability:godie-hvsh.r` | template-product | complete | captured／4 格／fail／2分 | PRESENTATION_ARTIFACT/editor、LOW_VISUAL_HYGIENE/editor | **fail** |
| `godie-hvwd.e` 02-03 魂飛魄散 | `ability:godie-hvwd.e` | template-product（single-burst） | complete | captured／2 格／fail／2分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-o00k.e` 86-03 神鳴 | `ability:godie-o00k.e` | template-product（instant-area） | complete | captured／2 格／fail／1分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-hjai.w` 04-02 炸彈陣 | `ability:godie-hjai.w` | template-product（periodic-field） | complete | failed／1 格／pending | FRAMEBUFFER_CARRIER/editor-then-main | **fail** |
| `godie-nbbc.w` 08-02 萊丁快速劍 | `ability:godie-nbbc.w` | template-product（blink-strike） | complete | captured／2 格／fail／0分 | — | **fail** |
| `godie-u00v.r` 78-04 死亡噴射肘擊 | `ability:godie-u00v.r` | preset-stack-plus-advanced-form（charge-push） | complete | captured／2 格／fail／0分 | — | **fail** |
| `godie-hapm.w` 52-02 蹂躪編年史 | `ability:godie-hapm.w` | preset-stack-plus-advanced-form（leap） | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-e001.r` 22-04 雛見澤症候群L5 | `ability:godie-e001.r` | preset-stack-plus-advanced-form（self-buff） | complete | captured／2 格／fail／3分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-e00s.w` 70-02 大怒石 | `ability:godie-e00s.w` | preset-stack-plus-advanced-form（on-attack） | partial：onBasicAttack | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-etyr.r` 14-04 聖夜降臨 | `ability:godie-etyr.r` | template-product（summon） | complete | captured／2 格／fail／3分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-ogld.ex` 72-002 億萬衛星殞落 | `ability:godie-ogld.ex` | preset-stack-plus-advanced-form（barrage） | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-udea.r` 65-04 天譴 | `ability:godie-udea.r` | advanced-no-code-effect-form | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-h01n.r` 79-04 卍解 | `ability:godie-h01n.r` | advanced-no-code-effect-form | complete | captured／2 格／fail／4分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-h00l.r` 60-04 完美盾反 | `ability:godie-h00l.r` | advanced-no-code-effect-form | partial：onDamageTaken | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-hvsh.e` 48-03 鮮血神殿 | `ability:godie-hvsh.e` | advanced-no-code-effect-form | partial：onInterval、onKill | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-n00b.passive` 57-00 四次元口袋 | `ability:godie-n00b.passive` | advanced-no-code-effect-form | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-e00r.ex` 59-001 完全暴走 | `ability:godie-e00r.ex` | advanced-no-code-effect-form | partial：onDamageTaken、onInterval | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00s.ex` 70-002 樹海降臨 | `ability:godie-e00s.ex` | advanced-no-code-effect-form | partial：onAbilityCast | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00w.passive` 77-00 浮雲-旋一閃 | `ability:godie-e00w.passive` | advanced-no-code-effect-form | partial：onEvade | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-edem.r` 45-04 哥哥 | `ability:godie-edem.r` | advanced-no-code-effect-form | partial：onAbilityHit | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-emfr.e` 15-03 獄炎煉我 | `ability:godie-emfr.e` | advanced-no-code-effect-form | partial：onBasicAttack、onDamageDealt | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-nbbc.passive` 08-00 龍紋記憶 | `ability:godie-nbbc.passive` | advanced-no-code-effect-form | partial：onStunned | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00l.passive` 20-00 銀色甲胄 | `ability:godie-e00l.passive` | advanced-no-code-effect-form | partial：onDamageTaken | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00r.q` 59-01 吞噬 | `ability:godie-e00r.q` | advanced-no-code-effect-form | partial：onInterval | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-e00s.r` 70-04 千年練成 | `ability:godie-e00s.r` | advanced-no-code-effect-form | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-h02k.ex` 89-002 俄羅斯輪盤 | `ability:godie-h02k.ex` | advanced-no-code-effect-form | complete | blocked／0 格／pending | APPEARANCE_STAND_IN/main | **blocked** |
| `godie-edem.e` 45-03 千鳥 | `ability:godie-edem.e` | advanced-no-code-effect-form | complete | captured／1 格／fail／1分 | — | **fail** |
| `godie-edem.ex` 45-002 天照 | `ability:godie-edem.ex` | advanced-no-code-effect-form | complete | captured／2 格／fail／3分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-efur.passive` 13-00 念。攻防轉換 | `ability:godie-efur.passive` | advanced-no-code-effect-form | partial：onBasicAttack | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-emfr.ex` 15-002 敵彈吸收陣。太陰道 | `ability:godie-emfr.ex` | advanced-no-code-effect-form | partial：onDamageTaken | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-emns.ex` 44-002 交換筆記本 | `ability:godie-emns.ex` | advanced-no-code-effect-form | complete | captured／2 格／fail／1分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-emns.passive` 44-00 機警 | `ability:godie-emns.passive` | advanced-no-code-effect-form | complete | captured／2 格／pass／6分 | PRESENTATION_ARTIFACT/editor | **pass** |
| `godie-h01u.r` 80-04 赤兔咆哮 | `ability:godie-h01u.r` | advanced-no-code-effect-form | partial：onBasicAttack、onDamageTaken | blocked／0 格／pending | UNSUPPORTED_EVENT_BRICK/main | **blocked** |
| `godie-h02u.ex` 92-002 最終戈壁 | `ability:godie-h02u.ex` | advanced-no-code-effect-form | complete | captured／2 格／fail／4分 | PRESENTATION_ARTIFACT/editor | **fail** |
| `godie-hapm.q` 52-01 狂戰士之怒 | `ability:godie-hapm.q` | advanced-no-code-effect-form | partial：onDamageTaken | blocked／0 格／pending | APPEARANCE_STAND_IN/main、UNSUPPORTED_EVENT_BRICK/main | **blocked** |

## 判定邊界

- `blocked` 不是 Editor 自己發明近似效果的許可；Main 要補可重用事件／積木契約，Editor 再接 UI。
- `needs-frame-review` 表示資料與操作入口成立，但尚無人看過實際遊戲畫面，不能宣稱完成。
- 八招是高風險壓力測試，不是其餘 38 份的替代品。

# Editor 技能自我驗收：43 個主題／47 份實際技能

產生時間（至分鐘）：2026-09-07T06:08+08:00

> JSON/schema/單元測試通過不等於視覺通過。每列必須有真 framebuffer 關鍵格與人工裁決；八招另做逐階段嚴格比對。

- 範圍：43 個主題／47 份技能（Owner 26＋runtime 補集 21）
- 嚴格視覺子集：8 個主題／11 份技能文件（直接讀 Main 機器契約）
- 全體視覺判定：已通過 0；失敗 0；待看圖 47；被接縫阻塞 0
- GPU 批次：已擷取 46；畫面守衛失敗 0；契約／素材阻塞 0
- 自動根因：MISSING_VISUAL_BRICK 7
- 自動分工：main 7
- 基本視覺安全替代：0 份（只替換 Editor baseline，不改原技能綁定）
- 真機制節點自動補圖：31 份／79 塊（只存在預覽副本，未改 gameplay JSON）
- VFX Script 直接時間軸未涵蓋（不是 Main 阻塞；由 Skill Forge 效果圖綁定）：onAbilityCast、onAbilityHit、onBasicAttack、onDamageDealt、onDamageTaken、onEvade、onInterval、onKill、onStunned

| 技能 | 主題 | 設計師路徑 | 事件演出 | 畫面證據 | 自動根因 | 狀態 |
|---|---|---|---|---|---|---|
| `godie-u034.passive` 06-00 猜猜拳 | `ability:godie-u034.passive` | preset-stack-plus-advanced-form（on-attack） | not-applicable | missing／0 格／pending | — | **needs-frame-review** |
| `godie-hart.r` 01-04 超究武神霸斬 | `ability:godie-hart.r` | preset-stack-plus-advanced-form（combo） | not-applicable | captured／8 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-hjai.e` 04-03 龍破斬 | `ability:godie-hjai.e` | preset-stack-plus-advanced-form（projectile-blast） | not-applicable | captured／7 格／pending | — | **needs-frame-review** |
| `godie-h020.e` 04-03 龍破斬 | `ability:godie-hjai.e` | preset-stack-plus-advanced-form（projectile-blast） | not-applicable | captured／7 格／pending | — | **needs-frame-review** |
| `godie-hjai.r` 04-04 神滅斬 | `ability:godie-hjai.r` | advanced-no-code-effect-form | not-applicable | captured／3 格／pending | — | **needs-frame-review** |
| `godie-nbbc.r` 08-04 阿邦快速劍X | `ability:godie-nbbc.r` | advanced-no-code-effect-form | not-applicable | captured／5 格／pending | — | **needs-frame-review** |
| `godie-nbbc.e` 08-03 龍鬥氣砲咒文 | `ability:godie-nbbc.e` | advanced-no-code-effect-form | not-applicable | captured／3 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-ogrh.r` 09-04 龜派氣功 | `ability:godie-ogrh.r` | preset-stack-plus-advanced-form（beam） | not-applicable | captured／3 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-o00x.r` 09-04 龜派氣功 | `ability:godie-ogrh.r` | preset-stack-plus-advanced-form（beam） | not-applicable | captured／3 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-e002.ex` 20-002 解放.約束勝利劍MAX | `chain:avalon-ex` | preset-stack-plus-advanced-form（reactive） | skill-forge-effect-graph | captured／9 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-e00l.r` 20-04 Avalon-永恆的理想鄉 | `chain:avalon-ex` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken | captured／3 格／pending | — | **needs-frame-review** |
| `godie-e00l.ex` 20-002 解放.約束勝利劍MAX | `chain:avalon-ex` | preset-stack-plus-advanced-form（reactive） | skill-forge-effect-graph | captured／9 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-hvsh.r` 48-04 騎英之疆繩 | `ability:godie-hvsh.r` | template-product | not-applicable | captured／3 格／pending | MISSING_VISUAL_BRICK/main#solid-beam | **needs-frame-review** |
| `godie-hvwd.e` 02-03 魂飛魄散 | `ability:godie-hvwd.e` | template-product（single-burst） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-o00k.e` 86-03 神鳴 | `ability:godie-o00k.e` | template-product（instant-area） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-hjai.w` 04-02 炸彈陣 | `ability:godie-hjai.w` | template-product（periodic-field） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-nbbc.w` 08-02 萊丁快速劍 | `ability:godie-nbbc.w` | template-product（blink-strike） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-u00v.r` 78-04 死亡噴射肘擊 | `ability:godie-u00v.r` | preset-stack-plus-advanced-form（charge-push） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-hapm.w` 52-02 蹂躪編年史 | `ability:godie-hapm.w` | preset-stack-plus-advanced-form（leap） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-e001.r` 22-04 雛見澤症候群L5 | `ability:godie-e001.r` | template-product（self-buff） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-e00s.w` 70-02 大怒石 | `ability:godie-e00s.w` | preset-stack-plus-advanced-form（on-attack） | skill-forge-effect-graph；script 時間軸：onBasicAttack | captured／2 格／pending | — | **needs-frame-review** |
| `godie-etyr.r` 14-04 聖夜降臨 | `ability:godie-etyr.r` | template-product（summon） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-ogld.ex` 72-002 億萬衛星殞落 | `ability:godie-ogld.ex` | preset-stack-plus-advanced-form（barrage） | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-udea.r` 65-04 天譴 | `ability:godie-udea.r` | advanced-no-code-effect-form | not-applicable | captured／5 格／pending | — | **needs-frame-review** |
| `godie-h01n.r` 79-04 卍解 | `ability:godie-h01n.r` | advanced-no-code-effect-form | not-applicable | captured／4 格／pending | — | **needs-frame-review** |
| `godie-h00l.r` 60-04 完美盾反 | `ability:godie-h00l.r` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken | captured／3 格／pending | — | **needs-frame-review** |
| `godie-hvsh.e` 48-03 鮮血神殿 | `ability:godie-hvsh.e` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onInterval、onKill | captured／8 格／pending | — | **needs-frame-review** |
| `godie-n00b.passive` 57-00 四次元口袋 | `ability:godie-n00b.passive` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-e00r.ex` 59-001 完全暴走 | `ability:godie-e00r.ex` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken、onInterval | captured／8 格／pending | — | **needs-frame-review** |
| `godie-e00s.ex` 70-002 樹海降臨 | `ability:godie-e00s.ex` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onAbilityCast | captured／4 格／pending | — | **needs-frame-review** |
| `godie-e00w.passive` 77-00 浮雲-旋一閃 | `ability:godie-e00w.passive` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onEvade | captured／2 格／pending | — | **needs-frame-review** |
| `godie-edem.r` 45-04 哥哥 | `ability:godie-edem.r` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onAbilityHit | captured／3 格／pending | — | **needs-frame-review** |
| `godie-emfr.e` 15-03 獄炎煉我 | `ability:godie-emfr.e` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onBasicAttack、onDamageDealt | captured／8 格／pending | — | **needs-frame-review** |
| `godie-nbbc.passive` 08-00 龍紋記憶 | `ability:godie-nbbc.passive` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onStunned | captured／3 格／pending | — | **needs-frame-review** |
| `godie-e00l.passive` 20-00 銀色甲胄 | `ability:godie-e00l.passive` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken | captured／2 格／pending | — | **needs-frame-review** |
| `godie-e00r.q` 59-01 吞噬 | `ability:godie-e00r.q` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onInterval | captured／2 格／pending | — | **needs-frame-review** |
| `godie-e00s.r` 70-04 千年練成 | `ability:godie-e00s.r` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-h02k.ex` 89-002 俄羅斯輪盤 | `ability:godie-h02k.ex` | advanced-no-code-effect-form | not-applicable | captured／2 格／pending | — | **needs-frame-review** |
| `godie-edem.e` 45-03 千鳥 | `ability:godie-edem.e` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-edem.ex` 45-002 天照 | `ability:godie-edem.ex` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-efur.passive` 13-00 念。攻防轉換 | `ability:godie-efur.passive` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onBasicAttack | captured／2 格／pending | — | **needs-frame-review** |
| `godie-emfr.ex` 15-002 敵彈吸收陣。太陰道 | `ability:godie-emfr.ex` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken | captured／3 格／pending | — | **needs-frame-review** |
| `godie-emns.ex` 44-002 交換筆記本 | `ability:godie-emns.ex` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-emns.passive` 44-00 機警 | `ability:godie-emns.passive` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-h01u.r` 80-04 赤兔咆哮 | `ability:godie-h01u.r` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onBasicAttack、onDamageTaken | captured／8 格／pending | — | **needs-frame-review** |
| `godie-h02u.ex` 92-002 最終戈壁 | `ability:godie-h02u.ex` | advanced-no-code-effect-form | not-applicable | captured／8 格／pending | — | **needs-frame-review** |
| `godie-hapm.q` 52-01 狂戰士之怒 | `ability:godie-hapm.q` | advanced-no-code-effect-form | skill-forge-effect-graph；script 時間軸：onDamageTaken | captured／8 格／pending | — | **needs-frame-review** |

## 判定邊界

- `blocked` 只用於機器契約真的缺少 required effect/hook/condition，不能因 `vfx-script@1` 沒有直連 hook 就誤報；該路徑由 Skill Forge 的 hook effect graph 組裝。
- `needs-frame-review` 表示資料與操作入口成立，但尚無人看過實際遊戲畫面，不能宣稱完成。
- 八招是高風險壓力測試，不是其餘 38 份的替代品。

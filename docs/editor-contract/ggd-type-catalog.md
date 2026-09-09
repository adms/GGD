# GGD type 目錄（給編輯器挑的積木）

> ⛔ **這份是產生的** —— `pnpm typecat:build`。改它請改 `content/ability-templates/`。
> ⭐ 交付格式與止損協定見 `CODEX_TYPE_HANDOFF.md`；機器可讀版在 `ggd-type-catalog.json`。

**66 個可挑 type** · ⭐ 1 個「分析做完但引擎沒接線」 · ⛔ 9 個空殼 · 1 個哨兵 · 矩陣 154/325 格

## ⭐⭐ 怎麼 fail-closed

- ⭐ 只挑 `expands: true` 的。⛔ `declaredStatus` 是宣告，`expands` 是量出來的事實。
- ⭐ 看 `wiring`：`node` 要寫成 `{"kind":"spawnModelFx","preset":"<id>"}`；`doc` 要寫成 `{"template":{"ref":"<id>","params":{…}}}`；`both` 兩條都行。
- ⭐ 逐格看 `params[*].fillsVia` —— 寫錯邊的那一格**不會有任何東西紅**，它只是不會發生。
- ⛔ `analysedButUnwired` 裡的**不要挑** —— 展開會失敗，而系統是 fail-soft ⇒ 那一支技能**還在、但一個模板效果都沒有**，⛔ 畫面上與「這招就是沒效果」一模一樣。
- ⛔⛔ **`inertParams` 裡的每一格填了也不會發生** —— 模板自己宣告的。⭐ `params[*].inert` 帶著逐字理由。⚠️ 今天 12 格，而其中 5 份模板是 `enabled` 且挑得到 —— 包含 `tpl-beam-roll.speed` / `.distance`（光束砲家族，13 個節點在用）。
- ⚠️ ⭐ 挑一個 `modelKey` 之前查 `modelFxEmitters.modelsWithEmitters`：那顆模型若自帶粒子，`modelFxEmitters.lostByEmitters` 的每一格**寫了也只作用在網格那一半** ⇒ ⛔ 同一顆模型會顯示兩種顏色／兩種大小，而沒有任何東西紅。

## ⭐ 可挑的 type（`expand()` 真的跑得過）

| id | 佈線 | 參數 | ⛔ inert | preset 用量 | ref 用量 | gap | exemplar |
|---|---|---:|---|---:|---:|---:|---|
| `hero-template.00f870cec154f9b8c3c2cfa420c54bfef7d028bd98faa8a8` | `doc` | 6 | — | 0 | 0 | 9 | 23-04 雷焰聖劍 |
| `hero-template.0e807c24299291d3e0b66bc67f569a749b0f1d3ce797209b` | `doc` | 6 | — | 0 | 0 | 7 | 17-03 空破圓斬 |
| `hero-template.1112de91c80812d8694c17311498df56dc44e672d3fe9804` | `both` | 12 | ⛔ championId | 0 | 0 | 4 | 28-02 分身（普屋） |
| `hero-template.231f0dfefbb7bfcdc79c8bd7390d325dd53050127edd7cd6` | `doc` | 12 | — | 0 | 0 | 3 | 52-02 蹂躪編年史（`A0U1`，`content/abilities/godie-hapm.w.json`） |
| `hero-template.4943347c4d1f7e52606a8e42024c3ca0fd53449f7b045f16` | `doc` | 6 | — | 0 | 0 | 5 | godie-n01c.w（出貨最接近預設的那一支） |
| `hero-template.5e32c7c7058f94bde709b5227a3055b220279f0e74f0eda6` | `doc` | 4 | — | 0 | 0 | 9 | 08-01 雙龍紋（content/abilities/godie-n01c.q.json） |
| `hero-template.7737c132c32231e336a95ad3052ea0092a0eaba31a4d4550` | `doc` | 5 | — | 0 | 0 | 10 | GGD 社群複合效果／阿薩謝爾、反擊與資源技能 |
| `hero-template.895ceb9c437ad0cf6b74a583c7dcc6d6c978841f3076cb71` | `doc` | 6 | — | 0 | 0 | 9 | 90-04 陽光烈焰（content/abilities/godie-h02r.r.json） |
| `hero-template.8ad74d5c99ca88a9cf4b5ef5ae62dd670596b201d42e78b4` | `doc` | 1 | — | 0 | 0 | 9 | 57-02 任意門（content/abilities/godie-n00b.e.json） |
| `hero-template.8d382489b905a2e77aac79e44ffaf19d847e9aa247a45806` | `both` | 9 | — | 0 | 0 | 5 | 90-01 飛葉快刀（每秒對附近的敵人造成傷害，持續2秒） |
| `hero-template.981b52af12fc60fb0494218d7db3d4c24f9fc57ecd93cf4b` | `doc` | 3 | — | 0 | 0 | 9 | 70-03 木束縛之術（content/abilities/godie-e010.e.json） |
| `hero-template.a0174c3324e732c421ab641d1e36cd2f49f758475f851ee4` | `doc` | 5 | ⛔ reflectRadius | 0 | 0 | 7 | 20-04 Avalon |
| `hero-template.bdc30b4f4711cc9d5e3decf5c46c5956dd1456ff54ec6692` | `doc` | 6 | — | 0 | 0 | 6 | 82-04 闇之魔法 |
| `hero-template.c33b22d340850d588b70a71ed4377ba7739117b86ce44d77` | `doc` | 1 | — | 0 | 0 | 10 | GGD 社群複合效果／阿薩謝爾、反擊與資源技能 |
| `hero-template.c908c89286a452169fdeb648106cf65dac155753e5cc6b52` | `doc` | 10 | — | 0 | 0 | 5 | 07-03 列、在、前 |
| `hero-template.c9ccb3b440c3024518be1a4ec531f04e61a6c134c3f55010` | `doc` | 6 | — | 0 | 0 | 9 | 58-04 神騎寶貝（content/abilities/godie-ofar.r.json）—— 出貨最單純的一支：只換身體、6 秒、沒有伴隨增益 |
| `hero-template.e4284bb72d791d2863042dd5fdcec2a19e0bf561c115771c` | `doc` | 10 | — | 0 | 0 | 6 | 84-04 給我蜂蜜 |
| `hero-template.ee4e26d179d0e2f6552c666a0b6354e588bb4a18cdc92368` | `doc` | 11 | — | 0 | 0 | 5 | 38-01 邪王炎殺劍 |
| `hero-template.eeb97623763a184bab0219a940b43f3db6560ce19bb58990` | `doc` | 8 | — | 0 | 0 | 4 | 90-00 寄生種子（妙蛙種子／妙蛙花 `godie-hgam.passive` ＋ `godie-h02r.passive`） |
| `tpl-ally-shield` | `doc` | 6 | — | 0 | 0 | 10 | GH#1132：37 名社群英雄裡提到友軍的 18 槽（12 槽今天誤綁 tpl-buff-self） |
| `tpl-apply-status` | `doc` | 3 | — | 0 | 6 | 9 | 70-03 木束縛之術（content/abilities/godie-e010.e.json） |
| `tpl-area-strike` | `doc` | 12 | — | 0 | 11 | 10 | 77-01（godie-e00w.q） |
| `tpl-beam-roll` | `both` | 21 | ⛔ speed distance | 13 | 0 | 8 | 20-03 約束與勝利之劍 |
| `tpl-blink` | `doc` | 1 | — | 0 | 7 | 9 | 57-02 任意門（content/abilities/godie-n00b.e.json） |
| `tpl-blink-strike` | `doc` | 6 | — | 0 | 1 | 5 | godie-n01c.w（出貨最接近預設的那一支） |
| `tpl-buff-self` | `doc` | 6 | — | 0 | 98 | 6 | 82-04 闇之魔法 |
| `tpl-charge-push` | `doc` | 11 | — | 0 | 12 | 5 | 38-01 邪王炎殺劍 |
| `tpl-charge-resource` | `doc` | 6 | ⛔ maxStacks | 0 | 0 | 10 | GH#1132：武藤遊戲〔決鬥者的布局〕—— 逐字「每次施法最多增加一層，上限三層，供 EX 消耗」 |
| `tpl-combo-finisher` | `doc` | 13 | — | 0 | 0 | 8 | 01-04 超究武神霸斬 |
| `tpl-dragon-quake` | `both` | 15 | ⛔ ringRadius blastRadius shakeAmplitude shakeSec impactLifeSec scatterBox damage damageType | 0 | 0 | 8 | 38-03 邪王炎殺黑龍波 |
| `tpl-dragon-serpent` | `both` | 17 | ⛔ serpentineDeg damageTiming touchRadius damage damageType | 0 | 0 | 6 | 38-002 究極暴走黑龍波 |
| `tpl-drain-leech` | `doc` | 8 | — | 0 | 5 | 4 | 90-00 寄生種子（妙蛙種子／妙蛙花 `godie-hgam.passive` ＋ `godie-h02r.passive`） |
| `tpl-effect-sequence` | `doc` | 5 | — | 0 | 0 | 10 | GGD 社群複合效果／阿薩謝爾、反擊與資源技能 |
| `tpl-event-passive` | `doc` | 1 | — | 0 | 0 | 10 | GGD 社群複合效果／阿薩謝爾、反擊與資源技能 |
| `tpl-ground-nova` | `doc` | 4 | — | 0 | 5 | 8 | 80-03 鬼神烈戟 |
| `tpl-growth-charge` | `doc` | 9 | — | 0 | 0 | 4 | 07-00 獸化心靈（蒼月潮 `godie-hpb1.passive`） |
| `tpl-heal` | `doc` | 4 | — | 0 | 6 | 9 | 08-01 雙龍紋（content/abilities/godie-n01c.q.json） |
| `tpl-instant-blast` | `doc` | 4 | — | 0 | 16 | 8 | 90-03 藤鞭 |
| `tpl-leap-strike` | `doc` | 10 | — | 0 | 14 | 5 | 07-03 列、在、前 |
| `tpl-life-manipulate` | `doc` | 4 | — | 0 | 0 | 3 | 99-002 把你給MikuMiku掉（初音未來，`A11F`） |
| `tpl-line-blast` | `both` | 15 | — | 2 | 0 | 8 | 04-03 龍破斬 |
| `tpl-line-strike` | `doc` | 6 | — | 0 | 4 | 9 | 90-04 陽光烈焰（content/abilities/godie-h02r.r.json） |
| `tpl-line-sweep` | `doc` | 6 | — | 0 | 20 | 7 | 20-03 約束與勝利之劍 |
| `tpl-lock-combo` | `doc` | 10 | — | 0 | 11 | 6 | 84-04 給我蜂蜜 |
| `tpl-locust-line` | `both` | 11 | — | 2 | 0 | 8 | 09-04 龜派氣功 沿線火柱（h006 FlameStrike1，census static-line） |
| `tpl-locust-orb` | `both` | 12 | — | 31 | 0 | 8 | 11-04 三千世界（o018 HeroMusashiMiyamoto，census static-single） |
| `tpl-locust-strike` | `both` | 11 | — | 13 | 0 | 8 | 65-002 永恆的愚蠢鄉 / 77-04 打雷（o00E MonsoonBoltTarget，census static-single） |
| `tpl-locust-swarm` | `both` | 12 | — | 2 | 0 | 8 | 38-002 究極暴走黑龍波 三向黑洞（o011 RockChunks0 同族，census travel-line） |
| `tpl-locust-travel` | `both` | 11 | — | 6 | 0 | 8 | 38-03 邪王炎殺黑龍波 黑洞層（h02E BlackHole，census travel-single） |
| `tpl-mark-stacks` | `doc` | 20 | — | 0 | 0 | 8 | 52-00 十二道試煉（海克力斯 Berserker 天生技） |
| `tpl-on-attack` | `doc` | 6 | — | 0 | 0 | 9 | 獸矛 Beast Spear — 蒼月潮 07-002 獸矛持有者 |
| `tpl-on-hit-react` | `doc` | 5 | ⛔ reflectRadius | 0 | 0 | 7 | 20-04 Avalon |
| `tpl-orbit-array` | `doc` | 7 | ⛔ aim | 0 | 2 | 6 | 57-04 竹蜻蜓 |
| `tpl-periodic-field` | `both` | 9 | — | 0 | 7 | 5 | 90-01 飛葉快刀（每秒對附近的敵人造成傷害，持續2秒） |
| `tpl-projectile-strike` | `doc` | 7 | — | 0 | 18 | 9 | 42-03 暗夜吹雪（content/abilities/godie-n01g.e.json） |
| `tpl-proxy-cast` | `both` | 8 | ⛔ proxyCount | 0 | 14 | 6 | 71-01 死亡隕落 |
| `tpl-proxy-fanout` | `doc` | 5 | — | 0 | 1 | 8 | 45-02 千鳥流 |
| `tpl-pull-throw` | `doc` | 12 | — | 0 | 5 | 3 | 52-02 蹂躪編年史（`A0U1`，`content/abilities/godie-hapm.w.json`） |
| `tpl-radial-burst` | `both` | 12 | — | 2 | 0 | 8 | 42-04 世界終結 |
| `tpl-random-barrage` | `both` | 9 | — | 0 | 9 | 6 | 74-03 闇之天使 |
| `tpl-single-strike` | `doc` | 6 | — | 0 | 75 | 9 | 23-04 雷焰聖劍 |
| `tpl-spend-resource` | `doc` | 6 | — | 0 | 0 | 10 | GH#1132：武藤遊戲〔黑・魔・導〕—— 逐字「**消耗布局**，由存活的黑魔導射出強化直線魔法」 |
| `tpl-summon-agent` | `both` | 12 | ⛔ championId | 0 | 6 | 4 | 28-02 分身（普屋） |
| `tpl-teleport` | `doc` | 6 | — | 0 | 1 | 7 | 17-03 空破圓斬 |
| `tpl-transform` | `doc` | 6 | — | 0 | 12 | 9 | 58-04 神騎寶貝（content/abilities/godie-ofar.r.json）—— 出貨最單純的一支：只換身體、6 秒、沒有伴隨增益 |
| `tpl-traveling-wave` | `doc` | 9 | — | 0 | 7 | 7 | 04-03 龍破斬 |

⛔⛔ **⛔ inert 那一欄的每一格填了也不會發生** —— 模板自己宣告的（理由在 JSON 的 `params[*].inert`）。今天 **22 格**落在可挑的 type 上。

## ⭐⭐ 分析做完了，而引擎沒有展開路徑（**收斂 backlog**）

⚠️ ⛔ **今天不要挑這些** —— 展開會失敗，而系統是 **fail-soft**：
那一支技能**還在、但一個模板效果都沒有** ⇒ ⛔ 與「這招就是沒效果」長得一模一樣。
⭐ 修法是替它們補 `packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 條目。

| id | 已寫好的參數 | exemplar |
|---|---:|---|
| `tpl-dragon-shockwave` | **9** | 38-03 邪王炎殺黑龍波 |

## ⛔ 空殼（佔著名字、0 參數）

`tpl-barrier-domain` · `tpl-channel-beam` · `tpl-death-mechanic` · `tpl-global-rule` · `tpl-pure-cosmetic` · `tpl-range-gamble` · `tpl-resource-ops` · `tpl-strip-transform` · `tpl-team-synergy`

## ⚠️ 哨兵（**刻意**永遠不 enable，⛔ 不要試圖填）

- `tpl-data-no-trigger` —— ⚠️ 這一格不是一台做得出來的機器，是普查的分流終點：永遠不會有參數，也永遠不會 enabled。25 張行為卡落在這裡，逐張讀過 war3map.j 之後分成四種，四種的去處都不在鑄技工坊。① 觸發清單真的是空的（11 支；HERO_TR

## ⭐ 微調層：矩陣

元素（13）：`arcane` `blood` `earth` `fire` `holy` `ice` `ki` `lightning` `nature` `physical` `sound` `void` `wind`

形狀（25）：`arc` `beam` `beam-flat` `beam-lg` `bolt` `bolt-lg` `dash` `explosion` `explosion-lg` `nova` `nova-lg` `pulse` `pulse-lg` `pulse-sm` `shockwave` `shockwave-lg` `slash` `slash-lg` `spray-back` `summon` `summon-lg` `swarm` `swarm-lg` `tornado` `tornado-lg`

⚠️ **154 / 325 個組合今天存在** —— ⛔ 不是每一格都有。挑之前先確認 `content/vfx/fx.prim.<元素>.<形狀>.json` 真的在。

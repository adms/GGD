# GGD type 目錄（給編輯器挑的積木）

> ⛔ **這份是產生的** —— `pnpm typecat:build`。改它請改 `content/ability-templates/`。
> ⭐ 交付格式與止損協定見 `CODEX_TYPE_HANDOFF.md`；機器可讀版在 `ggd-type-catalog.json`。

**29 個可挑 type** · ⭐ 3 個「分析做完但引擎沒接線」 · ⛔ 13 個空殼 · 1 個哨兵 · 矩陣 154/325 格

## ⭐⭐ 怎麼 fail-closed

- ⭐ 只挑 `expands: true` 的。⛔ `declaredStatus` 是宣告，`expands` 是量出來的事實。
- ⭐ 看 `wiring`：`node` 要寫成 `{"kind":"spawnModelFx","preset":"<id>"}`；`doc` 要寫成 `{"template":{"ref":"<id>","params":{…}}}`；`both` 兩條都行。
- ⭐ 逐格看 `params[*].fillsVia` —— 寫錯邊的那一格**不會有任何東西紅**，它只是不會發生。
- ⛔ `analysedButUnwired` 裡的**不要挑** —— 展開會失敗，而系統是 fail-soft ⇒ 那一支技能**還在、但一個模板效果都沒有**，⛔ 畫面上與「這招就是沒效果」一模一樣。
- ⚠️ ⭐ 挑一個 `modelKey` 之前查 `modelFxEmitters.modelsWithEmitters`：那顆模型若自帶粒子，`modelFxEmitters.lostByEmitters` 的每一格**寫了也只作用在網格那一半** ⇒ ⛔ 同一顆模型會顯示兩種顏色／兩種大小，而沒有任何東西紅。

## ⭐ 可挑的 type（`expand()` 真的跑得過）

| id | 佈線 | 參數 | preset 用量 | ref 用量 | gap | exemplar |
|---|---|---:|---:|---:|---:|---|
| `tpl-beam-roll` | `both` | 21 | 13 | 0 | 8 | 20-03 約束與勝利之劍 |
| `tpl-blink-strike` | `doc` | 6 | 0 | 0 | 5 | godie-n01c.w（出貨最接近預設的那一支） |
| `tpl-buff-self` | `doc` | 3 | 0 | 28 | 6 | 82-04 闇之魔法 |
| `tpl-charge-push` | `doc` | 11 | 0 | 0 | 5 | 38-01 邪王炎殺劍 |
| `tpl-combo-finisher` | `doc` | 13 | 0 | 0 | 8 | 01-04 超究武神霸斬 |
| `tpl-ground-nova` | `doc` | 4 | 0 | 0 | 8 | 80-03 鬼神烈戟 |
| `tpl-instant-blast` | `doc` | 4 | 0 | 12 | 8 | 90-03 藤鞭 |
| `tpl-leap-strike` | `doc` | 8 | 0 | 0 | 5 | 07-03 列、在、前 |
| `tpl-line-blast` | `both` | 15 | 2 | 0 | 8 | 04-03 龍破斬 |
| `tpl-line-sweep` | `doc` | 6 | 0 | 1 | 7 | 20-03 約束與勝利之劍 |
| `tpl-lock-combo` | `doc` | 10 | 0 | 0 | 6 | 84-04 給我蜂蜜 |
| `tpl-locust-line` | `node` | 11 | 2 | 0 | 8 | 09-04 龜派氣功 沿線火柱（h006 FlameStrike1，census static-line） |
| `tpl-locust-orb` | `node` | 12 | 29 | 0 | 8 | 11-04 三千世界（o018 HeroMusashiMiyamoto，census static-single） |
| `tpl-locust-strike` | `node` | 11 | 12 | 0 | 8 | 65-002 永恆的愚蠢鄉 / 77-04 打雷（o00E MonsoonBoltTarget，census static-single） |
| `tpl-locust-swarm` | `node` | 12 | 2 | 0 | 8 | 38-002 究極暴走黑龍波 三向黑洞（o011 RockChunks0 同族，census travel-line） |
| `tpl-locust-travel` | `node` | 11 | 5 | 0 | 8 | 38-03 邪王炎殺黑龍波 黑洞層（h02E BlackHole，census travel-single） |
| `tpl-mark-stacks` | `doc` | 20 | 0 | 0 | 8 | 52-00 十二道試煉（海克力斯 Berserker 天生技） |
| `tpl-on-attack` | `doc` | 6 | 0 | 0 | 9 | 獸矛 Beast Spear — 蒼月潮 07-002 獸矛持有者 |
| `tpl-on-hit-react` | `doc` | 5 | 0 | 0 | 7 | 20-04 Avalon |
| `tpl-orbit-array` | `doc` | 7 | 0 | 1 | 6 | 57-04 竹蜻蜓 |
| `tpl-periodic-field` | `both` | 9 | 0 | 5 | 5 | 90-01 飛葉快刀（每秒對附近的敵人造成傷害，持續2秒） |
| `tpl-proxy-cast` | `both` | 8 | 0 | 8 | 6 | 71-01 死亡隕落 |
| `tpl-proxy-fanout` | `doc` | 6 | 0 | 0 | 8 | 45-02 千鳥流 |
| `tpl-radial-burst` | `both` | 12 | 2 | 0 | 8 | 42-04 世界終結 |
| `tpl-random-barrage` | `both` | 9 | 0 | 0 | 6 | 74-03 闇之天使 |
| `tpl-single-strike` | `doc` | 3 | 0 | 22 | 9 | 23-04 雷焰聖劍 |
| `tpl-summon-agent` | `both` | 12 | 0 | 3 | 4 | 28-02 分身（普屋） |
| `tpl-teleport` | `doc` | 6 | 0 | 0 | 7 | 17-03 空破圓斬 |
| `tpl-traveling-wave` | `doc` | 9 | 0 | 1 | 7 | 04-03 龍破斬 |

## ⭐⭐ 分析做完了，而引擎沒有展開路徑（**收斂 backlog**）

⚠️ ⛔ **今天不要挑這些** —— 展開會失敗，而系統是 **fail-soft**：
那一支技能**還在、但一個模板效果都沒有** ⇒ ⛔ 與「這招就是沒效果」長得一模一樣。
⭐ 修法是替它們補 `packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 條目。

| id | 已寫好的參數 | exemplar |
|---|---:|---|
| `tpl-dragon-quake` | **12** | 38-03 邪王炎殺黑龍波 |
| `tpl-dragon-serpent` | **12** | 38-002 究極暴走黑龍波 |
| `tpl-dragon-shockwave` | **9** | 38-03 邪王炎殺黑龍波 |

## ⛔ 空殼（佔著名字、0 參數）

`tpl-barrier-domain` · `tpl-channel-beam` · `tpl-death-mechanic` · `tpl-drain-leech` · `tpl-global-rule` · `tpl-growth-charge` · `tpl-life-manipulate` · `tpl-pull-throw` · `tpl-pure-cosmetic` · `tpl-range-gamble` · `tpl-resource-ops` · `tpl-strip-transform` · `tpl-team-synergy`

## ⚠️ 哨兵（**刻意**永遠不 enable，⛔ 不要試圖填）

- `tpl-data-no-trigger` —— ⚠️ 這一格不是一台做得出來的機器，是普查的分流終點：永遠不會有參數，也永遠不會 enabled。25 張行為卡落在這裡，逐張讀過 war3map.j 之後分成四種，四種的去處都不在鑄技工坊。① 觸發清單真的是空的（11 支；HERO_TR

## ⭐ 微調層：矩陣

元素（13）：`arcane` `blood` `earth` `fire` `holy` `ice` `ki` `lightning` `nature` `physical` `sound` `void` `wind`

形狀（25）：`arc` `beam` `beam-flat` `beam-lg` `bolt` `bolt-lg` `dash` `explosion` `explosion-lg` `nova` `nova-lg` `pulse` `pulse-lg` `pulse-sm` `shockwave` `shockwave-lg` `slash` `slash-lg` `spray-back` `summon` `summon-lg` `swarm` `swarm-lg` `tornado` `tornado-lg`

⚠️ **154 / 325 個組合今天存在** —— ⛔ 不是每一格都有。挑之前先確認 `content/vfx/fx.prim.<元素>.<形狀>.json` 真的在。

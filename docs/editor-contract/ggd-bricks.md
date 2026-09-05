# 積木清冊 —— `ggd-bricks@1`

> ⛔ **這是產物。** 改 `tools/brick-census/bricks.ts` 再 `pnpm bricks:build`。

owner 2026-09-05：「[後台編輯器及codex編輯器] 是**堆積木**的角色 **要充分了解有哪些積木**, 而 main 遊戲主程式 是**做出積木**供使用的角色」

capability 指紋：`f7bc050d`

## 一眼看完

| | |
|---|---:|
| total | 153 |
| effect | 47 |
| hook | 33 |
| leaf | 6 |
| template | 35 |
| vfx-prim | 13 |
| vfx-subtype | 4 |
| model-preset | 15 |
| gated | 119 |
| gaps | 119 |
| missingAdminForm | 119 |
| missingEditorForm | 4 |
| zeroAdoption | 62 |

## 兩個編輯器的表單怎麼量的

- **adminForm**：apps/admin/src/configForms.ts::CONFIG_DOC_SPECS（71 份）→ 後台自己的 readSchema()（1140 個可編輯葉節點）＋ 🎨 特效鑄造所專頁的 PRIMITIVE_KINDS/ELEMENT_IDS/GROUND_DECAL_IDS。① enum 型積木：存在一格 enum 葉節點，其選項涵蓋整層的完整 enum。② 註冊表型積木：存在一份 spec 開得了該積木所住的 collection（今天只有 [config]）。⛔ 刻意不用「名字對上就算」—— `damage-colors:blockFlashMode` 的選項是 [steel|damage|none]，那會把 effect kind `damage` 誤判成有表單。
- **editorForm**：⚠️ **代理值** —— `docs/editor-contract/ggd-editor-coverage.json` 的 `required`（＝「編輯器**應該**要有的欄位」），⛔ 不是「apps/editor 真的有表單」。`apps/editor` 是 Codex 的目錄，這支產生器量不到它。⭐ 收據一旦出現在 `coordination/claim.editor-form-receipts.json`，這一欄會自動換成量值。
- **要 Codex 給的收據**：⭐ 請 Codex 提供一支 `--check` 或一份 JSON 收據：對 `ggd-bricks.json` 的每一顆 `id`（`layer` ∈ effect / hook / leaf / template / vfx-prim / vfx-subtype / model-preset）回答「apps/editor 今天**真的渲染得出**這顆積木的表單嗎」，並附上那個表單的元件路徑當出處。⛔ 收據來之前這一欄一律是代理值。

## `effect`（47）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `applyBuff` | 30 | 0 | 0 | ⛔ | ✅ | 97 |
| `applyStatus` | 23 | 0 | 0 | ⛔ | ✅ | 99 |
| `blink` | 12 | 1 | 0 | ⛔ | ✅ | 16 |
| `carry` | 11 | 1 | 0 | ⛔ | ✅ | 0 |
| `chainLightning` | 18 | 1 | 0 | ⛔ | ✅ | 2 |
| `championForm` | 3 | 0 | 0 | ⛔ | ✅ | 23 |
| `comboStrikes` | 18 | 0 | 0 | ⛔ | ✅ | 1 |
| `convertTeam` | 9 | 1 | 0 | ⛔ | ✅ | 0 |
| `cycleBuff` | 4 | 0 | 0 | ⛔ | ✅ | 1 |
| `damage` | 12 | 0 | 0 | ⛔ | ✅ | 143 |
| `damageArea` | 15 | 1 | 0 | ⛔ | ✅ | 45 |
| `damageLine` | 16 | 0 | 0 | ⛔ | ✅ | 19 |
| `dash` | 8 | 1 | 0 | ⛔ | ✅ | 8 |
| `delayed` | 18 | 1 | 0 | ⛔ | ✅ | 20 |
| `devour` | 12 | 1 | 0 | ⛔ | ✅ | 3 |
| `dispel` | 10 | 1 | 0 | ⛔ | ✅ | 7 |
| `dot` | 13 | 0 | 0 | ⛔ | ✅ | 14 |
| `evasion` | 6 | 0 | 0 | ⛔ | ✅ | 0 |
| `eventValueConversion` | 12 | 1 | 0 | ⛔ | ✅ | 1 |
| `extendBuff` | 13 | 1 | 0 | ⛔ | ✅ | 1 |
| `floatingText` | 16 | 0 | 0 | ⛔ | ✅ | 9 |
| `grantAttribute` | 10 | 0 | 0 | ⛔ | ✅ | 4 |
| `grantGold` | 6 | 0 | 0 | ⛔ | ✅ | 2 |
| `grantXp` | 3 | 0 | 0 | ⛔ | ✅ | 1 |
| `heal` | 3 | 0 | 0 | ⛔ | ✅ | 10 |
| `invulnerable` | 6 | 0 | 0 | ⛔ | ✅ | 12 |
| `knockback` | 13 | 1 | 0 | ⛔ | ✅ | 11 |
| `leap` | 9 | 0 | 0 | ⛔ | ✅ | 8 |
| `manaBarrier` | 11 | 1 | 0 | ⛔ | ✅ | 1 |
| `modifyCooldown` | 15 | 1 | 0 | ⛔ | ✅ | 2 |
| `proxyCast` | 16 | 1 | 0 | ⛔ | ✅ | 1 |
| `pull` | 12 | 0 | 0 | ⛔ | ✅ | 0 |
| `randomArea` | 8 | 0 | 0 | ⛔ | ✅ | 5 |
| `restore` | 4 | 0 | 0 | ⛔ | ✅ | 14 |
| `revive` | 5 | 0 | 0 | ⛔ | ✅ | 0 |
| `screenFlash` | 10 | 0 | 0 | ⛔ | ✅ | 6 |
| `screenShake` | 8 | 0 | 0 | ⛔ | ✅ | 17 |
| `shield` | 6 | 0 | 0 | ⛔ | ✅ | 6 |
| `shieldBreak` | 8 | 1 | 0 | ⛔ | ✅ | 0 |
| `spawnModelFx` | 32 | 0 | 0 | ⛔ | ✅ | 55 |
| `spawnProjectile` | 3 | 0 | 0 | ⛔ | ✅ | 19 |
| `spawnVfx` | 6 | 0 | 0 | ⛔ | ✅ | 57 |
| `spendMana` | 6 | 0 | 0 | ⛔ | ✅ | 4 |
| `summon` | 23 | 0 | 0 | ⛔ | ✅ | 2 |
| `swapResource` | 9 | 1 | 0 | ⛔ | ✅ | 1 |
| `taunt` | 8 | 1 | 0 | ⛔ | ✅ | 2 |
| `weightedBranch` | 7 | 1 | 0 | ⛔ | ✅ | 4 |

## `hook`（33）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `onAbilityCast` | 21 | 0 | 0 | ⛔ | ✅ | 5 |
| `onAbilityHit` | 21 | 0 | 0 | ⛔ | ✅ | 4 |
| `onAllyDamaged` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onAllyDeath` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onBasicAttack` | 21 | 0 | 0 | ⛔ | ✅ | 29 |
| `onBossSpawn` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onBoundaryTouch` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onCrowdControlApplied` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onCrowdControlReceived` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onDamageDealt` | 21 | 0 | 0 | ⛔ | ✅ | 2 |
| `onDamageTaken` | 21 | 0 | 0 | ⛔ | ✅ | 17 |
| `onDashOrBlink` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onDeath` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onEvade` | 21 | 0 | 0 | ⛔ | ✅ | 2 |
| `onFireRingIgnite` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onGuardianDown` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onHeal` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onInterval` | 21 | 0 | 0 | ⛔ | ✅ | 6 |
| `onKill` | 21 | 0 | 0 | ⛔ | ✅ | 7 |
| `onLethalDamage` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onOverheal` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onProjectileExpire` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onReflectSuccess` | 21 | 0 | 0 | ⛔ | ✅ | 8 |
| `onRevive` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onRoundEnd` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onRoundStart` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onShieldBroken` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onShieldGained` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onStatCapReached` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onStatusApplied` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onStunned` | 21 | 0 | 0 | ⛔ | ✅ | 2 |
| `onUltimateCast` | 21 | 0 | 0 | ⛔ | ✅ | 0 |
| `onUltimateHit` | 21 | 0 | 0 | ⛔ | ✅ | 0 |

## `leaf`（6）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `chance` | 1 | 0 | 0 | ⛔ | ✅ | 0 |
| `equipment` | 0 | 0 | 0 | ⛔ | ✅ | 0 |
| `kind` | 2 | 0 | 0 | ⛔ | ✅ | 2 |
| `recentCast` | 0 | 0 | 0 | ⛔ | ✅ | 0 |
| `stat` | 0 | 0 | 0 | ⛔ | ✅ | 8 |
| `status` | 0 | 0 | 0 | ⛔ | ✅ | 28 |

## `model-preset`（15）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `tpl-beam-roll` | 14 | 0 | 2 | ⛔ | ⛔ | 13 |
| `tpl-dragon-quake` | 7 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-dragon-serpent` | 9 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-dragon-shockwave` | 4 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-line-blast` | 6 | 0 | 0 | ⛔ | ⛔ | 2 |
| `tpl-locust-line` | 9 | 0 | 0 | ⛔ | ⛔ | 2 |
| `tpl-locust-orb` | 10 | 0 | 0 | ⛔ | ⛔ | 29 |
| `tpl-locust-strike` | 9 | 0 | 0 | ⛔ | ⛔ | 12 |
| `tpl-locust-swarm` | 10 | 0 | 0 | ⛔ | ⛔ | 2 |
| `tpl-locust-travel` | 9 | 0 | 0 | ⛔ | ⛔ | 5 |
| `tpl-periodic-field` | 1 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-proxy-cast` | 1 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-radial-burst` | 7 | 0 | 0 | ⛔ | ⛔ | 2 |
| `tpl-random-barrage` | 1 | 0 | 0 | ⛔ | ⛔ | 0 |
| `tpl-summon-agent` | 1 | 0 | 0 | ⛔ | ⛔ | 0 |

## `template`（35）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `beam-roll` | 21 | 1 | 2 | ⛔ | ✅ | 9 |
| `blink-strike` | 6 | 0 | 0 | ⛔ | ✅ | 0 |
| `buff-self` | 3 | 0 | 0 | ⛔ | ✅ | 28 |
| `charge-push` | 11 | 0 | 0 | ⛔ | ✅ | 0 |
| `combo-finisher` | 13 | 0 | 0 | ⛔ | ✅ | 0 |
| `dragon-quake` | 15 | 0 | 8 | ⛔ | ✅ | 0 |
| `dragon-serpent` | 16 | 0 | 5 | ⛔ | ✅ | 0 |
| `drain-leech` | 8 | 1 | 0 | ⛔ | ✅ | 0 |
| `ground-nova` | 4 | 0 | 0 | ⛔ | ✅ | 0 |
| `growth-charge` | 9 | 0 | 0 | ⛔ | ✅ | 0 |
| `instant-blast` | 4 | 0 | 0 | ⛔ | ✅ | 12 |
| `leap-strike` | 8 | 0 | 0 | ⛔ | ✅ | 0 |
| `life-manipulate` | 4 | 0 | 0 | ⛔ | ✅ | 0 |
| `line-blast` | 15 | 3 | 0 | ⛔ | ✅ | 2 |
| `line-sweep` | 6 | 0 | 0 | ⛔ | ✅ | 1 |
| `lock-combo` | 10 | 0 | 0 | ⛔ | ✅ | 0 |
| `locust-line` | 11 | 0 | 0 | ⛔ | ✅ | 2 |
| `locust-orb` | 12 | 0 | 0 | ⛔ | ✅ | 25 |
| `locust-strike` | 11 | 0 | 0 | ⛔ | ✅ | 12 |
| `locust-swarm` | 12 | 0 | 0 | ⛔ | ✅ | 2 |
| `locust-travel` | 11 | 0 | 0 | ⛔ | ✅ | 5 |
| `mark-stacks` | 20 | 0 | 0 | ⛔ | ✅ | 0 |
| `on-attack` | 6 | 0 | 0 | ⛔ | ✅ | 0 |
| `on-hit-react` | 5 | 0 | 1 | ⛔ | ✅ | 0 |
| `orbit-array` | 7 | 0 | 1 | ⛔ | ✅ | 1 |
| `periodic-field` | 9 | 2 | 0 | ⛔ | ✅ | 5 |
| `proxy-cast` | 8 | 0 | 1 | ⛔ | ✅ | 8 |
| `proxy-fanout` | 6 | 0 | 0 | ⛔ | ✅ | 0 |
| `pull-throw` | 11 | 1 | 0 | ⛔ | ✅ | 0 |
| `radial-burst` | 12 | 1 | 0 | ⛔ | ✅ | 2 |
| `random-barrage` | 9 | 0 | 0 | ⛔ | ✅ | 0 |
| `single-strike` | 3 | 0 | 0 | ⛔ | ✅ | 22 |
| `summon-agent` | 12 | 0 | 1 | ⛔ | ✅ | 3 |
| `teleport` | 6 | 0 | 0 | ⛔ | ✅ | 0 |
| `traveling-wave` | 9 | 0 | 0 | ⛔ | ✅ | 1 |

## `vfx-prim`（13）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `beam` | 0 | 0 | 0 | ✅ | ⛔ | 58 |
| `bolt` | 0 | 0 | 0 | ✅ | ⛔ | 3 |
| `column` | 0 | 0 | 0 | ✅ | ⛔ | 5 |
| `dash` | 0 | 0 | 0 | ✅ | ⛔ | 4 |
| `explosion` | 0 | 0 | 0 | ✅ | ⛔ | 56 |
| `fall` | 0 | 0 | 0 | ✅ | ⛔ | 2 |
| `nova` | 0 | 0 | 0 | ✅ | ⛔ | 43 |
| `pulse` | 0 | 0 | 0 | ✅ | ⛔ | 85 |
| `shockwave` | 0 | 0 | 0 | ✅ | ⛔ | 27 |
| `slash` | 0 | 0 | 0 | ✅ | ⛔ | 35 |
| `summon` | 0 | 0 | 0 | ✅ | ⛔ | 0 |
| `swarm` | 0 | 0 | 0 | ✅ | ⛔ | 21 |
| `tornado` | 0 | 0 | 0 | ✅ | ⛔ | 7 |

## `vfx-subtype`（4）

| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |
|---|---:|---:|---:|---|---|---:|
| `billboard` | 0 | 0 | 0 | ⛔ | ⛔ | 0 |
| `decal` | 0 | 0 | 0 | ⛔ | ⛔ | 0 |
| `ribbon` | 0 | 0 | 0 | ⛔ | ⛔ | 0 |
| `trail` | 0 | 0 | 0 | ⛔ | ⛔ | 0 |

## 缺表單的積木（閘讀這一節）

| 積木 | 層 | 缺什麼 |
|---|---|---|
| `applyBuff` | effect | adminForm |
| `applyStatus` | effect | adminForm |
| `blink` | effect | adminForm |
| `carry` | effect | adminForm |
| `chainLightning` | effect | adminForm |
| `championForm` | effect | adminForm |
| `comboStrikes` | effect | adminForm |
| `convertTeam` | effect | adminForm |
| `cycleBuff` | effect | adminForm |
| `damage` | effect | adminForm |
| `damageArea` | effect | adminForm |
| `damageLine` | effect | adminForm |
| `dash` | effect | adminForm |
| `delayed` | effect | adminForm |
| `devour` | effect | adminForm |
| `dispel` | effect | adminForm |
| `dot` | effect | adminForm |
| `evasion` | effect | adminForm |
| `eventValueConversion` | effect | adminForm |
| `extendBuff` | effect | adminForm |
| `floatingText` | effect | adminForm |
| `grantAttribute` | effect | adminForm |
| `grantGold` | effect | adminForm |
| `grantXp` | effect | adminForm |
| `heal` | effect | adminForm |
| `invulnerable` | effect | adminForm |
| `knockback` | effect | adminForm |
| `leap` | effect | adminForm |
| `manaBarrier` | effect | adminForm |
| `modifyCooldown` | effect | adminForm |
| `proxyCast` | effect | adminForm |
| `pull` | effect | adminForm |
| `randomArea` | effect | adminForm |
| `restore` | effect | adminForm |
| `revive` | effect | adminForm |
| `screenFlash` | effect | adminForm |
| `screenShake` | effect | adminForm |
| `shield` | effect | adminForm |
| `shieldBreak` | effect | adminForm |
| `spawnModelFx` | effect | adminForm |
| `spawnProjectile` | effect | adminForm |
| `spawnVfx` | effect | adminForm |
| `spendMana` | effect | adminForm |
| `summon` | effect | adminForm |
| `swapResource` | effect | adminForm |
| `taunt` | effect | adminForm |
| `weightedBranch` | effect | adminForm |
| `onAbilityCast` | hook | adminForm |
| `onAbilityHit` | hook | adminForm |
| `onAllyDamaged` | hook | adminForm |
| `onAllyDeath` | hook | adminForm |
| `onBasicAttack` | hook | adminForm |
| `onBossSpawn` | hook | adminForm |
| `onBoundaryTouch` | hook | adminForm |
| `onCrowdControlApplied` | hook | adminForm |
| `onCrowdControlReceived` | hook | adminForm |
| `onDamageDealt` | hook | adminForm |
| `onDamageTaken` | hook | adminForm |
| `onDashOrBlink` | hook | adminForm |
| `onDeath` | hook | adminForm |
| `onEvade` | hook | adminForm |
| `onFireRingIgnite` | hook | adminForm |
| `onGuardianDown` | hook | adminForm |
| `onHeal` | hook | adminForm |
| `onInterval` | hook | adminForm |
| `onKill` | hook | adminForm |
| `onLethalDamage` | hook | adminForm |
| `onOverheal` | hook | adminForm |
| `onProjectileExpire` | hook | adminForm |
| `onReflectSuccess` | hook | adminForm |
| `onRevive` | hook | adminForm |
| `onRoundEnd` | hook | adminForm |
| `onRoundStart` | hook | adminForm |
| `onShieldBroken` | hook | adminForm |
| `onShieldGained` | hook | adminForm |
| `onStatCapReached` | hook | adminForm |
| `onStatusApplied` | hook | adminForm |
| `onStunned` | hook | adminForm |
| `onUltimateCast` | hook | adminForm |
| `onUltimateHit` | hook | adminForm |
| `beam-roll` | template | adminForm |
| `blink-strike` | template | adminForm |
| `buff-self` | template | adminForm |
| `charge-push` | template | adminForm |
| `combo-finisher` | template | adminForm |
| `dragon-quake` | template | adminForm |
| `dragon-serpent` | template | adminForm |
| `drain-leech` | template | adminForm |
| `ground-nova` | template | adminForm |
| `growth-charge` | template | adminForm |
| `instant-blast` | template | adminForm |
| `leap-strike` | template | adminForm |
| `life-manipulate` | template | adminForm |
| `line-blast` | template | adminForm |
| `line-sweep` | template | adminForm |
| `lock-combo` | template | adminForm |
| `locust-line` | template | adminForm |
| `locust-orb` | template | adminForm |
| `locust-strike` | template | adminForm |
| `locust-swarm` | template | adminForm |
| `locust-travel` | template | adminForm |
| `mark-stacks` | template | adminForm |
| `on-attack` | template | adminForm |
| `on-hit-react` | template | adminForm |
| `orbit-array` | template | adminForm |
| `periodic-field` | template | adminForm |
| `proxy-cast` | template | adminForm |
| `proxy-fanout` | template | adminForm |
| `pull-throw` | template | adminForm |
| `radial-burst` | template | adminForm |
| `random-barrage` | template | adminForm |
| `single-strike` | template | adminForm |
| `summon-agent` | template | adminForm |
| `teleport` | template | adminForm |
| `traveling-wave` | template | adminForm |
| `billboard` | vfx-subtype | adminForm + editorForm |
| `decal` | vfx-subtype | adminForm + editorForm |
| `ribbon` | vfx-subtype | adminForm + editorForm |
| `trail` | vfx-subtype | adminForm + editorForm |


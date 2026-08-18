# Leave/Restart flow, offline cheat console & death spectator camera — TODO

Three linked client/game features for iterating on a match:

**Leave / Restart flow.** A pause menu (Esc or the ☰ button) offers Resume / Restart match
(清空戰場重新開始) / Leave to menu. Leaving and Restart both route through one clean teardown:
`GameApp.dispose()` is idempotent — it cancels the rAF loop, unsubscribes settings, drops the
HUD/touch action sinks, leaves **every** Colyseus room (`MultiSession.dispose`), disposes the
Babylon engine/scene/vfx/views, clears interpolation + prediction, and resets the shared
frameBus. Leave flips the platform store's `screen` (main.tsx disposes the GameApp). **Restart
(offline)** bumps `matchEpoch` so main.tsx tears the GameApp down and rebuilds it — the dev
connect uses `client.create` so a **fresh SimWorld** spins up (battlefield cleared, round 1),
never rejoining a not-yet-disposed room. **Restart (online)** returns to the lobby with a note
(a live room reset needs host authority). The top-right Leave button uses the same path.

**Offline cheat console** (`ui/CheatConsole.tsx`, toggled by `` ` `` or the 🐞 button, shown
only when `match.mode === "offline"`). Every control sends a new **MSG.CHEAT** for the LOCAL
seat → `MatchController.applyCheat(seatId, cheat)`. **HARD GATE:** cheats apply only when the
server is in dev mode (no `PLATFORM_GAME_SHARED_SECRET`) **and** `GGD_DEV_CHEATS !== "0"`
(`cheatGate.ts`) — the client's "offline" claim is never trusted, and the seat is resolved from
the sender's own session (no foreign-seat cheating). Cheats: set level (1–18), grant gold,
grant M coin (no-op — no in-sim wallet), max abilities / rank a slot (R past the round gate),
give item (searchable, all items), swap champion (searchable, all champions; despawn+respawn
same seat/team/pos), full heal, **god mode** (invuln — hp/mana sustained every tick),
**0 CD 釋放** (abilities never on cooldown; mana also refilled so casts don't run dry), reset
cooldowns, kill enemies in my zone, skip phase, re-roll offers. God mode / 0-CD / invuln are
tracked controller-side (per-seat sets re-asserted after the sim step) so no shared sim file is
touched. `ct` (ability cast time) is a separate later pass — NOT implemented here.

**Death spectator camera.** While the local champion is dead the camera unlocks
(`CameraRig.setDead`) so the player free-pans the whole arena (wider zoom-out clamp), centered
once on the nearest alive ally / zone centroid, with a `☠ 觀戰中 — 下一輪復活` HUD hint. On
respawn next round it re-locks and snaps back to the hero (clamp restored). Each couch viewport
does this independently; a fresh match (Restart) resets everyone alive → cameras re-lock.

**Death spectator focus (task #85).** The spectator camera's companion: while you are dead
**in combat** that viewport's whole frame drains to a cool grey EXCEPT soft, world-anchored
colour pools on your own **living teammates** and on **your revive circle** while one is live
(#84) — the teammate *and the fight around them* stay legible, which is what 方便聚焦隊友情況
actually asks for. One full-screen pass per dead viewport (`vfx/DeathFocusFx.ts`), attached on
demand and detached the instant the linear fade-out hits exactly 0; the pools are pure UV math
so they stay welded to the world through task #43's live resolution rescaling, and each pass is
sized to its own split-screen viewport rect. All arming/reverting/ramping is the Babylon-free
`render/deathFocus.ts`. **`alive === false` is deliberately NOT the trigger** — it is also
champ-select, the whole 60 s intermission (nothing revives at intermission entry), a bye team
(`enterCombat` parks every seat dead and revives only the fighters) and the resolution /
settlement phases. The trigger is the sim's `death` **event**, which `DeathSystem` emits solely
on the hp≤0 crossing; a missed event fails safe (no greyscale) rather than sticking.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| rc-01 | GameApp/MultiSession teardown: dispose leaves every room + drops input sinks, idempotent; RoomConnection.leave clears queue/nulls room | restart-teardown | unit | done |
| rc-02 | Restart decision: offline recreates (matchEpoch bump), online returns to lobby; store stays in-match / no-op outside a match | restart-decision | unit | done |
| rc-03 | 測試面板在**離線場或練習房**掛載（GH#365 推翻 #31a 的「只有離線」）；⚠️ 真正的缺陷是 `AppRoot` 的掛載閘漏了 practice 參數 ⇒ 練習房裡元件從未掛載。修法是把呼叫點換成收整個 match 物件的 `cheatPanelMounts(match)`，⛔ 不是「記得補參數」。test_id 刻意沿用當 join key | cheat-panel-gating | unit | done |
| rc-31 | 練習面板六個分頁（成長／寶具／屬性／技能／狀態／殭屍）—— 六個 `Cheat.kind` 帶不同參數，清單全部從出貨註冊表推導；伺服器端閘（`MatchRoom` 的 `cheatsAllowed`）在正式對局裡讓 MSG.CHEAT 連 `applyCheat` 都碰不到 | cheat-dev-gate | security | done |
| rc-04 | Backtick (`) toggles the cheat console; other keys don't | cheat-toggle-key | unit | done |
| rc-05 | Cheat searchable filter over items/champions (name/id/tag, CJK substring) | cheat-filter | unit | done |
| rc-06 | Cheat → MSG.CHEAT payload shapes + routing to the primary connection only | cheat-payload | unit | done |
| rc-07 | Death spectator camera: dead unlocks follow + widens zoom clamp + centers; respawn re-locks + jumpTo + restores clamp | spectator-cam | unit | done |
| rc-08 | applyCheat setLevel raises to the target level (+ ability points) | cheat-set-level | unit | done |
| rc-09 | applyCheat grantGold adds gold; grantMCoin is a graceful no-op | cheat-grant-gold | unit | done |
| rc-10 | applyCheat rankAbility ranks R past the gate; maxAbilities maxes Q/W/E/R; resetCooldowns clears | cheat-rank-ability | unit | done |
| rc-11 | applyCheat giveItem grants a valid item; rejects unknown ids | cheat-give-item | unit | done |
| rc-12 | applyCheat swapChampion preserves seat/team/pos, swaps id, spawns full-hp; rejects unknown champ | cheat-swap-champion | unit | done |
| rc-13 | applyCheat fullHeal + godMode sustain (revive + top-off every tick) | cheat-god-mode | unit | done |
| rc-14 | applyCheat zeroCooldown makes abilities spammable — no cooldown block | cheat-zero-cd | unit | done |
| rc-15 | applyCheat killEnemies kills all enemy champions in my zone | cheat-kill-enemies | unit | done |
| rc-16 | applyCheat skipPhase forces the phase forward; rerollOffers replaces open offers | cheat-skip-phase | unit | done |
| rc-17 | Cheat hard gate: rejected in prod (shared secret) / when GGD_DEV_CHEATS=0 | cheat-dev-gate | security | done |
| rc-18 | Cheat ignored for a foreign / unknown seat (no gold leak) | cheat-foreign-seat | security | done |
| rc-19 | Default in-match zoom is the FARTHEST allowed dolly — highest above the floor (GH#361 overturned #31a's "closest"); it is a config field (`config.camera@1` `zoom.defaultDolly`), zoom-IN range unchanged, and 歸位 is an absolute reset to it. ⚠️ test_id kept as the join key on purpose | camera-default-closest | unit | done |
| rc-20 | Death-focus arms ONLY on a combat `death` event for this viewport's own champion, and survives the event landing before the snapshot flips `alive` | death-focus-arm | unit | done |
| rc-21 | Death-focus reverts to EXACTLY zero on every path (revive, resolution, intermission, champSelect, matchEnd, outcomeDecided, seat lost its champion, re-seated, entity gone) | death-focus-revert | regression | done |
| rc-22 | Death-focus colour sources: living teammates + the player's OWN revive circle only; nearest-first, capped, rFade > rFull, rendered position preferred | death-focus-sources | unit | done |
| rc-23 | Death-focus projection is viewport-normalized and INDEPENDENT of the render-target size (task #43 rescales it live); drops sources behind the eye | death-focus-projection | unit | done |
| rc-24 | Death-focus pass is attached to the camera exactly while lit — off for a living/never-died viewport, off after every revert, off on dispose, follows a replaced rig | death-focus-attach | regression | done |

/**
 * The single source of truth for WHICH sim events are fanned out to clients on
 * the MSG.EVENT channel.
 *
 * WHY THIS EXISTS AS ONE LIST. Every combat VISUAL in this game — floating
 * damage/heal/mana numbers, attack and cast animations, hit sparks, projectiles,
 * ability VFX, the shop-feedback toasts — is driven by drained MSG.EVENT
 * messages, NOT by the replicated `MatchState` schema. The live `MatchRoom` and
 * the `ReplayRoom` therefore MUST forward the exact same set, or a replay would
 * render a stripped-down, combat-mute version of the match (HP bars drain with
 * no numbers, champions slide between positions without swinging). The replay is
 * the owner's only feedback channel, so "why round 3 was weird" has to be
 * visible there too. Keeping the whitelist in one place makes it impossible for
 * the two rooms to drift apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE FOR ADDING TO IT — READ THIS BEFORE YOU ADD A `world.emit`
 *
 * A whitelist FAILS SILENTLY. An event that the sim emits and the client has a
 * handler for, but that is missing here, produces no error, no warning and no
 * crash: the feature simply never happens in a real match. That is exactly how
 * `evade` / `explosion` / `buffApply` / `reviveChannel` / `fireRingStart` /
 * `rankUp` sat "complete, tested and shipping" for months while being invisible
 * in game (audit: docs/_false-completions.md, class S2).
 *
 * So the contract is: EVERY `world.emit("x", …)` in packages/shared/src/sim
 * MUST appear in EXACTLY ONE of the two sets below —
 *   • `FANNED_OUT_EVENT_TYPES` — it crosses the wire, with a stated consumer;
 *   • `SERVER_ONLY_EVENT_TYPES` — it deliberately does NOT, with a stated reason.
 * `eventFanout.test.ts` scrapes the sim for emit sites and goes red on any event
 * that is in neither (a new emit with nobody having made the call) or in both.
 * Adding a sim event is therefore a two-file change, on purpose.
 *
 * Three things to check before you move a name into the fanned-out set:
 *   1. CADENCE. This is an unfiltered broadcast to every client, every tick. A
 *      per-tick or per-tick-per-champion event is a wire flood, not a visual —
 *      see `fireRingTick` / `fireRingDamage` below for how that is handled.
 *   2. PAYLOAD. `MatchRoom`/`ReplayRoom` forward `ev.data` WHOLE and unchanged,
 *      so anything msgpack can encode survives — but the CONSUMER's field names
 *      must match what the emit site actually writes. An event that arrives with
 *      the wrong shape is worse than one that never arrives, because the handler
 *      silently no-ops and the feature still looks "done".
 *   3. DOUBLE-FIRE. Some cues are already derived client-side from schema edges
 *      (`audio/sfxEdges.ts` diffs the local tally for kill/death/levelUp/exUnlock).
 *      Fanning out the sim twin of one of those makes the sound play twice —
 *      which is why `death`/`levelUp` cross the wire for VFX but are left
 *      unmapped in `audio/combatSfx.ts`.
 */
import type { SimEvent } from "@ggd/shared/sim/SimWorld";

/**
 * The per-tick sim events the client renderer consumes. Ordered/commented by
 * concern so the reasoning behind each inclusion survives.
 */
export const FANNED_OUT_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  // core combat legibility (task #60/#92): damage drives 造成/受到傷害 numbers
  "abilityCast",
  "damage",
  "death",
  "projectileSpawn",
  "projectileHit",
  // a missile that expired without hitting anything → client fizzle, so a ranged
  // auto that whiffs still resolves visually
  "projectileEnd",
  "levelUp",
  "castBegin",
  "castEnd",
  "castInterrupt",
  "attackWindup",
  "basicAttack",
  "basicAttackHit",
  "hitImpact",
  "knockdown",
  "whiff",
  "guardBreak",
  // A DODGED BASIC ATTACK (sim/combat/evasion.ts). `whiff` (the attacker missed
  // on their own) has always crossed; `evade` (the DEFENDER's 迴避 stat ate the
  // swing) did not, so the single most-asked-about stat in the game produced no
  // feedback whatsoever — the hit just silently did nothing, indistinguishable
  // from a dropped packet or a bug. Carries `{ source, target, x, z }`, i.e. the
  // victim's world position, so the floating MISS text has somewhere to spawn.
  // Emitted ONLY from the basic-attack path and only when `evasion > 0`, so its
  // rate is bounded by attack speed, not by ticks.
  "evade",
  "flowerSpawn",
  "flowerBurst",
  // NEUTRAL DUEL-ZONE GUARDIAN (task #89/#105). Without these the guardian is a
  // ghost: it exists in the sim and deals/takes damage, but the client sees no
  // wake, no health drain feedback, no PRE-LAND punish telegraph (so nobody can
  // dodge), and no last-hit reward. `guardianMark` is the dodge cue (carries the
  // impactTick + the post-multiplier AoE radius); `guardianSlain` names who got
  // the last-hit bounty. Same one-list contract as every other combat visual, so
  // the ReplayRoom forwards the identical set.
  // ⭐ 2026-07-31 —— 這三個是 owner 那批技能規格新增的，補進來的原因寫在這裡，
  // 因為它們差一點就重演這張清單自己在檔頭列的 `evade`/`explosion`/`buffApply`：
  // 做完、測過、出貨，然後在遊戲裡不存在。
  //
  // `damageLine` —— 18-00 薔薇荊棘之刃（妖狐藏馬）每一次普攻的直線範圍。
  // ⚠️ 寫這個 effect 的人自己在 `sim/effects/damageLine.ts:106` 留了一句
  //   「② the player has to SEE the lash, not just take damage from it… so the
  //    client can draw the actual line that was tested」——
  // 而那個事件當時過不了線。沒有它，玩家看到的只有莫名其妙掉血，
  // replay 也一樣。這正是第②種故障（算出來但從沒送到客戶端）。
  // 帶的是線的兩端與寬度，客戶端據此畫那條鞭子。
  "damageLine",
  // `attrGrant` / `attrGrantEnd` —— 07-00 獸化心靈（每殺 8 個 +1 敏，120 上限）
  // 這類「屬性被永久/暫時改寫」的成對事件。要過線是因為玩家必須知道
  // **為什麼自己突然變快了** —— 沒有它，三圍在面板上跳動而沒有任何理由，
  // 而那個機制的整個樂趣就是看著它累積。成對送出，客戶端才畫得出起訖。
  "attrGrant",
  "attrGrantEnd",
  // `stunApplied` —— 08-00 龍紋記憶（被暈眩時覺醒）與 W 的暈眩都靠它。
  // 暈眩是**玩家必須立刻看懂**的狀態：不知道自己被定住，就會以為是延遲或當機。
  // 它是 transition-only（不是每 tick），所以線路成本是被控次數不是 tick 數。
  "stunApplied",
  "guardianSpawn",
  "guardianWake",
  "guardianSleep",
  "guardianMark",
  "guardianImpact",
  "guardianHeirPulse",
  "guardianSlain",
  // ROGUELITE MOB WAVES (task #215 喪標麥可). Without these the mob is a ghost:
  // it exists in the sim and deals/takes damage, but the client sees no spawn
  // (so a voxel-zombie pops into existence with no VFX/SFX) and no kill feedback
  // (the +20 gold / +xp float has no anchor, and the every-30 level-up cue has
  // no trigger). `mobSpawn` carries `{ id, zone, x, z, maxHp }`; `mobSlain`
  // names who got the last-hit reward like `guardianSlain` does. Same one-list
  // contract as every other combat visual, so the ReplayRoom forwards them too.
  "mobSpawn",
  "mobSlain",
  // 殭屍王 (task #262). Both are MANDATORY here, and the reason is the whole
  // point of this file: the king is summoned and paid out ENTIRELY in the sim,
  // so without these two names the mechanic is a server-side spreadsheet —
  // 100 zombies of work produces a monster that appears with no announcement
  // and a 3,000g prize that lands as an unexplained jump in a gold counter.
  //
  //   mobBossSpawn — `{ id, zone, x, z, maxHp, summoner, summonerSeatId, kills }`.
  //                  The 殭屍王降臨 banner + its entry cue. `summonerSeatId` is
  //                  what gates 「YOUR quest fired」 on the local seat, exactly
  //                  like `guardianSlain` / `coinPickedUp` do.
  //   mobBossSlain — the SETTLEMENT: `{ id, kind, zone, killer, killerSeatId,
  //                  totalGold, totalXp, totalLevels, lastHitMultiplier,
  //                  lastHitMode, shares[] }`, where each share is
  //                  `{ id, seatId, damage, gold, xp, levels, lastHit }`. The
  //                  whole split travels because the client has no way to
  //                  recompute it (the damage ledger is sim-only) and because
  //                  「照傷害比例發獎金,最後一刀翻倍」 is a rule players must be
  //                  able to SEE being applied.
  //
  // ⚠️ `mobBossSlain` IS NOT KING-ONLY SINCE #288. A 特殊殭屍 with a 分紅獎池
  // settles through the SAME name, distinguished by `kind` (`"boss"` vs
  // `"special"`) — see the reasoning in `sim/systems/MobSystem.payMobBounty`.
  // Its spawn still arrives as an ordinary `mobSpawn`, so a consumer that
  // pairs the two by entity id must tolerate a settlement with no matching
  // `mobBossSpawn` (that is what the `zone` field on the payload is for).
  //
  // CADENCE: one `mobBossSpawn` per king (summoned at 100 personal zombie
  // kills). `mobBossSlain` additionally fires once per 特殊殭屍 killed — still
  // orders of magnitude rarer than `mobSlain`, because a special now carries
  // 12,000+ hp rather than a zombie's 60.
  "mobBossSpawn",
  "mobBossSlain",
  // FLOATING COMBAT TEXT (task #92): 補血 / 補魔 — the half `damage` does not
  // carry. Emitted only for DISCRETE restores, so no steady-state regen spam.
  "heal",
  "manaRestore",
  // ⭐ GH#411 —— `manaSpend`，`manaRestore` 的**鏡像**，而它缺席的代價是量到的：
  // 71-00 暗夜契約的靈氣讓敵人施法時 12% 機率**現存法力歸零**，整條藍條在一個
  // tick 內清空而畫面上**沒有任何東西說出來**（`sim/effects/spendMana.ts` 的
  // VISIBILITY 段）。⚠️ 這個洞比【魔力全失】被拆成純 JSON **更早**就存在：
  // 被它取代的 `nightPactBurn` 在整個 apps/client 樹裡是**零個消費端**。
  //
  // CLIENT CONSUMER: `vfx/VfxSystem.handleEvent` 的 `manaSpend` case —— 掛在
  // **付錢的那具**身上的藍色浮動數字，與 `manaRestore` 共用同一條
  // `pushCombatText` 管線（同 kind `mana`，只是字前面是減號）。
  //
  // ⭐ 它是**通用**事件，⛔ 不是一支技能的專屬名：每一個 `spendMana` 的作者一起
  // 受惠 —— 20-01 風王結界的每擊扣 30 魔、熾天使之弓削目標現存 3%、光之杖的存款。
  //
  // PAYLOAD `{ target, source, amount, remaining, origin }`。⚠️ `target` 是
  // **付錢的那個**（`applyTo:"target"` 的燒魔由受害者付），⛔ 不是施法者;
  // `amount` 是**實扣量**不是請求量，所以它永遠等於藍條真的少掉的那一段。
  //
  // CADENCE: 由作者掛的 hook 決定，⛔ 不是 per-tick。出貨內容最密的一筆是
  // `godie-emfr.passive` 的 `onInterval` × `internalCooldown 1`（≤1/s/持有者），
  // 其餘都是 `onBasicAttack` / `onAbilityCast`。與 `taunt` 同一個量級與同一個
  // `onInterval` 但書：沒有 `internalCooldown` 的 hook 是**內容的**形狀問題，
  // 修的是那格欄位，⛔ 不是在這裡開特例。
  //
  // NO DOUBLE-FIRE: `audio/sfxEdges.ts` 只 diff kill/death/levelUp/exUnlock，
  // 沒有任何東西從快照推導「法力剛剛被扣」。
  "manaSpend",
  // ⭐ GH#406 —— `resourceSwap`（44-002 交換筆記本）。**從 SERVER_ONLY 搬過來的**：
  // v0.21.1 把它暫時列在那邊，理由是「今天真的沒有客戶端消費者」，並在那裡寫下
  // 「接上呈現的那一版要搬回這裡」。這就是那一版。
  //
  // ⛔ 它為什麼不能靠既有的事件：`swapResource` 刻意繞開 `damageQueue` 與
  // `healTarget`（護甲、護盾、【重創】、onDamageTaken 都不該因為「交換」而醒），
  // 而那兩條路正好是所有飄字／音效的來源。⇒ 兩條血條同時被改寫上百點，畫面上
  // 只有血條**突然對調**，跟一次掉包或一個 bug 長得一模一樣（失敗形態②的鏡像）。
  //
  // CLIENT CONSUMER: `vfx/VfxSystem.handleEvent` 的 `resourceSwap` case ——
  // **兩具身上各一個**浮動數字（拿到的那邊走 heal/mana kind，付出去的那邊走
  // damage kind，兩邊都帶「交換」字樣的 label），外加 `audio/combatSfx` 的
  // `buffApply` 音效。⚠️ 數字是**變化量**，所以 payload 必須同時帶交換前與交換後
  // 的值 —— 舊值下一 tick 就被快照覆蓋了，客戶端自己補不回來。
  //
  // PAYLOAD `{ caster, target, resource, fromCaster, fromTarget, toCaster,
  // toTarget }`。`resource` 是 `"health" | "mana"`，決定那兩個數字的顏色。
  //
  // CADENCE: 一次施放一則（多目標交換則一個目標一則），由施放次數 bound ——
  // 出貨的 44-002 是單體、25 秒冷卻，⛔ 不是 per-tick。
  "resourceSwap",
  // GROUND-AOE DETONATION → the 爆裂 cue + blast VFX (audio COMBAT-AUDIO). Two
  // emit sites for the ONE moment, and they are mutually exclusive per cast: an
  // instant ground ability blasts in `abilitySystem` the tick it is cast, one
  // with a cast time blasts in `CastResolveSystem` when the wind-up elapses.
  // `{ caster, abilityId, x, z }` — the point, so the effect plays where the
  // ability landed rather than on the caster.
  "explosion",
  // TAKEOFF OF A PARABOLIC LEAP (task #247, sim/movement/leap.ts). ONE event per
  // leap — bounded by casts, never per-tick — carrying
  // `{ id, caster, x, z, ticks, apex }`: the FLYER's entity id (which is not the
  // caster for a thrown victim), the landing point, the integer flight length
  // and the apex height.
  //
  // CLIENT CONSUMER: the jump cue + the landing telegraph. The height itself
  // rides the snapshot (`EntityState.h` + ENTITY_FLAG.AIRBORNE), so the arc
  // renders with or without this; the event exists so the takeoff SFX
  // (蒼月潮's A0G3 plays gg_snd_moonjump at exactly this moment, j:34211) and
  // the ground marker fire ON the takeoff tick rather than being inferred a
  // frame later from h > 0. The LANDING half already has a cue — LeapSystem
  // emits the shared `explosion` above at the impact point.
  "leapStart",
  // A STAT BUFF ACTUALLY ATTACHED (effects/effectRunner). One discrete 增益 cue
  // per resolved buff effect, fired only when the target set was non-empty, so
  // an ability that buffed nobody stays silent. Rate is bounded by casts.
  "buffApply",
  // 【死亡遺留】(sim/deathWard.ts): a ward was raised on a fallen hero —
  // 71-00 暗夜契約's 暗夜旗 is the shipped one.
  //
  // CONSUMER: the client's world VFX layer — the black ring itself is rendered
  // from the ENTITY (ENTITY_KIND.NIGHT_FLAG, which carries the authoritative
  // radius in `shield`), so this event exists for the ONE-SHOT beat that an
  // entity patch cannot express: the raise burst + its cue at {x, z}. Rate is
  // bounded by champion deaths (≤12 per round, and by `maxFlagsPerZone`), so it
  // is nowhere near a per-tick flood.
  "deathWardSpawn",
  // ⛔ `"nightPactBurn"` 在 2026-08-19 退場了：71-00 的第二半（「敵方在附近施法
  // 有 12% 機率魔力全失」）現在**沒有引擎程式** —— 它是
  // `auras[] → hooks[onAbilityCast] → spendMana` 的組合（第〇·五守則）。
  // ⚠️ 那則事件在整個 apps/client 樹裡**零個消費端**（量過），所以拿掉它
  // 在畫面上是嚴格的 no-op；法力條本來就每 tick 從 `Health.mana` 投影。
  // 想要那個藍色數字的話，正確的做法是給 `spendMana` 一則**通用**的
  // `manaSpend` 事件（那支檔案的檔頭自己寫著這是它的後續），⛔ 不是把一支
  // 技能專屬的事件名留在這張表上。
  // revive circles (task #84): spawn/end drive world VFX + the HUD banner.
  "reviveCircleSpawn",
  "reviveCircleEnd",
  // A TEAMMATE COMMITTED TO A REVIVE (task #84). Fires on the 0→>0 channel edge
  // only — not per channelling tick — so the 詠唱進行中 bed plays once per fresh
  // commitment. Without it the dead player's screen gave no sign that anyone had
  // come for them, which is the whole emotional beat of the mechanic.
  "reviveChannel",
  "reviveComplete",
  "vfxSpawn",
  // THE FIRE RING BEGINS TO CLOSE (task #132) — the one-shot ignition beat, the
  // 火圈 scene cue. START ONLY: see `fireRingTick`/`fireRingDamage` in the
  // server-only set for the per-tick twins that must NOT cross the wire.
  "fireRingStart",
  // A SKILL POINT WAS SPENT (abilities/abilitySystem). The 技能升級 chime + the
  // ability bar's rank pip. `levelUp` already crosses; without its twin, ranking
  // Q up was the only progression beat in the game with no feedback at all.
  // `{ id, slot, rank }` — `id` is the ENTITY, not a seat, so a client cue that
  // should only fire for the local hero has to gate on it (the same way
  // `combatSfx.guardianRewardKey` gates the bounty chime on the local seat).
  "rankUp",
  // SHOP FEEDBACK (task #38/#60): purchase/sale confirmations + every REJECTION
  // so the client can explain 金幣不足 / 背包已滿 / … instead of a dead button.
  "itemBought",
  "itemSold",
  "buyRejected",
  "sellRejected",
  // buy/sell UNDO (task #121): confirmation + rejection for the undo button.
  "shopUndone",
  "undoRejected",
  // CAST FEEDBACK (playtest P7). `CommandSystem` has always emitted this with
  // the exact `CastResult` — 冷卻中 / 魔力不足 / 尚未學習 / 距離太遠 / 沒有目標 —
  // and this whitelist filtered it out before it reached a socket, so pressing
  // Q on a cooling ability was indistinguishable from a dropped packet. It is
  // the ability bar's exact analogue of `buyRejected` and belongs to the same
  // one-list contract, so the replay explains a fumbled round too.
  "castRejected",
  // 陣亡投幣 (task #191). All three are MANDATORY here: without them the whole
  // feature is invisible with zero errors — no shine appearing on the floor, no
  // pickup jingle, and a dead player's only button answering with silence.
  //
  //   coinDropped     — `{ id, seatId, x, z, value, gold, left }`: the coin hit
  //                     the ground. Drives the world thud + the HUD counter's
  //                     confirmation. Bounded at 10 per player per round.
  //   coinPickedUp    — `{ id, entity, seatId, x, z, value, gold }`. Carries x/z
  //                     because the entity is ALREADY DESTROYED by the time the
  //                     client sees this, so the burst has nothing else to
  //                     anchor to; `seatId` gates the reward jingle to the
  //                     collector, like `guardianSlain` does for the bounty.
  //   coinDropRejected — `{ seatId, reason }`: 還活著 / 上限 / 金幣不足 / … The
  //                     same P7 contract as `castRejected` and `buyRejected` —
  //                     every press answers back.
  "coinDropped",
  "coinPickedUp",
  "coinDropRejected",
  // 連殺 COMBO (owner, 2026-07-27: 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo
  // 連殺數量」). The count is computed in the SIM (sim/combat/killCombo.ts) off
  // `world.tick`, so every client shows the same number and the replay
  // reproduces it. This event is the ONLY way it reaches a screen — the count
  // is not on `MatchState`, deliberately: it is a 5-second transient, and
  // replicating a field that is stale 5 s later at snapshot rate would cost
  // bandwidth every tick to say "still nothing".
  //
  // CADENCE: one per KILL, never per tick. It is bounded by exactly the same
  // thing `mobSlain` and `death` are bounded by — and it rides beside them, so a
  // wave clear that already sends N `mobSlain` now sends N pairs. That is the
  // ceiling, and round 9 (20/wave, 60 alive) is where it is highest.
  //
  // PAYLOAD `{ killer, killerSeatId, victim, victimKind, count, windowTicks,
  // windowMs }`. `killerSeatId` is what the HUD gates on — the counter shown is
  // YOUR chain, the same way `guardianSlain`/`coinPickedUp` gate their cues on
  // the local seat. `windowMs` travels so the display's expiry cannot drift from
  // the sim's window.
  //
  // NO DOUBLE-FIRE: nothing else derives a combo. `audio/sfxEdges.ts` diffs
  // kills/deaths off the schema for its own cues and has no notion of a chain.
  "killCombo",
  // 召喚物 (GH#289 lane P2). Both cross for the same reason `mobSpawn` does:
  // the body itself rides the snapshot (it is an ordinary entity), but the
  // MOMENTS do not, and without them a summon fades in with no conjure VFX/SFX
  // and vanishes with no dissipate — the WC3 originals all have both
  // (96-04 獨孤九劍's 9 sword spirits, 91-002 亡靈大軍's ghouls).
  //
  //   summonSpawn   — `{ id, owner, championId, zone, x, z, maxHp, teamId,
  //                   expiresAtTick }`. `expiresAtTick` is -1 for a PERMANENT
  //                   summon (Infinity does not survive JSON), which is also
  //                   the client's 「draw no lifetime ring」 signal.
  //   summonDespawn — `{ id, owner, reason, x, z }` where reason is
  //                   `expired | death | ownerDead | capEvicted`. The reason
  //                   travels because the four look different: an expiry fades,
  //                   a death is a corpse beat, and an eviction (37-02 黑核晶
  //                   「超過殺最舊」) must read as the summoner's own doing.
  //
  // CADENCE: bounded by CASTS, not ticks — one pair per body, and `maxAlive`
  // (default 8) bounds how many bodies one caster can have at a time.
  "summonSpawn",
  "summonDespawn",
  // 無敵 / 免疫 (GH#289 lane P3). Both cross for the reason this file exists:
  // the immunity itself is NOT on `MatchState` (no snapshot field, no
  // ENTITY_FLAG bit — see the note in sim/effects/invulnerable.ts), so these two
  // events are the ONLY evidence a client can have that a hit was refused.
  // Without them 41-002 絕對屏障 reads exactly like a dropped packet: the enemy
  // swings, nothing happens, no number, no sound.
  //
  //   immunityGranted — `{ target, origin, untilTick, blocksPhysical,
  //                     blocksMagic, blocksTrue, blocksControl }`. One per body
  //                     per cast, so bounded by CASTS. The four booleans travel
  //                     because 無敵 / 魔法免疫 / 免控 must look different — a
  //                     golden shell and a blue ward are not the same promise.
  //   immune          — `{ x, z, source, target, amount, type, dmgType, origin }`.
  //                     The per-REFUSAL beat: the 免疫 float + the ping. Bounded
  //                     by incoming attack rate exactly like `evade`, which it
  //                     is modelled on (same payload shape, same x/z-on-the
  //                     -victim reason), and it can only fire at all while a
  //                     grant is live.
  //   immuneControl   — `{ target, source, statusId, origin }`. The CC half, and
  //                     it needs its own name precisely because 免控 and 免傷 are
  //                     separate axes: 07-01 臨、兵、鬥 refuses stuns while its
  //                     owner keeps bleeding, so a player who saw only `immune`
  //                     would conclude the ward had done nothing. Bounded by
  //                     enemy CC casts.
  //
  // ⚠️ THE CLIENT HANDLER IS NOT WIRED YET, and that is stated rather than left
  // to be discovered. `evade` needed four call sites — `net/RoomConnection.ts`,
  // `frameBus.ts`, `GameApp.ts`, `ui/combatText.ts` — and all four sit in the
  // client-render lane that is running concurrently with P3. Listing the names
  // HERE first is deliberately the safe order: an unclassified emit is a red
  // test, and a whitelisted event with no handler is inert, whereas a handler
  // with no whitelist entry is the silent S2 failure this whole file was
  // written to stop.
  "immunityGranted",
  "immune",
  "immuneControl",
  // 嘲弄 (鍊金術之盾 godie-i06q:「[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒」).
  //
  // FANNED OUT because the pull has NO OTHER CHANNEL. It is not on `MatchState`:
  // `sim/taunt.ts` DECISION 1 deliberately puts the state in a plain `world.taunt`
  // Map with no snapshot field and no ENTITY_FLAG bit — a `StatusEffect` was
  // rejected precisely because mobs carry no `StatusComp`, and a taunt that could
  // not hold a zombie is the whole item. So the only evidence a client could
  // otherwise have is enemies turning around, which reads exactly like 「the AI
  // wandered off」. That is the `immunityGranted` argument directly above, one
  // mechanic later, and the emit site itself says so — see the block headed
  // 「② THE PLAYER MUST BE ABLE TO SEE IT」 in sim/effects/taunt.ts.
  // (Cite the HEADING, not a line number: this said `taunt.ts:99` and had
  //  already rotted to point at `return (a, b) => a.id - b.id;` inside
  //  `compareBy` — 第三守則, a citation that drifts is a lie that looks checked.)
  //
  // CLIENT CONSUMER: `vfx/VfxSystem.handleEvent`'s 嘲弄 case — an aggro ring on
  // the TAUNTER, anchored through `ctx.entityPos(source)`. Unlike `coinPickedUp`
  // this event needs no x/z: the taunter is a live body by construction, because
  // `targeting.forcedTargetOf` re-asks every tick and a dead taunter stops
  // pulling on that same tick.
  //
  // PAYLOAD `{ source, count, durationSec, origin }`. `source` is an ENTITY id,
  // NOT a seat, so a cue meant only for the local hero must gate on it the way
  // `rankUp` does. `count` travels because pulling 1 and pulling 8 are different
  // events to the player who built a tank.
  //
  // CADENCE: emitted ONLY when somebody was actually pulled (`pulled > 0`), and
  // the rhythm is `HookDef.internalCooldown` — 1 s on the shipped card, so ≤1/s
  // per holder. ⚠️ It is NOT tick-bounded in general: `IntervalHookSystem` 決策 1
  // states outright that an `onInterval` hook with no `internalCooldown` fires
  // 30×/s. That is an AUTHORING shape, not a code path — the fix for one would be
  // the missing cooldown on that hook, not a special case here.
  //
  // NO DOUBLE-FIRE: `audio/sfxEdges.ts` diffs only kill/death/levelUp/exUnlock
  // tallies and has no notion of aggro, and `combatSfx` has no case for this.
  "taunt",
  // 發放金幣 (sim/effects/grantGold.ts) — 鍊金術之盾's second half:「[煉金術] …
  // 將 HP 低於 5% 的敵人變成黃金 (黃金數量為敵方等級)」.
  //
  // FANNED OUT, and the reason is NOT 「the client cannot know the number」 — it
  // can. The payee's purse is replicated (`SeatState.gold`) and drawn every frame
  // in the HUD's `gold-level` slot. What is missing is WHEN and WHY: this is a
  // 10 % proc that resolves inside a single sim tick, so without this event a
  // successful transmute and a failed roll look IDENTICAL on screen — a counter
  // that ticks up at some point, for some reason. That is not the
  // `attrUpgradePicked` case below, which is server-only because the player
  // CLICKED the card and therefore already knows it happened; nobody pressed
  // anything here.
  //
  // CLIENT CONSUMER: `vfx/VfxSystem.handleEvent`'s 煉金 case — a gold burst on the
  // PAYEE, anchored through `ctx.entityPos(target)`. Deliberately the BEAT only:
  // the amount stays on the HUD counter that already renders it, so the two
  // halves cannot drift into disagreeing about a number.
  //
  // ⚠️ PAYLOAD `{ target, amount, origin }`, and `target` is the PAYEE — NOT the
  // transmuted victim. The naming is the emit site's (grantGold.ts loops over
  // `payees` and calls the loop variable the target), and it is written down here
  // because a consumer that drew the burst on 「the target」 in the ordinary sense
  // would put it on the wrong body. The victim's id is not on this event at all.
  //
  // ⚠️ THIS IS NOT A GENERAL 「gold changed」 EVENT. Most gold in the game is paid
  // by calling `economy/progression.grantGold` directly — mob bounties, kill
  // bounties, the round payout — and none of those emit anything. Only the
  // AUTHORED `grantGold` EFFECT emits, so a consumer must never read its absence
  // as 「no gold was earned」.
  //
  // CADENCE: bounded by whichever hook the content author attached it to. On the
  // one shipped card that is `onDamageTaken` × `chance 0.1` × a 「hp < 5 %」
  // condition, i.e. rarer than a kill. The same `onInterval` caveat as 嘲弄 above
  // applies, with the same answer.
  "goldGrant",
  // ── 具名標記（十二道試煉 · 風王結界 · 縮地）─────────────────────────────
  //
  // ⛔ 三顆都是 MANDATORY，而理由正是這張清單存在的理由：
  // **標記完全不在 `MatchState` 上**。`SimWorld.marks` 是一張 sim 內部的 Map，
  // 沒有 snapshot 欄位，也拿不到 `ENTITY_FLAG` 的位元 —— `ENTITY_FLAG_FREE_BITS`
  // 已經是空的（`protocol/schema.ts:942`；CLAUDE.md 說「還剩兩格」是過期的，
  // 見 GH#285），而 `defineTypes` 是 APPEND-ONLY，加錯回不去。
  //
  // 所以這三顆事件是「我還剩幾層」與「我剛剛免死了」**唯一**能到螢幕的通道。
  // 少了它們，整套機制在伺服器上完美運作而玩家什麼都看不到 —— 那正是
  // CLAUDE.md 失敗形態②（做了但從沒送到客戶端）的教科書形狀。
  //
  // CADENCE：`markChanged` 每次層數真的變動才發（安裝、消耗、回合重置、過期），
  // 不是每 tick；十二道試煉整場最多 12 次消耗 + 1 次安裝。`lethalSaved` 嚴格
  // 少於或等於它。`markInstallConflict` 只在同一個 markId 被兩支技能宣告時發，
  // 出貨內容裡是零次 —— 它是一個**內容錯誤的告警**，不是遊戲事件。
  "markChanged",
  "lethalSaved",
  "markInstallConflict",
]);

/**
 * Sim events that are emitted but DELIBERATELY never broadcast — each with the
 * reason, so "it's missing" can be told apart from "nobody decided". Listing
 * them is what lets `eventFanout.test.ts` prove the sim's emit set is fully
 * classified; a name here is a decision, not an oversight.
 */
export const SERVER_ONLY_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  // ── GH#354（2026-08-17）—— 四則**只餵 hook** 的事件 ────────────────────
  // ⚠️ 四則都刻意不外送：它們沒有任何客戶端表現，而且每一則都與一個**已經在
  // 外送**的事件講同一件事（送出去就是同一件事在線上出現兩次，浮動數字與特效
  // 會重播）：
  //   · `abilityHit`   ↔ 已外送的 `damage` / `projectileHit`
  //   · `displace`     ↔ 已外送的 `leapStart`（衝刺／閃現的畫面走 nav override）
  //   · `lethalDamage` ↔ 已外送的 `damage`（同一發），而 `lethalSaved` 也在這張表上
  // ⛔ 哪天真的要畫「致命一擊」的表現，正確的做法是讓客戶端讀 `damage` 的
  // `killingBlow`，不是把這一則放出去。
  //
  // ⚠️ 同一批的 `roundStart` / `roundEnd` **刻意不在這張表上**：它們由
  // `MatchController` 發，不是 sim，而這兩個集合的守衛掃的是
  // `packages/shared/src/sim` —— 列進來會被正確地判成「分類了但沒有人發」。
  // 它們不外送是**因為外送是白名單**（`isFannedOutEvent`），不是因為列在這裡。
  "abilityHit",
  "displace",
  "lethalDamage",
  // ⚠️ `resourceSwap` **不在這張表上了**（GH#406，2026-08-19）：v0.21.1 把它
  // 暫時列在這裡並註明「接上呈現的那一版要搬回 FANNED_OUT」，而那一版已經到了 ——
  // 它現在在上面那張表，客戶端消費者寫在那裡。⛔ 不要把它搬回來。
  //
  // ⭐ G19 —— `statCapReached`「某條屬性首次到頂」。同樣只餵 hook：
  // 客戶端從**已經複製過去的** `MatchState` 屬性欄自己看得到那個數字到頂了，
  // 而這一則的意義是「這是**第一次**」——一個只有伺服器的閂知道的事。
  // ⚠️ 它是**每 tick 的屬性管線**發的，外送等於在買裝備那一刻多灌一批訊息，
  // 而畫面上沒有任何東西在等它。
  "statCapReached",
  // ── WIRE FLOOD: per-tick, and the client already has the beat it needs ─────
  // `fireRingTick` is emitted UNCONDITIONALLY every tick from the moment the
  // ring arms until the round ends — 30 messages/second/client for ~60 s, and
  // it carries only `{ ratePerSec, ticksSinceStart }`, which the client can
  // derive from `fireRingStart` + its own clock. `fireRingDamage` is worse: one
  // message PER LIVING CHAMPION per tick (~12 × 30 = 360/s) of pure %-HP burn.
  // Neither has a consumer (`audio/combatSfx` maps `fireRingStart` alone), and
  // the HP drain is already visible through the replicated health in
  // `MatchState`. If the ring ever needs a per-tick client visual, send a
  // THROTTLED intensity event — do not open these two.
  "fireRingTick",
  "fireRingDamage",
  // ── NO CONSUMER: bookkeeping the client re-derives from state ─────────────
  // Aura attach/detach churn (sim/aura/aura.ts). Transition-only, but a unit
  // walking the aura boundary attaches/detaches on ALTERNATE TICKS whenever
  // content leaves `lingerSec` at its 0 default (DECISION 6), so the worst case
  // is emitters × targets × 15 Hz of flicker. Nothing on the client listens;
  // the resulting stat change is already replicated. Needs a debounced,
  // presentation-shaped event (or the linger knob set) before it can cross.
  "auraApply",
  "auraEnd",
  // Post-cast recovery / 後搖 window (abilities/abilityRecovery + RecoverySystem).
  // Cast-bounded, so cadence is fine — but there is no client handler and no
  // recovery indicator in the HUD today, and the payload is sim-internal
  // (`ticksSaved`, `reason: hit|interrupt|elapsed`). Fan these out together
  // WITH the UI that draws them, not before: an event with no consumer is
  // indistinguishable on the wire from one whose consumer silently no-ops.
  "recoveryBegin",
  "recoveryEnd",
  // 切換型技能的開/關 (abilities/toggle.ts, 2026-08-08). Same rule as
  // `recoveryBegin`/`recoveryEnd` directly above: no client handler exists yet,
  // so opening the wire now buys nothing and hides the gap.
  //
  // ⚠️ BUT THIS ONE HAS AN EXTRA HALF, and whoever wires it must read this:
  // a toggle is STATE, not a moment. It lives in `AbilitiesComp.toggles` and is
  // in NO snapshot field, so a client that only learns the EDGE is wrong for
  // every late join, reconnect and spectator switch — they arrive mid-toggle and
  // see it off. Fanning these two out is therefore NOT sufficient wiring; the
  // on/off state has to be replicated too. That is the expensive half:
  // `defineTypes` is APPEND-ONLY and `ENTITY_FLAG_FREE_BITS` is empty (GH#285),
  // so it needs a deliberate schema decision, not a spare bit.
  //
  // Zero content uses `ability@1.toggle` today (the Codex skill editor will emit
  // the first ones), so nothing is invisible in game right now — the mechanism
  // simply has no authored users yet.
  "toggleEnter",
  "toggleExit",
  // GH#300 的兩個新時刻 (2026-08-09). 它們存在的理由是**內容側**的:
  // `systems/WorldHookSystem.ts` 把它們轉成 `onShieldGained` / `onStatusApplied`
  // 兩個 hook 事件。同 `recoveryBegin` 的規則 —— 今天沒有客戶端 handler,
  // 現在開線買不到任何東西,只會把缺口藏起來:「一個沒有消費者的事件在線上跟一個
  // 消費者靜默 no-op 的事件長得一模一樣」。
  //
  //   shieldGained — `{ target, source, amount, origin }`. 護盾的**量**本來就在
  //     快照裡(`EntityState.shield`),所以缺的只是「剛剛多了一片」那個 beat。
  //     要開線的話跟畫它的東西一起開。CADENCE: 一次 `addShield` 一則,由施法次數
  //     決定,不是 per-tick。
  //   statusApplied — `{ target, source, statusId, origin }`. ⚠️ 它是 `stunApplied`
  //     的**上位集合**,而 `stunApplied` 已經在上面過線了。兩個一起送 = 每一次暈眩
  //     發兩則,而客戶端會用兩條不同的路畫同一件事(檔頭第 3 點 DOUBLE-FIRE)。
  //     真要開線的話,正確的做法是先決定 `stunApplied` 要不要被它取代。
  //     CADENCE: transition-only(續期不重發),所以是「被上狀態的次數」不是 tick 數。
  "shieldGained",
  "statusApplied",
  // Guardian's last-hit buff expiring (GuardianSystem). The buff itself shows
  // through replicated stats; no cue was ever authored for its end.
  "guardianBuffExpire",
  // ── ALREADY DELIVERED ANOTHER WAY — fanning out would duplicate ───────────
  // Draft + shop economy. The 3-choose-1 offers reach the client as
  // `SeatState.offers` in the replicated schema (net/snapshot.ts), and the
  // RESULT of a pick shows up as gold/items/stats in the same schema. Only the
  // shop's own accept/reject toasts (`itemBought`/`buyRejected`/…) are event-
  // driven, and those are already whitelisted above.
  "augmentOffer",
  "augmentPicked",
  "itemOffer",
  "itemPicked",
  "gachaItem",
  "legendaryOrbRolled",
  "statUpgradeBought",
  // #260 — the picked 力/敏/智 magnitude. Its RESULT is replicated twice over
  // (`SeatState.attrBonus`, and every stat the attribute feeds), and the card
  // itself arrived as `SeatState.offers`; a fanned-out echo would add nothing
  // the client cannot already see.
  "attrUpgradePicked",
  "statCapstoneGranted",
  "statPathReset",
  // Command echoes from CommandSystem: the seat's ready flag and the accepted
  // offer id are both replicated state — the echo is for server-side traces.
  "ready",
  "pickOffer",
  // Entity creation. The client learns a champion exists from the entity map in
  // `MatchState`; the event carries the same identity with no extra art data.
  "championSpawn",
  // 變身 (task #249). The BODY already crosses the wire without this: the
  // snapshot re-derives `EntityState.key` from `Champions.get(champ.championId)
  // .modelKey` every tick (net/snapshot.ts), so a form swap re-points the mesh
  // by itself and this event would only echo the same identity — the
  // `championSpawn` rationale directly above, one mechanic later.
  //
  // What it does NOT deliver is the swap MOMENT (the 變身 flash/sting, the "N
  // seconds left" read). That is a presentation feature with no consumer yet;
  // fan this out TOGETHER WITH the thing that draws it — the `recoveryBegin` /
  // `recoveryEnd` rule right above — rather than opening the wire first.
  // Cadence is safe either way: it fires once per cast and once per revert.
  "championForm",
  // EX unlocked. The client's `audio/sfxEdges` already derives this from the
  // 0→1 `exRank` edge on the LOCAL seat's schema — correctly seat-gated, which
  // the broadcast event would not be. Fanning it out would ring the sting a
  // second time, for every champion in the match. (Same reason `death` and
  // `levelUp` cross the wire for VFX but stay unmapped in `combatSfx`.)
  "exUnlock",
  // 召喚失敗:找不到那個英雄文件 (GH#289 lane P2). This is a CONTENT AUTHORING
  // fault, not a game event — the ability names a champion doc that is not in
  // the registry (`championId` is a SOFT ref so an ability may ship before its
  // body does). It exists so the failure is LOUD server-side instead of the
  // handler quietly placing nothing (failure shape ②); the player has nothing
  // to see, because the correct behaviour on a broken document is that nothing
  // happens. Fan it out only if a debug overlay is ever built to show it.
  "summonFailed",
]);

/** True when this sim event should be broadcast to clients on MSG.EVENT. */
export function isFannedOutEvent(ev: SimEvent): boolean {
  return FANNED_OUT_EVENT_TYPES.has(ev.type);
}

// ───────────────────────────── PRIVATE (single-recipient) DELIVERY ──────────
/**
 * WHICH FANNED-OUT EVENTS ARE ADDRESSED TO EXACTLY ONE PLAYER.
 *
 * Everything above rides `room.broadcast`, which hands the SAME bytes to all 12
 * sockets. For most of the list that is right — a `damage` number, a `death`, a
 * `mobBossSpawn` are things the whole duel is supposed to see. But a handful of
 * them are ANSWERS TO A BUTTON PRESS: 「冷卻中，還有 3 秒」, 「金幣不足」,
 * 「背包已滿」. The client has always known this and has always thrown them
 * away — `ui/castFeedback.castRejectionFromEvent` and
 * `net/RoomStore.recordShopEvent` both bail unless the payload's actor is the
 * LOCAL entity, and `ui/castAnnounce`'s own comment says it outright:
 *
 *   「whose cast failed is a private matter」
 *
 * So 11 of every 12 copies were decoded, inspected and dropped. This map is the
 * server finally agreeing with the client: send the one copy that is read.
 *
 * ── WHY THIS IS NOT A PROTOCOL CHANGE (each point checked, not assumed) ──────
 *   1. THE BYTES ARE IDENTICAL. `Room.broadcastMessageType` builds
 *      `getMessageBytes.raw(Protocol.ROOM_DATA, type, message)` and pushes it to
 *      every client; `WebSocketClient.send` calls the SAME `getMessageBytes.raw(
 *      Protocol.ROOM_DATA, type, message)` for one. (Verified in the vendored
 *      @colyseus/core 0.16.24 + @colyseus/ws-transport 0.16.5 builds.) The only
 *      difference is how many sockets the buffer is handed to.
 *   2. IT IS A MESSAGE, NOT STATE. MSG.EVENT is a room message channel, so
 *      nothing here goes anywhere near `defineTypes` in
 *      packages/shared/src/protocol/schema.ts — which is APPEND-ONLY and cannot
 *      be walked back.
 *   3. THE CLIENT NEEDS NO CHANGE. Its filters stay exactly as they are; they
 *      simply stop rejecting eleven copies that never arrive.
 *
 * ── SPECTATORS (the decision this raised) ───────────────────────────────────
 * A MatchRoom has NO seatless clients: `onJoin` refuses anyone who cannot be
 * given a seat, so every socket in the room owns exactly one champion.
 * 「Spectating」 in this game (#269/#85) is a CAMERA state — your duel ended and
 * you pressed 前往觀戰 — and your seat, entity and account are unchanged while
 * you watch. Addressing by entity/seat therefore keeps delivering a spectating
 * player their OWN answers, and the events they are not addressed by are exactly
 * the ones their client already discards. So there is no spectator rule to
 * invent here; the rule is 「it goes to the seat it is about」.
 *
 * THE REPLAY ROOM IS DELIBERATELY NOT CHANGED. A ReplayRoom viewer has no seat
 * at all (`projectSnapshot(..., noDrivers)`), so `RoomStore` leaves its
 * `localEntityId` null and every one of these events is already dropped
 * client-side there. Routing by a seat that does not exist could only turn
 * "dropped by the client" into "never sent", which is the same picture with less
 * room to build a replay-side HUD later. ReplayRoom keeps calling
 * `isFannedOutEvent` and broadcasting, which is also what
 * `eventFanout.test.ts`'s "both rooms use the one shared allowlist" guard reads.
 *
 * ── HOW A RECIPIENT IS NAMED ────────────────────────────────────────────────
 * The sim names the acting player inconsistently (this is not new — `RoomStore`
 * already reads `ev.data.id ?? ev.data.entity` for the same reason), so each
 * entry lists the fields to try, in order:
 *   • `entityFields` — an ENTITY id, matched against `Seat.entityId`;
 *   • `seatFields`   — a SEAT id, looked up directly.
 * Entity first where both exist, because the entity is what the client's own
 * filter compares against, so the two sides agree on who "the actor" is.
 */
export interface PrivateEventRule {
  /** payload fields carrying the recipient's ENTITY id, in priority order */
  readonly entityFields: readonly string[];
  /** payload fields carrying the recipient's SEAT id, in priority order */
  readonly seatFields: readonly string[];
}

export const PRIVATE_EVENT_RULES: ReadonlyMap<string, PrivateEventRule> = new Map<string, PrivateEventRule>([
  // CAST FEEDBACK (playtest P7). `{ entity, slot, reason }` from BOTH emit sites
  // (systems/CommandSystem + systems/ChampionFormSystem). Consumer:
  // ui/castFeedback.castRejectionFromEvent, which drops it unless
  // `entity/caster/id === localEntityId`. Nothing else on the client reads it —
  // combatSfx has no case and no PASSTHROUGH entry, so it makes no sound for
  // anyone, including the player it is about (the press path already beeped).
  ["castRejected", { entityFields: ["entity", "caster", "id"], seatFields: [] }],
  // SHOP FEEDBACK (task #38/#60/#121). The rejections carry `{ entity, seatId,
  // … }`, the confirmations `{ id, … }` — that asymmetry is the sim's, and
  // net/RoomStore.recordShopEvent already reads `ev.data.id ?? ev.data.entity`
  // for exactly this reason. Its ONLY consumer is that function, which returns
  // early unless the actor is the local entity.
  ["buyRejected", { entityFields: ["entity", "id"], seatFields: ["seatId"] }],
  ["sellRejected", { entityFields: ["entity", "id"], seatFields: ["seatId"] }],
  ["undoRejected", { entityFields: ["entity", "id"], seatFields: ["seatId"] }],
  ["itemBought", { entityFields: ["id", "entity"], seatFields: [] }],
  ["itemSold", { entityFields: ["id", "entity"], seatFields: [] }],
  ["shopUndone", { entityFields: ["id", "entity"], seatFields: [] }],
  // 陣亡投幣的拒絕 (task #191). `{ seatId, reason }` — the ONLY one of the eight
  // with no entity in it at all, because `no-champion` is one of the reasons it
  // can carry. Seat-addressed for that reason.
  //
  // ⚠️ STATED, NOT HIDDEN: this event currently has NO client consumer —
  // `audio/combatSfx` returns null for it on purpose and no HUD reads it, so
  // today it is inert on all 12 sockets. It is listed here because it is
  // unambiguously addressed to one seat, and because when someone does wire the
  // 拒絕 line the routing should already be right rather than being a second
  // change nobody remembers to make.
  ["coinDropRejected", { entityFields: [], seatFields: ["seatId"] }],
]);

/** Where a private event is addressed: one entity, or one seat. */
export type PrivateEventAddress =
  | { readonly kind: "entity"; readonly id: number }
  | { readonly kind: "seat"; readonly id: number };

/**
 * The single recipient this event names, or null when it has none.
 *
 * NULL MEANS BROADCAST, and that direction is deliberate: a private type whose
 * payload does not actually name anybody (a renamed field, a new emit site that
 * forgot the id) falls back to exactly today's behaviour instead of vanishing.
 * Failing the other way would reintroduce the silent-omission class this whole
 * file exists to prevent — the client would go quiet with no error anywhere.
 * `privateEvents.test.ts` pins the fallback both ways: every rule must resolve
 * on the payload the sim really emits, and a payload with the id stripped out
 * must still reach everybody.
 */
export function privateEventAddress(ev: SimEvent): PrivateEventAddress | null {
  const rule = PRIVATE_EVENT_RULES.get(ev.type);
  if (!rule) return null;
  const data = ev.data as Record<string, unknown> | undefined;
  if (!data) return null;
  for (const field of rule.entityFields) {
    const v = data[field];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return { kind: "entity", id: v };
  }
  for (const field of rule.seatFields) {
    const v = data[field];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return { kind: "seat", id: v };
  }
  return null;
}

/** True when this event type is meant for one player rather than the room. */
export function isPrivateEvent(ev: SimEvent): boolean {
  return PRIVATE_EVENT_RULES.has(ev.type);
}

/**
 * THE KILL SWITCH for private delivery — a DECISION POINT, so it is a knob and
 * not a hard-coded `true` (owner 2026-07-30:「尤其是決策點」).
 *
 * Default ON, because that is the behaviour the owner approved and because the
 * broadcast it replaces was never read by the other eleven clients. Setting
 * `GGD_PRIVATE_EVENT_FANOUT=0` puts every one of these events back on
 * `room.broadcast` with no other change, which is what makes it a real rollback:
 * if a client-side filter is ever found reading somebody else's rejection, the
 * fix is an env var on the shard, not a rebuild of the game-server image (client
 * and server are baked at build time — only `content/` is live).
 *
 * It is NOT a `content/config` field on purpose: this decides how a socket is
 * written to, not how the game plays, so it belongs with `GGD_MAX_ROOMS` /
 * `GGD_MATCH_STATS` rather than in the 戰鬥系統 tables. Promoting it into the
 * admin console is left as a follow-up (see the lane report).
 */
export const PRIVATE_EVENT_FANOUT = process.env.GGD_PRIVATE_EVENT_FANOUT !== "0";

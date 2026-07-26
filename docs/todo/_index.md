# TODO Index — feature checklists & test gate

Every feature has a `docs/todo/<feature>.md` file. **Every item carries a unique `Test ID`**
that maps to a real test function. The gate (`tools/todo-check`) enforces this:

- **Static** (`pnpm todo:check`, pre-commit + CI): every item has a unique id + test_id +
  valid category/status. Fails the build otherwise.
- **Runtime** (CI, after suites run): every item marked **`done`** must have had its `test_id`
  emitted by a passing test (via `cover("<test_id>")` from `@ggd/shared/testkit`). Fails if a
  "done" item was not actually covered.

**Categories:** `unit · integration · e2e · exception · injection · security · vuln · determinism · regression`
**Statuses:** `pending · in-progress · done · deferred`

Regression suites always run **last** (enforced by the runner scheduler and the CI DAG).

## Feature files

| Feature | File | Area |
| --- | --- | --- |
| Auth (register/login) | [auth.md](auth.md) | platform |
| Friends & presence | [friends.md](friends.md) | platform |
| Lobby & chat | [lobby.md](lobby.md) | platform |
| Rooms | [rooms.md](rooms.md) | platform |
| Invites | [invite.md](invite.md) | platform |
| Leaderboard & ranking | [leaderboard.md](leaderboard.md) | platform |
| Ranked ladder client UI (tiers + player/champion boards) | [ranking-ui.md](ranking-ui.md) | client |
| Go⇄Colyseus match seam | [game-seam.md](game-seam.md) | platform + game |
| Couch play (local multiplayer) | [couch-play.md](couch-play.md) | platform + game + client |
| M COIN & skins/champions store | [mcoin-store.md](mcoin-store.md) | platform + content |
| Arena round rules & roster | [arena-rules.md](arena-rules.md) | game + content |
| Healing flowers (LoL-Arena plants) | [flowers.md](flowers.md) | game + content + client |
| Revive circles (復活小火圈, once per team per round) | [revive-circles.md](revive-circles.md) | game + content + client |
| Neutral duel-zone guardian (守護塔, last-hit reward + AoE punish) | [guardian.md](guardian.md) | game + content |
| WC3 dummy-effect-units + orbs → spawnVfx/ambient (化繁為簡) | [dummy-orb.md](dummy-orb.md) | game + content + client |
| Themed arenas + map select + cast bar | [arenas.md](arenas.md) | client + game + content |
| Sim determinism | [sim-determinism.md](sim-determinism.md) | game |
| Leap — parabolic jump primitive (JASS parabola + on-screen framing gate) | [leap.md](leap.md) | game + content + client + editor |
| Victory settlement (stats + grade + rank + freeze) | [settlement.md](settlement.md) | game + client |
| Victory fireworks (round volley + 吃雞 roast-chicken) | [victory-fireworks.md](victory-fireworks.md) | client |
| 中場 intermission scene + centre-stage shop | [intermission.md](intermission.md) | game + client + content |
| Combat timing v2 (cast time + basic-attack overhaul) | [combat-timing.md](combat-timing.md) | game + content |
| 戰鬥系統 global multipliers + admin dynamic config | [combat-env.md](combat-env.md) | game + platform + admin |
| TTK tuning — maxHealth for round length (≥120s min, ~180s avg) | [ttk-tuning.md](ttk-tuning.md) | game + content |
| 三圍 STR/AGI/INT attribute derivation from the w3x | [attributes.md](attributes.md) | game + content + admin |
| Planar collision | [collision.md](collision.md) | game |
| Content pipeline | [content-pipeline.md](content-pipeline.md) | content |
| EX 技能 per-hero ultimate (lvl-30 gate) | [ex-skills.md](ex-skills.md) | content + game + client |
| Client HUD & netcode | [client-hud.md](client-hud.md) | client |
| Client roster, content-load & smoothing | [client-roster.md](client-roster.md) | client |
| Leave/Restart flow, offline cheats & spectator cam | [restart-cheats.md](restart-cheats.md) | client + game |
| iPhone support (touch + mobile HUD + PWA) | [mobile.md](mobile.md) | client |
| Settings + adaptive quality/FPS + connection tuning | [settings-perf.md](settings-perf.md) | client |
| Client audio (WebAudio BGM/SFX + audio-map) | [audio.md](audio.md) | client + content |
| 語音的遠近空間之分（#259 — 只有自己的才是全播放） | [spatial-voice.md](spatial-voice.md) | client |
| Global always-accessible music/SFX quick-toggle | [audio-toggle.md](audio-toggle.md) | client |
| JRPG custom cursor (size-adjustable S/M/L/XL) | [cursor.md](cursor.md) | client |
| Champ-select champion-name VO (Japanese full name) | [name-voice.md](name-voice.md) | client + content |
| Announcer system-broadcast VO (trilingual 惡搞 pack) | [announcer-vo.md](announcer-vo.md) | client + content |
| Champion select voice (click your own hero, CHARACTER quips) | [champion-voices.md](champion-voices.md) | client + content |
| Animated isekai login background (procedural Babylon) | [login-scene.md](login-scene.md) | client |
| Champion-portrait login marquee (roster showcase) | [champion-marquee.md](champion-marquee.md) | client |
| 英靈殿 lobby champion showcase (3D + 稱號/全名/描述/技能, 1-minute rotation) | [valhalla.md](valhalla.md) | client |
| Champion identity (hero 編號, not model/portrait) | [champion-identity.md](champion-identity.md) | content + client + platform |
| Champion role taxonomy (six real roles, not `fighter`/`marksman`) | [role-taxonomy.md](role-taxonomy.md) | content |
| Platform web UI (auth/lobby/rooms/store) | [web-ui.md](web-ui.md) | client |
| Operations admin backend + console SPA | [admin.md](admin.md) | platform + admin |
| 資料搬遷 — whole-platform ZIP export/import (#243) | [platform-archive.md](platform-archive.md) | platform + admin |
| Content whitelist (default-empty curation) | [whitelist.md](whitelist.md) | platform + admin + client + game |
| 兩台後台的內容同步 (tick-box, field-level arbitration) | [content-sync.md](content-sync.md) | platform + admin + content |
| 內容圖鑑 codex (live item/champion/ability browser) | [content-codex.md](content-codex.md) | client + content |
| AI icon/text generation (proxy + admin config + editor) | [ai.md](ai.md) | platform + admin + editor |
| 資料搬遷封存：匯入前備份的保留與可見性 (#243) | [platform-archive.md](platform-archive.md) | platform + admin |
| Infra & one-click K8s | [infra.md](infra.md) | infra |
| Warcraft III map importer | [w3x-import.md](w3x-import.md) | content |
| WC3 particle port (vfx/ribbon/ambient engine) | [particles.md](particles.md) | content + client |
| 打擊感 combat juice (shake/flash/hitstop/knockback) | [combat-juice.md](combat-juice.md) | game + client |
| RO-style floating combat text (傷害/補血/補魔 numbers) | [combat-text.md](combat-text.md) | game + client |
| WC3 vertex colour (tint) + alpha port | [vertex-tint.md](vertex-tint.md) | content + client |
| In-game castability sweep (#128 pass/fail matrix) | [castability.md](castability.md) | game + content |

## Planned (author the TODO file when the feature is started)

`champions.md · abilities.md · items.md · augments.md · map-editor.md · vfx-editor.md ·
model-inspector.md · content-api.md · ai-bots.md · match-flow.md`

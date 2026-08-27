/**
 * 快照 → **給人看的投影**（GH#716，第〇·七守則）。
 *
 * ⭐ 這是一個**職責**，⛔ 不是「`GameApp.ts` 的後 212 行」：它把權威快照
 * (`MatchState`) ＋ 視圖位置，翻成 HUD 那一側每一幀重建的四份清單 ——
 * 血條錨點／殭屍王小地圖標／復活圈／飄字投影。它一格 Babylon 都不碰，
 * 也一格網路都不碰。
 *
 * ⚠️⚠️ **外層那支方法必須留在 `GameApp.prototype` 上** ——
 * `render/anchorBounds.test.ts` 是用 `GameApp.prototype.updateFrameBus.call(fakeSelf, …)`
 * 呼叫它的。⇒ 搬走的是**本體**，`GameApp` 留一支轉發。⛔ 不是把方法搬掉。
 *
 * ⭐ **搬移是機械的**：本體與搬走前**逐位元組相等，除了 `this.` → `d.`**。
 * `game/gameAppSplit.test.ts` 真的把兩邊反代換回去比對（⛔ 不是相信這段註解，第三守則）。
 */
import { expireCombatText, frameBus, mobBossMarkerFor } from "../frameBus";
import { hudStore, localDuelZone } from "../net/RoomStore";
import {
  anchorColorFor,
  anchorHeightFor,
  hasOverheadBar,
  KIND_CHAMPION,
  KIND_FLOWER,
  KIND_GUARDIAN,
  KIND_MOB,
  KIND_REVIVE_CIRCLE,
} from "../render/overheadAnchors";
import { anchorDrawable } from "../render/anchorBounds";
import { stealthVisualFor } from "../render/stealthVisual";
import { ENTITY_FLAG, type MatchState } from "@ggd/shared/protocol/schema";
import { mobBarAnchorFor, mobBarAnchorY, type MobHealthBarConfig } from "../ui/hud/mobHealthBarModel";
import type { CastTracker } from "../CastTracker";
import type { VfxSystem } from "../vfx/VfxSystem";
import type { EntityViewRegistry } from "../render/EntityViewRegistry";
import type { VisibleZones } from "../net/zoneVisibility";

/**
 * 這支投影**真正**讀到的 10 格實例狀態 —— 量出來的（⛔ 不是「大概需要這些」）。
 *
 * ⭐ 它同時是一條**會紅的界線**：`GameApp` 想在這段投影裡多讀一格欄位，就必須先
 * 把那一格加進這個介面 ⇒ 「這個職責依賴什麼」是 `tsc` 看得到的東西，
 * ⛔ 不是一段會腐爛的散文。
 */
export interface FrameBusDeps {
  readonly casts: CastTracker;
  readonly fbChampBySeat: Map<number, string>;
  readonly fbNameBySeat: Map<number, string>;
  readonly fbSeen: Set<number>;
  readonly mobBarCfg: MobHealthBarConfig;
  readonly predictedEntityId: number | null;
  readonly teamBySeat: Map<number, number>;
  readonly vfx: VfxSystem;
  readonly views: EntityViewRegistry;
  readonly visibleZones: VisibleZones;
}

export function updateFrameBusFrom(d: FrameBusDeps, state: MatchState, nowMs: number): void {
    expireCombatText(nowMs);
    const project = frameBus.project;
    if (!project) return;
    const hud = hudStore.getState();
    const nameBySeat = d.fbNameBySeat;
    const champBySeat = d.fbChampBySeat;
    nameBySeat.clear();
    champBySeat.clear();
    for (const s of hud.seats) {
      nameBySeat.set(s.seatId, s.displayName || `Seat ${s.seatId}`);
      champBySeat.set(s.seatId, s.championId);
    }

    // 隱形原語 —— the viewer's team, resolved once for this frame's anchor sweep
    // exactly as the entity pool does it (same store, same client-08 reason).
    const localTeam =
      hud.localSeatId === null ? null : (d.teamBySeat.get(hud.localSeatId) ?? null);
    const isFriendlyEntity = (seatId: number): boolean =>
      localTeam !== null && (d.teamBySeat.get(seatId) ?? -1) === localTeam;

    const seen = d.fbSeen;
    seen.clear();
    // ---- 精英小怪頭上的小血條 (GH#268) --------------------------------------
    // REBUILT FROM SCRATCH EVERY FRAME, like `reviveCircles` below: 一條血條的
    // 存續條件就是「那一列還在快照裡」,所以屍體與離場的怪自己就消失了,不需要
    // 任何 death handler。
    //
    // ⚠️ v0.9.28 出貨時**這個迴圈不存在** —— 伺服器把 `ENTITY_FLAG.MOB_ELITE`
    // 寫上線(付掉最後一格,不可逆),客戶端一個字都沒讀,整包功能可以刪掉而畫面
    // 不變(失敗形態 ③)。守衛:`ui/hud/mobHealthBarWiring.test.ts`。
    const bars = frameBus.mobBars;
    bars.length = 0;
    const barCfg = d.mobBarCfg;
    state.entities.forEach((es) => {
      if (es.kind === KIND_MOB) {
        // ⭐ GH#575 —— **在任何 return 之前**記下這一具身體。`mobSlain` 的 payload
        // 沒有 x/z，而殭屍在事件到達時通常已經從快照裡消失（sim 同一個 tick 就
        // `destroyAfterHooks`）⇒ 少了這一行，金幣不生、音效與音階都不播。
        // ⚠️ 刻意放在**分區剔除與界外閘之前**：金幣的歸屬與音階是**擊殺者**的回饋，
        //    ⛔ 與「這一隻的血條有沒有畫在螢幕上」無關。
        d.vfx.noteGoldBody(es.id, es.x, es.z);
        // L3 ZONE CULL —— 別區的小怪血條沒有消費者(`MobHealthBars` 只畫投影到
        // 螢幕上的),而波峰時一區 50 隻,少跑一次 `project()` 是真的省。
        if (!d.visibleZones.has(es.zone)) return;
        const mp = d.views.posOf(es.id) ?? { x: es.x, z: es.z };
        // ⭐ 出口的閘（owner 2026-08-19「在牆外也不應該是顯示在那邊」）。見
        // `render/anchorBounds.ts`：⛔ 不夾回界內，不畫，而且會被數到。
        if (!anchorDrawable(frameBus.arenaZones, mp.x, mp.z, `mob bar #${es.id}`)) return;
        // ⚠️ `es.mana` 是體型倍率(GH#192),不是法力 —— 一般殭屍 0.68 / 特殊 2 /
        // 王 5。不餵它的話 `yOffset` 就是一個寫了沒人讀的欄位,而王的血條會掛在
        // 牠膝蓋上(失敗形態 ①)。
        const bar = mobBarAnchorFor(es, project(mp.x, mobBarAnchorY(es.mana, barCfg), mp.z), mp);
        if (bar) bars.push(bar);
        return;
      }
      // champions AND neutral objectives (kind 2 flower, kind 4 guardian) carry
      // overhead bars. A guardian is NEUTRAL (task #89): no name, teamId -1, and
      // an explicit neutral bar colour (anchorColorFor) — never a team tint.
      if (!hasOverheadBar(es.kind)) return;
      // 隱形原語 —— NO BAR FOR A HIDDEN ENEMY. This is a SECOND decision, not a
      // consequence of the model fade: `enemyAlpha` is a field, so an operator
      // who picks a 「半透明鬼影」 look (0.15) would otherwise still get a crisp
      // health bar floating over the ghost — a perfect position readout, i.e.
      // exactly the thing being hidden. `stealthVisualFor` owns both answers so
      // they cannot drift; `friendly` is the seat's team (see the entity pool).
      // Returning BEFORE `seen.add` is what deletes an already-pooled anchor:
      // the sweep at the bottom of this method drops every id it did not see,
      // so a bar that was on screen when the hero faded really goes away.
      if (
        es.kind === KIND_CHAMPION &&
        !stealthVisualFor((es.flags & ENTITY_FLAG.INVISIBLE) !== 0, isFriendlyEntity(es.seatId)).healthBar
      )
        return;
      // ⭐ GH#324 視野遮蔽的**另一半**：牆後的敵人身體不畫，那條血條就不可以留著。
      // 理由與上面那一段隱形的逐字相同 —— 一條浮在牆後、底下沒有身體的血條是一份
      // 完美的位置讀數，也就是遮蔽這條機制本來要藏的那個東西。⛔ 繪製距離剔除
      // **不**走這條（那是畫質設定，遠處的血條照樣要看得到）。
      // 跟隱形那一條一樣寫在 `seen.add` **之前**：已經在畫的錨點會被下面的掃描
      // 真的刪掉，而不是凍在原地。
      if (es.kind === KIND_CHAMPION && d.views.isOccluded(es.id)) return;
      // L3 ZONE CULL —— 別區的血條沒有任何消費者：`WorldAnchorLayer` 只畫
      // 螢幕內的錨點，而 #67 的小地圖本來就只畫一個 zone。省掉的是每個實體
      // 每幀一次的 `project()` 3D→2D 投影 + 一個 DOM 節點的更新。
      if (!d.visibleZones.has(es.zone)) return;
      const isNeutral = es.kind === KIND_FLOWER || es.kind === KIND_GUARDIAN;
      const pos = d.views.posOf(es.id) ?? { x: es.x, z: es.z };
      // ⭐ 出口的閘（owner 2026-08-19）。⚠️ 寫在 `seen.add` **之前**：已經在畫的
      // 錨點要被下面的掃描真的**刪掉**，⛔ 不是凍在最後那個界外座標上 ——
      // 凍住正是 owner 看到的那個畫面。同 `stealthVisualFor` 那一條的擺法。
      if (!anchorDrawable(frameBus.arenaZones, pos.x, pos.z, `bar #${es.id}`)) return;
      seen.add(es.id);
      let anchor = frameBus.champions.get(es.id);
      if (!anchor) {
        anchor = {
          entityId: es.id,
          kind: es.kind,
          name: isNeutral ? "" : (nameBySeat.get(es.seatId) ?? `#${es.id}`),
          teamId: isNeutral ? -1 : (d.teamBySeat.get(es.seatId) ?? 0),
          championId: "",
          isLocal: es.id === d.predictedEntityId,
          alive: es.alive,
          hpPct: 1,
          shieldPct: 0,
          manaPct: 1,
          worldX: pos.x,
          worldZ: pos.z,
          pose: { sx: 0, sy: 0, visible: false },
          cast: null,
        };
        frameBus.champions.set(es.id, anchor);
      }
      anchor.alive = es.alive;
      anchor.kind = es.kind; // pooled anchors outlive an entity id; keep it honest
      // ⭐ GH#728 —— 顏色跟著 `kind` 一起刷新，⛔ 不是只在建立時指派一次。
      // 同一顆 pooled anchor 的 id 被回收給另一種 kind 時（上一行的註解講的正是
      // 這件事），只更新 kind 而讓 color 凍在建立那一刻 = 治療花的綠色留在守護塔
      // 頭上。⛔ champion 這一支回 `undefined`（`anchorColorFor`），所以英雄血條
      // 逐位元不變 —— 消費端是 `anchor.color ?? teamCss(anchor.teamId)`。
      anchor.color = anchorColorFor(es.kind);
      // picks land after the anchor is created (and change between rounds), so
      // the champion id is refreshed rather than frozen at spawn
      anchor.championId = isNeutral ? "" : (champBySeat.get(es.seatId) ?? "");
      anchor.hpPct = es.maxHp > 0 ? es.hp / es.maxHp : 0;
      anchor.shieldPct = es.maxHp > 0 ? es.shield / es.maxHp : 0;
      anchor.manaPct = es.maxMana > 0 ? es.mana / es.maxMana : 0;
      anchor.worldX = pos.x;
      anchor.worldZ = pos.z;
      anchor.pose = project(pos.x, anchorHeightFor(es.kind), pos.z);
      // over-head cast bar (hidden while dead)
      const cp = es.alive ? d.casts.progressFor(es.id, nowMs) : null;
      anchor.cast = cp ? { fraction: cp.fraction, kind: cp.kind } : null;
    });

    // ---- 殭屍王 minimap marker (task #262) ---------------------------------
    // The king is a KIND_MOB, so the `hasOverheadBar` cull above skipped it with
    // the other 50 zombies — correct for the rank and file, wrong for the one
    // entity the 戰場任務 is about. It gets its own bus slot (frameBus.mobBoss);
    // ui/hud/minimapBossMarker turns it into the map ping the source map's
    // war3map.j:11824 `PingMinimapLocForForce` did.
    //
    // WHICH entity is the king comes from `mobBossSpawn` — the wire has no boss
    // bit. Rebuilt from scratch every frame, so a king that died (no live entity
    // with that id) clears itself with no death handler.
    //
    // ⛔ GH#268 —— 這裡以前讀的是 `hud.mobBoss`（「最後一則王的消息」），也就是一顆
    // **一場只有一個槽**的欄位；而自 #288 起每一隻特殊殭屍死掉也發 `mobBossSlain`,
    // 所以任何一區任何一隻精英一死就把 bossId 打成 -1,本區那隻**滿血的王**的長
    // 血條當場消失（owner 回報兩次）。現在讀的是 `hud.mobBossLive`（「現在場上有沒有
    // 王」），它只被同一顆 bossId 的結算清掉。決策本身在 `mobBossMarkerFor` ——
    // `GameApp` headless 起不來,寫在這裡的判斷沒有任何行為測試搆得到。
    frameBus.mobBoss = mobBossMarkerFor(
      hud.mobBossLive,
      (bossId) => {
        const row = state.entities.get(String(bossId));
        return {
          row,
          world: row ? (d.views.posOf(row.id) ?? { x: row.x, z: row.z }) : { x: 0, z: 0 },
        };
      },
      localDuelZone(hud),
    );

    // ---- revive circles (task #84) -----------------------------------------
    // Their own frameBus list, NOT champion anchors: they carry no HP bar and
    // no name, and nothing that walks `frameBus.champions` should ever see one.
    // The minimap and the spectating owner's HUD banner both read from here.
    const circles = frameBus.reviveCircles;
    circles.length = 0;
    state.entities.forEach((es) => {
      if (es.kind !== KIND_REVIVE_CIRCLE) return;
      // L3 ZONE CULL —— 兩個消費者(小地圖 #67、ReviveBanner)都只看得到本區的
      // 圈圈；自己那一區永遠在可見集合裡，所以自己的復活圈不受影響。
      if (!d.visibleZones.has(es.zone)) return;
      const pos = d.views.posOf(es.id) ?? { x: es.x, z: es.z };
      circles.push({
        entityId: es.id,
        ownerSeatId: es.seatId,
        teamId: d.teamBySeat.get(es.seatId) ?? -1,
        zone: es.zone,
        worldX: pos.x,
        worldZ: pos.z,
        radius: es.shield > 0 ? es.shield : 2,
        progress: es.maxHp > 0 ? Math.min(1, es.hp / es.maxHp) : 0,
        channelling: (es.flags & ENTITY_FLAG.CHANNELLING) !== 0,
        contested: (es.flags & ENTITY_FLAG.CONTESTED) !== 0,
      });
    });

    // local player's ability-icon fill overlay (imperative, off React state)
    const localId = hud.localEntityId;
    const lc = localId !== null ? d.casts.progressFor(localId, nowMs) : null;
    frameBus.localCast = lc ? { slot: lc.slot, fraction: lc.fraction, kind: lc.kind } : null;
    for (const id of [...frameBus.champions.keys()]) {
      if (!seen.has(id)) frameBus.champions.delete(id);
    }
    // Each category projects from its OWN world height (see ui/combatText):
    // damage over the chest, heals lower, mana lower still. They must clear the
    // health-bar block at y = 2.45 — a number that covers the HP readout is
    // worse than no number — and the split heights are also what keeps 補血 and
    // 補魔 apart when a flower burst fires both on the same body in one tick.
    for (const e of frameBus.combatText) {
      if (!e.active) continue;
      // ⭐ 出口的閘（owner 2026-08-19）—— 飄字與血條同一條規則。⛔ 不夾回界內：
      // `pose.visible = false` 就是「不畫」，而 `WorldAnchorLayer` 已經在讀它。
      if (!anchorDrawable(frameBus.arenaZones, e.worldX, e.worldZ, "combat text")) {
        e.pose = { sx: 0, sy: 0, visible: false };
        continue;
      }
      e.pose = project(e.worldX, e.anchorY, e.worldZ);
    }
}

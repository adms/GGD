/**
 * HUD → network action seam. GameApp registers the real implementations
 * (IntentSender / RoomConnection); React components only import this module,
 * keeping the DOM HUD decoupled from net/render internals.
 */
import type { Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { Cheat } from "@ggd/shared/protocol/messages";
import { loadChampionNames, playChampionNameVo } from "../audio/nameVoice";

export interface HudActions {
  sendCommand(cmd: Command): void;
  selectChampion(championId: string): void;
  /** dev-only offline cheat (server hard-gates to dev mode) */
  sendCheat(cheat: Cheat): void;
  /**
   * Look at a world point without moving the champion (minimap left-click).
   * Camera-only: it never touches the order path.
   */
  focusWorld(point: Vec2): void;
  /**
   * Issue an order at a world point (minimap right-click). Routed through the
   * SAME IntentSender.setOrder seam as an in-world right-click, so the minimap
   * cannot invent a second, divergent order path.
   */
  sendOrder(order: Order): void;
  /**
   * Stop DRAWING the arena (task #38). The intermission is its own Babylon
   * scene on its own canvas laid over the arena's; while it is up the arena is
   * invisible, so painting it costs a second full GPU frame for nothing. The
   * sim, network and view sync keep running — only the draw is skipped — so
   * coming back is seamless.
   */
  setArenaRenderSuppressed(suppressed: boolean): void;
  /**
   * The LOCAL champion's resolved model (glb path + normalising scale + model
   * key), so the intermission market can stand the player's OWN hero at the
   * merchant's counter. Resolved through the same seam the arena view uses, so
   * an equipped skin applies here too. Null before champ-select confirms.
   */
  localChampionModel(): { glbPath: string; scale: number; modelKey: string } | null;
}

let impl: HudActions | null = null;

export function registerHudActions(actions: HudActions | null): void {
  impl = actions;
  // Warm the champion-name VO manifest at boot so the FIRST confirm doesn't pay
  // the fetch (cached + single-flight + 404-tolerant). Browser only: in the
  // node test env a relative URL has no origin to resolve against.
  if (actions && typeof window !== "undefined") {
    void loadChampionNames().catch(() => {
      /* pack not generated — the call-out degrades to silence */
    });
  }
}

export const hudActions: HudActions = {
  sendCommand: (cmd) => impl?.sendCommand(cmd),
  /**
   * Champ-select CONFIRM. This is the single place a pick becomes an ACTION —
   * every UI entry point (roster row, 隨機英雄, couch seats) funnels here, and
   * both the online and offline flows continue into the same
   * `RoomConnection.sendSelectChampion` — so the Japanese full-name call-out
   * (task #35) is fired here, once, additively. The VO is fire-and-forget and
   * self-gating (unlock / mute / ~1 s double-fire guard); it can never delay or
   * fail the room message, which is sent FIRST.
   */
  selectChampion: (championId) => {
    impl?.selectChampion(championId);
    void playChampionNameVo(championId).catch(() => {
      /* the call-out is pure flavor — never surface it as an unhandled rejection */
    });
  },
  sendCheat: (cheat) => impl?.sendCheat(cheat),
  focusWorld: (point) => impl?.focusWorld(point),
  sendOrder: (order) => impl?.sendOrder(order),
  setArenaRenderSuppressed: (suppressed) => impl?.setArenaRenderSuppressed(suppressed),
  localChampionModel: () => impl?.localChampionModel() ?? null,
};

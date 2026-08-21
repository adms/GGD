/**
 * GH#504 — every modal RENDERS a `data-pad-scope`, read off the markup.
 *
 * ⛔ NOT `grep "data-pad-scope"` over the sources — that is 第二守則 failure
 * shape ⑥ (掃原始碼字串代替行為) and it is worthless here for two reasons:
 * the attribute could sit on a branch that never renders, and `Btn` does NOT
 * forward unknown props, so a `data-pad-back` written on a `<Btn>` is dropped
 * silently while the grep stays green. So each modal is really rendered
 * (`react-dom/server`; this package's vitest is `environment: "node"`) and the
 * assertion reads the FINAL markup.
 *
 * Mutation (run 2026-08-22, M1): delete `{...padModalScope("rally-confirm")}`
 * from RallyConfirmDialog → this file goes red naming rally-confirm.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PAD_MODAL_SCOPES, type PadModalScopeName } from "./padModalScope";
import { ChangePasswordDialog } from "./platform/ChangePasswordDialog";
import { LobbyAnnouncementCard } from "./platform/LobbyAnnouncement";
import { CreditsPage } from "./platform/CreditsRoute";
import { DeviceLoginPanel } from "./platform/DeviceLoginPanel";
import { ChampionPicker } from "./platform/LeaderboardPanel";
import { RallyConfirmDialog } from "./platform/RallyConfirmDialog";
import { LinkRoute, LINK_PATH } from "./platform/LinkRoute";
import { RulesBriefing } from "./panels/champselect/RulesBriefing";
import { LeaveSettlementOverlay } from "./panels/LeaveSettlementOverlay";
import { MatchEndPanel } from "./panels/MatchEndPanel";
import { appStore } from "./platform/store";
import { hudStore } from "../net/RoomStore";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";

const noop = (): void => {};

/** `LinkRoute` reads `window.location`; node has none. Stub it for one render. */
function withLinkUrl(render: () => string): string {
  const g = globalThis as { window?: unknown };
  g.window = { location: { pathname: LINK_PATH, search: "?code=WXYZ" }, addEventListener: noop, removeEventListener: noop };
  try {
    return render();
  } finally {
    delete g.window;
  }
}

/** One render per scope, or a REFUTABLE reason why it cannot be rendered here. */
const RENDER: Record<PadModalScopeName, (() => string) | { skip: string }> = {
  "change-password": () => renderToStaticMarkup(createElement(ChangePasswordDialog, { onClose: noop })),
  announcement: () =>
    renderToStaticMarkup(
      createElement(LobbyAnnouncementCard, {
        announcement: { id: "a1", title: "t", body: "b", createdAt: "2026-08-22T00:00:00Z" },
        onDismiss: noop,
      }),
    ),
  credits: () => renderToStaticMarkup(createElement(CreditsPage, { onClose: noop })),
  "device-login": () => renderToStaticMarkup(createElement(DeviceLoginPanel, { onClose: noop })),
  "champion-picker": () =>
    renderToStaticMarkup(createElement(ChampionPicker, { options: [], onPick: noop, onClose: noop })),
  briefing: () => renderToStaticMarkup(createElement(RulesBriefing, { onDismiss: noop })),
  "device-link": () => withLinkUrl(() => renderToStaticMarkup(createElement(LinkRoute))),
  "match-end": () => {
    // ⚠️ `if (!hasPayload) return <TeamPlacementFallback />` — 沒有 settlement
    // 就根本畫不到那張卡，所以這裡要餵一份**真的**結算 payload。
    hudStore.setState({
      localSeatId: 0,
      settlement: {
        matchId: "m", winnerTeam: 0,
        perPlayer: [{ seatId: 0, accountId: "a", champ: "godie-ogrh", teamId: 0, role: "fighter", grade: "A", rank: 1, stats: createMatchStats() }],
      },
    });
    return renderToStaticMarkup(createElement(MatchEndPanel));
  },
  "rally-confirm": () => {
    appStore.setState((s) => ({
      room: null,
      ws: {
        ...s.ws,
        invites: [
          { type: "invite" as const, roomId: "r", roomName: "R", from: "f", token: "tok", broadcast: true, expiresAt: Date.now() + 60_000, waitSec: 10 },
        ],
      },
    }));
    return renderToStaticMarkup(createElement(RallyConfirmDialog));
  },
  "leave-settlement": () => {
    appStore.setState({ leaveGate: true });
    return renderToStaticMarkup(createElement(LeaveSettlementOverlay));
  },
  // ⚠️ 這兩格 SSR 渲染不出來，理由**可以被反駁**（改掉了就把它搬上去）：
  shop: { skip: "MerchantShop 只在 gate 通過且卡片展開時才畫，需要一個活的 seat + whitelist + intel SimWorld" },
  "champ-select": { skip: "ChampSelectPanel 會拉進 Babylon 預覽舞台（championProfile → 3D stage），node 環境載不動" },
};

describe("GH#504 — modal 宣告 data-pad-scope（讀渲染出來的 DOM）", () => {
  it("每一個可渲染的 modal 都畫出了它在梯子上的那一格", () => {
    const missing: string[] = [];
    for (const name of Object.keys(PAD_MODAL_SCOPES) as PadModalScopeName[]) {
      const entry = RENDER[name];
      if (typeof entry !== "function") continue;
      const html = entry();
      const want = `data-pad-scope="${name}"`;
      const wantP = `data-pad-scope-priority="${PAD_MODAL_SCOPES[name]}"`;
      if (!html.includes(want) || !html.includes(wantP)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it("梯子上每一格都有一個 render 或一個能被反駁的理由（⛔ 不准無聲漂移）", () => {
    for (const name of Object.keys(PAD_MODAL_SCOPES) as PadModalScopeName[]) {
      const entry = RENDER[name];
      if (typeof entry !== "function") expect(entry.skip.length).toBeGreaterThan(20);
    }
  });

  it("有取消／關閉的 modal 把 B 做成契約（data-pad-back），⛔ 不是標籤啟發式", () => {
    // ⛔ match-end / champ-select 不在這裡：它們沒有「退一層」可退。
    const withBack: PadModalScopeName[] = ["change-password", "announcement", "credits", "device-login", "champion-picker", "briefing", "device-link", "rally-confirm", "leave-settlement"];
    const missing = withBack.filter((n) => {
      const entry = RENDER[n];
      return typeof entry === "function" && !entry().includes("data-pad-back");
    });
    expect(missing).toEqual([]);
  });
});

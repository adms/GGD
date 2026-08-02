/**
 * GH#257 —— 出貨呼叫端的守衛:hudStore → `planRoundWinnerShow` → 真的舞台。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這一支非有不可(稽核實測)
 * ═══════════════════════════════════════════════════════════════════════════
 * `roundPodium.test.ts` 已經證明**零件**是對的:選擇器排得出存活順序,舞台掛得上
 * 三頂冠。但零件對了不代表玩家拿得到 —— 稽核把 `GameApp.updateRoundWinner` 裡整段
 * podium 用法拿掉(讓 podium 恆為 `[]`,直接退回舊的 `roundWinnerTeamChampions`),
 * **1292 條 client 測試全綠**。畫面上照樣有三個模型、照樣有金銀銅,只是順序悄悄
 * 變回擊殺數排序 —— 失敗形態 ③(刪掉還是全綠)加 ⑤(被測的不是出貨的那個)。
 *
 * 所以這一支測的是**出貨呼叫端自己**:`GameApp.updateRoundWinner` 唯一做的事就是
 * 把 `hudStore` 交給 `planRoundWinnerShow`,再把回傳值交給 `RoundWinnerStage`。
 * 這裡把同樣兩步跑一遍,斷言**舞台真的收到**的東西 —— 每一個 preview 拿到哪個
 * championId、每一頂冠是什麼階級 —— 不是掃 `GameApp.ts` 有沒有出現某個字串。
 *
 * ⚠️ 這裡的資料刻意做成「存活順序和擊殺數順序完全相反」:任何退回舊排序的實作
 * 都會把三張卡的順序整個倒過來,而不是「剛好也對」。
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { ModelDoc } from "@ggd/shared/content";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, type SeatView, type TeamView } from "../net/RoomStore";
import { RoundWinnerStage, planRoundWinnerShow, type WinnerPreview } from "./RoundWinnerStage";
import { roundEndQuoteChampion } from "../ui/panels/settlementModel";

const DOC = { modelKey: "champ.test", url: "/x.glb" } as unknown as ModelDoc;

function seat(o: Partial<SeatView> & { seatId: number; championId: string }): SeatView {
  return {
    teamId: 0,
    displayName: `p${o.seatId}`,
    connected: true,
    driver: "human",
    entityId: 100 + o.seatId,
    level: 1,
    gold: 0,
    xp: 0,
    hp: 0,
    maxHp: 100,
    mana: 0,
    maxMana: 0,
    shield: 0,
    alive: false,
    roundDeathTick: 0,
    zone: 0,
    formIndex: 0,
    ready: true,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [],
    cooldowns: [],
    roundKills: 0,
    roundDeaths: 1,
    mobKills: 0,
    ...o,
  } as unknown as SeatView;
}
function team(teamId: number, roundOutcome: number, lives = 3): TeamView {
  return { teamId, lives, eliminated: false, placement: 0, roundOutcome };
}

/** 勝方 team 0 的存活順序 = c-late > c-mid > c-early;擊殺數**剛好相反**。 */
const SEATS: SeatView[] = [
  seat({ seatId: 0, teamId: 0, championId: "c-early", roundDeathTick: 100, roundKills: 9 }),
  seat({ seatId: 1, teamId: 0, championId: "c-mid", roundDeathTick: 500, roundKills: 4 }),
  seat({ seatId: 2, teamId: 0, championId: "c-late", roundDeathTick: 900, roundKills: 0 }),
  seat({ seatId: 3, teamId: 1, championId: "e-a", roundDeathTick: 40 }),
  seat({ seatId: 4, teamId: 1, championId: "e-b", roundDeathTick: 60 }),
];
const TEAMS: TeamView[] = [team(0, ROUND_OUTCOME.WON), team(1, ROUND_OUTCOME.LOST, 1)];

// ── headless doubles (同 roundPodium.test.ts 的形狀) ─────────────────────────
class FakePreview implements WinnerPreview {
  shown: string[] = [];
  show(_doc: ModelDoc, opts?: { championId?: string | null }): void {
    this.shown.push(opts?.championId ?? "");
  }
  dispose(): void {}
}
interface FakeEl {
  attrs: Record<string, string>;
  innerHTML: string;
}
function harness() {
  const elements: FakeEl[] = [];
  const previews: FakePreview[] = [];
  const make = (): HTMLElement => {
    const rec: FakeEl = { attrs: {}, innerHTML: "" };
    elements.push(rec);
    return {
      style: {} as CSSStyleDeclaration,
      textContent: "",
      get innerHTML() {
        return rec.innerHTML;
      },
      set innerHTML(v: string) {
        rec.innerHTML = v;
      },
      setAttribute: (k: string, v: string) => {
        rec.attrs[k] = v;
      },
      getAttribute: (k: string) => rec.attrs[k] ?? null,
      remove: () => undefined,
    } as unknown as HTMLElement;
  };
  const stage = new RoundWinnerStage({
    host: { appendChild: () => undefined } as unknown as HTMLElement,
    createCanvas: () => make() as unknown as HTMLCanvasElement,
    createElement: () => make(),
    createPreview: () => {
      const p = new FakePreview();
      previews.push(p);
      return p;
    },
    taunt: null, // no VO in the node env
  });
  return { stage, previews };
}

/** `GameApp.updateRoundWinner` 的兩步,原封不動。 */
function present(docFor: (id: string) => ModelDoc | null = () => DOC) {
  const h = harness();
  const hud = hudStore.getState();
  const plan = planRoundWinnerShow(hud.seats, hud.teams, hud.round, docFor);
  if (plan) h.stage.showTeam(plan.members, plan.ctx);
  return { ...h, plan };
}

beforeEach(() => {
  resetHudStore();
  hudStore.setState({ seats: SEATS, teams: TEAMS, round: 4 });
});

describe("回合勝利頒獎台真的從 hudStore 走到舞台上 (round-podium-wiring)", () => {
  it("舞台收到的三個模型,順序是存活順序 —— 不是擊殺數順序", () => {
    const { stage, previews } = present();
    expect(stage.memberCount).toBe(3);
    // 每一個 preview 收到的 championId(左→右)。退回舊排序會變成完全相反的
    // ["c-early", "c-mid", "c-late"]。
    expect(previews.map((p) => p.shown[0])).toEqual(["c-late", "c-mid", "c-early"]);
  });

  it("三頂冠是金/銀/銅,而且掛在存活順序那三張卡上", () => {
    const { stage } = present();
    expect(stage.medals).toEqual(["gold", "silver", "bronze"]);
  });

  it("模型載不到的那一位被丟掉,剩下兩位的名次不會被偷偷升級", () => {
    // 銀牌那位的 doc 還沒載好 → 卡片少一張,但銅牌不會頂上銀冠。
    const { stage, previews } = present((id) => (id === "c-mid" ? null : DOC));
    expect(previews.map((p) => p.shown[0])).toEqual(["c-late", "c-early"]);
    expect(stage.medals).toEqual(["gold", "bronze"]);
  });

  it("嘲諷的 key 仍然是回合 MVP,不是金冠那位(#93 的笑話不能被靜默換掉)", () => {
    const { plan } = present();
    const mvp = roundEndQuoteChampion(SEATS, TEAMS);
    // 這一組資料裡 MVP(擊殺數最高的 c-early)刻意**不是**金冠(c-late)。
    expect(mvp).toBe("c-early");
    expect(plan!.members[0]!.championId).toBe("c-late");
    expect(plan!.ctx.championId).toBe(mvp);
    expect(plan!.ctx.round).toBe(4);
  });

  it("決勝回合這一拍不演 —— 那是全場結算特寫的(#93/#25)", () => {
    // 只剩一隊沒被淘汰 → roundEndQuoteChampion 回 null → 整個 plan 是 null。
    hudStore.setState({
      teams: [team(0, ROUND_OUTCOME.WON), { ...team(1, ROUND_OUTCOME.LOST, 0), eliminated: true }],
    });
    const { stage, plan } = present();
    expect(plan).toBeNull();
    expect(stage.memberCount).toBe(0);
  });

  it("拿不到 roundDeathTick 的舊快照退回「照擊殺數」,不是退回空舞台", () => {
    // 一台 pre-#257 的伺服器:每個座位都沒有那一格 → 全員平手 → 照擊殺數排。
    hudStore.setState({ seats: SEATS.map((s) => ({ ...s, roundDeathTick: 0 })) });
    const { stage, previews } = present();
    expect(stage.memberCount).toBe(3);
    expect(previews.map((p) => p.shown[0])).toEqual(["c-early", "c-mid", "c-late"]);
  });
});

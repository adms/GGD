/**
 * roundPodium — GH#257 的客戶端守衛:存活順序 → 三張卡 → 金/銀/銅皇冠。
 *
 * 三段各自可以獨立壞掉,所以三段都驗,而且**都用出貨的那一支**:
 *   1. 選擇器 `roundVictoryPodium` 真的照存活順序排(不是照擊殺數)。
 *   2. 舞台 `RoundWinnerStage` 真的把皇冠掛上去 —— 用注入的 headless 假件把
 *      真的 `showTeam()` 跑一遍,而不是掃原始碼字串(失敗形態 ⑥)。
 *   3. 三個階的顏色**在最終的 SVG 標記裡**兩兩不同(失敗形態 ⑦:掃屬性不算,
 *      「三個階解析出三個 medal 字串」是屬性;「畫出來的三頂冠顏色不一樣」才是行為)。
 *
 * ⚠️ 這裡的 `roundDeathTick` 不是憑空捏的名次陣列:它就是伺服器投影出來的那一格
 * (`SeatState.roundDeathTick`),而「真的死亡事件會不會變成那一格」由
 * `apps/game-server/src/match/roundSurvival.test.ts` 開一個真的 MatchController 驗。
 * 兩支合起來把整條鏈蓋滿,任何一段斷掉都有一支會紅。
 */
import { describe, expect, it } from "vitest";
import type { ModelDoc } from "@ggd/shared/content";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";
import { RoundWinnerStage, type WinnerPreview } from "./RoundWinnerStage";
import { CROWN_PALETTE, crownSvg, medalForPlace } from "./victoryCrown";
import { roundVictoryPodium, type PodiumSeatView } from "../ui/panels/victoryPodium";

const DOC = { modelKey: "champ.test", url: "/x.glb" } as unknown as ModelDoc;

function seat(o: Partial<PodiumSeatView> & { seatId: number }): PodiumSeatView {
  return {
    teamId: 0,
    championId: `champ-${o.seatId}`,
    alive: false,
    roundKills: 0,
    roundDeaths: 0,
    roundDeathTick: 0,
    ...o,
  } as PodiumSeatView;
}
function team(teamId: number, outcome: number, lives = 3) {
  return { teamId, roundOutcome: outcome, lives, eliminated: false, placement: 0 };
}

// ── headless doubles ─────────────────────────────────────────────────────────
class FakePreview implements WinnerPreview {
  shown: string[] = [];
  show(_doc: ModelDoc, opts?: { championId?: string | null }): void {
    this.shown.push(opts?.championId ?? "");
  }
  dispose(): void {}
}

interface FakeEl {
  tag: string;
  attrs: Record<string, string>;
  innerHTML: string;
  removed: boolean;
}

function harness() {
  const elements: FakeEl[] = [];
  const previews: FakePreview[] = [];
  const make = (tag: string): HTMLElement => {
    const rec: FakeEl = { tag, attrs: {}, innerHTML: "", removed: false };
    elements.push(rec);
    const el = {
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
      remove: () => {
        rec.removed = true;
      },
    };
    return el as unknown as HTMLElement;
  };
  const stage = new RoundWinnerStage({
    host: { appendChild: () => undefined } as unknown as HTMLElement,
    createCanvas: () => make("canvas") as unknown as HTMLCanvasElement,
    createElement: (tag) => make(tag),
    createPreview: () => {
      const p = new FakePreview();
      previews.push(p);
      return p;
    },
    taunt: null, // no VO in the node env
  });
  return { stage, elements, previews };
}

/** 舞台建出來的皇冠節點(依建立順序 = 由左到右)。 */
function crownEls(elements: FakeEl[]): FakeEl[] {
  return elements.filter((e) => "data-medal" in e.attrs);
}

// ─────────────────────────────────────────────────── 1. 選擇器排的是存活順序 ──
describe("頒獎台照存活順序排,不是照擊殺數", () => {
  // 勝方 team 0:seat 2 活到最後、seat 1 在 t=900 倒、seat 0 在 t=300 倒。
  // 擊殺數故意反著給 —— 如果實作偷偷沿用了 MVP 排序,順序就會整個反過來。
  const seats: PodiumSeatView[] = [
    seat({ seatId: 0, teamId: 0, roundDeathTick: 300, roundKills: 9 }),
    seat({ seatId: 1, teamId: 0, roundDeathTick: 900, roundKills: 5 }),
    seat({ seatId: 2, teamId: 0, alive: true, roundKills: 0 }),
    seat({ seatId: 3, teamId: 1, roundDeathTick: 100 }),
    seat({ seatId: 4, teamId: 1, roundDeathTick: 120 }),
    seat({ seatId: 5, teamId: 1, roundDeathTick: 140 }),
  ];
  const teams = [team(0, ROUND_OUTCOME.WON), team(1, ROUND_OUTCOME.LOST, 1)];

  it("最後活下來的三位,依序拿金銀銅", () => {
    const podium = roundVictoryPodium(seats, teams);
    expect(podium.map((p) => p.seatId)).toEqual([2, 1, 0]);
    expect(podium.map((p) => p.place)).toEqual([1, 2, 3]);
    expect(podium.map((p) => p.medal)).toEqual(["gold", "silver", "bronze"]);
  });

  it("owner 說三位,所以就是三位 —— 而且是一個欄位不是一個常數", () => {
    expect(DEFAULT_VICTORY_PODIUM.podiumSize).toBe(3);
    expect(roundVictoryPodium(seats, teams)).toHaveLength(3);
    // 欄位真的被讀:調成 2 就只剩兩位(而不是「有一個欄位存在」這種形態④斷言)
    const two = roundVictoryPodium(seats, teams, { ...DEFAULT_VICTORY_PODIUM, podiumSize: 2 });
    expect(two.map((p) => p.medal)).toEqual(["gold", "silver"]);
  });

  it("輪空的隊伍拿不到頒獎台(#173 的那一格)", () => {
    const byeSeats = seats.map((s) => (s.teamId === 0 ? { ...s, alive: false } : s));
    const byeTeams = [team(0, ROUND_OUTCOME.NONE), team(1, ROUND_OUTCOME.WON)];
    const podium = roundVictoryPodium(byeSeats, byeTeams);
    // 勝方是 team 1,輪空的 team 0 一個都不上台
    expect(podium.every((p) => p.teamId === 1)).toBe(true);
  });

  it("人數不足時 shrink(預設)只站得出來的那幾個,opponents 才補敗方", () => {
    const short: PodiumSeatView[] = [
      seat({ seatId: 0, teamId: 0, alive: true }),
      seat({ seatId: 3, teamId: 1, roundDeathTick: 100 }),
      seat({ seatId: 4, teamId: 1, roundDeathTick: 200 }),
    ];
    expect(roundVictoryPodium(short, teams)).toHaveLength(1);
    const filled = roundVictoryPodium(short, teams, {
      ...DEFAULT_VICTORY_PODIUM,
      podiumFill: "opponents",
    });
    expect(filled.map((p) => p.seatId)).toEqual([0, 4, 3]);
    expect(filled.map((p) => p.filler)).toEqual([false, true, true]);
  });
});

// ─────────────────────────────────────────────── 2. 舞台真的把皇冠掛上去 ──
describe("RoundWinnerStage 真的畫出三頂皇冠", () => {
  const seats: PodiumSeatView[] = [
    seat({ seatId: 0, teamId: 0, roundDeathTick: 300 }),
    seat({ seatId: 1, teamId: 0, roundDeathTick: 900 }),
    seat({ seatId: 2, teamId: 0, alive: true }),
    seat({ seatId: 3, teamId: 1, roundDeathTick: 100 }),
  ];
  const teams = [team(0, ROUND_OUTCOME.WON), team(1, ROUND_OUTCOME.LOST, 1)];

  function showPodium() {
    const h = harness();
    const podium = roundVictoryPodium(seats, teams);
    h.stage.showTeam(
      podium.map((p) => ({ doc: DOC, championId: p.championId, place: p.place, medal: p.medal })),
      { championId: podium[0]!.championId, round: 3 },
    );
    return { ...h, podium };
  }

  it("三張卡、三頂冠,而且冠的順序就是名次順序", () => {
    const { stage, elements, previews, podium } = showPodium();
    expect(stage.memberCount).toBe(3);
    // 模型真的被交給三個獨立的 previewer,順序 = 存活順序
    expect(previews.map((p) => p.shown[0])).toEqual(podium.map((p) => p.championId));
    const crowns = crownEls(elements);
    expect(crowns).toHaveLength(3);
    expect(crowns.map((c) => c.attrs["data-medal"])).toEqual(["gold", "silver", "bronze"]);
    expect(crowns.map((c) => c.attrs["data-place"])).toEqual(["1", "2", "3"]);
    expect(stage.medals).toEqual(["gold", "silver", "bronze"]);
  });

  it("每一頂冠都真的有 SVG 內容,而且三個階的顏色兩兩不同", () => {
    const { elements } = showPodium();
    const crowns = crownEls(elements);
    for (const c of crowns) {
      expect(c.innerHTML).toContain("<svg");
      expect(c.innerHTML).toContain("<path");
    }
    // 行為,不是屬性:三段標記裡真的出現三個不同的主色
    const fills = crowns.map((c) => c.innerHTML);
    expect(fills[0]).toContain(CROWN_PALETTE.gold.body);
    expect(fills[1]).toContain(CROWN_PALETTE.silver.body);
    expect(fills[2]).toContain(CROWN_PALETTE.bronze.body);
    expect(new Set([fills[0], fills[1], fills[2]]).size).toBe(3);
  });

  it("皇冠有名字可以念(手把/讀螢幕的人拿得到名次)", () => {
    const { elements } = showPodium();
    const crowns = crownEls(elements);
    expect(crowns[0]!.attrs["aria-label"]).toContain("黃金");
    expect(crowns[1]!.attrs["aria-label"]).toContain("白銀");
    expect(crowns[2]!.attrs["aria-label"]).toContain("黃銅");
  });

  it("下一回合只有兩個人上台時,第三頂冠被清掉而不是留在畫面上", () => {
    const h = harness();
    h.stage.showTeam(
      [1, 2, 3].map((place) => ({ doc: DOC, championId: `c${place}`, place, medal: medalForPlace(place) })),
      { championId: "c1", round: 1 },
    );
    expect(h.stage.medals).toEqual(["gold", "silver", "bronze"]);
    // 同樣三張卡(所以圖層被重用),但這一回合只有第一名有冠
    h.stage.showTeam(
      [
        { doc: DOC, championId: "c1", place: 1, medal: medalForPlace(1) },
        { doc: DOC, championId: "c2" },
        { doc: DOC, championId: "c3" },
      ],
      { championId: "c1", round: 2 },
    );
    expect(h.stage.medals).toEqual(["gold", "", ""]);
  });

  it("clear() 把皇冠一起拆掉(不會有一頂冠飄在商店畫面上)", () => {
    const { stage, elements } = showPodium();
    stage.clear();
    for (const c of crownEls(elements)) expect(c.removed).toBe(true);
    expect(stage.medals).toEqual([]);
  });

  it("沒有名次的舊呼叫端(單一勝利者)完全不長冠", () => {
    const h = harness();
    h.stage.show(DOC, { championId: "solo", round: 1 });
    expect(h.stage.memberCount).toBe(1);
    expect(h.stage.medals).toEqual([""]);
  });
});

// ───────────────────────────────────────────────────────── 3. 皇冠本身 ──
describe("皇冠是程序生成的,不是 Blizzard 素材", () => {
  it("三頂冠共用同一個形狀,只有顏色不同", () => {
    const g = crownSvg("gold", 1);
    const s = crownSvg("silver", 2);
    // 同一條 path 幾何 —— 第二名的冠不會長得跟第一名不一樣
    const geom = /d="([^"]+)"/.exec(g)![1];
    expect(s).toContain(geom!);
    expect(g).not.toBe(s);
  });

  it("三個階的主色兩兩不同,而且不是同一個黃的三個亮度", () => {
    const bodies = [
      CROWN_PALETTE.gold.body,
      CROWN_PALETTE.silver.body,
      CROWN_PALETTE.bronze.body,
    ];
    expect(new Set(bodies).size).toBe(3);
    // 色相真的分開:銀的藍分量最高,銅的紅比綠高很多
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [gr, gg, gb] = rgb(CROWN_PALETTE.gold.body);
    const [, , sb] = rgb(CROWN_PALETTE.silver.body);
    const [br, bg] = rgb(CROWN_PALETTE.bronze.body);
    expect(gb!).toBeLessThan(gr!); // 金是暖的
    expect(gg!).toBeGreaterThan(gb!);
    expect(sb!).toBeGreaterThan(gb!); // 銀比金冷
    expect(br! - bg!).toBeGreaterThan(40); // 銅明顯偏紅
  });

  it("第四名以後沒有冠", () => {
    expect(medalForPlace(4)).toBeNull();
    expect(medalForPlace(0)).toBeNull();
  });
});

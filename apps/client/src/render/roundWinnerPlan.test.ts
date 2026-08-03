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
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { Configs } from "@ggd/shared/content/registries";
import {
  DEFAULT_VICTORY_PODIUM,
  zConfigVictoryPodiumDoc,
  type ConfigVictoryPodiumDoc,
} from "@ggd/shared/content/schema/victoryPodium";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import {
  hudStore,
  localDuelZone,
  resetHudStore,
  type SeatView,
  type TeamView,
} from "../net/RoomStore";
import {
  RoundWinnerStage,
  planRoundWinnerShow,
  victoryPodiumPolicy,
  type WinnerPreview,
} from "./RoundWinnerStage";
import { StorePreview } from "./StorePreview";
import type { AssetManager } from "./AssetManager";
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
  // GH#265:這一支的 fixture 只有一個 zone,而且刻意**不帶** duels —— 驗的是
  // 「權威來源缺席時仍然照舊演」的那條退路。逐區勝負本身的守衛在
  // `roundWinnerZone.test.ts`。
  const plan = planRoundWinnerShow(hud.seats, hud.teams, hud.round, docFor, {
    duels: hud.duels,
    zone: localDuelZone(hud),
  });
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

// ══════════════════════════════════════════════════════════════════════════
// content/config/victory-podium.json → 畫面。這一段之前是斷的。
// ══════════════════════════════════════════════════════════════════════════
/**
 * ⚠️ **這一份文件在 2026-08-03 之前是死的。** 它存在、進了版控、進了
 * `zConfigDoc` 的 union、被烘進 `bundle.json` —— 而 `resolveVictoryPodium` 是
 * **全 repo 零 production 呼叫端**,`planRoundWinnerShow` 的 `cfg` 預設值是寫死的
 * `DEFAULT_VICTORY_PODIUM` 常數。操作者把 `podiumSize` 改成 5、存檔、部署,
 * 場上照樣三個人(失敗形態 ②:算出來了但從沒送到)。
 *
 * 所以這一段餵的是**登錄表**(`Configs`)—— `ContentLoader` 在開機時把驗證過的
 * 文件放進去的那一個,也就是 game shard `/healthz` 的 `content` 區塊讀的那一份 ——
 * 然後跑**四個引數**的 `planRoundWinnerShow`,那正是
 * `GameApp.updateRoundWinner` 唯一的呼叫形狀。
 */
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const shippedPodiumDoc = (): ConfigVictoryPodiumDoc =>
  zConfigVictoryPodiumDoc.parse(
    JSON.parse(readFileSync(`${REPO}content/config/victory-podium.json`, "utf8")),
  );

describe("後台改得到頒獎台 (round-podium-config-wiring)", () => {
  afterEach(() => Configs.clear());

  it("★ 出貨的那一份 JSON 真的被讀進來(不是 code 裡的常數)", () => {
    Configs.register(shippedPodiumDoc() as never);
    expect(victoryPodiumPolicy()).toEqual(DEFAULT_VICTORY_PODIUM);
  });

  it("★ 改文件真的改畫面 —— podiumSize 3→2,舞台就少一個人", () => {
    Configs.register({ ...shippedPodiumDoc(), podiumSize: 2 } as never);
    const { stage, previews } = present();
    // GameApp 傳四個引數,cfg 走預設 —— 而預設現在是登錄表裡的那一份。
    expect(stage.memberCount).toBe(2);
    expect(previews.map((p) => p.shown[0])).toEqual(["c-late", "c-mid"]);
  });

  it("★ soloWinner:只留金冠一位", () => {
    Configs.register({ ...shippedPodiumDoc(), podiumLayout: "soloWinner" } as never);
    const { stage, previews, plan } = present();
    expect(stage.memberCount).toBe(1);
    expect(previews.map((p) => p.shown[0])).toEqual(["c-late"]);
    // 嘲諷仍然屬於回合 MVP,不會因為只演一個人就被換掉
    expect(plan!.ctx.championId).toBe("c-early");
  });

  it("★ 剪輯是欄位:金 celebrate / 銀銅 idle,而且改文件就換", () => {
    Configs.register(shippedPodiumDoc() as never);
    expect(present().plan!.members.map((m) => m.clip)).toEqual(["celebrate", "idle", "idle"]);
    Configs.clear();
    Configs.register({
      ...shippedPodiumDoc(),
      clipGold: "idle",
      clipSilver: "celebrate",
      clipBronze: "death",
    } as never);
    expect(present().plan!.members.map((m) => m.clip)).toEqual(["idle", "celebrate", "death"]);
  });

  it("登錄表是空的(內容還沒載 / 整份載失敗退骨架)→ 退回出貨預設,不是空頒獎台", () => {
    // 2026-08-01 的骨架事故走的就是這條路。這裡退回 0 個人的話,「內容全毀」
    // 會長得像「這一回合沒人贏」。
    expect(Configs.tryGet("victory-podium")).toBeUndefined();
    expect(victoryPodiumPolicy()).toEqual(DEFAULT_VICTORY_PODIUM);
    expect(present().stage.memberCount).toBe(3);
  });

  it("schema tag 不對的文件被當成缺席(不是被硬塞進去)", () => {
    Configs.register({ id: "victory-podium", schema: "config.something-else@1" } as never);
    expect(victoryPodiumPolicy()).toEqual(DEFAULT_VICTORY_PODIUM);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 剪輯真的走到 Babylon:政策 → 計畫 → 舞台 → 真的 StorePreview → 真的 AnimationGroup
// ══════════════════════════════════════════════════════════════════════════
/**
 * ⚠️ 上面那一段用的是**假的** previewer,所以它只證明「舞台交出了 celebrate」。
 * 而 v0.9.27 的缺陷在**再下一格**:`StorePreview.show` 裡的 `play("idle")` 是
 * 全檔唯一的 `.play(`,一個硬字串 —— 商店、選角試鏡、頒獎台三個畫面共用這一支
 * previewer,所以「勝利」和「站在商店裡」播的是同一個剪輯。
 * `StorePreview.test.ts` 全檔沒有任何 `animator.play` 斷言:把那一行刪掉,
 * 整個功能撤銷而測試全綠(失敗形態 ③ + ⑤)。
 *
 * 所以這一段跑**真的** `StorePreview`(NullEngine + 真的 `AnimationGroup`),
 * 斷言的是**哪一個 group 真的在跑** —— 行為,不是屬性。
 */
describe("金冠那位真的在慶祝 (round-podium-clip)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    Configs.register(shippedPodiumDoc() as never);
  });
  afterEach(() => {
    Configs.clear();
    scene.dispose();
    engine.dispose();
  });

  /** 一個帶著指定剪輯名的 AssetContainer,剪輯是真的 Babylon AnimationGroup。 */
  function makeAssets(clipNames: readonly string[]): AssetManager {
    const container = new AssetContainer(scene);
    const box = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    container.meshes.push(box);
    container.rootNodes.push(box);
    for (const name of clipNames) {
      const g = new AnimationGroup(name, scene);
      const a = new Animation(`${name}-anim`, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT);
      a.setKeys([
        { frame: 0, value: 0 },
        { frame: 30, value: 1 },
      ]);
      g.addTargetedAnimation(a, box);
      container.animationGroups.push(g);
    }
    container.removeAllFromScene();
    return { load: () => Promise.resolve(container) } as unknown as AssetManager;
  }

  const MODEL = {
    id: "champ.blocky",
    schema: "model@1",
    glbPath: "assets/models/champions/blocky-knight.glb",
    scale: 1,
    collisionRadius: 0.5,
    clipMap: { idle: "idle", run: "run", attack: "attack", cast: "cast", hurt: "hurt", death: "death" },
  } as unknown as ModelDoc;

  /** 出貨鏈原封不動:hudStore → plan → 真的舞台 → 真的 StorePreview。 */
  async function runReal(clipNames: readonly string[]) {
    const assets = makeAssets(clipNames);
    const previews: StorePreview[] = [];
    const stage = new RoundWinnerStage({
      host: { appendChild: () => undefined } as unknown as HTMLElement,
      createCanvas: () => ({ style: {}, remove: () => undefined }) as unknown as HTMLCanvasElement,
      createElement: () =>
        ({
          style: {},
          innerHTML: "",
          setAttribute: () => undefined,
          getAttribute: () => null,
          remove: () => undefined,
        }) as unknown as HTMLElement,
      createPreview: () => {
        const p = new StorePreview(scene, assets);
        previews.push(p);
        return p;
      },
      taunt: null,
    });
    const hud = hudStore.getState();
    const plan = planRoundWinnerShow(hud.seats, hud.teams, hud.round, () => MODEL, {
      duels: hud.duels,
      zone: localDuelZone(hud),
    });
    stage.showTeam(plan!.members, plan!.ctx);
    // StorePreview.show 是 async(assets.load 回一個已解決的 promise)
    await new Promise((r) => setTimeout(r, 0));
    return { stage, previews };
  }

  it("★ 有 cheer 的模型:金冠跑 cheer,銀銅跑 idle —— 讀的是真的 AnimationGroup", async () => {
    const { previews } = await runReal(["idle", "run", "attack", "cast", "hurt", "death", "cheer"]);
    expect(previews).toHaveLength(3);
    expect(previews.map((p) => p.playingClip)).toEqual(["celebrate", "idle", "idle"]);
    // 行為:場上**真的在跑**的 AnimationGroup(instantiateModelsToScene 加了前綴)。
    // 三張卡 → 剛好一個 cheer 在跑、兩個 idle 在跑,一格都不多。
    const playing = scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);
    expect(playing.filter((n) => n.endsWith("cheer"))).toHaveLength(1);
    expect(playing.filter((n) => n.endsWith("idle"))).toHaveLength(2);
    expect(playing).toHaveLength(3);
    for (const p of previews) p.dispose();
  });

  it("★ 沒有 cheer 的模型 fail-LOUD:退回 idle,而且 console 真的叫一次", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { previews } = await runReal(["idle", "run", "attack", "cast", "hurt", "death"]);
    // 退回 idle(畫面不會空),但**有人說出來** —— 靜默退回才是缺陷
    const playing = scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);
    expect(playing.filter((n) => n.endsWith("idle"))).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]![0])).toContain("celebrate");
    // 只叫一次(每個 animator 一次),不是每一幀
    expect(warn.mock.calls.length).toBe(1);
    warn.mockRestore();
    for (const p of previews) p.dispose();
  });
});

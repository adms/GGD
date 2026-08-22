/**
 * roundFxRegistry —— 回合邊界要清哪些特效，是一份**註冊表**，⛔ 不是一段手寫的
 * 清理程式 (GH#337)。
 *
 * ── 為什麼會有這個檔案（根因，⛔ 不是「有人刪掉了清理」）───────────────────
 * owner 2026-08-17:「場地莫名其妙的特效又回來了 是不是又沒清乾淨」。
 * 查下去發現的不是回歸,而是**它從第一天起就只清一個物件**:
 *   · `RoundVfxLifecycle` 的建構子吃**單一** target;
 *   · `GameApp` 傳的是 `this.vfx` —— 於是回合邊界只碰得到 `VfxSystem`;
 *   · 而同一個檔案的 `dispose()` 手寫了**十個**持有 Babylon 資源的 FX。
 * **兩張手寫清單,只有 teardown 那一張是完整的,而沒有任何東西在比對它們。**
 * 逃出去的四個(AmbientVfx 的兩個 free-list、從沒被呼叫的 `victoryFx.reset`、
 * WhirlwindFx 的 funnel free-list、`dressArena` 的 in-flight 孤兒)因此每一次
 * 換地圖都留一點東西在場上,而地圖是**每回合換**的(#145)。
 *
 * ⛔ 所以正確的修法不是再補一次 dispose —— 那只會產生**第三張**會腐爛的清單。
 * 這裡做的是第零守則⑨:一個註冊介面 + 一張表,加上一條「表漏了就紅」的閘
 * (`GameApp.roundFxWiring.test.ts` 比對 `dispose()` 那張清單與這裡的註冊清單)。
 *
 * ── 為什麼 `createRoundFx()` 要負責 new ─────────────────────────────────────
 * 因為**被測的必須是出貨的那一個**(失敗形態⑤)。既有的守衛
 * `vfx/VfxSystem.roundReset.test.ts` 自己 `new RoundVfxLifecycle(vfx)`,
 * 複製了出貨接線的**形狀**卻沒有複製它的**內容** —— 「GameApp 只塞了一個
 * target」在那支測試裡完全看不見,所以它全綠了一整年。把組裝收成這一個函式
 * 之後,守衛拿到的場景型 FX 集合與 `GameApp` 建構子拿到的是同一份。
 */
import type { Scene } from "@babylonjs/core/scene";
import { VfxSystem, type VfxContext } from "../vfx/VfxSystem";
import { AmbientVfx, type AmbientContentHooks } from "../vfx/AmbientVfx";
import { WhirlwindFx, type WhirlwindFxOptions } from "../vfx/WhirlwindFx";
import { FireRingFx, type FireRingFxOptions } from "./vfx/FireRingFx";
import { VictoryFireworks, type VictoryFireworksOptions } from "../vfx/VictoryFireworks";
import { vfxSoundLayer } from "../audio/vfxSound";
import type { RoundEdge, RoundVfxTarget } from "./roundVfxLifecycle";

export type { RoundEdge };

/** 一個「知道自己在回合邊界該收什麼」的特效層。 */
export interface RoundFxOwner {
  resetForRound(edge: RoundEdge): void;
}

/** 兩側都清 —— 大部分的池子屬於這一類。 */
const BOTH_EDGES: readonly RoundEdge[] = ["enter", "leave"];
/** 只在開打那一幀清（勝利煙火:它在 `leave` 那一幀才剛出生）。 */
const ENTER_ONLY: readonly RoundEdge[] = ["enter"];

interface RoundFxEntry {
  readonly name: string;
  readonly edges: readonly RoundEdge[];
  readonly reset: (edge: RoundEdge) => void;
}

/**
 * 一張表:名字 → 在哪幾個邊界 → 收什麼。`resetForRound` 依**註冊順序**扇出,
 * 順序固定(不是 Map 迭代、不是集合),所以一次清場的行為是可重現的。
 */
export class RoundFxRegistry implements RoundVfxTarget {
  private readonly entries: RoundFxEntry[] = [];

  /** 註冊過的名字（守衛比對用；順序 = 清場順序）。 */
  get names(): readonly string[] {
    return this.entries.map((e) => e.name);
  }

  add(name: string, edges: readonly RoundEdge[], reset: (edge: RoundEdge) => void): this {
    this.entries.push({ name, edges, reset });
    return this;
  }

  resetForRound(edge: RoundEdge): void {
    for (const e of this.entries) if (e.edges.includes(edge)) e.reset(edge);
  }
}

/** `createRoundFx` 要的每一層的內容接縫（GameApp 從它自己的 contentDb 餵進來）。 */
export interface RoundFxDeps {
  vfx: VfxContext;
  ambient: AmbientContentHooks;
  fireRing: FireRingFxOptions;
  victory?: VictoryFireworksOptions;
  /** 測試 seam:`createTexture: () => null` 讓 headless 不去解圖。 */
  whirlwind?: WhirlwindFxOptions;
  /**
   * GH#580 —— 特效**循環音**的登記表。省略時就是出貨的那一個（`vfxSoundLayer`）。
   *
   * ⚠️ 為什麼**預設值是那個單例**而不是一個 no-op：漏傳的那一次必須仍然是**對的行為**。
   * 一個 no-op 預設會讓「忘記接線」與「已經接好」在畫面上長得一模一樣 —— 正是這條
   * issue 的形狀。留著注入口只是為了讓測試換一份假的來量。
   */
  sound?: RoundSoundLoops;
}

/** 回合邊界要清的循環音登記表 —— `VfxSoundLayer` 的那一格（只用得到 `reset`）。 */
export interface RoundSoundLoops {
  reset(): void;
}

/** 場景型 FX 的整包 —— GameApp 把它拆進自己的欄位，守衛直接拿來量場景。 */
export interface RoundFx {
  registry: RoundFxRegistry;
  vfx: VfxSystem;
  ambient: AmbientVfx;
  whirlwind: WhirlwindFx;
  fireRing: FireRingFx;
  victoryFx: VictoryFireworks;
}

/**
 * **唯一的組裝點。** 建出所有會在場景裡留下 Babylon 資源的回合型 FX,並且把
 * 每一個都註冊進回合邊界。
 *
 * ⚠️ 加一個新的場景型 FX 時,把它 new 在這裡並 `registry.add(...)` ——
 * 只 new 不註冊會被 `GameApp.roundFxWiring.test.ts` 擋下來(它比對
 * `GameApp.dispose()` 的清單),那條紅燈就是這個 issue 真正要的東西。
 */
export function createRoundFx(scene: Scene, deps: RoundFxDeps): RoundFx {
  const vfx = new VfxSystem(scene, deps.vfx);
  const ambient = new AmbientVfx(scene, deps.ambient);
  const whirlwind = new WhirlwindFx(scene, deps.whirlwind ?? {});
  const fireRing = new FireRingFx(scene, deps.fireRing);
  const victoryFx = new VictoryFireworks(scene, deps.victory ?? {});

  const registry = new RoundFxRegistry()
    // 一次性效果 + per-doc-id 的池子 + 預告圈/打擊感共用池（#259 / #262 / GH#270）
    .add("vfx", BOTH_EDGES, () => vfx.resetForRound())
    // 沒有主人的常駐特效 free-list（⛔ 活著的英雄身上那些不動）
    .add("ambient", BOTH_EDGES, () => ambient.resetForRound())
    // 漏斗殼 free-list（同上,活著的不動）
    .add("whirlwind", BOTH_EDGES, () => whirlwind.resetForRound())
    // 火圈:停掉樂隊與鑲邊火焰。它的資源是有界且重用的,所以是 hide 不是 dispose
    .add("fireRing", BOTH_EDGES, () => fireRing.hide())
    // ⭐ 只有 enter —— 見 VictoryFireworks.resetForRound 的註解（leave 清它 = 刪掉 #235）
    .add("victoryFx", ENTER_ONLY, (edge) => victoryFx.resetForRound(edge))
    // ⭐ GH#580 —— 特效循環音的登記表。⚠️ 這一格在此之前**只有 `GameApp.dispose()`**
    //   （＝離開房間）碰得到,回合邊界的這張表上沒有它 ⇒ 上一回合龍捲風／火柱／吐息的
    //   循環音會在**商店畫面裡繼續響 8 秒**,踩到 `fireRingLoop`(素材 60.09s)那一發時
    //   是一整段音軌在商店裡從頭燒,要下一回合開打才被掐掉。出貨內容真的有這個家族:
    //   `config/vfx-families.json` 的 tornado / flamePillar / breath / portal,28 支技能覆寫。
    //   ⭐ 名字用 `vfxSoundLayer`(＝ `GameApp.dispose()` 裡那個識別字),⛔ 不是 `vfxSound`:
    //   `GameApp.roundFxWiring.test.ts` 這條閘靠的就是**名字相等**,對不上等於重新打開
    //   GH#594 那個洞。⭐ BOTH_EDGES —— owner:「寧願多次清理乾淨開始回合 也不要漏清到」。
    //   ⚠️ 順序是對的:`GameApp` 的 `roundVfx.sync()` 在 step 0,比 step 5b 的
    //   `vfxLoopPushes` 早,所以清完當幀不會再推。
    .add("vfxSoundLayer", BOTH_EDGES, () => (deps.sound ?? vfxSoundLayer).reset());

  return { registry, vfx, ambient, whirlwind, fireRing, victoryFx };
}

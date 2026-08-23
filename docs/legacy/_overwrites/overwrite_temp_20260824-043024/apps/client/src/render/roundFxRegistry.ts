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
import { lifecycleLedger } from "./lifecycleLedger";
import { CLEANUP_EDGES, type CleanupEdge, type RoundEdge, type RoundVfxTarget } from "./roundVfxLifecycle";

export type { RoundEdge, CleanupEdge };

/** 一個「知道自己在清理邊界該收什麼」的特效層。 */
export interface RoundFxOwner {
  resetForRound(edge: CleanupEdge): void;
}

/**
 * ⭐ GH#560 —— **預設**：四個邊界全跑（owner：「寧願多次清理乾淨開始回合
 * 也不要漏清到」）。⛔ 少跑才是那個要寫理由的例外，⛔ 不是反過來。
 */
const ALL_EDGES: readonly CleanupEdge[] = CLEANUP_EDGES;

interface RoundFxEntry {
  readonly name: string;
  readonly edges: readonly CleanupEdge[];
  /** ⛔ 只跑部分邊界的那一列必須寫得出理由；四個都跑的是空字串。 */
  readonly why: string;
  readonly reset: (edge: CleanupEdge) => void;
}

/** 守衛讀的那一份（⛔ 不是掃原始碼字串：這是真的註冊表本身）。 */
export interface RoundFxScopedEntry {
  readonly name: string;
  readonly edges: readonly CleanupEdge[];
  readonly why: string;
}

/**
 * 一張表:名字 → 在哪幾個邊界 → 收什麼。`resetForRound` 依**註冊順序**扇出,
 * 順序固定(不是 Map 迭代、不是集合),所以一次清場的行為是可重現的。
 */
export class RoundFxRegistry implements RoundVfxTarget {
  private readonly entries: RoundFxEntry[] = [];
  private errors = 0;
  private lastError = "";

  /** 註冊過的名字（守衛比對用；順序 = 清場順序）。 */
  get names(): readonly string[] {
    return this.entries.map((e) => e.name);
  }

  /** 每一列在哪幾個邊界跑、以及（少跑時）為什麼（守衛用）。 */
  get roster(): readonly RoundFxScopedEntry[] {
    return this.entries.map(({ name, edges, why }) => ({ name, edges, why }));
  }

  /**
   * ⭐ 扇出時擲例外的次數。⚠️ fail-open 沒錯，**靜默**才是缺陷（第二守則）——
   * 一列擲例外不可以帶走它後面**每一列**的回收，但它也不可以安靜地消失。
   */
  get errorCount(): number {
    return this.errors;
  }
  get lastErrorText(): string {
    return this.lastError;
  }

  /** ⭐ 四個邊界全跑（預設，⛔ 不必也不可以寫理由）。 */
  add(name: string, reset: (edge: CleanupEdge) => void): this {
    this.entries.push({ name, edges: ALL_EDGES, why: "", reset });
    return this;
  }

  /**
   * 只在某幾個邊界跑 —— `why` 是**必填**（tsc 擋住「一個沒有理由的例外」，
   * 而那正是 GH#560 之前那兩份手抄清單的形狀）。
   */
  addScoped(
    name: string,
    edges: readonly CleanupEdge[],
    why: string,
    reset: (edge: CleanupEdge) => void,
  ): this {
    this.entries.push({ name, edges, why, reset });
    return this;
  }

  resetForRound(edge: CleanupEdge): void {
    for (const e of this.entries) {
      if (!e.edges.includes(edge)) continue;
      try {
        e.reset(edge);
      } catch (err) {
        // ⛔ 一列壞掉不可以吃掉後面每一列的回收（那會讓一個小缺陷長成
        //    「這一版回合邊界什麼都沒清」）——但它要**被說出來**：第一次印一行。
        this.errors++;
        this.lastError = `${e.name}@${edge}: ${String(err)}`;
        if (this.errors === 1) console.warn(`[roundFx] ⛔ 清理邊界擲例外 ${this.lastError}`);
      }
    }
  }
}

/** `createRoundFx` 要的每一層的內容接縫（GameApp 從它自己的 contentDb 餵進來）。 */
export interface RoundFxDeps {
  vfx: VfxContext;
  ambient: AmbientContentHooks;
  /**
   * ⭐ GH#546 —— 「這個實體現在哪幾格開關技能是開著的」。
   *
   * ⛔ **必須從外面注入**：`architecture.test.ts` 的 client-08 閘禁止
   * `render/**` 與 `vfx/**` import `RoomStore`（逐幀資料不可以穿過 React state），
   * 而這一層正在那兩層裡面。⇒ 只轉發，⛔ 不自己讀。
   *
   * ⭐⭐ **刻意是必填（⛔ 不是 `?`）**：它是一條「忘了就靜靜失效」的接線 ——
   * 少了它，開關型技能的手部特效不掛、`toggleMask` 恆為 0，⛔ 而畫面上跟
   * 「這支技能本來就沒特效」一模一樣（第二守則失敗形態③）。
   * ⇒ 讓 **`tsc` 擋住忘記**，⛔ 不是寫一條「要記得注入」的散文。
   * ⚠️ 2026-08-23 的稽核逐字點名同一族的另一條（`GameApp.statusIdsForSeat`）
   * 「刪掉它 M1 客戶端全死而測試全綠」—— 那一條至今仍是選配的。
   */
  ambientToggleMask: (entityId: number) => number;
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
  const ambient = new AmbientVfx(
    scene,
    deps.ambient,
    { getToggleMask: deps.ambientToggleMask },
  );
  const whirlwind = new WhirlwindFx(scene, deps.whirlwind ?? {});
  const fireRing = new FireRingFx(scene, deps.fireRing);
  const victoryFx = new VictoryFireworks(scene, deps.victory ?? {});

  const registry = new RoundFxRegistry()
    // 一次性效果 + per-doc-id 的池子 + 預告圈/打擊感共用池（#259 / #262 / GH#270）
    .add("vfx", () => vfx.resetForRound())
    // 沒有主人的常駐特效 free-list（⛔ 活著的英雄身上那些不動）
    .add("ambient", () => ambient.resetForRound())
    // 漏斗殼 free-list（同上,活著的不動）
    .add("whirlwind", () => whirlwind.resetForRound())
    // 火圈:停掉樂隊與鑲邊火焰。它的資源是有界且重用的,所以是 hide 不是 dispose
    .add("fireRing", () => fireRing.hide())
    // ⭐ 只有 enter —— 見 VictoryFireworks.resetForRound 的註解（leave 清它 = 刪掉 #235）
    .addScoped(
      "victoryFx",
      ["enter"],
      "⛔ `leave` 清它等於刪掉 #235：回合勝利煙火正是在 combat→resolution 的那一幀發射的，在 `leave` 清 = 在它出生的同一幀殺掉它,而畫面上跟「煙火壞了」一模一樣。⛔ `entry`/`exit` 也不必:進場時場上還沒有煙火,離場走 `GameApp.dispose()` 的 `victoryFx.dispose()`(⭐ 那是真的釋放,比 reset 更徹底)。",
      (edge) => victoryFx.resetForRound(edge as RoundEdge),
    )
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
    .add("vfxSoundLayer", () => (deps.sound ?? vfxSoundLayer).reset())
    // ── 🔬 生命週期登記表（owner 2026-08-23「到第七回合就很難動作⋯累積」）───────
    // ⛔ 它**不清任何東西** —— 上面每一列都是回收動作,這一列是**量測**:在回合邊界
    // 把「每一類物件現在有幾個 / 最老的至少活了幾秒」記一筆,於是「越玩越 lag」會
    // 顯示成一條**上升的線**而不是一種感覺。⭐ 只取 `enter` 那一側:`leave` 是清場
    // **前**、`enter` 是清場**後**,兩側混在同一條序列裡等於拿蘋果跟橘子算成長。
    // ⚠️ 它必須排在**最後** —— 前面那幾列才剛把池子還回去,量在它們之前得到的是
    // 上一回合的殘影(而那正是這條 lane 要抓的東西,量錯就等於沒量)。
    .add("lifecycleLedger", ENTER_ONLY, () => lifecycleLedger.markRound(performance.now() / 1000));

  // ⭐ 綁在**唯一的組裝點**:這裡是 GameApp 建 Babylon 場景型 FX 的地方,
  //   所以「要普查哪一個 scene」不會有第二個答案(也不必在 GameApp 接一行)。
  lifecycleLedger.bindScene(scene);

  return { registry, vfx, ambient, whirlwind, fireRing, victoryFx };
}

/**
 * lifecycleLedger —— 🔬 **每一類物件的生命週期登記表**（owner 2026-08-23）。
 *
 * > 「這版改完**還是 LAG** 一定有地方有問題, **到第七回合就很難動作**，
 * >  可能其中一個原因也是**累積，沒清理到殘留物**
 * >  請你要**設計一個機制捕捉與監控每個物件的生命週期及存活時間限制**，
 * >  才可以**精準縮小範圍來除錯**」
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它回答的是一個問題：**「到第七回合，哪一類東西沒有回到第一回合的水準？」**
 * ---------------------------------------------------------------------------
 * ⛔ 它**不是**一支效能計時器（那是 `perfBus.workMs`），⛔ 也不是一支清理器
 * （那是 `vfxHardCap` 與 `roundFxRegistry`）。它只做兩件事：**數**與**指名**。
 *
 * owner 的兩個關鍵字各對應一個輸出：
 *   · 「捕捉與監控」→ `report()` —— 一張**逐回合 × 逐類別**的表，可以直接貼出來
 *   · 「精準縮小範圍」→ `suspects()` —— **還在長的那幾類**，⛔ 不是一個總數
 *
 * ---------------------------------------------------------------------------
 * ⛔⛔ 為什麼**沒有** `track(id) / release(id)`
 * ---------------------------------------------------------------------------
 * 那個形狀會把我們正在追的缺陷**原封不動再造一次**：
 *   ① 一個忘了 `release()` 的呼叫端，跟一個真的洩漏，在登記表上**長得一模一樣**
 *      —— 於是儀表自己就是嫌疑犯，而我們無法分辨。
 *   ② 以 id 為 key 的 `Map` 本身**沒有上界** ⇒ ⭐ **一個無上限的登記表就是下一個洩漏。**
 *   ③ 新的資源通道（今年已經加了 `ModelFxRig`）一定會忘記加那一行註冊，
 *      而「忘了註冊」與「這一類本來就沒東西」在畫面上是同一個 0。
 *
 * ⇒ 這裡用的是 `vfxHardCap` 已經驗證過的那一招：**場景自己就是那份登錄表**。
 * Babylon 的 `mesh` / `material` / `texture` / `particleSystem` / `TransformNode`
 * / `Geometry` 建構子都會把自己 push 進 `scene.*`，所以**普查它就好**，
 * ⛔ 沒有任何呼叫端需要記得任何事。
 *
 * 場景管不到的東西（free-list 池、Map 快取、事件緩衝）走 `gauge(kind, read)`：
 * ⭐ **拉取式**，⛔ 不是推送式 —— 沒有 per-object 記帳可以寫錯，而註冊的是
 * **一個函式**（每一類一個），所以那張表的大小 = 類別數，本來就有界。
 *
 * ---------------------------------------------------------------------------
 * ⏱ 「存活時間」量的是**至少活了多久**，⛔ 不是「出生於」
 * ---------------------------------------------------------------------------
 * 我們拿不到 Babylon 物件的出生時間（沒有那個欄位，而攔截每一個建構子等於回到
 * 上面那個 `track()`）。所以碼表從**第一次被普查看到**開始走：`oldestSec` 的
 * 語意是「這一類裡最老的那一個，**至少**在場上待了這麼久」。
 * ⭐ 那正好就是除錯要的方向：它是**下界**，所以它說「有東西待了 400 秒」的時候
 * ⛔ 不可能是高估。碼表住 `WeakMap` ⇒ 物件被回收之後這裡不留任何位元組。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 它**只指名，不清理**（刻意的）
 * ---------------------------------------------------------------------------
 * 出貨已經有兩道會**動手**的閘（`vfxHardMaxLifeSec` 的兜底掃描、回合邊界的
 * `roundFxRegistry`）。再加第三隻手只會讓「誰把它收掉的」變成新的謎題 ——
 * 而「悄悄被收掉」正是這一族缺陷難查的原因。⇒ 這一支的工作是**說出來**。
 *
 * ---------------------------------------------------------------------------
 * ⭐ fail-loud（第二守則：fail-open 沒錯，**靜默**才是缺陷）
 * ---------------------------------------------------------------------------
 * 「還在長」的類別數寫進 `perfBus.lifecycleGrowth`，而 `PerfOverlay` 的
 * `healthWarnings()` **非零就畫在永遠可用的 fps 藥丸旁邊** ——
 * ⛔ 不受 `showPerfOverlay` 管（那一格出貨預設是關的，掛上去等於「擋得掉」）。
 * 每出現一個**新的**還在長的類別就 `console.warn` 一次完整的表
 * （🧹 GH#782：同一批持續亮著不洗版，⛔ 但後來才開始漏的那一類不可以沒聲音）。
 */
import { Configs } from "@ggd/shared/content";
import { perfBus } from "../perfBus";

/**
 * 普查得到的最小面。⛔ **刻意不 import `@babylonjs`** —— 這一支同時被 `ui/`
 * （取樣計時器）讀，而 client-08 架構閘只允許 `render/**` 與 `vfx/**` 碰 Babylon。
 * 結構化型別讓真的 `Scene` 直接可指派，測試也餵得進假場景。
 */
export interface LedgerNamed {
  readonly name?: string;
  readonly id?: string;
  /**
   * Babylon `AbstractMesh.isEnabled()` —— 有才讀（⛔ 這裡刻意不 import Babylon）。
   * ⚠️ 用來拆穿 `perfBus.drawCount` 那條謊，見 `sceneTruth()`。
   */
  readonly isEnabled?: () => boolean;
  /**
   * Babylon `IParticleSystem.getActiveCount()` —— ⭐ **這一刻真的活著的粒子數**，
   * ⛔ 不是「有幾個粒子系統」（那正是 `perfBus.particleCount` 在說的東西）。
   */
  readonly getActiveCount?: () => number;
}

export interface LedgerScene {
  readonly meshes: readonly LedgerNamed[];
  readonly materials: readonly LedgerNamed[];
  readonly textures: readonly LedgerNamed[];
  readonly particleSystems: readonly LedgerNamed[];
  readonly transformNodes: readonly LedgerNamed[];
  readonly geometries?: readonly LedgerNamed[];
  /**
   * 🧹 GH#782 —— **軌不是節點**。`instantiateModelsToScene` 把 AnimationGroup
   * clone 進 `scene.animationGroups`，而 `root.dispose()` 一條都收不到 ——
   * 在此之前這一類**整個不在普查裡**，所以「動畫軌在漏」對這支監控結構性隱形
   * （owner 2026-08-27「你不是有在監控特效生命週期跟lag嗎？」的其中一半答案）。
   */
  readonly animationGroups?: readonly LedgerNamed[];
  /** 同上：skeleton 也不是節點（skinned glb 的 instantiate 會 clone 它）。 */
  readonly skeletons?: readonly LedgerNamed[];
  /**
   * Babylon `Scene.getActiveMeshes()` —— 上一幀**真的送去畫**的那些。
   * ⭐ 這才是 draw call 的量級；`scene.meshes.length` 連 disabled 與池子裡的都算。
   */
  readonly getActiveMeshes?: () => { readonly length: number };
}

/**
 * ⭐ **拆穿三條儀表謊言**用的誠實普查（owner 2026-08-23「監控 LAG 縮小找 root cause」）。
 *
 * ⚠️ 已量到的：`perfBus.drawCount = scene.meshes.length` —— 含 **disabled**、
 * 含**池子裡待命的**，所以它在「回收有沒有生效」這個問題上**結構上失明**：
 * 一個被還回 free-list 的 mesh 在它眼裡跟一個正在畫的 mesh 一模一樣。
 * `perfBus.particleCount = scene.particleSystems.length` 同理 —— 那是**系統數**，
 * 而「粒子太多」問的是**顆數**（owner 線上量到的是「2,819 顆 → 5,975 顆」）。
 *
 * ⇒ 這裡把兩對數字**並排**吐出來。⛔ 不覆寫 `perfBus`（那兩格有自己的消費端與守衛），
 * ⭐ 而是讓 `__ggdDiag()` 把「總數 vs 真的在畫」印在同一行，差額一眼就看得到。
 */
export interface SceneTruth {
  /** ⛔ 沒有綁場景 ⇒ 下面每一格都不可信（⛔ 不可以看起來像「場上很乾淨」）。 */
  bound: boolean;
  /** `scene.meshes.length` —— 就是 `perfBus.drawCount` 的那個數字。 */
  meshesTotal: number;
  /** 其中 `isEnabled()` 為真的（讀不到 `isEnabled` 就等於 total）。 */
  meshesEnabled: number;
  /** ⭐ 上一幀真的送去畫的（`getActiveMeshes()`）。**-1 = 讀不到**，⛔ 不是 0。 */
  meshesActive: number;
  /** `scene.particleSystems.length` —— 就是 `perfBus.particleCount` 的那個數字。 */
  particleSystems: number;
  /** ⭐ 真的活著的粒子**顆數**。**-1 = 讀不到**，⛔ 不是 0。 */
  particlesLive: number;
  materials: number;
  textures: number;
  transformNodes: number;
  geometries: number;
}

export interface KindStat {
  /** 這一刻這一類有幾個活著 */
  live: number;
  /** 這一類裡最老的那一個**至少**活了幾秒（⛔ 下界，見檔頭） */
  oldestSec: number;
}

export interface LifecycleSample {
  readonly atSec: number;
  /** `R1` / `R2` …（回合邊界）或 `now`（隨手取樣） */
  readonly label: string;
  readonly kinds: Readonly<Record<string, KindStat>>;
}

export interface LifecycleSuspect {
  readonly kind: string;
  /** 歷史窗口第一筆的數量 */
  readonly first: number;
  /** 最新一筆的數量 */
  readonly last: number;
  readonly delta: number;
  readonly oldestSec: number;
}

/* ── 登記表自己的上限（③：⛔ 一個無上限的登記表就是下一個洩漏）──────────── */

/**
 * 同時追蹤幾個「類別」。超過就整包落進 `<bucket>:…` —— ⭐ 溢位**仍然被數到**，
 * ⛔ 只是失去分類，所以一個「類別數本身在爆炸」的缺陷不會因為溢位而消失。
 * 64 是量出來的量級：出貨一場比賽的普查落在 20–30 類。
 */
const MAX_KINDS = 64;
/** `report()` 一次最多印幾列（貼給 owner 的東西要貼得完）。 */
const REPORT_ROWS = 40;

/* ── 設定（第一守則：五格全部住 `config.vfx-cleanup@1`）──────────────────── */

interface LedgerPolicy {
  enabled: boolean;
  sampleSec: number;
  history: number;
  minDelta: number;
  maxAgeSec: number;
}

const SHIPPED: LedgerPolicy = {
  enabled: true,
  sampleSec: 2,
  history: 16,
  minDelta: 8,
  maxAgeSec: 180,
};

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

/**
 * 用到的時候才讀（照抄 `vfxCleanupPolicy` / `modelLod`）：不必在 boot 接線，
 * 也就沒有「文件到了但已經太晚」的失敗形態②。逐格降級 —— 一份存於新欄位之前的
 * 耐久 override 少了這五格，仍然要拿得到出貨值。
 */
export function ledgerPolicy(read: () => unknown = () => Configs.tryGet("vfx-cleanup")): LedgerPolicy {
  const d = read() as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== "object") return SHIPPED;
  return {
    enabled: typeof d.lifecycleLedgerEnabled === "boolean" ? d.lifecycleLedgerEnabled : SHIPPED.enabled,
    sampleSec: clamp(d.lifecycleSampleSec, 0.25, 60, SHIPPED.sampleSec),
    history: Math.floor(clamp(d.lifecycleRoundHistory, 2, 64, SHIPPED.history)),
    minDelta: Math.floor(clamp(d.lifecycleGrowthMinDelta, 1, 4096, SHIPPED.minDelta)),
    maxAgeSec: clamp(d.lifecycleMaxAgeSec, 0, 3600, SHIPPED.maxAgeSec),
  };
}

/* ── 分類：從**名字推導**，⛔ 不是一張手寫的對照表 ────────────────────────── */

/**
 * 一個名字 → 一個類別鍵。⛔ 手寫的前綴表會腐爛（下一條新通道不在表上就變成
 * 「其他」），所以這裡從名字自己的形狀推導：
 *   · 路徑（`/content/assets/textures/ground/stone/albedo.png`）→ 上一層目錄 `ground`
 *     ⭐ 用目錄而不是檔名：同一份快取的 4 張貼圖要落在**同一類**才看得出成長
 *   · 一般名字（`modelfx-r3-2` / `vfx-preset-9` / `ambient-x`）→ 第一段英文字母
 *   · 空名字（Babylon 的匿名資源）→ `?`
 */
export function ledgerSlug(raw: string): string {
  const s = (raw || "").split("?")[0]!;
  if (s.includes("/")) {
    const parts = s.split("/").filter((p) => p.length > 0);
    // 最後一段是檔名 ⇒ 取它的上一層目錄；只有一段就用那一段
    const dir = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    return dir.toLowerCase().slice(0, 24);
  }
  const m = /^[A-Za-z]+/.exec(s.replace(/^[^A-Za-z]+/, ""));
  return (m?.[0] ?? "?").toLowerCase().slice(0, 24);
}

/** 場景以外的東西（free-list 池 / Map 快取）用的拉取式量表。 */
export type LedgerGauge = () => number;

/**
 * ⭐ **接線成本＝一行**（owner 的第一個必要條件）。
 * `Map` / `Set` 有 `size`、陣列有 `length` —— 幾乎每一個「會長大的東西」在這個
 * repo 裡都是這兩種之一，所以呼叫端不必寫任何讀取函式，把容器本身交出來就好。
 */
export type LedgerContainer = { readonly size: number } | { readonly length: number };

const containerSize = (c: LedgerContainer): number => {
  const v = "size" in c ? c.size : c.length;
  return typeof v === "number" && Number.isFinite(v) ? v : -1;
};

/** `WeakRef` 有就用（見 `bindScene` 的同一個理由）。 */
function weakly<T extends object>(o: T): { deref(): T | undefined } {
  const W = (globalThis as { WeakRef?: new (o: T) => { deref(): T | undefined } }).WeakRef;
  return W ? new W(o) : { deref: () => o };
}

export class LifecycleLedger {
  /** ⭐ `WeakRef` ⇒ 登記表**結構上**留不住一個已經被丟掉的場景。 */
  private sceneRef: { deref(): LedgerScene | undefined } | null = null;
  private readonly gauges = new Map<string, LedgerGauge>();
  /** 碼表：物件 → 第一次被看到的秒數。WeakMap ⇒ 物件走了這裡不留東西。 */
  private readonly firstSeen = new WeakMap<object, number>();
  /** 已知類別（⛔ 有上限，見 `MAX_KINDS`）。 */
  private readonly kinds = new Set<string>();
  /** 回合邊界快照的環狀緩衝（⛔ 有上限，見 `history`）。 */
  private readonly rounds: LifecycleSample[] = [];
  private last: LifecycleSample | null = null;
  private nextSampleSec = -Infinity;
  private roundNo = 0;
  /** 已經在 console 指名過的類別（🧹 GH#782：新類別要**再**印，⛔ 不是一場一次）。 */
  private readonly announcedKinds = new Set<string>();
  /** 因為超過 `MAX_KINDS` 而沒接上的量表數（⛔ 不可以靜靜消失，見 `gauge`）。 */
  private droppedGauges = 0;

  /** 綁上要普查的場景（`createRoundFx` 在唯一的組裝點呼叫）。 */
  bindScene(scene: LedgerScene): void {
    this.sceneRef = weakly(scene);
    this.reset();
  }

  /**
   * 註冊一格拉取式量表（池子大小、快取筆數…）。同名覆蓋 ⇒ 這張表的大小
   * = 類別數，⛔ 不隨物件數成長。
   *
   * ⚠️ 量表數**也有上限**（同 `MAX_KINDS`）：溢位的那些被丟掉但**數出來**，
   * `report()` 會把數量印出來 —— ⛔ 「量表自己爆掉」不可以是一個安靜的 0。
   */
  gauge(kind: string, read: LedgerGauge): void {
    if (!this.gauges.has(kind) && this.gauges.size >= MAX_KINDS) {
      this.droppedGauges++;
      return;
    }
    this.gauges.set(kind, read);
  }

  /**
   * ⭐ **一行接上一整組容器**（owner：「接線成本要低到會被用」）。
   *
   * 每一個 `Map` / `Set` / 陣列變成一格 `<prefix>:<name>` 的量表，⛔ 呼叫端不必寫
   * 任何讀取函式、⛔ 不必記得在任何地方 `release()` —— 讀的是容器**當下**的大小，
   * 所以「忘了從 Map 刪掉」這件事**本身**就是它要抓的東西。
   *
   * ⚠️ 容器**弱參照**（`WeakRef`）：一個已經被丟掉的 registry / 已經 dispose 的
   * 場景快取，⛔ 不可以因為登記表拿著它而活下來 —— 那會讓這支偵測器**自己變成
   * 那個洩漏**。物件走了之後那一格自動退場。
   */
  gaugeContainers(prefix: string, bag: Readonly<Record<string, LedgerContainer>>): void {
    for (const [name, c] of Object.entries(bag)) {
      const kind = `${prefix}:${name}`;
      const ref = weakly(c);
      this.gauge(kind, () => {
        const live = ref.deref();
        if (!live) {
          this.gauges.delete(kind);
          return 0;
        }
        return containerSize(live);
      });
    }
  }

  /** 丟掉歷史與碼表分類（⛔ 不解綁場景、⛔ 不動量表註冊）。 */
  reset(): void {
    this.rounds.length = 0;
    this.kinds.clear();
    this.last = null;
    this.nextSampleSec = -Infinity;
    this.roundNo = 0;
    this.announcedKinds.clear();
    perfBus.lifecycleGrowth = 0;
    perfBus.lifecycleWorst = "";
  }

  /**
   * 由 UI 的取樣計時器打點（⛔ **不在 rAF 迴圈裡**）。自己節流到
   * `lifecycleSampleSec`，關掉時是一個 `boolean` 判斷就返回。
   */
  tick(nowSec: number): LifecycleSample | null {
    const p = ledgerPolicy();
    if (!p.enabled || !Number.isFinite(nowSec)) return null;
    if (nowSec < this.nextSampleSec) return null;
    this.nextSampleSec = nowSec + p.sampleSec;
    return this.take("now", nowSec, p);
  }

  /**
   * 回合邊界記一筆（`roundFxRegistry` 在 `enter` 那一側呼叫）。
   * ⭐ 只取一側 —— 兩側的場上狀態不可比（`leave` 是清場前、`enter` 是清場後），
   * 混在同一條序列裡等於拿蘋果跟橘子算成長。
   */
  markRound(nowSec: number): LifecycleSample | null {
    const p = ledgerPolicy();
    if (!p.enabled || !Number.isFinite(nowSec)) return null;
    const s = this.take(`R${++this.roundNo}`, nowSec, p);
    if (!s) return null;
    this.rounds.push(s);
    while (this.rounds.length > p.history) this.rounds.shift();
    this.publish(p);
    return s;
  }

  latest(): LifecycleSample | null {
    return this.last;
  }

  /**
   * ⭐ 誠實普查（見 `SceneTruth`）—— `__ggdDiag()` 用它把「總數 vs 真的在畫」並排。
   * ⛔ 讀不到的欄位回 **-1**，⛔ 不是 0：「這台瀏覽器沒給我這個數字」與
   * 「場上一顆粒子都沒有」是兩件完全不同的事，而它們在 0 上長得一模一樣。
   */
  sceneTruth(): SceneTruth {
    const s = this.sceneRef?.deref();
    if (!s) {
      return {
        bound: false, meshesTotal: 0, meshesEnabled: 0, meshesActive: -1,
        particleSystems: 0, particlesLive: -1, materials: 0, textures: 0,
        transformNodes: 0, geometries: 0,
      };
    }
    let enabled = 0;
    for (const m of s.meshes) if (!m.isEnabled || m.isEnabled()) enabled++;
    let live = -1;
    for (const ps of s.particleSystems) {
      const n = ps.getActiveCount?.();
      if (typeof n === "number" && Number.isFinite(n)) live = (live < 0 ? 0 : live) + n;
    }
    let active = -1;
    try {
      const am = s.getActiveMeshes?.();
      if (am && typeof am.length === "number") active = am.length;
    } catch {
      active = -1; // ⛔ 量表自己壞了要看得見（同 `take()` 的 gauge 迴圈）
    }
    return {
      bound: true,
      meshesTotal: s.meshes.length,
      meshesEnabled: enabled,
      meshesActive: active,
      particleSystems: s.particleSystems.length,
      particlesLive: live,
      materials: s.materials.length,
      textures: s.textures.length,
      transformNodes: s.transformNodes.length,
      geometries: s.geometries?.length ?? 0,
    };
  }

  history(): readonly LifecycleSample[] {
    return this.rounds;
  }

  /**
   * ⭐ **還在長的那幾類。** 三個條件同時成立才算（⛔ 一條都不能少）：
   *   ① 窗口內每一段差值 ≥ 0（單調不減 —— 有掉下來過就不是累積）
   *   ② 最新 − 最舊 ≥ `minDelta`（⛔ 不是「多了一個」就叫）
   *   ③ ⭐ **最後一段仍然 > 0** —— 一個**有界的快取**（例：地面貼圖每種風格 4 張，
   *      出貨 8 種風格 ⇒ 32 張封頂）長到頂之後就會平掉，而它平掉的那一刻警報就
   *      該熄。⛔ 少了這一條，警報會在每一場比賽的前十回合亮著 —— 而一個**一直
   *      亮著的警報等於沒有警報**。真正的無界洩漏永遠平不下來，所以它一直被指名。
   */
  suspects(minDelta = ledgerPolicy().minDelta): LifecycleSuspect[] {
    const n = this.rounds.length;
    if (n < 3) return [];
    const out: LifecycleSuspect[] = [];
    for (const kind of Object.keys(this.rounds[n - 1]!.kinds)) {
      const seq = this.rounds.map((r) => r.kinds[kind]?.live ?? 0);
      let monotone = true;
      for (let i = 1; i < n; i++) if (seq[i]! < seq[i - 1]!) monotone = false;
      const delta = seq[n - 1]! - seq[0]!;
      if (!monotone || delta < minDelta) continue;
      if (seq[n - 1]! - seq[n - 2]! <= 0) continue; // ③ 已經平了 ⇒ 有界，不叫
      out.push({
        kind,
        first: seq[0]!,
        last: seq[n - 1]!,
        delta,
        oldestSec: this.rounds[n - 1]!.kinds[kind]?.oldestSec ?? 0,
      });
    }
    return out.sort((a, b) => b.delta - a.delta);
  }

  /** 最新一筆裡「最老的那一個超過 `maxAgeSec`」的類別（⛔ 只描述，不清理）。 */
  overdue(maxAgeSec = ledgerPolicy().maxAgeSec): string[] {
    if (maxAgeSec <= 0 || !this.last) return [];
    return Object.entries(this.last.kinds)
      .filter(([, s]) => s.oldestSec > maxAgeSec)
      .sort((a, b) => b[1].oldestSec - a[1].oldestSec)
      .map(([k, s]) => `${k} ${Math.round(s.oldestSec)}s×${s.live}`);
  }

  /**
   * ⭐ **一鍵匯出** —— 逐回合 × 逐類別的表，可以直接貼給 owner／貼進票裡。
   * 主控台輸入 `__ggdLifecycle()` 就拿得到（見檔尾）。
   */
  report(): string {
    const rows = this.rounds;
    if (rows.length === 0) return "[lifecycle] 還沒有任何回合快照（是不是還沒開打？）";
    const kinds = [...new Set(rows.flatMap((r) => Object.keys(r.kinds)))]
      .map((k) => ({ k, span: (rows[rows.length - 1]!.kinds[k]?.live ?? 0) - (rows[0]!.kinds[k]?.live ?? 0) }))
      .sort((a, b) => b.span - a.span || a.k.localeCompare(b.k))
      .slice(0, REPORT_ROWS);
    const head = ["kind".padEnd(26), ...rows.map((r) => r.label.padStart(6)), "  最老(s)"].join("");
    const body = kinds.map(({ k }) => {
      const cells = rows.map((r) => String(r.kinds[k]?.live ?? 0).padStart(6));
      const age = Math.round(rows[rows.length - 1]!.kinds[k]?.oldestSec ?? 0);
      return [k.padEnd(26), ...cells, `  ${age}`].join("");
    });
    const sus = this.suspects();
    const tail = [
      "",
      sus.length === 0
        ? "⭐ 沒有一類還在長（單調不減 且 增量達標 且 最後一段仍在增）"
        : `⛔ 還在長：${sus.map((s) => `${s.kind} ${s.first}→${s.last}(+${s.delta})`).join(" · ")}`,
      this.overdue().length === 0 ? "" : `⏱ 超齡：${this.overdue().slice(0, 8).join(" · ")}`,
      this.droppedGauges === 0 ? "" : `⚠️ 量表溢位 ×${this.droppedGauges}（超過 ${MAX_KINDS} 格）`,
    ].filter((l) => l !== "");
    return ["[lifecycle] 逐回合 × 逐類別（live 數；最右一欄＝最老的至少活了幾秒）", head, ...body, ...tail].join("\n");
  }

  // ── 內部 ────────────────────────────────────────────────────────────────

  private take(label: string, nowSec: number, p: LedgerPolicy): LifecycleSample | null {
    const scene = this.sceneRef?.deref();
    const kinds: Record<string, KindStat> = {};
    const bump = (bucket: string, raw: string, obj: object): void => {
      let kind = `${bucket}:${ledgerSlug(raw)}`;
      if (!this.kinds.has(kind)) {
        if (this.kinds.size >= MAX_KINDS) kind = `${bucket}:…`;
        this.kinds.add(kind);
      }
      let seen = this.firstSeen.get(obj);
      if (seen === undefined) {
        seen = nowSec;
        this.firstSeen.set(obj, seen);
      }
      const stat = (kinds[kind] ??= { live: 0, oldestSec: 0 });
      stat.live++;
      stat.oldestSec = Math.max(stat.oldestSec, nowSec - seen);
    };
    if (scene) {
      for (const m of scene.meshes) bump("mesh", m.name ?? "", m);
      for (const m of scene.materials) bump("mat", m.name ?? "", m);
      for (const t of scene.textures) bump("tex", t.name ?? "", t);
      for (const ps of scene.particleSystems) bump("ps", ps.name ?? "", ps);
      for (const n of scene.transformNodes) bump("node", n.name ?? "", n);
      // ⚠️ `Geometry` 的 id 是雜湊 ⇒ 逐個分類會**炸掉類別數**（22 個 id = 22 類）。
      //    它們整包一類：這一格要回答的是「幾何體有沒有在長」，⛔ 不是「哪一顆」。
      for (const g of scene.geometries ?? []) bump("geo", "all", g);
      // 🧹 GH#782 —— 軌與骨架**不是節點**（見 `LedgerScene` 的註解）：
      //    少了這兩行，一個 clipGroups 記帳缺陷可以漏掉幾百條每幀都在被走訪的軌，
      //    而這支「生命週期監控」一個字都不會說。
      for (const a of scene.animationGroups ?? []) bump("anim", a.name ?? "", a);
      for (const sk of scene.skeletons ?? []) bump("skel", sk.name ?? "", sk);
    }
    for (const [kind, read] of this.gauges) {
      let live = -1; // ⛔ 量表自己壞了要看得見,⛔ 不是靜靜回 0
      try {
        const v = read();
        if (typeof v === "number" && Number.isFinite(v)) live = v;
      } catch {
        live = -1;
      }
      kinds[kind] = { live, oldestSec: 0 };
    }
    if (!scene && this.gauges.size === 0) return null;
    const sample: LifecycleSample = { atSec: nowSec, label, kinds };
    this.last = sample;
    if (label === "now") this.publish(p);
    return sample;
  }

  /**
   * fail-loud：把「還在長幾類」寫進 perfBus，並在 console 印完整的表。
   *
   * 🧹 GH#782 —— 在此之前這裡是「**一場只印一次**」（`announced` 布林），
   * 於是第 2 類、第 3 類開始漏的東西一個字都不印 —— 而 owner 看 console 的
   * 時刻多半在**後來**。⇒ 改成**每出現一個新的類別就再印一次**（同一批類別
   * 持續亮著仍然不洗版）。
   */
  private publish(p: LedgerPolicy): void {
    const sus = this.suspects(p.minDelta);
    perfBus.lifecycleGrowth = sus.length;
    perfBus.lifecycleWorst = sus[0]?.kind ?? "";
    const fresh = sus.filter((s) => !this.announcedKinds.has(s.kind));
    if (fresh.length > 0) {
      for (const s of fresh) this.announcedKinds.add(s.kind);
      console.warn(
        `[lifecycle] ⛔ 偵測到還在長的類別 ×${sus.length}（新指名：${fresh.map((s) => s.kind).join(" · ")}）\n${this.report()}`,
      );
    }
  }
}

/** 出貨的那一個（`createRoundFx` 綁場景、`PerfOverlay` 的取樣計時器打點）。 */
export const lifecycleLedger = new LifecycleLedger();

/**
 * ⭐ 一鍵匯出：主控台輸入 `__ggdLifecycle()` 就印出整張表。
 * ⛔ 刻意掛在 `globalThis` 而不是做一個 UI 按鈕：owner 回報 lag 的時候手上有的
 * 是 F12，⛔ 不是一個要先找到的面板；而且它回傳字串所以複製得走。
 */
(globalThis as { __ggdLifecycle?: () => string }).__ggdLifecycle = () => lifecycleLedger.report();

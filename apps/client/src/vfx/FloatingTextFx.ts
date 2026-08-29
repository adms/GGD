/**
 * FloatingTextFx —— `floatingText` 的模型（原作 `CreateTextTagUnitBJ`）。
 *
 * owner 2026-08-22 點名:「別忘了還有特效文字」。
 * 原作最有代表性的用法是克勞德的連段,每一刀在頭上冒一個
 * `"1Hit"`…`"7Hit"`(`war3map.j:33856`)。
 *
 * ── 這**不是** `ui/combatText` ────────────────────────────────────────────────
 * `ui/combatText` 是**傷害數字**:類別、陣營關係、傷害學派、admission 優先序、
 * RO 的拋物線。它的每一格語意都綁在「誰打誰、打多少」上,而 `floatingText` 是
 * **技能作者寫的一句話**,沒有類別也沒有數字。硬塞進去要在 `CombatTextCategory`
 * 上開一個「其他」分支,然後 `combatTextStyle` 的調色/字級/漂移/優先序**七格**
 * 全部要為它開例外 —— 那正是第〇·五守則說的「為某支技能寫一個 if」。
 *
 * ⭐ 兩者共用的**只有**節奏常數的立場,⛔ 不是實作:
 *   · 固定池(⛔ 不是每次 new 一個 DOM/mesh)——克勞德一次七個;
 *   · 同一個 anchor 上的多發要**錯開**,⛔ 不是疊成一堆;
 *   · 沒有 merge window(重新彈的節點會沿自己的弧線倒退,原作從不倒退)。
 *
 * ── ⛔ 這裡沒有 DOM,也沒有 Babylon ────────────────────────────────────────────
 * 與 `ui/combatText` 同一個理由:渲染只有一個地方(世界錨點層)在做,這裡只算
 * 「有哪些字、在哪、多大、多透明」。所以 vitest 在 node 就量得到運動與回收,
 * ⛔ 不需要 GPU,也不會出現「算出來但畫在畫面外」(失敗形態①)。
 *
 * ⚠️ `{{i}}` 佔位符**不在這裡代入** —— 發射端(引擎/技能執行)代入之後把**算好的
 * 字串**送進來。理由是第〇·四守則的同一個形狀:一個模板兩個代入點 = 兩份會漂的真相。
 */

import type { FloatingTextDrift } from "@ggd/shared/sim/effects/clientCues";

/** 一個活著的文字實例。⚠️ 這是**池子的元素**，⛔ 不要在外面 new 它。 */
export interface FloatingTextEntry {
  active: boolean;
  /** 池位（穩定，渲染端可以拿來當 key，⛔ 不要用陣列索引） */
  readonly slot: number;
  /** 每次重用 +1；渲染端用 `${slot}:${gen}` 判斷「這是不是同一個字」 */
  gen: number;
  text: string;
  /** 出生時的世界座標（⚠️ 這是一個**快照**，⛔ 不跟著單位走 —— 原作也不跟） */
  x: number;
  y: number;
  z: number;
  /** 目前的抬升高度（世界單位，疊加在 y 上） */
  lift: number;
  /**
   * ⭐ GH#853 —— 目前累積的**地面平面**位移（疊加在 `x`／`z` 上）。
   *
   * ⚠️ 為什麼是分開的兩格而不是直接改 `x`／`z`：`spawn()` 拿 `x`／`z` 判
   * 「這一發是不是落在同一個錨點上」（分道與錯開）。⭐ `x`／`z` 是**出生快照**，
   * 一旦讓它漂走，第七刀就會判成「新的錨點」⇒ 七個字疊成一堆（原作是錯開的）。
   */
  driftX: number;
  driftZ: number;
  /** 地面平面速度（世界單位/秒）—— 出生時由 {@link FloatingTextDrift} 一次算好 */
  driftVx: number;
  driftVz: number;
  r: number;
  g: number;
  b: number;
  /** 相對基準字級的倍率 */
  sizeScale: number;
  alpha: number;
  ageMs: number;
  lifeMs: number;
  /** 世界單位／秒 */
  riseSpeed: number;
  /** 同一個錨點上的第幾發（渲染端用來分道，⛔ 不要疊在同一條線上） */
  lane: number;
  /** 還要等幾毫秒才出現（同一幀多發要錯開） */
  delayMs: number;
}

/** 一發 `floatingText` 的可見那一半。 */
export interface FloatingTextSpawn {
  /** ⚠️ 已經代入過 `{{i}}` 的**成品**字串 */
  text: string;
  x: number;
  y: number;
  z: number;
  colorRgb?: [number, number, number];
  sizeScale?: number;
  /** 世界單位／秒 */
  riseSpeed?: number;
  durationSec?: number;
  /**
   * ⭐ GH#853 —— 地面平面的飄移（原作 `SetTextTagVelocityBJ`）。
   * ⛔ 缺席 ⇒ 只有垂直 `riseSpeed` ⇒ 與這一格出現之前逐位元相同。
   */
  drift?: FloatingTextDrift;
}

/**
 * ⭐ **這裡就是 BJ 的那一行**（`sim/effects/floatingText.ts` ⑤ 的另一半）。
 *
 * ```
 * call SetTextTagVelocity(tt, vel * Cos(angle * bj_DEGTORAD),
 *                             vel * Sin(angle * bj_DEGTORAD))
 * ```
 *
 * sim 送來的是「基準向量 ＋ 要轉幾度」（它不准碰三角函式，見 `sim/purity.test.ts`），
 * 所以旋轉在這裡做：基準 `(1,0)` 轉 θ 度就**逐字**是 `(cos θ, sin θ)`；
 * 基準 = 施法者面向時，轉 0 度就是「往他面對的方向飛」（＝ `GetUnitFacing(u)`）。
 *
 * ⚠️ 基準先正規化：`Transform.facing` 的長度沒有任何一條閘在保證，而一個
 * 長度 1.4 的面向會讓同一支技能**比作者寫的快 40%**（而且只在斜著站的時候）。
 * 退化成零向量 ⇒ 退回 `(1,0)`，⛔ 不是回 `(0,0)`（那會讓字靜默地不飄）。
 */
export function driftVelocity(d: FloatingTextDrift): { vx: number; vz: number } {
  const len = Math.sqrt(d.basisX * d.basisX + d.basisZ * d.basisZ);
  const bx = len > 0 ? d.basisX / len : 1;
  const bz = len > 0 ? d.basisZ / len : 0;
  const rad = (d.deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { vx: (bx * c - bz * s) * d.speed, vz: (bx * s + bz * c) * d.speed };
}

/**
 * 出貨預設 —— ⚠️ 這幾格是**預算與節奏**,⛔ 不是平衡值。
 * 顏色/字級/上浮速度/壽命全部由技能 JSON 帶進來(第〇·四守則)。
 *
 * ⚠️ `MAX_FLOATING_TEXT` 是**沒有內容時**的池子大小 —— 出貨走
 * `config.screen-fx@1.floatingTextMaxOnScreen`（見 {@link FloatingTextFxOptions}）。
 */
const MAX_FLOATING_TEXT = 48;
/** 池子大小的硬柵欄，逐字等於 `SCREEN_FX_BOUNDS.floatingTextMaxOnScreen`。 */
const MIN_POOL = 1;
const MAX_POOL = 200;
/** 同一個發射點最多同時掛幾個（克勞德七刀是錯開的，⛔ 不是同時七個）。 */
const MAX_PER_ANCHOR = 8;
/** 同一幀落在同一點的多發，每發往後推這麼多毫秒（原作 `0.2f * i` 的縮版）。 */
const STAGGER_MS = 90;
/** 壽命走到這個比例之後開始淡出（原作 `SetTextTagFadepoint`）。 */
const FADE_FROM = 0.55;
/** 沒寫 `durationSec` 時的壽命（原作 `SetTextTagLifespan` 常見值）。 */
const DEFAULT_LIFE_MS = 1600;
/** 沒寫 `riseSpeed` 時的上浮速度。 */
const DEFAULT_RISE = 1.4;
/** 沒寫顏色時：白（原作預設也是白）。 */
const DEFAULT_RGB: readonly [number, number, number] = [255, 255, 255];
/** 兩發算不算「同一個錨點」的世界距離（平方比較，⛔ 不開根號）。 */
const ANCHOR_EPS_SQ = 0.36;

/**
 * ⭐ GH#549 —— 這一層的兩格後台旋鈕（`config.screen-fx@1`）。
 *
 * ⚠️ 兩格都在**建構時**吃掉，⛔ 不是每次 `spawn` 再查一次登錄表：池子是預先配置的
 * （見下面那一行的理由），而一個「會 resize 的池子」就不是池子了。
 * ⇒ 後台改了要**玩家下一次重新整理**才生效 —— 與 `feelFx()` 那一族同一個語意。
 */
export interface FloatingTextFxOptions {
  /** `floatingTextMaxOnScreen` —— 池子大小（＝同時最多幾段字）。 */
  capacity?: number;
  /** `floatingTextScale` —— 全域字級倍率，乘在技能寫的 `sizeScale` 上。 */
  scaleMult?: number;
}

const clampInt = (v: number | undefined, lo: number, hi: number, fallback: number): number => {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v)));
};

/**
 * ⛔⛔ **GH#701 —— 這一格是「誰在畫」的答案，⛔ 不是一個方便的全域變數。**
 *
 * 在此之前這個檔的檔頭寫著「渲染只有一個地方（世界錨點層）在做」，而
 * `VfxSystem.floatingTextEntries` 的註解寫著「由 `ui/WorldAnchorLayer` 每幀讀」
 * —— **兩句都是假的**（第三守則）：`grep` 全 repo，那個 getter 的消費端只有測試，
 * 出貨路徑 **0 個** ⇒ sim 發了、池子裡是 active 的、而**畫面上一個像素都沒有**
 * （失敗形態⑧：消費端存在，但它消費不到 —— 這裡連消費端都不存在）。
 *
 * ⭐ 為什麼是一份**登錄表**而不是 `VfxSystem` 上的一格：
 * HUD 是 React、特效是 Babylon，兩邊的生命週期**沒有共同的父**（`GameApp` 建
 * `VfxSystem`，`HudRoot` 掛 `WorldAnchorLayer`，兩者互不知道對方存在）。
 * 要嘛在 `GameApp` 加一行接線（⛔ 第〇·六守則點名的「一行接線」病，而且那個檔正是
 * lane 互撞的重災區），要嘛讓**這一層自己報到**。⇒ 建構＝報到、`dispose()`＝離開。
 *
 * ⚠️ 出貨永遠只有**一個**（`VfxSystem` 建的那個）；測試會有好幾個，所以渲染端
 * 一律**逐層走**，⛔ 不假設 size === 1。
 */
const liveLayers = new Set<FloatingTextFx>();

/** 目前活著的浮字層 —— 渲染端（`ui/WorldAnchorLayer`）每幀逐層走這一份。 */
export const floatingTextLayers: ReadonlySet<FloatingTextFx> = liveLayers;

export class FloatingTextFx {
  private disposed = false;
  /** 全域字級倍率（⛔ 不夾成 0：0 = 看不見的字 = 一段沒有人讀得到的話）。 */
  private readonly scaleMult: number;
  /** ⭐ 池**就是**儲存體:預先配置、⛔ 永不 resize（同 frameBus 的 combatTextPool）。 */
  private readonly pool: FloatingTextEntry[];

  constructor(opts: FloatingTextFxOptions = {}) {
    this.scaleMult =
      opts.scaleMult !== undefined && Number.isFinite(opts.scaleMult) && opts.scaleMult > 0
        ? opts.scaleMult
        : 1;
    this.pool = Array.from(
      { length: clampInt(opts.capacity, MIN_POOL, MAX_POOL, MAX_FLOATING_TEXT) },
      (_, slot) => ({
        active: false,
        slot,
        gen: 0,
        text: "",
        x: 0,
        y: 0,
        z: 0,
        lift: 0,
        driftX: 0,
        driftZ: 0,
        driftVx: 0,
        driftVz: 0,
        r: 255,
        g: 255,
        b: 255,
        sizeScale: 1,
        alpha: 0,
        ageMs: 0,
        lifeMs: 0,
        riseSpeed: DEFAULT_RISE,
        lane: 0,
        delayMs: 0,
      }),
    );
    // ⭐ GH#701 —— 報到。⛔ 少了這一行，渲染端逐幀走的是一個**空的**集合，
    //    而 sim / VfxSystem / 這個池子每一層都完全正常（＝這個缺陷原本的樣子）。
    liveLayers.add(this);
  }

  /** 渲染端逐幀掃這一份（⛔ 不要複製它 —— 它是穩定的、零配置的）。 */
  get entries(): readonly FloatingTextEntry[] {
    return this.pool;
  }

  get liveCount(): number {
    let n = 0;
    for (const e of this.pool) if (e.active) n++;
    return n;
  }

  /**
   * 放一發。回傳有沒有排進去（false = 這個錨點已經滿了，或全池滿且它最弱）。
   *
   * ⚠️ 全池滿的時候搶佔的是**最接近死亡**的那一個,⛔ 不是第 0 格 ——
   * 後者會把一個剛出生的字直接擦掉,而玩家看到的是「文字閃一下就不見」。
   */
  spawn(s: FloatingTextSpawn): boolean {
    const [dr, dg, db] = DEFAULT_RGB;
    const [r, g, b] = s.colorRgb ?? [dr, dg, db];

    // 同一個錨點上已經有幾發 → 決定分道與錯開
    let onAnchor = 0;
    for (const e of this.pool) {
      if (!e.active) continue;
      const dx = e.x - s.x;
      const dz = e.z - s.z;
      if (dx * dx + dz * dz <= ANCHOR_EPS_SQ) onAnchor++;
    }
    if (onAnchor >= MAX_PER_ANCHOR) return false;

    let slot = this.pool.find((e) => !e.active);
    if (!slot) {
      slot = this.pool[0]!;
      for (const e of this.pool) {
        if (e.lifeMs - e.ageMs < slot.lifeMs - slot.ageMs) slot = e;
      }
    }

    slot.active = true;
    slot.gen++;
    slot.text = s.text;
    slot.x = s.x;
    slot.y = s.y;
    slot.z = s.z;
    slot.lift = 0;
    slot.driftX = 0;
    slot.driftZ = 0;
    // ⭐ GH#853 —— 角度只解一次(出生時),⛔ 不是每幀重算:原作的 texttag 也是
    //    `SetTextTagVelocity` 設一次就固定,而每幀重算會讓一個轉身的施法者把
    //    已經飛出去的字**拖回來**。
    if (s.drift !== undefined && s.drift.speed > 0) {
      const v = driftVelocity(s.drift);
      slot.driftVx = v.vx;
      slot.driftVz = v.vz;
    } else {
      slot.driftVx = 0;
      slot.driftVz = 0;
    }
    slot.r = r;
    slot.g = g;
    slot.b = b;
    // ⭐ 技能寫的是**相對**字級，後台那一格是全域倍率（第〇·四守則：一個值一個住處）。
    slot.sizeScale =
      (s.sizeScale !== undefined && s.sizeScale > 0 ? s.sizeScale : 1) * this.scaleMult;
    slot.riseSpeed = s.riseSpeed !== undefined && s.riseSpeed > 0 ? s.riseSpeed : DEFAULT_RISE;
    slot.lifeMs =
      s.durationSec !== undefined && s.durationSec > 0 ? s.durationSec * 1000 : DEFAULT_LIFE_MS;
    slot.ageMs = 0;
    slot.lane = onAnchor;
    slot.delayMs = onAnchor * STAGGER_MS;
    slot.alpha = 0;
    return true;
  }

  /** 推進每一發:上浮 + 淡出 + 到期回收。 */
  tick(dtMs: number): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      if (e.delayMs > 0) {
        e.delayMs -= dtMs;
        e.alpha = 0;
        continue;
      }
      e.ageMs += dtMs;
      if (e.ageMs >= e.lifeMs) {
        e.active = false;
        e.alpha = 0;
        e.text = "";
        continue;
      }
      e.lift += (e.riseSpeed * dtMs) / 1000;
      // ⭐ GH#853 —— 地面平面那一半。與 `lift` 同一個節拍、同一個積分式，
      //    ⛔ 不是第二套運動系統（`riseSpeed` 是垂直軸,這兩格是水平軸）。
      e.driftX += (e.driftVx * dtMs) / 1000;
      e.driftZ += (e.driftVz * dtMs) / 1000;
      const t = e.ageMs / e.lifeMs;
      e.alpha = t <= FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
    }
  }

  /** 回合邊界:整池清空（⛔ 不留字到下一回合）。 */
  /** 收攤。⛔ 與 `resetForRound` 不同:那是回合邊界,這是整個 VfxSystem 被丟掉。 */
  dispose(): void {
    this.disposed = true;
    liveLayers.delete(this); // ⛔ 不留一個對著死掉的世界報座標的層
    this.resetForRound();
  }

  resetForRound(): void {
    for (const e of this.pool) {
      e.active = false;
      e.alpha = 0;
      e.text = "";
    }
  }
}

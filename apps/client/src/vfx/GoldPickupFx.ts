/**
 * GoldPickupFx —— 殭屍死掉掉一枚小金幣 → 停 1 秒 → **貝茲曲線加速**吸回擊殺者
 * → **輕**音效（連擊時音階升高）。GH#494，owner 2026-08-21。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⭐ 它碰不到任何一塊錢，而那是刻意的
 * ───────────────────────────────────────────────────────────────────────────
 * 賞金在伺服器的 `sim/systems/MobSystem.ts` 就發完了。這一層收到的 `mobSlain`
 * 是那件事**已經發生**的公告，所以 `gold` 這個欄位在整條路徑上**沒有被讀**。
 * ⇒ `enabled: false` 之後玩家拿到的錢**逐位元等於**這個功能存在之前，
 * 而且不是因為我們小心，是因為根本沒有一條路可以寫到錢。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 回收（#262 的教訓，⛔ 與「60 隻同時死」無關）
 * ───────────────────────────────────────────────────────────────────────────
 * owner 2026-07-30：「洩漏的粒子/mesh 回收 **很重要**」、「越打越鈍」。
 * 所以這一層的每一枚金幣都是**一個 InstancedMesh**，落地那一幀就 `dispose()`：
 *   · 材質與來源網格**整層只有一份**（instance 共用它們），所以「開了幾百次」
 *     不會讓 material/texture 的數量長大；
 *   · `reset()`（回合邊界）與 `dispose()`（離場）都把還在飛的清掉 ——
 *     ⛔ 沒有「等它自己飛完」這條路，回合結束時場上不可以留著上一回合的錢。
 * `activeCount` 是給診斷面板用的：靜默地漏才是缺陷（CLAUDE.md fail-open 那一節）。
 *
 * ⚠️ `maxConcurrent` 滿了的時候是**直接算成已吸取**（不畫那一段），⛔ 不是排隊 ——
 * 排隊會讓金幣在戰鬥結束後才慢慢飛回來，那比不畫還糟。
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  bezierAt,
  comboSemitones,
  easeAccelerate,
  feelFx,
  flightControlPoint,
  semitonesToPlaybackRate,
  sfxAllowed,
  type ConfigFeelFxDoc,
  type Vec2,
  type Vec3,
} from "./feelFx";

/** 金幣的世界尺寸 —— 小。它是「一枚零錢」，⛔ 不是 `CoinView` 那種 100 金的獎品。 */
const COIN_DIAMETER = 0.3;
const COIN_THICKNESS = 0.05;
/** 起飛前躺在屍體上的高度，以及被吸進身體時的高度（胸口，⛔ 不是腳底）。 */
const GROUND_Y = 0.28;
const CHEST_Y = 1.1;
/** 停留時的自轉速度（rad/ms）。純視覺，讓它在原地時看得出是「一枚硬幣」。 */
const SPIN_SPEED = 0.006;

/** 這一層播音效要用的 SFX key。⭐ 沿用既有 clip，⛔ 不新增 12 個音檔（第零守則⑨）。 */
export const GOLD_PICKUP_SFX = "coinPickup";
/**
 * 它自己的 SfxGate 頻道。⚠️ 一定要和 `coinPickup`（#191 陣亡投幣）分開：
 * gate 的冷卻是**跨幀且以 key 為單位**的，共用一格會讓殭屍的零錢把投幣的
 * 提示音餓死（`SfxPlayOptions.gateKey` 的檔頭記著量到的 21% 那次）。
 */
export const GOLD_PICKUP_GATE_KEY = "goldPickupFx";

/** 一枚正在演的金幣。 */
interface Coin {
  inst: InstancedMesh;
  from: Vec2;
  /** 擊殺者的實體 id —— 目標**每一幀重算**，因為英雄會邊打邊跑。 */
  killer: number;
  /** 擊殺者失聯（死了／離場）時最後一次看到的位置。 */
  lastTarget: Vec2;
  /** 絕對時間（ms）。⛔ 不是遞減計數器 —— 掉幀時遞減計數器會走慢。 */
  hoverUntilMs: number;
  arriveAtMs: number;
  /** 這一鏈的連擊數，在**掉落那一刻**定格（見 `spawn` 的註解）。 */
  comboCount: number;
}

export interface GoldPickupDeps {
  /** 實體的渲染位置（`VfxContext.entityPos`）。 */
  entityPos(id: number): Vec2 | null;
  /** 走既有音訊管線（音量/靜音/SfxGate 全部自動適用）。⛔ 不要自己碰 WebAudio。 */
  playSfx(event: string, opts: { volume?: number; gateKey?: string; semitones?: number }): boolean;
  /** 政策讀取的接縫（測試用）。出貨走 `feelFx()`。 */
  policy?(): ConfigFeelFxDoc;
}

export class GoldPickupFx {
  private static counter = 0;
  private readonly source: Mesh;
  private readonly coins: Coin[] = [];
  /**
   * 每個擊殺者的連段音階記憶。⚠️ 這**不是**連擊計數 —— 計數是 sim 給的
   * （`sim/combat/killCombo.ts`），這裡只記「最後一次聽到的是第幾階、什麼時候」，
   * 好讓 `resetAfterSeconds` 過了就回到基準音。
   */
  private readonly combo = new Map<number, { count: number; atMs: number }>();
  /** 每個擊殺者最後一次被看到的位置 —— 屍體與擊殺者都可能在事件到達時已經沒了。 */
  private readonly lastBody = new Map<number, Vec2>();
  private lastSfxMs = -Infinity;
  private spawned = 0;
  private skipped = 0;

  constructor(
    private readonly scene: Scene,
    private readonly deps: GoldPickupDeps,
  ) {
    // ⚠️ 名字**刻意**不是 `goldPickup-…`：`instanceCount` 用那個前綴數「場上還有
    // 幾枚錢」，來源網格混進去會讓洩漏守衛永遠差 1，而那正是「守衛自己說謊」。
    this.source = MeshBuilder.CreateCylinder(
      `goldPickupSrc-${GoldPickupFx.counter++}`,
      { diameter: COIN_DIAMETER, height: COIN_THICKNESS, tessellation: 10 },
      scene,
    );
    const mat = new StandardMaterial(`${this.source.name}-mat`, scene);
    // 無光照的自發光金色：這個場景沒有 bloom / GlowLayer，「發光」只能靠 emissive
    // （`render/views/CoinView.ts` 的檔頭記著同一件事）。
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 0.86, 0.42);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    this.source.material = mat;
    // 立起來 —— 68° 俯角的相機看平躺的圓盤只有一條線（CoinView 踩過的那個坑）。
    this.source.rotation.x = Math.PI / 2;
    this.source.isVisible = false;
    this.source.isPickable = false;
  }

  /** 還在飛的金幣數（診斷面板／測試用）。 */
  get activeCount(): number {
    return this.coins.length;
  }

  /** 這一場總共畫了幾枚 / 因為上限被略過幾枚（診斷用；⛔ 略過不代表少拿錢）。 */
  get stats(): { spawned: number; skipped: number } {
    return { spawned: this.spawned, skipped: this.skipped };
  }

  /**
   * 記下一具身體這一幀在哪。由 `VfxSystem.syncGroundEntities` 每幀餵進來。
   *
   * ⚠️ 為什麼需要它：`mobSlain` 的 payload **沒有 x/z**，而殭屍在事件到達時
   * 通常已經從快照裡消失了（sim 在同一個 tick `destroyAfterHooks`），
   * 於是 `entityPos()` 會回 null —— 沒有這張表的話，金幣會掉在原點或根本不掉。
   */
  noteBody(id: number, pos: Vec2): void {
    this.lastBody.set(id, { x: pos.x, z: pos.z });
    // 有界：屍體的位置只在死亡後那幾幀有用，⛔ 但不能無限長。
    if (this.lastBody.size > 512) {
      const first = this.lastBody.keys().next();
      if (!first.done) this.lastBody.delete(first.value);
    }
  }

  /**
   * 記下 sim 算出來的連擊數。⭐ 數字**來自 `killCombo` 事件**（sim/combat/killCombo.ts），
   * ⛔ 這一層不自己數 —— 同一 tick 的 AoE 連殺在網路上是一批事件，用到達時間去
   * 分辨「一次橫掃」與「兩次擊殺」是猜的，而 sim 用的是 tick 差。
   */
  noteCombo(killer: number, count: number, nowMs: number): void {
    this.combo.set(killer, { count, atMs: nowMs });
    if (this.combo.size > 64) {
      const first = this.combo.keys().next();
      if (!first.done) this.combo.delete(first.value);
    }
  }

  /**
   * 一隻殭屍死了 —— 收的是 `mobSlain` 的 payload 原封不動。
   * `killer` 是 `mobSlain.killer`（⚠️ 火圈/環境擊殺是 null，那時候沒有人可以吸，
   * 所以什麼都不畫）。
   *
   * ⭐ `gold` **收下來但一行都不讀**，而那是刻意的、而且有守衛在數：
   * `feelFx.test.ts` 拿兩個只有 `gold` 不同的事件跑完整條軌跡，斷言**逐格相同**。
   * 這一格存在的意義是讓「這一層不碰錢」變成一條**會紅的行為斷言**，
   * ⛔ 而不是一句寫在註解裡、下一個人加一行 `count = gold / 10` 就悄悄失效的話。
   *
   * ⭐ **連擊數在這裡定格**，不是在落地那一刻讀：金幣飛了一秒多才進口袋，
   * 那時候連擊鏈可能已經跑到第 9 段了 —— 用當下的數字會讓音階跟畫面上正在
   * 消失的那一枚金幣對不起來，聽起來像是隨機的。
   */
  spawn(ev: { mobId: number; killer: number | null; gold?: number }, nowMs: number): void {
    const { mobId, killer } = ev;
    if (killer === null || killer === undefined) return;
    const cfg = this.policy().goldPickup;
    if (!cfg.enabled) return;
    const from = this.deps.entityPos(mobId) ?? this.lastBody.get(mobId) ?? null;
    const target = this.deps.entityPos(killer) ?? this.lastBody.get(killer) ?? null;
    if (!from || !target) return;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.z)) return;
    // 上限：滿了就直接算成已吸取（錢早就到手了），⛔ 不排隊。
    if (this.coins.length >= cfg.maxConcurrent) {
      this.skipped += 1;
      return;
    }
    const inst = this.source.createInstance(`goldPickup-${GoldPickupFx.counter++}`);
    inst.isPickable = false;
    inst.position.set(from.x, GROUND_Y, from.z);
    inst.rotation.x = Math.PI / 2;
    const hoverUntilMs = nowMs + cfg.hoverSeconds * 1000;
    this.coins.push({
      inst,
      from: { x: from.x, z: from.z },
      killer,
      lastTarget: { x: target.x, z: target.z },
      hoverUntilMs,
      arriveAtMs: hoverUntilMs + cfg.flightSeconds * 1000,
      comboCount: this.comboAt(killer, nowMs),
    });
    this.spawned += 1;
  }

  /** 推進每一枚金幣。到站的那一枚播音效、`dispose()`，然後離開陣列。 */
  update(nowMs: number): void {
    if (this.coins.length === 0) return;
    const doc = this.policy();
    const cfg = doc.goldPickup;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]!;
      const live = this.deps.entityPos(coin.killer);
      if (live && Number.isFinite(live.x) && Number.isFinite(live.z)) {
        coin.lastTarget = { x: live.x, z: live.z };
      }
      if (nowMs < coin.hoverUntilMs) {
        // ① 停留：原地自轉。owner 指定 1 秒 —— 這一段是「看得到掉了東西」。
        coin.inst.rotation.y = nowMs * SPIN_SPEED;
        continue;
      }
      const span = Math.max(1, coin.arriveAtMs - coin.hoverUntilMs);
      const raw = (nowMs - coin.hoverUntilMs) / span;
      if (raw >= 1) {
        this.arrive(coin, doc, nowMs);
        this.coins.splice(i, 1);
        continue;
      }
      // ② 吸回：**先緩動再取樣貝茲**。兩件事分開，因為 owner 分別點名了
      //    「貝茲曲線」（彎度）與「加速」（步調）。
      const t = easeAccelerate(raw, cfg.easePower);
      const ctrl = flightControlPoint(coin.from, coin.lastTarget, cfg.arcHeight, GROUND_Y);
      const p: Vec3 = bezierAt(coin.from, ctrl, coin.lastTarget, GROUND_Y, t);
      // 終點抬到胸口：金幣要沒入身體，⛔ 不是滑進腳邊的地板。
      coin.inst.position.set(p.x, p.y + (CHEST_Y - GROUND_Y) * t, p.z);
      coin.inst.rotation.y = nowMs * SPIN_SPEED * 2;
    }
  }

  /** 回合邊界：還在飛的錢**不留到下一回合**。 */
  reset(): void {
    for (const c of this.coins) c.inst.dispose();
    this.coins.length = 0;
    this.combo.clear();
    this.lastBody.clear();
    this.lastSfxMs = -Infinity;
  }

  dispose(): void {
    this.reset();
    this.source.material?.dispose();
    this.source.dispose();
  }

  // ── private ───────────────────────────────────────────────────────────────

  private policy(): ConfigFeelFxDoc {
    return this.deps.policy ? this.deps.policy() : feelFx();
  }

  /** 這一刻擊殺者的音階段數（過了 `resetAfterSeconds` 就回到基準音）。 */
  private comboAt(killer: number, nowMs: number): number {
    const st = this.combo.get(killer);
    if (!st) return 1;
    const windowMs = this.policy().comboPitch.resetAfterSeconds * 1000;
    return nowMs - st.atMs <= windowMs ? st.count : 1;
  }

  /**
   * ③ + ④ + ⑤：金幣沒入身體 → **輕**音效，音階隨連段升高（有上限）。
   *
   * ⚠️ 節流是**不播**而不是延後（見 `sfxAllowed`）：一次橫掃掉六枚錢，六個「叮」
   * 疊在一起就是噪音，而 owner 要的字是「輕」。
   */
  private arrive(coin: Coin, doc: ConfigFeelFxDoc, nowMs: number): void {
    coin.inst.dispose();
    if (!sfxAllowed(nowMs, this.lastSfxMs, doc.goldPickup.sfxThrottleMs)) return;
    this.lastSfxMs = nowMs;
    this.deps.playSfx(GOLD_PICKUP_SFX, {
      volume: doc.goldPickup.sfxVolume,
      gateKey: GOLD_PICKUP_GATE_KEY,
      semitones: comboSemitones(coin.comboCount, doc.comboPitch),
    });
  }

  /** 這一枚金幣落地時會用的播放倍率（診斷／audition 用；出貨路徑不呼叫它）。 */
  playbackRateFor(count: number): number {
    return semitonesToPlaybackRate(comboSemitones(count, this.policy().comboPitch));
  }

  /** 這個場景現在掛了幾個 instance（洩漏守衛用）。 */
  get instanceCount(): number {
    return this.scene.meshes.filter((m) => m.name.startsWith("goldPickup-")).length;
  }
}

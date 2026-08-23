/**
 * audio/vfxSound —— **特效自帶的音效**（GH#390）。
 *
 * owner 2026-08-19：「不只是特效動畫、粒子特效等，別忘了**特效本身也有帶音效
 * 也要一併移植擷取**」。
 *
 * ---------------------------------------------------------------------------
 * 這一層在做什麼（以及它刻意**不**做什麼）
 * ---------------------------------------------------------------------------
 * WC3 的特效與音效是綁在一起的：mdx 的事件軌在**四個時機**上掛音 ——
 * 發射 · 命中 · 循環 · 消散。GH#390 量到的是 `schema/vfx.ts` 的音訊欄位數 = **0**，
 * 也就是「特效會演，但特效自己那一份聲音不會響」。
 *
 * 綁定住在 `content/config/vfx-families.json`（21 個家族原型 + 逐支覆寫），
 * 解析走 shared 的純函式 `resolveVfxSound`。這一支只負責**客戶端那三件事**：
 *
 *   ① overlay 退回 —— 逐支覆寫填的多半是 `wc3.*`，而那些 clip 住在 git-ignored 的
 *      Blizzard overlay，**正式站不供應**。所以拿到一個「正式站取不到」的 key 時
 *      要退回**家族**那一格（出貨的 clip），⛔ 不是退回安靜。
 *      ⚠️ 判準是**問載入的 audio map 那個 clip 的路徑**，⛔ 不是抄一份 key 名單 ——
 *      名單會過期，路徑不會（第一·五守則）。
 *   ② 循環音的**回收** —— #259 的教訓：不回收 = 越打越鈍，而且回合切換後還有殘留
 *      聲音。所以一發循環從開始那一刻就帶著**絕對到期時間**，`update()` 到期就
 *      發消散音並刪掉自己；`reset()`（回合結束／teardown）一次清空。
 *      而且有 {@link MAX_ACTIVE_LOOPS} 硬上界：一份壞掉的內容不可以讓它無限長。
 *      ⭐ **同一個登記表也負責一次性特效的消散音**（GH#440）：沒有 `soundLoop`
 *      但填了 `soundDissipate` 的五個家族（54 支技能）在這之前那一格是死的。
 *   ③ 把 key 交給既有管線 —— 呼叫端把它 push 進 `SpatialSfxQueue`，於是空間化
 *      （#253）、SfxGate 的冷卻／同時發聲數、總音量與 SFX 開關（#14）**全部自動
 *      適用**。⛔ 這一層自己不碰 WebAudio，一條繞過玩家設定的新路徑就是缺陷。
 */
import type { ConfigVfxFamiliesDoc, VfxSoundCue } from "@ggd/shared/content";
import { resolveVfxSound, vfxSoundLoopMaxMs, vfxSoundLoopMs } from "@ggd/shared/content";
import { DEFAULT_ONE_SHOT_MAX_LIFE_SEC } from "@ggd/shared/content/schema/vfx";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { abilityIdOfOrigin } from "@ggd/shared/sim/combat/damage";
import { spatialSourceFor } from "./spatialPolicy";
import type { SpatialSource } from "./spatial";
import {
  DEFAULT_CAST_LAYER_CAP,
  VFX_CUE_LAYER,
  allowedCastLayers,
  readCastLayerCap,
  type CastSoundLayer,
} from "./sfxLayerCap";
import {
  DEFAULT_MODEL_FX_SOUND,
  MODEL_FX_ARRIVE_LAYER,
  MODEL_FX_LAUNCH_LAYER,
  readModelFxSound,
  readModelFxSoundEvent,
} from "./modelFxSound";
import type { AudioModelFxSound } from "@ggd/shared/content";
import type { AudioMap } from "./types";

/** overlay 專用資產的 URL 前綴 —— 正式站**刻意**不供應這個路徑（copyright gate）。 */
export const OVERLAY_ASSET_PREFIX = "assets/blizzard-local/";

/**
 * 同時最多幾發循環音。Σ 的實際上界由 SfxGate 的 `maxConcurrent` 決定，
 * 這一格擋的是**登記表本身**無限長（12 個人狂按持續型技能）。
 * 滿了就不再收新的 —— ⛔ 不是踢掉舊的：舊的那一發正在響，換掉它會聽見斷音。
 */
export const MAX_ACTIVE_LOOPS = 24;

/**
 * ⭐ GH#605 —— 同時最多預約幾發**落點音**。與 {@link MAX_ACTIVE_LOOPS} 同一個理由：
 * 擋的是登記表本身無限長（12 個人同時放 radial×12 的技能），⛔ 不是音量。
 * 滿了就不再收新的 —— ⛔ 不是踢掉舊的（舊的那一發的落點正要發生）。
 */
export const MAX_PENDING_ONE_SHOTS = 32;

/** 一發排好時間的落點音。⭐ 絕對時間，⛔ 不是遞減計數器。 */
interface PendingOneShot {
  readonly atMs: number;
  readonly key: string;
  readonly entityId?: number;
}

/**
 * 一發正在跑的登記。
 *
 * ⭐ `key: null` = **一次性特效的消散預約**（GH#440）：這一族沒有循環音，但它填了
 * `soundDissipate`。登記進來只為了讓到期那一發消散音真的響 —— ⛔ 沒有任何東西
 * 會被重播。
 */
interface ActiveLoop {
  /** 循環要重播的 key，或 null（＝只預約消散音，什麼都不重播） */
  readonly key: string | null;
  readonly gain: number;
  readonly abilityId: string;
  readonly familyId: string | undefined;
  /** 下一次該響的絕對時間（ms） */
  nextMs: number;
  /** 絕對到期時間（ms）—— 回收的依據，⛔ 不是遞減計數器 */
  readonly endMs: number;
}

/** 一發要播的特效音。 */
export interface VfxSoundHit {
  readonly key: string;
  readonly gain: number;
  /** 聲音在誰身上（空間化用）。`update()` 回的循環音一定帶，`cue()` 不帶。 */
  readonly entityId?: number;
}

export class VfxSoundLayer {
  private doc: ConfigVfxFamiliesDoc | null = null;
  private map: AudioMap | null = null;
  private familyOf: (abilityId: string) => string | undefined = () => undefined;
  private readonly loops = new Map<number, ActiveLoop>();
  /** ⭐ GH#605 —— 排好時間的落點音（`spawnModelFx.arriveSoundKey`）。 */
  private readonly pending: PendingOneShot[] = [];
  /** 技能 id → 這一份設定下**准播**的層（GH#568）。每次換設定都清空。 */
  private readonly layerMemo = new Map<string, Set<CastSoundLayer>>();

  /**
   * 技能 id → 它的家族原型 id。**由組合根注入**（`ContentDb` 用出貨的
   * `resolveFamilyArt`），⛔ 這一層自己不重新推導一份 —— 那會是第二個住處，
   * 而「音效跟畫面不同一個家族」是聽得出來、卻查不出來的那種錯。
   */
  setFamilyResolver(fn: (abilityId: string) => string | undefined): void {
    this.familyOf = fn;
    this.layerMemo.clear();
  }

  /** 後台那一份設定（`config.vfx-families@1`）。null = 這一層整個不出聲。 */
  setFamiliesDoc(doc: ConfigVfxFamiliesDoc | null): void {
    this.doc = doc;
    this.layerMemo.clear();
  }

  /**
   * 載入的 audio map —— **只用來問「這個 clip 的檔案在不在正式站上」**。
   * ⛔ 不是用來播放（播放走 AudioSystem，這樣才吃得到玩家的音量設定）。
   */
  setAudioMap(map: AudioMap | null): void {
    this.map = map;
    // ⭐ GH#568 —— 層數上限**搭同一班車**（`config.audio-map@1.castLayerCap`）。
    // ⛔ 刻意不開第二個注入點：一個「後台改了但客戶端沒收到」的旋鈕，畫面上跟
    // 「owner 還沒改」長得一模一樣（失敗形態②）。
    this.layerMemo.clear();
  }

  /** 現在生效的層數上限。map 沒帶這一格 = 出貨預設。 */
  private cap(): typeof DEFAULT_CAST_LAYER_CAP {
    return this.map?.castLayerCap ? readCastLayerCap(this.map.castLayerCap) : DEFAULT_CAST_LAYER_CAP;
  }

  /**
   * 這個 clip 這個 build 拿不拿得到。
   *
   * ⚠️ 這是**兩個名詞的關係**（key × 這份 bundle 供不供應那個路徑），⛔ 不是
   * 「key 長什麼樣子」—— 抄一份 `wc3.*` 名單是同一件事的第二個住處，而它一定會
   * 過期（CLAUDE.md 部署那一節的形狀）。map 裡沒有這個 key 一樣算拿不到。
   */
  private serveable(key: string): boolean {
    const entry = this.map?.sfx?.[key];
    const files = entry?.files;
    if (!Array.isArray(files) || files.length === 0) return false;
    if (this.overlayEnabled) return true;
    return !files.every((f) => typeof f === "string" && f.startsWith(OVERLAY_ASSET_PREFIX));
  }

  /**
   * 這個 build 有沒有掛 Blizzard overlay（`config/fullAssets`，由呼叫端注入）。
   * ⚠️ 存取器而不是裸欄位，只為了一件事：它會改變 `serveable()` 的答案 ⇒
   * 「哪幾層真的有聲音」也跟著變 ⇒ GH#568 的層數記憶要跟著失效。
   */
  get overlayEnabled(): boolean {
    return this.overlayOn;
  }
  set overlayEnabled(on: boolean) {
    this.overlayOn = on;
    this.layerMemo.clear();
  }
  private overlayOn = false;

  /**
   * 一支技能的一個時機該播什麼，⛔ 或 null（＝這個時機刻意沒有聲音）。
   *
   * 兩段：先問逐支覆寫 + 家族；解出來的 key 這個 build 取不到的話，**再問一次
   * 只有家族的版本**。所以正式站聽得到家族那一發出貨音，而掛了 overlay 的
   * 開發／family build 聽得到原作那一發。⛔ 兩邊都不會是安靜。
   */
  cue(abilityId: string | undefined, which: VfxSoundCue): VfxSoundHit | null {
    // ⭐ GH#568 —— 層數上限（owner 2026-08-23「疊超過又不是白名單⋯**也不會播出來
    // 超過的音效**」）。⛔ 夾在**這裡**而不是在內容裡：`content/vfx-families.json`
    // 一個位元組都沒動，所以白名單／上限一改，聲音逐位元回來。
    if (!this.layersOf(abilityId).has(VFX_CUE_LAYER[which])) return null;
    return this.resolveCue(abilityId, which);
  }

  /**
   * 這支技能在**設定上**真的有東西的那幾層（⛔ 不是全部五層），已經過上限夾住。
   * 記憶化：一次施法會問四次，而 `cue()` 每一次都要知道整條疊層長什麼樣。
   * ⚠️ 每一個換設定的入口都 `clear()` 它 —— 一份過期的記憶會讓後台的改動看起來
   * 「存了但沒生效」，而那個畫面跟「owner 還沒存」一模一樣。
   */
  private layersOf(abilityId: string | undefined): Set<CastSoundLayer> {
    const memoKey = abilityId ?? "";
    const memo = this.layerMemo.get(memoKey);
    if (memo) return memo;
    const allowed = allowedCastLayers(this.presentLayers(abilityId), abilityId, this.cap());
    this.layerMemo.set(memoKey, allowed);
    return allowed;
  }

  /** 這支技能在**設定上**真的有東西的那幾層（⛔ 還沒過上限）。 */
  private presentLayers(abilityId: string | undefined): CastSoundLayer[] {
    // 施法音**一定**在：`combatSfx` 的路由最後一格是 `abilityCast` 這個保證的退路，
    // 所以一支技能可以沒有特效音,⛔ 不可以無聲施放。它排在層序第一,永遠不被夾掉。
    const present: CastSoundLayer[] = ["施法音"];
    for (const which of ["launch", "impact", "loop", "dissipate"] as const) {
      if (this.resolveCue(abilityId, which)) present.push(VFX_CUE_LAYER[which]);
    }
    return present;
  }

  /**
   * ⭐ GH#605 —— 層數上限，⭐ **算進技能節點自己填的那幾格聲音**。
   *
   * ⚠️ ⛔ 不可以直接用 {@link layersOf}：那一份的 `present` 只從
   * `vfx-families.json` 推導，而 `spawnModelFx.soundKey` 住在**技能文件的效果節點**
   * 上 —— 於是一支「家族沒綁任何特效音、但節點自己填了 soundKey」的技能會被算成
   * 「這一層設定上不存在」而**永遠被夾掉**，而畫面上跟「owner 把上限調低了」一模一樣。
   * ⛔ 記憶化也不適用（extra 逐次不同），但它一次施放只跑一次。
   */
  private allowedWith(
    abilityId: string | undefined,
    extra: readonly CastSoundLayer[],
  ): Set<CastSoundLayer> {
    if (extra.length === 0) return this.layersOf(abilityId);
    return allowedCastLayers(
      [...this.presentLayers(abilityId), ...extra],
      abilityId,
      this.cap(),
    );
  }

  /**
   * ⭐ GH#605 —— 一顆 `modelFxSpawn` 帶來的聲音：**發射那一發現在播**，
   * **落點那一發排進登記表**（`update()` 到時間發出來）。
   *
   * ⛔ 它刻意**不經過** `resolveVfxSound`（家族表）：這兩格是**技能文件的效果節點**
   * 自己填的 audio-map key，家族退回那一套在這裡沒有第二層可退。但 `serveable()`
   * 仍然要問 —— 一個正式站取不到的 `wc3.*` key 要當成「這一格沒填」，⛔ 不是排一發
   * 永遠不會響的預約去佔登記表。
   */
  modelFxCues(data: Record<string, unknown>, nowMs: number): VfxSoundHit[] {
    const policy = this.modelFxPolicy();
    if (!policy.enabled) return [];
    const ev = readModelFxSoundEvent(data);
    const launch = ev.soundKey !== undefined && this.serveable(ev.soundKey) ? ev.soundKey : null;
    const arrive =
      policy.arrive && ev.arriveSoundKey !== undefined && this.serveable(ev.arriveSoundKey)
        ? ev.arriveSoundKey
        : null;
    if (launch === null && arrive === null) return [];
    const abilityId = ev.origin !== undefined ? abilityIdOfOrigin(ev.origin) : undefined;
    const extra: CastSoundLayer[] = [];
    if (launch !== null) extra.push(MODEL_FX_LAUNCH_LAYER);
    if (arrive !== null) extra.push(MODEL_FX_ARRIVE_LAYER);
    const allowed = this.allowedWith(abilityId, extra);

    const out: VfxSoundHit[] = [];
    if (launch !== null && allowed.has(MODEL_FX_LAUNCH_LAYER)) {
      out.push({ key: launch, gain: 1, ...(ev.caster !== undefined ? { entityId: ev.caster } : {}) });
    }
    if (
      arrive !== null &&
      allowed.has(MODEL_FX_ARRIVE_LAYER) &&
      this.pending.length < MAX_PENDING_ONE_SHOTS
    ) {
      // ⭐ 絕對時間，⛔ 不是遞減計數器（同 `ActiveLoop.endMs` 的理由）。
      this.pending.push({
        atMs: nowMs + ev.arriveDelaySec * 1000,
        key: arrive,
        ...(ev.caster !== undefined ? { entityId: ev.caster } : {}),
      });
    }
    return out;
  }

  /** 現在生效的 `spawnModelFx` 音效政策（`config.audio-map@1.modelFxSound`）。 */
  private modelFxPolicy(): AudioModelFxSound {
    return this.map?.modelFxSound
      ? readModelFxSound(this.map.modelFxSound)
      : DEFAULT_MODEL_FX_SOUND;
  }

  /** 兩段解析（逐支覆寫 → 家族退路），⛔ **沒有**上限那一關。 */
  private resolveCue(abilityId: string | undefined, which: VfxSoundCue): VfxSoundHit | null {
    const familyId = abilityId ? this.familyOf(abilityId) : undefined;
    const hit = resolveVfxSound(this.doc, familyId, abilityId, which);
    if (hit && this.serveable(hit.key)) return hit;
    const fam = resolveVfxSound(this.doc, familyId, undefined, which);
    if (fam && this.serveable(fam.key)) return fam;
    return null;
  }

  /**
   * 開始一發循環音（持續型特效的底噪）。已經在跑的同一個實體會被**取代**，
   * 因為那代表同一具身體重新施法了。回傳第一發要播的音，或 null。
   *
   * ⭐ **沒有循環音但填了消散音的家族也會登記**（GH#440）。在這之前
   * `soundDissipate` 只從循環音登記表發得出來，於是出貨的
   * **blink / dissipate / mirrorImage / mark / cloud 五族（54 支技能）**填的那一格
   * **逐位元等於不存在** —— schema 收得下、後台存得起來、`content:build` 全綠，
   * 而遊戲裡什麼都不響（第一·五守則點名的形態）。
   * ⚠️ 到期時間用 `oneShotMaxLifeSec`（**後台調得到**的一次性特效壽命天花板，
   * 出貨 0.6 秒）而 ⛔ 不是 `soundLoopMaxMs`（那是 8 秒 —— 一次瞬移的消散音
   * 8 秒後才響，聽起來會像是別的東西發生了）。
   */
  startLoop(entityId: number, abilityId: string | undefined, nowMs: number): VfxSoundHit | null {
    const hit = this.cue(abilityId, "loop");
    // 沒有循環音時，只有「這一族真的填了消散音」才值得佔一格登記。
    if (!hit && !this.cue(abilityId, "dissipate")) return null;
    if (!this.loops.has(entityId) && this.loops.size >= MAX_ACTIVE_LOOPS) return null;
    const familyId = abilityId ? this.familyOf(abilityId) : undefined;
    const everyMs = vfxSoundLoopMs(this.doc, familyId);
    const oneShotMs = (this.doc?.oneShotMaxLifeSec ?? DEFAULT_ONE_SHOT_MAX_LIFE_SEC) * 1000;
    this.loops.set(entityId, {
      key: hit?.key ?? null,
      gain: hit?.gain ?? 1,
      abilityId: abilityId ?? "",
      familyId,
      nextMs: nowMs + everyMs,
      endMs: nowMs + (hit ? vfxSoundLoopMaxMs(this.doc, familyId) : oneShotMs),
    });
    return hit;
  }

  /**
   * 推進一幀。回傳這一幀該播的音（循環的重播 + 到期那一發消散音）。
   *
   * ⭐ 到期的那一發**當場從登記表刪掉** —— 這就是 #259 要的回收。
   * ⚠️ 迭代前先排序 key：Map 的插入序取決於封包到達順序，而同一幀的播放順序
   * 會決定誰吃到 SfxGate 那一格 —— 不排序的話同一場比賽兩次會不一樣。
   */
  update(nowMs: number): VfxSoundHit[] {
    const out: VfxSoundHit[] = [];
    // ⭐ GH#605 —— 到期的落點音。⛔ **當場從登記表刪掉**（同 #259 的回收），
    //    而且是**就地過濾**，不是留一個「已播過」的旗標。
    if (this.pending.length > 0) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i]!;
        if (nowMs < p.atMs) continue;
        this.pending.splice(i, 1);
        out.push({ key: p.key, gain: 1, ...(p.entityId !== undefined ? { entityId: p.entityId } : {}) });
      }
      // 同一幀多發時播放順序不可以取決於陣列殘留的次序（決定性，同下面的 sort）。
      out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }
    if (this.loops.size === 0) return out;
    for (const id of [...this.loops.keys()].sort((a, b) => a - b)) {
      const loop = this.loops.get(id)!;
      if (nowMs >= loop.endMs) {
        this.loops.delete(id);
        const end = this.cue(loop.abilityId || undefined, "dissipate");
        if (end) out.push({ ...end, entityId: id });
        continue;
      }
      // `key === null` = 消散預約，⛔ 它沒有東西可以重播。
      if (loop.key !== null && nowMs >= loop.nextMs) {
        loop.nextMs = nowMs + vfxSoundLoopMs(this.doc, loop.familyId);
        out.push({ key: loop.key, gain: loop.gain, entityId: id });
      }
    }
    return out;
  }

  /**
   * 這一發循環提早結束（技能被打斷／施法者死了）。回傳消散音，或 null。
   * ⭐ 停掉的那一刻就**刪掉登記**，⛔ 不是留一個「已停止」的旗標等它自己過期。
   */
  stopLoop(entityId: number): VfxSoundHit | null {
    const loop = this.loops.get(entityId);
    if (!loop) return null;
    this.loops.delete(entityId);
    const end = this.cue(loop.abilityId || undefined, "dissipate");
    return end ? { ...end, entityId } : null;
  }

  /** 回合切換 / teardown：一次清空，**不發任何消散音**（場景已經換了）。 */
  reset(): void {
    this.loops.clear();
    // ⭐ GH#605 —— 排在飛的落點音也要清掉：回合已經換了，那一發再響就是
    //    #429（燃燒床音被推進商店）的形狀。
    this.pending.length = 0;
  }

  /** 診斷用（守衛讀它確認回收真的發生了）。 */
  get activeLoops(): number {
    return this.loops.size;
  }

  /** 診斷用 —— 還有幾發落點音排著（守衛讀它確認回收真的發生了）。 */
  get pendingOneShots(): number {
    return this.pending.length;
  }
}

/**
 * 出貨的那一個 —— 和 `audioSystem` 同一種形狀（一個單例，由組合根餵設定）。
 * 內容那一份由 `ContentDb.load()` 安裝，`overlayEnabled` 與 audio map 由
 * `GameApp` 安裝。⛔ 測試要新的一個就 `new VfxSoundLayer()`，不要動這一個。
 */
export const vfxSoundLayer = new VfxSoundLayer();

// ───────────────────────────────────────────────────────────────────────────
// GH#440 —— 特效音的**唯一出口**（在這之前 `GameApp` 直接 push 進 SpatialSfxQueue）
// ───────────────────────────────────────────────────────────────────────────

/** 一發已經**過完政策表**、可以直接進 `SpatialSfxQueue` 的特效音。 */
export interface VfxSoundPush {
  readonly key: string;
  /** ⭐ 政策表批准過的位置，或 null（＝置中）。⛔ 呼叫端不可以自己再算一個。 */
  readonly source: SpatialSource | null;
  readonly gain: number;
  /**
   * 一律 `false`（GH#403）。特效自帶的循環音**借用**了 `fireRingLoop` /
   * `arenaAmbience` —— 那兩個 key 同時是真的環境底噪，走真 loop。一發 8 秒的
   * 龍捲風要是啟動了真 loop，`maxConcurrent: 1` 的 gate 會被它永遠佔住。
   */
  readonly loop: false;
}

/**
 * ⛔ **這裡是特效音唯一離開這一層的地方。**
 *
 * `GameApp` 以前自己做這件事，而它是 GH#440 的現場：它把 `resolveSpatial(ev)`
 * 的結果**無條件**當成位置。那個 source 是按**事件型別**算的，而這裡播的是
 * **家族綁的 key** —— 於是 `fireRingLoop`（政策 flat：「火圈包住你，非方向性」）
 * 被掛在施法者身上跟著他走，**24 支技能**，而兩張表都沒有反對過。
 *
 * 現在每一發都經過 {@link spatialSourceFor}：政策說 `world` 才留位置，其餘一律
 * 置中。⛔ 政策永遠只會**拿掉**位置，不會憑空給一個。
 */
export function vfxSoundCues(
  layer: VfxSoundLayer,
  ev: EventMessage,
  source: SpatialSource | null,
  nowMs: number,
): VfxSoundPush[] {
  const out: VfxSoundPush[] = [];
  const emit = (hit: VfxSoundHit | null): void => {
    if (hit) out.push({ key: hit.key, source: spatialSourceFor(hit.key, source), gain: hit.gain, loop: false });
  };
  if (ev.type === "abilityCast") {
    const abilityId = typeof ev.data.abilityId === "string" ? ev.data.abilityId : undefined;
    emit(layer.cue(abilityId, "launch"));
    // 持續型特效的底噪。掛在**施法者**身上，所以位置跟著他走、他死了就跟著回收。
    const caster = typeof ev.data.caster === "number" ? ev.data.caster : undefined;
    if (caster !== undefined) emit(layer.startLoop(caster, abilityId, nowMs));
    return out;
  }
  // ⭐ GH#605 —— 【移動中的模型特效】自帶的音效。
  //
  // ⛔ 它刻意**不掛在 `VfxSystem` 的 `case "modelFxSpawn"` 裡**：那個 case 第一行
  //    是 `if (!this.modelFx) break;` —— 一個**算繪**的前提（模型 rig 兩個內容接縫
  //    都在才會被建）。把聲音掛在它後面，等於「模型檔沒進來 ⇒ 連聲音也一起消失」，
  //    而那正是這張票在修的那種靜默（失敗形態②）。聲音走自己的路。
  if (ev.type === "modelFxSpawn") {
    for (const hit of layer.modelFxCues(ev.data as Record<string, unknown>, nowMs)) emit(hit);
    return out;
  }
  // ⭐ GH#440 —— `stopLoop()` 在這之前**全 repo 零呼叫端**：註解說它是給
  // 「技能被打斷／施法者死了」用的，而沒有任何地方在那兩件事發生時叫它，
  // 於是一發循環只會在 8 秒自然到期才停（GH#429：燃燒床音被推進商店）。
  if (ev.type === "castInterrupt" || ev.type === "death") {
    const who = ev.type === "death" ? ev.data.id : ev.data.caster;
    if (typeof who === "number") emit(layer.stopLoop(who));
    return out;
  }
  // ⭐ 命中音**只騎 `damage`**（GH#440 的宣告更正，lane D 2026-08-23）。
  //
  // ⛔ 這一行曾經是 `ev.type !== "damage" && ev.type !== "projectileHit"`，而那半條
  //   路**一發都沒響過**：`ProjectileSystem` 送的是 `{ id, owner, target, projectileId }`
  //   —— ⛔ 沒有 `origin`，所以下面那行 `abilityIdOfOrigin("")` 每一次都回 undefined。
  // ⭐ 而**補上去是錯的**：同一次命中的 `runEffects(onHit)` 會掉血 ⇒ 一顆帶著
  //   `origin` 的 `damage` 事件，命中音本來就是從那裡出來的。兩條都收 = 同一下響兩發
  //   （`sfxReachability` 裡 `basicAttackHit` 被刻意遮蔽，逐字同一個理由）。
  // ⚠️ 哪天 sim 真的把 `origin` 蓋到 `projectileHit` 上，要回來重新決定的是「哪一顆
  //   事件擁有命中音」，⛔ 不是「順手把這一行加回去」。
  if (ev.type !== "damage") return out;
  // 每一條技能傷害路徑都蓋 `origin = "ability:<id>"`（instant / cast-time /
  // projectile onHit 三條都一樣，見 sim/combat/damage.ts 的 `abilityIdOfOrigin`）。
  // 普攻 / DoT / 道具 proc 沒有這個前綴 ⇒ 這裡直接回，⛔ 不會替它們亂編一個家族。
  const abilityId = abilityIdOfOrigin(typeof ev.data.origin === "string" ? ev.data.origin : "");
  if (!abilityId) return out;
  emit(layer.cue(abilityId, "impact"));
  return out;
}

/**
 * 這一幀循環音的重播與到期消散 —— 同樣**過完政策表**。
 * `sourceOf` 給的是「施法者現在在哪」，政策決定那個位置留不留得住。
 */
export function vfxLoopPushes(
  layer: VfxSoundLayer,
  nowMs: number,
  sourceOf: (entityId: number | undefined) => SpatialSource | null,
): VfxSoundPush[] {
  return layer.update(nowMs).map((hit) => ({
    key: hit.key,
    source: spatialSourceFor(hit.key, sourceOf(hit.entityId)),
    gain: hit.gain,
    loop: false as const,
  }));
}

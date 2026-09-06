/**
 * VfxScriptPlayer — GH#838 特效工坊（VFX Forge）的演出腳本播放器。
 *
 * 一份 `vfx-script@1`（`content/vfx-scripts/`）＝一支技能的**純演出**時間軸。
 * 這個類別做的事只有一件：把 script 的 segment 在正確的時刻、正確的錨點，
 * **翻成既有的 wire payload 回餵 `VfxSystem.handleEvent`**。
 *
 * ⭐⭐ 為什麼是「合成事件回餵」而不是各叫一條 spawn API：
 *    被餵的 case（`modelFxSpawn` / `vfxSpawn` / `floatingText` / `screenFlash|Shake`）
 *    正是**出貨消費端**（GH#606/#608 之後兩側 import 同一個 payload 型別）——
 *    走它們，script 演出與 sim 演出吃同一條渲染路，⛔ 不會出現「script 的光束
 *    與技能的光束各有一套腐爛速度」（失敗形態⑤：被測的不是出貨的那個）。
 *
 * 觸發器語意（⛔ 與 wire 事件名刻意解耦）：
 *   `castStart`  ＝ wire `abilityCast`（施法**提交**那一刻 —— 詠唱/抬手從這裡起算）
 *   `castEffect` ＝ 效果結算那一刻：ct>0 的施法等 wire `castEnd`；瞬發＝提交當幀。
 *     判別**不查表**：`abilityCast` 先掛一筆暫定的 castEffect，同一批 drain 裡
 *     跟著來的 `castBegin` 把它改掛到 `castEnd` 上 —— sim 的 emit 順序
 *     （`abilityCast` → 同 tick 的 `castBegin`）保證這永遠來得及，而 update()
 *     在整批 drain 之後才跑。
 *   `projectileSpawn` / `projectileHit` ＝ 同名 wire 事件，⚠️ payload 只有
 *     `projectileId` 沒有 abilityId ⇒ 歸屬由**技能 JSON 推導**（deep-scan 它的
 *     effects 收集 spawnProjectile.projectileId），⛔ 不是猜。
 *
 * ⚠️ 純客戶端、純演出：這裡沒有任何傷害/狀態/資源 —— 那些住 ability JSON。
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { abilityIdOfAuthoredOrigin } from "@ggd/shared/sim";
import { ABILITY_VFX_LAYER_OVERRIDE_FIELDS } from "@ggd/shared/content/schema/abilityVfx";
// ⭐ GH#990 —— deps 交進來的是**作者形狀**（`AuthoredVfxScriptDoc`，段落可能是 `{call:{…}}`）；
//    播放器在讀取邊界 `expanded()` 用共用展開器換成 inline 段之後，內部一律只看 `VfxScriptDoc`
//    （＝ `ExpandedVfxScriptDoc`）。⛔ 呼叫段不會走到 `schedule()`／`fire()`。
import type {
  ExpandedVfxScriptDoc as VfxScriptDoc,
  VfxScriptDoc as AuthoredVfxScriptDoc,
  VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import { expandVfxScriptDoc, VfxSubtypes } from "@ggd/shared/content/vfxSubtypes/expand";
import { modelFxInstancesFromFrame } from "@ggd/shared/sim/effects/modelFxPlacement";
// ⚠️ 型別 import（會被抹除）⇒ 不會把 delayed↔effectRegistry 的環拖進瀏覽器。
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import type { FloatingTextEvent, ScreenFlashEvent, ScreenShakeEvent } from "@ggd/shared/sim/effects/clientCues";
import type { VfxSpawnEvent } from "@ggd/shared/sim/effects/spawnVfx";
import type { AnimPulse } from "@ggd/shared/content/animPulse";
// ⭐ 取代語意 —— 兩個系統 import 同一份帳本（⛔ 不是各自一份旗標）。
import { channelTakeover, DEFAULT_TAKEOVER_MS } from "../render/channelTakeover";

/**
 * 面向座標系的位移（JASS PolarProjectionBJ 的翻譯；＋side＝面向的右手邊）。
 * 面向解不到 ⇒ 退回 +x（⛔ 不是不套 —— 拖拉落點的段沒有位移就疊在錨上）。
 * 三角函式與此處的乘加都在客戶端 —— sim purity 只管 `sim/**`。
 */
function applyFacingOffset(
  pos: { x: number; z: number },
  facing: { x: number; z: number } | undefined,
  fwd: number,
  side: number,
): { x: number; z: number } {
  if (fwd === 0 && side === 0) return pos;
  let fx = facing?.x ?? 0;
  let fz = facing?.z ?? 0;
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) {
    fx = 1;
    fz = 0;
  } else {
    fx /= fl;
    fz /= fl;
  }
  return { x: pos.x + fx * fwd + fz * side, z: pos.z + fz * fwd - fx * side };
}

/** Unit aim from one world point to another; coincident points have no direction. */
function directionToward(
  from: { x: number; z: number } | null | undefined,
  to: { x: number; z: number } | null | undefined,
): { x: number; z: number } | undefined {
  if (!from || !to) return undefined;
  const x = to.x - from.x;
  const z = to.z - from.z;
  const len = Math.hypot(x, z);
  if (len < 1e-6) return undefined;
  return { x: x / len, z: z / len };
}

/** 一次觸發當下解出的錨點材料（之後 firing 時仍會 refresh 施法者位置）。 */
interface TriggerFrame {
  caster: number;
  tick: number;
  /**
   * ⭐ 這一則的**受方實體 id** —— ⭐ 也是 `target.reaction` 通道的**接管對象**。
   *
   * ⚠️ ⛔ 這一行在 2026-09-02 之前寫著「只有 `comboStrike` 帶得到」,而在
   * `replaces` 上線的那一刻它就從**註解**變成了**缺陷**（第三守則：
   * 一句在它到期之後還活著的散文）—— 那三條路各自只填了自己需要的欄位,
   * 而新的機制讀的是這一格。
   * ⇒ 今天三條都填：`comboStrike`（那一段的受害者）·
   *   `projectileHit`（被命中的人）· `reflectSuccess`（**反彈者自己**）。
   */
  victim?: number;
  point?: { x: number; z: number };
  direction?: { x: number; z: number };
  targetPos?: { x: number; z: number };
}

interface PendingFire {
  dueMs: number;
  seg: VfxScriptSegment;
  frame: TriggerFrame;
  /**
   * ⭐ GH#974 —— 這一段屬於哪一支技能。**必填**（⛔ 不是 optional）：
   * 讓 `tsc` 逐一點名每一個排程點，⛔ 而不是靠我記得每個地方都填。
   * ⚠️ 少了它，掉段帳本只會說「有一段沒播」而說不出**是哪一支** ——
   * 而驗收要的是 **10 支逐支確認**。
   */
  abilityId: string;
  /** `abilityCast` 掛的暫定 castEffect —— `castBegin` 來了就整組取消改等 castEnd */
  tentativeKey?: string;
}

export interface VfxScriptPlayerDeps {
  /** abilityId → script（查不到＝這支技能沒有演出腳本＝零成本路）。作者形狀，可含 `call` 段。 */
  scriptFor(abilityId: string): AuthoredVfxScriptDoc | undefined;
  /** 這支技能的 effects deep-scan 收集到的 projectileId 集合。 */
  projectileIdsOf(abilityId: string): ReadonlySet<string>;
  /** 全部 scripts 的列舉（彈道歸屬快取用）。作者形狀，可含 `call` 段。 */
  allScripts(): readonly AuthoredVfxScriptDoc[];
  entityPos(id: number): { x: number; z: number } | null;
  /** 回餵出貨消費端（＝ `VfxSystem.handleEvent`）。 */
  dispatch(ev: EventMessage, nowMs: number): void;
  playSfx?(event: string, opts?: { volume?: number; gateKey?: string }): boolean;
  /** M4 動畫脈衝（受害者定格）—— 缺席 ⇒ 動畫段 no-op。 */
  pulseAnim?(id: number, kind: AnimPulse, opts?: { clipWindowMs?: number }): void;
  /** N6 演出用暫時隱形 —— 缺席 ⇒ 段 no-op。 */
  hideBody?(id: number, durationMs: number): void;
  /**
   * ⭐ M1 逐刀瞬移 / M3 升空曲線（GH#838）—— **只動畫面**的位移。
   * ⛔ 判定框、索敵、碰撞一格都不變（與 `hideBody` 同一個理由）。
   */
  moveBody?(
    id: number,
    offset: { x: number; y: number; z: number },
    durationMs: number,
    arc: boolean,
  ): void;
  /** 後台開關（三個住處那一格）—— 每次事件都活讀，關掉＝逐位元回到沒有 script 的世界。 */
  enabled(): boolean;
}

/**
 * ⭐⭐ GH#974 —— **段落沒播的時候要說話。**
 *
 * ── ⛔ 在此之前這條路上有**三個靜默 `return`** ───────────────────────────
 *   ① `const origin = casterPos ?? frame.point; if (!origin) return;`
 *   ② `if (insts.length === 0) return;`
 *   ③ `anchor:"target"` ⇒ `at = frame.targetPos ?? frame.point` —— 兩個都沒有 ⇒ 落進②
 *
 * ⚠️ ⭐ 而 `strike` 那條路的 frame，`point` 與 `targetPos` **兩個都只從同一個來源來**：
 *   `comboStrike` 事件的 `d.x` / `d.z`（`VfxScriptPlayer.ts` 的 comboStrike case）。
 *   ⛔ 而 sim 那一端它們是**選填**的（`delayed.ts`：`at = vp ?? point`，
 *   `...(at !== undefined ? { x: at.x, z: at.z } : {})`，型別註解逐字說 victim
 *   「**全滅時缺席**」）。
 *
 * ⇒ ⭐⭐ **sim 沒送座標 ⇒ `anchor:"target"` 的每一段整批消失，而三個出口一句話都不說。**
 *   `godie-e002.ex` 的 **17 段全部**是這一類 ⇒ 一次掉光。
 *
 * ── ⭐ 這裡做的事：**只記帳，⛔ 不改行為** ────────────────────────────
 * ⚠️ CLAUDE.md 逐字：「fail-open 沒錯，**靜默**才是缺陷」。
 * ⇒ ⛔ 不把 `return` 改成 throw（那會用一個當機換一個黑畫面），
 * ⭐ 而是讓「誰、哪一段、為什麼沒播」變成**數得出來的東西** ——
 *   於是「特效回來了」可以被**量**，⛔ 不必再靠假設。
 */
export interface ScriptSegmentDrop {
  abilityId: string;
  /** 段在 script 裡的序（0 起算）。 */
  index: number;
  kind: string;
  on: string;
  /** ⭐ 為什麼沒播 —— 對應上面三個出口。 */
  reason: "no-origin" | "no-instances" | "no-anchor";
}

/** ⭐ 這一輪掉了哪些段。⛔ 不是累積計數器 —— 讀的人要問「這一次」。 */
const drops: ScriptSegmentDrop[] = [];

/** 測試／診斷用：讀出並清空。 */
export function takeScriptSegmentDrops(): ScriptSegmentDrop[] {
  return drops.splice(0, drops.length);
}

/** 內部：記一筆。⛔ 刻意不 console.warn —— 一行沒有人讀的 log 不算 fail-loud。 */
function noteDrop(d: ScriptSegmentDrop): void {
  // ⚠️ 有上限 —— 一場失控的比賽不可以把記憶體吃光（診斷工具不該變成第二個缺陷）。
  if (drops.length < 512) drops.push(d);
}

export class VfxScriptPlayer {
  private readonly pending: PendingFire[] = [];
  /** `caster|abilityId` → 等 castEnd 的 frame（castBegin 改掛過來的）。 */
  private readonly awaitingEnd = new Map<string, TriggerFrame>();

  constructor(private readonly deps: VfxScriptPlayerDeps) {}

  /** 在 `VfxSystem.handleEvent` 的開頭餵進來（synthesized 事件不會是觸發器型別 ⇒ 不迴圈）。 */
  onEvent(ev: EventMessage, nowMs: number): void {
    if (!this.deps.enabled()) return;
    const d = ev.data as Record<string, unknown>;
    switch (ev.type) {
      case "abilityCast": {
        const abilityId = d.abilityId as string | undefined;
        const caster = d.caster as number | undefined;
        if (!abilityId || caster === undefined) return;
        const script = this.deps.scriptFor(abilityId);
        if (!script) return;
        const point = d.point as { x: number; z: number } | undefined;
        const frame: TriggerFrame = {
          caster,
          tick: ev.tick | 0,
          point,
          direction: d.direction as { x: number; z: number } | undefined,
          // ⚠️ `abilityCast` 沒有目標 id —— 指向技的 `point` 就是目標當下的位置，
          //    v1 拿它當 targetPos 的近似（誠實的退化，⛔ 不是猜一個實體）。
          targetPos: point,
        };
        const key = `${caster}|${abilityId}`;
        this.schedule(script, "castStart", frame, nowMs);
        this.schedule(script, "castEffect", frame, nowMs, key);
        return;
      }
      case "castBegin": {
        const abilityId = d.abilityId as string | undefined;
        const caster = d.caster as number | undefined;
        if (!abilityId || caster === undefined) return;
        const key = `${caster}|${abilityId}`;
        // 暫定的 castEffect 改等 castEnd（同 tick、同一批 drain ⇒ 一定還沒 fire）
        let frame: TriggerFrame | undefined;
        for (let i = this.pending.length - 1; i >= 0; i--) {
          if (this.pending[i]!.tentativeKey === key) {
            frame ??= this.pending[i]!.frame;
            this.pending.splice(i, 1);
          }
        }
        if (frame) this.awaitingEnd.set(key, frame);
        return;
      }
      case "castInterrupt": {
        const caster = d.caster as number | undefined;
        if (caster === undefined) return;
        // 吟唱被打斷 ⇒ castEffect 永遠不來，別讓 frame 留著漏
        for (const k of [...this.awaitingEnd.keys()]) {
          if (k.startsWith(`${caster}|`)) this.awaitingEnd.delete(k);
        }
        return;
      }
      case "castEnd": {
        const abilityId = d.abilityId as string | undefined;
        const caster = d.caster as number | undefined;
        if (!abilityId || caster === undefined) return;
        const key = `${caster}|${abilityId}`;
        const frame = this.awaitingEnd.get(key);
        if (!frame) return;
        this.awaitingEnd.delete(key);
        const script = this.deps.scriptFor(abilityId);
        if (script) this.schedule(script, "castEffect", { ...frame, tick: ev.tick | 0 }, nowMs);
        return;
      }
      case "comboStrike": {
        // GH#838 逐段演出錨（sim 的 delayed/comboStrikes 每一段發一則）。
        // 主動連段走 `ability:<id>`；被動／限時增益連段則保留自己的 hook
        // provenance。兩者都由 shared parser 回到唯一的 authored ability，
        // ⛔ 不可以只收 ability:，否則 20-002 理想鄉 EX 的七刀全是死軌。
        const origin = d.origin as string | undefined;
        const caster = d.caster as number | undefined;
        const abilityId = abilityIdOfAuthoredOrigin(origin);
        if (!abilityId || caster === undefined) return;
        const script = this.deps.scriptFor(abilityId);
        if (!script) return;
        const index = (d.index as number | undefined) ?? 0;
        const at =
          typeof d.x === "number" && typeof d.z === "number"
            ? { x: d.x as number, z: d.z as number }
            : undefined;
        const victim = d.victim as number | undefined;
        const targetPos = at ?? (victim !== undefined ? (this.deps.entityPos(victim) ?? undefined) : undefined);
        const direction = directionToward(this.deps.entityPos(caster), targetPos);
        const frame: TriggerFrame = {
          caster,
          tick: ev.tick | 0,
          ...(victim !== undefined ? { victim } : {}),
          ...(targetPos !== undefined ? { point: targetPos, targetPos } : {}),
          ...(direction !== undefined ? { direction } : {}),
        };
        for (const seg of script.segments) {
          if (seg.on !== "strike") continue;
          if (seg.strikeIndex !== undefined && seg.strikeIndex !== index) continue;
          this.claimTakeover(seg, frame, nowMs);
          this.pending.push({ dueMs: nowMs + (seg.atMs ?? 0), seg, frame, abilityId });
        }
        return;
      }
      case "projectileSpawn":
      case "projectileHit": {
        const projectileId = d.projectileId as string | undefined;
        const owner = d.owner as number | undefined;
        if (!projectileId || owner === undefined) return;
        // New wire events carry exact authored provenance.  Keep the old
        // projectileId deep-scan as a backward-compatible fallback for stale
        // hosts, but never fan one event into every script when origin exists.
        const target = d.target as number | undefined;
        const exactAbilityId = abilityIdOfAuthoredOrigin(d.origin);
        const exactScript = exactAbilityId ? this.deps.scriptFor(exactAbilityId) : undefined;
        const scripts = exactScript ? [exactScript] : this.scriptsClaiming(projectileId);
        for (const script of scripts) {
          const frame: TriggerFrame = {
            caster: owner,
            tick: ev.tick | 0,
            // ⭐⭐ **被命中的人要進 `victim`**（Codex 2026-09-02 抓到的）——
            //   ⛔ 在此之前只有 `comboStrike` 填它 ⇒ 一段宣告
            //   `replaces: "target.reaction"` 的腳本在這條路上**登記不到任何人**
            //   ⇒ `heldBy` 永遠 false ⇒ ⭐ 取代語意在這一類上靜默失效
            //   （預設演出照播,而作者以為自己已經接管了）。
            // ⚠️ `projectileSpawn` 走同一個 case 而它沒有 target ⇒ 那時是 undefined,
            //   ⭐ 那是對的:還沒命中就沒有「被命中的人」。
            ...(target !== undefined ? { victim: target } : {}),
            targetPos:
              target !== undefined ? (this.deps.entityPos(target) ?? undefined) : undefined,
          };
          this.schedule(script, ev.type, frame, nowMs);
        }
        return;
      }
      // ⭐⭐ GH#885 —— **反彈成功**（owner 指名的 20-002 理想鄉EX 就是這一刻）。
      //
      // ⭐ **歸屬乾淨**：`origin` 是那一發反彈封包自己的 provenance。
      //   主動技能直接打出的反彈是 `ability:<id>`；限時 buff 裡的 hook 則是
      //   `hook:buff:ability:<id>#<instance>`。shared parser 只解已知容器，回到
      //   防禦者那支 authored ability 後再走既有的 `scriptFor()`，⛔ 不掃子字串猜。
      //
      // ⚠️ ⛔ 不是每一發反彈都有腳本 —— 查不到就是零成本路（與其他觸發器同形）。
      case "reflectSuccess": {
        const reflector = d.reflector as number | undefined;
        const origin = d.origin as string | undefined;
        const abilityId = abilityIdOfAuthoredOrigin(origin);
        if (reflector === undefined || !abilityId) return;
        const script = this.deps.scriptFor(abilityId);
        if (!script) return;
        const attacker = d.attacker as number | undefined;
        const targetPos =
          attacker !== undefined ? (this.deps.entityPos(attacker) ?? undefined) : undefined;
        const direction = directionToward(this.deps.entityPos(reflector), targetPos);
        const frame: TriggerFrame = {
          caster: reflector,
          tick: ev.tick | 0,
          // ⭐⭐ **接管對象是 `reflector`,⛔ 不是 `attacker`**（Codex 2026-09-02 抓到的）。
          //   ⚠️ 這裡有一個真的會踩到的不對稱:
          //   · **空間**上「目標」是攻擊者（傷害飛回去的方向）⇒ `targetPos` 用他
          //   · **身體**上做出反應的是**防禦者自己** ⇒ 登錄表把 `reflectSuccess`
          //     記成 `actor: "target"` 而 `EntityViewRegistry` 傳的是
          //     `{ target: reflector }` ⇒ ⭐ `target.reaction` 這條通道
          //     必須登記在 **reflector** 身上。
          //   ⛔ 填 attacker ⇒ 攻擊者被壓制、而防禦者的預設 `guard` 照播
          //     —— 兩邊都錯,且畫面上看起來只是「有時候會重播」。
          victim: reflector,
          ...(targetPos !== undefined ? { point: targetPos, targetPos } : {}),
          ...(direction !== undefined ? { direction } : {}),
        };
        this.schedule(script, "reflectSuccess", frame, nowMs);
        return;
      }
      default:
        return;
    }
  }

  /** 每幀叫一次（`VfxSystem.update`）—— 到期的 segment 在這裡 fire。 */
  update(nowMs: number): void {
    if (this.pending.length === 0) return;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i]!;
      if (p.dueMs > nowMs) continue;
      this.pending.splice(i, 1);
      i--;
      this.fire(p.seg, p.frame, nowMs, p.abilityId);
    }
  }

  // -------------------------------------------------------------------------

  private scriptsClaimingCache: Map<string, VfxScriptDoc[]> | null = null;

  /** 供 forge 熱改 script 之後重建歸屬快取。 */
  invalidate(): void {
    this.scriptsClaimingCache = null;
  }

  /**
   * 清掉這一輪尚未播放的演出排程。
   *
   * 這不是 `invalidate()`：熱更新只讓「彈道屬於哪支技能」的索引失效；
   * round reset／Forge scrub 則必須連尚未到期的 segment 與等待 castEnd 的 frame
   * 一起丟掉。否則把時間軸拉回 0 再播一次，上一輪 800ms 的餘燼會在新一輪
   * 800ms 疊播，畫面會隨重播次數愈來愈亮。
   */
  reset(): void {
    this.pending.length = 0;
    this.awaitingEnd.clear();
  }

  private scriptsClaiming(projectileId: string): VfxScriptDoc[] {
    // 快取「彈道 id → 認領它的 scripts」。分母小（script 數 ≪ 技能數）。
    if (this.scriptsClaimingCache === null) this.scriptsClaimingCache = new Map();
    const hit = this.scriptsClaimingCache.get(projectileId);
    if (hit) return hit;
    const out: VfxScriptDoc[] = [];
    for (const s of this.allScriptsWithProjectileTriggers()) {
      if (this.deps.projectileIdsOf(s.abilityId).has(projectileId)) out.push(s);
    }
    this.scriptsClaimingCache.set(projectileId, out);
    return out;
  }

  private allScriptsWithProjectileTriggers(): VfxScriptDoc[] {
    return this.deps.allScripts().filter((s) =>
      s.segments.some((seg) => seg.on === "projectileSpawn" || seg.on === "projectileHit"),
    );
  }

  private schedule(
    script: VfxScriptDoc,
    on: VfxScriptSegment["on"],
    frame: TriggerFrame,
    nowMs: number,
    tentativeKey?: string,
  ): void {
    for (const seg of script.segments) {
      if (seg.on !== on) continue;
      this.claimTakeover(seg, frame, nowMs);
      this.pending.push({
        dueMs: nowMs + (seg.atMs ?? 0),
        seg,
        frame,
        abilityId: script.abilityId,
        ...(tentativeKey !== undefined ? { tentativeKey } : {}),
      });
    }
  }

  /**
   * ⭐⭐ **取代語意的登記**（Codex 阻塞清單 C 的 `replacementPolicy`）。
   *
   * ⚠️ ⭐ **在排程的當下登記，⛔ 不是等到 `atMs` 之後執行時** ——
   * 預設演出在**事件那一幀**就會播，而一段 `atMs: 200` 的腳本
   * 如果等到 200ms 後才登記，那一幀早就兩條都跑完了。
   *
   * ⚠️ ⭐ 接管的**對象逐通道不同**：`caster.action` 掛施法者、
   * `target.reaction` 掛受害者 —— ⛔ 掛錯人＝壓制了一個沒有要壓制的身體。
   * ⇒ 受害者缺席（打空）時 `target.reaction` 這一段**不登記**，
   * ⛔ 不是登記在施法者身上。
   */
  private claimTakeover(seg: VfxScriptSegment, frame: TriggerFrame, nowMs: number): void {
    const channel = seg.replaces;
    if (channel === undefined) return;
    const entity = channel === "caster.action" ? frame.caster : frame.victim;
    if (entity === undefined) return;
    const untilMs = nowMs + (seg.atMs ?? 0) + (seg.replacesForMs ?? DEFAULT_TAKEOVER_MS);
    channelTakeover.claim(entity, channel, untilMs);
  }

  private anchorPos(
    at: "caster" | "target" | "point",
    frame: TriggerFrame,
  ): { x: number; z: number } | null {
    const casterPos = this.deps.entityPos(frame.caster);
    if (at === "target") return frame.targetPos ?? frame.point ?? casterPos;
    if (at === "point") return frame.point ?? casterPos;
    return casterPos;
  }

  private fire(
    seg: VfxScriptSegment,
    frame: TriggerFrame,
    nowMs: number,
    // ⭐ GH#974 —— 掉段帳本要說得出**是哪一支技能的哪一段**（驗收要 10 支逐支確認）。
    abilityId: string,
  ): void {
    const casterPos = this.deps.entityPos(frame.caster);
    const segIndex = this.deps.scriptFor(abilityId)?.segments.indexOf(seg) ?? -1;
    const drop = (reason: ScriptSegmentDrop["reason"]): void =>
      noteDrop({ abilityId, index: segIndex, kind: seg.kind, on: seg.on, reason });
    switch (seg.kind) {
      case "modelFx": {
        // 幾何走 sim 的同一份解算器（`modelFxInstancesFromFrame`）——
        // ⛔ 擺位語意不可以在播放器裡再活一份。
        const origin = casterPos ?? frame.point;
        // ⭐ GH#974 出口① —— ⛔ 在此之前這是一個**沒有聲音**的 return。
        if (!origin) return drop("no-origin");
        const insts = modelFxInstancesFromFrame(seg, {
          origin,
          facing: frame.direction,
          point: frame.point,
          targetPos: frame.targetPos,
        });
        // ⭐⭐ GH#974 出口② —— **最常見的那一個**：`anchor:"target"` 在
        //   `frame.targetPos` 與 `frame.point` 都缺席時解不出錨（出口③），
        //   於是整批段落落到這裡，⛔ 而它一句話都不說。
        //   ⚠️ `godie-e002.ex` 的 **17 段全部**是這一類 ⇒ 一次掉光。
        if (insts.length === 0) {
          return drop(seg.anchor === "target" && frame.targetPos === undefined && frame.point === undefined
            ? "no-anchor"
            : "no-instances");
        }
        // ── owner 2026-08-28 slider 裁決的連續參數（純演出，⛔ 不進 sim）──────
        // 位移在**面向座標系**（JASS PolarProjectionBJ 的翻譯）；朝向偏移旋轉
        // 每一具的 dir（CreateNUnitsAtLoc 的 angle 格）。三角函式在客戶端合法
        // （sim purity 只管 sim/**）。
        //
        // ⚠️⚠️ **前後那一格由 `modelFxInstancesFromFrame` 套過了**（GH#838 N1 把
        //    `offsetForwardU` 加進共用擺位核心，因為 sim 側的 09-04 也需要它）。
        //    ⇒ 這裡**只套側向**，⛔ 不可以再推一次 —— 推兩次的畫面看起來只是
        //    「偏移量怎麼是我填的兩倍」，而那種錯最難查（兩邊各自都對）。
        const fwd = 0;
        const side = seg.offsetSideU ?? 0;
        const yawDeg = seg.yawOffsetDeg ?? 0;
        const rad = (yawDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const placed =
          fwd === 0 && side === 0 && yawDeg === 0
            ? insts
            : insts.map((i) => ({
                ...i,
                origin: applyFacingOffset(i.origin, frame.direction, fwd, side),
                ...(i.dir && yawDeg !== 0
                  ? { dir: { x: i.dir.x * cos - i.dir.z * sin, z: i.dir.x * sin + i.dir.z * cos } }
                  : {}),
              }));
        const speed = seg.path === "static" ? 0 : (seg.speed ?? 0);
        const instances = placed.map((i) => {
          if (i.travel === 0) {
            return { x: i.origin.x, z: i.origin.z, dx: i.dir?.x ?? 0, dz: i.dir?.z ?? 0, dist: 0, durationSec: seg.lifeSec ?? 0 };
          }
          const durationSec =
            speed > 0 ? Math.min(i.travel / speed, seg.lifeSec ?? Number.POSITIVE_INFINITY) : (seg.lifeSec ?? 0);
          return {
            x: i.origin.x,
            z: i.origin.z,
            dx: i.dir?.x ?? 0,
            dz: i.dir?.z ?? 0,
            dist: Math.min(i.travel, speed * durationSec),
            durationSec,
          };
        });
        const payload: ModelFxSpawnEvent = {
          caster: frame.caster as ModelFxSpawnEvent["caster"],
          modelKey: seg.modelKey,
          path: seg.path,
          speed,
          x: origin.x,
          z: origin.z,
          zone: 0,
          ...(seg.soundKey !== undefined ? { soundKey: seg.soundKey } : {}),
          ...(seg.scale !== undefined ? { scale: seg.scale } : {}),
          ...(seg.scaleAxis !== undefined ? { scaleAxis: seg.scaleAxis } : {}),
          ...(seg.spinDegPerSec !== undefined ? { spinDegPerSec: seg.spinDegPerSec } : {}),
          ...(seg.clip !== undefined
            ? { clip: seg.clip, ...(seg.clipTimeScale !== undefined ? { clipTimeScale: seg.clipTimeScale } : {}) }
            : {}),
          ...(seg.tint !== undefined ? { tint: seg.tint } : {}),
          ...(seg.alpha !== undefined ? { alpha: seg.alpha } : {}),
          ...(seg.heightU !== undefined ? { heightU: seg.heightU } : {}),
          ...(seg.heightKeys !== undefined ? { heightKeys: seg.heightKeys } : {}),
          ...(seg.trailVfxId !== undefined
            ? {
                trailVfxId: seg.trailVfxId,
                ...(seg.trailIntervalSec !== undefined
                  ? { trailIntervalSec: seg.trailIntervalSec }
                  : {}),
              }
            : {}),
          instances,
        };
        this.deps.dispatch(
          { type: "modelFxSpawn", tick: frame.tick, data: payload as unknown as Record<string, unknown> },
          nowMs,
        );
        return;
      }
      case "vfx": {
        // `at:"bone"` 的骨頭解析在消費端（`boneSpawnPos` 讀 `attach`＋`caster`）——
        // 這裡只要給施法者座標當退化錨。self/bone→caster、target→target、point→point。
        const at = seg.at === "target" ? "target" : seg.at === "point" ? "point" : "caster";
        const anchored = this.anchorPos(at, frame);
        if (!anchored) return;
        const pos = applyFacingOffset(
          anchored,
          frame.direction,
          seg.offsetForwardU ?? 0,
          seg.offsetSideU ?? 0,
        );
        const payload: Partial<VfxSpawnEvent> = {
          vfxId: seg.vfxId,
          x: pos.x,
          z: pos.z,
          caster: frame.caster as VfxSpawnEvent["caster"],
          ...(seg.attach !== undefined ? { attach: seg.attach } : {}),
          ...(seg.durationSec !== undefined ? { durationSec: seg.durationSec } : {}),
        };
        // ⭐ GH#838 —— 這一發的連續參數（大小/透明度/顏色/轉向/高度/動畫速度）。
        //    ⚠️ 詞彙從 **schema 讀出來**（`ABILITY_VFX_LAYER_OVERRIDE_FIELDS`），
        //    ⛔ 不是在這裡手抄六個欄位名 —— 那會在有人加第七格的那天靜靜漏掉它。
        const ov: Record<string, unknown> = {};
        for (const f of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
          const v = (seg as unknown as Record<string, unknown>)[f];
          if (v !== undefined) ov[f] = v;
        }
        if (Object.keys(ov).length > 0) payload.overrides = ov;
        this.deps.dispatch(
          { type: "vfxSpawn", tick: frame.tick, data: payload as Record<string, unknown> },
          nowMs,
        );
        return;
      }
      case "floatingText": {
        const pos = this.anchorPos(seg.at === "target" ? "target" : "caster", frame);
        if (!pos) return;
        const payload: FloatingTextEvent = {
          text: seg.text,
          subjects: [{ id: frame.caster as FloatingTextEvent["caster"], x: pos.x, z: pos.z }],
          caster: frame.caster as FloatingTextEvent["caster"],
          zone: 0,
          ...(seg.colorRgb !== undefined ? { colorRgb: seg.colorRgb as [number, number, number] } : {}),
          ...(seg.sizeScale !== undefined ? { sizeScale: seg.sizeScale } : {}),
          ...(seg.riseSpeed !== undefined ? { riseSpeed: seg.riseSpeed } : {}),
          ...(seg.durationSec !== undefined ? { durationSec: seg.durationSec } : {}),
        };
        this.deps.dispatch(
          { type: "floatingText", tick: frame.tick, data: payload as unknown as Record<string, unknown> },
          nowMs,
        );
        return;
      }
      case "screenFlash": {
        const payload: ScreenFlashEvent = {
          broadcast: true,
          subjects: [],
          caster: frame.caster as ScreenFlashEvent["caster"],
          zone: 0,
          colorRgb: seg.colorRgb as [number, number, number],
          peakAlpha: seg.peakAlpha,
          durationSec: seg.durationSec,
          scripted: true,
        };
        this.deps.dispatch(
          { type: "screenFlash", tick: frame.tick, data: payload as unknown as Record<string, unknown> },
          nowMs,
        );
        return;
      }
      case "screenShake": {
        const payload: ScreenShakeEvent = {
          broadcast: true,
          subjects: [],
          caster: frame.caster as ScreenShakeEvent["caster"],
          zone: 0,
          amplitude: seg.amplitude,
          durationSec: seg.durationSec,
        };
        this.deps.dispatch(
          { type: "screenShake", tick: frame.tick, data: payload as unknown as Record<string, unknown> },
          nowMs,
        );
        return;
      }
      case "sound": {
        this.deps.playSfx?.(seg.soundKey, {});
        return;
      }
      case "bodyMove": {
        // ⭐⭐ M1 逐刀瞬移 ＋ M3 升空曲線 —— **一段**做兩件事（第〇·五守則）。
        // ⚠️ 它**只動畫面**：判定框、索敵、碰撞一格都不變。
        const mv = seg as unknown as {
          at?: "caster" | "target";
          mode?: "teleport" | "arc";
          offset: { x: number; y: number; z: number };
          durationMs: number;
        };
        const mover = mv.at === "target" ? frame.victim : frame.caster;
        if (mover === undefined) break;
        this.deps.moveBody?.(mover, mv.offset, mv.durationMs, mv.mode === "arc");
        break;
      }
      case "hideBody": {
        // ⭐ N6 —— 原作的主詞是施法者（ShowUnitHide(GetTriggerUnit())）。
        const who = seg.at === "target" ? (frame.victim ?? frame.targetPos ? frame.victim : undefined) : frame.caster;
        this.deps.hideBody?.(who ?? frame.caster, seg.durationMs);
        return;
      }
      case "anim": {
        // ⭐ M4 —— 受害者（預設）或施法者播一次脈衝；clipWindowMs 拉長＝慢動作。
        // ⚠️ 目標實體 id 只有 `comboStrike` 事件帶得到（`victim`）——
        //    其他觸發器解不到人就退回施法者，⛔ 不是靜靜跳過（失敗形態②）。
        const id = seg.at === "caster" ? frame.caster : (frame.victim ?? frame.caster);
        this.deps.pulseAnim?.(id, seg.pulse, seg.clipWindowMs !== undefined ? { clipWindowMs: seg.clipWindowMs } : undefined);
        return;
      }
    }
  }
}

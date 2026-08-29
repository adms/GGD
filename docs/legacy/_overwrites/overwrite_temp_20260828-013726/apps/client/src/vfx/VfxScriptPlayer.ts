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
import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import {
  modelFxInstancesFromFrame,
  type ModelFxSpawnEvent,
} from "@ggd/shared/sim/effects/spawnModelFx";
import type { FloatingTextEvent, ScreenFlashEvent, ScreenShakeEvent } from "@ggd/shared/sim/effects/clientCues";
import type { VfxSpawnEvent } from "@ggd/shared/sim/effects/spawnVfx";

/** 一次觸發當下解出的錨點材料（之後 firing 時仍會 refresh 施法者位置）。 */
interface TriggerFrame {
  caster: number;
  tick: number;
  point?: { x: number; z: number };
  direction?: { x: number; z: number };
  targetPos?: { x: number; z: number };
}

interface PendingFire {
  dueMs: number;
  seg: VfxScriptSegment;
  frame: TriggerFrame;
  /** `abilityCast` 掛的暫定 castEffect —— `castBegin` 來了就整組取消改等 castEnd */
  tentativeKey?: string;
}

export interface VfxScriptPlayerDeps {
  /** abilityId → script（查不到＝這支技能沒有演出腳本＝零成本路）。 */
  scriptFor(abilityId: string): VfxScriptDoc | undefined;
  /** 這支技能的 effects deep-scan 收集到的 projectileId 集合。 */
  projectileIdsOf(abilityId: string): ReadonlySet<string>;
  /** 全部 scripts 的列舉（彈道歸屬快取用）。 */
  allScripts(): readonly VfxScriptDoc[];
  entityPos(id: number): { x: number; z: number } | null;
  /** 回餵出貨消費端（＝ `VfxSystem.handleEvent`）。 */
  dispatch(ev: EventMessage, nowMs: number): void;
  playSfx?(event: string, opts?: { volume?: number; gateKey?: string }): boolean;
  /** 後台開關（三個住處那一格）—— 每次事件都活讀，關掉＝逐位元回到沒有 script 的世界。 */
  enabled(): boolean;
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
      case "projectileSpawn":
      case "projectileHit": {
        const projectileId = d.projectileId as string | undefined;
        const owner = d.owner as number | undefined;
        if (!projectileId || owner === undefined) return;
        // 歸屬：owner 的哪一份 script 認領這顆彈道 —— 由技能 JSON 推導
        const target = d.target as number | undefined;
        for (const script of this.scriptsClaiming(projectileId)) {
          const frame: TriggerFrame = {
            caster: owner,
            tick: ev.tick | 0,
            targetPos:
              target !== undefined ? (this.deps.entityPos(target) ?? undefined) : undefined,
          };
          this.schedule(script, ev.type, frame, nowMs);
        }
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
      this.fire(p.seg, p.frame, nowMs);
    }
  }

  // -------------------------------------------------------------------------

  private scriptsClaimingCache: Map<string, VfxScriptDoc[]> | null = null;

  /** 供 forge 熱改 script 之後重建歸屬快取。 */
  invalidate(): void {
    this.scriptsClaimingCache = null;
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
      this.pending.push({
        dueMs: nowMs + (seg.atMs ?? 0),
        seg,
        frame,
        ...(tentativeKey !== undefined ? { tentativeKey } : {}),
      });
    }
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

  private fire(seg: VfxScriptSegment, frame: TriggerFrame, nowMs: number): void {
    const casterPos = this.deps.entityPos(frame.caster);
    switch (seg.kind) {
      case "modelFx": {
        // 幾何走 sim 的同一份解算器（`modelFxInstancesFromFrame`）——
        // ⛔ 擺位語意不可以在播放器裡再活一份。
        const origin = casterPos ?? frame.point;
        if (!origin) return;
        const insts = modelFxInstancesFromFrame(seg, {
          origin,
          facing: frame.direction,
          point: frame.point,
          targetPos: frame.targetPos,
        });
        if (insts.length === 0) return;
        // ── owner 2026-08-28 slider 裁決的連續參數（純演出，⛔ 不進 sim）──────
        // 位移在**面向座標系**（JASS PolarProjectionBJ 的翻譯）；朝向偏移旋轉
        // 每一具的 dir（CreateNUnitsAtLoc 的 angle 格）。三角函式在客戶端合法
        // （sim purity 只管 sim/**）。
        const fwd = seg.offsetForwardU ?? 0;
        const side = seg.offsetSideU ?? 0;
        const yawDeg = seg.yawOffsetDeg ?? 0;
        if (fwd !== 0 || side !== 0 || yawDeg !== 0) {
          let fx = frame.direction?.x ?? 0;
          let fz = frame.direction?.z ?? 0;
          const fl = Math.hypot(fx, fz);
          if (fl < 1e-6) {
            fx = 1;
            fz = 0;
          } else {
            fx /= fl;
            fz /= fl;
          }
          const rx = fz; // 面向的右手邊（y-up 的 XZ 平面）
          const rz = -fx;
          const rad = (yawDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          for (const i of insts) {
            i.origin = {
              x: i.origin.x + fx * fwd + rx * side,
              z: i.origin.z + fz * fwd + rz * side,
            };
            if (i.dir && yawDeg !== 0) {
              i.dir = {
                x: i.dir.x * cos - i.dir.z * sin,
                z: i.dir.x * sin + i.dir.z * cos,
              };
            }
          }
        }
        const speed = seg.path === "static" ? 0 : (seg.speed ?? 0);
        const instances = insts.map((i) => {
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
        const pos = this.anchorPos(at, frame);
        if (!pos) return;
        const payload: Partial<VfxSpawnEvent> = {
          vfxId: seg.vfxId,
          x: pos.x,
          z: pos.z,
          caster: frame.caster as VfxSpawnEvent["caster"],
          ...(seg.attach !== undefined ? { attach: seg.attach } : {}),
          ...(seg.durationSec !== undefined ? { durationSec: seg.durationSec } : {}),
        };
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
    }
  }
}

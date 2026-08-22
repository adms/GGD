/**
 * 【常駐特效】的客戶端通道（GH#539）—— `ability@1.persistentVfx` 從「一份宣告」
 * 變成「畫面上真的掛著／真的被拆掉的東西」。
 *
 * owner 2026-08-22：
 * > 「莉娜有 EX 的時候**腳底下有魔法陣**這種 你也要記得還原」
 *
 * 原作逐字（`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j:8350`，
 * `Trig_EX_burst_Actions`）：
 * ```jass
 * set udg_EX_Mode[...] = true
 * call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "MidchilderNanohaAura.mdx" )
 * ```
 * ⭐ 全張圖 316 個 `AddSpecialEffectTarget` 呼叫裡，**只有這一個**同時滿足
 * 「被技能等級／EX 狀態擋著」與「從來沒有 `DestroyEffect`」—— 也就是說
 * **常駐特效在原作裡是一個機制、一支特效，⛔ 不是每個英雄一段程式**。
 * 所以這一份也是一個機制，⛔ 不是一個 `if (championId === "lina")`（第〇·五守則）。
 *
 * ### ⛔ 這個檔案存在的理由，只有一件事：**移除**
 *
 * 「掛上去」在 repo 裡已經有三條路（`W3xEmitterRig` / `AmbientVfx` /
 * `ChampionView.setFormAttachment`）。缺的一直是**條件變 false 的那一刻**：
 *
 * | 假的移除 | 為什麼是假的 |
 * |---|---|
 * | `alpha = 0` | 粒子照噴、材質照算，只是看不見 —— #262 特效洩漏就是這個形狀 |
 * | `durationSec` 給一個很大的值 | 時鐘到了就消失，⛔ 而條件可能還成立（兩個真相打架） |
 * | 什麼都不做，等 root 被 dispose | 條件在**同一具身體上**變 false 時 root 還活著 |
 *
 * ⭐ 所以 {@link PersistentVfxChannel.sync} 的承重那一行是 `handle.cancel()`
 * **加上** `mine.delete(key)`：句柄被殺掉、而且不再被記著（不刪 Map 的話下一次
 * `sync` 會以為它還在，於是條件重新成立時**不會**重新掛上）。
 *
 * ⚠️ **為什麼是 port 而不是直接吃 `W3xEmitterRig`**：那顆 rig 需要一個 Babylon
 * `Scene`，而這個檔案要驗的是**帳本**（誰該在、誰該走），不是粒子。把 Babylon
 * 藏在 port 後面，守衛就能斷言「`cancel()` 真的被呼叫了」而不是斷言
 * 「某個 mock 被呼叫了」（失敗形態 ③）。port 的形狀刻意逐字對齊
 * `W3xEffectHandle`（`cancel()` / `alive`），⛔ 不是一個為了測試發明的介面。
 */
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PERSISTENT_VFX_DEFAULT_ATTACH, type PersistentVfx } from "@ggd/shared/content/schema/ability";

/** 一個「現在應該掛著」的常駐特效，已經補完預設值。 */
export interface PersistentVfxRequest {
  /** 同一個實體上的穩定身分。相同 = 同一份掛件，⛔ 不重掛。 */
  readonly key: string;
  readonly vfxKey: string;
  readonly attach: string;
  readonly scale?: number;
  readonly alpha?: number;
}

/** `W3xEffectHandle` 的常駐子集（逐字同名，⛔ 不是新發明的介面）。 */
export interface PersistentVfxHandle {
  /** 立刻殺掉，含在飛的粒子。常駐特效沒有「排空」的語意。 */
  cancel(): void;
  readonly alive: boolean;
}

/** Babylon 那一半。回 `null` = 這份 vfx 還沒被著作（SOFT ref），當作沒有。 */
export interface PersistentVfxPort {
  attach(req: PersistentVfxRequest, root: TransformNode): PersistentVfxHandle | null;
}

/**
 * 一支技能的 `persistentVfx` → 現在該掛的清單。
 *
 * `isActive` 是「這棵 `when` 現在成立嗎」。⚠️ 條件求值需要 `SimWorld`（住在
 * sim 那一側），所以它是**注入**的，⛔ 不是在這裡重寫一份會跟 sim 漂開的求值器。
 * `when` 缺席 = 恆真 = 「這支技能在身上就掛著」，也就是原作的
 * `GetUnitAbilityLevel(u, id) > 0`。
 *
 * key 裡帶了 `vfxKey` 與 `attach`：換特效或換掛點會**重掛**（舊的先被 cancel），
 * ⛔ 不會留下一個掛在錯位置的舊殼。
 */
export function persistentVfxRequests(
  abilityId: string,
  specs: readonly PersistentVfx[] | undefined,
  isActive: (when: PersistentVfx["when"]) => boolean,
): PersistentVfxRequest[] {
  if (!specs) return [];
  const out: PersistentVfxRequest[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    if (!isActive(spec.when)) continue;
    const attach = spec.attach ?? PERSISTENT_VFX_DEFAULT_ATTACH;
    out.push({
      key: `${abilityId}#${i}:${spec.vfxKey}@${attach}`,
      vfxKey: spec.vfxKey,
      attach,
      ...(spec.scale === undefined ? {} : { scale: spec.scale }),
      ...(spec.alpha === undefined ? {} : { alpha: spec.alpha }),
    });
  }
  return out;
}

interface LiveEntity {
  root: TransformNode;
  handles: Map<string, PersistentVfxHandle>;
}

/**
 * 每個實體一本帳：現在掛著哪些常駐特效、掛在哪一顆 root 底下。
 * `sync()` 是**冪等**的 —— 同一份 desired 連呼叫兩次不會重掛任何東西。
 */
export class PersistentVfxChannel {
  private readonly live = new Map<string, LiveEntity>();

  constructor(private readonly port: PersistentVfxPort) {}

  sync(entityKey: string, root: TransformNode, desired: readonly PersistentVfxRequest[]): void {
    let entry = this.live.get(entityKey);
    // 換了身體（變身／重建模型）＝ 舊句柄掛在一顆即將被 dispose 的節點底下。
    // 留著它就是 #131 的孤兒發射器：Babylon 會把子節點丟回世界原點繼續噴。
    if (entry && entry.root !== root) {
      this.release(entityKey);
      entry = undefined;
    }
    const wanted = new Set(desired.map((d) => d.key));
    if (entry) {
      for (const [key, handle] of [...entry.handles]) {
        // 條件還成立而且句柄還活著 → 留著（⛔ 不重掛，重掛會閃一下）
        if (wanted.has(key) && handle.alive) continue;
        // ⭐ 承重的兩行：真的殺掉，而且不再記著它。
        handle.cancel();
        entry.handles.delete(key);
      }
    }
    for (const req of desired) {
      if (entry?.handles.has(req.key)) continue;
      const handle = this.port.attach(req, root);
      if (!handle) continue;
      if (!entry) {
        entry = { root, handles: new Map() };
        this.live.set(entityKey, entry);
      }
      entry.handles.set(req.key, handle);
    }
    if (entry && entry.handles.size === 0) this.live.delete(entityKey);
  }

  /** 實體離場。⛔ 不是「條件變 false」—— 那一條走 `sync` 的空 desired。 */
  release(entityKey: string): void {
    const entry = this.live.get(entityKey);
    if (!entry) return;
    for (const handle of entry.handles.values()) handle.cancel();
    this.live.delete(entityKey);
  }

  dispose(): void {
    for (const key of [...this.live.keys()]) this.release(key);
  }

  /** 現在真的掛著哪些（守衛讀這個，⛔ 不讀 port 的呼叫次數）。 */
  liveKeys(entityKey: string): readonly string[] {
    return [...(this.live.get(entityKey)?.handles.keys() ?? [])];
  }
}

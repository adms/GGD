/**
 * 🧩 GH#990 —— `vfx-script` 的**呼叫段展開器**（像 JASS 的函式呼叫）。⭐ 唯一的一支。
 *
 * owner 2026-09-05（逐字）：
 * > 「盡量特效模組化(甚至 sub-type) 像JASS一樣可以呼叫設定 來拼湊組合
 * >  並非每個技能都一個特定特效」
 *
 * 一份作者寫下的 script（`VfxScriptDoc`）的 `segments[]` 可以是 inline 段落或
 * `{"call":{"subtype","params"}}`。這一支把它變成播放器唯一吃的形狀
 * （`ExpandedVfxScriptDoc`：全部 inline）。**載入時**展開（第〇·四守則），
 * ⛔ 不烘進每一份 script、⛔ 客戶端與 sim／測試／工具不各寫一份。
 *
 * ── 決定性 ────────────────────────────────────────────────────────────────
 * 沒有 `Math.random`／`Date.now`／時鐘／迭代順序相依：同一份 script ＋ 同一組子模組
 * ⇒ 逐位元組相同的輸出（`packages/shared/src/sim/purity.test.ts` 那一族的要求，
 * 這裡雖然住在 `content/`，仍照守 —— 兩端展開結果不同就是畫面對不上）。
 *
 * ── 失敗形態⑧的防線 ───────────────────────────────────────────────────────
 * 子模組找不到／參數名不認得／數字超界／enum 外的值 ⇒ **擲** `VfxScriptExpandError`
 * 並指名 script id、第幾段、哪一顆子模組、為什麼。⛔ 不是靜默略過那一段 ——
 * 「schema 收得下、畫面上什麼都沒發生」正是第一·五守則要擋的東西。
 * 呼叫端（`VfxSystem`）自己決定 fail-open 的形狀，⛔ 但要出聲。
 */
import type { ContentStore } from "../store";
import {
  isVfxScriptCall,
  zVfxScriptSegment,
  type ExpandedVfxScriptDoc,
  type VfxScriptAuthoredDoc,
  type VfxScriptCall,
  type VfxScriptEntry,
  type VfxScriptSegment,
} from "../schema/vfxScript";
import { expandVfxSubtypeRaw, type VfxSubtypeDoc, type VfxSubtypeParam } from "../schema/vfxSubtype";

export type VfxSubtypeResolver = (id: string) => VfxSubtypeDoc | undefined;

export class VfxScriptExpandError extends Error {
  constructor(
    readonly scriptId: string,
    readonly entryIndex: number,
    readonly subtype: string,
    readonly reason: string,
  ) {
    super(`vfx-script ${scriptId} segments[${entryIndex}] call ${subtype}：${reason}`);
    this.name = "VfxScriptExpandError";
  }
}

/** key 排序後序列化 —— 「逐位元組相等」不受 JSON 鍵序影響（守衛與工具共用同一條）。 */
export function canonJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * 一格呼叫端給的值合不合這一格 slot（型別／界／enum）。回傳不合的理由，合＝null。
 * ⭐ 與 `zVfxSubtypeDoc` 對 `default` 做的是**同一套**規則（min/max/values）。
 */
export function paramValueProblem(p: VfxSubtypeParam, value: unknown): string | null {
  switch (p.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return `要是數字，拿到 ${JSON.stringify(value)}`;
      if (p.min !== undefined && value < p.min) return `${value} < min ${p.min}`;
      if (p.max !== undefined && value > p.max) return `${value} > max ${p.max}`;
      return null;
    }
    case "enum":
      if (typeof value !== "string" || !p.values?.includes(value))
        return `${JSON.stringify(value)} 不在 values ${JSON.stringify(p.values ?? [])} 裡`;
      return null;
    case "docRef":
      return typeof value === "string" && value.length > 0 ? null : `要是文件 id，拿到 ${JSON.stringify(value)}`;
    case "rgb":
      return Array.isArray(value) && value.length === 3 && value.every((c) => typeof c === "number")
        ? null
        : `要是 [r,g,b]，拿到 ${JSON.stringify(value)}`;
    default:
      // scaling / statModifiers / condition —— 這裡不猜形狀；展開後的段落還要過 zVfxScriptSegment。
      return null;
  }
}

/** 呼叫端的 `params` 逐格對子模組驗（不認得的 key 也算錯）。回傳每一筆問題。 */
export function checkCallParams(sub: VfxSubtypeDoc, params: Readonly<Record<string, unknown>> | undefined): string[] {
  const bad: string[] = [];
  for (const name of Object.keys(params ?? {}).sort()) {
    const p = sub.params[name];
    if (!p) {
      bad.push(`params.${name} 不是 ${sub.id} 的參數（有：${Object.keys(sub.params).sort().join(" / ")}）`);
      continue;
    }
    const problem = paramValueProblem(p, params![name]);
    if (problem) bad.push(`params.${name}：${problem}`);
  }
  return bad;
}

export interface ExpandOptions {
  /** 錯誤訊息裡指名的 script id（缺席＝"?"）。 */
  scriptId?: string;
  /**
   * 展開後每一段再過一次 `zVfxScriptSegment`（預設 **開**）。
   * 關掉只給已經驗過的熱路徑用 —— ⚠️ 關掉之後一段不合法的樣板會走到播放器。
   */
  validate?: boolean;
}

/**
 * ⭐ 展開一份 script 的段落：inline 段原樣、`call` 段換成子模組展開後的 N 段（原地插入，
 * 順序＝作者寫的順序）。純函式、決定性。
 */
export function expandVfxScriptEntries(
  entries: readonly VfxScriptEntry[],
  resolve: VfxSubtypeResolver,
  opts: ExpandOptions = {},
): VfxScriptSegment[] {
  const sid = opts.scriptId ?? "?";
  const validate = opts.validate ?? true;
  const out: VfxScriptSegment[] = [];
  entries.forEach((entry, i) => {
    if (!isVfxScriptCall(entry)) {
      out.push(entry);
      return;
    }
    const { subtype, params } = entry.call;
    const sub = resolve(subtype);
    if (!sub) throw new VfxScriptExpandError(sid, i, subtype, "content/vfx-subtypes/ 裡沒有這一顆（或還沒 registerVfxSubtypes）");
    const bad = checkCallParams(sub, params);
    if (bad.length > 0) throw new VfxScriptExpandError(sid, i, subtype, bad.join("；"));
    const raw = [] as ReturnType<typeof expandVfxSubtypeRaw>; // MUTATION: 呼叫段展開成空
    raw.forEach((seg, k) => {
      if (!validate) {
        out.push(seg as VfxScriptSegment);
        return;
      }
      const r = zVfxScriptSegment.safeParse(seg);
      if (!r.success) {
        throw new VfxScriptExpandError(
          sid,
          i,
          subtype,
          `展開後第 ${k} 段不是合法的 vfx-script 段落：` +
            r.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(" · "),
        );
      }
      out.push(r.data);
    });
  });
  return out;
}

/** 有沒有任何一段是呼叫。 */
export function hasVfxScriptCalls(doc: { segments: readonly VfxScriptEntry[] }): boolean {
  return doc.segments.some(isVfxScriptCall);
}

/** 每一個呼叫段指到哪一顆子模組（給 `refs.ts` 的 DanglingRef 掃描與工具用）。 */
export function vfxScriptCallRefs(doc: { segments: readonly VfxScriptEntry[] }): { index: number; subtype: string }[] {
  const out: { index: number; subtype: string }[] = [];
  doc.segments.forEach((e, index) => {
    if (isVfxScriptCall(e)) out.push({ index, subtype: (e as VfxScriptCall).call.subtype });
  });
  return out;
}

/**
 * ⭐ 展開一份文件。沒有呼叫段 ⇒ **回傳同一個物件**（identity）——
 * 播放器靠 `segments.indexOf(seg)` 找段號，展開結果要**穩定**，⛔ 不是每次呼叫一份新的。
 */
export function expandVfxScriptDoc<T extends Pick<VfxScriptAuthoredDoc, "id" | "segments">>(
  doc: T,
  resolve: VfxSubtypeResolver,
  opts: Omit<ExpandOptions, "scriptId"> = {},
): Omit<T, "segments"> & { segments: VfxScriptSegment[] } {
  if (!hasVfxScriptCalls(doc)) return doc as unknown as Omit<T, "segments"> & { segments: VfxScriptSegment[] };
  return { ...doc, segments: expandVfxScriptEntries(doc.segments, resolve, { ...opts, scriptId: doc.id }) };
}

// ---------------------------------------------------------------------------
// 子模組登錄表 —— 客戶端播放器展開時的查表來源
// ---------------------------------------------------------------------------
/**
 * ⚠️ 住這裡而不是 `content/registries.ts`，是因為那一份的 `ContentRegistry` 沒有 export
 * 且那一檔在這一輪的柵欄外。`registerAll()` 要在註冊 `vfx-scripts` **之前**呼叫
 * `registerVfxSubtypes(store)`（一行），⛔ 否則客戶端每一個呼叫段都會擲
 * 「還沒 registerVfxSubtypes」—— 而那是**刻意出聲**的，⛔ 不是靜默少一段。
 */
class VfxSubtypeRegistry {
  private readonly map = new Map<string, VfxSubtypeDoc>();
  register(d: VfxSubtypeDoc): void {
    this.map.set(d.id, d);
  }
  get(id: string): VfxSubtypeDoc {
    const d = this.map.get(id);
    if (!d) throw new Error(`vfx-subtype not registered: ${id}`);
    return d;
  }
  tryGet = (id: string): VfxSubtypeDoc | undefined => this.map.get(id);
  all(): VfxSubtypeDoc[] {
    return [...this.map.values()];
  }
  ids(): string[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}
export const VfxSubtypes = new VfxSubtypeRegistry();

/** 把 store 裡的 `vfx-subtypes` 全部登錄進 `VfxSubtypes`；回傳登錄了幾份。 */
export function registerVfxSubtypes(store: Pick<ContentStore, "all">): number {
  let n = 0;
  for (const d of store.all<VfxSubtypeDoc>("vfx-subtypes")) {
    VfxSubtypes.register(d);
    n++;
  }
  return n;
}

export type { ExpandedVfxScriptDoc };

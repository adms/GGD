/**
 * ⭐【變身對子：改了本體那一支，變身態的同一支有沒有跟著動】—— GH#479 ①。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-08-20 逐字
 * ─────────────────────────────────────────────────────────────────────────────
 * 「注意有時候你會**改錯有變身檔的英雄技能，只改了其中一個**」
 *
 * 一位有變身的英雄在內容樹裡是**兩份完整的英雄文件**（`Eme1` 本體 ／ `Emeu`
 * 變身態，見 `championForms.ts`），兩邊**各有一整套技能檔**。改一邊、忘另一邊
 * 的結果是：全套測試全綠，玩家變身之後用的是**舊的那一版**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼 `abilityCodeParity` 擋不住（它們是兄弟，不是同一條）
 * ─────────────────────────────────────────────────────────────────────────────
 * `abilityCodeParity` 問的是「同編號的兩份技能**值一不一樣**」，而它的棘輪
 * 基準線上**已經記著 300 多筆已知不一樣**的鍵 —— 變身對子的兩半天生就不一樣
 * （本體的 `NN-002` 是變身，變身態的同一格是別的東西），所以它們幾乎整批
 * 躺在豁免裡。⇒ 在那些欄位上**單邊改動是靜默的**，而那正是 owner 描述的缺陷。
 *
 * ⭐ 所以這一條記的**不是「哪些鍵不一樣」，是「兩邊各自長什麼樣」**：
 * 每一支技能逐邊存一個內容指紋。單邊的指紋變了 ⇒ 只有一邊被改過 ⇒ 紅，
 * 而且訊息**指名哪一支、哪一邊舊**。已經不一樣的欄位照樣守得住 —— 這是
 * 鍵層級的棘輪做不到的那一半。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 界線
 * ─────────────────────────────────────────────────────────────────────────────
 * · 「哪些欄位算機制」直接沿用 {@link COSMETIC_FIELDS}（改名／換圖／換特效
 *   ⛔ 不算改動 —— owner 的命名層守則：「改名不是缺陷」）。⛔ 不另立第二張表。
 * · 對子清單從 `CHAMPION_FORM_PAIRS` **推導**，⛔ 不手寫；哪一對還在出貨由
 *   `splitFormPairsByShipping()`（讀目錄）決定，所以搬進 `_legacy/` 的對子
 *   自動離開這條守衛。
 * · ⛔ 它**不裁決**哪一邊是對的（第〇·六守則）。它只說「這兩份不同步了」。
 */
import { COSMETIC_FIELDS, abilityCode, canonicalJson } from "./abilityCodeParity";

/** 一支技能在對子某一邊的內容指紋；`null` ＝ 那一邊沒有這個編號的技能。 */
export type SideFingerprint = string | null;

/** 基準線的一列：`{ "04-03": [本體指紋, 變身態指紋] }`。 */
export type FormPairBaseline = Readonly<Record<string, readonly [SideFingerprint, SideFingerprint]>>;

/** 一個編號在一組對子上的現況。 */
export interface FormPairAbilityState {
  /** 英雄編號（`04`）—— 對子與編號共用它，所以 code 本身就是唯一鍵。 */
  readonly hero: string;
  readonly baseId: string;
  readonly alternateId: string;
  /** w3x 技能編號，例 `04-03`。 */
  readonly code: string;
  readonly base: SideFingerprint;
  readonly alternate: SideFingerprint;
  /** 目前兩邊**值不同**的機制欄位（給訊息用；⛔ 不進基準線）。 */
  readonly driftFields: readonly string[];
}

/** 對不上基準線的一筆，`kind` 決定訊息長什麼樣。 */
export interface FormPairFinding {
  readonly state: FormPairAbilityState;
  readonly kind: "base-only" | "alternate-only" | "both" | "added" | "removed";
}

/**
 * 純 TS 的 64-bit FNV-1a（兩顆 32-bit 不同 offset basis 併起來）。
 *
 * ⚠️ 刻意**不用** `node:crypto` —— 這支模組與 `abilityCodeParity` 一樣要能被
 * 客戶端 bundle 進去，一個 node 內建 import 會把它變成只能在伺服器跑的檔。
 */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** 一份 ability doc 的機制指紋 —— 表演欄位（`COSMETIC_FIELDS`）先剝掉。 */
export function mechanicsFingerprint(doc: Record<string, unknown>): string {
  const kept: Record<string, unknown> = {};
  for (const k of Object.keys(doc).sort()) if (!COSMETIC_FIELDS.has(k)) kept[k] = doc[k];
  return fingerprint(canonicalJson(kept));
}

/** 兩份 doc 目前值不同的機制欄位。 */
function driftBetween(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const fields = new Set([...Object.keys(a), ...Object.keys(b)].filter((f) => !COSMETIC_FIELDS.has(f)));
  return [...fields].sort().filter((f) => canonicalJson(a[f]) !== canonicalJson(b[f]));
}

/**
 * 掃出每一組出貨中的變身對子、每一個編號、兩邊各自的指紋。
 *
 * @param pairs   出貨中的對子（`splitFormPairsByShipping().shipped`）
 * @param byChampion 英雄 id → 它的**標準版** ability docs（`content/abilities/<id>.*.json`）
 */
export function scanFormPairAbilities(
  pairs: readonly { heroNumber: string; baseId: string; alternateId: string }[],
  byChampion: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): FormPairAbilityState[] {
  const out: FormPairAbilityState[] = [];
  for (const pair of pairs) {
    const index = (id: string): Map<string, Record<string, unknown>> => {
      const m = new Map<string, Record<string, unknown>>();
      for (const doc of byChampion.get(id) ?? []) {
        const code = abilityCode(doc.name);
        if (code) m.set(code, doc);
      }
      return m;
    };
    const b = index(pair.baseId);
    const a = index(pair.alternateId);
    for (const code of [...new Set([...b.keys(), ...a.keys()])].sort()) {
      const db = b.get(code);
      const da = a.get(code);
      out.push({
        hero: pair.heroNumber,
        baseId: pair.baseId,
        alternateId: pair.alternateId,
        code,
        base: db ? mechanicsFingerprint(db) : null,
        alternate: da ? mechanicsFingerprint(da) : null,
        driftFields: db && da ? driftBetween(db, da) : [],
      });
    }
  }
  return out.sort((x, y) => x.code.localeCompare(y.code));
}

/** 把掃描結果壓成基準線的形狀（⛔ 不要手打這個檔）。 */
export function toBaseline(states: readonly FormPairAbilityState[]): FormPairBaseline {
  const out: Record<string, [SideFingerprint, SideFingerprint]> = {};
  for (const s of states) out[s.code] = [s.base, s.alternate];
  return out;
}

/** 現況 ↔ 基準線，回報每一筆對不上的以及**是哪一邊**動了。 */
export function diffAgainstBaseline(
  states: readonly FormPairAbilityState[],
  baseline: FormPairBaseline,
): FormPairFinding[] {
  const out: FormPairFinding[] = [];
  const seen = new Set<string>();
  for (const s of states) {
    seen.add(s.code);
    const was = baseline[s.code];
    if (!was) {
      out.push({ state: s, kind: "added" });
      continue;
    }
    const baseMoved = was[0] !== s.base;
    const altMoved = was[1] !== s.alternate;
    if (baseMoved && altMoved) out.push({ state: s, kind: "both" });
    else if (baseMoved) out.push({ state: s, kind: "base-only" });
    else if (altMoved) out.push({ state: s, kind: "alternate-only" });
  }
  for (const code of Object.keys(baseline).sort()) {
    if (seen.has(code)) continue;
    out.push({
      state: {
        hero: code.slice(0, 2),
        baseId: "?",
        alternateId: "?",
        code,
        base: null,
        alternate: null,
        driftFields: [],
      },
      kind: "removed",
    });
  }
  return out;
}

/** 給人看的一行 —— ⭐ 訊息要指名**哪一支、哪一邊舊**。 */
export function formatFinding(f: FormPairFinding): string {
  const s = f.state;
  const drift = s.driftFields.length > 0 ? `　目前分歧的欄位：${s.driftFields.join(", ")}` : "";
  switch (f.kind) {
    case "base-only":
      return (
        `${s.code}　⚠️ 只有**本體** ${s.baseId} 動了 —— 變身態 ${s.alternateId} 的 ${s.code} ` +
        `還是舊的。玩家變身之後用的是變身態那一份。${drift}`
      );
    case "alternate-only":
      return (
        `${s.code}　⚠️ 只有**變身態** ${s.alternateId} 動了 —— 本體 ${s.baseId} 的 ${s.code} ` +
        `還是舊的。${drift}`
      );
    case "both":
      return `${s.code}　兩邊都動了（${s.baseId} ／ ${s.alternateId}）—— 確認過就重新產生基準線。${drift}`;
    case "added":
      return `${s.code}　新的編號（${s.baseId} ／ ${s.alternateId}）—— 基準線上沒有它。${drift}`;
    case "removed":
      return `${s.code}　基準線上有、現在的對子裡沒有 —— 技能被刪掉／改編號／整組進 _legacy 了。`;
  }
}

/**
 * ⭐【同編號的技能，**機制數值**必須一樣】—— GH#417 的橫向對帳。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要它（⛔ 而 `abilityMirror.test.ts` 擋不住）
 * ─────────────────────────────────────────────────────────────────────────────
 * `abilityMirror` 守的是**縱向**：同一支技能的標準版 ↔ champion doc 裡的內嵌版。
 * 它守得很好（實測 312 份內嵌版對機制欄位零漂移）。
 *
 * ⛔ 但**沒有任何東西**在守**橫向**：兩位英雄身上掛著**同一個編號**的技能。
 * 專案的編號慣例是「編號是 JASS 對照的 join key，⛔ 不可浮動」——
 * `04-03` 永遠是龍破斬。⇒ 同編號 ＝ 同一支技能 ＝ **同樣的機制數值**。
 *
 * GH#417 量到的第一組：`godie-h020.e` 的龍破斬 AoE 半徑 **8.25**，
 * `godie-hjai.e` 的同一支 **6.0**。兩份文件各自合法、各自通過 schema、
 * 全套測試全綠 —— 因為**沒有人在比對它們**。
 *
 * ⚠️ 這一族的漂移可以無限累積而不會有任何訊號：每加一位共用編號的英雄，
 * 就多一份可以各自腐爛的抄本。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 界線：哪些欄位算「機制」，哪些可以不一樣
 * ─────────────────────────────────────────────────────────────────────────────
 * **可以不一樣**（{@link COSMETIC_FIELDS}）—— 這一條是 owner 立的：
 * 「**改名不是缺陷，數值/行為/編號才是**」（記憶 `ggd-naming-layer`）。
 *   · `id` / `icon` / `name` / `description` — 兩位英雄的同編號技能本來就可以有
 *     不同的文案與圖，GGD 有自己的命名層
 *   · `vfxKey` / `vfxLayers` / `sfxKey` / `hitFeel` — 表演層。龍破斬在 h020 身上
 *     是火柱、在 hjai 身上是虛空斬，**那是刻意的**
 *   · `provenance` / `schema` / `authoringNote` — 來源與作者備註，⛔ 不是遊戲行為
 *   · ⭐ `slot` —— 這一格是 owner 2026-07-30 對草泥馬（`godie-h02u`）親自拆開的：
 *     **編號↔技能是 join key（綁死）**，**技能↔槽位是設計偏好**。
 *     所以 `92-02 消化液` 一位英雄放 W、另一位放 E，⛔ **不是**缺陷。
 *
 * **必須一樣**（其餘全部）：`cooldown` / `manaCost` / `range` / `radius` /
 * `castTimeSec` / `castType` / `effects` / `template` / `passive` / `augment` /
 * `maxRank` / `targetsEnemies` / `rangeTier` / `radiusTier` / `innateKind`… ——
 * 一句話：**會改變一場比賽的東西**。
 *
 * ⚠️ 這張表是**負面表列**：新欄位預設「必須一樣」。這個方向是刻意的 ——
 * 漏掉一個新的表演欄位只會多一列噪音（看得見、改一行就好），
 * 漏掉一個新的機制欄位是**靜默**放行一整族漂移，⛔ 那才是 GH#417 本身。
 *
 * ⛔ 這支模組**不裁決**哪一邊是對的（第〇·六守則：那是 owner 的權力）。
 * 它只回報「這兩份不一樣」。
 */

/** 一組同編號技能在某一個欄位上的分歧。 */
export interface AbilityCodeDrift {
  /** w3x 英雄技能編號，例：`04-03`。 */
  readonly code: string;
  /** 分歧的欄位名。 */
  readonly field: string;
  /** 棘輪鍵：`<code>|<field>`。 */
  readonly key: string;
  /** 逐份的值（`id` ＋ 正規化後的 JSON），已按 id 排序。 */
  readonly values: readonly { readonly id: string; readonly json: string }[];
}

/** 允許不一樣的欄位 —— 理由逐條寫在檔頭。⛔ 加一格之前先讀那一段。 */
export const COSMETIC_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "icon",
  "name",
  "description",
  "vfxKey",
  "vfxLayers",
  "sfxKey",
  "hitFeel",
  "provenance",
  "schema",
  "authoringNote",
  "slot",
]);

/** `name` 開頭的 w3x 編號：`04-03 龍破斬` → `04-03`；`04-002` 是 EX。 */
export function abilityCode(name: unknown): string | null {
  if (typeof name !== "string") return null;
  return /^(\d{2}-\d{2,3})\s/.exec(name)?.[1] ?? null;
}

/**
 * 正規化成可以逐位元組比對的字串。
 *
 * ⚠️ 兩件事非做不可，否則會冒出**假的**分歧：
 *   ① `60.0` 與 `60` 在 JSON 裡是兩個字串，在遊戲裡是同一個數字
 *   ② 物件的鍵順序取決於誰先寫進去，⛔ 不是語意
 */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (typeof v === "number") return Number.isInteger(v) ? v : Number(v.toFixed(6));
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = walk((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v === undefined ? null : v;
  };
  return JSON.stringify(walk(value));
}

/**
 * 把 ability doc 依編號分組，回報每一組在機制欄位上的分歧。
 *
 * ⛔ 只吃**標準版** doc（`content/abilities/*.json`）—— 內嵌版由
 * `abilityMirror.test.ts` 守著，兩條軸各自一條守衛，⛔ 不互相代替。
 */
export function scanAbilityCodeDrift(docs: readonly Record<string, unknown>[]): AbilityCodeDrift[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const doc of docs) {
    const code = abilityCode(doc.name);
    if (!code) continue;
    const bucket = groups.get(code);
    if (bucket) bucket.push(doc);
    else groups.set(code, [doc]);
  }

  const out: AbilityCodeDrift[] = [];
  for (const code of [...groups.keys()].sort()) {
    const members = groups.get(code)!;
    if (members.length < 2) continue;
    members.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const fields = new Set<string>();
    for (const doc of members) for (const f of Object.keys(doc)) if (!COSMETIC_FIELDS.has(f)) fields.add(f);

    for (const field of [...fields].sort()) {
      const values = members.map((doc) => ({ id: String(doc.id), json: canonicalJson(doc[field]) }));
      if (new Set(values.map((v) => v.json)).size > 1) {
        out.push({ code, field, key: `${code}|${field}`, values });
      }
    }
  }
  return out;
}

/** 給人看的一行（守衛失敗訊息與 baseline dump 共用，⛔ 不要有第二種格式）。 */
export function formatDrift(d: AbilityCodeDrift, limit = 110): string {
  const cut = (s: string) => (s.length > limit ? `${s.slice(0, limit)}…` : s);
  return `${d.key}\t${d.values.map((v) => `${v.id}=${cut(v.json)}`).join("  ｜  ")}`;
}

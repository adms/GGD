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
/**
 * ⭐⭐ 【**省略有意義**的欄位 —— 比對之前先套預設】
 *
 * owner 2026-09-12（逐字）：「請幫助**漏填**這種 trivial 的狀況」
 *
 * ⚠️ ⭐ 這一族欄位的「沒填」**不是「沒有意見」**，它是一個**具體的值** ——
 * ⛔ 而逐位元組比對看不出這件事，於是「一邊寫 `true`、一邊留空」會被報成**分歧**，
 * ⭐ 儘管它們的**行為逐位元相同**。
 *
 * ⭐ 量到的代價（GH#1245）：`90-04 陽光烈焰` 兩個載體，一邊 `targetsEnemies: true`、
 * 一邊留空 ⇒ 閘報「同源分歧」⇒ ⛔ 我把它當成真缺陷，還開了一張票要 owner 裁決。
 * ⇒ ⭐ 補上 `true` 之後**一個位元的行為都沒變** —— 它從頭到尾就不是缺陷。
 *
 * ⇒ ⭐ 判準：**一個欄位的預設值寫在消費端，那比對端就必須知道它。**
 * ⛔ 不然「沒填」與「填了預設值」會變成兩個不同的東西，而它們是同一個。
 *
 * ⚠️ ⭐ 加一列之前先去**讀消費端**，⛔ 不要憑印象填 —— 這張表本身也會說謊。
 * 每一列都要寫得出「哪一行程式這樣預設」。
 */
const OMITTED_DEFAULTS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  // `sim/abilities/abilitySystem.ts`：`targetsEnemies !== false`（省略 = true）
  ["targetsEnemies", true],
  // ⛔ `radius` **刻意不在這裡**（2026-09-12 更正）——
  // ⚠️ 它的「省略」在兩個語境裡是**不同的值**（選人 1／它是不是 AoE 0），
  // ⇒ ⭐ 比對端無法替它挑一個，⛔ 挑了就是再造一個第三種意思。
  // 兩個具名解析器在 `sim/abilities/abilitySystem.ts`（`targetingRadius` / `authoredAoeRadius`）。
]);

/** 省略 ⇒ 套 {@link OMITTED_DEFAULTS} 的值；其餘原樣回傳。 */
function withDefault(field: string, value: unknown): unknown {
  return value === undefined && OMITTED_DEFAULTS.has(field)
    ? OMITTED_DEFAULTS.get(field)
    : value;
}

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
export function canonicalJson(value: unknown, selfHeroId?: string): string {
  const walk = (v: unknown): unknown => {
    if (typeof v === "number") return Number.isInteger(v) ? v : Number(v.toFixed(6));
    // ⭐ ③ **自我參照的技能 id 正規化**（2026-08-24,GH#673/#684 的 09-002 抓出來的）：
    //    變身對的兩份 EX 各自有一個 augment 指向**自己形態的 R**
    //    （godie-o00x.ex → godie-o00x.r / godie-ogrh.ex → godie-ogrh.r）——
    //    數值逐位相同,差的只有那個**結構上必然不同**的自我參照前綴。
    //    ⇒ 把自己的英雄 id 摺成 `<self>` 再比 —— 兩邊都變 `<self>.r`,
    //    真正的數值分歧照樣紅（value 2.5 vs 3 摺完還是不同）。
    //    ⛔ 只摺**自己**的 id：指向別人的 abilityId 是真的機制差異,照比。
    if (typeof v === "string" && selfHeroId !== undefined && v.startsWith(`${selfHeroId}.`)) {
      return `<self>${v.slice(selfHeroId.length)}`;
    }
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
      const values = members.map((doc) => ({
        id: String(doc.id),
        // ⭐ 自我參照摺疊:doc id 是 `<heroId>.<slot>`,英雄 id 是第一段。
        // ⭐ 省略值先套預設再比（見 {@link OMITTED_DEFAULTS}）。
        json: canonicalJson(withDefault(field, doc[field]), String(doc.id).split(".")[0]),
      }));
      // ⭐⭐ 【effects **結構不同** ⇒ 推導出來的欄位本來就會不同】
      //
      // owner 2026-09-12：「請幫助**漏填**這種 trivial 的狀況」
      //
      // ⚠️ ⭐ 同一個編號的兩個載體，**effects 的 kind 序列不同**時
      // （例：本體有 `damageArea`、變身態只有特效），
      // ⭐ `tiers:apply` 會**正確地**推出不同的 `manaCost`／`manaCostTier`
      // ——⇒ ⛔ 那不是分歧，那是推導在做它該做的事。
      //
      // ⭐ 量到的：`77-04` 兩邊 —— `[damageArea, spawnModelFx]` vs `[spawnVfx, spawnModelFx]`
      // ⇒ 耗魔 150 vs 75。⛔ 而在此之前這條閘把它報成「拿去給 owner 裁決」。
      // ⇒ ⭐ 同 GH#1237 已關的那 9 組：**同一個槽的兩支不同技能**，⛔ 不是同一支的兩份抄寫。
      //
      // ⚠️ ⛔ 只豁免**從 effects 推導**的那幾格 —— 其餘（冷卻／距離／吟唱）
      // ⭐ 仍然逐位元組比對：那些與 effects 結構無關，不一樣就是不一樣。
      const derivedFromEffects = field === "manaCost" || field === "manaCostTier";
      const shapes = new Set(
        members.map((d) =>
          JSON.stringify(
            (Array.isArray(d.effects) ? d.effects : []).map((e) =>
              (e as { kind?: unknown })?.kind,
            ),
          ),
        ),
      );
      if (derivedFromEffects && shapes.size > 1) continue;

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

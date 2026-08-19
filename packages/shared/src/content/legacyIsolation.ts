/**
 * ⭐【退場的英雄要真的離開內容樹 —— 一勞永逸地砍掉「照編號找技能改錯一份」】GH#479 ②。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-08-20 逐字
 * ─────────────────────────────────────────────────────────────────────────────
 * 「夜神月則是例外，有另一個英雄碰撞到但**應該要進 legacy 廢棄不被考慮**才對
 *  （**godie-e00u Sakuya 相關英雄設定與技能資料等都要移到 legacy 不要再被掃到，
 *  其他不能被選的英雄也是**）…**請你想個一勞永逸的方法**」
 *
 * 量到的原形：`godie-e00u`（十六夜Sakuya，已下架、四支技能檔名叫 `none`）身上
 * 掛著 **`44-00 機警`** —— 那是 **44 號夜神月** 的天生技，一次匯入時的誤植。
 * 於是「去改 44-00」這個動作有**兩份**候選檔，而且錯的那一份看起來完全正常。
 * 同型的第二組：`16-00` 同時掛在 `godie-nplh` 與 `godie-u01f` 上。
 *
 * ⭐ 根因不是撞號，是**退場的東西還躺在會被掃到的地方**。⇒ 解法不是「小心一點」
 * （判準治不了，見 CLAUDE.md 元規則），是把它們搬走，再讓撞號**結構上不可能**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 四條，全部是**兩個名詞之間的關係**（⛔ 不是「某份檔案存在嗎」）
 * ─────────────────────────────────────────────────────────────────────────────
 *   ① 下架名單 ↔ 檔案位置 —— `roster.json` 說退場的，檔案必須在 `_legacy/`
 *   ② `_legacy` ↔ 出貨樹   —— 歸檔的 id ⛔ 不可以同時還有出貨中的英雄／技能檔
 *   ③ `_legacy` ↔ 白名單種子 —— 歸檔的 id ⛔ 不可以出現在 `starterChampions`
 *   ④ 編號 ↔ 擁有者        —— 一個 `NN-XX` 在出貨樹裡只能屬於**一位英雄或一組變身對子**
 *
 * ⚠️ ④ 是這一票真正的「一勞永逸」：它**零豁免**（實測搬完之後撞號是 0），
 * 所以下一次有人把別人的編號複製到自己身上，當場就紅。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 名單一律**推導**
 * ─────────────────────────────────────────────────────────────────────────────
 * 「哪些英雄該進 `_legacy`」不是一張手寫表，是 {@link archivePlan} 從
 * `roster.json` 的 `retiredChampions` ＋ `CHAMPION_FORM_PAIRS` 算出來的：
 *
 *   · 沒有變身的下架英雄 → 搬
 *   · 下架的是**本體** → 本體與它的變身態**一起**搬（對子要整組動）
 *   · 下架的是**變身態、而本體還在出貨** → ⛔ **不可以搬**（`blocked`）：
 *     只搬一半 ＝ 玩家按下變身時 `Registry.get()` 在每秒 30 次的 snapshot 裡丟例外。
 *     這種只能靠下架名單本身擋（它擋得住：手動與隨機兩條路都擋）。
 *
 * ⭐ 所以 `blocked` 是**算出來的**，⛔ 不是我挑出來的豁免 —— 本體哪天也下架了，
 * 它自己會從 `blocked` 移到 `archive`。
 */

/** 一組 `Eme1`/`Emeu` 對子（只取這支模組需要的三格，⛔ 不綁死整個型別）。 */
export interface FormPairRef {
  readonly baseId: string;
  readonly alternateId: string;
}

/** 「誰該進 `_legacy`」的推導結果。 */
export interface ArchivePlan {
  /** 應該（或已經）躺在 `content/_legacy/` 的英雄 id。 */
  readonly archive: ReadonlySet<string>;
  /** 下架了但**不可以**搬的，附上算出來的理由。 */
  readonly blocked: readonly { readonly id: string; readonly why: string }[];
}

/** 從下架名單＋變身對子推導歸檔計畫。⛔ 這是唯一決定「誰該搬」的地方。 */
export function archivePlan(
  retired: ReadonlySet<string>,
  pairs: readonly FormPairRef[],
): ArchivePlan {
  const baseOf = new Map<string, string>();
  const altOf = new Map<string, string>();
  for (const p of pairs) {
    baseOf.set(p.alternateId, p.baseId);
    altOf.set(p.baseId, p.alternateId);
  }
  const archive = new Set<string>();
  const blocked: { id: string; why: string }[] = [];
  for (const id of [...retired].sort()) {
    const base = baseOf.get(id);
    if (base && !retired.has(base)) {
      blocked.push({
        id,
        why:
          `它是 ${base} 的變身態，而 ${base} 還在出貨名單上 —— 對子只搬一半，` +
          `玩家變身的當下整個房間會掛掉。要搬就連 ${base} 一起下架。`,
      });
      continue;
    }
    archive.add(id);
    const alt = altOf.get(id);
    if (alt) archive.add(alt); // 本體退場 ⇒ 那具變身態沒有任何一條路走得到
  }
  return { archive, blocked };
}

/** 這支模組回報的一筆問題。 */
export interface LegacyFinding {
  readonly rule: "①下架↔位置" | "②_legacy↔出貨樹" | "③_legacy↔白名單種子" | "④編號↔擁有者";
  readonly detail: string;
}

/** {@link scanLegacyIsolation} 的輸入 —— 全部是**讀出來的事實**，⛔ 沒有一格是常數。 */
export interface LegacyIsolationInput {
  /** `content/config/roster.json` 的 `retiredChampions`。 */
  readonly retired: ReadonlySet<string>;
  /** `CHAMPION_FORM_PAIRS`。 */
  readonly pairs: readonly FormPairRef[];
  /** `content/champions/` 的檔名 id。 */
  readonly operationalChampions: ReadonlySet<string>;
  /** `content/_legacy/champions/` 的檔名 id。 */
  readonly legacyChampions: ReadonlySet<string>;
  /** `content/abilities/` 的技能檔：擁有者英雄 id → 它宣告的編號（`04-03`，無編號的省略）。 */
  readonly abilityCodesByChampion: ReadonlyMap<string, readonly string[]>;
  /** `starter.go` 的 `starterChampions`。 */
  readonly starterSeed: readonly string[];
}

/** 四條關係全掃一遍。空陣列 ＝ 內容樹是乾淨的。 */
export function scanLegacyIsolation(input: LegacyIsolationInput): LegacyFinding[] {
  const out: LegacyFinding[] = [];
  const { archive } = archivePlan(input.retired, input.pairs);

  // ① 下架名單 ↔ 檔案位置
  for (const id of [...archive].sort()) {
    const stillChampion = input.operationalChampions.has(id);
    const stillAbilities = (input.abilityCodesByChampion.get(id) ?? []).length > 0;
    if (stillChampion || stillAbilities) {
      out.push({
        rule: "①下架↔位置",
        detail:
          `${id} 已下架（或它的本體已下架）卻還在出貨樹裡：` +
          `${stillChampion ? "content/champions/ 有它的英雄檔；" : ""}` +
          `${stillAbilities ? "content/abilities/ 還有它的技能檔；" : ""}` +
          `⭐ 用 git mv 把它們搬到 content/_legacy/ 底下（⛔ 不要刪）。`,
      });
    }
  }

  // ② `_legacy` ↔ 出貨樹（同一個 id 不可以兩邊都有）
  for (const id of [...input.legacyChampions].sort()) {
    if (input.operationalChampions.has(id)) {
      out.push({ rule: "②_legacy↔出貨樹", detail: `${id} 在 _legacy 與 content/champions 都有一份。` });
    }
    const codes = input.abilityCodesByChampion.get(id) ?? [];
    if (codes.length > 0) {
      out.push({
        rule: "②_legacy↔出貨樹",
        detail: `${id} 的英雄檔已歸檔，技能檔卻還在 content/abilities/（${codes.join(", ")}）—— 一起搬。`,
      });
    }
  }

  // ③ `_legacy` ↔ 白名單種子
  const seeded = input.starterSeed.filter((id) => input.legacyChampions.has(id));
  if (seeded.length > 0) {
    out.push({
      rule: "③_legacy↔白名單種子",
      detail: `starterChampions 還列著已歸檔的英雄：${seeded.join(", ")} —— 新裝會拿到一個空位。`,
    });
  }

  // ④ 編號 ↔ 擁有者（零豁免）
  const paired = new Map<string, string>();
  for (const p of input.pairs) {
    paired.set(p.baseId, p.alternateId);
    paired.set(p.alternateId, p.baseId);
  }
  const owners = new Map<string, Set<string>>();
  for (const [champ, codes] of input.abilityCodesByChampion) {
    for (const code of codes) {
      const set = owners.get(code) ?? new Set<string>();
      set.add(champ);
      owners.set(code, set);
    }
  }
  for (const code of [...owners.keys()].sort()) {
    const ids = [...owners.get(code)!].sort();
    if (ids.length < 2) continue;
    if (ids.length === 2 && paired.get(ids[0]!) === ids[1]) continue; // 變身對子共用編號是事實
    out.push({
      rule: "④編號↔擁有者",
      detail:
        `編號 ${code} 同時掛在 ${ids.join(" 與 ")} 身上，而他們不是一組變身對子 —— ` +
        `「去改 ${code}」從此有兩份候選檔，改錯的那一份看起來完全正常。`,
    });
  }

  return out;
}

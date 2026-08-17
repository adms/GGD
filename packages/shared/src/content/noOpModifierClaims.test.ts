/**
 * ⛔ **卡片上不可以有任何「說了但不會發生」的字。**
 *
 * owner 2026-08-18：
 *
 * > 「我們的規則應該是**不放任何無效說明**，應該**替換類似效果更新**，
 * >  其他有類似狀況也要記得替換」
 *
 * ── 為什麼這是一條**閘**而不是一句提醒 ─────────────────────────────────────
 * 這一族缺陷是 CLAUDE.md 失敗形態②的**最終形態**：schema 收得下、後台存得起來、
 * 卡片上印著那句話、`content:build` 全綠、全套測試全綠 —— 而遊戲裡什麼都不發生。
 * ⛔ 沒有任何既有的守衛會紅，**因為每一個零件都是對的**，只有它們的組合是空的。
 *
 * 2026-08-18 實測：三件新寶具身上有 **25 處**這種宣稱（`shining-golden-orbs` 22 處、
 * `ultimate-mod-shiranui` 2 處、`odm-gear` 1 處），而它們全部通過了
 * content:build + 3,594 條測試。CLAUDE.md 元規則：**判準治不了，只有閘可以。**
 *
 * ── 這一支現在關掉的兩個口子 ───────────────────────────────────────────────
 *
 * ① **`capRaise` / `capRaisePct` 指向一條沒有解鎖空間的屬性。**
 *    `sim/statCaps.ts::effectiveCap` 會把任何解鎖夾回 `unlocked`，所以當
 *    `unlocked === base` 時，這條 modifier 逐位元等於不存在。
 *    出貨的 13 條上限**只有 `as`（4→10）與 `lifesteal`（0.8→20）有空間**。
 *    ⚠️ 這一支**從 config 推導**那張名單，⛔ 不抄字面值 —— owner 哪天替某一條開了
 *    空間，這條守衛會自動跟著放行，⛔ 不必改測試。
 *
 * ② **`pctMult` 掛在「加成型」屬性上**（`outputDamagePct` / `outputHealingPct` /
 *    `outputShieldPct`）。那三條的 base 是 **0**，而管線是
 *    `(base + Σflat) × (1 + ΣpctAdd) × Π(1 + pctMult)` —— `0 × 任何東西 = 0`。
 *    所以它們**只有 `flat` 動得了**，而「不填 stackKey ＝複利」那條慣例對它們用不上。
 *    ⚠️ 這一條是 2026-08-18 那五個平行工作流其中一個**量**出來的，不是推測。
 *
 * ⚠️ 這一支**不是**在審美。它只問一件事：**這條 modifier 在出貨設定下，
 * 有沒有可能改變任何一個數字？** 答案是「不可能」的才會紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Stat } from "../sim/stats/statTypes";
import { ModOp } from "../sim/stats/modifiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * 這些屬性的 base 是 0 且語意是「加成」，所以乘區對它們恆為 0。
 * ⛔ 加新的加成型 Stat 時要記得補進來 —— 判準是「它的預設值是不是 0，而 0 的意思是
 * 『不動』而不是『歸零』」。
 */
const ADDEND_STATS: readonly Stat[] = [
  Stat.OutputDamagePct,
  Stat.OutputHealingPct,
  Stat.OutputShieldPct,
];

/** 從**出貨的 config** 推導「哪幾條屬性真的解得開」。⛔ 不抄字面值。 */
function raisableStats(): Set<string> {
  const caps = JSON.parse(readFileSync(join(CONTENT, "config/stat-caps.json"), "utf8")) as {
    caps: Record<string, { base: number; unlocked: number }>;
  };
  const out = new Set<string>();
  for (const [stat, c] of Object.entries(caps.caps)) {
    if (Number.isFinite(c.unlocked) && Number.isFinite(c.base) && c.unlocked > c.base) out.add(stat);
  }
  return out;
}

interface Claim {
  doc: string;
  path: string;
  stat: string;
  op: string;
  why: string;
}

function walk(node: unknown, path: string, doc: string, raisable: Set<string>, out: Claim[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, doc, raisable, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  const stat = typeof n.stat === "string" ? n.stat : undefined;
  const op = typeof n.op === "string" ? n.op : undefined;
  if (stat !== undefined && op !== undefined) {
    if ((op === ModOp.CapRaise || op === ModOp.CapRaisePct) && !raisable.has(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」在 config.stat-caps@1 裡 unlocked === base（沒有解鎖空間）→ effectiveCap 會把它夾回去，這條 modifier 逐位元等於不存在`,
      });
    }
    if (op === ModOp.PercentMult && (ADDEND_STATS as readonly string[]).includes(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」是**加成型**（base 0），而管線是 (base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult) → 0×任何東西=0。只有 flat 動得了它`,
      });
    }
  }
  for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`, doc, raisable, out);
}

function scan(): Claim[] {
  const raisable = raisableStats();
  const out: Claim[] = [];
  for (const coll of ["items", "abilities", "augments", "champions"]) {
    let files: string[];
    try {
      files = readdirSync(join(CONTENT, coll));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = `${coll}/${basename(f, ".json")}`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8"));
      } catch {
        continue;
      }
      walk(parsed, "", doc, raisable, out);
    }
  }
  return out;
}

describe("⛔ 卡片上不可以有「說了但不會發生」的字（owner 2026-08-18）", () => {
  it("★ 出貨的內容裡沒有任何**結構上不可能生效**的 modifier", () => {
    const claims = scan();
    const message = [
      "",
      "⛔ 無效宣稱 —— 這些 modifier 在**出貨設定下不可能改變任何一個數字**。",
      "",
      "owner 2026-08-18 的規則：「不放任何無效說明，應該**替換類似效果更新**」。",
      "⛔ 正確的修法是把那一句換成一個**做得到的等效效果**，",
      "⛔ 不是刪掉 modifier 卻把描述留著（那樣卡片還是在說謊）。",
      "",
      ...claims.map((c) => `  ${c.doc}${c.path}\n      ${c.op} ${c.stat} —— ${c.why}`),
      "",
      "兩條出路：",
      "  1. 換成做得到的等效機制（多數情況的正解）",
      "  2. 如果你真的要那條屬性可以被解鎖 → 去 content/config/stat-caps.json",
      "     把它的 unlocked 抬高（那是一個**平衡決定**，屬於 owner）",
      "",
    ].join("\n");
    expect(claims, message).toEqual([]);
  });

  it("⭐ 守衛自己是活的：把一個加成型屬性配上 pctMult 一定被抓到", () => {
    // ⚠️ 這一條在驗**掃描器**，⛔ 不是驗內容 —— 一支永遠回空陣列的掃描器
    // 會讓上面那條測試對「全綠」與「壞掉」給出一樣的答案（失敗形態③）。
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: Stat.OutputDamagePct, op: ModOp.PercentMult, value: 0.2 }] },
      "",
      "fake/doc",
      new Set(["as"]),
      out,
    );
    expect(out.map((c) => c.stat)).toEqual([Stat.OutputDamagePct]);
  });

  /**
   * ⛔ **撞到字數上限時要另存，不是壓縮取代。**
   *
   * owner 2026-08-18：
   *
   * > 「應該是**先備份原本內容成另一份檔案**，不應該直接壓縮取代」
   *
   * 前科（同一天，就在修無效宣稱的那一手）：`authoringNote` 有 2000 字硬上限，
   * 我把補充寫進去撐爆之後，**直接把原文截斷**塞回去 —— `shining-golden-orbs`
   * 因此少了 **254 字**（[完全體] 那一段的逐句對照），而 `content:build` 是綠的。
   *
   * ⚠️ 這與 `docs/legacy/_w3x-fidelity-superseded.md` 是同一條規矩：
   * 被取代的東西要另存 —— **測試可以跟著設計走，知識不可以無聲消失**。
   *
   * 這一條把它變成閘：**任何 `authoringNote` 都不可以帶截斷標記**。
   * 撞到上限的正解是把全文寫進 `docs/legacy/_item-authoring-notes-full.md`，
   * 然後在 JSON 裡留一行指標 —— ⛔ 不是把原文剪掉。
   */
  it("★ ⛔ 沒有任何 authoringNote 是被**截斷**的（撞上限要另存，不是壓縮）", () => {
    const MARKERS = ["…（略）", "…(略)", "……（略", "[truncated]", "（以下略）"];
    const bad: string[] = [];
    for (const coll of ["items", "abilities", "augments", "champions"]) {
      let files: string[];
      try {
        files = readdirSync(join(CONTENT, coll));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json") || f === "_index.json") continue;
        let d: { authoringNote?: unknown };
        try {
          d = JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8")) as { authoringNote?: unknown };
        } catch {
          continue;
        }
        const note = typeof d.authoringNote === "string" ? d.authoringNote : "";
        for (const m of MARKERS) {
          if (note.includes(m)) bad.push(`${coll}/${basename(f, ".json")} —— 帶截斷標記「${m}」`);
        }
      }
    }
    expect(
      bad,
      [
        "",
        "⛔ 這些 authoringNote 是被**截斷**的（owner 2026-08-18：「應該是先備份原本內容成另一份檔案，",
        "不應該直接壓縮取代」）。",
        "",
        ...bad.map((b) => `  ${b}`),
        "",
        "正解：把**全文**寫進 docs/legacy/_item-authoring-notes-full.md，",
        "JSON 裡只留一行指標。⛔ 不是把原文剪掉。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  /**
   * ⭐ **抬移速上限的文件必須同時給飛行。**
   *
   * owner 2026-08-18 對 #60 立體機動裝置的裁決是「**改成飛行型態 並且移動速度上限就好**」——
   * 那兩件事是**一個決定**，不是兩個。
   *
   * ⚠️ 理由是量到的：`sim/statCaps.ts` 記著 30Hz × 0.6(身體半徑) = **18.0 就是離散碰撞的
   * 穿牆平手線**，而新的 `unlocked` 24 = 每 tick 0.8u = 半徑 **133%**，確實在線外。
   * 它安全的**唯一**理由是持有者在飛：`sim/flight.ts` 讓 `MovementSystem` 跳過全部三處推擠，
   * 所以「會不會穿牆」對飛行者不是一個問題 —— 它本來就被允許穿過去。
   *
   * ⛔ 但 `stat-caps` 的 `unlocked` 是**全域**的：任何帶 `ms` capRaise 的來源都吃得到 24，
   * 包含**不會飛的**。那正是平手線會回來的那條路，而它的症狀是「偶爾穿牆」——
   * 查不出來、也不會有任何測試紅。
   *
   * ⇒ 把那個耦合寫成閘。⛔ 它紅了不要改閘：要嘛給那份文件 `flight`，
   * 要嘛把 `ms` 的 capRaise 拿掉。
   */
  it("★ ⛔ 抬「移速上限」的文件必須同時給飛行（穿牆平手線的唯一豁免）", () => {
    const offenders: string[] = [];
    for (const coll of ["items", "abilities", "augments", "champions"]) {
      let files: string[];
      try {
        files = readdirSync(join(CONTENT, coll));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json") || f === "_index.json") continue;
        const raw = readFileSync(join(CONTENT, coll, f), "utf8");
        // 先便宜地篩掉絕大多數文件，再做結構檢查。
        if (!raw.includes("capRaise")) continue;
        let doc: unknown;
        try {
          doc = JSON.parse(raw);
        } catch {
          continue;
        }
        let raisesMs = false;
        const hunt = (n: unknown): void => {
          if (Array.isArray(n)) return n.forEach(hunt);
          if (n === null || typeof n !== "object") return;
          const o = n as Record<string, unknown>;
          if (o.stat === Stat.MoveSpeed && (o.op === ModOp.CapRaise || o.op === ModOp.CapRaisePct)) {
            raisesMs = true;
          }
          Object.values(o).forEach(hunt);
        };
        hunt(doc);
        if (!raisesMs) continue;
        // 給飛行的形狀有兩種：頂層授權格，或某個 effect 帶 `flight`。
        if (!raw.includes('"flight"')) {
          offenders.push(`${coll}/${basename(f, ".json")}`);
        }
      }
    }
    expect(
      offenders,
      [
        "",
        "⛔ 這些文件抬高了**移動速度上限**卻沒有給飛行：",
        ...offenders.map((o) => `  ${o}`),
        "",
        "⚠️ `ms.unlocked` 24 = 每 tick 0.8u = 身體半徑 133%，**在穿牆平手線之外**",
        "（30Hz × 0.6 = 18.0，見 sim/statCaps.ts 的量測）。它安全的唯一理由是",
        "持有者在飛 —— 飛行讓 MovementSystem 跳過全部三處推擠。",
        "",
        "⛔ 不要改這條測試。要嘛給那份文件 `flight`，要嘛把 ms 的 capRaise 拿掉。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ 而且它讀的是 config，不是寫死的名單", () => {
    const raisable = raisableStats();
    expect(raisable.size, "config.stat-caps@1 一條解鎖空間都沒有 —— 那整族機制是死的").toBeGreaterThan(0);
    // 有空間的那一條配 capRaise **不可以**被判成無效。
    const someRaisable = [...raisable][0]!;
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: someRaisable, op: ModOp.CapRaise, value: 99 }] },
      "",
      "fake/doc",
      raisable,
      out,
    );
    expect(out, `${someRaisable} 有解鎖空間卻被判成無效`).toEqual([]);
  });

  /**
   * ⭐ 同一族的另一半：上面幾條抓「說了不會發生」，這一條抓「**根本拿不到**」。
   *
   * 出貨慣例是 `cost: 0` ＝「不上架賣，只從獎池掉」。所以一件 `cost: 0` 的寶具
   * 如果**不在任何 loot table 裡**，它對玩家而言不存在 —— 而且**沒有任何東西會叫**：
   * schema 綠、bundle 綠、圖示綠、描述漂亮，只是永遠不會出現在任何一場遊戲裡。
   * 這正是失敗形態②（做了但從沒送到玩家手上）在內容側的樣子。
   *
   * 量到的前例（2026-08-18）：`piercer-crossbow` 穿甲弩 與 `sage-ward-amulet`
   * 賢者的護身符 —— 兩件 tier-5、各有 2 條 modifier + 1 個 passive，`legendary`
   * 標籤也掛著，**在 51 件的基礎池裡一件都沒有**。⚠️ 而 `legendary` 標籤全 repo
   * 沒有任何行為消費者，所以「有標籤」從來就不是「拿得到」的證據。
   *
   * 突變紀錄：把其中一件從 `legendary-weapons.json` 拿掉 → 這條紅並指名它；放回 → 綠。
   */
  it("★ ⛔ 沒有任何 `cost: 0` 的寶具是**任何獎池都抽不到**的（失敗形態②）", () => {
    const pooled = new Set<string>();
    for (const f of readdirSync(join(CONTENT, "loot-tables"))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(CONTENT, "loot-tables", f), "utf8")) as {
        entries?: { itemId?: string }[];
      };
      for (const e of doc.entries ?? []) if (e.itemId) pooled.add(e.itemId);
    }
    expect(pooled.size, "一個獎池條目都讀不到 —— 這條守衛是空轉的").toBeGreaterThan(0);

    /**
     * ⛔ 具名豁免 —— **不是**把守衛放寬，是把「為什麼還拿不到」寫下來讓它會過期。
     *
     * ⚠️ 加一筆進來之前先確認：真的**沒有任何一個池收得下它**嗎？三個 draft 池
     * 依設計全部關閉 —— `legendary-weapons` 策展定死 49（`legendaryTags.test.ts`）、
     * `quest-rewards` 宣告退場凍結 13（`retiredLootTables.test.ts`）、
     * `ex-release-weapons` 是 tier-5 [EX解放] 專用。所以「開一條取得路徑」是
     * **策展決定**，不是隨手能補的欄位 —— 那正是這格豁免存在的理由。
     */
    const CURATION_PENDING: Record<string, string> = {
      "godie-i04v":
        "正義之杖（tier 3、wc3-import）。定價上架被 `itemTiers.test.ts`（只有 300/1200 兩個價）" +
        "與 `buildPath.test.ts`（逐字把它當 draft-only 0g 的樣本）擋下；" +
        "加進 quest-rewards 被 `retiredLootTables.test.ts` 擋下。等 owner 決定要不要為它" +
        "開一條 draft 路徑，或明確讓它退場。",
    };

    const orphans: string[] = [];
    for (const f of readdirSync(join(CONTENT, "items"))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(CONTENT, "items", f), "utf8")) as {
        id?: string;
        cost?: number;
        craftRole?: string;
        modifiers?: unknown[];
        passive?: unknown[];
      };
      const id = doc.id ?? basename(f, ".json");
      // ⛔ 只看「不上架賣」而且**真的有效果**的：合成元件與空殼不是這條要管的。
      if (doc.cost !== 0) continue;
      if (doc.craftRole === "component") continue;
      if ((doc.modifiers?.length ?? 0) + (doc.passive?.length ?? 0) === 0) continue;
      if (!pooled.has(id) && !(id in CURATION_PENDING)) orphans.push(id);
    }

    // ⭐ 豁免自己也要會過期:某一天有人把它放進池裡,這一行就紅,提醒把豁免刪掉。
    const stale = Object.keys(CURATION_PENDING).filter((id) => pooled.has(id));
    expect(
      stale,
      `這幾筆豁免過期了 —— 它們已經在獎池裡,把 CURATION_PENDING 的對應條目刪掉:\n${stale.join("\n")}`,
    ).toEqual([]);

    expect(
      orphans,
      [
        "這幾件寶具 `cost: 0`（＝不上架賣）卻不在任何 loot table 裡 —— **玩家永遠拿不到**：",
        ...orphans.map((o) => `  · ${o}`),
        "把它放進 content/loot-tables/ 的某一張表，或把它改成買得到（cost > 0）。",
      ].join("\n"),
    ).toEqual([]);
  });
});

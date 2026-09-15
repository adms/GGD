/**
 * ⭐⭐ GH#1227 —— 上架名單的**逐群宣告**，與「卡 ↔ 宣告」**兩個方向**的逐名比對。
 *
 * ── 為什麼（票面量到的）──────────────────────────────────────────────
 * owner 2026-09-11 列的範圍是 37＋37＋7＋11＋34＝126；`starterChampions` 扣掉下架／隱藏
 * 之後**也是 126**，⛔ 而組成是 45＋37＋37＋7 ⇒ **總數對了、組成錯了**，沒有任何東西會紅。
 * ⇒ 這支逐群比人數**與成員**，⛔ 不比總數。
 *
 * ── 每一格的住處（第〇·四守則：⛔ 這裡與宣告表都不抄名單）──────────────
 *   批次成員       docs/editor-contract/社群英雄126名上架狀態.md 的逐節表
 *   批次人數       tools/roster-guard/batch-declaration.json —— ⭐ 而且驗 owner 原話裡真的寫著這個數
 *   上架           starter.go 的 starterChampions
 *   下架           content/config/roster.json 的 retiredChampions
 *   待重上架       COMMUNITY_ACQUIRED_LEGACY（真的 import，同 legacyIndexFresh.test.ts）
 *   變身態         卡上自己的 transform（跟著本體的狀態走）
 *   回收桶         宣告表逐張明寫 —— 它的定義是「不在任何名單上」，推導不出來
 *
 * ── 兩個方向（綠燈假來源⑫：只從一頭走，結構上瞎一半）────────────────
 *   卡 → 宣告：`content/champions` ＋ `content/_legacy/champions` 每一張卡都要解得出狀態
 *   宣告 → 卡：名單說有的人，卡要在該在的那棵樹（例：`godie-eevi` 在待重上架名單上，兩棵樹都沒卡）
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMUNITY_ACQUIRED_LEGACY } from "../src/content/heroForge/communityAcquiredLegacy";
import { SELA, THORNE } from "../src/sim/content/skeleton";
import { readStarterRoster } from "./starterRoster";

export const DECLARATION_REL = "tools/roster-guard/batch-declaration.json";
export const BATCH_DOC_REL = "docs/editor-contract/社群英雄126名上架狀態.md";
const LIVE = "content/champions";
const LEGACY = "content/_legacy/champions";
type Tree = typeof LIVE | typeof LEGACY;

export interface RosterDeclaration {
  readonly ownerScope: { readonly quote: string };
  readonly batches: readonly {
    readonly item: number;
    readonly section: string;
    readonly expected: number;
    readonly starter: "all" | "none";
  }[];
  readonly original: { readonly name: string; readonly expected: number };
  readonly legacyUnlisted: { readonly name: string; readonly ids: readonly string[] };
  readonly missingCardExemptions: readonly { readonly id: string }[];
}

export interface RosterWorld {
  readonly declaration: RosterDeclaration;
  /** 126 名文件：節標題（去掉「（N）」）→ 逐列 id */
  readonly batchDoc: ReadonlyMap<string, readonly string[]>;
  readonly starter: readonly string[];
  readonly retired: readonly string[];
  readonly relist: readonly string[];
  readonly skeleton: readonly string[];
  /** 兩棵樹的卡：id → 在哪棵樹、變身態的本體（不是變身態就是 null） */
  readonly cards: ReadonlyMap<string, { readonly tree: Tree; readonly base: string | null }>;
  readonly duplicateCards: readonly string[];
}

export interface Finding {
  readonly pair: string;
  readonly detail: string;
  readonly fix: string;
}

/** `## 名稱（N）` 底下的 `| # | \`id\` | … |` 列 —— ⛔ 只認這個形狀（同 sync_pending_heroes.py）。 */
export function parseBatchDoc(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let section: string | null = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      section = /^## (.+?)（\d+）\s*$/.exec(line)?.[1] ?? null;
      continue;
    }
    const row = /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (section !== null && row) out.set(section, [...(out.get(section) ?? []), row[1]!]);
  }
  return out;
}

/** 讀**出貨的**每一份來源。⛔ 讀出 0 張卡／0 節批次 = 讀取器壞了，⛔ 不是內容空了。 */
export function loadRosterWorld(root: string): RosterWorld {
  const json = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
  const roster = json<{ retiredChampions?: string[] }>("content/config/roster.json");
  const cards = new Map<string, { tree: Tree; base: string | null }>();
  const duplicateCards: string[] = [];
  for (const tree of [LIVE, LEGACY] as const) {
    for (const f of readdirSync(join(root, tree))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = json<{ id: string; transform?: { role?: string; counterpartId?: string } }>(`${tree}/${f}`);
      if (cards.has(doc.id)) duplicateCards.push(doc.id);
      const base = doc.transform?.role === "alternate" ? (doc.transform.counterpartId ?? null) : null;
      cards.set(doc.id, { tree, base });
    }
  }
  const batchDoc = parseBatchDoc(readFileSync(join(root, BATCH_DOC_REL), "utf8"));
  if (cards.size === 0 || batchDoc.size === 0) {
    throw new Error(`讀出 ${cards.size} 張卡、${batchDoc.size} 節批次 —— 讀取器壞了，⛔ 不是內容空了`);
  }
  return {
    declaration: json<RosterDeclaration>(DECLARATION_REL),
    batchDoc,
    starter: readStarterRoster(root),
    retired: roster.retiredChampions ?? [],
    relist: COMMUNITY_ACQUIRED_LEGACY.map((h) => h.id),
    skeleton: [SELA.id, THORNE.id],
    cards,
    duplicateCards,
  };
}

/** 一個 id 的狀態 —— 規則照順序，變身態跟著本體。回 null ＝ ⛔ 沒有任何宣告涵蓋它。 */
export function rosterStatus(w: RosterWorld, id: string, seen: ReadonlySet<string> = new Set()): string | null {
  if (w.skeleton.includes(id)) return "骨架佔位";
  if (w.retired.includes(id)) return "已下架";
  const batch = w.declaration.batches.find((b) => w.batchDoc.get(b.section)?.includes(id));
  if (w.starter.includes(id)) return `上架（${batch?.section ?? w.declaration.original.name}）`;
  if (batch) return `待上架（${batch.section}）`;
  const base = w.cards.get(id)?.base;
  if (base && !seen.has(id)) {
    const s = rosterStatus(w, base, new Set([...seen, id]));
    return s && `變身態（本體 ${base}：${s}）`;
  }
  return w.declaration.legacyUnlisted.ids.includes(id) ? w.declaration.legacyUnlisted.name : null;
}

export function checkRosterDeclaration(w: RosterWorld): Finding[] {
  const out: Finding[] = [];
  const d = w.declaration;
  const push = (pair: string, ids: readonly string[], detail: string, fix: string): void => {
    if (ids.length > 0) out.push({ pair, detail: `${detail}：${ids.join(", ")}`, fix });
  };
  const starter = new Set(w.starter);
  const batchIds = new Set<string>();

  // ① 逐群：owner 原話 ↔ 宣告人數 ↔ 權威文件的成員 ↔ starterChampions
  for (const b of d.batches) {
    const ids = w.batchDoc.get(b.section) ?? [];
    for (const id of ids) batchIds.add(id);
    if (!new RegExp(`^${b.item}\\. [^\\n]*?(?<![0-9])${b.expected} 名`, "m").test(d.ownerScope.quote)) {
      out.push({
        pair: "宣告人數 ↔ owner 原話",
        detail: `第 ${b.item} 批「${b.section}」宣告 ${b.expected} 名，⛔ 而 owner 原話第 ${b.item} 項沒有寫這個數`,
        fix: `${DECLARATION_REL} 的 expected 只能照抄 ownerScope.quote —— owner 改了範圍就連原話一起換。`,
      });
    }
    if (ids.length !== b.expected) {
      out.push({
        pair: "宣告人數 ↔ 權威文件",
        detail: `「${b.section}」宣告 ${b.expected} 名，${BATCH_DOC_REL} 那一節列了 ${ids.length} 名`,
        fix: "兩邊有一邊錯了：文件是 Codex 的狀態頁，宣告是 owner 的原話 —— ⛔ 不要只改一邊讓它變綠，先查是誰漂了。",
      });
    }
    push(
      "逐群宣告 ↔ starterChampions",
      ids.filter((id) => starter.has(id) !== (b.starter === "all")),
      `「${b.section}」宣告 starter:"${b.starter}"，⛔ 這幾名不是`,
      `整批上架／下架時，同一個 commit 改 ${DECLARATION_REL} 那一批的 starter；只上了一半就是還沒做完。`,
    );
  }
  push(
    "權威文件 ↔ 宣告",
    [...w.batchDoc.keys()].filter((s) => !d.batches.some((b) => b.section === s)),
    `${BATCH_DOC_REL} 有宣告表沒有的批次`,
    `把那一批加進 ${DECLARATION_REL} 的 batches（人數要引用得到 owner 原話）。`,
  );
  const original = w.starter.filter((id) => !batchIds.has(id));
  if (original.length !== d.original.expected) {
    out.push({
      pair: `${d.original.name} ↔ starterChampions`,
      detail: `starterChampions 不屬於任何一批的有 ${original.length} 名，宣告 ${d.original.expected} 名`,
      fix: `新加的人屬於某一批 ⇒ 權威文件那一節要有他；真的是原作上下架 ⇒ 同一個 commit 改 original.expected。`,
    });
  }

  // ② 卡 → 宣告（兩棵樹）
  push(
    "卡 → 宣告",
    [...w.cards.keys()].filter((id) => rosterStatus(w, id) === null).sort(),
    "這幾張卡**沒有任何宣告涵蓋**（不在任何名單、不是任何人的變身態、也沒寫進回收桶）",
    `決定它是什麼：上架 → starter.go；下架 → roster.json；真的是回收桶 → ${DECLARATION_REL} 的 legacyUnlisted.ids。`,
  );
  push("卡 ↔ 卡", w.duplicateCards, "同一個 id 在兩棵樹都有卡", "留一張 —— 上架在 content/champions，其餘在 content/_legacy/champions。");

  // ③ 宣告 → 卡
  const exempt = new Set(d.missingCardExemptions.map((e) => e.id));
  const needs: readonly [string, readonly string[], Tree | null][] = [
    ["starterChampions", w.starter, LIVE],
    ["retiredChampions", w.retired, null],
    ["COMMUNITY_ACQUIRED_LEGACY", w.relist, null],
    [`宣告表的${d.legacyUnlisted.name}`, d.legacyUnlisted.ids, LEGACY],
  ];
  for (const [from, ids, tree] of needs) {
    const card = (id: string) => w.cards.get(id);
    push(
      `宣告 → 卡（${from}）`,
      ids.filter((id) => !exempt.has(id) && (!card(id) || (tree !== null && card(id)!.tree !== tree))),
      `名單有、⛔ ${tree ?? "兩棵樹"}沒有卡`,
      `把卡放回該在的樹，或把 id 從名單拿掉；真的還不該有卡 ⇒ ${DECLARATION_REL} 的 missingCardExemptions 加一列並寫可反駁的理由。`,
    );
  }
  const needed = new Set(needs.flatMap(([, ids]) => ids));
  push(
    "豁免 ↔ 現況",
    [...exempt].filter((id) => w.cards.has(id) || !needed.has(id)),
    "這幾列豁免已經不成立（卡出現了，或它已不在任何要求有卡的名單上）",
    `從 ${DECLARATION_REL} 的 missingCardExemptions 刪掉 —— 過期的豁免會替下一個缺口背書。`,
  );

  // ④ 名單之間
  push(
    "COMMUNITY_ACQUIRED_LEGACY ↔ 權威文件",
    w.relist.filter((id) => !batchIds.has(id)),
    "待重上架名單有、126 名文件任何一批都沒有",
    "重上架必須屬於 owner 列的某一批 —— 查 #1205 的範圍。",
  );
  push(
    `${d.legacyUnlisted.name} ↔ 推導`,
    d.legacyUnlisted.ids.filter((id) => rosterStatus(w, id, new Set()) !== d.legacyUnlisted.name),
    "明寫在回收桶，⛔ 而它的狀態推導得出來（已在某份名單上，或是變身態）",
    `從 legacyUnlisted.ids 刪掉 —— 推導得出來的值⛔ 不要有第二個住處。`,
  );
  return out;
}

/** `pnpm roster:check` 通過時印的一行（觀測，⛔ 不是閘）。 */
export function rosterDeclarationSummary(w: RosterWorld): string {
  const d = w.declaration;
  const batchIds = new Set(d.batches.flatMap((b) => w.batchDoc.get(b.section) ?? []));
  const original = w.starter.filter((id) => !batchIds.has(id)).length;
  const tally = (tree: Tree): string => {
    const n = new Map<string, number>();
    for (const [id, c] of w.cards) {
      if (c.tree !== tree) continue;
      const s = (rosterStatus(w, id) ?? "?").replace(/（.*$/, "");
      n.set(s, (n.get(s) ?? 0) + 1);
    }
    return [...n].map(([s, k]) => `${s} ${k}`).join(" · ");
  };
  const batches = d.batches.map((b) => {
    const ids = w.batchDoc.get(b.section) ?? [];
    return `${b.section} ${ids.filter((id) => w.starter.includes(id)).length}/${ids.length}`;
  });
  return (
    `  逐群（在 starterChampions／該批人數）：${d.original.name} ${original} · ${batches.join(" · ")}\n` +
    `  卡：${LIVE}（${tally(LIVE)}）· ${LEGACY}（${tally(LEGACY)}）`
  );
}

/**
 * ⭐⭐ GH#1227 —— 上架名單的**逐群宣告**，與退休區「卡 ↔ 宣告」**兩個方向**的逐名比對。
 *
 * ── 為什麼 ──────────────────────────────────────────────────────────
 * owner 2026-09-11 12:17 列的範圍是五批、合計 126（逐字住宣告表的 `ownerScope.quote`）。
 * ⚠️ 本票第一版把 `starterChampions`（扣下架／隱藏之後也是 126）讀成「總數對了、組成錯了」——
 *    ⛔ 那個前提**已被收回**。本票 2026-09-11 更正塊（Claude 寫的留言，⛔ 不是 owner 的話）逐字：
 *    「那兩個 126 **不是同一個集合，也不是同一個軸**」、「⛔ **不是**「名單組成錯了」（那是我讀錯）」。
 *    ⇒ 一個 126 是 **git 的名單檔**（`starterChampions`：原作班底＋三批已在名單檔上的人），
 *      另一個是權威文件定義的**正式服務發布**（「已在 Main 當下正式服務確認可選，且有目前發布版本」）
 *      ⇒ ⭐ **總數相同是巧合**，⛔ 不是同一份名單的兩種組成。
 * ⇒ 這支逐群比**人數與成員**（⛔ 不比總數）；「git 有、服務沒有發布」那一軸住
 *   `scripts/mini-deploy.sh` 的 `roster_publication_check`，⛔ 不在這裡。
 *
 * ── 每一格的住處（第〇·四守則：⛔ 不抄名單、⛔ 不重寫別人已經住好的推導）─────────────
 *   批次成員        docs/editor-contract/社群英雄126名上架狀態.md 的逐節表
 *   批次人數        宣告表 —— ⭐ 而且驗 owner 原話第 N 項（「合計」之前）真的寫著這個數
 *   上架            starter.go 的 starterChampions
 *   待重上架        COMMUNITY_ACQUIRED_LEGACY（真的 import）
 *   退休卡的狀態     ⭐ docs/legacy-index-champions.json —— `tools/legacy-index/build_index.py` 的產物
 *                  （已下架／待重上架／從未開放，變身態跟著本體）。⛔ 這裡**不再推導一次**：
 *                  第一版在 TS 重寫了那三條規則 ⇒ 同一套規則兩個住處，連詞彙與張數都各說各話。
 *                  ⚠️ 那份 JSON 過期由 `legacyIndexFresh.test.ts`（`--check`）紅，⛔ 不是這支。
 *   從未開放的「有人看過」  宣告表 `legacyNeverOpened.ids`（只列本體，變身態跟著本體）
 *
 * ── 不在這裡的（已經有住處，⛔ 不重複）──────────────────────────────
 *   content/champions 每張卡的身分 → tools/roster-guard/check.ts ⑧ · starter → 內容樹 → 同檔 ②
 *   下架 id 指到真的卡 → packages/shared/src/content/championRetirement.test.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMUNITY_ACQUIRED_LEGACY } from "../src/content/heroForge/communityAcquiredLegacy";
import { readStarterRoster } from "./starterRoster";

export const DECLARATION_REL = "tools/roster-guard/batch-declaration.json";
export const BATCH_DOC_REL = "docs/editor-contract/社群英雄126名上架狀態.md";
export const LEGACY_STATUS_REL = "docs/legacy-index-champions.json";
const LIVE = "content/champions";
/** legacy-index JSON 的穩定代碼（⛔ 不比中文標籤）。 */
const NEVER = "never";

/** all＝整批在 starterChampions · none＝整批不在 · partial＝逐名推導（只有一部分在，閘只印人數）。 */
export type StarterShape = "all" | "none" | "partial";

export interface RosterDeclaration {
  readonly ownerScope: { readonly quote: string };
  readonly batches: readonly {
    readonly item: number;
    readonly section: string;
    readonly expected: number;
    readonly starter: StarterShape;
  }[];
  readonly original: { readonly name: string; readonly expected: number };
  readonly legacyNeverOpened: { readonly ids: readonly string[] };
  readonly missingCardExemptions: readonly { readonly id: string }[];
}

export interface LegacyStatusDoc {
  readonly rules: readonly { readonly status: string; readonly label: string; readonly count: number }[];
  readonly reopenWithoutLegacyCard: readonly { readonly id: string; readonly liveCard: boolean }[];
  readonly cards: readonly { readonly id: string; readonly base: string | null; readonly status: string }[];
}

export interface RosterWorld {
  readonly declaration: RosterDeclaration;
  /** 126 名文件：節標題（去掉「（N）」）→ 逐列 id */
  readonly batchDoc: ReadonlyMap<string, readonly string[]>;
  readonly starter: readonly string[];
  readonly relist: readonly string[];
  readonly legacy: LegacyStatusDoc;
  readonly liveCardIds: readonly string[];
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

/**
 * owner 原話第 `item` 項有沒有寫著「`n` 名」。
 * ⚠️ 只看「合計」**之前** —— 第 5 項與「合計 126 名」在同一行，⛔ 不切掉的話把第 5 批宣告成合計數也會過。
 */
export function ownerQuoteSays(quote: string, item: number, n: number): boolean {
  const line = quote.split("\n").find((l) => l.startsWith(`${item}. `));
  return line !== undefined && new RegExp(`(?<![0-9])${n} 名`).test(line.split("合計")[0]!);
}

/** 讀**出貨的**每一份來源。⛔ 讀出 0 張卡／0 節批次 = 讀取器壞了，⛔ 不是內容空了。 */
export function loadRosterWorld(root: string): RosterWorld {
  const json = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
  const liveCardIds = readdirSync(join(root, LIVE))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => json<{ id: string }>(`${LIVE}/${f}`).id);
  const batchDoc = parseBatchDoc(readFileSync(join(root, BATCH_DOC_REL), "utf8"));
  const legacy = json<LegacyStatusDoc>(LEGACY_STATUS_REL);
  if (liveCardIds.length === 0 || legacy.cards.length === 0 || batchDoc.size === 0) {
    throw new Error(
      `讀出 ${liveCardIds.length} 張上架樹的卡、${legacy.cards.length} 張退休卡、${batchDoc.size} 節批次 —— 讀取器壞了，⛔ 不是內容空了`,
    );
  }
  return {
    declaration: json<RosterDeclaration>(DECLARATION_REL),
    batchDoc,
    starter: readStarterRoster(root),
    relist: COMMUNITY_ACQUIRED_LEGACY.map((h) => h.id),
    legacy,
    liveCardIds,
  };
}

const STARTER_FIX: Record<StarterShape, string> = {
  partial:
    "只有一部分在 starterChampions。⭐ 如果是 owner 同意**逐名先上架**（例：owner 2026-09-14 02:20「隱藏角色要顯示 黑化Saber可以上架」，" +
    `docs/_daily/2026-09-14.md:12）⇒ 同一個 commit 把 ${DECLARATION_REL} 那一批的 starter 改成 "partial"（逐名推導，閘只印人數）；` +
    "⛔ 不要為了變綠把人從 starter.go 拿掉。是誤加／誤刪 ⇒ 改 starter.go。",
  all: `整批都在 starterChampions ⇒ 同一個 commit 把 ${DECLARATION_REL} 那一批的 starter 改成 "all"；不是整批上架而是誤加 ⇒ 改 starter.go。`,
  none: `整批都不在 starterChampions ⇒ 同一個 commit 把 ${DECLARATION_REL} 那一批的 starter 改成 "none"；不是整批下架而是誤刪 ⇒ 改回 starter.go。`,
};

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
    if (!ownerQuoteSays(d.ownerScope.quote, b.item, b.expected)) {
      out.push({
        pair: "宣告人數 ↔ owner 原話",
        detail: `第 ${b.item} 批「${b.section}」宣告 ${b.expected} 名，⛔ 而 owner 原話第 ${b.item} 項（「合計」之前）沒有寫這個數`,
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
    const inStarter = ids.filter((id) => starter.has(id));
    const actual: StarterShape =
      inStarter.length === 0 ? "none" : inStarter.length === ids.length ? "all" : "partial";
    if (ids.length > 0 && actual !== b.starter) {
      const odd = b.starter === "partial" ? [] : ids.filter((id) => starter.has(id) !== (b.starter === "all"));
      out.push({
        pair: "逐群宣告 ↔ starterChampions",
        detail:
          `「${b.section}」宣告 starter:"${b.starter}"，⛔ 而 starterChampions 裡有 ${inStarter.length}/${ids.length} 名（＝"${actual}"）` +
          (odd.length > 0 ? `；不符的：${odd.join(", ")}` : ""),
        fix: STARTER_FIX[actual],
      });
    }
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

  // ② 退休卡 → 宣告：legacy-index 算成「從未開放」的，本體要有人看過（⛔ 補集會把沒人決定過的卡安靜吞掉）
  const neverLabel = w.legacy.rules.find((r) => r.status === NEVER)?.label ?? NEVER;
  const declared = new Set(d.legacyNeverOpened.ids);
  push(
    "退休卡 → 宣告",
    w.legacy.cards
      .filter((c) => c.status === NEVER && !declared.has(c.id) && !(c.base !== null && declared.has(c.base)))
      .map((c) => c.id),
    `這幾張退休卡 ${LEGACY_STATUS_REL} 算成「${neverLabel}」，⛔ 而它（或它的本體）沒有寫進宣告表`,
    `決定它是什麼：上架 → starter.go；下架 → roster.json；待重上架 → COMMUNITY_ACQUIRED_LEGACY（改完跑 pnpm legacyindex:build）；` +
      `真的是從未開放 → ${DECLARATION_REL} 的 legacyNeverOpened.ids（列本體，變身態跟著本體）。`,
  );
  push("卡 ↔ 卡", w.legacy.cards.map((c) => c.id).filter((id) => w.liveCardIds.includes(id)), "同一個 id 在兩棵樹都有卡", "留一張 —— 上架在 content/champions，其餘在 content/_legacy/champions。");

  // ③ 宣告 → 卡
  const legacyById = new Map(w.legacy.cards.map((c) => [c.id, c] as const));
  push(
    "宣告 → 退休卡",
    d.legacyNeverOpened.ids.filter((id) => !legacyById.has(id)),
    `宣告在「${neverLabel}」，⛔ 而 ${LEGACY_STATUS_REL} 沒有這張退休卡`,
    "卡被搬走或刪掉了 ⇒ 從 legacyNeverOpened.ids 拿掉（上架走 starter.go；⛔ 不要刪卡，owner 2026-08-13「不要刪除舊資料」）。",
  );
  push(
    `宣告的「${neverLabel}」↔ 推導`,
    d.legacyNeverOpened.ids.filter((id) => {
      const c = legacyById.get(id);
      return c !== undefined && (c.status !== NEVER || c.base !== null);
    }),
    `明寫了，⛔ 而 ${LEGACY_STATUS_REL} 推導得出它的狀態（已下架／待重上架），或它是變身態（跟著本體）`,
    "從 legacyNeverOpened.ids 刪掉 —— 推導得出來的值⛔ 不要有第二個住處。",
  );
  const exempt = new Set(d.missingCardExemptions.map((e) => e.id));
  const cardless = w.legacy.reopenWithoutLegacyCard.filter((r) => !r.liveCard).map((r) => r.id);
  push(
    "宣告 → 卡（COMMUNITY_ACQUIRED_LEGACY）",
    cardless.filter((id) => !exempt.has(id)),
    "待重上架名單有、⛔ 兩棵樹都沒有卡",
    `把卡放回該在的樹，或把 id 從名單拿掉；真的還不該有卡 ⇒ ${DECLARATION_REL} 的 missingCardExemptions 加一列並寫可反駁的理由。`,
  );
  push(
    "豁免 ↔ 現況",
    [...exempt].filter((id) => !cardless.includes(id)),
    "這幾列豁免已經不成立（卡出現了，或它已不在待重上架名單上）",
    `從 ${DECLARATION_REL} 的 missingCardExemptions 刪掉 —— 過期的豁免會替下一個缺口背書。`,
  );

  // ④ 名單之間
  push(
    "COMMUNITY_ACQUIRED_LEGACY ↔ 權威文件",
    w.relist.filter((id) => !batchIds.has(id)),
    "待重上架名單有、126 名文件任何一批都沒有",
    "重上架必須屬於 owner 列的某一批 —— 查 #1205 的範圍。",
  );
  return out;
}

/** `pnpm roster:check` 通過時印的幾行（觀測，⛔ 不是閘；數字⛔ 不進斷言）。 */
export function rosterDeclarationSummary(w: RosterWorld): string {
  const d = w.declaration;
  const batchIds = new Set(d.batches.flatMap((b) => w.batchDoc.get(b.section) ?? []));
  const original = w.starter.filter((id) => !batchIds.has(id)).length;
  const batches = d.batches.map((b) => {
    const ids = w.batchDoc.get(b.section) ?? [];
    return `${b.section} ${ids.filter((id) => w.starter.includes(id)).length}/${ids.length}`;
  });
  const label = new Map(w.legacy.rules.map((r) => [r.status, r.label] as const));
  const alts = w.legacy.cards.filter((c) => c.base !== null);
  const altBy = w.legacy.rules.map((r) => `${r.label} ${alts.filter((c) => c.status === r.status).length}`);
  const never = w.legacy.rules.find((r) => r.status === NEVER);
  return (
    `  逐群（在 starterChampions／該批人數）：${d.original.name} ${original} · ${batches.join(" · ")}\n` +
    `  退休卡（${LEGACY_STATUS_REL}，變身態跟著本體算）：${w.legacy.rules.map((r) => `${r.label} ${r.count}`).join(" · ")}\n` +
    `  跨軸（⛔ 不是第四群）：其中變身態 ${alts.length}（${altBy.join(" · ")}）；` +
    `${label.get(NEVER) ?? NEVER} ${never?.count ?? 0} ＝ 宣告表明寫的本體 ${d.legacyNeverOpened.ids.length} ＋ 跟著本體的變身態 ` +
    `${alts.filter((c) => c.status === NEVER).length}`
  );
}

/**
 * codexIssues — the BROKEN-DATA REPORT, computed live from the same fetched
 * docs the codex browses.
 *
 * PLACEMENT IS A REQUIREMENT, NOT A STYLE CHOICE. The user ruled on it
 * (2026-07-22): 「你提的 破損資料要顯眼地渲染出來，但在應該是獨立表格放到最底下
 * 僅供額外參考」 — render it prominently, but as a SEPARATE table at the very
 * bottom, reference material only. So the three browse sections stay clean (no
 * per-row warning badges) and every gap is collected here, grouped by issue
 * type with a count per group so it reads as a to-do list.
 *
 * Pure: `collectIssues` is a total function of (loaded docs, icon hashes,
 * recipe graph). No fetch, no React — the counts in the tests are the counts on
 * the page.
 */
import type { CodexData, CodexKind, CodexRef } from "@ggd/shared/codex/codexTypes";
import { duplicateIconGroups, type IconHashes } from "@ggd/shared/codex/codexIcons";
import type { CodexPlan } from "@ggd/shared/codex/codexPlan";
import type { RecipeGraph } from "./codexRecipes";

export type CodexIssueType =
  | "no-icon"
  | "icon-dropped"
  | "icon-blocked"
  | "icon-load-failed"
  | "duplicate-icon"
  | "no-description"
  | "name-equals-id"
  | "zero-modifiers"
  | "no-ex-ability"
  | "unresolved-recipe-component";

export interface CodexIssue {
  readonly type: CodexIssueType;
  readonly ref: CodexRef;
  /** display name at the time of the scan (may equal the id — that is a defect) */
  readonly name: string;
  /** what exactly is wrong / what it collides with */
  readonly detail: string;
}

export interface CodexIssueGroup {
  readonly type: CodexIssueType;
  readonly label: string;
  /** honest context: what this means and why it is not simply "art missing" */
  readonly note: string;
  readonly issues: readonly CodexIssue[];
}

const LABEL: Record<CodexIssueType, string> = {
  "name-equals-id": "名稱 = ID（字串表未解析）",
  "no-ex-ability": "沒有 EX 技能",
  "duplicate-icon": "圖示位元組重複（抽取時指派錯誤）",
  "icon-load-failed": "圖示路徑存在但載不到",
  "no-description": "沒有說明文字",
  "zero-modifiers": "沒有任何屬性加成",
  "unresolved-recipe-component": "合成材料名稱找不到對應道具",
  "icon-blocked": "圖示暫停產生（等待裁定）",
  "icon-dropped": "刻意不產生圖示（已裁定）",
  "no-icon": "沒有圖示",
};

/**
 * The icon note. Counting "missing icons" without this reads as "the art is
 * simply absent" — wrong, and it would send the reader hunting for files that
 * were never extractable.
 *
 * EVERY NUMBER HERE IS COMPUTED, NONE IS TYPED. The previous version hard-coded
 * "695 stock / 2 map-custom / 168 orphans" from the asset register, and all
 * three were wrong: 111 of that 695 were the map author's OWN art sitting at
 * stock-looking `ReplaceableTextures\CommandButtons\` paths (membership in the
 * archive is the test, never the path prefix), so the real split is 584 stock
 * and 113 map-custom. A number nobody recomputes rots. The coverage half is
 * counted off the loaded docs; the provenance half comes from the icon plan,
 * which the planner regenerates from the tree.
 */
function noIconNote(data: CodexData, plan?: CodexPlan | null): string {
  const champ = data.champions.filter((c) => c.icon).length;
  const abil = data.abilities.filter((a) => a.icon).length;
  const item = data.items.filter((i) => i.icon).length;
  const coverage =
    `這份內容目前宣告了 ${champ + abil + item} 個圖示（英雄 ${champ}/${data.champions.length}、` +
    `技能 ${abil}/${data.abilities.length}、道具 ${item}/${data.items.length}）。`;
  if (!plan) {
    return (
      coverage +
      "缺圖示不等於「美術遺失」：絕大多數原本就指向暴雪內建圖示（受版權限制、從未抽取）或" +
      "根本沒有美術路徑。跑 `python3 tools/icon-gen/src/plan.py --write` 之後，這裡會列出" +
      "確切的分類與批次大小。"
    );
  }
  const p = plan.provenance;
  const parts: string[] = [];
  if (p.stock) parts.push(`${p.stock} 筆指向暴雪內建圖示（受版權限制，從未抽取）`);
  if (p["no-art-field"]) parts.push(`${p["no-art-field"]} 筆的 w3x 物件根本沒有覆寫圖示欄位`);
  if (p["no-wc3-source"]) parts.push(`${p["no-wc3-source"]} 筆沒有對應的 w3x 來源`);
  if (p["not-imported"]) parts.push(`${p["not-imported"]} 筆是手寫內容，不是匯入的`);
  return (
    coverage +
    `地圖作者自己的美術已經全部抽出來了（${plan.counts.have} 張，一張不剩）——` +
    `剩下的缺口${parts.length ? "是：" + parts.join("、") : "來自匯入來源"}。` +
    `其中 ${plan.counts.drop} 筆刻意不產生、${plan.counts.blocked} 筆暫停產生（見下方獨立表格），` +
    `真正要產生的是 ${plan.counts.generate} 張：` +
    `${plan.counts.tier1} 張是目前遊戲裡真的會出現的（優先），另外 ${plan.counts.tier2} 張目前沒有任何面向會提供。`
  );
}

const NOTE: Record<CodexIssueType, string> = {
  "name-equals-id":
    "w3x 字串表沒有解出這些道具的顯示名稱，於是名稱直接落回 ID。其他道具的合成配方會用真名參照它們，所以這也是下面「合成材料找不到」的成因之一。",
  "no-ex-ability": "並非每個英雄都有 EX 技能（忠於原地圖）；此表僅供對照，不代表一定是缺漏。",
  "duplicate-icon":
    "多個項目的圖示 PNG 位元組完全相同 —— 抽取階段指派錯誤（例：曹操孟德掛著皮卡丘的頭像）。共用頭像只代表美術指派錯了，" +
    "與「是不是同一個英雄」無關（那由英雄編號決定，見 championIdentity）。",
  "icon-load-failed": "文件宣告了 icon 路徑，但 /content 取不到該檔案（404 或網路錯誤）——與「沒有宣告圖示」是不同的缺陷。",
  "no-description": "文件沒有 description 欄位；w3x 來源沒有可用的說明文字。",
  "zero-modifiers":
    "道具沒有任何 modifiers。多數是配方書 / 任務獎勵 / 純觸發道具，效果寫在 JASS 而不是屬性表；任務 #70 正在重建這層分類。",
  "unresolved-recipe-component":
    "說明文字的「合成配方」列了一個名稱，但沒有任何道具叫這個名字。多半是名稱未解析（見上）或原文錯字。",
  "icon-blocked":
    "這些條目的圖示是被「擋下」而不是「漏掉」的——有一個人必須先做出裁定，工具才會動它們。理由寫在每一列上。",
  "icon-dropped":
    "這些條目是刻意不畫圖示的，理由寫在每一列上。它們沒有被刪除，內容還在、圖鑑也照列；只是產圖批次永遠不會碰它們。" +
    "分類由 tools/icon-gen/src/plan.py 每次從實際檔案重新推導，而且任何出現在實際遊戲面向上的 ID 都會先被否決、不可能被排除。",
  // filled in per-load by noIconNote() — the counts must come from the docs
  "no-icon": "",
};

/** Stable display order: the smallest, most actionable groups first. */
const ORDER: readonly CodexIssueType[] = [
  "name-equals-id",
  "icon-load-failed",
  "no-ex-ability",
  "duplicate-icon",
  "unresolved-recipe-component",
  "icon-blocked",
  "no-description",
  "zero-modifiers",
  "icon-dropped",
  "no-icon",
];

export interface CollectIssuesInput {
  readonly data: CodexData;
  /** null / empty until the background icon scan finishes */
  readonly iconHashes?: IconHashes;
  readonly recipes?: RecipeGraph;
  /** the icon plan, when one has been published. Optional by design. */
  readonly plan?: CodexPlan | null;
}

/** path → the entry that declares it, so a duplicate group can name entries. */
function iconOwners(data: CodexData): Map<string, { ref: CodexRef; name: string }[]> {
  const out = new Map<string, { ref: CodexRef; name: string }[]>();
  const add = (icon: string | null, kind: CodexKind, id: string, name: string): void => {
    if (!icon) return;
    const list = out.get(icon) ?? [];
    list.push({ ref: { kind, id }, name });
    out.set(icon, list);
  };
  for (const c of data.champions) add(c.icon, "champion", c.id, c.name);
  for (const a of data.abilities) add(a.icon, "ability", a.id, a.name);
  for (const i of data.items) add(i.icon, "item", i.id, i.name);
  return out;
}

const KIND_LABEL: Record<CodexKind, string> = { item: "道具", champion: "英雄", ability: "技能" };

/**
 * Every gap in the loaded content, grouped by type. Empty groups are dropped,
 * so the table only ever shows real work.
 */
export function collectIssues(input: CollectIssuesInput): CodexIssueGroup[] {
  const { data, plan } = input;
  const found = new Map<CodexIssueType, CodexIssue[]>();
  const push = (type: CodexIssueType, ref: CodexRef, name: string, detail: string): void => {
    const list = found.get(type) ?? [];
    list.push({ type, ref, name, detail });
    found.set(type, list);
  };

  /**
   * An icon-less entry lands in ONE of three groups. Without the split, a
   * deliberate decision (a recipe book under the NO-CRAFTING ruling) and a real
   * gap (a live shop item with no picture) sit in the same 768-row pile and the
   * reader cannot act on either. With no plan published everything collapses
   * back to `no-icon`, which is the old, still-honest behaviour.
   */
  const pushNoIcon = (ref: CodexRef, name: string, fallback: string): void => {
    const dropKey = plan?.dropReason.get(ref.id);
    if (dropKey) {
      const rule = plan?.dropped[dropKey];
      push("icon-dropped", ref, name, rule?.note ? `${rule.label}：${rule.note}` : dropKey);
      return;
    }
    const blockKey = plan?.blockReason.get(ref.id);
    if (blockKey) {
      const rule = plan?.blocked[blockKey];
      push("icon-blocked", ref, name, rule?.note ? `${rule.label}：${rule.note}` : blockKey);
      return;
    }
    push("no-icon", ref, name, fallback);
  };

  // ---- champions -----------------------------------------------------
  for (const c of data.champions) {
    const ref: CodexRef = { kind: "champion", id: c.id };
    if (!c.icon) pushNoIcon(ref, c.name, `英雄 ${c.id} 沒有 icon 欄位`);
    if (!c.description) push("no-description", ref, c.name, `英雄 ${c.id} 沒有 description`);
    if (c.name === c.id) push("name-equals-id", ref, c.name, `名稱未解析，落回 ID ${c.id}`);
    if (!c.exAbilityId) push("no-ex-ability", ref, c.name, `英雄 ${c.id} 沒有 exAbility 參照`);
  }

  // ---- items ---------------------------------------------------------
  for (const it of data.items) {
    const ref: CodexRef = { kind: "item", id: it.id };
    if (!it.icon) pushNoIcon(ref, it.name, `道具 ${it.id} 沒有 icon 欄位`);
    if (!it.description) push("no-description", ref, it.name, `道具 ${it.id} 沒有 description`);
    if (it.name === it.id) push("name-equals-id", ref, it.name, `名稱未解析，落回 ID ${it.id}`);
    if (it.modifiers.length === 0) {
      push("zero-modifiers", ref, it.name, it.hasPassive ? "只有 passive，沒有 modifiers" : "沒有 modifiers");
    }
  }

  // ---- abilities -----------------------------------------------------
  for (const a of data.abilities) {
    const ref: CodexRef = { kind: "ability", id: a.id };
    if (!a.icon) pushNoIcon(ref, a.name, `技能 ${a.id} 沒有 icon 欄位`);
    if (!a.description) push("no-description", ref, a.name, `技能 ${a.id} 沒有 description`);
    if (a.name === a.id) push("name-equals-id", ref, a.name, `名稱未解析，落回 ID ${a.id}`);
  }

  // ---- icon bytes ----------------------------------------------------
  const icons = input.iconHashes;
  if (icons) {
    const owners = iconOwners(data);
    for (const path of icons.failed) {
      for (const owner of owners.get(path) ?? []) {
        push("icon-load-failed", owner.ref, owner.name, `${path} 取不到`);
      }
    }
    for (const [, paths] of duplicateIconGroups(icons.hashes)) {
      const members = paths.flatMap((p) => (owners.get(p) ?? []).map((o) => ({ ...o, path: p })));
      for (const me of members) {
        const others = members
          .filter((o) => o.ref.id !== me.ref.id || o.ref.kind !== me.ref.kind)
          .map((o) => `${KIND_LABEL[o.ref.kind]} ${o.name}`);
        push("duplicate-icon", me.ref, me.name, `與 ${others.join("、")} 位元組相同（${me.path}）`);
      }
    }
  }

  // ---- recipe references ---------------------------------------------
  if (input.recipes) {
    for (const [itemId, recipe] of input.recipes.recipeOf) {
      const missing = recipe.components.filter((c) => c.id === null).map((c) => c.name);
      if (missing.length === 0) continue;
      const item = data.items.find((i) => i.id === itemId);
      push(
        "unresolved-recipe-component",
        { kind: "item", id: itemId },
        item?.name ?? itemId,
        `找不到材料：${missing.join("、")}`,
      );
    }
  }

  return ORDER.filter((type) => (found.get(type) ?? []).length > 0).map((type) => ({
    type,
    label: LABEL[type],
    note: type === "no-icon" ? noIconNote(data, plan) : NOTE[type],
    issues: found.get(type) ?? [],
  }));
}

/** Total issue count across every group (the table's headline number). */
export function issueTotal(groups: readonly CodexIssueGroup[]): number {
  return groups.reduce((n, g) => n + g.issues.length, 0);
}

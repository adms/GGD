/**
 * 觸發條件編輯器 —— 下拉選單，不是 script 編輯。
 *
 * owner 2026-07-30 對這一半講得很死:「on-attack by condition 這個一定要實作，
 * **編輯器也要配合**」, and earlier, on the shape it may take:「編輯器接受 JASS
 * 的形式，但**不是 script 編輯而是 UI 選項**」. So there is no text box holding
 * JSON here: a clause is FOUR dropdowns and one number field (主體 → 屬性 →
 * 絕對值/% → 比較 → 數值), 「＋加一個條件」 stacks them, and one more dropdown
 * picks 全部成立 / 任一成立.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A HAND-WRITTEN WIDGET AND NOT A `walkZod` NODE
 *
 * Every other param slot in the Forge renders through `walkZod(paramsSchemaFor(t))`
 * — 「ZERO new form code」 is ForgeStudio's own header claim, and it is a good
 * one. A condition is the exception, and for a structural reason rather than a
 * taste one: `zEffectCondition` is a RECURSIVE UNION, and `walk.ts` has no
 * ZodUnion branch at all, so it degrades to `kind:"unknown"` → a raw JSON
 * textarea. That is exactly the script editor owner ruled out. ForgeStudio
 * therefore filters `type: "condition"` slots out of the generated form and
 * routes them here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SENTENCE IS NOT TYPED, IT IS DERIVED
 *
 * The live 人話 line under the editor calls `describeCondition` — THE SAME
 * function the player's tooltip and the item card call, over THE SAME object the
 * sim gates on. Re-implementing the phrasing here would have been three lines of
 * work and the next lie in the codebase (CLAUDE.md 第三守則): the editor would
 * keep saying 「目標生命 < 35%」 long after somebody changed what the gate reads.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ TWO LEVELS: A LIST OF GROUPS, EACH A LIST OF CLAUSES (2026-07-31)
 *
 * This widget used to draw ONE level — a flat list of clauses joined by 且/或 —
 * and a reviewer measured what that cost: `flatten()` returned `null` for
 * `tpl-on-attack`'s own slot default, so 獸矛, THE card the whole feature was
 * built for, opened READ-ONLY. Its gate is
 *
 *     any:[ all:[非英雄, 目標HP% < 35%], all:[是英雄, 1% 機率] ]
 *
 * — an OR of two AND-groups. That is not an exotic shape; it is the shape every
 * gate with an exception has, and the same sum-of-products every filter builder
 * on the web draws. So the form grew the second level rather than the card being
 * re-cut to fit the form (which would have deleted the 1%-vs-heroes roll — a
 * BALANCE change, and not one an editor bug gets to make on owner's behalf).
 *
 * WHY THIS DOES NOT BECOME A MAZE. The nesting is FIXED at two, and the first
 * level is free:
 *
 *   • ONE group  → renders exactly as before. No group chrome, no outer join,
 *                  no extra words on screen. The 99% card is untouched.
 *   • TWO+ groups → each gets a bordered box, and ONE 「群組之間」 select appears
 *                  above them. Depth never grows past this, so the widget has
 *                  exactly two nesting states to understand, not N.
 *
 * `unflatten` collapses the redundancy on the way out — a one-clause group emits
 * the bare clause, a one-group tree emits the bare group — so round-tripping a
 * doc that was authored one level deep does not silently deepen it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE UI STILL CANNOT EXPRESS, AND WHAT IT DOES ABOUT IT
 *
 * `CONDITION_MAX_DEPTH` is 5; this editor draws 2. A doc hand-authored deeper
 * still LOADS and still RUNS, and `flatten()` returns `null` for it — the widget
 * then shows a READ-ONLY panel that says so in words, prints the derived
 * sentence so the author can still read the gate, and offers 「清除並重建」 as
 * the explicit way out. That path is deliberate and guarded
 * (`conditionEditor.test.ts` drives a 3-level tree into it); silently flattening
 * somebody's gate would be worse than admitting the form cannot draw it.
 *
 * ⚠️ 第三守則 note for whoever edits this block next: the version before
 * 2026-07-31 claimed the flagship was 「edited as two groups via the 切換到 或/且
 * toggle」. There was no such control and the card did not open. Do not restate
 * a capability here without driving it in a test first.
 */
import { useMemo } from "react";
import {
  COMPARE_OPS,
  CONDITION_ABSOLUTE_MAX,
  CONDITION_SCALE_MAX,
  CONDITION_SCALE_MIN,
  CONDITION_ENTITY_KINDS,
  CONDITION_MAX_CHILDREN,
  CONDITION_STATS,
  CONDITION_SUBJECTS,
  EQUIPMENT_TAG_MAX_LEN,
  STATUS_TAG_MAX_LEN,
  describeCondition,
  isEquipmentItemLeaf,
  isRecentCastAbilityLeaf,
  isStatusIdLeaf,
  retargetStatLeaf,
  setStatLeafMode,
  statSupportsPercent,
  type CompareOp,
  type ConditionEntityKind,
  type ConditionLeaf,
  type ConditionOperand,
  type ConditionStat,
  type ConditionSubject,
  type EffectCondition,
} from "@ggd/shared/sim/content/condition";
// 層數的上界跟 schema、`applyStatus.stacks` 與 sim 的夾取共用同一份表 ——
// 這一格抄一個 999 就是那份表的第四個住處（CLAUDE.md 第零守則⑦）。
import { MARK_MAX_COUNT } from "@ggd/shared/sim/markLimits";
import type { AbilityId, ItemId, StatusId } from "@ggd/shared/ids";

// ---------------------------------------------------------------------------
// LABELS. Chinese in the dropdowns, because every other Forge control is.
// ---------------------------------------------------------------------------

const SUBJECT_LABEL: Record<ConditionSubject, string> = { self: "自己", target: "目標" };

const STAT_LABEL: Record<ConditionStat, string> = {
  hp: "生命 HP",
  mp: "魔力 MP",
  str: "力量 STR",
  agi: "敏捷 AGI",
  int: "智力 INT",
  ad: "攻擊力 AD",
  ap: "法術強度 AP",
  armor: "護甲",
  magicResist: "魔法抗性",
  moveSpeed: "移動速度",
  attackSpeed: "攻擊速度",
  level: "等級",
};

const KIND_LABEL: Record<ConditionEntityKind, string> = {
  champion: "英雄",
  mob: "小兵",
  summon: "召喚物",
  guardian: "守護者",
  // ⭐ [EX∅ 根源]：`mob` 的兩個子集（一隻殭屍王同時滿足 `mob` 與 `mobBoss`）。
  mobSpecial: "特殊殭屍",
  mobBoss: "殭屍王",
};

const OP_LABEL: Record<CompareOp, string> = {
  ">=": "≥ 大於等於",
  "<=": "≤ 小於等於",
  ">": "> 大於",
  "<": "< 小於",
  "==": "= 等於",
  "!=": "≠ 不等於",
};

/** The clause shapes the dropdowns can build. */
// ⭐⭐ GH#937 —— `recentCast`（連續技窗口）是 2026-09-02 新增的條件葉。
// ⚠️ ⭐ 這一行漏改的代價**不是**少一個選項：`tsc` 會紅在下面那個
// `const kind: ClauseKind = clause.leaf.kind` —— ⭐ 而那正是「積木做出來了，
// 而編輯器看不到它」在型別層被擋下來的樣子（⛔ 不是執行期才發現）。
type ClauseKind = "stat" | "kind" | "chance" | "status" | "equipment" | "recentCast";

/**
 * ⭐ 連續技窗口的欄位（GH#937）。
 *
 * ⚠️ 兩種形狀共用一個 `kind`：`{abilityId}` 與 `{slot}`。
 * UI 必須同時畫出**指定技能 id**與**指定槽位**兩種合法形狀；要求作者改 raw JSON
 * 才能用其中一半，違反 Forge 的 no-code 邊界。
 */
function RecentCastFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "recentCast" }>;
  onChange(next: ConditionLeaf): void;
}) {
  const byAbility = isRecentCastAbilityLeaf(leaf);
  return (
    <>
      <label>
        比對方式
        <select
          id={`${path}-match`}
          data-field={`${path}.recentCast.match`}
          value={byAbility ? "ability" : "slot"}
          onChange={(event) => onChange(event.target.value === "ability"
            ? { kind: "recentCast", subject: leaf.subject, abilityId: "godie-e001.q" as AbilityId, withinSec: leaf.withinSec }
            : { kind: "recentCast", subject: leaf.subject, slot: "Q", withinSec: leaf.withinSec })}
        >
          <option value="slot">技能槽位</option>
          <option value="ability">指定技能 ID</option>
        </select>
      </label>
      {byAbility ? (
        <label>
          技能 ID
          <input
            id={`${path}-ability`}
            data-field={`${path}.abilityId`}
            type="text"
            value={leaf.abilityId}
            onChange={(event) => onChange({ ...leaf, abilityId: event.target.value as AbilityId })}
          />
        </label>
      ) : (
        <label>
          哪一格
          <select
            id={`${path}-slot`}
            data-field={`${path}.slot`}
            value={leaf.slot}
            onChange={(event) => onChange({ ...leaf, slot: event.target.value } as ConditionLeaf)}
          >
            {(["Q", "W", "E", "R", "EX", "PASSIVE"] as const).map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        幾秒內接上算數
        <input
          id={`${path}-within`}
          data-field={`${path}.withinSec`}
          type="number"
          step="0.1"
          value={leaf.withinSec}
          onChange={(e) => onChange({ ...leaf, withinSec: Number(e.target.value) })}
        />
      </label>
    </>
  );
}

const CLAUSE_LABEL: Record<ClauseKind, string> = {
  stat: "數值比較（屬性 / HP / MP）",
  kind: "目標種類（英雄 / 小兵 …）",
  chance: "機率",
  status: "狀態標記（某一份 / 某一類：[暈眩] / [燃燒] / [致盲] …）",
  equipment: "裝備了道具（某一件 / 某一類）",
  // ⭐ GH#937 —— 連續技窗口。⚠️ 標籤刻意講「**槽位**」而不是「技能」：
  //   `ability@1` 今天**沒有** `tags` 欄位（421/421 零命中）⇒ ⛔ 做一個永遠比不中的
  //   標籤分支會是一句說了不會發生的話（第一·五守則）。
  recentCast: "最近施放過（連續技窗口：前一招 N 秒內接上）",
};

/**
 * Machine-readable authoring surface for the editor-contract gate.
 *
 * Keep this next to the controls rather than copying the list into a test:
 * removing a clause kind/field from the widget must also remove it here and
 * make the two-way coverage test red against ggd-editor-coverage.json.
 */
export const CONDITION_EDITOR_LEAF_KINDS = Object.freeze(
  Object.keys(CLAUSE_LABEL) as ClauseKind[],
);
export const CONDITION_EDITOR_LEAF_FIELDS = Object.freeze([
  "abilityId",
  "is",
  "itemId",
  "kind",
  "minStacks",
  "mode",
  "op",
  "other",
  "p",
  "stat",
  "statusId",
  "slot",
  "subject",
  "tag",
  "value",
  "withinSec",
] as const);

/** 「某一件」還是「某一類」—— 這一列右邊要畫哪一個輸入框。 */
type EquipmentMatch = "item" | "tag";

const EQUIPMENT_MATCH_LABEL: Record<EquipmentMatch, string> = {
  item: "這一件",
  tag: "這一類",
};

/**
 * 狀態那一列的同一個問題：「這一份」還是「這一類」。
 *
 * ⭐ 分開一個型別而不是共用 {@link EquipmentMatch}，是因為畫面上的字不一樣
 * （道具論「件」，狀態論「份」），而共用型別會逼兩邊共用標籤或多長一層對照。
 * 兩者的**結構**共用的地方在 schema 那一側（兩個都是 union，寫法逐字相同）。
 */
type StatusMatch = "id" | "tag";

const STATUS_MATCH_LABEL: Record<StatusMatch, string> = {
  id: "這一份",
  tag: "這一類",
};

type Join = "all" | "any";

// ---------------------------------------------------------------------------
// THE FLAT VIEW — what this editor can round-trip
// ---------------------------------------------------------------------------

/** One editable row: a leaf plus 「非」. */
export interface Clause {
  negated: boolean;
  leaf: ConditionLeaf;
}

/** One box on screen: clauses joined by 且/或. */
export interface ClauseGroup {
  join: Join;
  clauses: Clause[];
}

/** The whole widget's state: groups joined by 且/或. */
export interface FlatCondition {
  join: Join;
  groups: ClauseGroup[];
}

const DEFAULT_LEAF: Record<ClauseKind, ConditionLeaf> = {
  // 生命 < 35% is the single most common real gate, so it is the pre-fill.
  stat: { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
  kind: { kind: "kind", subject: "target", is: "champion" },
  chance: { kind: "chance", p: 0.15 },
  // 預填一個**真的存在**的 status（`content/status-effects/root.json`）而不是空字串:
  // 空字串過不了 `zId`,於是「剛切到這個種類」的那一刻卡片就是不可儲存的,而表單
  // 上看不出為什麼。預填一個能存的值,作者改成他要的那一個即可。
  status: { kind: "status", subject: "target", statusId: "root" as StatusId },
  // ⭐ 預填**槽位**那一種（⛔ 不是技能 id）：槽位一定填得出合法值，
  //   而技能 id 的空字串過不了 `zRef` ⇒ 剛切過來的那一刻卡片就不可儲存。
  //   ⚠️ 與上面 `status` 預填 `root` 是**同一個理由**。
  recentCast: { kind: "recentCast", subject: "self", slot: "Q", withinSec: 1 },
  // 77-002 御雷劍問的是**自己**帶著什麼，跟其他四種葉子的「目標」相反，所以這
  // 一格的預填主體是 self。同上一則的理由：預填一個**存得起來**的 id（skeleton
  // 的 `ember-rod` 是真的存在的道具），空字串過不了 `zId`，作者會看到一張莫名
  // 其妙存不了的卡。
  equipment: { kind: "equipment", subject: "self", itemId: "ember-rod" as ItemId },
};

/**
 * The join a NEW second group starts on. 「加一組」 is what an author reaches for
 * when the gate needs an ALTERNATIVE case (the 獸矛 shape: 非英雄處決 或 對英雄
 * 1%), so 任一 is the useful starting value — and it is only a starting value,
 * because the 群組之間 select appears in the same render and can flip it. This is
 * a default, not a decision baked out of reach (CLAUDE.md 第一守則).
 */
const NEW_GROUP_OUTER_JOIN: Join = "any";

const isLeafNode = (c: EffectCondition): c is ConditionLeaf =>
  (c as { all?: unknown }).all === undefined &&
  (c as { any?: unknown }).any === undefined &&
  (c as { not?: unknown }).not === undefined;

/** One clause = a leaf, or `not` of a leaf. Anything else is not flattenable. */
function toClause(c: EffectCondition): Clause | null {
  if (isLeafNode(c)) return { negated: false, leaf: c };
  const inner = (c as { not?: EffectCondition }).not;
  if (inner !== undefined && isLeafNode(inner)) return { negated: true, leaf: inner };
  return null;
}

/** An `all`/`any` node as `{ join, kids }`, or null for a leaf / `not` / junk. */
function asGroup(c: EffectCondition): { join: Join; kids: EffectCondition[] } | null {
  const g = c as { all?: EffectCondition[]; any?: EffectCondition[] };
  if (g.all !== undefined) return { join: "all", kids: g.all };
  if (g.any !== undefined) return { join: "any", kids: g.any };
  return null;
}

/** Every kid as a clause, or null the moment one of them is a group. */
function toClauses(kids: readonly EffectCondition[]): Clause[] | null {
  const out: Clause[] = [];
  for (const k of kids) {
    const c = toClause(k);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/**
 * The stored tree → the flat view, or `null` when it nests deeper than the two
 * levels this widget draws. `null` is what puts the editor into its read-only
 * mode; it never guesses and never silently drops a level.
 */
export function flatten(cond: EffectCondition | undefined): FlatCondition | null {
  if (cond === undefined) return { join: "all", groups: [] };

  // A bare clause is ONE group of one — the simplest thing the form can draw.
  const single = toClause(cond);
  if (single) return { join: "all", groups: [{ join: "all", clauses: [single] }] };

  const outer = asGroup(cond);
  if (!outer) return null; // `not` of a GROUP — the one shape the form skips

  // ONE LEVEL: `all:[A,B]`. Kept as a single group so it renders exactly like
  // the pre-2026-07-31 flat form — the outer join is unused and unshown.
  const flatClauses = toClauses(outer.kids);
  if (flatClauses) return { join: "all", groups: [{ join: outer.join, clauses: flatClauses }] };

  // TWO LEVELS: `any:[ all:[…], all:[…] ]` — the 獸矛 shape. A kid that is a bare
  // clause becomes a one-clause group so mixed trees round-trip too.
  const groups: ClauseGroup[] = [];
  for (const kid of outer.kids) {
    const bare = toClause(kid);
    if (bare) {
      groups.push({ join: "all", clauses: [bare] });
      continue;
    }
    const sub = asGroup(kid);
    if (!sub) return null;
    const clauses = toClauses(sub.kids);
    if (!clauses) return null; // three levels — read-only, honestly
    groups.push({ join: sub.join, clauses });
  }
  return { join: outer.join, groups };
}

/**
 * The flat view → the stored tree. `undefined` when there is nothing to gate on.
 *
 * COLLAPSES ON THE WAY OUT, which is what makes `unflatten(flatten(x)) === x`
 * hold: a one-clause group emits the bare clause rather than `{all:[clause]}`,
 * and a one-group tree emits that group rather than wrapping it again. Without
 * this, opening a one-level doc and saving it unchanged would deepen it by two.
 */
export function unflatten(flat: FlatCondition): EffectCondition | undefined {
  const nodes: EffectCondition[] = [];
  for (const g of flat.groups) {
    const kids = g.clauses.map((c): EffectCondition => (c.negated ? { not: c.leaf } : c.leaf));
    if (kids.length === 0) continue; // an emptied group contributes nothing
    nodes.push(kids.length === 1 ? kids[0]! : g.join === "all" ? { all: kids } : { any: kids });
  }
  if (nodes.length === 0) return undefined;
  if (nodes.length === 1) return nodes[0]!;
  return flat.join === "all" ? { all: nodes } : { any: nodes };
}

// ---------------------------------------------------------------------------
// THE WIDGET
// ---------------------------------------------------------------------------

export interface ConditionEditorProps {
  label: string;
  value: EffectCondition | undefined;
  onChange(next: EffectCondition | undefined): void;
  /**
   * `data-field` namespace for this instance. Defaults to `"cond"`, which is
   * what every single-condition mount reads.
   *
   * WHY IT EXISTS (模板複數套用, 2026-07-31): a stacked ability can carry the
   * SAME slot on two different cards, so two ConditionEditors are on screen at
   * once. With one hard-coded namespace `h.field("cond.sentence")` would return
   * whichever happened to render first, and a test「editing card 2's gate」could
   * silently be driving card 1 — 失敗形態 ④, an assertion pointed away from the
   * defect. ForgeStudio passes `cond<cardIndex>`.
   */
  fieldPrefix?: string;
}

export function ConditionEditor({
  label,
  value,
  onChange,
  fieldPrefix = "cond",
}: ConditionEditorProps) {
  const flat = useMemo(() => flatten(value), [value]);
  const sentence = useMemo(() => describeCondition(value), [value]);

  const emit = (next: FlatCondition): void => onChange(unflatten(next));

  if (flat === null) {
    return (
      <fieldset className="cond-editor cond-editor-readonly">
        <legend>{label}</legend>
        {/*
          The wording names BOTH shapes `flatten()` refuses. Saying only 「太深」
          would be the next small lie in this file's history (第三守則): `not` of
          a whole group is also unflattenable and is not a depth problem.
          Keep each sentence on ONE source line — JSX folds a wrapped line into a
          space, which splits the phrase the guard reads.
        */}
        <p className="forge-note" data-field={`${fieldPrefix}.readonly`}>
          這個條件的結構，這張表單畫不出來（表單畫得出的是兩層：群組 → 條件；這一條不是巢狀太深，就是對「一整組」取「非」）。
          所以這裡只顯示不編輯 —— 它仍然會照常載入與執行。
          要改請直接編輯技能文件，或按下面的按鈕從頭建一組新的。
        </p>
        <ConditionSentence sentence={sentence} fieldPrefix={fieldPrefix} />
        <button type="button" data-field={`${fieldPrefix}.rebuild`} onClick={() => onChange(undefined)}>
          清除並重建
        </button>
      </fieldset>
    );
  }

  const setGroup = (gi: number, next: ClauseGroup): void => {
    const groups = flat.groups.slice();
    groups[gi] = next;
    emit({ ...flat, groups });
  };
  const dropGroup = (gi: number): void =>
    emit({ ...flat, groups: flat.groups.filter((_, j) => j !== gi) });

  const multi = flat.groups.length > 1;

  /**
   * 「另一組」 is offered only when pressing it would actually PRODUCE a second
   * group. With a lone one-clause group, `any:[A, B]` is `any:[A, B]` however it
   * was assembled — `flatten` reads it back as ONE group of two clauses, so the
   * button would silently behave as 「＋加一個條件（或）」 and the promised box
   * would never appear. Hiding it there is the honest version; it returns the
   * moment the first group holds two clauses, which is when a second group is
   * structurally distinguishable (`any:[ all:[A,B], C ]`).
   */
  const canAddGroup = multi || (flat.groups[0]?.clauses.length ?? 0) > 1;

  return (
    <fieldset className="cond-editor">
      <legend>{label}</legend>

      {multi ? (
        <label className="cond-join cond-join-outer">
          <span>群組之間</span>
          <select
            aria-label="群組組合方式"
            data-field={`${fieldPrefix}.join`}
            value={flat.join}
            onChange={(e) => emit({ ...flat, join: e.target.value as Join })}
          >
            <option value="all">每一組都要成立（且）</option>
            <option value="any">任何一組成立就好（或）</option>
          </select>
        </label>
      ) : null}

      {flat.groups.map((group, gi) => (
        <GroupBox
          key={gi}
          fieldPrefix={fieldPrefix}
          index={gi}
          group={group}
          boxed={multi}
          onChange={(next) => setGroup(gi, next)}
          onRemove={() => dropGroup(gi)}
        />
      ))}

      <div className="cond-actions">
        {flat.groups.length === 0 ? (
          <button
            type="button"
            data-field={`${fieldPrefix}.addFirst`}
            onClick={() =>
              emit({
                ...flat,
                groups: [{ join: "all", clauses: [{ negated: false, leaf: DEFAULT_LEAF.stat }] }],
              })
            }
          >
            ＋ 加一個條件
          </button>
        ) : null}
        {canAddGroup ? (
          <button
            type="button"
            data-field={`${fieldPrefix}.addGroup`}
            title="給這個條件加一個「例外情況」——例如「非英雄且血量低於 35%」之外，再開一組「是英雄且 1% 機率」。"
            disabled={flat.groups.length >= CONDITION_MAX_CHILDREN}
            onClick={() =>
              emit({
                // A brand-new second group is an ALTERNATIVE case; see
                // NEW_GROUP_OUTER_JOIN. Once there are two, the select above
                // is on screen and owns the answer.
                join: multi ? flat.join : NEW_GROUP_OUTER_JOIN,
                groups: [
                  ...flat.groups,
                  { join: "all", clauses: [{ negated: false, leaf: DEFAULT_LEAF.stat }] },
                ],
              })
            }
          >
            ＋ 另一組條件（例外情況）
          </button>
        ) : null}
        {flat.groups.length > 0 ? (
          <button type="button" data-field={`${fieldPrefix}.clear`} onClick={() => onChange(undefined)}>
            清除（無條件觸發）
          </button>
        ) : null}
      </div>

      <ConditionSentence sentence={sentence} fieldPrefix={fieldPrefix} />
    </fieldset>
  );
}

/**
 * The live 人話 line. It renders `describeCondition`'s output verbatim —
 * NO local phrasing, so the editor cannot drift from the card or the sim.
 */
function ConditionSentence({
  sentence,
  fieldPrefix,
}: {
  sentence: string | null;
  fieldPrefix: string;
}) {
  return (
    <p className="cond-sentence" data-testid="cond-sentence" data-field={`${fieldPrefix}.sentence`}>
      <b>實際效果：</b>
      {sentence === null ? "無條件，每次都觸發。" : sentence}
    </p>
  );
}

/**
 * One group. `boxed` is false for the lone-group case, which is what keeps the
 * common card looking exactly like the one-level form it replaced.
 */
function GroupBox({
  fieldPrefix,
  index,
  group,
  boxed,
  onChange,
  onRemove,
}: {
  fieldPrefix: string;
  index: number;
  group: ClauseGroup;
  boxed: boolean;
  onChange(next: ClauseGroup): void;
  onRemove(): void;
}) {
  const setClause = (ci: number, next: Clause): void => {
    const clauses = group.clauses.slice();
    clauses[ci] = next;
    onChange({ ...group, clauses });
  };

  return (
    <div className={boxed ? "cond-group cond-group-boxed" : "cond-group"} data-cond-group={index}>
      {boxed ? (
        <div className="cond-group-head">
          <span className="cond-group-title">第 {index + 1} 組</span>
          <button
            type="button"
            className="cond-remove"
            data-field={`${fieldPrefix}.g${index}.remove`}
            aria-label={`刪除第 ${index + 1} 組`}
            onClick={onRemove}
          >
            ✕ 刪除這一組
          </button>
        </div>
      ) : null}

      {group.clauses.length > 1 ? (
        <label className="cond-join">
          <span>組合方式</span>
          <select
            aria-label="組合方式"
            data-field={`${fieldPrefix}.g${index}.join`}
            value={group.join}
            onChange={(e) => onChange({ ...group, join: e.target.value as Join })}
          >
            <option value="all">全部成立（且）</option>
            <option value="any">任一成立（或）</option>
          </select>
        </label>
      ) : null}

      {group.clauses.map((clause, ci) => (
        <ClauseRow
          key={ci}
          path={`${fieldPrefix}.g${index}.c${ci}`}
          clause={clause}
          onChange={(next) => setClause(ci, next)}
          onRemove={() => onChange({ ...group, clauses: group.clauses.filter((_, j) => j !== ci) })}
        />
      ))}

      <div className="cond-actions">
        <button
          type="button"
          data-field={`${fieldPrefix}.g${index}.add`}
          disabled={group.clauses.length >= CONDITION_MAX_CHILDREN}
          onClick={() =>
            onChange({
              ...group,
              clauses: [...group.clauses, { negated: false, leaf: DEFAULT_LEAF.stat }],
            })
          }
        >
          ＋ 加一個條件
        </button>
      </div>
    </div>
  );
}

function ClauseRow({
  path,
  clause,
  onChange,
  onRemove,
}: {
  path: string;
  clause: Clause;
  onChange(next: Clause): void;
  onRemove(): void;
}) {
  // ⭐ `recentCast` 有兩種形狀（依技能 id／依槽位）而它們**同一個 kind** ——
  // ⛔ 下拉選單上是一格，⛔ 不是兩格。
  const kind: ClauseKind = clause.leaf.kind === "stat" ? "stat" : clause.leaf.kind;

  return (
    <div className="cond-clause">
      <label className="cond-not">
        <input
          type="checkbox"
          aria-label="非"
          data-field={`${path}.not`}
          checked={clause.negated}
          onChange={(e) => onChange({ ...clause, negated: e.target.checked })}
        />
        <span>非</span>
      </label>

      <select
        aria-label="條件種類"
        data-field={`${path}.kind`}
        value={kind}
        onChange={(e) => onChange({ ...clause, leaf: DEFAULT_LEAF[e.target.value as ClauseKind] })}
      >
        {(Object.keys(CLAUSE_LABEL) as ClauseKind[]).map((k) => (
          <option key={k} value={k}>
            {CLAUSE_LABEL[k]}
          </option>
        ))}
      </select>

      {clause.leaf.kind === "chance" ? (
        <ChanceFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      ) : clause.leaf.kind === "status" ? (
        <StatusFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      ) : clause.leaf.kind === "equipment" ? (
        <EquipmentFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      ) : clause.leaf.kind === "kind" ? (
        <KindFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      ) : clause.leaf.kind === "recentCast" ? (
        // ⭐ GH#937 —— 兩種形狀（依技能 id／依槽位）**同一個 kind**
        //   ⇒ 下拉選單上是一格，⛔ 不是兩格。
        <RecentCastFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      ) : (
        <StatFields
          path={path}
          leaf={clause.leaf}
          onChange={(leaf) => onChange({ ...clause, leaf })}
        />
      )}

      <button
        type="button"
        className="cond-remove"
        data-field={`${path}.remove`}
        onClick={onRemove}
        aria-label="刪除這個條件"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * 狀態標記那一列 —— 主體 + 「這一份／這一類」 + 編號或 tag。
 *
 * ⭐ 中間那個下拉就是 union 的兩個分支（`statusId` / `tag`），而切換它會**整顆換
 * 掉葉子**而不是留著舊那一格：`{statusId, tag}` 兩格並存兩個分支都不收（schema
 * `.strict()`），所以留著等於做出一張存不回去的卡。跟 {@link EquipmentFields} 是
 * 同一件事的同一個理由（也跟 `retargetStatLeaf` 修 `mode`/`value` 同理）。
 *
 * ⭐ 「這一類」是熊貓那一族技能真正要的東西：89-00「敵方[暈眩]狀態下追加[致盲]」
 * 裡的「暈眩」在出貨內容裡是**五份不同的文件**，寫 exact 編號的那張卡會在第六份
 * 暈眩上架時安靜地漏掉它。
 *
 * ⚠️ 兩邊都是**純文字輸入**而不是下拉：這個編輯器沒有 `status-effects` 這份集合
 * 可以讀（`ConditionEditor` 只吃 `EffectCondition`，不吃 store），而一個「只列得
 * 出硬寫在這裡的那幾個」的下拉會在第 20 個狀態上架時安靜地漏掉它。
 * `zRef(soft)` 與 `min/max` 在存檔那一刻擋打錯字 —— 有人擋，只是擋在存檔而不是
 * 輸入。
 */
function StatusFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "status" }>;
  onChange(next: ConditionLeaf): void;
}) {
  const match: StatusMatch = isStatusIdLeaf(leaf) ? "id" : "tag";
  return (
    <>
      <select
        aria-label="主體"
        data-field={`${path}.subject`}
        value={leaf.subject}
        onChange={(e) => onChange({ ...leaf, subject: e.target.value as ConditionSubject })}
      >
        {CONDITION_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="cond-fixed">帶有</span>
      <select
        aria-label="狀態比對方式"
        data-field={`${path}.match`}
        value={match}
        onChange={(e) =>
          onChange(
            (e.target.value as StatusMatch) === "id"
              ? { kind: "status", subject: leaf.subject, statusId: "" as StatusId }
              : { kind: "status", subject: leaf.subject, tag: "" },
          )
        }
      >
        {(Object.keys(STATUS_MATCH_LABEL) as StatusMatch[]).map((m) => (
          <option key={m} value={m}>
            {STATUS_MATCH_LABEL[m]}
          </option>
        ))}
      </select>
      {isStatusIdLeaf(leaf) ? (
        <>
          <input
            aria-label="狀態編號"
            data-field={`${path}.statusId`}
            type="text"
            placeholder="狀態編號（例：root）"
            value={leaf.statusId}
            onChange={(e) => onChange({ ...leaf, statusId: e.target.value as StatusId })}
          />
          {/*
           * 層數門檻（GH#301-5）。⭐ 空白 = **不寫這一格** = 只問有無，
           * 而不是 `minStacks: 0` —— schema 是 `.min(1)` 且 `.strict()`，寫 0
           * 會做出一張存不回去的卡（跟上面那個「切分支要整顆換掉」同一個理由）。
           * ⛔ 只出現在「這一份」那一支：`tag` 分支的 schema 沒有這一格
           *（「這一類合計幾層」沒有定義過），畫出來就是一個存檔會紅的欄位。
           */}
          <input
            aria-label="層數門檻"
            data-field={`${path}.minStacks`}
            type="number"
            min={1}
            max={MARK_MAX_COUNT}
            placeholder="層數（留空＝不看層數）"
            value={leaf.minStacks ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              const { minStacks: _drop, ...rest } = leaf;
              onChange(e.target.value === "" || !Number.isFinite(n) ? rest : { ...rest, minStacks: n });
            }}
          />
        </>
      ) : (
        <input
          aria-label="狀態分類"
          data-field={`${path}.tag`}
          type="text"
          maxLength={STATUS_TAG_MAX_LEN}
          placeholder="狀態分類 tag（例：stun）"
          value={leaf.tag}
          onChange={(e) => onChange({ ...leaf, tag: e.target.value })}
        />
      )}
    </>
  );
}

/**
 * 裝備那一列 —— 主體 + 「這一件／這一類」 + 編號或 tag。
 *
 * ⭐ 中間那個下拉就是 union 的兩個分支（`itemId` / `tag`），而切換它會**整顆換掉
 * 葉子**而不是留著舊那一格：`{itemId, tag}` 兩格並存兩個分支都不收（schema
 * `.strict()`），所以留著等於做出一張存不回去的卡。這跟 `retargetStatLeaf` 修
 * `mode`/`value` 是同一件事的同一個理由。
 *
 * ⚠️ 兩邊都是**純文字輸入**而不是下拉，跟 `StatusFields` 同一個理由：這個編輯器
 * 手上沒有 `items` 集合可以列（它只吃 `EffectCondition`，不吃 store），而一個
 * 「只列得出硬寫在這裡那幾件」的下拉會在下一件道具上架時安靜地漏掉它。
 * `zRef(soft)` 與 `min/max` 在存檔那一刻擋打錯字。
 */
function EquipmentFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "equipment" }>;
  onChange(next: ConditionLeaf): void;
}) {
  const match: EquipmentMatch = isEquipmentItemLeaf(leaf) ? "item" : "tag";
  return (
    <>
      <select
        aria-label="主體"
        data-field={`${path}.subject`}
        value={leaf.subject}
        onChange={(e) => onChange({ ...leaf, subject: e.target.value as ConditionSubject })}
      >
        {CONDITION_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="cond-fixed">裝備了</span>
      <select
        aria-label="比對方式"
        data-field={`${path}.match`}
        value={match}
        onChange={(e) =>
          onChange(
            (e.target.value as EquipmentMatch) === "item"
              ? { kind: "equipment", subject: leaf.subject, itemId: "" as ItemId }
              : { kind: "equipment", subject: leaf.subject, tag: "" },
          )
        }
      >
        {(Object.keys(EQUIPMENT_MATCH_LABEL) as EquipmentMatch[]).map((m) => (
          <option key={m} value={m}>
            {EQUIPMENT_MATCH_LABEL[m]}
          </option>
        ))}
      </select>
      {isEquipmentItemLeaf(leaf) ? (
        <input
          aria-label="道具編號"
          data-field={`${path}.itemId`}
          type="text"
          placeholder="道具編號（例：godie-i01n）"
          value={leaf.itemId}
          onChange={(e) => onChange({ ...leaf, itemId: e.target.value as ItemId })}
        />
      ) : (
        <input
          aria-label="道具分類"
          data-field={`${path}.tag`}
          type="text"
          maxLength={EQUIPMENT_TAG_MAX_LEN}
          placeholder="道具分類 tag（例：onhit）"
          value={leaf.tag}
          onChange={(e) => onChange({ ...leaf, tag: e.target.value })}
        />
      )}
    </>
  );
}

function KindFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "kind" }>;
  onChange(next: ConditionLeaf): void;
}) {
  return (
    <>
      <select
        aria-label="主體"
        data-field={`${path}.subject`}
        value={leaf.subject}
        onChange={(e) => onChange({ ...leaf, subject: e.target.value as ConditionSubject })}
      >
        {CONDITION_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="cond-fixed">是</span>
      <select
        aria-label="種類"
        data-field={`${path}.is`}
        value={leaf.is}
        onChange={(e) => onChange({ ...leaf, is: e.target.value as ConditionEntityKind })}
      >
        {CONDITION_ENTITY_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
    </>
  );
}

function ChanceFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "chance" }>;
  onChange(next: ConditionLeaf): void;
}) {
  return (
    <>
      {/*
        Shown as a PERCENT and stored as a RATIO. Every probability in the
        codebase is 0..1 (HookDef.chance, Stat.CritChance, Stat.Lifesteal) and
        the schema enforces that, but nobody types 「0.15 機率」 in a design
        conversation — 15 is what the WC3 column says. Converting at the widget
        boundary is what keeps both true at once.
      */}
      <input
        aria-label="機率百分比"
        data-field={`${path}.chance`}
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={Math.round(leaf.p * 1000) / 10}
        onChange={(e) => {
          const pct = Number(e.target.value);
          const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
          onChange({ ...leaf, p: Math.round(clamped * 10) / 1000 });
        }}
      />
      <span className="cond-fixed">% 機率</span>
    </>
  );
}

function StatFields({
  path,
  leaf,
  onChange,
}: {
  path: string;
  leaf: Extract<ConditionLeaf, { kind: "stat" }>;
  onChange(next: ConditionLeaf): void;
}) {
  const percentOk = statSupportsPercent(leaf.stat);
  const mode = leaf.mode ?? "absolute";
  const comparableStats = CONDITION_STATS.filter(
    (stat) => statSupportsPercent(stat) === statSupportsPercent(leaf.stat),
  );

  const setOther = (other: ConditionOperand<ConditionStat> | undefined): void => {
    const { other: _drop, ...withoutOther } = leaf;
    onChange((other === undefined ? withoutOther : { ...withoutOther, other }) as ConditionLeaf);
  };

  /**
   * Both transitions delegate to SHARED, TESTED helpers — the mode/value repair
   * they perform is where a dropdown UI silently corrupts a gate (see
   * `retargetStatLeaf`'s header for the two ways), and it is guarded against the
   * real Zod schema in `sim/content/condition.test.ts` as well as driven through
   * this widget's own dropdowns in `conditionEditor.test.ts`.
   */
  const setStat = (stat: ConditionStat): void => onChange(retargetStatLeaf(leaf, stat));
  const setMode = (next: "absolute" | "percent"): void => onChange(setStatLeafMode(leaf, next));

  return (
    <>
      <select
        aria-label="主體"
        data-field={`${path}.subject`}
        value={leaf.subject}
        onChange={(e) =>
          onChange({ ...leaf, subject: e.target.value as ConditionSubject } as ConditionLeaf)
        }
      >
        {CONDITION_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        aria-label="屬性"
        data-field={`${path}.stat`}
        value={leaf.stat}
        onChange={(e) => setStat(e.target.value as ConditionStat)}
      >
        {CONDITION_STATS.map((s) => (
          <option key={s} value={s}>
            {STAT_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        aria-label="數值形式"
        data-field={`${path}.mode`}
        value={mode}
        disabled={!percentOk}
        title={percentOk ? undefined : "只有 HP / MP 有最大值，其他屬性沒有百分比可言"}
        onChange={(e) => setMode(e.target.value as "absolute" | "percent")}
      >
        <option value="absolute">絕對值</option>
        <option value="percent">百分比</option>
      </select>

      <select
        aria-label="比較"
        data-field={`${path}.op`}
        value={leaf.op}
        onChange={(e) => onChange({ ...leaf, op: e.target.value as CompareOp } as ConditionLeaf)}
      >
        {COMPARE_OPS.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>

      {mode === "percent" ? (
        <>
          <input
            aria-label="數值"
            data-field={`${path}.value`}
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(leaf.value * 1000) / 10}
            onChange={(e) => {
              const pct = Number(e.target.value);
              const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
              onChange({ ...leaf, value: Math.round(clamped * 10) / 1000 } as ConditionLeaf);
            }}
          />
          <span className="cond-fixed">%</span>
        </>
      ) : (
        <input
          aria-label="數值"
          data-field={`${path}.value`}
          type="number"
          min={0}
          max={CONDITION_ABSOLUTE_MAX}
          value={leaf.value}
          onChange={(e) => {
            const v = Number(e.target.value);
            const clamped = Number.isFinite(v) ? Math.min(CONDITION_ABSOLUTE_MAX, Math.max(0, v)) : 0;
            onChange({ ...leaf, value: clamped } as ConditionLeaf);
          }}
        />
      )}

      <label className="cond-other-toggle">
        <input
          type="checkbox"
          aria-label="與另一個讀數比較"
          data-field={`${path}.other.enabled`}
          checked={leaf.other !== undefined}
          onChange={(e) =>
            setOther(
              e.target.checked
                ? { subject: leaf.subject === "self" ? "target" : "self" }
                : undefined,
            )
          }
        />
        與另一個讀數比較
      </label>

      {leaf.other !== undefined ? (
        <span className="cond-other-fields" data-field={`${path}.other`}>
          <span className="cond-fixed">＋</span>
          <select
            aria-label="另一個讀數的主體"
            data-field={`${path}.other.subject`}
            value={leaf.other.subject}
            onChange={(e) =>
              setOther({ ...leaf.other!, subject: e.target.value as ConditionSubject })
            }
          >
            {CONDITION_SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {SUBJECT_LABEL[subject]}
              </option>
            ))}
          </select>
          <select
            aria-label="另一個讀數的屬性"
            data-field={`${path}.other.stat`}
            value={leaf.other.stat ?? ""}
            onChange={(e) => {
              const { stat: _oldStat, ...rest } = leaf.other!;
              setOther(
                e.target.value === ""
                  ? rest
                  : { ...rest, stat: e.target.value as ConditionStat },
              );
            }}
          >
            <option value="">同左側屬性</option>
            {comparableStats.map((stat) => (
              <option key={stat} value={stat}>
                {STAT_LABEL[stat]}
              </option>
            ))}
          </select>
          <span className="cond-fixed">×</span>
          <input
            aria-label="另一個讀數的倍率"
            data-field={`${path}.other.scale`}
            type="number"
            min={CONDITION_SCALE_MIN}
            max={CONDITION_SCALE_MAX}
            step={0.05}
            value={leaf.other.scale ?? 1}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value)) return;
              setOther({
                ...leaf.other!,
                scale: Math.min(CONDITION_SCALE_MAX, Math.max(CONDITION_SCALE_MIN, value)),
              });
            }}
          />
        </span>
      ) : null}
    </>
  );
}

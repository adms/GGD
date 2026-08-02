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
  CONDITION_ENTITY_KINDS,
  CONDITION_MAX_CHILDREN,
  CONDITION_STATS,
  CONDITION_SUBJECTS,
  describeCondition,
  retargetStatLeaf,
  setStatLeafMode,
  statSupportsPercent,
  type CompareOp,
  type ConditionEntityKind,
  type ConditionLeaf,
  type ConditionStat,
  type ConditionSubject,
  type EffectCondition,
} from "@ggd/shared/sim/content/condition";

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
};

const OP_LABEL: Record<CompareOp, string> = {
  ">=": "≥ 大於等於",
  "<=": "≤ 小於等於",
  ">": "> 大於",
  "<": "< 小於",
  "==": "= 等於",
  "!=": "≠ 不等於",
};

/** The three clause shapes the dropdowns can build. */
type ClauseKind = "stat" | "kind" | "chance";

const CLAUSE_LABEL: Record<ClauseKind, string> = {
  stat: "數值比較（屬性 / HP / MP）",
  kind: "目標種類（英雄 / 小兵 …）",
  chance: "機率",
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
      ) : clause.leaf.kind === "kind" ? (
        <KindFields
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
    </>
  );
}

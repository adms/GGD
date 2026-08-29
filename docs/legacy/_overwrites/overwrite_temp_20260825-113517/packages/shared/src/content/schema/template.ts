/**
 * template@1 — the 鑄技工坊 (Skill Forge) ability-template document.
 *
 * A template is a PARAMETERISED behaviour prototype recovered from the 29 JASS
 * behaviour families (docs/ability-templates.md). An ability doc references one
 * OR MORE by id and supplies the filled param slots (`ability@1.template`, see
 * `zAbilityTemplateBinding` at the bottom of this file); the pure `expand()` /
 * `expandStack()` (../templates/expand.ts) turn template+params into the
 * BEHAVIOUR half of an AbilityDef at registry time. The template only owns the
 * behaviour SHAPE — an ability's description/icon/cooldown/manaCost/range stay
 * plain skeleton fields, never template params.
 *
 * DESIGN NOTE — `zParamSlot` is a single flat object keyed by `type` rather than
 * a `z.discriminatedUnion`. Semantically it is the discriminated shape the design
 * sketches (§2.1), but a flat object keeps the fieldAdoption census (S8 guard)
 * honest: every optional key is registered ONCE and is adopted by at least one
 * real slot across the 29 templates, instead of a per-branch `optional` field
 * that no branch happens to set showing up as a phantom zero. The expander reads
 * slots by `type`; the extra keys a given type ignores are simply unused.
 */
import { z } from "zod";
import { zId } from "./common";
import { zRef } from "./common";

/** Unit a numeric slot is measured in — drives the expander's length conversion. */
/**
 * `wc3u` is a PLANAR WC3 length (range/radius/distance) and converts at
 * GGD_PER_WC3; `wc3h` is a WC3 FLY HEIGHT and converts at the separate
 * GGD_APEX_PER_WC3 — the vertical axis is set by the camera, not by the map
 * (task #247b; the full reasoning lives on GGD_APEX_PER_WC3 in templates/expand).
 */
export const zParamUnit = z.enum(["wc3u", "wc3h", "s", "count", "ratio"]);

/**
 * The kind of value a slot carries; the expander switches on it.
 *
 * `condition` (owner 2026-07-30 「on-attack by condition … 編輯器也要配合」) is a
 * whole 觸發條件 tree — see sim/content/condition.ts. It is a param TYPE rather
 * than a family-specific field so that any behaviour family that grows a gate
 * (proc families first, but 受擊反應 / 週期力場 next) declares it the same way
 * and gets the same dropdown editor for free.
 *
 * ⭐ `docRef` (owner 2026-08-08 「都可以任意替換設定為 **[技能編號/buff/debuff
 * 狀態]**」) is「另一份文件的編號」—— 一個 {@link zId} 格式的自由字串, **不是**
 * `enum`。差別是決定性的:
 *   · `enum` 只能挑作者當初列進 `values` 的那幾個 —— 具名標記家族用 enum 就會
 *     退化成 `CC_MECHANIC` 那張白名單, 而 owner 要的正是「任意」;
 *   · `zRef(collection)` 又綁死**單一** collection, 而一個標記的身分可能來自
 *     `abilities`(`godie-hapm.passive`) **或** `status-effects`(`berserk`)。
 *     同一個取捨與理由已經在 `schema/mark.ts` 檔頭①推導過一次, 這裡逐字適用。
 * 所以它驗**格式**不驗**存在**: 打錯大小寫或塞進一個句子會被擋下, 指到一份還
 * 沒寫的文件則放行(標記的機制不依賴那份文件, 只有顯示依賴它)。
 * ⚠️ 多 collection 的 ref 哪天做出來了, 這一格就該換過去。
 */
 * ⭐ `rgb`（GH#693 蝗蟲群模板化）是**一組線性 RGB**（三個 0…1 的數字），形狀與
 * `model@1.fxTint` 逐位元相同 —— 刻意共用同一個形狀，因為它們是同一件知識的兩個
 * 住處（模型級 vs 節點級，見 `schema/effects/spawnModelFx.ts` 的 `tint`）。
 * ⛔ 不用三個 `number` 槽（`tintR`/`tintG`/`tintB`）：那會把「一個顏色」拆成三個
 * 各自可以漂的數字，而且編輯器會渲染成三格互不相干的數字輸入。
 * ⚠️ 它**不是** `number`，所以 `paramsSchema.test` 的「每一個數字格都要 MOVES」
 * 探針掃不到它 —— 對應的守衛是 `locustTemplates.test.ts`（顏色有沒有到達展開結果）。
 */
export const zParamType = z.enum([
  "number",
  "enum",
  "scaling",
  "statModifiers",
  "condition",
  "docRef",
  "rgb",
]);

/**
 * One parameter slot. `type` selects how the expander reads it and how the
 * editor synthesises its form widget:
 *   number        → NumberField (min/max/unit), value is a number
 *   enum          → EnumSelect over `values`, value is one of them
 *   scaling       → the shared zScaling card, value validated at fill time
 *   statModifiers → z.array(zStatModifier), value validated at fill time
 *   docRef        → a plain text field holding another doc's id (格式驗證, 見上)
 * `default` is the exemplar's MEASURED value (never invented). `optional: true`
 * marks a slot the ability may omit (radius/terminalBurst/internalCooldown…).
 */
export const zParamSlot = z
  .object({
    type: zParamType,
    /** the exemplar's measured default (number | string | scaling | modifier[]) */
    default: z.unknown().optional(),
    /** numeric slots: inclusive bounds; the expander throws outside them */
    min: z.number().optional(),
    max: z.number().optional(),
    /** numeric slots: unit; "wc3u" slots are length-converted by the expander */
    unit: zParamUnit.optional(),
    /** enum slots: the allowed members */
    values: z.array(z.string().min(1)).optional(),
    /** the ability may omit this slot (the expander falls back / drops it) */
    optional: z.boolean().optional(),
    /**
     * 落差治理 at PARAM granularity (design §2.4 / §六). The slot records a real
     * measured value from the exemplar's JASS record, but the sim has no
     * vocabulary to honour it, so `expand()` reads it and produces nothing —
     * e.g. 行進波動's per-step march (`stepSize`/`stepCount`) collapses into one
     * projectile because the sim has no sequential-segment resolution.
     *
     * Marking it here is what stops that from being SILENT: the editor greys the
     * field and says 「本版不生效」, and paramsSchema.test.ts probes every enabled
     * template to assert that the set of slots the expander actually consumes
     * matches the set NOT marked inert. A slot that stops being inert (because
     * P2/P3 added the vocabulary) fails that test until the flag is removed.
     */
    inert: z.string().min(1).optional(),
  })
  .strict();
export type ParamSlot = z.infer<typeof zParamSlot>;

/** P1 enables 8 families; the remaining 21 ship as `draft` cards (no expand path). */
export const zTemplateStatus = z.enum(["enabled", "draft"]);

/**
 * template@1 document. Stored at content/ability-templates/<id>.json.
 */
export const zTemplateDoc = z
  .object({
    id: zId,
    schema: z.literal("template@1"),
    name: z.string().min(1),
    description: z.string().min(1),
    /** the 行為模板 family key — joins the expander's family switch + gap score */
    family: z.string().min(1),
    status: zTemplateStatus,
    /** ordered slot map; the form walker renders in insertion order */
    params: z.record(z.string(), zParamSlot),
    /** sim capability keys, checked against SIM_CAPABILITIES (expand.ts) */
    requires: z.array(z.string()),
    /** 引擎支援度 badge source: 綠≥7 / 黃4-6 / 紅≤3 (mirror of score_gap BASE) */
    gapScore: z.number().int().min(0).max(10),
    /** where the family was recovered from (skill code + JASS locus) */
    exemplar: z.object({ skill: z.string().min(1), jass: z.string().min(1) }).strict(),
  })
  .strict();
export type TemplateDoc = z.infer<typeof zTemplateDoc>;

// ---------------------------------------------------------------------------
// 模板複數套用 (owner 2026-07-31「我們討論的技能記得都要能用編輯器編輯模板跟複數
// 選取」/ 2026-07-30「模板複數可被套用於技能中」)
// ---------------------------------------------------------------------------

/**
 * ONE card in an ability's template stack — what used to be the WHOLE of
 * `ability@1.template`.
 */
export const zAbilityTemplateCard = z
  .object({
    ref: zRef("ability-templates"),
    /** filled slot values; each is validated by its slot's semantics at fill time */
    params: z.record(z.string(), z.unknown()),
    /** §5 breaking-migration hook — P1 only STORES it and re-expands on load */
    version: z.number().int().min(1).optional(),
  })
  .strict();
export type AbilityTemplateCard = z.infer<typeof zAbilityTemplateCard>;

/**
 * The pre-stack name, kept as an ALIAS rather than deleted: it is the shape 100 %
 * of on-disk content still uses, and `expand(t, params)` still takes exactly this
 * card's `params`. Renaming it out of existence would have been a cosmetic
 * rewrite that broke every importer for no behavioural gain.
 */
export const zAbilityTemplateRef = zAbilityTemplateCard;
export type AbilityTemplateRef = AbilityTemplateCard;

/**
 * Stack size bounds. CLAUDE.md 「欄位要有上界，不是只有下界」, and the upper one is
 * NOT a balance lever — it is a MIS-PASTE guard, the same job `apexHeight`'s 2000
 * does in templates/expand.ts.
 *
 * Why 8 and not 3 or 30. Under `lastWins` every card after the first contributes
 * only its `effects` (and its hooks) — the scalar half is overwritten — so a
 * stack is mostly effect concatenation, and each card costs one more `EffectDef`
 * the sim runs per cast. 8 is comfortably above anything the JASS census asks
 * for: the biggest single recovered behaviour is 鎖定連段, which needs FOUR
 * primitives, and every 演出 in docs/ability-templates.md decomposes into ≤ 5.
 * A `template` array longer than that is a duplicated paste, not a design.
 *
 * The floor is 1 rather than 0 on purpose: an EMPTY stack is not「no template」,
 * it is a doc that claims to be templated and expands to nothing — exactly the
 * silent no-op the whole Forge is built to make impossible. Omit the field
 * instead.
 */
export const TEMPLATE_STACK_MIN_CARDS = 1;
export const TEMPLATE_STACK_MAX_CARDS = 8;

/**
 * ⚖️ THE DECISION POINT, MADE A FIELD (CLAUDE.md 第一守則).
 *
 * Two cards in one stack can both emit the same SCALAR key — most obviously
 * `castType` (單體斬擊 says "targeted", 原地震波 says "ground"), but also
 * `radius` / `castTimeSec` / `targetsEnemies`. Somebody has to decide what that
 * means, and「後蓋前」vs「重複即拒」is a preference, not a fact, so it is a knob:
 *
 *   · `reject`   — 重複即拒. The stack refuses to expand and NAMES the collision
 *                  (which key, which two cards, which two values). The operator
 *                  resolves it by reordering, clearing a param, or dropping a
 *                  card.
 *   · `lastWins` — 後蓋前. The later card's value replaces the earlier one, and
 *                  the shadowed value is still reported in the expansion trace
 *                  so 「我填的數字去哪了」 has an answer.
 *
 * ⚠️ AGREEMENT IS NOT A CONFLICT. Two cards that both emit `targetsEnemies:
 * true` collide on nothing — the policy only fires when the VALUES DIFFER.
 * Without that rule `reject` would be useless out of the box, because nearly
 * every offensive template emits the same `targetsEnemies`.
 *
 * ⚠️ LIST-VALUED OUTPUT IS NEVER A CONFLICT. `effects` (and a passive's
 * `hooks`/`modifiers`/`auras`) CONCATENATE in card order — that is the entire
 * point of stacking, and treating it as a collision would make composition
 * impossible.
 *
 * DEFAULT = `reject`, and the reasoning is the project's own: a named gap beats
 * a silent one. `lastWins` quietly deletes a measured JASS value the operator
 * typed into a live form field (失敗形態 ②/③ — 「做了但玩家拿不到」); `reject`
 * makes them meet the ambiguity in the editor, where it costs one click, instead
 * of in a match. Blast radius today is ZERO either way: no shipped ability uses a
 * template at all, and a 1-card stack can never conflict. Owner keeps the switch.
 */
export const zTemplateConflictPolicy = z.enum(["reject", "lastWins"]);
export type TemplateConflictPolicy = z.infer<typeof zTemplateConflictPolicy>;

/** Shipped default for `onConflict` — see the note on `zTemplateConflictPolicy`. */
export const DEFAULT_TEMPLATE_CONFLICT: TemplateConflictPolicy = "reject";

/** The explicit stack form: an ordered card list plus its conflict policy. */
export const zAbilityTemplateStack = z
  .object({
    cards: z
      .array(zAbilityTemplateCard)
      .min(TEMPLATE_STACK_MIN_CARDS)
      .max(TEMPLATE_STACK_MAX_CARDS),
    onConflict: zTemplateConflictPolicy.optional(),
  })
  .strict();
export type AbilityTemplateStack = z.infer<typeof zAbilityTemplateStack>;

/**
 * What `ability@1.template` accepts. THREE shapes, ONE normaliser
 * (`normalizeTemplateBinding` in ../templates/expand.ts):
 *
 *   1. `{cards: [...], onConflict}`  — the full stack, the only form that can
 *                                      carry a non-default policy
 *   2. `[{ref,params}, ...]`         — an ordered array, the ergonomic form when
 *                                      the default policy is fine
 *   3. `{ref,params}`                — ONE card, i.e. EVERY doc written before
 *                                      this change; back-compat is not a
 *                                      migration, it is a union branch
 *
 * The branches are mutually exclusive by shape — array vs object, and both
 * object branches are `.strict()` with disjoint required keys — so there is no
 * order-dependent「first branch that happens to parse」ambiguity.
 */
export const zAbilityTemplateBinding = z.union([
  zAbilityTemplateStack,
  z.array(zAbilityTemplateCard).min(TEMPLATE_STACK_MIN_CARDS).max(TEMPLATE_STACK_MAX_CARDS),
  zAbilityTemplateCard,
]);
export type AbilityTemplateBinding = z.infer<typeof zAbilityTemplateBinding>;

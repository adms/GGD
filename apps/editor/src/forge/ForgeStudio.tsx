/**
 * 鑄技工坊 — 疊卡 → 填參數 → 即時試放 → 一鍵寫回 (design §2.3 steps 2-4).
 *
 * ZERO new form code: each card's param form is `walkZod(paramsSchemaFor(tpl))`
 * fed to the SAME `FormRenderer` and widget set every other collection uses.
 * That works because `paramsSchemaFor` (shared, next to `expand`) turns the
 * template's DATA slots into a real Zod object, so ranges become clamped
 * NumberFields and enums become EnumSelects without this file knowing anything
 * about widgets.
 *
 * 模板複數套用 (owner 2026-07-31「我們討論的技能記得都要能用編輯器編輯模板跟複數
 * 選取」). The studio holds an ORDERED LIST of cards, not one template:
 *   · add / remove / reorder cards, each with its own param panel;
 *   · one 衝突處理 dropdown (`後蓋前` / `重複即拒`) — the decision point, as a
 *     field, defaulting to what `DEFAULT_TEMPLATE_CONFLICT` says;
 *   · a 展開來源 table that names, per emitted key and per emitted effect, WHICH
 *     card produced it. That table is not decoration: it is the only place an
 *     operator can see that card 2 was actually consumed, and the same trace is
 *     what `stack.test.ts` asserts on.
 *
 * The preview is the REAL sim: `expandStack()` → merge onto the host ability doc
 * → `previewAbility` on a sandbox SimWorld through the real statPipeline and
 * resolveScaling. It is NOT a 3D cast — `PreviewController.mount()` is still a
 * renderless stub — and the UI says so rather than implying a shot that does not
 * happen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  paramsSchemaFor,
  defaultParamsFor,
  toLen,
  toApex,
  zAbilityDoc,
  zChampionDoc,
  DEFAULT_TEMPLATE_CONFLICT,
  TEMPLATE_STACK_MAX_CARDS,
  type TemplateDoc,
  type ChampionDoc,
  type TemplateConflictPolicy,
  type AbilityTemplateCard,
} from "@ggd/shared/content";
import {
  expandStack,
  denormalizeTemplateBinding,
  mergeExpansion,
  type ExpandStackTrace,
} from "@ggd/shared/content/templates/expand";
import { embeddedSlotOf } from "@ggd/shared/content/editModel";
import type { AbilityDef, ChampionDef, CoreAbilitySlot } from "@ggd/shared/sim";
import { api, WRITES_ENABLED } from "../api/client";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { setIn, type ErrorMap } from "../store";
import { createSimPreviewController } from "../preview/PreviewController";
import { badgeFor } from "./badge";
import { degradeNotes, satisfiedCaps } from "./degrade";
import { planForgeWrite, runForgeWrite, type ForgePlan } from "./ForgeWriteback";
import { VfxLayerPanel } from "./VfxLayerPanel";
import {
  addLayer,
  draftsFromDoc,
  moveLayer,
  patchForDoc,
  patchLayer,
  removeLayer,
  vfxLayerBlockers,
  type VfxLayerDraft,
} from "./vfxLayerModel";
import { ConditionEditor } from "./ConditionEditor";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";

const controller = createSimPreviewController();
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** 衝突處理 labels — the wording an operator has to be able to choose between. */
const CONFLICT_LABELS: Readonly<Record<TemplateConflictPolicy, string>> = {
  reject: "重複即拒 — 兩張卡填同一格但值不同時，停下來讓我處理",
  lastWins: "後蓋前 — 讓後面的卡片覆蓋前面的值",
};

export function ForgeStudio({
  template,
  catalog = [],
  onBack,
}: {
  /** the card the gallery was clicked on — seeds the stack */
  template: TemplateDoc;
  /** every template that can be ADDED as a second/third card */
  catalog?: readonly TemplateDoc[];
  onBack(): void;
}) {
  const [abilityId, setAbilityId] = useState<string>("");
  const [cards, setCards] = useState<AbilityTemplateCard[]>(() => [
    { ref: template.id, params: defaultParamsFor(template) },
  ]);
  const [onConflict, setOnConflict] = useState<TemplateConflictPolicy>(DEFAULT_TEMPLATE_CONFLICT);
  /**
   * 特效堆疊。`null` = 還沒從 host doc 種下去（技能還沒選，或正在載）。
   * 種子在下面的 effect 裡下，這樣切換技能時會跟著換成那一支自己的層。
   */
  const [layers, setLayers] = useState<VfxLayerDraft[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<ForgePlan | null>(null);
  const [signedOff, setSignedOff] = useState(false);

  /**
   * Every template the studio can resolve a `ref` against. The picked one is
   * ALWAYS in here even when the gallery passed no catalog (the unit harness
   * does exactly that), so a 1-card stack never depends on the catalog query.
   */
  const docs = useMemo(() => {
    const m = new Map<string, TemplateDoc>([[template.id, template]]);
    for (const t of catalog) if (!m.has(t.id)) m.set(t.id, t);
    return m;
  }, [template, catalog]);

  /** Only ENABLED families can be added — `expand()` throws on a draft. */
  const addable = useMemo(
    () => [...docs.values()].filter((t) => t.status === "enabled").sort((a, b) => (a.id < b.id ? -1 : 1)),
    [docs],
  );

  const resolved = useMemo(
    () =>
      cards.map((c) => ({ card: c, template: docs.get(c.ref) })).filter(
        (r): r is { card: AbilityTemplateCard; template: TemplateDoc } => r.template !== undefined,
      ),
    [cards, docs],
  );

  const requires = useMemo(
    () => [...new Set(resolved.flatMap((r) => r.template.requires))].sort(),
    [resolved],
  );
  const notes = degradeNotes(requires);
  const satisfied = satisfiedCaps(requires);

  const abilities = useQuery({
    queryKey: ["forge", "abilities"],
    queryFn: () => api.index("abilities"),
    staleTime: 30_000,
  });
  const champions = useChampionDocs();

  /**
   * `content/vfx/` 的全部 id。這張表就是 #230 的入口：491 支從原作抽出來的
   * 發射器裡有 433 支從來沒被任何技能引用過，它們不缺技術，只缺一個能填 id 的地方。
   */
  const vfxIndex = useQuery({
    queryKey: ["forge", "vfx"],
    queryFn: () => api.index("vfx"),
    staleTime: 60_000,
  });
  const vfxIds = useMemo(
    () => (vfxIndex.data?.entries ?? []).map((e) => e.id).sort(),
    [vfxIndex.data],
  );

  const host = useQuery({
    queryKey: ["forge", "ability", abilityId],
    queryFn: () => api.doc<Record<string, unknown>>("abilities", abilityId),
    enabled: abilityId !== "",
  });

  // ---- the expansion. Same pure function the registry runs at boot. ----
  const expansion = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: expandStack(
          resolved.map((r) => ({ template: r.template, params: r.card.params })),
          onConflict,
        ),
      };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, [resolved, onConflict]);

  const conflicts = expansion.ok ? expansion.value.trace.conflicts : [];
  /** `reject` means an unresolved collision is not writable — say so, loudly. */
  const conflictBlocks = onConflict === "reject" && conflicts.length > 0;

  const binding = useMemo(
    () => denormalizeTemplateBinding(cards, onConflict),
    [cards, onConflict],
  );

  // 換技能就重新種特效層 —— 種子是那支技能**現在真的在播**的東西，不是空白。
  const hostId = host.data ? String(host.data["id"]) : "";
  const seededFor = useRef<string>("");
  useEffect(() => {
    if (hostId === "" || seededFor.current === hostId) return;
    seededFor.current = hostId;
    setLayers(draftsFromDoc(host.data ?? null));
  }, [hostId, host.data]);

  const after = useMemo(() => {
    if (!host.data || !expansion.ok) return null;
    const merged = mergeExpansion({ ...host.data, template: binding }, expansion.value.result);
    if (layers === null) return merged;
    // 特效欄位由工坊接管：`patchForDoc` 決定要寫單值 `vfxKey` 還是完整 `vfxLayers`。
    // 舊的 `vfxLayers` 要**主動拿掉**，否則操作者把層清回一層之後，doc 上會留著
    // 舊堆疊繼續播 —— 故障形態 ②。`planForgeWrite` 看到它不見了就送 null 去刪。
    const { vfxLayers: _drop, ...rest } = merged as Record<string, unknown>;
    return { ...rest, ...patchForDoc(layers) } as Record<string, unknown>;
  }, [host.data, expansion, binding, layers]);

  const docErrors: ErrorMap = useMemo(() => {
    if (!after) return {};
    const res = zAbilityDoc.safeParse(after);
    if (res.success) return {};
    const map: ErrorMap = {};
    for (const i of res.error.issues) {
      (map[i.path.join(".")] ??= []).push(i.message);
    }
    return map;
  }, [after]);

  const paramErrors: ErrorMap[] = useMemo(
    () =>
      resolved.map((r) => {
        const res = paramsSchemaFor(r.template).safeParse(r.card.params);
        if (res.success) return {};
        const map: ErrorMap = {};
        for (const i of res.error.issues) (map[i.path.join(".")] ??= []).push(i.message);
        return map;
      }),
    [resolved],
  );

  // ---- the live try-in-preview: real sim, real stats ----
  const preview = useMemo(() => {
    if (!after) return null;
    const parsed = zAbilityDoc.safeParse(after);
    if (!parsed.success) return { error: "展開結果尚未通過 zAbilityDoc 校驗" } as const;
    const ability = parsed.data as unknown as AbilityDef;
    const owner = champions.find((c) =>
      (["Q", "W", "E", "R"] as const).some((s) => c.abilities[s].id === ability.id),
    );
    if (!owner || ability.slot === "EX") return { lines: null } as const;
    const champ: ChampionDef = {
      ...(owner as unknown as ChampionDef),
      abilities: { ...(owner as unknown as ChampionDef).abilities, [ability.slot]: ability },
    };
    try {
      return controller.previewAbility(champ, ability.slot as CoreAbilitySlot, { level: 1 });
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, [after, champions]);

  const championDoc = useMemo(() => {
    if (!abilityId) return null;
    const owner = champions.find(
      (c) => embeddedSlotOf(c as unknown as Record<string, unknown>, abilityId) !== null,
    );
    return (owner as unknown as Record<string, unknown>) ?? null;
  }, [champions, abilityId]);

  // ---- stack editing ------------------------------------------------------
  const setCardParams = (i: number, next: Record<string, unknown>): void =>
    setCards((cs) => cs.map((c, j) => (j === i ? { ...c, params: next } : c)));

  const addCard = (id: string): void => {
    const t = docs.get(id);
    if (t === undefined || cards.length >= TEMPLATE_STACK_MAX_CARDS) return;
    setCards((cs) => [...cs, { ref: t.id, params: defaultParamsFor(t) }]);
  };

  const removeCard = (i: number): void =>
    // The floor is 1: an EMPTY stack is a doc that claims to be templated and
    // expands to nothing, which is the silent no-op the Forge exists to prevent.
    setCards((cs) => (cs.length <= 1 ? cs : cs.filter((_, j) => j !== i)));

  const moveCard = (i: number, delta: number): void =>
    setCards((cs) => {
      const j = i + delta;
      if (j < 0 || j >= cs.length) return cs;
      const next = cs.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const buildPlan = () => {
    if (!host.data || !after) return;
    setPlan(planForgeWrite(host.data, after, championDoc, docs));
    setSignedOff(false);
  };

  const doSave = async () => {
    if (!plan || !after) return;
    setStatus("寫回中…");
    try {
      const championAfter =
        plan.mirror && championDoc
          ? (setIn(championDoc, `abilities.${plan.mirror.slot}`, plan.mirror.embedded) as Record<
              string,
              unknown
            >)
          : null;
      const res = await runForgeWrite(plan, after, championAfter, docs);
      setStatus(`已寫回 ${res.wrote.join(" + ")} · contentVersion ${res.contentVersion}`);
      setPlan(null);
    } catch (e) {
      setStatus(`寫回失敗: ${String(e)}`);
    }
  };

  /** 特效層自己的問題（空的 vfxKey、超界的 delay、兩格的 tint…）。 */
  const vfxBlockers = useMemo(() => vfxLayerBlockers(layers ?? []), [layers]);

  const blocked =
    conflictBlocks ||
    Object.keys(docErrors).length > 0 ||
    paramErrors.some((m) => Object.keys(m).length > 0) ||
    vfxBlockers.length > 0;

  return (
    <div className="forge-studio">
      <header className="forge-head">
        <button type="button" className="forge-back" onClick={onBack}>
          ← 回模板選擇
        </button>
        <h1>
          鑄技工坊 · {resolved.map((r) => r.template.name).join(" ＋ ")}
          <span className={`forge-badge ${badgeFor(template.gapScore).tone}`}>
            {badgeFor(template.gapScore).label}
          </span>
        </h1>
        <p className="forge-sub">
          {template.description} · 範本 {template.exemplar.skill} (
          <code>{template.exemplar.jass}</code>)
        </p>
      </header>

      {notes.length > 0 ? (
        <section className="forge-degrade-panel" role="note">
          <h3>落差告知（本版不會做到的事）</h3>
          <ul>
            {notes.map((n) => (
              <li key={n.capability}>
                <b>{n.capability}</b>：{n.plan} <span className="phase">→ P{n.phase}</span>
              </li>
            ))}
          </ul>
          {satisfied.length > 0 ? (
            <p className="forge-ok-caps">引擎已支援：{satisfied.join(" · ")}</p>
          ) : null}
        </section>
      ) : null}

      <div className="forge-cols">
        <section className="forge-col">
          <h3>1. 選要改寫的技能</h3>
          <select
            data-field="stack.ability"
            value={abilityId}
            onChange={(e) => setAbilityId(e.target.value)}
          >
            <option value="">— 選一支現有技能 —</option>
            {(abilities.data?.entries ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.id}
              </option>
            ))}
          </select>
          <p className="forge-note">
            技能的名稱/圖示/冷卻/魔力/射程仍由技能文件本身持有；模板只擁有「行為」那一半。
          </p>

          <h3>
            2. 疊模板卡 <span className="forge-count">{cards.length}</span>
          </h3>
          <p className="forge-note">
            卡片<b>由上而下依序套用</b>：效果會依序串接，而兩張卡填到同一格時由下面的
            「衝突處理」決定誰說了算。上限 {TEMPLATE_STACK_MAX_CARDS} 張。
          </p>

          <label className="forge-conflict">
            <span>衝突處理</span>
            <select
              data-field="stack.onConflict"
              aria-label="衝突處理"
              value={onConflict}
              onChange={(e) => setOnConflict(e.target.value as TemplateConflictPolicy)}
            >
              {(Object.keys(CONFLICT_LABELS) as TemplateConflictPolicy[]).map((k) => (
                <option key={k} value={k}>
                  {CONFLICT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          {resolved.map((r, i) => (
            <CardPanel
              key={`${r.card.ref}-${i}`}
              index={i}
              total={resolved.length}
              template={r.template}
              params={r.card.params}
              errors={paramErrors[i] ?? {}}
              onParams={(next) => setCardParams(i, next)}
              onMove={(d) => moveCard(i, d)}
              onRemove={() => removeCard(i)}
            />
          ))}

          <div className="forge-stack-add">
            <select
              data-field="stack.add"
              aria-label="加一張模板卡"
              value=""
              disabled={cards.length >= TEMPLATE_STACK_MAX_CARDS}
              onChange={(e) => addCard(e.target.value)}
            >
              <option value="">＋ 加一張模板卡…</option>
              {addable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.id}）
                </option>
              ))}
            </select>
            {cards.length >= TEMPLATE_STACK_MAX_CARDS ? (
              <span className="forge-note">已達 {TEMPLATE_STACK_MAX_CARDS} 張上限</span>
            ) : null}
          </div>

          {abilityId !== "" && layers !== null ? (
            <VfxLayerPanel
              layers={layers}
              vfxIds={vfxIds}
              onPatch={(i, patch) => setLayers((ls) => (ls ? patchLayer(ls, i, patch) : ls))}
              onMove={(i, d) => setLayers((ls) => (ls ? moveLayer(ls, i, d) : ls))}
              onRemove={(i) => setLayers((ls) => (ls ? removeLayer(ls, i) : ls))}
              onAdd={() => setLayers((ls) => (ls ? addLayer(ls) : ls))}
            />
          ) : null}
        </section>

        <section className="forge-col">
          <h3>3. 即時試放</h3>
          <p className="forge-note">
            數值來自真正的 sim（sandbox SimWorld + 真 statPipeline + 真 resolveScaling）。
            這是<b>數值/效果的即時試放</b>，不是 3D 放招 —— 3D 預覽仍是 P2。
          </p>
          {!expansion.ok ? <p className="error">展開失敗：{expansion.error}</p> : null}
          {expansion.ok ? (
            <>
              <ConflictPanel trace={expansion.value.trace} blocks={conflictBlocks} />
              <ExpansionSummary result={expansion.value.result} />
              <OriginTable trace={expansion.value.trace} />
            </>
          ) : null}
          {preview && "error" in preview ? <p className="error">{preview.error}</p> : null}
          {preview && "lines" in preview && preview.lines === null ? (
            <p className="forge-note">這支技能沒有英雄持有，無法算等級縮放。</p>
          ) : null}
          {preview && "lines" in preview && preview.lines ? (
            <ul className="forge-lines">
              {preview.lines.map((l, i) => (
                <li key={i} style={{ marginLeft: l.depth * 12 }}>
                  <code>{l.kind}</code> {l.summary}
                  {l.perRank ? (
                    <span className="perrank"> [{l.perRank.map(fmt).join(" / ")}]</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <h3>4. 寫回</h3>
          {!WRITES_ENABLED ? (
            <p className="forge-note">此組建為唯讀（正式版不含 content-api），寫回已停用。</p>
          ) : null}
          <button
            type="button"
            data-field="stack.preview"
            disabled={!after || blocked || !WRITES_ENABLED}
            onClick={buildPlan}
          >
            預覽寫入差異
          </button>
          {vfxBlockers.length > 0 ? (
            <ul className="error">
              {vfxBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {blocked && after && !conflictBlocks && vfxBlockers.length === 0 ? (
            <p className="error">展開結果未通過校驗，無法寫回。</p>
          ) : null}
          {status ? <p className="forge-status">{status}</p> : null}
        </section>
      </div>

      {plan ? (
        <ConfirmDialog
          plan={plan}
          notes={notes}
          signedOff={signedOff}
          onSign={setSignedOff}
          onCancel={() => setPlan(null)}
          onConfirm={() => void doSave()}
        />
      ) : null}
    </div>
  );
}

/**
 * ONE card: its own header (reorder / remove), its own generated param form, and
 * its own condition editors — namespaced by card index so two cards carrying the
 * same slot are independently addressable.
 */
function CardPanel({
  index,
  total,
  template,
  params,
  errors,
  onParams,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  template: TemplateDoc;
  params: Record<string, unknown>;
  errors: ErrorMap;
  onParams(next: Record<string, unknown>): void;
  onMove(delta: number): void;
  onRemove(): void;
}) {
  const paramsSchema = useMemo(() => paramsSchemaFor(template), [template]);
  /**
   * ⭐ `condition` slots are LIFTED OUT of the generated form and rendered by
   * `ConditionEditor` instead (owner 2026-07-30:「編輯器也要配合」/「不是 script
   * 編輯而是 UI 選項」).
   *
   * WHY THE FILTER IS HERE AND NOT IN `walk.ts`. `zEffectCondition` is a
   * RECURSIVE UNION and `walk.ts` has no ZodUnion branch, so left alone it
   * degrades to `kind:"unknown"` — the JSON textarea, i.e. exactly the script
   * editor that was ruled out. Teaching the generic walker to draw a condition
   * would mean teaching it four coupled dropdowns whose legal values depend on
   * each other (percent only on hp/mp), which is not a generic widget; it is
   * this one. Validation is UNAFFECTED: `paramsSchema` still contains the slot,
   * so the caller's `paramErrors` still reports a bad condition on the same path.
   */
  const conditionSlots = useMemo(
    () => Object.keys(template.params).filter((n) => template.params[n]?.type === "condition"),
    [template],
  );
  const ui = useMemo(() => {
    const node = walkZod(paramsSchema, "", "參數");
    if (node.kind !== "object" || conditionSlots.length === 0) return node;
    return { ...node, fields: node.fields.filter((f) => !conditionSlots.includes(f.path)) };
  }, [paramsSchema, conditionSlots]);

  return (
    <section className="forge-card-panel" data-card={index}>
      <header className="forge-card-panel-head">
        <span className="forge-card-order" data-field={`stack.card${index}.order`}>
          第 {index + 1} 張
        </span>
        <span className="forge-card-name" data-field={`stack.card${index}.name`}>
          {template.name}
        </span>
        <button
          type="button"
          data-field={`stack.card${index}.up`}
          aria-label={`把第 ${index + 1} 張往上移`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          data-field={`stack.card${index}.down`}
          aria-label={`把第 ${index + 1} 張往下移`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          data-field={`stack.card${index}.remove`}
          aria-label={`移除第 ${index + 1} 張`}
          disabled={total <= 1}
          title={total <= 1 ? "至少要留一張卡；不想用模板請直接清掉技能的 template 欄位" : undefined}
          onClick={onRemove}
        >
          ✕
        </button>
      </header>
      <p className="forge-note">
        預設值 = 範本技能的 JASS 實測值，不是憑空發明的數字。範本 {template.exemplar.skill}（
        <code>{template.exemplar.jass}</code>）
      </p>
      <FormRenderer
        node={ui}
        value={params}
        dataPath=""
        errors={errors}
        onChange={(path, value) => onParams(setIn(params, path, value) as Record<string, unknown>)}
      />
      {conditionSlots.map((name) => (
        <ConditionEditor
          key={name}
          fieldPrefix={`cond${index}`}
          label={`${name} · 觸發條件`}
          value={params[name] as EffectCondition | undefined}
          onChange={(next) => {
            // Clearing must DELETE the key, not store `undefined`: the slot is
            // optional, and `expand()`'s `has()` treats a supplied value — any
            // supplied value — as present.
            const { [name]: _drop, ...rest } = params;
            onParams(next === undefined ? rest : { ...params, [name]: next });
          }}
        />
      ))}
      <UnitHints template={template} params={params} />
      <InertSlots template={template} />
    </section>
  );
}

/**
 * 展開來源 — which card produced which part of the merged behaviour.
 *
 * This is the panel that makes「第二張卡真的有被吃進去」visible instead of a
 * matter of faith. A card whose row shows no owned key and no effect is a card
 * the expander dropped.
 */
function OriginTable({ trace }: { trace: ExpandStackTrace }) {
  return (
    <div className="forge-origin" data-field="stack.origin">
      <h4>展開來源（哪一格來自哪張卡）</h4>
      <table className="forge-diff">
        <tbody>
          {trace.keys.map((k) => (
            <tr key={k.key} data-field={`stack.origin.key.${k.key}`}>
              <td>{k.key}</td>
              <td>{JSON.stringify(k.winner.value)}</td>
              <td>
                第 {k.winner.cardIndex + 1} 張 · {k.winner.templateId}
                {k.shadowed.length > 0 ? (
                  <span className="forge-shadowed">
                    {" "}
                    （蓋掉第 {k.shadowed.map((s) => s.cardIndex + 1).join("、")} 張的{" "}
                    {k.shadowed.map((s) => JSON.stringify(s.value)).join("、")}）
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
          {trace.effects.map((e) => (
            <tr key={`effect-${e.index}`} data-field={`stack.origin.effect.${e.index}`}>
              <td>effects[{e.index}]</td>
              <td>{e.kind}</td>
              <td>
                第 {e.cardIndex + 1} 張 · {e.templateId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="forge-origin-cards">
        {trace.cards.map((c) => (
          <li key={c.index} data-field={`stack.origin.card.${c.index}`}>
            第 {c.index + 1} 張 {c.templateId}：效果 {c.effectCount} 個 · 觸發 {c.hookCount} 條 ·
            佔用欄位 {c.owns.length === 0 ? "（無）" : c.owns.join("、")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The collisions, named. Empty renders nothing at all. */
function ConflictPanel({ trace, blocks }: { trace: ExpandStackTrace; blocks: boolean }) {
  if (trace.conflicts.length === 0) return null;
  return (
    <div className={blocks ? "forge-degrade-panel error" : "forge-degrade-panel"} role="note">
      <h4 data-field="stack.conflicts">
        {blocks
          ? `有 ${trace.conflicts.length} 個欄位衝突未解決，無法寫回`
          : `有 ${trace.conflicts.length} 個欄位衝突，已依「後蓋前」處理`}
      </h4>
      <ul>
        {trace.conflicts.map((c, i) => (
          <li key={`${c.key}-${i}`} data-field={`stack.conflict.${i}`}>
            <b>{c.key}</b>：採用第 {c.kept.cardIndex + 1} 張（{c.kept.templateId}）的{" "}
            {JSON.stringify(c.kept.value)}，捨棄第 {c.dropped.cardIndex + 1} 張（
            {c.dropped.templateId}）的 {JSON.stringify(c.dropped.value)}
          </li>
        ))}
      </ul>
      {blocks ? (
        <p className="forge-note">
          解法：調整卡片順序、清掉其中一張卡的那個參數、移除卡片，或把「衝突處理」改成「後蓋前」。
        </p>
      ) : null}
    </div>
  );
}

/**
 * wc3u / wc3h slots show what the sim will actually receive, in sim units.
 * The two rulers are DIFFERENT (planar vs altitude — see GGD_APEX_PER_WC3), so
 * the hint names the unit it converted from; otherwise an author reading
 * "600 = 11" for a radius and "600 = 2.4" for an apex would think one is a bug.
 */
function UnitHints({
  template,
  params,
}: {
  template: TemplateDoc;
  params: Record<string, unknown>;
}) {
  const rows = Object.entries(template.params)
    .filter(([, slot]) => slot.unit === "wc3u" || slot.unit === "wc3h")
    .map(([name, slot]) => ({ name, unit: slot.unit, value: params[name] }))
    .filter((r) => typeof r.value === "number");
  if (rows.length === 0) return null;
  return (
    <p className="forge-note">
      單位換算：
      {rows.map((r) => (
        <span key={r.name} className="forge-unit">
          {" "}
          {r.name} {String(r.value)} {r.unit} ={" "}
          {r.unit === "wc3h" ? toApex(r.value as number) : toLen(r.value as number)} sim u
        </span>
      ))}
    </p>
  );
}

/**
 * Slots the expander reads but the sim cannot honour. Saying so here is the
 * whole point: without it the designer types a measured JASS number into a live
 * form field and the game ignores it, with nothing anywhere reporting that.
 * paramsSchema.test.ts probes every slot and fails if this list drifts.
 */
function InertSlots({ template }: { template: TemplateDoc }) {
  const inert = Object.entries(template.params).filter(([, s]) => s.inert !== undefined);
  if (inert.length === 0) return null;
  return (
    <div className="forge-degrade-panel">
      <h4>以下欄位本版不生效</h4>
      <ul>
        {inert.map(([name, slot]) => (
          <li key={name}>
            <b>{name}</b>：{slot.inert}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpansionSummary({ result }: { result: ReturnType<typeof expandStack>["result"] }) {
  return (
    <dl className="forge-expansion">
      <div>
        <dt>castType</dt>
        <dd data-field="stack.summary.castType">{result.castType}</dd>
      </div>
      {result.radius !== undefined ? (
        <div>
          <dt>radius</dt>
          <dd data-field="stack.summary.radius">{result.radius}</dd>
        </div>
      ) : null}
      {result.castTimeSec !== undefined ? (
        <div>
          <dt>castTimeSec</dt>
          <dd data-field="stack.summary.castTimeSec">{result.castTimeSec}</dd>
        </div>
      ) : null}
      <div>
        <dt>effects</dt>
        <dd data-field="stack.summary.effects">
          {result.effects.length === 0 ? "（passive，效果掛在 hooks）" : result.effects.length}
        </dd>
      </div>
      {result.passive ? (
        <div>
          <dt>passive hooks</dt>
          <dd data-field="stack.summary.hooks">
            {result.passive.ranks[0]?.hooks?.map((h) => h.on).join(", ") ?? "—"}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function ConfirmDialog({
  plan,
  notes,
  signedOff,
  onSign,
  onCancel,
  onConfirm,
}: {
  plan: ForgePlan;
  notes: ReturnType<typeof degradeNotes>;
  signedOff: boolean;
  onSign(v: boolean): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <div className="forge-modal" role="dialog" aria-modal="true">
      <div className="forge-modal-body">
        <h2>鑄技工坊 · 確認寫回</h2>
        {plan.steps.map((s) => (
          <section key={`${s.collection}/${s.id}/${s.reason}`}>
            <h4>
              {s.label}
              {s.reason === "mirror" ? <span className="forge-chip">鏡像</span> : null}
            </h4>
            {s.changes.length === 0 ? (
              <p className="forge-note">無變更</p>
            ) : (
              <table className="forge-diff">
                <tbody>
                  {s.changes.map((c) => (
                    <tr key={c.path}>
                      <td>{c.path}</td>
                      <td className="before">{c.before}</td>
                      <td className="after">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
        <p className="forge-note">
          寫入採用<b>行編輯</b>：只置換這些成員的位元組，檔案其餘部分（包含 Python 匯出的
          <code>350.0</code> 這種浮點格式）完全不動。
        </p>
        {/*
          擋下存檔的理由（不是降級告知）。模板 ref 指不到東西的文件是合法的 Zod，
          所以 /validate 會放行，而載入器要到下一次 registerAll 才發現 —— 那時候
          這支技能已經是「沒有效果」了。規則要在編輯的當下跑，訊息也要在這裡出現。
        */}
        {plan.blockers.length > 0 ? (
          <section className="forge-blockers" role="alert">
            <h4>⛔ 無法寫回</h4>
            <ul>
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {notes.length > 0 ? (
          <label className="forge-signoff">
            <input type="checkbox" checked={signedOff} onChange={(e) => onSign(e.target.checked)} />
            我知道上面 {notes.length} 項行為在本版會降級處理
          </label>
        ) : null}
        <div className="forge-modal-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            disabled={plan.blockers.length > 0 || (notes.length > 0 && !signedOff)}
            onClick={onConfirm}
          >
            確認寫回
          </button>
        </div>
      </div>
    </div>
  );
}

function useChampionDocs(): ChampionDoc[] {
  const { data } = useQuery({
    queryKey: ["preview-champions"],
    queryFn: async () => {
      const index = await api.index("champions");
      const docs = await Promise.all(index.entries.map((e) => api.doc("champions", e.id)));
      return docs
        .map((d) => zChampionDoc.safeParse(d))
        .filter((r) => r.success)
        .map((r) => (r as { success: true; data: ChampionDoc }).data);
    },
    staleTime: 10_000,
  });
  return data ?? [];
}

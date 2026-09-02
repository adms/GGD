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
 * The preview is the REAL sim and the REAL render bridge: `expandStack()` →
 * merge onto the host ability doc → IntentFrame through sandbox SimWorld → the
 * shipped `VfxSystem` in a dual-model CameraRig arena. The timeline and stage
 * share one playhead, so scrub/frame-step can never become a data-only fiction.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  paramsSchemaFor,
  defaultParamsFor,
  toLen,
  toApex,
  zAbilityDoc,
  DEFAULT_TEMPLATE_CONFLICT,
  TEMPLATE_STACK_MAX_CARDS,
  type TemplateDoc,
  type TemplateConflictPolicy,
  type AbilityTemplateCard,
  type AbilityTemplateBinding,
} from "@ggd/shared/content";
import {
  expandStack,
  denormalizeTemplateBinding,
  mergeExpansion,
  type ExpandStackTrace,
} from "@ggd/shared/content/templates/expand";
import { embeddedSlotOf } from "@ggd/shared/content/editModel";
import type { AbilityDef, ChampionDef, CoreAbilitySlot } from "@ggd/shared/sim";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import {
  Abilities as RuntimeAbilities,
  Champions as RuntimeChampions,
} from "@ggd/shared/sim/content/registry";
import { VfxScripts } from "@ggd/shared/content/registries";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { api, WRITES_ENABLED } from "../api/client";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { setIn, type ErrorMap } from "../store";
import { sameJson, useUndoHistory } from "../history";
import {
  createSimPreviewController,
  type CastPreviewTrace,
} from "../preview/PreviewController";
import { ensurePreviewContentReady } from "../preview/previewContent";
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
import { passivePresentationRules } from "../passivePresentationPrinciples";
import { PassivePresentationPanel } from "../PassivePresentationPanel";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";
import {
  TEMPLATE_STACK_DRAG_MIME,
  decodeTemplateStackDrag,
  encodeTemplateStackDrag,
  insertTemplateCard,
  moveTemplateCard,
} from "./stackDnd";
import { SimEventTimeline } from "./SimEventTimeline";
import { runtimePreviewDoc } from "./runtimePreviewDoc";
import { useChampionDocs } from "../preview/useChampionDocs";
import { VfxForgePreview } from "../vfx-forge/VfxForgePreview";
import {
  scheduleSimEvents,
  type ForgeAbility,
} from "../vfx-forge/model";

/**
 * One authoritative Sim controller. Rendering consumes its emitted trace via
 * the same VfxSystem used by the shipped game.
 */
const controller = createSimPreviewController();
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const SIM_TICK_MS = 1000 / 30;

/** 衝突處理 labels — the wording an operator has to be able to choose between. */
const CONFLICT_LABELS: Readonly<Record<TemplateConflictPolicy, string>> = {
  reject: "重複即拒 — 兩張卡填同一格但值不同時，停下來讓我處理",
  lastWins: "後蓋前 — 讓後面的卡片覆蓋前面的值",
};

interface ForgeDraft {
  cards: AbilityTemplateCard[];
  onConflict: TemplateConflictPolicy;
  layers: VfxLayerDraft[] | null;
}

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
  const editHistory = useUndoHistory<ForgeDraft>({
    cards: [{ ref: template.id, params: defaultParamsFor(template) }],
    onConflict: DEFAULT_TEMPLATE_CONFLICT,
    // `null` = 還沒從 host doc 種下去（技能還沒選，或正在載）。
    layers: null,
  }, sameJson);
  const { cards, onConflict, layers } = editHistory.value;
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<ForgePlan | null>(null);
  const [signedOff, setSignedOff] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  /** 最近一次【真的放一次】之後，sim 真的發生了什麼（GH#174）。 */
  const [trace, setTrace] = useState<CastPreviewTrace | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** 只有操作者親手試放過的同一支技能，後續改參數才會所見即所得地自動重播。 */
  const auditionedAbilityRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof globalThis.addEventListener !== "function") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) { event.preventDefault(); editHistory.redo(); }
      else if (key === "z") { event.preventDefault(); editHistory.undo(); }
      else if (key === "y") { event.preventDefault(); editHistory.redo(); }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [editHistory.redo, editHistory.undo]);

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
  const visibleAddable = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (q === "") return addable;
    return addable.filter((t) => `${t.name} ${t.id} ${t.family}`.toLowerCase().includes(q));
  }, [addable, paletteQuery]);

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
  const {
    champions,
    isLoading: championsLoading,
    error: championsError,
  } = useChampionDocs();
  const previewContent = useQuery({
    queryKey: ["preview-runtime-content"],
    queryFn: ensurePreviewContentReady,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

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
  const abilitySource = useQuery({
    queryKey: ["forge", "editor-source", "abilities", abilityId],
    queryFn: () => api.editorSource("abilities", abilityId),
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
    () => denormalizeTemplateBinding(cards, onConflict) as AbilityTemplateBinding,
    [cards, onConflict],
  );

  // 換技能就重新種特效層 —— 種子是那支技能**現在真的在播**的東西，不是空白。
  const hostId = host.data ? String(host.data["id"]) : "";
  const seededFor = useRef<string>("");
  useEffect(() => {
    if (hostId === "" || seededFor.current === hostId) return;
    seededFor.current = hostId;
    editHistory.reset({ ...editHistory.value, layers: draftsFromDoc(host.data ?? null) });
  }, [hostId, host.data, editHistory.reset, editHistory.value]);

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
  const passiveRules = useMemo(() => passivePresentationRules(after ?? host.data), [after, host.data]);

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
    if (!after || !previewContent.data || !expansion.ok) return null;
    const id = String(after["id"] ?? "") as AbilityId;
    const registeredAbility = RuntimeAbilities.tryGet(id);
    if (!registeredAbility) {
      return { error: `正式 Runtime 註冊表找不到技能 ${id}` } as const;
    }
    const runtimeDoc = runtimePreviewDoc(
      after,
      registeredAbility as unknown as Record<string, unknown>,
      expansion.value.result,
      binding,
    );
    const parsed = zAbilityDoc.safeParse(runtimeDoc);
    if (!parsed.success) return { error: "展開結果尚未通過 zAbilityDoc 校驗" } as const;
    const ability = parsed.data as unknown as AbilityDef;
    const owner = champions.find((c) =>
      (["Q", "W", "E", "R"] as const).some((s) => c.abilities[s].id === ability.id),
    );
    if (!owner || ability.slot === "EX") return { lines: null } as const;
    const runtimeOwner = RuntimeChampions.tryGet(owner.id as ChampionId);
    if (!runtimeOwner) {
      return { error: `正式 Runtime 註冊表找不到英雄 ${owner.id}` } as const;
    }
    const champ: ChampionDef = {
      ...runtimeOwner,
      abilities: { ...runtimeOwner.abilities, [ability.slot]: ability },
    };
    try {
      return {
        ...controller.previewAbility(champ, ability.slot as CoreAbilitySlot, { level: 1 }),
        // ⭐ 把「要對誰、放哪一格」一起帶出來 —— 第 3 步的【真的放一次】就是拿
        //    這兩個去跑 `castAbility`。⛔ 不在按鈕的 onClick 裡把上面這段找主人的
        //    邏輯再抄一次：兩份會分岔，而分岔的那一天畫面上的那一發就不是這一發。
        champ,
        slot: ability.slot as CoreAbilitySlot,
      };
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, [after, binding, champions, expansion, previewContent.data]);

  const runCurrentCast = useCallback((remember: boolean): void => {
    if (!preview || !("champ" in preview)) return;
    if (remember) auditionedAbilityRef.current = abilityId;
    try {
      const next = controller.castAbility(preview.champ, preview.slot, { level: 18 });
      setTrace(next);
      setPlayheadMs(0);
      setPlaying(next.accepted);
      setStatus(null);
    } catch (e) {
      setTrace(null);
      setPlaying(false);
      setStatus(`試放失敗：${String(e)}`);
    }
  }, [abilityId, preview]);

  useEffect(() => {
    auditionedAbilityRef.current = null;
    setTrace(null);
    setPlayheadMs(0);
    setPlaying(false);
  }, [abilityId]);

  // WYSIWYG：先手動試放一次取得意圖後，修改模板／特效參數便用真 Sim 立即重播。
  useEffect(() => {
    if (auditionedAbilityRef.current !== abilityId) return;
    runCurrentCast(false);
  }, [abilityId, after, runCurrentCast]);

  const stageAbility = useMemo<ForgeAbility | null>(() => {
    if (!preview || !("champ" in preview)) return null;
    return preview.champ.abilities[preview.slot] as ForgeAbility;
  }, [preview]);
  const schedule = useMemo(
    () => trace && stageAbility ? scheduleSimEvents(trace.events, stageAbility.id) : [],
    [stageAbility, trace],
  );
  const timelineEvents = useMemo(
    () => schedule.map(({ atMs, event }) => ({
      type: event.type,
      tick: Math.round(atMs / SIM_TICK_MS),
      data: event.data,
    })),
    [schedule],
  );
  const previewDurationMs = useMemo(
    () => Math.max(1000, schedule.reduce((last, event) => Math.max(last, event.atMs), 0) + 1000),
    [schedule],
  );
  const stageScript = useMemo<VfxScriptDoc | null>(() => {
    if (!stageAbility) return null;
    return VfxScripts.tryGet(stageAbility.id) ?? {
      id: stageAbility.id,
      schema: "vfx-script@1",
      abilityId: stageAbility.id,
      segments: [],
    };
  }, [previewContent.data, stageAbility]);
  const targetChampion = useMemo(
    () => (champions.find((champion) => champion.id !== (preview && "champ" in preview ? preview.champ.id : ""))
      ?? (preview && "champ" in preview ? preview.champ : null)) as ChampionDef | null,
    [champions, preview],
  );

  const championDoc = useMemo(() => {
    if (!abilityId) return null;
    const owner = champions.find(
      (c) => embeddedSlotOf(c as unknown as Record<string, unknown>, abilityId) !== null,
    );
    return (owner as unknown as Record<string, unknown>) ?? null;
  }, [champions, abilityId]);
  const championId = championDoc && typeof championDoc["id"] === "string"
    ? championDoc["id"]
    : "";
  const championSource = useQuery({
    queryKey: ["forge", "editor-source", "champions", championId],
    queryFn: () => api.editorSource("champions", championId),
    enabled: championId !== "",
  });

  // ---- stack editing ------------------------------------------------------
  const setCardParams = (i: number, next: Record<string, unknown>): void =>
    editHistory.commit((draft) => ({
      ...draft,
      cards: draft.cards.map((c, j) => (j === i ? { ...c, params: next } : c)),
    }));

  const addCard = (id: string): void => {
    const t = docs.get(id);
    if (t === undefined || cards.length >= TEMPLATE_STACK_MAX_CARDS) return;
    editHistory.commit((draft) => ({
      ...draft,
      cards: [...draft.cards, { ref: t.id, params: defaultParamsFor(t) }],
    }));
  };

  const insertCard = (id: string, at: number): void => {
    const t = docs.get(id);
    if (t === undefined || t.status !== "enabled") return;
    editHistory.commit((draft) => ({
      ...draft,
      cards: insertTemplateCard(
        draft.cards,
        { ref: t.id, params: defaultParamsFor(t) },
        at,
        TEMPLATE_STACK_MAX_CARDS,
      ),
    }));
  };

  const removeCard = (i: number): void =>
    // The floor is 1: an EMPTY stack is a doc that claims to be templated and
    // expands to nothing, which is the silent no-op the Forge exists to prevent.
    editHistory.commit((draft) => ({
      ...draft,
      cards: draft.cards.length <= 1 ? draft.cards : draft.cards.filter((_, j) => j !== i),
    }));

  const moveCard = (i: number, delta: number): void =>
    editHistory.commit((draft) => {
      const cs = draft.cards;
      const j = i + delta;
      if (j < 0 || j >= cs.length) return draft;
      const next = cs.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...draft, cards: next };
    });

  const dropCard = (event: DragEvent<HTMLElement>, at: number): void => {
    event.preventDefault();
    setDragOverSlot(null);
    const payload = decodeTemplateStackDrag(event.dataTransfer.getData(TEMPLATE_STACK_DRAG_MIME));
    if (!payload) return;
    if (payload.kind === "catalog-template") {
      insertCard(payload.templateId, at);
      return;
    }
    editHistory.commit((draft) => ({
      ...draft,
      cards: moveTemplateCard(draft.cards, payload.index, at),
    }));
  };

  const buildPlan = () => {
    if (!host.data || !after) return;
    setPlan(planForgeWrite(host.data, after, championDoc, docs, {
      ability: abilitySource.data ?? null,
      champion: championSource.data ?? null,
    }));
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
        <div className="forge-history">
          <button type="button" disabled={!editHistory.canUndo} onClick={editHistory.undo} title="復原（Ctrl/Cmd+Z）">↶ 復原</button>
          <button type="button" disabled={!editHistory.canRedo} onClick={editHistory.redo} title="重做（Ctrl/Cmd+Shift+Z）">↷ 重做</button>
        </div>
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

          <details className="forge-template-palette" open>
            <summary>模板資源池 · 拖入效果鏈或按一下加入</summary>
            <input
              aria-label="搜尋模板資源"
              placeholder="搜尋名稱、id、family"
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
            />
            <div className="forge-template-palette-items">
              {visibleAddable.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  draggable={cards.length < TEMPLATE_STACK_MAX_CARDS}
                  disabled={cards.length >= TEMPLATE_STACK_MAX_CARDS}
                  title={`拖入效果鏈，或按一下加入：${t.description}`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      TEMPLATE_STACK_DRAG_MIME,
                      encodeTemplateStackDrag({ kind: "catalog-template", templateId: t.id }),
                    );
                  }}
                  onClick={() => addCard(t.id)}
                >
                  <b>{t.name}</b><code>{t.family}</code>
                </button>
              ))}
            </div>
          </details>

          <label className="forge-conflict">
            <span>衝突處理</span>
            <select
              data-field="stack.onConflict"
              aria-label="衝突處理"
              value={onConflict}
              onChange={(e) => editHistory.commit((draft) => ({
                ...draft,
                onConflict: e.target.value as TemplateConflictPolicy,
              }))}
            >
              {(Object.keys(CONFLICT_LABELS) as TemplateConflictPolicy[]).map((k) => (
                <option key={k} value={k}>
                  {CONFLICT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <div className="forge-stack-canvas" aria-label="效果模板成品鏈">
            {resolved.map((r, i) => (
              <div key={`${r.card.ref}-${i}`} className="forge-stack-slot">
                <StackDropZone
                  slot={i}
                  active={dragOverSlot === i}
                  onEnter={setDragOverSlot}
                  onDrop={dropCard}
                />
                <CardPanel
                  index={i}
                  total={resolved.length}
                  template={r.template}
                  params={r.card.params}
                  errors={paramErrors[i] ?? {}}
                  onParams={(next) => setCardParams(i, next)}
                  onMove={(d) => moveCard(i, d)}
                  onRemove={() => removeCard(i)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      TEMPLATE_STACK_DRAG_MIME,
                      encodeTemplateStackDrag({ kind: "stack-card", index: i }),
                    );
                  }}
                />
              </div>
            ))}
            <StackDropZone
              slot={resolved.length}
              active={dragOverSlot === resolved.length}
              onEnter={setDragOverSlot}
              onDrop={dropCard}
            />
          </div>

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
              onPatch={(i, patch) => editHistory.commit((draft) => ({
                ...draft,
                layers: draft.layers ? patchLayer(draft.layers, i, patch) : draft.layers,
              }))}
              onMove={(i, d) => editHistory.commit((draft) => ({
                ...draft,
                layers: draft.layers ? moveLayer(draft.layers, i, d) : draft.layers,
              }))}
              onRemove={(i) => editHistory.commit((draft) => ({
                ...draft,
                layers: draft.layers ? removeLayer(draft.layers, i) : draft.layers,
              }))}
              onAdd={() => editHistory.commit((draft) => ({
                ...draft,
                layers: draft.layers ? addLayer(draft.layers) : draft.layers,
              }))}
            />
          ) : null}
          <PassivePresentationPanel rules={passiveRules} />
        </section>

        <section className="forge-col">
          <h3>3. 即時試放</h3>
          <p className="forge-note">
            數值來自真正的 sim（sandbox SimWorld + 真 statPipeline + 真 resolveScaling）。
            按<b>真的放一次</b>會把這一發包成 <code>IntentFrame</code> 丟進{" "}
            <code>world.step()</code> —— 走的是玩家那條路，
            所以「編輯器放得出來、遊戲裡按下去沒反應」不可能發生。
          </p>
          <p className="forge-note">
            舞台直接重用遊戲的 <b>CameraRig、ArenaGround、雙方 3D Model 與 VfxSystem</b>；
            預告圈、投射物、命中、腳本演出與清理上限全部走正式消費端。
          </p>
          {previewContent.error ? (
            <p className="error">Runtime 內容圖載入失敗：{String(previewContent.error)}</p>
          ) : stageAbility && stageScript && preview && "champ" in preview ? (
            <VfxForgePreview
              script={stageScript}
              ability={stageAbility}
              schedule={schedule}
              durationMs={previewDurationMs}
              playheadMs={playheadMs}
              playing={playing}
              caster={preview.champ}
              target={targetChampion}
              mode="runtime"
              onTime={(ms) => setPlayheadMs(Math.min(previewDurationMs, ms))}
              onStop={() => setPlaying(false)}
            />
          ) : (
            <div className="preview3d-canvas forge-runtime-loading">載入正式 Runtime 舞台…</div>
          )}
          {/* `preview3d-controls` 是既有的 flex 列樣式 —— ⛔ 不為了一顆按鈕新增一條 CSS。 */}
          <div className="preview3d-controls">
            <button
              type="button"
              data-field="stack.cast"
              disabled={!preview || !("champ" in preview)}
              onClick={() => runCurrentCast(true)}
            >
              真的放一次
            </button>
            {trace ? (
              <span className={trace.accepted ? "forge-note" : "error"}>
                {trace.accepted
                  ? `sim 收下了 · 魔力 ${fmt(trace.manaBefore)} → ${fmt(trace.manaAfter)} · 冷卻 ${trace.cooldownTicks} tick · 事件 ${trace.events.length} 筆`
                  : `sim 拒絕了：${trace.reason ?? "沒有 castRejected，也沒有 abilityCast"}`}
              </span>
            ) : null}
          </div>
          {trace ? (
            <SimEventTimeline
              events={timelineEvents}
              durationMs={previewDurationMs}
              playheadMs={playheadMs}
              playing={playing}
              onSeek={(ms) => { setPlaying(false); setPlayheadMs(ms); }}
              onTogglePlay={() => setPlaying((value) => !value)}
            />
          ) : null}
          {!expansion.ok ? <p className="error">展開失敗：{expansion.error}</p> : null}
          {expansion.ok ? (
            <>
              <EffectChain trace={expansion.value.trace} />
              <ConflictPanel trace={expansion.value.trace} blocks={conflictBlocks} />
              <ExpansionSummary result={expansion.value.result} />
              <OriginTable trace={expansion.value.trace} />
            </>
          ) : null}
          {championsLoading ? <p className="forge-note">正在載入技能所屬英雄…</p> : null}
          {championsError ? <p className="error">英雄索引讀取失敗：{championsError.message}</p> : null}
          {preview && "error" in preview ? <p className="error">{preview.error}</p> : null}
          {!championsLoading && !championsError && preview && "lines" in preview && preview.lines === null ? (
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
  onDragStart,
}: {
  index: number;
  total: number;
  template: TemplateDoc;
  params: Record<string, unknown>;
  errors: ErrorMap;
  onParams(next: Record<string, unknown>): void;
  onMove(delta: number): void;
  onRemove(): void;
  onDragStart(event: DragEvent<HTMLButtonElement>): void;
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
        <button
          type="button"
          className="forge-card-drag"
          draggable
          aria-label={`拖曳第 ${index + 1} 張模板卡`}
          title="拖曳重排"
          onDragStart={onDragStart}
        >
          ⠿
        </button>
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

function StackDropZone({
  slot,
  active,
  onEnter,
  onDrop,
}: {
  slot: number;
  active: boolean;
  onEnter(slot: number | null): void;
  onDrop(event: DragEvent<HTMLElement>, slot: number): void;
}) {
  return (
    <div
      className={`forge-stack-drop${active ? " active" : ""}`}
      data-field={`stack.drop.${slot}`}
      aria-label={`放到效果鏈第 ${slot + 1} 格`}
      onDragEnter={(event) => { event.preventDefault(); onEnter(slot); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onEnter(null);
      }}
      onDrop={(event) => onDrop(event, slot)}
    >
      <span>拖到這裡</span>
    </div>
  );
}

/** Visualises template products in merge order; it is deliberately not a fake time axis. */
function EffectChain({ trace }: { trace: ExpandStackTrace }) {
  return (
    <section className="forge-effect-chain" aria-label="效果模板成品鏈預覽">
      <h4>效果模板成品鏈</h4>
      <p className="forge-note">由左至右是展開與合併順序；時間與觸發時機仍由卡片產出的 effect / hook 決定。</p>
      <div className="forge-effect-chain-row">
        {trace.cards.map((card, i) => {
          const effects = trace.effects.filter((effect) => effect.cardIndex === card.index);
          return (
            <div className="forge-effect-chain-part" key={card.index}>
              {i > 0 ? <span className="forge-effect-chain-arrow" aria-hidden="true">→</span> : null}
              <article className="forge-effect-chain-node" data-card={card.index}>
                <b>第 {card.index + 1} 張 · {card.family}</b>
                <code>{card.templateId}</code>
                <span>{effects.length > 0 ? effects.map((effect) => effect.kind).join(" → ") : "無頂層 effect"}</span>
                <small>effect {card.effectCount} · hook {card.hookCount} · mark {card.markCount}</small>
              </article>
            </div>
          );
        })}
      </div>
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

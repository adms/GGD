/**
 * 鑄技工坊 — 填參數 → 即時試放 → 一鍵寫回 (design §2.3 steps 2-4).
 *
 * ZERO new form code: the param form is `walkZod(paramsSchemaFor(tpl))` fed to
 * the SAME `FormRenderer` and widget set every other collection uses. That works
 * because `paramsSchemaFor` (shared, next to `expand`) turns the template's DATA
 * slots into a real Zod object, so ranges become clamped NumberFields and enums
 * become EnumSelects without this file knowing anything about widgets.
 *
 * The preview is the REAL sim: `expand()` → merge onto the host ability doc →
 * `previewAbility` on a sandbox SimWorld through the real statPipeline and
 * resolveScaling. It is NOT a 3D cast — `PreviewController.mount()` is still a
 * renderless stub — and the UI says so rather than implying a shot that does not
 * happen.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  expand,
  mergeExpansion,
  paramsSchemaFor,
  defaultParamsFor,
  toLen,
  toApex,
  zAbilityDoc,
  zChampionDoc,
  type TemplateDoc,
  type ChampionDoc,
} from "@ggd/shared/content";
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
import { ConditionEditor } from "./ConditionEditor";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";

const controller = createSimPreviewController();
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function ForgeStudio({ template, onBack }: { template: TemplateDoc; onBack(): void }) {
  const [abilityId, setAbilityId] = useState<string>("");
  const [params, setParams] = useState<Record<string, unknown>>(() => defaultParamsFor(template));
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<ForgePlan | null>(null);
  const [signedOff, setSignedOff] = useState(false);

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
   * so `paramErrors` still reports a bad condition on the same path.
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
  const notes = degradeNotes(template.requires);
  const satisfied = satisfiedCaps(template.requires);
  const badge = badgeFor(template.gapScore);

  const abilities = useQuery({
    queryKey: ["forge", "abilities"],
    queryFn: () => api.index("abilities"),
    staleTime: 30_000,
  });
  const champions = useChampionDocs();

  const host = useQuery({
    queryKey: ["forge", "ability", abilityId],
    queryFn: () => api.doc<Record<string, unknown>>("abilities", abilityId),
    enabled: abilityId !== "",
  });

  // ---- the expansion. Same pure function the registry runs at boot. ----
  const expansion = useMemo(() => {
    try {
      return { ok: true as const, value: expand(template, params) };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, [template, params]);

  const after = useMemo(() => {
    if (!host.data || !expansion.ok) return null;
    const withTemplate = {
      ...host.data,
      template: { ref: template.id, params },
    };
    return mergeExpansion(withTemplate, expansion.value);
  }, [host.data, expansion, template.id, params]);

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

  const paramErrors: ErrorMap = useMemo(() => {
    const res = paramsSchema.safeParse(params);
    if (res.success) return {};
    const map: ErrorMap = {};
    for (const i of res.error.issues) (map[i.path.join(".")] ??= []).push(i.message);
    return map;
  }, [paramsSchema, params]);

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
    const owner = champions.find((c) => embeddedSlotOf(c as unknown as Record<string, unknown>, abilityId) !== null);
    return (owner as unknown as Record<string, unknown>) ?? null;
  }, [champions, abilityId]);

  const buildPlan = () => {
    if (!host.data || !after) return;
    setPlan(planForgeWrite(host.data, after, championDoc));
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
      const res = await runForgeWrite(plan, after, championAfter);
      setStatus(`已寫回 ${res.wrote.join(" + ")} · contentVersion ${res.contentVersion}`);
      setPlan(null);
    } catch (e) {
      setStatus(`寫回失敗: ${String(e)}`);
    }
  };

  const blocked = Object.keys(docErrors).length > 0 || Object.keys(paramErrors).length > 0;

  return (
    <div className="forge-studio">
      <header className="forge-head">
        <button type="button" className="forge-back" onClick={onBack}>
          ← 回模板選擇
        </button>
        <h1>
          鑄技工坊 · {template.name}
          <span className={`forge-badge ${badge.tone}`}>{badge.label}</span>
        </h1>
        <p className="forge-sub">
          {template.description} · 範本 {template.exemplar.skill} (<code>{template.exemplar.jass}</code>)
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
          <select value={abilityId} onChange={(e) => setAbilityId(e.target.value)}>
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

          <h3>2. 填參數</h3>
          <p className="forge-note">預設值 = 範本技能的 JASS 實測值，不是憑空發明的數字。</p>
          <FormRenderer
            node={ui}
            value={params}
            dataPath=""
            errors={paramErrors}
            onChange={(path, value) =>
              setParams((p) => setIn(p, path, value) as Record<string, unknown>)
            }
          />
          {conditionSlots.map((name) => (
            <ConditionEditor
              key={name}
              label={`${name} · 觸發條件`}
              value={params[name] as EffectCondition | undefined}
              onChange={(next) =>
                setParams((p) => {
                  // Clearing must DELETE the key, not store `undefined`: the
                  // slot is optional, and `expand()`'s `has()` treats a supplied
                  // value — any supplied value — as present.
                  const { [name]: _drop, ...rest } = p;
                  return next === undefined ? rest : { ...p, [name]: next };
                })
              }
            />
          ))}
          <UnitHints template={template} params={params} />
          <InertSlots template={template} />
        </section>

        <section className="forge-col">
          <h3>3. 即時試放</h3>
          <p className="forge-note">
            數值來自真正的 sim（sandbox SimWorld + 真 statPipeline + 真 resolveScaling）。
            這是<b>數值/效果的即時試放</b>，不是 3D 放招 —— 3D 預覽仍是 P2。
          </p>
          {!expansion.ok ? <p className="error">展開失敗：{expansion.error}</p> : null}
          {expansion.ok ? <ExpansionSummary result={expansion.value} /> : null}
          {preview && "error" in preview ? <p className="error">{preview.error}</p> : null}
          {preview && "lines" in preview && preview.lines === null ? (
            <p className="forge-note">這支技能沒有英雄持有，無法算等級縮放。</p>
          ) : null}
          {preview && "lines" in preview && preview.lines ? (
            <ul className="forge-lines">
              {preview.lines.map((l, i) => (
                <li key={i} style={{ marginLeft: l.depth * 12 }}>
                  <code>{l.kind}</code> {l.summary}
                  {l.perRank ? <span className="perrank"> [{l.perRank.map(fmt).join(" / ")}]</span> : null}
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
            disabled={!after || blocked || !WRITES_ENABLED}
            onClick={buildPlan}
          >
            預覽寫入差異
          </button>
          {blocked && after ? <p className="error">展開結果未通過校驗，無法寫回。</p> : null}
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
      <h3>以下欄位本版不生效</h3>
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

function ExpansionSummary({ result }: { result: ReturnType<typeof expand> }) {
  return (
    <dl className="forge-expansion">
      <div>
        <dt>castType</dt>
        <dd>{result.castType}</dd>
      </div>
      {result.radius !== undefined ? (
        <div>
          <dt>radius</dt>
          <dd>{result.radius}</dd>
        </div>
      ) : null}
      {result.castTimeSec !== undefined ? (
        <div>
          <dt>castTimeSec</dt>
          <dd>{result.castTimeSec}</dd>
        </div>
      ) : null}
      <div>
        <dt>effects</dt>
        <dd>{result.effects.length === 0 ? "（passive，效果掛在 hooks）" : result.effects.length}</dd>
      </div>
      {result.passive ? (
        <div>
          <dt>passive hooks</dt>
          <dd>{result.passive.ranks[0]?.hooks?.map((h) => h.on).join(", ") ?? "—"}</dd>
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
          <button type="button" disabled={notes.length > 0 && !signedOff} onClick={onConfirm}>
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

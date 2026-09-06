import { defaultAbilityMaxRank, defaultParamsFor, paramsSchemaFor, zAbilityDef, zHeroSlotPlans, TEMPLATE_STACK_MAX_CARDS, type HeroProject, type HeroSlot, type TemplateDoc } from "@ggd/shared/content";
import { FormRenderer } from "../form/FormRenderer";
import { ConditionEditor } from "../forge/ConditionEditor";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";
import { walkZod } from "../form/walk";
import { templateParamDecision, templateSelectionDecision } from "../forge/typeCatalog";
import type { ErrorMap } from "../store";
import { editHeroProject, fieldOwner, moveHeroProduct, replaceHeroProducts, setHeroFieldOwner } from "./projectModel";
import { createRuntimeResolver } from "@ggd/shared/content/runtimeResolver";
import { forEachApRatio } from "@ggd/shared/content/apCoefficient";
import { resolveTemplateExpansion } from "@ggd/shared/content/templates/resolve";

// Share Main's exact schemas, including recursive effects and refinements.
const overrideSchema = zAbilityDef.pick({ rangeTier: true, radiusTier: true, cooldownTier: true, cooldownShape: true, manaCostTier: true, castTimeTier: true, effects: true });
const overrideNode = walkZod(overrideSchema);
const apFormulaReason = "AP 係數由遊戲公式計算；請調整傷害、冷卻、吟唱、距離或條件級距，並查看實際結果";

/** Use Main's ratio visitor; only the AP coefficient is controlled, not AD or the ratio's condition. */
function protectApRatios(value: Record<string, unknown>, prefix: string, reasons: Map<string, string>) {
  const ratios = new Set<Record<string, unknown>>();
  forEachApRatio({ effects: [value] }, (_node, ratio) => { if (typeof ratio.coeff === "number") ratios.add(ratio); });
  const visit = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object") return;
    if (ratios.has(node as Record<string, unknown>)) reasons.set(`${path}.coeff`, apFormulaReason);
    for (const [key, child] of Object.entries(node)) visit(child, `${path}.${key}`);
  };
  visit(value, prefix);
}

export function HeroSlotEditor({ project, slot, templates, configs = [], errors, onChange }: {
  project: HeroProject; slot: HeroSlot; templates: readonly TemplateDoc[]; configs?: readonly { schema?: string; [key: string]: unknown }[]; errors: ErrorMap; onChange(project: HeroProject): void;
}) {
  const plan = project.acceptedPlan!.slots[slot];
  const prefix = `acceptedPlan.slots.${slot}`;
  const set = (path: string, value: unknown) => onChange(editHeroProject(project, "skills", path, value));
  const locked = (path: string) => fieldOwner(project, "skills", path) === "locked";
  const lock = (path: string) => <button type="button" onClick={() => onChange(setHeroFieldOwner(project, "skills", path, locked(path) ? "manual" : "locked"))}>{locked(path) ? "解鎖" : "鎖定"}</button>;
  const productPrefix = `${prefix}.products`;
  const maxRank = plan.maxRank ?? defaultAbilityMaxRank(slot);
  const supportedRank = defaultAbilityMaxRank(slot);
  const apFormulaEnabled = createRuntimeResolver(new Map(), configs).apCoeff.enabled;
  const overrideProtection = new Map<string, string>();
  if (apFormulaEnabled) protectApRatios(plan.abilityOverrides, `${prefix}.abilityOverrides`, overrideProtection);
  const tieredTuning = new Map([["range", "rangeTier"], ["cooldownSec", "cooldownTier"], ["manaCost", "manaCostTier"]]
    .flatMap(([key, tier]) => plan.abilityOverrides[tier!] === undefined ? [] : [[key!, "已使用下方級距設定；清除該級距後才能改固定值"] as const]));
  return <section className="hero-slot-editor">
    <h2>{slot} 技能</h2>
    <label>招式名稱<input value={plan.name} disabled={locked(`${prefix}.name`)} onChange={(event) => set(`${prefix}.name`, event.target.value)} /></label>{lock(`${prefix}.name`)}
    <label>完整說明與台詞<textarea rows={4} value={plan.purpose} disabled={locked(`${prefix}.purpose`)} onChange={(event) => set(`${prefix}.purpose`, event.target.value)} /></label>{lock(`${prefix}.purpose`)}
    <p>槽位是裝備位置；主動或被動行為由模板機制決定。</p>
    <div className="hero-control-grid">
      <label>最高階級<select value={maxRank} disabled={locked(`${prefix}.maxRank`)} onChange={(event) => set(`${prefix}.maxRank`, Number(event.target.value))}>
        {maxRank !== supportedRank ? <option value={maxRank} disabled>{maxRank}（舊值，尚未支援）</option> : null}
        <option value={supportedRank}>{supportedRank}</option>
      </select></label>{lock(`${prefix}.maxRank`)}
      {maxRank !== supportedRank ? <p role="alert">遊戲的 {slot} 目前支援 {supportedRank} 級；原值已保留，修正後才能投稿。</p> : null}
      <FormRenderer node={walkZod(zHeroSlotPlans.shape[slot].shape.tuning)} value={plan.tuning} dataPath={`${prefix}.tuning`} errors={errors} onChange={set} readOnlyReasons={tieredTuning} />
    </div>
    <details><summary>級距與追加效果</summary>
      <p>級距會套用目前遊戲設定。追加效果接在產品後執行；產品已包含同類效果，或只有被動而無法施放時，驗證會指出衝突。</p>
      {lock(`${prefix}.abilityOverrides`)}
      <fieldset disabled={locked(`${prefix}.abilityOverrides`)}>
        <FormRenderer node={overrideNode} value={plan.abilityOverrides} dataPath={`${prefix}.abilityOverrides`} errors={errors} onChange={set} readOnlyReasons={overrideProtection} />
      </fieldset>
    </details>
    <h3>技能產品鏈</h3>{lock(productPrefix)}
    <label>不同產品填入同一欄時<select value={plan.templateConflictPolicy} disabled={locked(productPrefix)} onChange={(event) => set(`${prefix}.templateConflictPolicy`, event.target.value)}>
      <option value="reject">停下來處理衝突</option><option value="lastWins">後面的產品覆寫前面</option>
    </select></label>
    <ol className="hero-products">{plan.products.map((product, index) => {
      const template = templates.find((candidate) => candidate.id === product.template.ref);
      const path = `${productPrefix}.${index}`;
      const hasLockedChild = Object.entries(project.sections.skills.fieldOwnership).some(([key, owner]) => owner === "locked" && (key === path || key.startsWith(`${path}.`)));
      if (!template) return <li key={product.instanceId} role="alert">找不到產品模板 {product.template.ref}；原始參數已保留。</li>;
      const params = { ...defaultParamsFor(template), ...product.template.params };
      const disabled = new Map(Object.keys(template.params).flatMap((name) => {
        const decision = templateParamDecision(template.id, name, "doc");
        const reason = locked(`${path}.template.params.${name}`) ? "此欄位已鎖定"
          : name === "castTimeSec" && plan.abilityOverrides.castTimeTier !== undefined ? "已使用下方吟唱級距；清除該級距後才能改固定秒數"
          : name === "apRatio" && apFormulaEnabled ? apFormulaReason
          : decision.reason;
        return reason ? [[name, reason] as const] : [];
      }));
      if (apFormulaEnabled) {
        const expanded = resolveTemplateExpansion({ template: { ref: template.id, params } }, new Map([[template.id, template]]));
        // Main's formula walks active effects. Pure passive-hook coefficients
        // remain literal and must not become disabled because their name is AP.
        if (expanded.ok && expanded.expansion.effects.length > 0 && !expanded.expansion.passive) protectApRatios(params, `${path}.template.params`, disabled);
      }
      const conditionNames = Object.keys(template.params).filter((name) => template.params[name]?.type === "condition");
      const paramNode = walkZod(paramsSchemaFor(template));
      const formNode = paramNode.kind === "object" ? { ...paramNode, fields: paramNode.fields.filter((field) => !conditionNames.includes(field.path)) } : paramNode;
      return <li key={product.instanceId}>
        <header><b>{index + 1}. {template.name}</b>{lock(path)}
          <button type="button" disabled={index === 0 || locked(productPrefix)} onClick={() => onChange(moveHeroProduct(project, slot, index, index - 1))}>上移</button>
          <button type="button" disabled={index === plan.products.length - 1 || locked(productPrefix)} onClick={() => onChange(moveHeroProduct(project, slot, index, index + 1))}>下移</button>
          <button type="button" disabled={plan.products.length === 1 || locked(path) || hasLockedChild} onClick={() => onChange(replaceHeroProducts(project, slot, plan.products.filter((entry) => entry.instanceId !== product.instanceId)))}>移除</button>
        </header>
        <FormRenderer key={product.instanceId} node={formNode} value={params} dataPath={`${path}.template.params`} errors={errors} onChange={set} readOnlyReasons={disabled} />
        {conditionNames.map((name) => <fieldset key={name} disabled={disabled.has(name)}>
          <ConditionEditor label={name} value={params[name] as EffectCondition | undefined} fieldPrefix={`${product.instanceId}.${name}`}
            onChange={(value) => { if (!disabled.has(name)) set(`${path}.template.params.${name}`, value); }} />
          {disabled.has(name) ? <p>{disabled.get(name)}</p> : null}
          {(errors[`${path}.template.params.${name}`] ?? []).map((message, index) => <p key={index} role="alert">{message}</p>)}
        </fieldset>)}
      </li>;
    })}</ol>
    <label>加入產品（同一模板可重複加入）<select value="" disabled={plan.products.length >= TEMPLATE_STACK_MAX_CARDS || locked(productPrefix)} onChange={(event) => {
      if (event.target.value) onChange(replaceHeroProducts(project, slot, [...plan.products, { instanceId: `product-${crypto.randomUUID()}`, template: { ref: event.target.value, inheritDefaults: true, params: {} } }]));
    }}><option value="">選擇一個模板…</option>{templates.map((template) => <option key={template.id} value={template.id} disabled={!templateSelectionDecision(template.id, "doc").selectable}>{template.name}</option>)}</select></label>
  </section>;
}

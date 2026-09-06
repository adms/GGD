import { defaultAbilityMaxRank, defaultParamsFor, paramsSchemaFor, zHeroSlotPlans, TEMPLATE_STACK_MAX_CARDS, type HeroProject, type HeroSlot, type TemplateDoc } from "@ggd/shared/content";
import { FormRenderer } from "../form/FormRenderer";
import { ConditionEditor } from "../forge/ConditionEditor";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";
import { walkZod } from "../form/walk";
import { templateParamDecision, templateSelectionDecision } from "../forge/typeCatalog";
import type { ErrorMap } from "../store";
import { editHeroProject, fieldOwner, moveHeroProduct, replaceHeroProducts, setHeroFieldOwner } from "./projectModel";

export function HeroSlotEditor({ project, slot, templates, errors, onChange }: {
  project: HeroProject; slot: HeroSlot; templates: readonly TemplateDoc[]; errors: ErrorMap; onChange(project: HeroProject): void;
}) {
  const plan = project.acceptedPlan!.slots[slot];
  const prefix = `acceptedPlan.slots.${slot}`;
  const set = (path: string, value: unknown) => onChange(editHeroProject(project, "skills", path, value));
  const locked = (path: string) => fieldOwner(project, "skills", path) === "locked";
  const lock = (path: string) => <button type="button" onClick={() => onChange(setHeroFieldOwner(project, "skills", path, locked(path) ? "manual" : "locked"))}>{locked(path) ? "解鎖" : "鎖定"}</button>;
  const productPrefix = `${prefix}.products`;
  const maxRank = plan.maxRank ?? defaultAbilityMaxRank(slot);
  const supportedRank = defaultAbilityMaxRank(slot);
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
      <FormRenderer node={walkZod(zHeroSlotPlans.shape[slot].shape.tuning)} value={plan.tuning} dataPath={`${prefix}.tuning`} errors={errors} onChange={set} />
    </div>
    <h3>技能產品鏈</h3>{lock(productPrefix)}
    <label>不同產品填入同一欄時<select value={plan.templateConflictPolicy} disabled={locked(productPrefix)} onChange={(event) => set(`${prefix}.templateConflictPolicy`, event.target.value)}>
      <option value="reject">停下來處理衝突</option><option value="lastWins">後面的產品覆寫前面</option>
    </select></label>
    <ol className="hero-products">{plan.products.map((product, index) => {
      const template = templates.find((candidate) => candidate.id === product.template.ref);
      const path = `${productPrefix}.${index}`;
      const hasLockedChild = Object.entries(project.sections.skills.fieldOwnership).some(([key, owner]) => owner === "locked" && (key === path || key.startsWith(`${path}.`)));
      if (!template) return <li key={product.instanceId} role="alert">找不到產品模板 {product.template.ref}；原始參數已保留。</li>;
      const disabled = new Map(Object.keys(template.params).flatMap((name) => {
        const decision = templateParamDecision(template.id, name, "doc");
        const reason = locked(`${path}.template.params.${name}`) ? "此欄位已鎖定" : decision.reason;
        return reason ? [[name, reason] as const] : [];
      }));
      const conditionNames = Object.keys(template.params).filter((name) => template.params[name]?.type === "condition");
      const paramNode = walkZod(paramsSchemaFor(template));
      const formNode = paramNode.kind === "object" ? { ...paramNode, fields: paramNode.fields.filter((field) => !conditionNames.includes(field.path)) } : paramNode;
      const params = { ...defaultParamsFor(template), ...product.template.params };
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

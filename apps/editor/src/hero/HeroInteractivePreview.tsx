import { useEffect, useRef, useState } from "react";
import { DEFAULT_HERO_SCENARIO_SETUP, defaultAbilityMaxRank, type HeroProject, type HeroSlot, type HeroScenarioSetup } from "@ggd/shared/content";
import type { ErrorMap } from "../store";
import type { HeroCatalog } from "./catalog";
import type { HeroValidationResult } from "./validation";
import { HeroPreview, type FrozenHeroPreviewContent } from "./HeroPreview";

export function HeroInteractivePreview(props: { project: HeroProject; slot: HeroSlot; result: HeroValidationResult; current: boolean; editable: boolean; errors: ErrorMap; onChange(project: HeroProject): void; catalog: HeroCatalog; frozenContent?: FrozenHeroPreviewContent }) {
  const { project, slot, catalog } = props;
  const [setup, setSetup] = useState<HeroScenarioSetup>(() => structuredClone(DEFAULT_HERO_SCENARIO_SETUP));
  const [result, setResult] = useState<HeroValidationResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker>();
  const request = useRef(0);
  useEffect(() => {
    const instance = new Worker(new URL("./heroValidation.worker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<{ request: number; result: HeroValidationResult }>) => {
      if (event.data.request !== request.current) return;
      setResult(event.data.result); setBusy(false); setError(null);
    };
    instance.onerror = (event) => { setError(event.message || "試玩程序無法完成。"); setBusy(false); };
    return () => { instance.terminate(); worker.current = undefined; };
  }, []);
  useEffect(() => { setSetup((value) => ({ ...value, rank: Math.min(value.rank, defaultAbilityMaxRank(slot)),
    priorCast: value.priorCast?.slot === slot ? undefined : value.priorCast })); }, [slot]);
  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    const timer = setTimeout(() => worker.current?.postMessage({ request: id, project, catalog, playground: { slot, setup } }), 250);
    return () => clearTimeout(timer);
  }, [project, slot, catalog, setup]);
  const scenario = result?.scenarios.find((entry) => entry.slot === slot);
  const current = props.current && !busy && !error && result?.revision === project.revision && !!scenario;
  const number = (label: string, value: number, min: number, max: number, change: (value: number) => void, step = 1) => <label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
    const next = event.target.valueAsNumber;
    if (Number.isFinite(next) && next >= min && next <= max) change(next);
  }} /></label>;
  const statuses = catalog.simulationDocuments.filter(([key]) => key.startsWith("status-effects/")).map(([, document]) => document);
  const statusCost = props.result.compiled?.abilityDrafts[slot].statusCost;
  const requiredSummon = props.result.compiled?.abilityDrafts[slot].requiredSummonSlot;
  return <section aria-label="可調整的試玩情境">
    {requiredSummon ? <p>需要自己 {requiredSummon}「{project.acceptedPlan?.slots[requiredSummon].name}」的存活召喚物。可在前置施法選擇 {requiredSummon} 後試玩；只補足資源不會建立召喚物。</p> : null}
    {statusCost ? <p>單槽試玩{setup.resourceSetup === "empty" ? "保留初始" : "預先補足已安裝的"}資源；本招消耗{statusCost.count === "all" ? "全部剩餘資源（至少一層）" : `${statusCost.count} 層`}。整套驗收不補資源。</p> : null}
    <details><summary>調整試玩情境</summary>
      <p>位置以場地中心為原點。這些設定只影響本次試玩；投稿仍執行固定的六槽驗收。</p>
      {statusCost ? <label><input type="checkbox" checked={setup.resourceSetup !== "empty"} onChange={(event) => setSetup({ ...setup, resourceSetup: event.target.checked ? "ready" : "empty" })} />單槽試玩補足施放資源（不修改作品）</label> : null}
      <label>前置施法<select aria-label="前置施法" value={setup.priorCast?.slot ?? ""} onChange={(event) => {
        const priorSlot = event.target.value;
        setSetup({ ...setup, priorCast: priorSlot === "Q" || priorSlot === "W" || priorSlot === "E" || priorSlot === "R"
          ? { slot: priorSlot, waitSec: setup.priorCast?.waitSec ?? 1.5 } : undefined });
      }}><option value="">無，直接試玩本招</option>{(["Q", "W", "E", "R"] as const).filter(candidate => candidate !== slot).map(candidate => <option key={candidate} value={candidate}>{candidate} · {project.acceptedPlan?.slots[candidate].name}</option>)}</select></label>
      {setup.priorCast ? <>
        {number("前置施法後經過秒數", setup.priorCast.waitSec, 0.1, 10, (waitSec) => setSetup({ ...setup, priorCast: { ...setup.priorCast!, waitSec } }), 0.1)}
        <p>先實際施放所選技能，保留造成的傷害、詛咒與增益，再嘗試本招。</p>
      </> : null}
      <div className="hero-control-grid">
        {number("試玩等級", setup.level, 1, 18, (level) => setSetup({ ...setup, level }))}
        {number("試玩技能階級", setup.rank, 1, defaultAbilityMaxRank(slot), (rank) => setSetup({ ...setup, rank }))}
      </div>
      {(["caster", "target"] as const).map((role) => {
        const actor = setup[role]; const title = role === "caster" ? "施放者" : "目標";
        const change = (patch: Partial<typeof actor>) => setSetup({ ...setup, [role]: { ...actor, ...patch } });
        return <fieldset key={role}><legend>{title}</legend><div className="hero-control-grid">
          {number(`${title} X`, actor.x, -20, 20, (x) => change({ x }), 0.5)}
          {number(`${title} Z`, actor.z, -20, 20, (z) => change({ z }), 0.5)}
          {number(`${title}生命 %`, actor.hp, 1, 100, (hp) => change({ hp }))}
          {number(`${title}魔力 %`, actor.mana, 0, 100, (mana) => change({ mana }))}
          <label>{title}條件標記<select value={actor.statuses[0] ?? ""} onChange={(event) => change({ statuses: event.target.value ? [event.target.value] : [] })}>
            <option value="">無</option>{statuses.map((status) => <option key={String(status.id)} value={String(status.id)}>{String(status.name ?? status.id)}</option>)}
          </select></label>
        </div><p>條件標記用來測試技能條件；暈眩、減速等控制效果由技能本身施加。</p></fieldset>;
      })}
      <button type="button" onClick={() => setSetup(structuredClone(DEFAULT_HERO_SCENARIO_SETUP))}>重設試玩情境</button>
    </details>
    {busy ? <p role="status">正在試算此情境…</p> : error ? <p role="alert">{error}</p> : scenario ? <p role="status">{scenario.status === "accepted" ? "完成施放" : scenario.status === "passive" ? "被動情境" : `未施放：${scenario.rejectionReason}`} · 實際技能階級 {scenario.rank} · 目標生命 {Math.round(scenario.before.targetHp)} → {Math.round(scenario.after.targetHp)}</p> : result?.errors.map((message) => <p role="alert" key={message}>{message}</p>)}
    {!busy ? scenario?.assertions.filter(assertion => assertion.id === "single-slot-prior-cast").map(assertion => <p key={assertion.id}>{assertion.summaryZh}</p>) : null}
    <HeroPreview {...props} vfxSubtypes={catalog.vfxSubtypes} result={result?.compiled && scenario ? result : props.result} current={current} />
  </section>;
}

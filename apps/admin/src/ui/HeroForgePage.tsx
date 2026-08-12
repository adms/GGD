/**
 * 新英雄轉生設計 —— **畫面**。所有邏輯在 `../heroForgePage`（守衛也在那裡）。
 *
 * 六個區塊由上往下就是 owner 更正過的六步（`FORGE_STEPS` 是唯一一份順序）：
 * ①名稱說明 → ②選出身/路線·自動生成 → ③手動客製 → ④警告（只警告不擋）
 * → ⑤選技能（依路線推薦） → ⑥草稿 JSON + 寫進覆蓋層。
 *
 * ⚠️ ④ 的警告**不會**讓⑥的按鈕變灰。那是刻意的（owner：「只是個警告標記，
 * 並不會擋」），所以這一頁沒有任何一處讀 warnings 去 disable 東西。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn, TextInput, TextArea, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { putOverlayDoc } from "../api";
import { ORIGINS, type Origin } from "@ggd/shared/content/statNormalization";
import {
  FORGE_STEPS,
  HERO_FORGE_SLOTS,
  OVERRIDE_GROUPS,
  SLOT_LABEL,
  blankHeroForgeForm,
  builtInAttackType,
  draftJson,
  emptyCatalog,
  heroForgeDocs,
  heroForgeResult,
  loadHeroForgeCatalog,
  normalizedRow,
  overrideKey,
  pageWarnings,
  rankAbilities,
  routeTags,
  routesOf,
  writeOrder,
  type HeroForgeCatalog,
  type HeroForgeForm,
  type HeroForgeSlot,
} from "../heroForgePage";

const LABEL: React.CSSProperties = { fontSize: 11, color: TEXT_DIM, marginBottom: 4 };
const ROW: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" };

function Field(props: { label: string; children: React.ReactNode; width?: number }): React.JSX.Element {
  return (
    <div style={{ minWidth: props.width ?? 180, flex: props.width ? undefined : 1 }}>
      <div style={LABEL}>{props.label}</div>
      {props.children}
    </div>
  );
}

function StepHead(props: { index: number }): React.JSX.Element {
  const step = FORGE_STEPS[props.index]!;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_MAIN }}>{step.label}</div>
      <div style={{ fontSize: 11, color: TEXT_DIM }}>{step.note}</div>
    </div>
  );
}

export function HeroForgePage(): React.JSX.Element {
  const [form, setForm] = useState<HeroForgeForm>(blankHeroForgeForm);
  const [catalog, setCatalog] = useState<HeroForgeCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHeroForgeCatalog()
      .then((c) => {
        if (alive) setCatalog(c);
      })
      .catch(() => {
        /* loadHeroForgeCatalog 自己把讀不到的東西收進 errors，這裡只是保險 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const patch = (p: Partial<HeroForgeForm>): void => setForm((f) => ({ ...f, ...p }));
  const setOverride = (key: string, value: string): void =>
    setForm((f) => ({ ...f, overrides: { ...f.overrides, [key]: value } }));
  const setPick = (slot: HeroForgeSlot, id: string): void =>
    setForm((f) => ({ ...f, picks: { ...f.picks, [slot]: id } }));

  const result = useMemo(() => heroForgeResult(form, catalog), [form, catalog]);
  const warnings = useMemo(() => pageWarnings(form, result, catalog), [form, result, catalog]);
  const docs = useMemo(() => heroForgeDocs(form, result, catalog), [form, result, catalog]);
  const json = useMemo(() => draftJson(docs), [docs]);
  const tags = routeTags(form.route);
  const ranked = useMemo(
    () => (catalog.abilities.length === 0 ? [] : rankAbilities(catalog.abilities, tags, "Q")),
    [catalog, tags],
  );
  const norm = normalizedRow(form);

  const generated: Record<string, Record<string, number>> = {
    attributes: result.draft.attributes as unknown as Record<string, number>,
    baseStats: result.draft.baseStats,
    growth: result.draft.growth,
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveErr(null);
    setSaved(null);
    try {
      for (const d of writeOrder(docs)) {
        await putOverlayDoc(d.collection, d.id, d.doc as Record<string, unknown>);
      }
      setSaved(`已寫入 ${docs.length} 份文件（技能在前、英雄最後）。`);
    } catch (err) {
      setSaveErr(`寫入覆蓋層失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <Panel
        title="新英雄轉生設計"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {loading ? "載入鑄技工坊目錄…" : `鑄技工坊 ${catalog.abilities.length} 支技能`}
          </span>
        }
      >
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
          先寫名稱與說明 → 選出身及路線自動生成三圍/成長/其他屬性 → 手動客製 → 看警告 →
          從鑄技工坊挑六格技能 → 產出草稿上架。
          <br />
          ⛔ 警告<b>只警告不擋</b>；三圍與其他屬性由 <code>heroForge</code> 依出身生成，
          <code>ms / mr / armor</code> 由正規化填（下面是預覽，不是這一頁算的）。
        </div>
        {catalog.errors.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: DANGER }}>
            ⚠️ {catalog.errors.join("；")}
          </div>
        )}
      </Panel>

      {/* ① 名稱與說明 */}
      <Panel>
        <StepHead index={0} />
        <div style={ROW}>
          <Field label="英雄 id（小寫，例：godie-x001）" width={240}>
            <TextInput dataField="hero.id" value={form.id} onChange={(v) => patch({ id: v })} />
          </Field>
          <Field label="名稱" width={240}>
            <TextInput dataField="hero.name" value={form.name} onChange={(v) => patch({ name: v })} />
          </Field>
          <Field label="模型 key（models 集合）" width={240}>
            <TextInput dataField="hero.modelKey" value={form.modelKey} onChange={(v) => patch({ modelKey: v })} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={LABEL}>說明（選角畫面的角色介紹）</div>
          <TextArea value={form.description} onChange={(v) => patch({ description: v })} rows={3} />
        </div>
      </Panel>

      {/* ② 出身 + 路線 → 自動生成 */}
      <Panel>
        <StepHead index={1} />
        <div style={ROW}>
          <Field label="出身（10 選 1）" width={200}>
            <select
              data-field="hero.origin"
              value={form.origin}
              onChange={(e) => patch({ origin: e.target.value as Origin, route: "" })}
              style={selectStyle}
            >
              {ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="路線（決定技能推薦）" width={220}>
            <select
              data-field="hero.route"
              value={form.route}
              onChange={(e) => patch({ route: e.target.value })}
              style={selectStyle}
            >
              <option value="">（未選）</option>
              {routesOf(catalog, form.origin).map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} —— {r.summary}
                </option>
              ))}
            </select>
          </Field>
          <Field label="攻擊型態" width={160}>
            <select
              data-field="hero.attackType"
              value={form.attackType}
              onChange={(e) => patch({ attackType: e.target.value as HeroForgeForm["attackType"] })}
              style={selectStyle}
            >
              <option value="">
                {builtInAttackType(form.origin) === null
                  ? "（混血/均衡沒有內建，請選）"
                  : `（用出身內建：${builtInAttackType(form.origin) === "melee" ? "近戰" : "遠程"}）`}
              </option>
              <option value="melee">近戰 melee</option>
              <option value="ranged">遠程 ranged</option>
            </select>
          </Field>
          <Field label="三圍總量" width={120}>
            <TextInput
              dataField="hero.totalInitial"
              value={form.totalInitial}
              onChange={(v) => patch({ totalInitial: v })}
              placeholder="預設"
            />
          </Field>
          <Field label="成長總量" width={120}>
            <TextInput
              dataField="hero.totalGrowth"
              value={form.totalGrowth}
              onChange={(v) => patch({ totalGrowth: v })}
              placeholder="預設"
            />
          </Field>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: TEXT_DIM, lineHeight: 1.9 }}>
          定位 <Badge color={ACCENT}>{result.archetype}</Badge> · 出身往返{" "}
          <Badge color={result.originRoundTrip === result.origin ? OK : DANGER}>{result.originRoundTrip}</Badge> ·
          正規化將填入 ms {norm.ms} / mr {norm.mr} / armor {norm.armor}
          {form.route !== "" && (
            <>
              <br />
              路線推薦標籤：{tags.length === 0 ? "（無 —— 路線名可能被改過）" : tags.join("、")}
            </>
          )}
        </div>
      </Panel>

      {/* ③ 手動客製 */}
      <Panel>
        <StepHead index={2} />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {OVERRIDE_GROUPS.map((g) => (
            <div key={g.group} style={{ minWidth: 260, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 8 }}>{g.label}</div>
              {g.keys.map((k) => {
                const key = overrideKey(g.group, k);
                const gen = generated[g.group]?.[k];
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 110, fontSize: 11, color: TEXT_DIM }}>{k}</div>
                    <div style={{ width: 70, fontSize: 11, color: GOLD, textAlign: "right" }}>
                      {gen === undefined ? "—" : String(gen)}
                    </div>
                    <TextInput
                      dataField={key}
                      value={form.overrides[key] ?? ""}
                      onChange={(v) => setOverride(key, v)}
                      placeholder="覆寫"
                      style={{ width: 90 }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>

      {/* ④ 警告 */}
      <Panel>
        <StepHead index={3} />
        {warnings.length === 0 ? (
          <div style={{ fontSize: 12, color: OK }}>沒有警告。</div>
        ) : (
          <div data-field="hero.warnings" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {warnings.map((w, i) => (
              <div key={`${w.field}.${i}`} style={{ fontSize: 12, color: WARN, lineHeight: 1.7 }}>
                ⚠️ <b>{w.field}</b> —— {w.message}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ⑤ 選技能 */}
      <Panel>
        <StepHead index={4} />
        {HERO_FORGE_SLOTS.map((slot) => {
          const rows = rankAbilities(catalog.abilities, tags, slot).slice(0, 60);
          const picked = catalog.abilities.find((a) => a.id === form.picks[slot]);
          return (
            <div key={slot} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 48, fontSize: 12, fontWeight: 700, color: TEXT_MAIN }}>{SLOT_LABEL[slot]}</div>
              <select
                data-field={`pick.${slot}`}
                value={form.picks[slot]}
                onChange={(e) => setPick(slot, e.target.value)}
                style={{ ...selectStyle, flex: 1, maxWidth: 620 }}
              >
                <option value="">（未選）</option>
                {rows.map((r) => (
                  <option key={r.card.id} value={r.card.id}>
                    {r.hits.length > 0 ? `★${r.hits.length} ` : ""}
                    {r.card.slot} · {r.card.name}
                    {r.hits.length > 0 ? ` 〔${r.hits.join("、")}〕` : ""}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: TEXT_DIM, minWidth: 120 }}>
                {picked === undefined ? "" : picked.slot === slot ? "原槽位" : `原為 ${picked.slot} → 改寫`}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 8, lineHeight: 1.8 }}>
          ★ = 命中路線推薦標籤的數量（命中多的排前面）。選到別的槽位的技能也可以 ——
          草稿會<b>複製一份</b>改寫成這一格，原技能不受影響。
          {ranked.length > 0 && ranked[0]!.hits.length === 0 && tags.length > 0 && (
            <>
              <br />
              ⚠️ 這條路線的標籤在 461 支技能的說明裡一支都沒命中 —— 排序等於原順序。
            </>
          )}
        </div>
      </Panel>

      {/* ⑥ 草稿 + 上架 */}
      <Panel>
        <StepHead index={5} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <Btn kind="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "寫入中…" : "寫進內容覆蓋層"}
          </Btn>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {docs.length} 份文件（{docs.filter((d) => d.collection === "abilities").length} 支技能 + 1 張英雄卡）
          </span>
          {saved && <span style={{ fontSize: 11, color: OK }}>{saved}</span>}
          {saveErr && <span style={{ fontSize: 11, color: DANGER }}>{saveErr}</span>}
        </div>
        <textarea
          data-field="hero.draftJson"
          readOnly
          value={json}
          rows={16}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0b0e16",
            color: TEXT_MAIN,
            border: PANEL_BORDER,
            borderRadius: 8,
            padding: 10,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
          }}
        />
      </Panel>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #2c3448",
  background: "#10141f",
  color: TEXT_MAIN,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

/**
 * 🧬 技能特效模板對照 —— 模板 × 模型 × 粒子視覺設定（LIVE，GET /__live/vfx-templates）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 **mount 時 fetch**（dev vite middleware 當場算），⛔ 不 build-time import
 * 任何 JSON、⛔ 不把資料抄進 tsx。「現值」的規則由 dataset 鏡照出貨解析器
 * （packages/shared/src/content/modelFxPreset.ts 的欄位表，當場剖 ⛔ 不抄副本）：
 * effective = 節點覆寫 ?? 模板 params[*].default。
 *
 * 設定不在這裡改（⛔ 不複製第二份表單）：粒子家族連 🔮 鑄技工坊 · 特效綁定，
 * 技能節點連 ✨ 技能編輯器，模板／模型文件連 🗃 內容管理。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { useApp } from "../../store";
import { ReviewStrip } from "./ReviewStrip";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface MemberModel {
  id: string;
  found: boolean;
  glbPath: string | null;
  modelScale: number | null;
  fxLongAxis: string | null;
  fxTint: number[] | null;
  clipResolved: string | null;
}

interface Member {
  abilityId: string;
  abilityName: string;
  slot: string | null;
  nodeIndex: number;
  overrides: Record<string, unknown>;
  effective: Record<string, unknown>;
  hasOnTouch: boolean;
  hasOnArrive: boolean;
  model: MemberModel | null;
}

interface TemplateRow {
  id: string;
  name: string;
  family: string | null;
  status: string | null;
  exemplar: { skill: string; jass: string } | null;
  defaults: Record<string, unknown>;
  inert: string[];
  paramCount: number;
  model: {
    id: string;
    glbPath: string | null;
    scale: number | null;
    clipMap: Record<string, string> | null;
    fxLongAxis: string | null;
    fxTint: number[] | null;
  } | null;
  members: Member[];
}

interface ModelRow {
  id: string;
  found: boolean;
  glbPath: string | null;
  scale: number | null;
  collisionRadius: number | null;
  clipMap: Record<string, string> | null;
  fxLongAxis: string | null;
  fxSpawnHeight: number | null;
  fxTint: number[] | null;
}

interface ParticleFamily {
  key: string;
  enabled?: boolean;
  primitive?: string;
  element?: string;
  scale?: number;
  alpha?: number;
  timeScale?: number;
  heightY?: number;
  soundLaunch?: string;
  soundImpact?: string;
  soundDissipate?: string;
  soundLoop?: string;
  groundDecal?: string;
}

interface Payload {
  stats: Record<string, number>;
  fieldSources: { presetFields: string[]; touchFields: string[]; soundFields: string[]; note: string };
  templates: TemplateRow[];
  noPreset: Member[];
  models: ModelRow[];
  particles: { knobs: Record<string, unknown>; families: ParticleFamily[] };
  honest: string[];
  _live?: { computedAt: string; ms: number };
}

/** 成員表要畫的「現值」欄（順序＝欄位重要度，⛔ 不畫全部 19 格）。 */
const MEMBER_COLS = ["modelKey", "scale", "scaleAxis", "clip", "clipTimeScale", "tint", "alpha", "count", "path", "lifeSec"] as const;

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "5px 8px",
        textAlign: props.align ?? "left",
        fontSize: 12,
        color: TEXT_DIM,
        borderBottom: PANEL_BORDER,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(props: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  title?: string;
}): React.JSX.Element {
  return (
    <td
      title={props.title}
      style={{
        padding: "5px 8px",
        borderTop: PANEL_BORDER,
        fontSize: 12.5,
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </td>
  );
}

function TintSwatch(props: { tint: number[] }): React.JSX.Element {
  const [r, g, b] = props.tint;
  const css = `rgb(${Math.round((r ?? 0) * 255)},${Math.round((g ?? 0) * 255)},${Math.round((b ?? 0) * 255)})`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: css, border: PANEL_BORDER, display: "inline-block" }} />
      <span style={{ fontFamily: MONO }}>{props.tint.map((v) => Number(v).toFixed(2)).join(",")}</span>
    </span>
  );
}

function fmt(v: unknown): React.ReactNode {
  if (v === undefined || v === null) return <span style={{ color: TEXT_DIM }}>—</span>;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return String(v);
}

/** 一格現值：覆寫＝金色、模板預設＝暗色、inert＝加 ⛔ 標記。 */
function ValueCell(props: { field: string; m: Member; inert: string[] }): React.JSX.Element {
  const { field, m, inert } = props;
  const v = m.effective[field];
  const overridden = m.overrides[field] !== undefined;
  const isInert = !overridden && inert.includes(field);
  const color = overridden ? GOLD : TEXT_DIM;
  let body: React.ReactNode;
  if (field === "tint" && Array.isArray(v)) body = <TintSwatch tint={v as number[]} />;
  else body = fmt(v);
  return (
    <Td mono color={color} title={overridden ? "節點覆寫" : v === undefined ? "（無值）" : isInert ? "模板預設（inert：現行 path 下讀不到）" : "模板預設"}>
      {body}
      {isInert && v !== undefined ? <span style={{ color: WARN }}> ⛔</span> : null}
    </Td>
  );
}

function NavLink(props: { page: string; children: React.ReactNode }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  return (
    <button
      type="button"
      onClick={() => navigate(props.page as never)}
      style={{
        background: "transparent",
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_MAIN,
        padding: "3px 10px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

function TemplateBlock(props: { t: TemplateRow; filter: string }): React.JSX.Element | null {
  const { t, filter } = props;
  const members = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return t.members;
    return t.members.filter((m) =>
      `${m.abilityId} ${m.abilityName} ${String(m.effective.modelKey ?? "")}`.toLowerCase().includes(needle),
    );
  }, [t, filter]);
  if (filter.trim() !== "" && members.length === 0) return null;
  const d = t.defaults;
  return (
    <Panel
      title={`${t.name}（${t.id}）— ${members.length} 個出貨節點`}
      right={
        t.exemplar ? (
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            exemplar：{t.exemplar.skill}（JASS {t.exemplar.jass}）
          </span>
        ) : undefined
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO, lineHeight: 1.8 }}>
          家族預設：modelKey=<b style={{ color: TEXT_MAIN }}>{String(d.modelKey ?? "—")}</b>
          {" · "}scale={String(d.scale ?? "—")}
          {" · "}clip={String(d.clip ?? "—")}
          {" · "}path={String(d.path ?? "—")}
          {" · "}count={String(d.count ?? "—")}
          {" · "}lifeSec={String(d.lifeSec ?? "—")}
          {" · "}soundKey={String(d.soundKey ?? "—")}
          {t.inert.length > 0 ? (
            <span style={{ color: WARN }}>
              {" "}
              ⛔ inert：{t.inert.join("、")}
            </span>
          ) : null}
        </div>
        {t.model ? (
          <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO }}>
            預設模型：{t.model.id} → {t.model.glbPath ?? "（無 glb）"} · 模型自身 scale=
            {String(t.model.scale ?? "—")} · fxLongAxis={t.model.fxLongAxis ?? "—"}
            {d.clip && t.model.clipMap ? ` · clip「${String(d.clip)}」→ 實際剪輯「${t.model.clipMap[String(d.clip)] ?? "？"}」` : ""}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: DANGER }}>⚠️ 預設 modelKey 對不到任何 model 文件</div>
        )}
        {members.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr>
                  <Th>技能節點</Th>
                  {MEMBER_COLS.map((c) => (
                    <Th key={c}>{c}</Th>
                  ))}
                  <Th>剪輯→實際</Th>
                  <Th>touch / arrive</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={`${m.abilityId}#${m.nodeIndex}`}>
                    <Td mono title={m.abilityName}>
                      {m.abilityId}
                      {m.nodeIndex > 0 ? `#${m.nodeIndex}` : ""}
                      <span style={{ color: TEXT_DIM }}> {m.abilityName}</span>
                    </Td>
                    {MEMBER_COLS.map((c) => (
                      <ValueCell key={c} field={c} m={m} inert={t.inert} />
                    ))}
                    <Td mono color={m.model && !m.model.found ? DANGER : TEXT_DIM}>
                      {m.model
                        ? m.model.found
                          ? (m.model.clipResolved ?? "—")
                          : "⚠️ 模型不存在"
                        : "—"}
                    </Td>
                    <Td color={TEXT_DIM}>
                      {m.hasOnTouch ? "onTouch " : ""}
                      {m.hasOnArrive ? "onArrive" : ""}
                      {!m.hasOnTouch && !m.hasOnArrive ? "—" : ""}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>（沒有出貨節點引用這張模板）</div>
        )}
      </div>
    </Panel>
  );
}

export function VfxTemplatesPage(): React.JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/__live/vfx-templates")
      .then(async (res) => {
        const body = (await res.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!res.ok || body.error) setError(body.error ?? `HTTP ${res.status}`);
        else setData(body);
      })
      .catch((err) => {
        if (alive) setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error !== null) {
    return (
      <Panel title="🧬 技能特效模板對照">
        <ReviewStrip family={["beam", "stockglow", "invprim", "tpl"]} title="特效模板" />
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/vfx-templates 載入失敗（這一頁只在 dev vite server 下有資料面）：{"\n"}
          {error}
        </div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="🧬 技能特效模板對照">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>計算中…（/__live/vfx-templates）</div>
      </Panel>
    );
  }

  const s = data.stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <Panel
        title="🧬 技能特效模板對照 · 模型 × 粒子視覺設定（實時）"
        right={
          <span style={{ display: "inline-flex", gap: 8 }}>
            <NavLink page="vfxForge">🔮 鑄技工坊 · 特效綁定</NavLink>
            <NavLink page="abilities">✨ 技能編輯器</NavLink>
            <NavLink page="content">🗃 內容管理（模板／模型）</NavLink>
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: TEXT_MAIN }}>
            modelFx 模板 <b style={{ color: GOLD }}>{s.modelFxTemplates}</b>（全部模板 {s.templatesTotal}）
            {" · "}出貨 preset 節點 <b style={{ color: GOLD }}>{s.presetNodes}</b>
            {" · "}無 preset 節點 {s.noPresetNodes}
            {" · "}引用到的模型 <b style={{ color: GOLD }}>{s.referencedModels}</b>／{s.modelDocsTotal}
            {" · "}粒子家族 {s.particleFamilies}
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            「現值」＝節點覆寫（<span style={{ color: GOLD }}>金色</span>）?? 模板 params 預設（
            <span>暗色</span>）—— 欄位表當場剖自出貨解析器 modelFxPreset.ts（
            {data.fieldSources.presetFields.length}＋{data.fieldSources.soundFields.length}＋
            {data.fieldSources.touchFields.length} 格）。⛔ 標記＝模板標 inert（現行 path 下讀不到）。
            設定請走右上角的既有頁面，這一頁唯讀。
          </div>
          <TextInput value={q} onChange={setQ} placeholder="過濾：技能 id / 名 / modelKey…" />
        </div>
      </Panel>

      {data.templates.map((t) => (
        <TemplateBlock key={t.id} t={t} filter={q} />
      ))}

      {data.noPreset.length > 0 && q.trim() === "" ? (
        <Panel title={`🧩 無 preset 的 spawnModelFx 節點（${data.noPreset.length}）—— 全部欄位自帶，不吃任何模板預設`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <Th>技能節點</Th>
                  {MEMBER_COLS.map((c) => (
                    <Th key={c}>{c}</Th>
                  ))}
                  <Th>剪輯→實際</Th>
                </tr>
              </thead>
              <tbody>
                {data.noPreset.map((m) => (
                  <tr key={`${m.abilityId}#${m.nodeIndex}`}>
                    <Td mono title={m.abilityName}>
                      {m.abilityId}
                      {m.nodeIndex > 0 ? `#${m.nodeIndex}` : ""}
                      <span style={{ color: TEXT_DIM }}> {m.abilityName}</span>
                    </Td>
                    {MEMBER_COLS.map((c) => (
                      <ValueCell key={c} field={c} m={m} inert={[]} />
                    ))}
                    <Td mono color={TEXT_DIM}>
                      {m.model ? (m.model.found ? (m.model.clipResolved ?? "—") : "⚠️ 模型不存在") : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {q.trim() === "" ? (
        <Panel title={`🗿 被引用的模型（${data.models.length}）—— model@1 的視覺欄位`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr>
                  <Th>model id</Th>
                  <Th>glb</Th>
                  <Th align="right">scale</Th>
                  <Th align="right">collisionRadius</Th>
                  <Th>fxLongAxis</Th>
                  <Th align="right">fxSpawnHeight</Th>
                  <Th>fxTint</Th>
                  <Th>clipMap（idle/attack/death）</Th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m) => (
                  <tr key={m.id}>
                    <Td mono color={m.found ? TEXT_MAIN : DANGER}>
                      {m.id}
                      {m.found ? "" : " ⚠️ 不存在"}
                    </Td>
                    <Td mono color={TEXT_DIM}>{m.glbPath ?? "—"}</Td>
                    <Td mono align="right">{fmt(m.scale)}</Td>
                    <Td mono align="right" color={TEXT_DIM}>{fmt(m.collisionRadius)}</Td>
                    <Td mono color={TEXT_DIM}>{m.fxLongAxis ?? "—"}</Td>
                    <Td mono align="right" color={TEXT_DIM}>{fmt(m.fxSpawnHeight)}</Td>
                    <Td>{m.fxTint ? <TintSwatch tint={m.fxTint} /> : <span style={{ color: TEXT_DIM }}>—</span>}</Td>
                    <Td mono color={TEXT_DIM}>
                      {m.clipMap
                        ? `${m.clipMap.idle ?? "—"} / ${m.clipMap.attack ?? "—"} / ${m.clipMap.death ?? "—"}`
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {q.trim() === "" ? (
        <Panel
          title={`✨ 粒子家族視覺設定（${data.particles.families.length}）—— config.vfx-families@1 出貨值`}
          right={<NavLink page="vfxForge">在 🔮 鑄技工坊改這些值</NavLink>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO }}>
              全域旋鈕：scaleGain={String(data.particles.knobs.scaleGain)} · scaleMin=
              {String(data.particles.knobs.scaleMin)} · scaleMax={String(data.particles.knobs.scaleMax)} ·
              maxAbilityVfxLayers={String(data.particles.knobs.maxAbilityVfxLayers)} · oneShotMaxLifeSec=
              {String(data.particles.knobs.oneShotMaxLifeSec)}
            </div>
            <div style={{ fontSize: 12, color: WARN }}>
              ⚠️ 粒子家族與模板 family 是兩個命名空間，沒有 join key（vfxKey→家族的解析住
              client 的 resolveFamilyArt）—— 這張表獨立呈現，⛔ 不假裝 join 得起來。
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr>
                    <Th>家族</Th>
                    <Th>enabled</Th>
                    <Th>primitive</Th>
                    <Th>element</Th>
                    <Th align="right">scale</Th>
                    <Th align="right">alpha</Th>
                    <Th align="right">timeScale</Th>
                    <Th align="right">heightY</Th>
                    <Th>sound（launch/impact/dissipate）</Th>
                    <Th>groundDecal</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.particles.families.map((f) => (
                    <tr key={f.key}>
                      <Td mono>{f.key}</Td>
                      <Td color={f.enabled === false ? DANGER : OK}>{fmt(f.enabled)}</Td>
                      <Td mono color={TEXT_DIM}>{f.primitive ?? "—"}</Td>
                      <Td mono color={TEXT_DIM}>{f.element ?? "—"}</Td>
                      <Td mono align="right">{fmt(f.scale)}</Td>
                      <Td mono align="right">{fmt(f.alpha)}</Td>
                      <Td mono align="right" color={TEXT_DIM}>{fmt(f.timeScale)}</Td>
                      <Td mono align="right" color={TEXT_DIM}>{fmt(f.heightY)}</Td>
                      <Td mono color={TEXT_DIM}>
                        {`${f.soundLaunch ?? "—"} / ${f.soundImpact ?? "—"} / ${f.soundDissipate ?? "—"}`}
                      </Td>
                      <Td mono color={TEXT_DIM}>{f.groundDecal ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ) : null}

      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
        {data.honest.map((h, i) => (
          <div key={i}>⚠️ {h}</div>
        ))}
        <div style={{ marginTop: 6, fontFamily: MONO }}>
          🕐 這一頁算於 {data._live?.computedAt ?? "？"}（{data._live?.ms ?? "？"} ms · /__live/vfx-templates）
        </div>
      </div>
    </div>
  );
}

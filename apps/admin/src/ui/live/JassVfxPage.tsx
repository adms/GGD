/**
 * 🎬 技能 JASS 特效實作對照 —— **實時**動態頁（GET /__live/jass-vfx）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 mount 時 fetch `/__live/jass-vfx`（tools/admin-live/datasets/jass-vfx.mjs
 * 當場算），⛔ 不 build-time import 任何 JSON、⛔ 不把資料抄進 tsx。dataset 只讀
 * 既有產物：w3x 普查 VFX_BINDINGS.json ↔ 出貨 content/abilities ↔
 * config ability-vfx-bindings.json。
 *
 * 每支技能一列：JASS 側（rawcode / MDL stem / 生成方式）vs GGD 側（effects 裡的
 * spawnModelFx / spawnVfx / spawnProjectile、vfxKey / vfxLayers / persistentVfx、
 * config 綁定）。「⛔ 缺實作」（原作有特效、GGD 零表達）整列標紅。
 *
 * 「設定」半邊住在既有的 鑄技工坊 · 特效綁定 頁（vfxForge）——這裡只連過去，
 * ⛔ 不複製第二份表單。fetch 失敗畫出錯誤（fail-open 沒錯，靜默才是缺陷）。
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../store";
import { Panel, TextInput } from "../widgets";
import { ACCENT, DANGER, DANGER_BG, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { ReviewStrip } from "./ReviewStrip";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface JassArt {
  ch: string;
  stem: string;
  status: string | null;
  prov: string | null;
}
interface JassInv {
  call: string;
  stem: string | null;
}
interface JassSide {
  rc: string;
  rcConfidence: string | null;
  jassName: string | null;
  art: JassArt[];
  inv: JassInv[];
}
interface GgdFxEffect {
  kind: string;
  key: string | null;
  count?: number;
  preset?: string;
}
interface GgdSide {
  vfxKey: string | null;
  vfxLayers: string[];
  persistentVfx: string[];
  effects: GgdFxEffect[];
  cfgVfxKeys: string[];
  cfgSources: string[];
}
interface Row {
  id: string;
  name: string;
  champion?: string;
  slot?: string;
  censusState?: string | null;
  status: string;
  matchedStems?: string[];
  jass?: JassSide[];
  ggd?: GgdSide;
  error?: string;
}
interface Payload {
  schema: string;
  censusDrift: {
    censusDocs: number;
    currentDocs: number;
    retiredFromCensus: number;
    newSinceCensus: number;
    note: string;
  };
  statusCounts: Record<string, number>;
  rows: Row[];
  _live?: { computedAt: string; ms: number };
  error?: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  match: { label: "✅ 對得上", color: OK },
  replaced: { label: "🔁 已替換", color: WARN },
  jassOnly: { label: "⛔ 缺實作", color: DANGER },
  ggdOnly: { label: "➕ GGD 新增", color: ACCENT },
  none: { label: "雙方皆無", color: TEXT_DIM },
  unlinked: { label: "無 JASS 對應", color: TEXT_DIM },
  notInCensus: { label: "普查後新增", color: TEXT_DIM },
  parseError: { label: "JSON 壞檔", color: DANGER },
};

function Th(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
        textAlign: "left",
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
  mono?: boolean;
  color?: string;
  nowrap?: boolean;
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 12.5,
        verticalAlign: "top",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        whiteSpace: props.nowrap ? "nowrap" : undefined,
      }}
    >
      {props.children}
    </td>
  );
}

/** JASS 側一格：rawcode ＋ art 頻道 stems ＋ invocation 生成方式。 */
function JassCell(props: { jass: JassSide[] }): React.JSX.Element {
  if (props.jass.length === 0) return <span style={{ color: TEXT_DIM }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {props.jass.map((j) => (
        <div key={j.rc}>
          <span style={{ fontFamily: MONO, color: GOLD }}>{j.rc}</span>
          {j.art.map((a, i) => (
            <div key={`a${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_MAIN }}>
              {a.ch}: {a.stem}
              <span style={{ color: TEXT_DIM }}> · {a.prov ?? "?"}</span>
            </div>
          ))}
          {j.inv.map((v, i) => (
            <div key={`i${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
              {v.call}
              {v.stem !== null && v.stem !== "" ? `: ${v.stem}` : ""}
            </div>
          ))}
          {j.art.length === 0 && j.inv.length === 0 && (
            <span style={{ color: TEXT_DIM, fontSize: 11.5 }}>（無 art / invocation）</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** GGD 側一格：vfxKey / vfxLayers / persistentVfx / effects / config 綁定。 */
function GgdCell(props: { ggd: GgdSide | undefined }): React.JSX.Element {
  const g = props.ggd;
  if (g === undefined) return <span style={{ color: TEXT_DIM }}>—</span>;
  const lines: React.ReactNode[] = [];
  if (g.vfxKey !== null)
    lines.push(
      <div key="vk" style={{ fontFamily: MONO, fontSize: 11.5 }}>
        vfxKey: {g.vfxKey}
      </div>,
    );
  g.vfxLayers.forEach((k, i) =>
    lines.push(
      <div key={`vl${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
        layer: {k}
      </div>,
    ),
  );
  g.persistentVfx.forEach((k, i) =>
    lines.push(
      <div key={`pv${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
        persistent: {k}
      </div>,
    ),
  );
  g.effects.forEach((e, i) =>
    lines.push(
      <div key={`e${i}`} style={{ fontFamily: MONO, fontSize: 11.5 }}>
        {e.kind}: {e.key ?? e.preset ?? "?"}
        {e.count !== undefined ? ` ×${e.count}` : ""}
      </div>,
    ),
  );
  g.cfgVfxKeys.forEach((k, i) =>
    lines.push(
      <div key={`c${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
        cfg: {k}
      </div>,
    ),
  );
  if (lines.length === 0) return <span style={{ color: DANGER }}>（零特效表達）</span>;
  return <div>{lines}</div>;
}

export function JassVfxPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/__live/jass-vfx")
      .then(async (res) => {
        const body = (await res.json()) as Payload;
        if (!alive) return;
        if (!res.ok || body.error !== undefined) setErr(body.error ?? `HTTP ${res.status}`);
        else setData(body);
      })
      .catch((e: unknown) => {
        if (alive) setErr(String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (data === null) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (statusFilter !== null && r.status !== statusFilter) return false;
      if (needle === "") return true;
      const blob = [
        r.id,
        r.name,
        r.champion ?? "",
        ...(r.jass ?? []).flatMap((j) => [j.rc, ...j.art.map((a) => a.stem)]),
        r.ggd?.vfxKey ?? "",
        ...(r.ggd?.effects ?? []).map((e) => e.key ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [data, q, statusFilter]);

  if (err !== null) {
    return (
      <Panel title="🎬 技能 JASS 特效對照">
        <ReviewStrip family={["beam", "vfx", "invprim", "stockglow", "dragonslave", "kenshiro"]} title="JASS 特效對照" />
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/jass-vfx 載入失敗：{err}
          {"\n"}（這一頁是 dev-only 實時資料面 —— 確認 admin 是用 vite dev server 開的。）
        </div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="🎬 技能 JASS 特效對照">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（讀 w3x 普查 ↔ 出貨技能 JSON）</div>
      </Panel>
    );
  }

  const drift = data.censusDrift;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <Panel title={`🎬 技能 JASS 特效對照（出貨 ${drift.currentDocs} 支）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            每支技能一列：JASS 側（rawcode / MDL / 生成方式，來自 w3x 普查
            <code style={{ fontFamily: MONO }}> VFX_BINDINGS.json</code>）對照 GGD 側（
            <code style={{ fontFamily: MONO }}>spawnModelFx / spawnVfx / vfxKey</code> 等）。
            <span style={{ color: DANGER }}>「⛔ 缺實作」＝原作有特效、GGD 零表達</span>
            ；「已替換」＝兩邊都有但模型不同（GGD 重製，不一定是錯）。特效綁定的
            <b>設定</b>在
            <a
              style={{ color: ACCENT, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("vfxForge")}
            >
              鑄技工坊 · 特效綁定
            </a>
            （這裡唯讀，不放第二份表單）。
          </div>
          <div style={{ fontSize: 12, color: WARN }}>
            ⚠️ 普查快照：{drift.censusDocs} 份文件（2026-08-02），現行 {drift.currentDocs} 份 ——
            普查後退休 {drift.retiredFromCensus}、新增 {drift.newSinceCensus}（新增者 JASS 側無
            join，列為「普查後新增」）。
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(data.statusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([st, n]) => {
                const meta = STATUS_META[st] ?? { label: st, color: TEXT_DIM };
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(active ? null : st)}
                    style={{
                      background: active ? meta.color : "transparent",
                      color: active ? "#0b0e16" : meta.color,
                      border: `1px solid ${meta.color}`,
                      borderRadius: 12,
                      padding: "2px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {meta.label} {n}
                  </button>
                );
              })}
          </div>
          <TextInput value={q} onChange={setQ} placeholder="過濾：技能 id / 名 / 英雄 / rawcode / MDL stem…" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <Th>技能 id</Th>
                  <Th>技能名</Th>
                  <Th>英雄</Th>
                  <Th>格</Th>
                  <Th>JASS 側（rawcode · MDL · 生成方式）</Th>
                  <Th>GGD 側（特效表達）</Th>
                  <Th>對照</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, color: TEXT_DIM };
                  return (
                    <tr key={r.id} style={r.status === "jassOnly" ? { background: DANGER_BG } : undefined}>
                      <Td mono nowrap>
                        {r.id}
                      </Td>
                      <Td>{r.name}</Td>
                      <Td color={TEXT_DIM}>{r.champion ?? "—"}</Td>
                      <Td mono color={TEXT_DIM}>
                        {r.slot ?? "?"}
                      </Td>
                      <Td>
                        <JassCell jass={r.jass ?? []} />
                      </Td>
                      <Td>
                        <GgdCell ggd={r.ggd} />
                      </Td>
                      <Td color={meta.color} nowrap>
                        {meta.label}
                        {(r.matchedStems ?? []).length > 0 && (
                          <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                            {(r.matchedStems ?? []).join(", ")}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: TEXT_DIM }}>
            顯示 {rows.length} / {data.rows.length} 列 · 實時計算於{" "}
            {data._live?.computedAt ?? "?"}（{data._live?.ms ?? "?"} ms，deps mtime 沒動時走快取）
          </div>
        </div>
      </Panel>
    </div>
  );
}

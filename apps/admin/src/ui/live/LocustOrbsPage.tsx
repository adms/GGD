/**
 * 🦗 蝗蟲群球體實作對照 —— 236 隻原作 dummy（usca/tint/timedLife）vs GGD 落點，缺的標紅。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 mount 時 fetch `/__live/locust-orbs`（tools/admin-live/datasets/locust-orbs.mjs
 * 每次請求當場算），⛔ 不 build-time import 任何 JSON、⛔ 不把資料抄進這個檔。
 * dev-only：/__live 由 vite configureServer 掛載，production build 沒有這一段。
 *
 * 對照的兩邊（dataset 檔頭有完整說明）：
 *   原作側 = tools/locust-census/census.json（pnpm locust:build 的產物）
 *   GGD 側 = content/abilities+items 的 spawnModelFx ＋ ability-templates 預設 ＋ content/models
 * 「設定」不在這一頁：家族預設住 content/ability-templates/tpl-locust-*.json（一鍵 rollback 那格）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type Landing = {
  docId: string;
  docName: string;
  docKind: string;
  preset: string | null;
  explicit: boolean;
  scale: number | null;
  scaleAxis: number[] | null;
  tint: number[] | null;
  alpha: number | null;
  lifeSec: number | null;
  count: number | null;
  path: string | null;
};

type RowStatus = "missing" | "model-only" | "landed" | "proxy";

type Row = {
  id: string;
  name: string;
  model: string | null;
  modelKind: string;
  scale: number | null;
  tint: number[] | null;
  alphaPct: number | null;
  timedLife: number[];
  sites: number;
  triggers: number;
  tplShape: string | null;
  tplSuggested: string | null;
  gray: string[];
  modelKey: string | null;
  status: RowStatus;
  landings: Landing[];
};

type Payload = {
  source: { census: string; ggd: string; censusCounts: Record<string, number> };
  summary: {
    total: number;
    proxy: number;
    landed: number;
    modelOnly: number;
    missing: number;
    spawnNodes: number;
    modelDocs: number;
    landingKeys: number;
  };
  locustTemplates: Array<{
    id: string;
    modelKey: string | null;
    path: string | null;
    count: number | null;
    lifeSec: number | null;
    scale: number | null;
  }>;
  rows: Row[];
  _live?: { computedAt: string; ms: number };
};

const STATUS_META: Record<RowStatus, { label: string; color: string }> = {
  missing: { label: "缺", color: DANGER },
  "model-only": { label: "有模型無引用", color: WARN },
  landed: { label: "已落地", color: OK },
  proxy: { label: "隱形/承襲", color: TEXT_DIM },
};

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 8px",
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
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 8px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        verticalAlign: "top",
      }}
    >
      {props.children}
    </td>
  );
}

/** rgb255 → 小色塊 ＋ 數字（null = 未染色）。 */
function Tint(props: { rgb: number[] | null }): React.JSX.Element {
  if (!props.rgb) return <span style={{ color: TEXT_DIM }}>—</span>;
  const [r, g, b] = props.rgb;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO }}>
      <span
        style={{
          width: 11,
          height: 11,
          borderRadius: 2,
          background: `rgb(${r},${g},${b})`,
          border: "1px solid #444",
          flex: "none",
        }}
      />
      {r},{g},{b}
    </span>
  );
}

function landingText(l: Landing): string {
  const bits: string[] = [];
  if (l.preset) bits.push(l.preset.replace(/^tpl-/, ""));
  if (l.scale != null) bits.push(`×${l.scale}`);
  if (l.scaleAxis) bits.push(`軸[${l.scaleAxis.join(",")}]`);
  if (l.tint) bits.push(`tint ${l.tint.join(",")}`);
  if (l.alpha != null && l.alpha !== 1) bits.push(`α${l.alpha}`);
  if (l.lifeSec != null) bits.push(`${l.lifeSec}s`);
  if (l.count != null && l.count !== 1) bits.push(`${l.count}具`);
  if (l.path) bits.push(l.path);
  return bits.join(" · ");
}

export function LocustOrbsPage(): React.JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<RowStatus | "all">("all");

  useEffect(() => {
    let alive = true;
    fetch("/__live/locust-orbs")
      .then(async (res) => {
        const body = (await res.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
      })
      .catch((err: unknown) => {
        if (alive) setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (needle === "") return true;
      const hay = `${r.id} ${r.name} ${r.model ?? ""} ${r.modelKey ?? ""} ${r.tplSuggested ?? ""} ${r.landings.map((l) => l.docId).join(" ")}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [data, q, statusFilter]);

  if (error != null) {
    return (
      <Panel title="🦗 蝗蟲群球體實作對照">
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/locust-orbs 載入失敗：{error}
          {"\n\n"}這一頁是 dev-only（vite middleware）——production build 或 middleware
          未掛載時就會看到這個錯誤。
        </div>
      </Panel>
    );
  }
  if (data == null) {
    return (
      <Panel title="🦗 蝗蟲群球體實作對照">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（/__live/locust-orbs）</div>
      </Panel>
    );
  }

  const s = data.summary;
  const chips: Array<{ key: RowStatus | "all"; label: string; n: number; color: string }> = [
    { key: "all", label: "全部", n: s.total, color: TEXT_MAIN },
    { key: "missing", label: STATUS_META.missing.label, n: s.missing, color: DANGER },
    { key: "model-only", label: STATUS_META["model-only"].label, n: s.modelOnly, color: WARN },
    { key: "landed", label: STATUS_META.landed.label, n: s.landed, color: OK },
    { key: "proxy", label: STATUS_META.proxy.label, n: s.proxy, color: TEXT_DIM },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1380 }}>
      <Panel title={`🦗 蝗蟲群球體實作對照（原作 ${s.total} 隻 dummy vs GGD ${s.spawnNodes} 個 spawnModelFx 節點）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            原作側：<code style={{ fontFamily: MONO }}>{data.source.census}</code>
            <br />
            GGD 側：{data.source.ggd}。join 是<b>模型層級</b>（同一具模型多隻 dummy 共用；
            落點掛在模型上，逐隻 tint/α 差異請比對兩邊欄位）。家族預設（一鍵 rollback 那格）住{" "}
            <code style={{ fontFamily: MONO }}>content/ability-templates/tpl-locust-*.json</code>。
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => setStatusFilter(c.key)}
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 12,
                  border: PANEL_BORDER,
                  background: statusFilter === c.key ? "#232c40" : "transparent",
                  color: c.color,
                  fontWeight: statusFilter === c.key ? 700 : 400,
                }}
              >
                {c.label} {c.n}
              </button>
            ))}
          </div>
          <TextInput
            value={q}
            onChange={setQ}
            placeholder="過濾：rawcode / 名稱 / 模型 / modelKey / 落點技能 id…"
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  <Th>狀態</Th>
                  <Th>rawcode</Th>
                  <Th>原作名</Th>
                  <Th>模型</Th>
                  <Th align="right">usca</Th>
                  <Th>tint</Th>
                  <Th align="right">α%</Th>
                  <Th>timedLife</Th>
                  <Th align="right">生成點</Th>
                  <Th>census 分群</Th>
                  <Th>GGD modelKey</Th>
                  <Th>GGD 落點（技能 · 參數）</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.id}>
                      <Td color={meta.color}>{meta.label}</Td>
                      <Td mono>{r.id}</Td>
                      <Td>
                        {r.name || <span style={{ color: TEXT_DIM }}>—</span>}
                        {r.gray.length > 0 && (
                          <span style={{ color: TEXT_DIM, fontSize: 11 }}> ({r.gray.join(",")})</span>
                        )}
                      </Td>
                      <Td mono color={r.modelKind === "model" ? TEXT_MAIN : TEXT_DIM}>
                        {r.modelKind === "model" ? r.model : `(${r.modelKind})`}
                      </Td>
                      <Td align="right" mono color={GOLD}>
                        {r.scale ?? "—"}
                      </Td>
                      <Td>
                        <Tint rgb={r.tint} />
                      </Td>
                      <Td align="right" mono>
                        {r.alphaPct ?? "—"}
                      </Td>
                      <Td mono color={TEXT_DIM}>
                        {r.timedLife.length > 0 ? `${r.timedLife.join("/")}s` : "—"}
                      </Td>
                      <Td align="right" mono color={TEXT_DIM}>
                        {r.sites}
                      </Td>
                      <Td mono color={TEXT_DIM}>
                        {r.tplShape ?? "—"}
                      </Td>
                      <Td mono color={r.modelKey ? TEXT_MAIN : TEXT_DIM}>
                        {r.modelKey ?? "無"}
                      </Td>
                      <Td>
                        {r.landings.length === 0 ? (
                          <span style={{ color: r.status === "proxy" ? TEXT_DIM : meta.color }}>
                            {r.status === "proxy" ? "proxyCast（不進模板）" : "無"}
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {r.landings.map((l, i) => (
                              <div key={`${l.docId}|${i}`} style={{ fontSize: 12 }}>
                                <span style={{ fontFamily: MONO }}>{l.docId}</span>
                                {l.docName && <span style={{ color: TEXT_DIM }}> {l.docName}</span>}
                                <span style={{ color: TEXT_DIM, fontFamily: MONO }}>
                                  {" "}
                                  {landingText(l)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            顯示 {rows.length} / {s.total} 列 · GGD 模型文件 {s.modelDocs} 份 · 被引用的 modelKey{" "}
            {s.landingKeys} 個 · 家族模板：
            {data.locustTemplates.map((t) => (
              <span key={t.id} style={{ fontFamily: MONO }}>
                {" "}
                {t.id}
                {t.modelKey ? `(${t.modelKey.replace(/^(w3x\.stock|imported)\./, "")})` : ""}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: TEXT_DIM, borderTop: PANEL_BORDER, paddingTop: 6 }}>
            實時計算於 {data._live?.computedAt ?? "?"} · 費時 {data._live?.ms ?? "?"}ms
            （/__live/locust-orbs，deps mtime 沒動時回快取）
          </div>
        </div>
      </Panel>
    </div>
  );
}

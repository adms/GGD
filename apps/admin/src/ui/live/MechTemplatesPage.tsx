/**
 * 🧩 機制模板×五級距（實時）—— GET /__live/mech-templates 當場算，⛔ 不是 build-time 烘的。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * 上半：46 個模板家族 × 採用狀態（誰 ref 誰、覆寫幾格參數）。
 * 下半：range / AoE 五級距畫成 24×18 格場地的同心圓俯視圖 ——
 *   值**直讀**出貨 config（aoe-tiers / range-tiers），顏色直讀 range-guide 的出貨色，
 *   ⛔ 頁面一個數字都不重算（第〇·四守則）。
 * 「設定」半邊連去既有的 aoeTiers / rangeTiers config 頁，⛔ 不複製第二份表單。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, Btn, TextInput } from "../widgets";
import { GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN, DANGER } from "../theme";
import { useApp } from "../../store";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface AdopterRow {
  id: string;
  name: string;
  slot: string;
  overrides: number;
}

interface TemplateRow {
  id: string;
  name: string;
  family: string;
  status: string;
  description: string;
  gapScore: number | null;
  paramNames: string[];
  requires: string[];
  exemplar: { skill?: string; jass?: string } | null;
  adoptedBy: number;
  adopters: AdopterRow[];
}

interface TierRow {
  tier: string;
  radius: number | null;
  range: number | null;
  rangeAbilities: number;
  radiusAbilities: number;
  rangeNodes: number;
  radiusNodes: number;
}

interface LivePayload {
  stats: {
    templatesTotal: number;
    templatesEnabled: number;
    templatesAdopted: number;
    abilitiesTotal: number;
    abilitiesWithTemplate: number;
    abilitiesWithRangeTier: number;
    abilitiesWithRadiusTier: number;
    orphanRefs: { ref: string; ability: string }[];
  };
  templates: TemplateRow[];
  tiers: TierRow[];
  tierConfigs: {
    aoe: { enabled: boolean; note: string };
    range: { enabled: boolean; note: string };
  };
  arena: { cols: number; rows: number; tileSize: number };
  colors: { range: string; rangeFillAlpha: number; aoe: string; aoeFillAlpha: number };
  _live?: { computedAt: string; ms: number };
}

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
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
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
      }}
    >
      {props.children}
    </td>
  );
}

/** 24×18 格場地俯視圖：AoE 五級距畫成填色圓盤、施法距離畫成虛線圈。 */
function TierTopDown(props: { data: LivePayload }): React.JSX.Element {
  const { tiers, arena, colors } = props.data;
  const w = arena.cols * arena.tileSize; // 48 世界單位
  const h = arena.rows * arena.tileSize; // 36 世界單位
  const cx = w / 2;
  const cy = h / 2;
  const gridLines: React.JSX.Element[] = [];
  for (let x = 0; x <= arena.cols; x++) {
    gridLines.push(
      <line
        key={`v${x}`}
        x1={x * arena.tileSize}
        y1={0}
        x2={x * arena.tileSize}
        y2={h}
        stroke="#232c40"
        strokeWidth={0.05}
      />,
    );
  }
  for (let y = 0; y <= arena.rows; y++) {
    gridLines.push(
      <line
        key={`h${y}`}
        x1={0}
        y1={y * arena.tileSize}
        x2={w}
        y2={y * arena.tileSize}
        stroke="#232c40"
        strokeWidth={0.05}
      />,
    );
  }
  // 大盤先畫，小盤壓在上面（不然小級距被蓋住）
  const aoeDiscs = [...tiers]
    .filter((t) => t.radius !== null)
    .sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0));
  const diag = Math.SQRT1_2; // 標籤沿 45° 東北方向排，避免互相疊字
  return (
    <svg
      viewBox={`-1.5 -1.5 ${w + 12} ${h + 3}`}
      style={{ width: "100%", maxWidth: 900, display: "block" }}
      role="img"
      aria-label="距離範圍五級距俯視圖"
    >
      <rect x={0} y={0} width={w} height={h} fill="#0b0e16" />
      {gridLines}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="#41507a" strokeWidth={0.18} />
      {aoeDiscs.map((t) => (
        <circle
          key={`aoe-${t.tier}`}
          cx={cx}
          cy={cy}
          r={t.radius ?? 0}
          fill={colors.aoe}
          fillOpacity={colors.aoeFillAlpha}
          stroke={colors.aoe}
          strokeOpacity={0.5}
          strokeWidth={0.08}
        />
      ))}
      {tiers
        .filter((t) => t.range !== null)
        .map((t) => (
          <circle
            key={`rng-${t.tier}`}
            cx={cx}
            cy={cy}
            r={t.range ?? 0}
            fill="none"
            stroke={colors.range}
            strokeOpacity={0.9}
            strokeWidth={0.14}
            strokeDasharray="0.7 0.45"
          />
        ))}
      {/* 施法者 */}
      <circle cx={cx} cy={cy} r={0.5} fill={TEXT_MAIN} />
      {/* 級距標籤：沿東北 45° 排 */}
      {tiers
        .filter((t) => t.range !== null)
        .map((t) => {
          const r = t.range ?? 0;
          const lx = cx + r * diag;
          const ly = cy - r * diag;
          return (
            <g key={`lbl-${t.tier}`}>
              <circle cx={lx} cy={ly} r={0.22} fill={colors.range} />
              <text
                x={lx + 0.5}
                y={ly - 0.2}
                fontSize={1.25}
                fill={TEXT_MAIN}
                fontFamily="sans-serif"
              >
                {t.tier} {t.range}
              </text>
            </g>
          );
        })}
      {/* 圖例 */}
      <g fontSize={1.25} fontFamily="sans-serif">
        <circle cx={w + 1.5} cy={2} r={0.9} fill={colors.aoe} fillOpacity={0.45} />
        <text x={w + 3} y={2.45} fill={TEXT_MAIN}>
          AoE 半徑（radiusTier）
        </text>
        <circle
          cx={w + 1.5}
          cy={5}
          r={0.9}
          fill="none"
          stroke={colors.range}
          strokeWidth={0.16}
          strokeDasharray="0.6 0.4"
        />
        <text x={w + 3} y={5.45} fill={TEXT_MAIN}>
          施法距離（rangeTier）
        </text>
        <circle cx={w + 1.5} cy={8} r={0.4} fill={TEXT_MAIN} />
        <text x={w + 3} y={8.45} fill={TEXT_MAIN}>
          施法者（場地 {w}×{h} 世界單位）
        </text>
      </g>
    </svg>
  );
}

function StatChip(props: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        border: PANEL_BORDER,
        borderRadius: 8,
        padding: "6px 12px",
        display: "flex",
        gap: 8,
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 12, color: TEXT_DIM }}>{props.label}</span>
      <span style={{ fontSize: 16, color: GOLD, fontFamily: MONO }}>{props.value}</span>
    </div>
  );
}

/** 🧩 機制模板對照＋距離範圍視覺化（實時 /__live/mech-templates）。 */
export function MechTemplatesPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/__live/mech-templates");
      const body = (await res.json()) as LivePayload & { error?: string };
      if (!res.ok || body.error) {
        setError(body.error ?? `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (data === null) return [];
    const needle = q.trim().toLowerCase();
    if (needle === "") return data.templates;
    return data.templates.filter((t) =>
      `${t.id} ${t.name} ${t.family} ${t.status} ${t.adopters.map((a) => `${a.id} ${a.name}`).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data, q]);

  if (error !== null) {
    return (
      <Panel title="🧩 機制模板×五級距">
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/mech-templates 讀取失敗：{error}
        </div>
        <div style={{ marginTop: 10 }}>
          <Btn small onClick={() => void load()}>
            重試
          </Btn>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: TEXT_DIM }}>
          這一頁只在 dev server（vite serve）上有資料面 —— production build 不含 /__live。
        </div>
      </Panel>
    );
  }
  if (loading || data === null) {
    return (
      <Panel title="🧩 機制模板×五級距">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（掃 46 模板 × 421 技能）</div>
      </Panel>
    );
  }

  const { stats, tiers, tierConfigs } = data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1240 }}>
      <Panel
        title="🧩 機制模板×五級距（實時掃描）"
        right={
          <Btn small onClick={() => void load()}>
            重新計算
          </Btn>
        }
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatChip label="模板家族" value={stats.templatesTotal} />
          <StatChip
            label="enabled"
            value={`${stats.templatesEnabled}/${stats.templatesTotal}`}
          />
          <StatChip
            label="有人採用"
            value={`${stats.templatesAdopted}/${stats.templatesTotal}`}
          />
          <StatChip
            label="技能走模板"
            value={`${stats.abilitiesWithTemplate}/${stats.abilitiesTotal}`}
          />
          <StatChip
            label="填 rangeTier"
            value={`${stats.abilitiesWithRangeTier}/${stats.abilitiesTotal}`}
          />
          <StatChip
            label="填 radiusTier"
            value={`${stats.abilitiesWithRadiusTier}/${stats.abilitiesTotal}`}
          />
        </div>
        {stats.orphanRefs.length > 0 && (
          <div style={{ marginTop: 10, color: DANGER, fontSize: 13 }}>
            ⚠️ {stats.orphanRefs.length} 個 template.ref 指到不存在的模板：
            {stats.orphanRefs.map((o) => `${o.ability}→${o.ref}`).join("、")}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
          資料每次請求當場掃 content/ability-templates + content/abilities（standalone
          權威側；champion-embedded 是鏡射副本不重複計）。五級距的值直讀出貨
          config，⛔ 頁面不重算梯子。
        </div>
      </Panel>

      <Panel
        title="📐 距離／範圍五級距俯視圖（24×18 格場地）"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={() => navigate("rangeTiers")} title={tierConfigs.range.note}>
              ⚙ 施法距離五級距設定
            </Btn>
            <Btn small onClick={() => navigate("aoeTiers")} title={tierConfigs.aoe.note}>
              ⚙ AoE 五級距設定
            </Btn>
          </div>
        }
      >
        <TierTopDown data={data} />
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <Th>級距</Th>
                <Th align="right">施法距離（世界單位）</Th>
                <Th align="right">AoE 半徑（世界單位）</Th>
                <Th align="right">rangeTier 採用（技能）</Th>
                <Th align="right">radiusTier 採用（技能／節點）</Th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.tier}>
                  <Td color={GOLD}>{t.tier}</Td>
                  <Td align="right" mono>
                    {t.range ?? "—"}
                  </Td>
                  <Td align="right" mono>
                    {t.radius ?? "—"}
                  </Td>
                  <Td align="right" mono>
                    {t.rangeAbilities}
                  </Td>
                  <Td align="right" mono>
                    {t.radiusAbilities}／{t.radiusNodes}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
          兩軸同一條梯子（skillTiers.ts）；值來自 config.range-tiers@1 / config.aoe-tiers@1
          的出貨文件。要調數字請用右上角連去的既有設定頁（那邊有上下界與 overlay 寫入），
          ⛔ 這一頁不放第二份表單。radiusTier 的「節點」含 effects 巢狀（一支技能可有多個
          範圍節點）。
        </div>
      </Panel>

      <Panel title={`🗂 模板家族 × 採用狀態（${stats.templatesTotal} 家族）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextInput
            value={q}
            onChange={setQ}
            placeholder="過濾：模板 id / 名稱 / family / 採用技能…"
            dataField="mech-templates-filter"
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <Th>模板</Th>
                  <Th>名稱</Th>
                  <Th>family</Th>
                  <Th>狀態</Th>
                  <Th align="right">參數格</Th>
                  <Th align="right">gap</Th>
                  <Th align="right">採用</Th>
                  <Th>採用者（覆寫格數）</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <Td mono title={t.description}>
                      {t.id}
                    </Td>
                    <Td>{t.name}</Td>
                    <Td mono color={TEXT_DIM}>
                      {t.family}
                    </Td>
                    <Td color={t.status === "enabled" ? OK : WARN}>{t.status}</Td>
                    <Td align="right" mono title={t.paramNames.join(", ")}>
                      {t.paramNames.length}
                    </Td>
                    <Td align="right" mono color={TEXT_DIM}>
                      {t.gapScore ?? "—"}
                    </Td>
                    <Td align="right" mono color={t.adoptedBy > 0 ? GOLD : TEXT_DIM}>
                      {t.adoptedBy}
                    </Td>
                    <Td
                      color={TEXT_DIM}
                      title={t.adopters.map((a) => `${a.id} ${a.name}（覆寫 ${a.overrides} 格）`).join("\n")}
                    >
                      {t.adoptedBy === 0
                        ? "—"
                        : t.adopters
                            .slice(0, 4)
                            .map((a) => `${a.id}(${a.overrides})`)
                            .join("、") + (t.adoptedBy > 4 ? ` …+${t.adoptedBy - 4}` : "")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div style={{ fontSize: 13, color: TEXT_DIM }}>沒有符合過濾條件的模板。</div>
          )}
        </div>
      </Panel>

      <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO }}>
        本頁於 {data._live?.computedAt ?? "?"} 實時計算（{data._live?.ms ?? "?"} ms）
        · GET /__live/mech-templates
      </div>
    </div>
  );
}

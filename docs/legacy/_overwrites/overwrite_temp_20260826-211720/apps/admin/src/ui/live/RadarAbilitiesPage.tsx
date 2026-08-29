/**
 * 📡 技能四軸級距雷達（/__live/radar-abilities）—— 唯讀 LIVE 頁。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 **mount 時 fetch `/__live/radar-abilities`**（dev-only middleware，
 *    tools/admin-live/datasets/radar-abilities.mjs 當場讀 content/ 現算），
 *    ⛔ 零 build-time import、⛔ 零抄進 tsx 的資料。
 *
 * 畫什麼：每支技能一張五軸（傷害/冷卻/耗魔/距離/範圍）級距雷達
 *（極小=1 … 極大=5），支援挑英雄把 Q/W/E/R 四技能疊在同一張圖上。
 * 解析後的值（秒/點/格）全部來自出貨的 tier 表 —— dataset 只查表不重算公式。
 *
 * ⚠️ 唯讀。要改哪一軸的表，去左欄既有 config 頁：
 *    💥 傷害五級距 · ⏲ 冷卻五級距 · 🔷 耗魔五級距 · ➶ 施法距離五級距 · ◎ AoE 範圍五級距。
 *    這裡⛔不放第二份表單（同 tierOverview 的理由：兩處可編＝互相蓋掉）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// ── /__live/radar-abilities 的回應形狀（與 dataset 的 build() 對齊） ──────────

type TierName = "極小" | "小" | "中" | "大" | "極大";
type AxisKey = "damage" | "cooldown" | "manaCost" | "range" | "radius";

interface AbilityRow {
  id: string;
  name: string;
  slot: string;
  championId: string | null;
  championName: string | null;
  tiers: Record<AxisKey, TierName | null>;
  damageNodeCount: number;
  radiusFromNested: boolean;
  cooldownShape: "單體" | "範圍" | "變身";
  resolved: Record<"damage" | "cooldownSec" | "manaCost" | "range" | "radius", number | null>;
}

interface LiveData {
  tierOrder: TierName[];
  tables: {
    damage: Record<TierName, number> | null;
    cooldown: Record<string, Record<TierName, number>> | null;
    manaCost: Record<TierName, number> | null;
    range: Record<TierName, number> | null;
    radius: Record<TierName, number> | null;
  };
  autoShape: boolean;
  champions: { id: string; name: string; alternate: boolean }[];
  abilities: AbilityRow[];
  stats: {
    abilityCount: number;
    championCount: number;
    axisCounts: Record<AxisKey, number>;
    orphans: number;
  };
  honest: string[];
  _live?: { computedAt: string; ms: number };
}

const AXES: { key: AxisKey; label: string; short: string; unit: string }[] = [
  { key: "damage", label: "傷害", short: "傷", unit: "點" },
  { key: "cooldown", label: "冷卻", short: "冷", unit: "秒" },
  { key: "manaCost", label: "耗魔", short: "魔", unit: "點" },
  { key: "range", label: "距離", short: "距", unit: "格" },
  { key: "radius", label: "範圍", short: "範", unit: "格" },
];

function tierScore(order: TierName[], t: TierName | null): number {
  if (!t) return 0;
  const i = order.indexOf(t);
  return i < 0 ? 0 : i + 1;
}

// ── SVG 雷達（純 inline SVG，零依賴） ─────────────────────────────────────────

interface RadarSeries {
  label: string;
  color: string;
  /** 五軸各 0..5（0 = 這支技能沒有這一軸）。順序同 AXES。 */
  values: number[];
}

function polarPoint(cx: number, cy: number, r: number, axisIndex: number): [number, number] {
  const a = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / AXES.length;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function polygonPoints(cx: number, cy: number, radii: number[]): string {
  return radii.map((r, i) => polarPoint(cx, cy, r, i).map((v) => v.toFixed(1)).join(",")).join(" ");
}

function RadarSvg(props: { size: number; series: RadarSeries[]; shortLabels?: boolean }): React.JSX.Element {
  const s = props.size;
  const cx = s / 2;
  const cy = s / 2;
  const rMax = s / 2 - (props.shortLabels ? 14 : 20);
  const rings = [1, 2, 3, 4, 5];
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img">
      {rings.map((k) => (
        <polygon
          key={k}
          points={polygonPoints(cx, cy, AXES.map(() => (rMax * k) / 5))}
          fill="none"
          stroke="#232c40"
          strokeWidth={k === 5 ? 1.2 : 0.6}
        />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = polarPoint(cx, cy, rMax, i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#232c40" strokeWidth={0.6} />;
      })}
      {props.series.map((se, si) => (
        <polygon
          key={si}
          points={polygonPoints(cx, cy, se.values.map((v) => (rMax * Math.max(0, Math.min(5, v))) / 5))}
          fill={se.color}
          fillOpacity={0.14}
          stroke={se.color}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ))}
      {props.series.map((se, si) =>
        se.values.map((v, i) => {
          if (v <= 0) return null;
          const [x, y] = polarPoint(cx, cy, (rMax * v) / 5, i);
          return <circle key={`${si}-${i}`} cx={x} cy={y} r={2.2} fill={se.color} />;
        }),
      )}
      {AXES.map((ax, i) => {
        const [x, y] = polarPoint(cx, cy, rMax + (props.shortLabels ? 8 : 12), i);
        return (
          <text
            key={ax.key}
            x={x}
            y={y}
            fill={TEXT_DIM}
            fontSize={props.shortLabels ? 10 : 12}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {props.shortLabels ? ax.short : ax.label}
          </text>
        );
      })}
    </svg>
  );
}

// ── 表格小件（與 SkillListsPage 同一套姿勢） ─────────────────────────────────

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
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
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

/** 一格「級別（解析值＋單位）」；沒有這一軸就畫 —。 */
function TierCell(props: { tier: TierName | null; resolved: number | null; unit: string }): React.JSX.Element {
  if (!props.tier) return <span style={{ color: TEXT_DIM }}>—</span>;
  return (
    <span>
      {props.tier}
      <span style={{ color: TEXT_DIM, fontSize: 11 }}>
        {props.resolved !== null ? `（${props.resolved}${props.unit}）` : "（表無此格）"}
      </span>
    </span>
  );
}

const SLOT_COLORS: Record<string, string> = { Q: GOLD, W: ACCENT, E: OK, R: DANGER };
const SLOT_ORDER = ["Q", "W", "E", "R"];

function abilityValues(order: TierName[], a: AbilityRow): number[] {
  return AXES.map((ax) => tierScore(order, a.tiers[ax.key]));
}

// ── 主頁 ─────────────────────────────────────────────────────────────────────

export function RadarAbilitiesPage(): React.JSX.Element {
  const [data, setData] = useState<LiveData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [champ, setChamp] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/__live/radar-abilities")
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (!alive) return;
        const rec = body as { error?: string } | null;
        if (!r.ok || rec === null || typeof rec.error === "string") {
          setErr(rec && typeof rec.error === "string" ? rec.error : `HTTP ${r.status}`);
          return;
        }
        setData(body as LiveData);
      })
      .catch((e) => {
        if (alive) setErr(String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (needle === "") return data.abilities;
    return data.abilities.filter((a) =>
      `${a.id} ${a.name} ${a.championName ?? ""} ${a.slot}`.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const champAbilities = useMemo(() => {
    if (!data || champ === "") return [];
    return data.abilities.filter((a) => a.championId === champ);
  }, [data, champ]);

  if (err !== null) {
    return (
      <Panel title="📡 技能級距雷達">
        <div style={{ color: DANGER, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700 }}>讀取 /__live/radar-abilities 失敗：</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: MONO, fontSize: 12, margin: "6px 0 0" }}>{err}</pre>
          <div style={{ color: TEXT_DIM, marginTop: 6 }}>
            這一頁只在 dev server 上有資料面（vite middleware，production build 不含）。
            重整一次；還是紅的話看 dev server 的 console。
          </div>
        </div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="📡 技能級距雷達">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>正在向 /__live/radar-abilities 取資料⋯</div>
      </Panel>
    );
  }

  const order = data.tierOrder;
  const CARD_CAP = 60;
  const shown = filtered.slice(0, CARD_CAP);
  const overlayRows = SLOT_ORDER.map((s) => champAbilities.find((a) => a.slot === s) ?? null);
  const extraRows = champAbilities.filter((a) => !SLOT_ORDER.includes(a.slot));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      <Panel title={`📡 技能級距雷達（${data.stats.abilityCount} 支 / ${data.stats.championCount} 位英雄）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            五軸＝技能 JSON 的級距欄（傷害 damageTier · 冷卻 cooldownTier · 耗魔 manaCostTier ·
            距離 rangeTier · 範圍 radiusTier），極小=1 ⋯ 極大=5；括號裡的解析值查
            content/config 的五張 tier 表（冷卻依形狀查 單體/範圍/變身 那三欄）。
            資料由 <code style={{ fontFamily: MONO }}>/__live/radar-abilities</code> 每次請求時現讀
            content/ 計算，⛔ 不是烘進頁面的靜態內容。要改表 → 左欄
            「💥 傷害五級距 · ⏲ 冷卻五級距 · 🔷 耗魔五級距 · ➶ 施法距離五級距 · ◎ AoE 範圍五級距」
            （這裡不放第二份表單）。
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            各軸有級距的技能數：
            {AXES.map((ax) => (
              <span key={ax.key} style={{ marginLeft: 10, color: TEXT_MAIN }}>
                {ax.label} <b style={{ color: GOLD }}>{data.stats.axisCounts[ax.key]}</b>
              </span>
            ))}
            <span style={{ marginLeft: 10 }}>（母體 {data.stats.abilityCount}；沒有那一軸的畫成 0）</span>
          </div>
          {data.honest.length > 0 && (
            <div style={{ fontSize: 12, color: WARN, lineHeight: 1.6 }}>
              ⚠️ 誠實缺口：{data.honest.join("；")}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="🦸 挑英雄看 Q/W/E/R 疊圖">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select
            value={champ}
            onChange={(e) => setChamp(e.target.value)}
            style={{
              background: PANEL_BG,
              color: TEXT_MAIN,
              border: PANEL_BORDER,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              maxWidth: 420,
            }}
          >
            <option value="">— 選一位英雄 —</option>
            {data.champions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.alternate ? "（變身態）" : ""}
              </option>
            ))}
          </select>
          {champ !== "" && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
              <RadarSvg
                size={320}
                series={overlayRows.flatMap((a, i) =>
                  a === null
                    ? []
                    : [
                        {
                          label: SLOT_ORDER[i],
                          color: SLOT_COLORS[SLOT_ORDER[i]] ?? GOLD,
                          values: abilityValues(order, a),
                        },
                      ],
                )}
              />
              <div style={{ overflowX: "auto", flex: 1, minWidth: 420 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>格</Th>
                      <Th>技能</Th>
                      <Th>傷害</Th>
                      <Th>冷卻（形狀）</Th>
                      <Th>耗魔</Th>
                      <Th>距離</Th>
                      <Th>範圍</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...overlayRows.filter((a): a is AbilityRow => a !== null), ...extraRows].map((a) => (
                      <tr key={a.id}>
                        <Td>
                          <span style={{ color: SLOT_COLORS[a.slot] ?? TEXT_DIM, fontWeight: 700 }}>{a.slot}</span>
                        </Td>
                        <Td>{a.name}</Td>
                        <Td>
                          <TierCell tier={a.tiers.damage} resolved={a.resolved.damage} unit="點" />
                        </Td>
                        <Td>
                          <TierCell tier={a.tiers.cooldown} resolved={a.resolved.cooldownSec} unit="秒" />
                          {a.tiers.cooldown && (
                            <span style={{ color: TEXT_DIM, fontSize: 11 }}>｛{a.cooldownShape}｝</span>
                          )}
                        </Td>
                        <Td>
                          <TierCell tier={a.tiers.manaCost} resolved={a.resolved.manaCost} unit="點" />
                        </Td>
                        <Td>
                          <TierCell tier={a.tiers.range} resolved={a.resolved.range} unit="格" />
                        </Td>
                        <Td>
                          <TierCell tier={a.tiers.radius} resolved={a.resolved.radius} unit="格" />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
                  疊圖只畫 Q/W/E/R（{overlayRows.filter(Boolean).length} 支）；天生/EX 只列表。
                  冷卻秒數＝卡面秒（不含系統倍率）。
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`🃏 每技能雷達（過濾後 ${filtered.length} 支${filtered.length > CARD_CAP ? `，顯示前 ${CARD_CAP}` : ""}）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextInput value={q} onChange={setQ} placeholder="過濾：技能 id / 名 / 英雄 / 格（Q W E R EX 天生）…" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {shown.map((a) => (
              <div
                key={a.id}
                style={{
                  border: PANEL_BORDER,
                  borderRadius: 8,
                  padding: 10,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <RadarSvg
                  size={120}
                  shortLabels
                  series={[{ label: a.slot, color: SLOT_COLORS[a.slot] ?? GOLD, values: abilityValues(order, a) }]}
                />
                <div style={{ minWidth: 0, fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ color: TEXT_MAIN, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: SLOT_COLORS[a.slot] ?? TEXT_DIM }}>{a.slot}</span> {a.name}
                  </div>
                  <div style={{ color: TEXT_DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.championName ?? "（無英雄卡）"}
                  </div>
                  <div style={{ color: TEXT_DIM, fontFamily: MONO, fontSize: 11 }}>
                    {AXES.map((ax) => `${ax.short}${a.tiers[ax.key] ?? "—"}`).join(" ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {shown.length === 0 && <div style={{ color: TEXT_DIM, fontSize: 13 }}>沒有符合過濾條件的技能。</div>}
        </div>
      </Panel>

      <div style={{ fontSize: 11, color: TEXT_DIM }}>
        本頁資料計算於 {data._live?.computedAt ?? "（middleware 未附 _live）"}（
        {data._live ? `${data._live.ms} ms` : "—"}，/__live/radar-abilities，deps 有動才重算）。
      </div>
    </div>
  );
}

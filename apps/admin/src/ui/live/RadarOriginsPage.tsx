/**
 * 📡 出身屬性五級距雷達圖 —— 🔴 LIVE（mount 時 fetch /__live/radar-origins）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁**零 build-time import**：資料由 tools/admin-live/datasets/radar-origins.mjs
 *   每次請求當場從磁碟算（mtime 快取），改一份英雄卡／級距表存檔重整就是新的。
 *
 * 資料語意：雷達的半徑是**五級距的序**（極小=1 … 極大=5），⛔ 不是屬性絕對值 ——
 * 級距名抄 config.stat-normalization@1 的 byOrigin，級距值抄 bands/bandsByScale
 * （第〇·四守則：這裡一條公式都沒有）。同出身的英雄雷達形狀相同（出身＝定位），
 * 卡上專屬的是三圍（str/agi/int，初始＝個性）。設定要改 → 左欄「英雄屬性正規化」。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn, TextInput } from "../widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { useApp } from "../../store";
import { ReviewStrip } from "./ReviewStrip";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type TierCell = { tier: string | null; ord: number | null; value: number | null };
type OriginInfo = {
  tiers: Record<string, TierCell>;
  rangeScale: string | null;
  rule: string | null;
  tagline: string | null;
};
type Champ = {
  id: string;
  name: string;
  origin: string;
  role: string | null;
  attackType: string | null;
  attributes: { str: number | null; agi: number | null; int: number | null; primary: string | null } | null;
  inPopulation: boolean;
  身分: string | null;
};
type Payload = {
  tierOrder: string[];
  stats: string[];
  referenceLevel: number | null;
  channel: Record<string, string>;
  origins: Record<string, OriginInfo>;
  originCounts: Record<string, number>;
  champions: Champ[];
  unmatched: { id: string; name: string; origin: string | null }[];
  sources: Record<string, string>;
  _live?: { computedAt: string; ms: number };
};

/** 軸的中文短標（雷達上要塞得下）；全名沿用「英雄屬性正規化」那一頁的用語。 */
const STAT_ZH: Record<string, string> = {
  ms: "移速",
  mr: "魔抗",
  armor: "裝甲",
  maxHealth: "生命",
  maxMana: "魔力",
  ad: "攻擊",
  ap: "法強",
  as: "攻速",
  healthRegen: "回血",
  manaRegen: "回魔",
  range: "射程",
};
/** 預設五軸（生命／攻擊／法強／裝甲／移速）—— 11 項都可勾，最少留 3 軸。 */
const DEFAULT_AXES = ["maxHealth", "ad", "ap", "armor", "ms"];
const ORD_COLOR: Record<number, string> = { 1: DANGER, 2: WARN, 3: TEXT_DIM, 4: ACCENT, 5: GOLD };

function RadarSVG(props: {
  axes: string[];
  series: { color: string; cells: Record<string, TierCell> }[];
  size: number;
}): React.JSX.Element {
  const { axes, series, size } = props;
  const cx = size / 2;
  const cy = size / 2;
  const margin = size >= 200 ? 26 : 20;
  const R = size / 2 - margin;
  const n = Math.max(axes.length, 3);
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): string =>
    `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`;
  const ring = (lvl: number): string => axes.map((_, i) => pt(i, (R * lvl) / 5)).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: "block" }}>
      {[1, 2, 3, 4, 5].map((lvl) => (
        <polygon key={lvl} points={ring(lvl)} fill="none" stroke="#232c40" strokeWidth={lvl === 5 ? 1.2 : 0.6} />
      ))}
      {axes.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + R * Math.cos(angle(i))}
          y2={cy + R * Math.sin(angle(i))}
          stroke="#232c40"
          strokeWidth={0.6}
        />
      ))}
      {series.map((s, si) => {
        const points = axes.map((a, i) => pt(i, (R * (s.cells[a]?.ord ?? 0)) / 5)).join(" ");
        return (
          <polygon
            key={si}
            points={points}
            fill={s.color}
            fillOpacity={0.16}
            stroke={s.color}
            strokeWidth={1.6}
          />
        );
      })}
      {axes.map((a, i) => {
        const c = Math.cos(angle(i));
        const x = cx + (R + 10) * c;
        const y = cy + (R + 10) * Math.sin(angle(i));
        return (
          <text
            key={a}
            x={x}
            y={y + 3}
            fontSize={size >= 200 ? 11 : 9}
            fill={TEXT_DIM}
            textAnchor={Math.abs(c) < 0.35 ? "middle" : c > 0 ? "start" : "end"}
          >
            {STAT_ZH[a] ?? a}
          </text>
        );
      })}
    </svg>
  );
}

function TierText(props: { cell: TierCell | undefined }): React.JSX.Element {
  const c = props.cell;
  if (!c || c.tier == null) return <span style={{ color: TEXT_DIM }}>—</span>;
  return (
    <span style={{ color: ORD_COLOR[c.ord ?? 3] ?? TEXT_MAIN }}>
      {c.tier}
      <span style={{ color: TEXT_DIM, fontFamily: MONO, marginLeft: 4, fontSize: 11 }}>
        {c.value ?? "?"}
      </span>
    </span>
  );
}

export function RadarOriginsPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [axes, setAxes] = useState<string[]>(DEFAULT_AXES);
  const [q, setQ] = useState("");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let dead = false;
    setError(null);
    fetch("/__live/radar-origins")
      .then(async (res) => {
        const body = (await res.json()) as Payload & { error?: string };
        if (dead) return;
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
        setAId((prev) => prev || body.champions[0]?.id || "");
        setBId(
          (prev) =>
            prev ||
            (body.champions.find((c) => c.origin !== body.champions[0]?.origin) ?? body.champions[1])?.id ||
            "",
        );
      })
      .catch((err) => {
        if (!dead) setError(String(err instanceof Error ? err.message : err));
      });
    return () => {
      dead = true;
    };
  }, [reloadKey]);

  const activeAxes = useMemo(
    () => (data ? data.stats.filter((s) => axes.includes(s)) : axes),
    [data, axes],
  );
  const byId = useMemo(() => new Map((data?.champions ?? []).map((c) => [c.id, c])), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (needle === "") return data.champions;
    return data.champions.filter((c) =>
      `${c.id} ${c.name} ${c.origin} ${c.attributes?.primary ?? ""}`.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const toggleAxis = (stat: string): void => {
    setAxes((prev) => {
      if (prev.includes(stat)) {
        if (prev.length <= 3) return prev; // 少於 3 軸畫不成面
        return prev.filter((s) => s !== stat);
      }
      return [...prev, stat];
    });
  };

  if (error != null) {
    return (
      <Panel title="📡 出身屬性五級距雷達圖">
        <ReviewStrip family={["tier", "stat", "anchor"]} title="出身屬性五級距" />
        <div style={{ color: DANGER, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700 }}>資料載入失敗（/__live/radar-origins）：</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: MONO, fontSize: 12 }}>{error}</pre>
          <div style={{ color: TEXT_DIM, marginBottom: 8 }}>
            這一頁只在 dev server（vite）下有資料面 —— production build 不含 /__live。
          </div>
          <Btn small onClick={() => setReloadKey((k) => k + 1)}>
            重試
          </Btn>
        </div>
      </Panel>
    );
  }
  if (data == null) {
    return (
      <Panel title="📡 出身屬性五級距雷達圖">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>載入中…（/__live/radar-origins）</div>
      </Panel>
    );
  }

  const a = byId.get(aId) ?? null;
  const b = byId.get(bId) ?? null;
  const aTiers = a ? data.origins[a.origin]?.tiers ?? {} : {};
  const bTiers = b ? data.origins[b.origin]?.tiers ?? {} : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      <Panel
        title="📡 出身屬性五級距雷達圖 · 🔴 LIVE"
        right={
          <Btn small onClick={() => navigate("statNormalization")}>
            ⚙ 調整級距表：英雄屬性正規化
          </Btn>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            半徑＝五級距的<b style={{ color: TEXT_MAIN }}>序</b>（極小=1 · 小=2 · 中=3 · 大=4 ·
            極大=5，⛔ 不是屬性絕對值）；小字是該級距在 L{data.referenceLevel ?? "?"}
            的級距值（射程走近戰／遠程雙階梯，由出身選）。出身決定形狀 ——
            同出身的英雄雷達相同；卡上專屬的是三圍（初始＝個性、成長＝定位）。
            來源：<code style={{ fontFamily: MONO }}>{data.sources.tiers}</code>。
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>軸（{activeAxes.length}）：</span>
            {data.stats.map((s) => {
              const on = axes.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleAxis(s)}
                  title={on && axes.length <= 3 ? "最少要留 3 軸" : s}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: "pointer",
                    color: on ? TEXT_MAIN : TEXT_DIM,
                    background: on ? "#2c3f6b" : "#10141f",
                    border: `1px solid ${on ? ACCENT : "#2c3448"}`,
                  }}
                >
                  {STAT_ZH[s] ?? s}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="⚔ 並排比較兩位英雄">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 300 }}>
            {(
              [
                ["A", aId, setAId, GOLD],
                ["B", bId, setBId, ACCENT],
              ] as const
            ).map(([tag, val, set, color]) => (
              <label key={tag} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <span style={{ color, fontWeight: 700, fontFamily: MONO }}>{tag}</span>
                <select
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #2c3448",
                    background: "#10141f",
                    color: TEXT_MAIN,
                    fontSize: 13,
                  }}
                >
                  {data.champions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.origin}）
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["軸", a ? `A ${a.origin}` : "A", b ? `B ${b.origin}` : "B"].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "4px 10px",
                        textAlign: "left",
                        fontSize: 12,
                        color: i === 1 ? GOLD : i === 2 ? ACCENT : TEXT_DIM,
                        borderBottom: PANEL_BORDER,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeAxes.map((s) => (
                  <tr key={s}>
                    <td style={{ padding: "4px 10px", borderTop: PANEL_BORDER, color: TEXT_DIM }}>
                      {STAT_ZH[s] ?? s}
                    </td>
                    <td style={{ padding: "4px 10px", borderTop: PANEL_BORDER }}>
                      <TierText cell={aTiers[s]} />
                    </td>
                    <td style={{ padding: "4px 10px", borderTop: PANEL_BORDER }}>
                      <TierText cell={bTiers[s]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <RadarSVG
              size={320}
              axes={activeAxes}
              series={[
                ...(a ? [{ color: GOLD, cells: aTiers }] : []),
                ...(b ? [{ color: ACCENT, cells: bTiers }] : []),
              ]}
            />
            <div style={{ fontSize: 12, color: TEXT_DIM, textAlign: "center" }}>
              <span style={{ color: GOLD }}>■ {a?.name ?? "—"}</span>
              {"　"}
              <span style={{ color: ACCENT }}>■ {b?.name ?? "—"}</span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title={`🃏 每英雄一張雷達（${filtered.length} / ${data.champions.length} 位）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextInput value={q} onChange={setQ} placeholder="過濾：英雄 id / 名 / 出身 / 主屬…" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {filtered.map((c) => {
              const info = data.origins[c.origin];
              const attrs = c.attributes;
              return (
                <div
                  key={c.id}
                  style={{
                    border: PANEL_BORDER,
                    borderRadius: 10,
                    padding: 10,
                    width: 196,
                    background: "#10141f",
                  }}
                >
                  <RadarSVG size={176} axes={activeAxes} series={[{ color: GOLD, cells: info?.tiers ?? {} }]} />
                  <div style={{ fontSize: 12, color: TEXT_MAIN, marginTop: 4, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>
                      {c.name}
                    </div>
                    <div style={{ color: TEXT_DIM }}>
                      {c.origin} · {c.attackType === "melee" ? "近戰" : c.attackType === "ranged" ? "遠程" : c.attackType ?? "?"}
                      {info?.tagline ? <span title={info.tagline}> ⓘ</span> : null}
                    </div>
                    {attrs ? (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                        {(["str", "agi", "int"] as const).map((k) => (
                          <span
                            key={k}
                            style={{
                              marginRight: 8,
                              color: attrs.primary?.toLowerCase() === k ? OK : TEXT_DIM,
                            }}
                          >
                            {k.toUpperCase()} {attrs[k] ?? "?"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                      <Btn small onClick={() => setAId(c.id)} style={{ borderColor: GOLD }}>
                        設為A
                      </Btn>
                      <Btn small onClick={() => setBId(c.id)} style={{ borderColor: ACCENT }}>
                        設為B
                      </Btn>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {data.unmatched.length > 0 && (
        <Panel title={`⚠ 畫不出雷達的卡（${data.unmatched.length} 份）`}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            這些卡<b style={{ color: WARN }}>沒有 origin 欄</b>（變身態／counterpart／未上架）——
            出身雷達的形狀由 origin 決定，卡上沒填就誠實不畫，⛔ 不編資料充數。
            <div style={{ fontFamily: MONO, marginTop: 6 }}>
              {data.unmatched.map((u) => `${u.id}（${u.name}）`).join("、")}
            </div>
          </div>
        </Panel>
      )}

      <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "right" }}>
        這一頁由 /__live/radar-origins 於 {data._live?.computedAt ?? "?"} 現算（
        {data._live?.ms ?? "?"} ms）·{" "}
        <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setReloadKey((k) => k + 1)}>
          重新整理
        </span>
      </div>
    </div>
  );
}

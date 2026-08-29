/**
 * 🌪 MDL 特效家族總表 —— **實時**動態頁（GET /__live/mdl-families）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 * > 「光束砲家族**應該共用特效模板**，請你仔細掃描**所有使用相同 mdl 的蝗蟲群**對應到的特效」
 *
 * 一顆 MDL ＝ 一個特效家族。資料由 tools/admin-live/datasets/mdl-families.mjs
 * 在**每次請求時**重跑 join（OBJECTS.json dummy 單位 × MODEL_USAGE 生成點 ×
 * JASS_BEHAVIOR 行為卡 × CENSUS/ability-vfx-bindings × 出貨 content/abilities）。
 * ⛔ 這裡零資料、零重算 —— mount 時 fetch，失敗畫出錯誤（fail-open 沒錯，靜默才是缺陷）。
 *
 * 樹狀表：MDL → dummy 單位（rawcode/scale）→ 生成點（j:行號）→ 原作技能 → GGD 落點
 * （出貨 abilityId + vfxKey / spawnModelFx.modelKey）＋推導的清算狀態。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type ShippedRef = {
  id: string;
  name: string | null;
  vfxKey: string | null;
  modelKeys: string[];
  stale?: boolean;
};
type SkillJoin = {
  rawcode: string | null;
  w3xName: string | null;
  hero: string | null;
  trigger?: string;
  shipped: ShippedRef[];
  via: string[];
};
type Site = { line: number | null; trigger: string | null; fn: string | null; count: number };
type Dummy = {
  rawcode: string;
  name: string;
  scale: number | null;
  base: string | null;
  spawnSites: number;
  sites: Site[];
  siteOverflow: number;
  skills: SkillJoin[];
};
type Family = {
  stem: string;
  mdl: string;
  mdlPath: string;
  familyLabel: string | null;
  dummyCount: number;
  spawnSiteTotal: number;
  zeroSpawnDummies: number;
  status: "resolved" | "partial" | "queued" | "noEvidence";
  dummies: Dummy[];
};
type Payload = {
  families: Family[];
  stats: {
    mdlCount: number;
    multiDummyMdl: number;
    dummyTotal: number;
    dummyInMulti: number;
    spawnSiteTotal: number;
    zeroSpawnDummies: number;
    byStatus: Record<string, number>;
    shippedAbilities: number;
  };
  honest: string[];
  _live?: { computedAt: string; ms: number };
  error?: string;
};

const STATUS_ZH: Record<Family["status"], { label: string; color: string }> = {
  resolved: { label: "✅ 落點已對上", color: OK },
  partial: { label: "🟡 部分對上", color: WARN },
  queued: { label: "⬜ 排隊（有證據未對上）", color: TEXT_DIM },
  noEvidence: { label: "⚪ 零證據", color: TEXT_DIM },
};

function StatusChip({ status }: { status: Family["status"] }): React.JSX.Element {
  const s = STATUS_ZH[status];
  return (
    <span style={{ color: s.color, fontSize: 12, whiteSpace: "nowrap" }}>{s.label}</span>
  );
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
  nowrap?: boolean;
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
        verticalAlign: "top",
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        whiteSpace: props.nowrap ? "nowrap" : undefined,
      }}
    >
      {props.children}
    </td>
  );
}

/** 一列 dummy 的「原作技能 → GGD 落點」欄。 */
function SkillCell({ skills }: { skills: SkillJoin[] }): React.JSX.Element {
  if (skills.length === 0) {
    return <span style={{ color: TEXT_DIM, fontSize: 12 }}>⚪ 零生成點證據（w3a 通道待查）</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {skills.map((s, i) => (
        <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ color: TEXT_MAIN }}>
            {s.w3xName ?? (s.trigger ? `〔trigger ${s.trigger}〕` : (s.rawcode ?? "?"))}
          </span>
          {s.rawcode && s.w3xName && (
            <span style={{ color: TEXT_DIM, fontFamily: MONO }}> {s.rawcode}</span>
          )}
          {s.shipped.length === 0 ? (
            <span style={{ color: WARN }}> ⚠️ 未對上出貨名冊</span>
          ) : (
            s.shipped.map((sh) => (
              <span key={sh.id}>
                {" → "}
                <span style={{ fontFamily: MONO, color: sh.stale ? DANGER : GOLD }}>
                  {sh.id}
                  {sh.stale ? "（已不在出貨）" : ""}
                </span>
                {sh.vfxKey && (
                  <span style={{ fontFamily: MONO, color: TEXT_DIM }}> {sh.vfxKey}</span>
                )}
                {sh.modelKeys.length > 0 && (
                  <span style={{ fontFamily: MONO, color: TEXT_DIM }}>
                    {" "}
                    ⟨{sh.modelKeys.join(", ")}⟩
                  </span>
                )}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function FamilyBlock({ fam }: { fam: Family }): React.JSX.Element {
  const [open, setOpen] = useState(fam.dummyCount >= 4);
  return (
    <div style={{ border: PANEL_BORDER, borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          width: "100%",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: MONO, fontSize: 14, color: GOLD }}>{fam.mdl}</span>
        {fam.familyLabel && (
          <span style={{ fontSize: 12, color: TEXT_MAIN }}>{fam.familyLabel}</span>
        )}
        <span style={{ fontSize: 12, color: TEXT_DIM }}>
          {fam.dummyCount} dummies · {fam.spawnSiteTotal} 生成點
          {fam.zeroSpawnDummies > 0 && ` · ${fam.zeroSpawnDummies} 零生成`}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <StatusChip status={fam.status} />
        </span>
      </button>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                <Th>rawcode</Th>
                <Th>dummy 名</Th>
                <Th align="right">scale</Th>
                <Th align="right">生成點</Th>
                <Th>生成處（j:行號 · trigger）</Th>
                <Th>原作技能 → GGD 落點（vfxKey ⟨modelKey⟩）</Th>
              </tr>
            </thead>
            <tbody>
              {fam.dummies.map((d) => (
                <tr key={d.rawcode}>
                  <Td mono nowrap>{d.rawcode}</Td>
                  <Td>{d.name}</Td>
                  <Td align="right" mono>{d.scale ?? "—"}</Td>
                  <Td align="right" mono color={d.spawnSites === 0 ? TEXT_DIM : TEXT_MAIN}>
                    {d.spawnSites}
                  </Td>
                  <Td mono color={TEXT_DIM}>
                    {d.sites.length === 0 ? (
                      "—"
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {d.sites.map((s, i) => (
                          <span key={i} style={{ fontSize: 12 }}>
                            j:{s.line ?? "?"}
                            {s.trigger ? ` ${s.trigger}` : ""}
                            {s.count > 1 ? ` ×${s.count}` : ""}
                          </span>
                        ))}
                        {d.siteOverflow > 0 && (
                          <span style={{ fontSize: 12 }}>…另 {d.siteOverflow} 處</span>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <SkillCell skills={d.skills} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MdlFamiliesPage(): React.JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyMulti, setOnlyMulti] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Family["status"]>("all");

  useEffect(() => {
    let dead = false;
    fetch("/__live/mdl-families")
      .then(async (r) => {
        const body = (await r.json()) as Payload;
        if (dead) return;
        if (!r.ok || body.error) setError(body.error ?? `HTTP ${r.status}`);
        else setData(body);
      })
      .catch((err) => {
        if (!dead) setError(String(err));
      });
    return () => {
      dead = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.families.filter((f) => {
      if (onlyMulti && f.dummyCount < 2) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (needle === "") return true;
      const hay = [
        f.mdl,
        f.stem,
        f.familyLabel ?? "",
        ...f.dummies.flatMap((d) => [
          d.rawcode,
          d.name,
          ...d.skills.flatMap((s) => [
            s.rawcode ?? "",
            s.w3xName ?? "",
            s.hero ?? "",
            ...s.shipped.flatMap((sh) => [sh.id, sh.vfxKey ?? "", ...sh.modelKeys]),
          ]),
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, onlyMulti, statusFilter]);

  if (error) {
    return (
      <Panel title="🌪 MDL 特效家族總表">
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/mdl-families 取資料失敗：{"
"}
          {error}
          {"

"}
          <span style={{ color: TEXT_DIM, fontFamily: "inherit" }}>
            （這一頁只在 dev server 有資料 —— middleware 由 vite configureServer 掛載）
          </span>
        </div>
      </Panel>
    );
  }
  if (!data) {
    return (
      <Panel title="🌪 MDL 特效家族總表">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（每次請求當場重跑 join）</div>
      </Panel>
    );
  }

  const st = data.stats;
  const statCell = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: TEXT_DIM }}>{label}</span>
      <span style={{ fontSize: 18, color: GOLD, fontFamily: MONO }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <Panel title="🌪 MDL 特效家族總表（一顆 MDL ＝ 一個特效家族）">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            join 每次請求當場重跑：OBJECTS.json 的 custom dummy 單位 × MODEL_USAGE 生成點 ×
            JASS_BEHAVIOR 行為卡 × CENSUS／ability-vfx-bindings × 出貨{" "}
            <code style={{ fontFamily: MONO }}>content/abilities</code>（vfxKey／modelKey
            引用出貨值，⛔ 零重算）。狀態欄是「落點對上幾成」的機器推導；
            人工清算裁決（刻意不轉等）看 docs/MDL特效家族總表.md。
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {statCell("MDL 總數", st.mdlCount)}
            {statCell("多 dummy 家族", st.multiDummyMdl)}
            {statCell("dummy 總數", st.dummyTotal)}
            {statCell("JASS 生成點", st.spawnSiteTotal)}
            {statCell("零生成 dummy", st.zeroSpawnDummies)}
            {statCell("✅ 已對上", st.byStatus.resolved ?? 0)}
            {statCell("🟡 部分", st.byStatus.partial ?? 0)}
            {statCell("⬜ 排隊", st.byStatus.queued ?? 0)}
            {statCell("⚪ 零證據", st.byStatus.noEvidence ?? 0)}
          </div>
          {data.honest.length > 0 && (
            <div style={{ fontSize: 12, color: WARN, lineHeight: 1.6 }}>
              {data.honest.map((h, i) => (
                <div key={i}>⚠️ {h}</div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <TextInput
              value={q}
              onChange={setQ}
              placeholder="過濾：MDL / rawcode / dummy 名 / 技能 / 英雄 / vfxKey…"
              style={{ minWidth: 360 }}
            />
            <label style={{ fontSize: 12, color: TEXT_MAIN, display: "flex", gap: 6 }}>
              <input
                type="checkbox"
                checked={onlyMulti}
                onChange={(e) => setOnlyMulti(e.target.checked)}
              />
              只看多 dummy 家族（≥2）
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              style={{
                background: "transparent",
                color: TEXT_MAIN,
                border: PANEL_BORDER,
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              <option value="all">全部狀態</option>
              <option value="resolved">✅ 落點已對上</option>
              <option value="partial">🟡 部分對上</option>
              <option value="queued">⬜ 排隊</option>
              <option value="noEvidence">⚪ 零證據</option>
            </select>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>
              符合 {rows.length} / {data.families.length} 個家族
            </span>
          </div>
        </div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((f) => (
          <FamilyBlock key={f.stem} fam={f} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
        computedAt {data._live?.computedAt ?? "?"} · 算了 {data._live?.ms ?? "?"} ms（mtime
        快取：來源檔沒動就回快取）
      </div>
    </div>
  );
}

/**
 * 📐 90支技能重製對照 —— owner 規格 ↔ 出貨 JSON 並排，差異標紅。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 mount 時 fetch `/__live/skill90`（dev-only vite middleware，
 * `tools/admin-live/datasets/skill90.mjs` 當場 spawn python3 讀
 * `tools/skill-remake/` 的規格表 + `content/abilities/` 出貨現值）。
 * ⛔ 零 build-time import、⛔ 頁面裡零份資料副本。
 *
 * drift 的語意與 `batch1.py --check` 同一條（GH#319）：出貨檔與產生器輸出
 * 不一致 ⇒ 下一次 `skills:sync` 會把它無聲改回去 —— 所以這裡先標紅。
 *
 * ⭐ GH#832 —— 這一頁**改得動的那一半**在最下面那個 Panel：冷卻／施法距離
 * 五級距表（`TierGrid`）。對照表兩欄本身仍唯讀（理由住 datasets/skill90.mjs），
 * ⛔ 但那兩欄的數字不住在它們身上 —— 它們在載入時查那兩張表（第〇·四守則）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { ReviewStrip } from "./ReviewStrip";
import { LiveEditCell } from "./LiveEditCell";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SLOT_ZH: Record<string, string> = {
  PASSIVE: "天生技",
  Q: "Q",
  W: "W",
  E: "E",
  R: "R",
  EX: "EX",
};

interface DriftEntry {
  key: string;
  gen: unknown;
  shipped: unknown;
}

interface SkillRow {
  num: string;
  id: string;
  name: string;
  cid: string;
  slot: string;
  spec: {
    cast: string;
    cd: number[];
    mp: number[];
    rng: number;
    maxRank?: number;
    radiusTier?: string;
    desc: string;
  };
  shipped: Record<string, unknown> | null;
  drift: DriftEntry[];
  effectKinds: string[];
}

/** 一張可編輯的五級距表（datasets/skill90.mjs 的 `tiers.<axis>`）。 */
interface TierAxis {
  path: string;
  enabled: boolean | null;
  error: string | null;
  /** 冷卻是巢狀（形狀→級別→秒），距離是平的（級別→距離）。 */
  table: Record<string, number | Record<string, number>> | null;
  /** 這 90 支裡有幾支**真的**從這張表解析（現算）。 */
  skills: number;
  bounds: { min: number | null; max: number | null; declaredMin: number; declaredMax: number; src: string };
  mismatch: boolean;
  autoShape?: boolean | null;
}

interface Skill90Data {
  total: number;
  driftSkills: number;
  missingShipped: number;
  heroes: { num: string; cid: string; count: number; driftCount: number }[];
  skills: SkillRow[];
  tiers: { cooldown: TierAxis; range: TierAxis };
  readonlySides: string;
  note: string;
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
        verticalAlign: "top",
      }}
    >
      {props.children}
    </td>
  );
}

function fmt(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** 展開列：owner 規格逐字（左）↔ 出貨 JSON（右），上方是 drift 明細（紅）。 */
function ExpandedRow(props: { s: SkillRow }): React.JSX.Element {
  const { s } = props;
  const driftKeys = new Set(s.drift.map((d) => d.key));
  const fieldRows: { label: string; spec: unknown; shipped: unknown; driftKey: string }[] = [
    { label: "施法型別", spec: s.spec.cast, shipped: s.shipped?.castType, driftKey: "castType" },
    { label: "冷卻", spec: s.spec.cd, shipped: s.shipped?.cooldown, driftKey: "cooldown" },
    { label: "MP", spec: s.spec.mp, shipped: s.shipped?.manaCost, driftKey: "manaCost" },
    { label: "施法距離", spec: s.spec.rng, shipped: s.shipped?.range, driftKey: "range" },
    {
      label: "階數",
      spec: s.spec.maxRank ?? `（由陣列長度推導：${s.spec.cd.length}）`,
      shipped: s.shipped?.maxRank,
      driftKey: "maxRank",
    },
    { label: "範圍級距", spec: s.spec.radiusTier, shipped: s.shipped?.radiusTier, driftKey: "radiusTier" },
  ];
  return (
    <tr>
      <td colSpan={9} style={{ padding: "10px 14px", borderTop: PANEL_BORDER, background: "#0e1320" }}>
        {s.drift.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: DANGER, marginBottom: 6 }}>
              ⛔ 出貨檔與產生器輸出不一致（{s.drift.length} 格）——
              下一次 skills:sync 會把出貨檔改回「產生器」那一欄：
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <Th>欄位</Th>
                  <Th>產生器（owner 規格的翻譯）</Th>
                  <Th>出貨現值</Th>
                </tr>
              </thead>
              <tbody>
                {s.drift.map((d) => (
                  <tr key={d.key}>
                    <Td mono color={DANGER}>
                      {d.key}
                    </Td>
                    <Td mono>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>
                        {typeof d.gen === "string" ? d.gen : JSON.stringify(d.gen, null, 1)}
                      </pre>
                    </Td>
                    <Td mono color={DANGER}>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>
                        {typeof d.shipped === "string" ? d.shipped : JSON.stringify(d.shipped, null, 1)}
                      </pre>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <table style={{ borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <Th>欄位</Th>
              <Th>規格</Th>
              <Th>出貨 JSON</Th>
            </tr>
          </thead>
          <tbody>
            {fieldRows.map((f) => (
              <tr key={f.label}>
                <Td color={TEXT_DIM}>{f.label}</Td>
                <Td mono>{fmt(f.spec)}</Td>
                <Td mono color={driftKeys.has(f.driftKey) ? DANGER : TEXT_MAIN}>
                  {fmt(f.shipped)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: GOLD, marginBottom: 4 }}>
              owner 原始規格（逐字，⛔ 不要改寫）
            </div>
            <pre
              style={{
                margin: 0,
                padding: 10,
                border: PANEL_BORDER,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: MONO,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: TEXT_MAIN,
                maxHeight: 420,
                overflow: "auto",
              }}
            >
              {s.spec.desc}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: GOLD, marginBottom: 4 }}>
              出貨 JSON（content/abilities/{s.id}.json 現值）
            </div>
            <pre
              style={{
                margin: 0,
                padding: 10,
                border: PANEL_BORDER,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: MONO,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: s.shipped ? TEXT_MAIN : DANGER,
                maxHeight: 420,
                overflow: "auto",
              }}
            >
              {s.shipped ? JSON.stringify(s.shipped, null, 2) : "（content/abilities 裡沒有這個檔）"}
            </pre>
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * ✏️ 可編輯的那一半（GH#832）—— **冷卻／施法距離五級距表**。
 *
 * 上面那張對照表兩欄都是唯讀的（規格側是 python、出貨側是 skillremake:json 的產物），
 * ⭐ 但那兩欄的**數字**不住在它們身上：技能文件存的是級別名（`cooldownTier` /
 * `rangeTier`），秒數與距離在載入時才查這兩張表（第〇·四守則）。
 * ⇒ 改一格，這一頁上落在那一格的每一支技能同時跟著變。
 *
 * 列的鍵（形狀／級別名）一律**從資料讀**，⛔ 頁面裡零份名單副本。
 */
function TierGrid(props: {
  axis: TierAxis;
  title: string;
  unit: string;
  /** 把（列鍵, 級別）翻成 JSON pointer —— 兩張表形狀不同，只有這一行不一樣。 */
  pointerFor: (row: string | null, tier: string) => string;
  onSaved: () => void;
}): React.JSX.Element {
  const { axis } = props;
  if (axis.error !== null || axis.table === null)
    return <div style={{ color: DANGER, fontSize: 12 }}>{axis.path} 讀不到：{axis.error ?? "沒有表"}</div>;
  const first = Object.values(axis.table)[0];
  const nested = typeof first === "object" && first !== null;
  const rows: { key: string | null; label: string; cells: Record<string, number> }[] = nested
    ? Object.entries(axis.table).map(([k, v]) => ({ key: k, label: k, cells: v as Record<string, number> }))
    : [{ key: null, label: props.unit, cells: axis.table as Record<string, number> }];
  const tiers = Object.keys(rows[0]?.cells ?? {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: GOLD, fontWeight: "bold" }}>
        {props.title}
        <span style={{ color: TEXT_DIM, fontWeight: "normal" }}>
          {" "}— 這 90 支裡 <b style={{ color: axis.skills > 0 ? OK : WARN }}>{axis.skills}</b> 支從它解析
          {axis.enabled === false && <b style={{ color: DANGER }}> ⛔ 級距總開關是關的（這張表現在不生效）</b>}
        </span>
      </div>
      {axis.mismatch && (
        <div style={{ fontSize: 12, color: DANGER }}>
          ⛔ 宣告的上下界（{axis.bounds.declaredMin}–{axis.bounds.declaredMax}）與出貨 schema（
          {String(axis.bounds.min)}–{String(axis.bounds.max)}，{axis.bounds.src}）對不上 —— 存會被擋下。
        </div>
      )}
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>{nested ? "形狀" : ""}</Th>
            {tiers.map((t) => (
              <Th key={t}>{t}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <Td color={TEXT_DIM}>{r.label}</Td>
              {tiers.map((t) => (
                <Td key={t} mono>
                  <LiveEditCell
                    dataset="skill90"
                    path={axis.path}
                    pointer={props.pointerFor(r.key, t)}
                    current={r.cells[t] ?? null}
                    type="number"
                    onSaved={props.onSaved}
                  />
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 📐 90支技能重製對照（GET /__live/skill90，實時計算）。 */
export function Skill90Page(): React.JSX.Element {
  const [data, setData] = useState<Skill90Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [driftOnly, setDriftOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch("/__live/skill90")
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!alive) return;
        const b = body as (Skill90Data & { error?: string }) | null;
        if (!res.ok || b === null || typeof b.error === "string") {
          setError(`GET /__live/skill90 → HTTP ${res.status}${b?.error ? `：${b.error}` : ""}`);
          return;
        }
        setData(b);
      })
      .catch((err: unknown) => {
        if (alive) setError(`GET /__live/skill90 失敗：${String(err)}（dev server 才有這條路由）`);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const rows = useMemo(() => {
    if (data === null) return [];
    const needle = q.trim().toLowerCase();
    return data.skills.filter((s) => {
      if (driftOnly && s.drift.length === 0) return false;
      if (needle === "") return true;
      return `${s.num} ${s.id} ${s.name} ${s.cid} ${s.effectKinds.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [data, q, driftOnly]);

  if (error !== null) {
    return (
      <Panel title="📐 90支技能重製對照">
        <ReviewStrip family={["skillremake", "90"]} title="90 支重製" />
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>{error}</div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="📐 90支技能重製對照">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（spawn python3 讀 tools/skill-remake 規格表）</div>
      </Panel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <Panel
        title={`📐 90支技能重製對照（共 ${data.total} 支 / 15 位英雄）`}
        right={
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            style={{
              background: "transparent",
              border: PANEL_BORDER,
              borderRadius: 6,
              color: TEXT_DIM,
              padding: "3px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ↻ 重算
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            owner 規格（<code style={{ fontFamily: MONO }}>tools/skill-remake/</code> 的表，逐字）↔ 出貨 JSON（
            <code style={{ fontFamily: MONO }}>content/abilities/</code> 現值）並排。{data.note}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: data.driftSkills > 0 ? DANGER : OK, fontWeight: "bold" }}>
              {data.driftSkills > 0
                ? `⛔ ${data.driftSkills} 支與產生器輸出不一致`
                : "✓ 90 支全部與產生器輸出一致"}
            </span>
            {data.missingShipped > 0 && (
              <span style={{ fontSize: 13, color: DANGER, fontWeight: "bold" }}>
                ⛔ {data.missingShipped} 支出貨檔不存在
              </span>
            )}
            <span style={{ fontSize: 12, color: TEXT_DIM }}>
              {data.heroes
                .filter((h) => h.driftCount > 0)
                .map((h) => `${h.num}(${h.cid}) ${h.driftCount} 支`)
                .join("、")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <TextInput value={q} onChange={setQ} placeholder="過濾：編號 / 技能 id / 名 / 英雄 / effect kind…" />
            </div>
            <label style={{ fontSize: 13, color: driftOnly ? WARN : TEXT_DIM, cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={driftOnly}
                onChange={(e) => setDriftOnly(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              只看有差異
            </label>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <Th>編號</Th>
                  <Th>技能 id</Th>
                  <Th>名稱</Th>
                  <Th>格</Th>
                  <Th align="right">冷卻</Th>
                  <Th align="right">MP</Th>
                  <Th align="right">距離</Th>
                  <Th>效果 kinds</Th>
                  <Th>差異</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const driftKeys = new Set(s.drift.map((d) => d.key));
                  const isOpen = open[s.id] === true;
                  return (
                    <FragmentRow
                      key={s.id}
                      s={s}
                      isOpen={isOpen}
                      driftKeys={driftKeys}
                      onToggle={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div style={{ fontSize: 13, color: TEXT_DIM }}>沒有符合過濾條件的技能。</div>
          )}
          <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "right" }}>
            這一頁算於 {data._live?.computedAt ?? "？"}（{data._live?.ms ?? "？"} ms，md5 快取：deps bytes 沒變就不重算）
          </div>
        </div>
      </Panel>

      <Panel title="✏️ 這一頁改得動的那一半 — 冷卻／施法距離五級距">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            上面那張對照表的兩欄都是唯讀的：{data.readonlySides}
            ⭐ 但那兩欄的<b style={{ color: TEXT_MAIN }}>數字</b>不住在它們身上 —— 技能文件存的是
            <b style={{ color: TEXT_MAIN }}>級別名</b>（
            <code style={{ fontFamily: MONO }}>cooldownTier</code> /
            <code style={{ fontFamily: MONO }}>rangeTier</code>），秒數與距離在載入時才查下面這兩張表。
            改一格，落在那一格的每一支技能同時跟著變。
          </div>
          <TierGrid
            axis={data.tiers.cooldown}
            title="冷卻五級距（卡面秒）"
            unit="秒"
            pointerFor={(row, tier) => `/seconds/${row ?? ""}/${tier}`}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
          <TierGrid
            axis={data.tiers.range}
            title="施法距離五級距（GGD 單位）"
            unit="距離"
            pointerFor={(_row, tier) => `/range/${tier}`}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
          <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.7 }}>
            ⚠️ 這裡的秒數是<b style={{ color: TEXT_MAIN }}>卡面秒</b> —— 玩家實際等到的還要乘「戰鬥系統」頁的
            <code style={{ fontFamily: MONO }}>cooldown</code> 係數再夾一次地板。
            <br />
            ⚠️{" "}
            <b style={{ color: WARN }}>
              後台設定頁存的是 <code style={{ fontFamily: MONO }}>data/</code> 的耐久覆蓋層，而覆蓋層會蓋掉{" "}
              <code style={{ fontFamily: MONO }}>content/config/*.json</code>
            </b>{" "}
            —— 線上存過一次之後，這裡改檔案不會生效。
            <br />
            ⚠️ 改完要 <code style={{ fontFamily: MONO }}>pnpm content:build</code> 並把產物一起 commit；
            三個住處的另外兩個（Zod <code style={{ fontFamily: MONO }}>DEFAULT_*</code> 與 admin
            <code style={{ fontFamily: MONO }}> SHIPPED_*</code>）由 drift 測試點名。
            <br />
            ⛔ <b style={{ color: TEXT_MAIN }}>耗魔級距刻意沒開</b>：它的上界是算出來的（
            <code style={{ fontFamily: MONO }}>Math.floor(medianFinalMana(…))</code>），這裡宣告任何數字都會是
            第二個住處而且會無聲過期。
            <br />
            ↩️ rollback：把那一格改回原值（或把該表的
            <code style={{ fontFamily: MONO }}> enabled</code> 關掉 → 技能退回自己手寫的陣列）。
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FragmentRow(props: {
  s: SkillRow;
  isOpen: boolean;
  driftKeys: Set<string>;
  onToggle: () => void;
}): React.JSX.Element {
  const { s, isOpen, driftKeys, onToggle } = props;
  const cd = s.shipped?.cooldown;
  const mp = s.shipped?.manaCost;
  const rng = s.shipped?.range;
  const cdText = Array.isArray(cd) ? cd.join("/") : "—";
  const mpText = Array.isArray(mp) ? mp.join("/") : "—";
  const rngText = typeof rng === "number" ? String(rng) : "—";
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <Td mono color={TEXT_DIM}>
          {isOpen ? "▾ " : "▸ "}
          {s.num}
        </Td>
        <Td mono>{s.id}</Td>
        <Td>{s.name}</Td>
        <Td mono color={TEXT_DIM}>
          {SLOT_ZH[s.slot] ?? s.slot}
        </Td>
        <Td align="right" mono color={driftKeys.has("cooldown") ? DANGER : GOLD}>
          {cdText}
        </Td>
        <Td align="right" mono color={driftKeys.has("manaCost") ? DANGER : TEXT_MAIN}>
          {mpText}
        </Td>
        <Td align="right" mono color={driftKeys.has("range") ? DANGER : TEXT_MAIN}>
          {rngText}
        </Td>
        <Td mono color={TEXT_DIM}>
          {s.effectKinds.join(", ") || "—"}
        </Td>
        <Td color={s.drift.length > 0 ? DANGER : OK} mono>
          {s.drift.length > 0 ? `⛔ ${s.drift.map((d) => d.key).join(", ")}` : "✓"}
        </Td>
      </tr>
      {isOpen && <ExpandedRow s={s} />}
    </>
  );
}

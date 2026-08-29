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
 * ⭐ GH#823 —— 這一頁**不再是唯讀的**。owner 2026-08-27（逐字）：
 * > 「我說過**全部都要即時動態資料讀取及儲存（by JSON）, 不是唯讀**，你這樣怎麼算驗收呢」
 *
 * GGD 側那一格開了四個編輯點（共用 LiveEditCell → POST /__live/jass-vfx/save →
 * 寫回 `content/abilities/<id>.json`，寫前過規格 + vfx 名冊 check + genguard）：
 * `vfxKey` · `vfxLayers[i].vfxKey` · `vfxLayers[i].delayMs` · `persistentVfx[i].vfxKey`。
 * ⭐「⛔ 缺實作」那幾列的修法就在原地：那一列的 vfxKey 是空的，填一個就補上了。
 * ⛔ 巢狀 effects / config 綁定仍然唯讀（一個是技能編輯器的事，一個是產生器的產物）。
 *
 * 「設定」半邊（家族原型、pitch/scale/色）住在既有的 鑄技工坊 · 特效綁定 頁（vfxForge）
 * ——這裡只連過去，⛔ 不複製第二份表單。fetch 失敗畫出錯誤（fail-open 沒錯，靜默才是缺陷）。
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../store";
import { Panel, TextInput } from "../widgets";
import { ACCENT, DANGER, DANGER_BG, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { ReviewStrip } from "./ReviewStrip";
import { LiveEditCell } from "./LiveEditCell";

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
/** 一格陣列成員 —— `i` 是**磁碟上那份 JSON 的索引**，寫入端拿它組 pointer。 */
interface GgdVfxSlot {
  i: number;
  vfxKey: string | null;
  delayMs?: number | null;
}
interface GgdSide {
  vfxKey: string | null;
  vfxLayers: GgdVfxSlot[];
  persistentVfx: GgdVfxSlot[];
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

/**
 * GGD 側一格：vfxKey / vfxLayers / persistentVfx / effects / config 綁定。
 *
 * ⭐ 前三種是**可編輯**的（共用 LiveEditCell，存回 content/abilities/<id>.json）；
 * effects 是巢狀節點（單格 pointer 表達不了，屬於技能編輯器）、cfg 是 skills:sync
 * 的產物（改它下一次 sync 打回來）—— 那兩種**刻意留唯讀**。
 */
function GgdCell(props: { id: string; ggd: GgdSide | undefined; onSaved: () => void }): React.JSX.Element {
  const g = props.ggd;
  if (g === undefined) return <span style={{ color: TEXT_DIM }}>—</span>;
  const path = `content/abilities/${props.id}.json`;
  const cell = (pointer: string, current: string | number | null, type: "string" | "number", nullable: boolean) => (
    <LiveEditCell
      dataset="jass-vfx"
      path={path}
      pointer={pointer}
      current={current}
      type={type}
      nullable={nullable}
      onSaved={props.onSaved}
    />
  );
  const empty =
    g.vfxKey === null &&
    g.vfxLayers.length === 0 &&
    g.persistentVfx.length === 0 &&
    g.effects.length === 0 &&
    g.cfgVfxKeys.length === 0;
  return (
    <div>
      {empty && (
        <div style={{ color: DANGER, fontSize: 11.5 }}>（零特效表達 —— ✏️ 填一個 vfxKey 就是這一列的修法）</div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 11.5 }}>vfxKey: {cell("/vfxKey", g.vfxKey, "string", true)}</div>
      {g.vfxLayers.map((l) => (
        <div key={`vl${l.i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
          layer{l.i}: {cell(`/vfxLayers/${l.i}/vfxKey`, l.vfxKey, "string", false)} · +
          {cell(`/vfxLayers/${l.i}/delayMs`, l.delayMs ?? null, "number", true)}ms
        </div>
      ))}
      {g.persistentVfx.map((p) => (
        <div key={`pv${p.i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
          persistent{p.i}: {cell(`/persistentVfx/${p.i}/vfxKey`, p.vfxKey, "string", false)}
        </div>
      ))}
      {g.effects.map((e, i) => (
        <div key={`e${i}`} style={{ fontFamily: MONO, fontSize: 11.5 }}>
          {e.kind}: {e.key ?? e.preset ?? "?"}
          {e.count !== undefined ? ` ×${e.count}` : ""}
        </div>
      ))}
      {g.cfgVfxKeys.map((k, i) => (
        <div key={`c${i}`} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT_DIM }}>
          cfg: {k}
        </div>
      ))}
    </div>
  );
}

export function JassVfxPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  /** ✏️ 存完就 +1 ⇒ 重抓 —— ⭐ 頁上看到的是**重讀後**的值，⛔ 不是我本地猜的。 */
  const [reloadTick, setReloadTick] = useState(0);

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
  }, [reloadTick]);

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
            ；「已替換」＝兩邊都有但模型不同（GGD 重製，不一定是錯）。
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            ✏️ GGD 側的 <code style={{ fontFamily: MONO }}>vfxKey</code>、
            <code style={{ fontFamily: MONO }}>layer&lt;i&gt;</code> 的模板與延遲毫秒、
            <code style={{ fontFamily: MONO }}>persistent&lt;i&gt;</code> 這四格
            <b>當場可改</b>，經共用寫入端存回 <code style={{ fontFamily: MONO }}>content/abilities/&lt;id&gt;.json</code>
            （GH#823；寫前驗 vfx 名冊＋過 genguard，存完重抓 —— 看到的是重讀後的值）。
            ⛔ <code style={{ fontFamily: MONO }}>spawnModelFx</code> 等巢狀節點與{" "}
            <code style={{ fontFamily: MONO }}>cfg:</code>（skills:sync 的產物）仍唯讀。
            特效的<b>外觀設定</b>（家族原型 · pitch/scale/色）在
            <a
              style={{ color: ACCENT, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("vfxForge")}
            >
              鑄技工坊 · 特效綁定
            </a>
            （⛔ 這裡不放第二份表單）。⚠️ 改完 content/ 出貨前要跑 pnpm content:build 並 commit 產物。
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
                        <GgdCell id={r.id} ggd={r.ggd} onSaved={() => setReloadTick((t) => t + 1)} />
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
            {data._live?.computedAt ?? "?"}（{data._live?.ms ?? "?"} ms，deps md5 沒變時走快取）
          </div>
        </div>
      </Panel>
    </div>
  );
}

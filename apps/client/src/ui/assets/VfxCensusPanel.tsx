/**
 * VfxCensusPanel — 特效真實引用普查, the VIEW half of #230.
 *
 * WHAT THE OWNER ASKED FOR, LITERALLY. 「請你盤點所有英雄、技能清單，告訴我真實的
 * 狀況」— every champion, every slot, the model the SOURCE MAP really used, what
 * the game binds today, and an honest verdict. So the matrix is complete: 668
 * ability documents, not a filtered highlight reel, with the filter row starting
 * on the actionable statuses because that is what gets acted on.
 *
 * THREE THINGS THIS PAGE REFUSES TO DO
 * ------------------------------------
 *  1. It never says "unused" about an extraction that plays as a SECONDARY layer.
 *     `vfxKey` is one string but a WC3 effect is a set of emitters, so most of a
 *     promoted family reaches the screen through `extraVfxDocIds()`. Counting
 *     only `vfxKey` is what produced the original 「106 支閒置」 overstatement.
 *  2. It never leaves an unbound extraction unexplained. Every unreached layer
 *     carries a reason, and the reasons are different debts with different
 *     owners: `layout-gate` is a RENDERER task, `no-referencing-ability` is not
 *     a debt at all, `zero-geometry` is #98, `not-promoted` is the real backlog.
 *  3. It never presents a judgement call as a fact. The rows left on a primitive
 *     although the renderer could play their real art are listed by name with
 *     the reason spelled out, for the owner to overrule.
 *
 * EVERYTHING IS COMPUTED AT VIEW TIME from the shipped content plus the
 * archaeology sidecar (see vfxCensus.ts). Rebind one `vfxKey`, reopen, and the
 * totals move — there is no generated table to keep in step.
 */
import { useMemo, useState } from "react";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { Btn } from "../platform/widgets";
import type { CodexData } from "@ggd/shared/codex/codexTypes";
import {
  buildCensusRows,
  extractionLedger,
  ledgerTotals,
  missingExtractions,
  perChampion,
  statusTotals,
  STATUS_LABEL,
  STATUS_ORDER,
  type CensusRow,
  type CensusStatus,
  type UnreachedWhy,
} from "./vfxCensus";
import { REGENERATE_COMMAND, useVfxCensusSources } from "./useVfxCensus";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const OK = "#57c98a";
const WARN = "#e0a878";
const BAD = "#f08c8c";
const CALM = "#7f8ba3";

const STATUS_COLOR: Readonly<Record<CensusStatus, string>> = {
  "TRUE-PORT": OK,
  "PRIMITIVE-SUBSTITUTE": WARN,
  "PRIMITIVE-NECESSARY": CALM,
  "LEGACY-KEY": BAD,
  "NO-CAST": CALM,
  "NO-SOURCE": CALM,
  "MIS-BOUND": BAD,
};

/** Why each status is or is not debt — the legend the owner reads first. */
const STATUS_MEANING: Readonly<Record<CensusStatus, string>> = {
  "TRUE-PORT": "綁的就是原圖那顆 mdx 抽出來的特效 —— 這才叫忠實",
  "PRIMITIVE-SUBSTITUTE": "原作特效已經抽出來躺在 content/vfx，技能卻還用通用替身 —— 可以動的缺口",
  "PRIMITIVE-NECESSARY": "原作用的是暴雪內建 .mdl 或閃電 id，抽不出來，通用替身是正確答案（#81/#116）",
  "LEGACY-KEY": "還掛在舊制 key（fx.firestorm…），既不是通用件也不是原作件",
  "NO-CAST": "本來就沒有施法特效（多半是天生技）—— 不是債",
  "NO-SOURCE": "原圖這支技能根本沒指定任何特效模型",
  "MIS-BOUND": "綁到不屬於這支技能的美術 —— 這是 bug",
};

const WHY_LABEL: Readonly<Record<UnreachedWhy, string>> = {
  "layout-gate": "整組發射器都掛在模型的動畫節點上；戰鬥路徑目前是「攤平播放」，綁下去會塌成一根柱子（需先接 W3xCastFx 版面）",
  "no-referencing-ability": "沒有任何技能引用這顆模型（球體載具／道具／已廢內容）—— 不必硬找歸宿",
  "zero-geometry": "抽出來只有版面沒有幾何（#98 零幾何問題）—— 不能當 vfxKey",
  "not-promoted": "可以播、也有技能引用，只是還沒升級 —— 這才是真正的待辦",
};

const SLOT_LABEL: Readonly<Record<string, string>> = {
  PASSIVE: "天生",
  Q: "Q",
  W: "W",
  E: "E",
  R: "R",
  EX: "EX",
};

function Chip({
  color,
  children,
  onClick,
  active,
}: {
  color: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit",
        fontSize: 11,
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${active ? color : "#232b3d"}`,
        background: active ? `${color}22` : "#0a0d14",
        color,
        borderRadius: 999,
        padding: "2px 9px",
      }}
    >
      {children}
    </button>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: number }): React.JSX.Element {
  return (
    <th
      style={{
        textAlign: "left",
        fontSize: 10,
        color: TEXT_DIM,
        fontWeight: 700,
        padding: "4px 6px",
        borderBottom: PANEL_BORDER,
        whiteSpace: "nowrap",
        width: w,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }): React.JSX.Element {
  return (
    <td
      style={{
        fontSize: 11,
        padding: "3px 6px",
        borderBottom: "1px solid #161d2b",
        verticalAlign: "top",
        fontFamily: mono ? MONO : undefined,
        color: mono ? "#c8d2e6" : TEXT_MAIN,
      }}
    >
      {children}
    </td>
  );
}

/**
 * The real art of one row, strongest provenance first. `stock-inherited` is
 * dimmed rather than hidden: it is the honest answer to "so what DID the map
 * use", and it is also the evidence for why 388 rows can never be ported.
 */
function RealArtCell({ row }: { row: CensusRow }): React.JSX.Element {
  if (row.realArt.length === 0) {
    return <span style={{ color: TEXT_DIM }}>—</span>;
  }
  const rank = (p: string): number =>
    p === "jass-literal" ? 0 : p === "w3a-override" ? 1 : p === "w3h-override" ? 2 : 3;
  const sorted = [...row.realArt].sort((a, b) => rank(a.provenance) - rank(b.provenance));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sorted.slice(0, 4).map((a) => (
        <span
          key={`${a.channel}:${a.path}`}
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: a.provenance === "stock-inherited" ? TEXT_DIM : "#c8d2e6",
          }}
          title={`${a.channel} · ${a.provenance} · ${a.assetStatus}`}
        >
          {a.path}
        </span>
      ))}
      {sorted.length > 4 && (
        <span style={{ fontSize: 10, color: TEXT_DIM }}>…另外 {sorted.length - 4} 個通道</span>
      )}
    </div>
  );
}

// --------------------------------------------------------------- panel -----

export function VfxCensusPanel({ data }: { data: CodexData | null }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const src = useVfxCensusSources(open);
  const [filter, setFilter] = useState<CensusStatus | "ALL">("PRIMITIVE-SUBSTITUTE");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      buildCensusRows(
        (data?.abilities ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          slot: a.slot,
          championId: a.championId,
          vfxKey: a.vfxKey,
        })),
        (data?.champions ?? []).map((c) => ({ id: c.id, name: c.name })),
        src.provenance,
        src.vfxDocIds,
      ),
    [data, src.provenance, src.vfxDocIds],
  );

  const totals = useMemo(() => statusTotals(rows), [rows]);
  const champs = useMemo(() => perChampion(rows), [rows]);
  const ledger = useMemo(
    () =>
      extractionLedger(
        src.families,
        (data?.abilities ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          slot: a.slot,
          championId: a.championId,
          vfxKey: a.vfxKey,
        })),
        src.provenance,
      ),
    [src.families, src.provenance, data],
  );
  const lt = useMemo(() => ledgerTotals(ledger), [ledger]);
  const missing = useMemo(() => missingExtractions(src.provenance, src.vfxDocIds), [src]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "ALL" || r.status === filter) &&
        (!q ||
          r.championName.toLowerCase().includes(q) ||
          r.abilityName.toLowerCase().includes(q) ||
          r.abilityId.toLowerCase().includes(q) ||
          (r.currentVfxKey ?? "").toLowerCase().includes(q)),
    );
  }, [rows, filter, query]);

  const ownerRows = rows.filter((r) => r.leftReason === "owner-decision");

  if (!open) {
    return (
      <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
        每個英雄 × 每個技能欄位：原圖真正用的特效模型、現在綁的 <code style={{ fontFamily: MONO }}>vfxKey</code>、
        以及是「真實移植 / 通用替身 / 抽不出來」。全部在開啟時即時算出來，不是寫死的報告。
        <div style={{ marginTop: 8 }}>
          <Btn small onClick={() => setOpen(true)}>
            展開普查（會載入約 540 kB 的考古側檔）
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      {src.loading && <div style={{ fontSize: 11, color: TEXT_DIM }}>正在讀取考古側檔…</div>}
      {src.missing.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: WARN,
            border: `1px solid ${WARN}55`,
            borderRadius: 6,
            padding: "6px 8px",
            marginBottom: 10,
            lineHeight: 1.7,
          }}
        >
          缺少 {src.missing.join("、")} —— 下半（原圖真正用什麼）無法顯示。
          重新產生：<code style={{ fontFamily: MONO }}>{REGENERATE_COMMAND}</code>
        </div>
      )}

      {/* ---- status legend + totals -------------------------------------- */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <Chip color={GOLD} onClick={() => setFilter("ALL")} active={filter === "ALL"}>
          全部 {totals.rows}
        </Chip>
        {STATUS_ORDER.map((s) => (
          <Chip
            key={s}
            color={STATUS_COLOR[s]}
            onClick={() => setFilter(s)}
            active={filter === s}
          >
            {STATUS_LABEL[s]} {totals.totals[s]}
          </Chip>
        ))}
      </div>
      <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 10 }}>
        {STATUS_ORDER.filter((s) => totals.totals[s] > 0).map((s) => (
          <div key={s}>
            <b style={{ color: STATUS_COLOR[s] }}>{STATUS_LABEL[s]}</b> — {STATUS_MEANING[s]}
          </div>
        ))}
      </div>

      {/* ---- owner-decision rows ----------------------------------------- */}
      {ownerRows.length > 0 && (
        <div
          style={{
            border: `1px solid ${WARN}44`,
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 12,
            fontSize: 11,
            lineHeight: 1.8,
          }}
        >
          <b style={{ color: WARN }}>等你決定（{ownerRows.length}）</b>
          <div style={{ color: TEXT_DIM, marginTop: 2 }}>
            這些技能的原作特效已經抽出來、而且引擎現在就播得動，仍然刻意留在通用替身上。理由如下，你說了算。
          </div>
          {ownerRows.map((r) => (
            <div key={r.abilityId} style={{ marginTop: 6 }}>
              <span style={{ fontFamily: MONO, color: "#c8d2e6" }}>{r.abilityId}</span>{" "}
              <span style={{ color: TEXT_MAIN }}>
                {r.championName} · {r.abilityName}
              </span>
              <div style={{ color: TEXT_DIM }}>{r.ownerNote}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---- the matrix --------------------------------------------------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋英雄／技能／vfxKey"
          style={{
            font: "inherit",
            fontSize: 11,
            background: "#0a0d14",
            border: "1px solid #232b3d",
            borderRadius: 4,
            color: TEXT_MAIN,
            padding: "3px 8px",
            minWidth: 180,
          }}
        />
        <span style={{ fontSize: 10, color: TEXT_DIM }}>顯示 {shown.length} 列</span>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", marginBottom: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead>
            <tr>
              <Th w={130}>英雄</Th>
              <Th w={44}>欄位</Th>
              <Th w={190}>技能</Th>
              <Th>原圖真正用的模型</Th>
              <Th w={210}>目前綁定</Th>
              <Th w={130}>判定</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.abilityId}>
                <Td>{r.championName}</Td>
                <Td>{SLOT_LABEL[r.slot] ?? r.slot}</Td>
                <Td>
                  {r.abilityName}
                  <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                    {r.abilityId}
                    {r.rawcodes.length > 0 && ` · ${r.rawcodes.join("/")}`}
                  </div>
                </Td>
                <Td>
                  <RealArtCell row={r} />
                </Td>
                <Td mono>
                  {r.currentVfxKey ?? "—"}
                  {r.extraction && r.status !== "TRUE-PORT" && (
                    <div style={{ fontSize: 10, color: WARN }}>
                      可換：{r.extraction.fxId ?? r.extraction.family}（
                      {r.extractionDocsPresent.length} 個文件 · {r.extraction.rootAnchored}/
                      {r.extraction.emitterTotal} 根節點）
                    </div>
                  )}
                </Td>
                <Td>
                  <span style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  {r.leftReason === "renderer-gate" && (
                    <div style={{ fontSize: 10, color: TEXT_DIM }}>擋在算圖限制</div>
                  )}
                  {r.leftReason === "owner-decision" && (
                    <div style={{ fontSize: 10, color: WARN }}>等你決定</div>
                  )}
                  {r.joinConfidence !== "CONFIRMED" && (
                    <div style={{ fontSize: 10, color: TEXT_DIM }}>對應：{r.joinConfidence}</div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- the extraction ledger ---------------------------------------- */}
      <h3 style={{ margin: "0 0 4px", fontSize: 12, color: TEXT_MAIN }}>
        抽出來的特效有沒有真的上場（{lt.layers} 個圖層）
      </h3>
      <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 6 }}>
        一個 <code style={{ fontFamily: MONO }}>vfxKey</code> 只指得到一顆發射器，但一個原作特效是一整組。
        其餘圖層是靠 <code style={{ fontFamily: MONO }}>extraVfxDocIds()</code> 一起播的 ——
        所以「不是 vfxKey」不等於「沒用到」。
        <div>
          主鍵 <b style={{ color: OK }}>{lt.primary}</b> · 伴隨播放{" "}
          <b style={{ color: OK }}>{lt.extra}</b> · 完全沒上場{" "}
          <b style={{ color: lt.unreached > 0 ? WARN : OK }}>{lt.unreached}</b>
        </div>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.9, marginBottom: 6 }}>
        {(Object.keys(lt.byWhy) as UnreachedWhy[])
          .filter((w) => lt.byWhy[w] > 0)
          .map((w) => (
            <div key={w}>
              <b style={{ color: w === "not-promoted" ? WARN : CALM }}>
                {lt.byWhy[w]} 個 · {w}
              </b>
              <span style={{ color: TEXT_DIM }}> — {WHY_LABEL[w]}</span>
            </div>
          ))}
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 14 }}>
        分類供給：
        {Object.entries(lt.byFamily).map(([f, v]) => (
          <span key={f} style={{ marginRight: 10 }}>
            {f === "particle" ? "粒子" : f === "orb" ? "球體" : f === "locust" ? "蝗蟲群" : f}{" "}
            {v.reached}/{v.total}
          </span>
        ))}
      </div>

      {/* ---- the missing-extraction backlog -------------------------------- */}
      <h3 style={{ margin: "0 0 4px", fontSize: 12, color: TEXT_MAIN }}>
        技能真的引用、但還沒有 fx.w3x 家族的模型（{missing.length}）
      </h3>
      <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 6 }}>
        上半（有發射器）是 #183 再推導的待辦；下半（0 發射器）是純網格美術，粒子管線永遠產不出來，
        要走模型／掛點路徑，不是同一筆債。
      </div>
      <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
          <thead>
            <tr>
              <Th w={220}>模型</Th>
              <Th w={90}>發射器</Th>
              <Th w={90}>已抽 godie-*</Th>
              <Th>被幾支技能引用</Th>
            </tr>
          </thead>
          <tbody>
            {missing.map((m) => (
              <tr key={m.stem}>
                <Td mono>{m.stem}</Td>
                <Td>
                  {m.emitterTotal === 0 ? (
                    <span style={{ color: CALM }}>0（純網格）</span>
                  ) : (
                    <span style={{ color: WARN }}>
                      {m.emitterTotal}（{m.rootAnchored} 根節點）
                    </span>
                  )}
                </Td>
                <Td>{m.hasGodieDocs ? <span style={{ color: OK }}>有</span> : "—"}</Td>
                <Td>
                  {m.referencedBy.length}
                  <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                    {m.referencedBy.slice(0, 6).join(" ")}
                    {m.referencedBy.length > 6 && " …"}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

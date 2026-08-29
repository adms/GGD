/**
 * 🧬 EX解放／EX∅ 根源 三選一 —— 唯讀 live 對照頁（GET /__live/ex-roots）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ mount 時 fetch `/__live/ex-roots`（tools/admin-live/datasets/ex-roots.mjs
 * 當場掃 content/），⛔ 不 build-time import JSON、⛔ 不把資料抄進這個檔。
 *
 * ⭐ 誠實：資料側**沒有**「每支 EX 技能三選一根源」的 per-skill 結構 ——
 * repo 裡「三選一×根源」的唯一結構是寶具獎池（EX＜EX解放＜EX∅根源 三階 +
 * offerCount=3 抽選）。這一頁把缺口印在最上面（dataset 的 `honest`），
 * 並列出最近的兩個既有結構：三階獎池逐件 + 逐英雄 EX 技能。
 *
 * 設定半邊（weaponTiers／機率／數量上限）**連去既有的 傳說武器三選一 頁**，
 * ⛔ 不在這裡複製第二份表單。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, Btn, TextInput } from "../widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { useApp } from "../../store";
import { ReviewStrip } from "./ReviewStrip";
import { LiveEditCell } from "./LiveEditCell";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** 寫入端的目標（與 datasets/ex-roots.mjs 的 write.rules 同一個檔）。 */
const RULES_PATH = "content/config/arena-rules.json";

interface PoolItemRow {
  id: string;
  name: string;
  missing?: boolean;
  tags?: string[];
  payloadKeys?: string[];
  emptyPayload?: boolean;
  modifiers?: string[];
  passives?: string[];
  descFirstLine?: string;
}
interface TierNow {
  id: string;
  minRound: number | null;
  maxRound: number | null;
  basePct: number;
  underdogFactor: number;
  underdogExponent: number;
  limitScope: string;
  limitCount: number;
}
interface Pool {
  table: string;
  poolName: string;
  tierLabel: string;
  tier: TierNow | null;
  itemCount: number;
  items: PoolItemRow[];
}
interface ExRow {
  championId: string;
  championName: string;
  exId: string;
  exName: string;
  broken?: boolean;
  cooldown?: number | null;
  cooldownTier?: string | null;
  manaCost?: number | null;
  castType?: string;
  templateRef?: string | null;
  hooks?: string[];
  effectKinds?: string[];
  tagLine?: string;
}
interface ExRootsData {
  ladder: string;
  draft: {
    offerCount: number | null;
    exUnlockRound: number | null;
    finalRound: number | null;
    round10WeaponTable: string | null;
    round10DraftBoth: boolean;
    weaponShelfOpen: boolean | null;
  };
  pools: Pool[];
  exAbilities: ExRow[];
  stats: {
    champions: number;
    championsWithEx: number;
    championsWithoutEx: string[];
    exAbilityDocs: number;
    orphanExDocs: string[];
    poolItems: number;
  };
  honest: string[];
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
      }}
    >
      {props.children}
    </td>
  );
}

export function ExRootsPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<ExRootsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qItem, setQItem] = useState("");
  const [qEx, setQEx] = useState("");

  const load = useCallback(() => {
    setError(null);
    fetch("/__live/ex-roots")
      .then(async (r) => {
        const body = (await r.json()) as ExRootsData & { error?: string };
        if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
        setData(body);
      })
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  }, []);
  useEffect(() => load(), [load]);

  const itemRows = useMemo(() => {
    if (!data) return [];
    const flat = data.pools.flatMap((p) =>
      p.items.map((it) => ({ pool: p, it })),
    );
    const needle = qItem.trim().toLowerCase();
    if (needle === "") return flat;
    return flat.filter(({ pool, it }) =>
      `${pool.tierLabel} ${it.id} ${it.name} ${(it.tags ?? []).join(" ")}`.toLowerCase().includes(needle),
    );
  }, [data, qItem]);

  const exRows = useMemo(() => {
    if (!data) return [];
    const needle = qEx.trim().toLowerCase();
    if (needle === "") return data.exAbilities;
    return data.exAbilities.filter((r) =>
      `${r.exId} ${r.exName} ${r.championId} ${r.championName} ${(r.effectKinds ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data, qEx]);

  if (error !== null) {
    return (
      <Panel title="🧬 EX解放根源三選一 — 載入失敗">
        <ReviewStrip family={["ex", "root", "liberation"]} title="EX 解放根源" />
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/ex-roots 回報：{error}
        </div>
        <div style={{ marginTop: 10 }}>
          <Btn onClick={load}>重試</Btn>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: TEXT_DIM }}>
          這一頁只在 dev server 有資料面（vite `/__live` middleware）；production build 沒有它。
        </div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="🧬 EX解放根源三選一">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>從 /__live/ex-roots 現算中…</div>
      </Panel>
    );
  }

  const d = data.draft;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1240 }}>
      <Panel
        title="🧬 EX解放／EX∅ 根源 三選一 — 資料側現況"
        right={<Btn small onClick={() => navigate("itemDraft")}>⚙ 設定：傳說武器三選一</Btn>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.honest.map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: i === 0 ? WARN : TEXT_DIM, lineHeight: 1.6 }}>
              {h}
            </div>
          ))}
          <div style={{ fontSize: 13, color: GOLD, marginTop: 4 }}>{data.ladder}</div>
          <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO }}>
            三選一 offerCount={String(d.offerCount)} · EX 解鎖回合={String(d.exUnlockRound)} · 決勝回合=
            {String(d.finalRound)}（寶具表 {d.round10WeaponTable ?? "—"}
            {d.round10DraftBoth ? " · 兩邊都抽" : ""}） · 貨架直買 weaponShelfOpen=
            {String(d.weaponShelfOpen)}
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            機率／劣勢加權／數量上限是 <code style={{ fontFamily: MONO }}>config.arena-rules@1.weaponTiers</code>
            的現值 —— 要改請走右上角的既有設定頁，⛔ 這一頁唯讀。
          </div>
        </div>
      </Panel>

      <Panel title={`寶具三階獎池 — 共 ${data.stats.poolItems} 件`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <Th>階級</Th>
                  <Th>獎池</Th>
                  <Th align="right">件數</Th>
                  <Th>出現回合</Th>
                  <Th align="right">平手方機率</Th>
                  <Th>劣勢加權</Th>
                  <Th>數量上限</Th>
                </tr>
              </thead>
              <tbody>
                {data.pools.map((p) => (
                  <tr key={p.table}>
                    <Td color={GOLD}>{p.tierLabel}</Td>
                    <Td mono>{p.table}</Td>
                    <Td align="right" mono>{p.itemCount}</Td>
                    <Td mono color={TEXT_DIM}>
                      {p.tier ? `${p.tier.minRound ?? 1}${p.tier.maxRound != null ? `–${p.tier.maxRound}` : " 起"}` : "依回合表排程"}
                    </Td>
                    <Td align="right" mono>{p.tier ? `${p.tier.basePct}%` : "—"}</Td>
                    <Td mono color={TEXT_DIM}>
                      {p.tier ? `×(1 + ${p.tier.underdogFactor}·D^${p.tier.underdogExponent})` : "—"}
                    </Td>
                    <Td color={TEXT_DIM}>{p.tier ? `每${p.tier.limitScope === "champion" ? "名英雄" : p.tier.limitScope} ${p.tier.limitCount} 件` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TextInput value={qItem} onChange={setQItem} placeholder="過濾：階級 / 寶具 id / 名 / tag…" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <Th>階級</Th>
                  <Th>寶具 id</Th>
                  <Th>名稱</Th>
                  <Th>效果（從 JSON 推導）</Th>
                  <Th>卡面第一句</Th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map(({ pool, it }) => (
                  <tr key={`${pool.table}|${it.id}`}>
                    <Td color={pool.table === "ex-origin-weapons" ? GOLD : TEXT_DIM}>{pool.tierLabel}</Td>
                    <Td mono>{it.id}</Td>
                    <Td color={it.missing ? DANGER : TEXT_MAIN}>{it.name}</Td>
                    <Td mono color={it.emptyPayload ? DANGER : TEXT_DIM}>
                      {it.missing
                        ? "⛔ 缺 item JSON"
                        : it.emptyPayload
                          ? "⛔ 空 payload（抽到等於空手）"
                          : [
                              ...(it.modifiers ?? []),
                              ...(it.passives ?? []),
                              ...(it.payloadKeys ?? []).filter((k) => k !== "modifiers" && k !== "passive"),
                            ].join(" · ")}
                    </Td>
                    <Td color={TEXT_DIM}>{it.descFirstLine ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Panel title={`逐英雄 EX 技能 — ${data.stats.championsWithEx}/${data.stats.champions} 位英雄有 EX（技能文件 ${data.stats.exAbilityDocs} 份）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            join：champion.exAbility → content/abilities/*.ex.json。
            {data.stats.championsWithoutEx.length > 0 && (
              <> 沒有 EX 的：{data.stats.championsWithoutEx.join("、")}。</>
            )}
            {data.stats.orphanExDocs.length > 0 && (
              <span style={{ color: WARN }}> 孤兒 EX 文件：{data.stats.orphanExDocs.join("、")}。</span>
            )}
          </div>
          <TextInput value={qEx} onChange={setQEx} placeholder="過濾：技能 id / 名 / 英雄 / effect kind…" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <Th>EX id</Th>
                  <Th>技能名</Th>
                  <Th>英雄</Th>
                  <Th align="right">冷卻</Th>
                  <Th>觸發</Th>
                  <Th>機制（effect kinds）</Th>
                  <Th>模板</Th>
                </tr>
              </thead>
              <tbody>
                {exRows.map((r) => (
                  <tr key={r.exId}>
                    <Td mono>{r.exId}</Td>
                    <Td color={r.broken ? DANGER : TEXT_MAIN}>{r.exName}</Td>
                    <Td color={TEXT_DIM}>{r.championName}</Td>
                    <Td align="right" mono color={GOLD}>
                      {r.cooldown != null ? r.cooldown : "—"}
                      {r.cooldownTier ? `（${r.cooldownTier}）` : ""}
                    </Td>
                    <Td mono color={TEXT_DIM}>{(r.hooks ?? []).join("、") || "—"}</Td>
                    <Td mono color={TEXT_DIM}>{(r.effectKinds ?? []).join(" ") || "—"}</Td>
                    <Td mono color={r.templateRef ? OK : TEXT_DIM}>{r.templateRef ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: MONO }}>
        {data._live
          ? `這一頁算於 ${data._live.computedAt} · ${data._live.ms}ms（deps mtime 快取：內容檔一動就重算）`
          : "（沒有 _live 中繼資料 —— 不是經由 /__live middleware 來的回應）"}
        {"　"}
        <Btn small onClick={load}>重新整理</Btn>
      </div>
    </div>
  );
}

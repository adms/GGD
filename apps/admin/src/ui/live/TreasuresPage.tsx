/**
 * 🗡️ 寶具三選一（live）—— GET /__live/treasures 對照頁；權重欄可存
 * （POST /__live/treasures/save → content/loot-tables/<表>.json，GH#821）。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ mount 時 fetch `/__live/treasures`（tools/admin-live/datasets/treasures.mjs
 * 當場算），⛔ 零 build-time import、⛔ 頁裡不抄任何一筆資料。兩張「三選一」：
 *   · 武器輪抽：三張 loot table 的池（權重／現值／翻盤力）× arena-rules 的回合與機率
 *   · 聖杯願望：60 張願望的階／顯現位置／權重／適性條件 × grailDraft 規則
 * 「設定」半邊連去既有的 itemDraft config 頁（含聖杯顯現規則區塊），⛔ 不複製表單。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Btn, Panel, TextInput } from "../widgets";
import { DANGER, GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { useApp } from "../../store";
import { ReviewStrip } from "./ReviewStrip";
import { LiveEditCell } from "./LiveEditCell";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface WeaponEntry {
  /** 檔案裡的原始索引 —— 寫入端的 pointer 用它（entries 在 dataset 已按翻盤力重排）。 */
  srcIndex: number;
  itemId: string;
  name: string;
  weight: number;
  sharePct: number;
  cost: number | null;
  craftRole: string;
  draftEligible: boolean;
  requiresAttackType: string | null;
  swingScore: number | null;
  swingMarks: string | null;
  tags: string[];
}
interface WeaponTier {
  label?: string;
  minRound?: number;
  maxRound?: number;
  basePct?: number;
  underdogFactor?: number;
  underdogExponent?: number;
  guaranteeAtD?: number;
  limitScope?: string;
  limitCount?: number;
}
interface WeaponTable {
  id: string;
  /** repo 相對路徑（寫入端的 path 用它，⛔ 不從 id 拼檔名）。 */
  file: string;
  name: string;
  note: string;
  label: string;
  tier: WeaponTier | null;
  fixedRounds: { round: number; pct: number | null; draftBoth: boolean }[];
  entryCount: number;
  totalWeight: number;
  entries: WeaponEntry[];
}
interface Wish {
  id: string;
  name: string;
  tier: string;
  tierZh: string;
  rankDisplay: string;
  weight: number;
  slot: string;
  slotDisplay: string;
  eligibility: string;
  tags: string[];
  description: string;
}
interface TreasuresData {
  warnings: string[];
  weapon: {
    offerCount: number;
    draftConflict: string;
    itemDraft: { shortPoolMode?: string; fallbackTable?: string; maxDraws?: number; excludedCraftRoles?: string[] };
    legendaryShelf: { open?: boolean; priceMultiplier?: number; sellRefundPct?: number };
    tables: WeaponTable[];
  };
  grail: {
    rules: { eligibilityEnabled?: boolean; slotDiversityEnabled?: boolean; preferenceBonus?: number; legacyPool?: string };
    augmentTiers: { id: string; label: string; basePct: number; underdogFactor: number; underdogExponent: number; limitScope: string; limitCount: number }[];
    roundAugmentTiers: { round: number; tier: string }[];
    bySlot: Record<string, number>;
    byTier: Record<string, { count: number; totalWeight: number }>;
    wishCount: number;
    legacyCount: number;
    wishes: Wish[];
    legacy: { id: string; name: string; tier: string; weight: number }[];
  };
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
  wrap?: boolean;
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
        whiteSpace: props.wrap ? undefined : "nowrap",
      }}
    >
      {props.children}
    </td>
  );
}

/** weaponTiers / fixedRounds → 一行人話（值全部照出貨 config 原樣，不重算）。 */
function tableWhen(t: WeaponTable): string {
  const parts: string[] = [];
  for (const r of t.fixedRounds) {
    parts.push(`第 ${r.round} 回合固定發卡${r.pct !== null ? `（${r.pct}%）` : ""}${r.draftBoth ? "（兩隊都抽）" : ""}`);
  }
  const w = t.tier;
  if (w && w.basePct !== undefined) {
    const rounds = w.maxRound !== undefined ? `R${w.minRound}–${w.maxRound}` : `R${w.minRound}+`;
    parts.push(
      `機率發卡 ${rounds} 每回合 ${w.basePct}%（劣勢 ×${w.underdogFactor}^${w.underdogExponent}` +
        `${w.guaranteeAtD !== undefined ? `，劣勢 ${w.guaranteeAtD} 保底` : ""}）· 每${w.limitScope === "champion" ? "角" : "隊"}限 ${w.limitCount}`,
    );
  }
  return parts.join("；") || "（沒有任何回合指到這張表）";
}

export function TreasuresPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = useState<TreasuresData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/__live/treasures")
      .then(async (r) => {
        const j = (await r.json()) as TreasuresData & { error?: string };
        if (j.error) setErr(j.error);
        else setData(j);
      })
      .catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  const needle = q.trim().toLowerCase();
  const tables = useMemo(() => {
    if (!data) return [];
    if (needle === "") return data.weapon.tables;
    return data.weapon.tables.map((t) => ({
      ...t,
      entries: t.entries.filter((e) => `${e.itemId} ${e.name} ${e.tags.join(" ")} ${e.swingMarks ?? ""}`.toLowerCase().includes(needle)),
    }));
  }, [data, needle]);
  const wishes = useMemo(() => {
    if (!data) return [];
    if (needle === "") return data.grail.wishes;
    return data.grail.wishes.filter((w) =>
      `${w.id} ${w.name} ${w.slot} ${w.slotDisplay} ${w.rankDisplay} ${w.tags.join(" ")} ${w.description}`.toLowerCase().includes(needle),
    );
  }, [data, needle]);

  if (err !== null) {
    return (
      <Panel title="🗡️ 寶具三選一">
        <ReviewStrip family={["treasure", "grail", "item"]} title="寶具三選一" />
        <div style={{ color: DANGER, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: MONO }}>
          /__live/treasures 讀取失敗（這一頁是 dev server 實時算的 —— production build 沒有這條路由）：{"\n"}
          {err}
        </div>
      </Panel>
    );
  }
  if (data === null) {
    return (
      <Panel title="🗡️ 寶具三選一">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>實時計算中…（/__live/treasures）</div>
      </Panel>
    );
  }

  const excluded = new Set(data.weapon.itemDraft.excludedCraftRoles ?? []);
  const shelfMult = data.weapon.legendaryShelf.priceMultiplier;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1240 }}>
      <Panel
        title="🗡️ 寶具三選一 — 武器輪抽組合對照"
        right={
          <Btn small kind="ghost" onClick={() => navigate("itemDraft")}>
            ⚙️ 設定（傳說武器三選一）
          </Btn>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            每張卡從該階 loot table 按權重抽 <b style={{ color: GOLD }}>{data.weapon.offerCount}</b> 件選 1（不放回）。
            池不足時：<code style={{ fontFamily: MONO }}>{data.weapon.itemDraft.shortPoolMode}</code>
            ；同回合兩種卡衝突走 <code style={{ fontFamily: MONO }}>{data.weapon.draftConflict}</code>
            ；craftRole 為 {[...excluded].map((r) => (
              <code key={r} style={{ fontFamily: MONO, color: WARN }}>
                {r}{" "}
              </code>
            ))}
            的不進三選一。⚠️「佔比」是滿池權重除法 —— 實際機率還要過 已擁有／白名單／draftEligible 這幾道閘
            （sim/economy/draft.ts），此頁不模擬。
          </div>
          <TextInput value={q} onChange={setQ} placeholder="過濾兩邊：id / 名 / tags / 翻盤力 / 願望說明…" />
        </div>
      </Panel>

      {tables.map((t) => (
        <Panel key={t.id} title={`${t.label} — ${t.name}（${t.entries.length}/${t.entryCount} 件，總權重 ${t.totalWeight}）`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM }}>
              {tableWhen(t)}
              {t.note ? ` · ${t.note}` : ""}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr>
                    <Th>id</Th>
                    <Th>寶具名</Th>
                    <Th align="right">權重</Th>
                    <Th align="right">佔比</Th>
                    <Th align="right">現值（金）</Th>
                    {shelfMult !== undefined && <Th align="right">架上價（×{shelfMult}）</Th>}
                    <Th>craftRole</Th>
                    <Th>翻盤力</Th>
                    <Th>tags</Th>
                  </tr>
                </thead>
                <tbody>
                  {t.entries.map((e) => (
                    <tr key={e.itemId}>
                      <Td mono>{e.itemId}</Td>
                      <Td>{e.name}</Td>
                      <Td align="right" mono>
                        <LiveEditCell
                          dataset="treasures"
                          path={t.file}
                          pointer={`/entries/${e.srcIndex}/weight`}
                          current={e.weight}
                          type="number"
                          onSaved={load}
                        />
                      </Td>
                      <Td align="right" mono color={TEXT_DIM}>
                        {e.sharePct}%
                      </Td>
                      <Td align="right" mono>
                        {e.cost ?? "—"}
                      </Td>
                      {shelfMult !== undefined && (
                        <Td align="right" mono color={TEXT_DIM}>
                          {e.cost !== null ? e.cost * shelfMult : "—"}
                        </Td>
                      )}
                      <Td mono color={excluded.has(e.craftRole) ? WARN : e.draftEligible ? TEXT_DIM : DANGER}>
                        {e.craftRole}
                        {!e.draftEligible ? "（draftEligible:false）" : ""}
                        {e.requiresAttackType ? `（限${e.requiresAttackType}）` : ""}
                      </Td>
                      <Td color={e.swingScore !== null && e.swingScore >= 3 ? GOLD : TEXT_MAIN}>
                        {e.swingScore !== null ? `${e.swingScore}｜${e.swingMarks}` : (e.swingMarks ?? "—")}
                      </Td>
                      <Td color={TEXT_DIM} wrap>
                        {e.tags.join(", ")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ))}

      <Panel title={`🏆 聖杯願望三選一（${wishes.length}/${data.grail.wishCount} 張）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            每回合發一張該階願望卡，按權重抽 3 選 1；三張儘量涵蓋不同顯現位置（
            {Object.entries(data.grail.bySlot)
              .map(([s, n]) => `${s} ${n} 張`)
              .join(" · ")}
            ，slotDiversity {data.grail.rules.slotDiversityEnabled ? "開" : "關"}）。 靈基適性條件{" "}
            {data.grail.rules.eligibilityEnabled ? "開" : "關"} · 偏好加權 ×{data.grail.rules.preferenceBonus} · 舊卡池{" "}
            <code style={{ fontFamily: MONO }}>{data.grail.rules.legacyPool}</code>
            （{data.grail.legacyCount} 張舊增益卡只在願望池抽不滿時補位）。 回合階序：
            <span style={{ fontFamily: MONO }}>
              {data.grail.roundAugmentTiers.map((r) => `R${r.round}:${r.tier}`).join(" ")}
            </span>
            ；同階總權重：
            {Object.entries(data.grail.byTier)
              .map(([t, v]) => `${t} ${v.count} 張/${v.totalWeight}`)
              .join(" · ")}
            。額外稜彩/黃金機率卡：
            {data.grail.augmentTiers.map((a) => `${a.label} ${a.basePct}%（劣勢 ×${a.underdogFactor}^${a.underdogExponent}，每角限 ${a.limitCount}）`).join(" · ")}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <Th>id</Th>
                  <Th>願望名</Th>
                  <Th>級</Th>
                  <Th>顯現位置</Th>
                  <Th align="right">權重</Th>
                  <Th>適性條件</Th>
                  <Th>說明（卡面）</Th>
                </tr>
              </thead>
              <tbody>
                {wishes.map((w) => (
                  <tr key={w.id}>
                    <Td mono>{w.id}</Td>
                    <Td>{w.name}</Td>
                    <Td color={w.tier === "prismatic" ? GOLD : TEXT_MAIN}>
                      {w.tierZh}
                      {w.rankDisplay ? `・${w.rankDisplay}` : ""}
                    </Td>
                    <Td color={TEXT_DIM}>
                      {w.slotDisplay || "—"}（{w.slot}）
                    </Td>
                    <Td align="right" mono>
                      {w.weight}
                    </Td>
                    <Td mono color={TEXT_DIM} wrap>
                      {w.eligibility || "（全員）"}
                    </Td>
                    <Td color={TEXT_DIM} wrap>
                      {w.description}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {data.warnings.length > 0 && (
        <Panel title="⚠️ 資料側警告">
          <div style={{ color: WARN, fontSize: 13, lineHeight: 1.7 }}>
            {data.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </Panel>
      )}

      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
        此頁 {data._live?.computedAt ?? "—"} 當場計算（{data._live?.ms ?? "—"} ms）。資料源：
        <code style={{ fontFamily: MONO }}>
          content/loot-tables · content/items · content/augments · content/config/arena-rules.json ·
          寶具總表_EX三階.csv（翻盤力）· tools/grail-wishes CSV（級・第幾願望顯示名）
        </code>
      </div>
    </div>
  );
}

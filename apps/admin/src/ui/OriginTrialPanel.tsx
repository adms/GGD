/**
 * 🧮 出身表試算面板（GH#1260 B2）—— 掛在「英雄屬性正規化」那一頁的表單下面，**唯讀、只顯示**。
 *
 * 邏輯全部在 `../originTrial`（純函式、node 可測）；這個檔只負責讀三份資料和畫表。
 * ⛔ 不上色、⛔ 不打 ✅／❌、⛔ 不排序成「差最多的在上面」—— owner 2026-09-15（C5，同一個形狀）逐字：
 *   「頂多是後台試算後顯示 但不干涉也不警示」。
 *
 * 資料來源（優先序寫在畫面上）：屬性係數＝`/admin/combat-env`（線上）→ 出貨 JSON；
 * 出身表＝線上覆蓋層 → 出貨 JSON；英雄卡＝出貨 `content/bundle.json`（⚠️ 不含線上覆蓋層改過的英雄卡）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "./widgets";
import { DANGER, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getCombatEnv, getOverlayDoc } from "../api";
import { TRIAL_STATS, originTrial, type OriginTrial, type TrialStat } from "../originTrial";

const STAT_ZH: Record<TrialStat, string> = { armor: "護甲", ad: "攻擊力" };
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

async function shipped(path: string): Promise<unknown> {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()) as unknown;
}

export function OriginTrialPanel(): React.JSX.Element {
  const [trial, setTrial] = useState<OriginTrial | null>(null);
  const [sources, setSources] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [envSrc, env] = await getCombatEnv()
          .then((d) => ["線上", d.multipliers] as const)
          .catch(async () => ["出貨 JSON", ((await shipped("/content/config/combat-env.json")) as { multipliers: Record<string, number> }).multipliers] as const);
        const overlayNorm = await getOverlayDoc("config", "stat-normalization").catch(() => null);
        const norm = overlayNorm ?? (await shipped("/content/config/stat-normalization.json"));
        const bundle = (await shipped("/content/bundle.json")) as { collections: { champions: { entries: { doc: Record<string, unknown> }[] } } };
        setTrial(originTrial(bundle.collections.champions.entries.map((e) => e.doc), norm, env));
        setSources(`屬性係數：${envSrc} · 出身表：${overlayNorm ? "線上覆蓋層" : "出貨 JSON"} · 英雄卡：出貨 bundle`);
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      }
    })();
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (trial?.rows ?? []).filter((r) => needle === "" || `${r.id} ${r.name} ${r.origin ?? ""}`.toLowerCase().includes(needle));
  }, [trial, q]);

  const cellStyle: React.CSSProperties = { padding: "3px 8px", borderTop: PANEL_BORDER, fontFamily: MONO, textAlign: "right" };
  return (
    <Panel title="🧮 試算：出身表 vs 套上現在的屬性係數（唯讀）">
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 8 }}>
        「出身表」＝反解時用的那一套係數算回 L{trial?.referenceLevel ?? "?"}（通常就是表上那一格；成長被夾到 0 時會比表大）。
        「套現行係數」＝同一張反解後的英雄卡，改用「戰鬥系統」頁現在的 <code>agiToArmor</code>／<code>strToAttackDamage</code> 算。
        ⛔ 兩欄都沒含系統倍率、基礎加成、每級加成、道具。只是顯示，⛔ 不是門檻、不評判。
        <br />
        {sources}
      </div>
      {error !== null && <div style={{ color: DANGER, fontSize: 12 }}>讀不到試算資料：{error}（⛔ 不用預設係數假裝算得出來）</div>}
      {trial === null && error === null && <div style={{ color: TEXT_DIM, fontSize: 12 }}>讀取中…</div>}
      {trial !== null && (
        <>
          <TextInput value={q} onChange={setQ} placeholder="過濾：英雄 id / 名 / 出身…" />
          <div style={{ overflowX: "auto", maxHeight: 520, marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, color: TEXT_MAIN }}>
              <thead>
                <tr style={{ color: TEXT_DIM }}>
                  <th style={{ textAlign: "left", padding: "3px 8px" }}>英雄</th>
                  <th style={{ textAlign: "left", padding: "3px 8px" }}>出身</th>
                  {TRIAL_STATS.flatMap((s) => [
                    <th key={`${s}-t`} style={{ padding: "3px 8px" }}>{STAT_ZH[s]}・出身表 L{trial.referenceLevel}</th>,
                    ...trial.levels.map((lv) => (
                      <th key={`${s}-${lv}`} style={{ padding: "3px 8px" }}>{STAT_ZH[s]}・套現行係數 LV{lv}</th>
                    )),
                  ])}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: "3px 8px", borderTop: PANEL_BORDER, whiteSpace: "nowrap" }} title={r.id}>{r.name}</td>
                    <td style={{ padding: "3px 8px", borderTop: PANEL_BORDER, color: TEXT_DIM }}>{r.origin ?? "—"}</td>
                    {TRIAL_STATS.flatMap((s) => [
                      <td key={`${s}-t`} style={cellStyle}>{r.cells[s].table.toFixed(2)}</td>,
                      ...trial.levels.map((lv) => (
                        <td key={`${s}-${lv}`} style={cellStyle}>{(r.cells[s].live[lv] ?? Number.NaN).toFixed(2)}</td>
                      )),
                    ])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

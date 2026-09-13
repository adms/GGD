/**
 * 🧍🖼🎙【新英雄上架 · 一頁檢核】—— owner 2026-09-11（逐字）：
 * > 「我又有一批34個英雄上架中 請你做一樣的流程並且用**自動化流程（script）**的方式來執行
 * >  **語音配對與圖示生成**」「並且同時檢查**模型對應是否有缺漏**」
 * > 「全部放到**一頁檢核頁面**讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**，
 * >  並且**這一頁也要放到後台管理頁**」
 *
 * ⭐ 三段狀態（模型／圖示／語音）由 `tools/hero-intake/run.mjs` **算好**寫成材料，
 * 這一頁只做兩件事：**顯示**、**收下 owner 的通過／退回**。
 * ⛔ 這裡不重算任何一格 —— 兩份真相是 console 開始說謊的方式（AssetConsolePage 的同一條規矩）。
 *
 * | 段 | 綠 | 黃 | 紅 |
 * |---|---|---|---|
 * | 🧍 模型 | glb 在（或 `assets-offdisk.json` 宣告在 S3）＋ clipMap 六格齊 | 少幾格動作／別的分支才有 | 指不到 model 文件、任何地方都沒有 |
 * | 🖼 圖示 | `icon` 那一格有檔 | —— | 沒有 icon 欄位／檔不在 |
 * | 🎙 語音 | 出貨門檻九格齊 | 缺幾格（原作只有這些） | 沒有語音包 |
 *
 * 退回**必填原因**（owner 2026-08-24「追加原因的HITL」）；材料重跑過的那一列標 `⟳ 已重跑`，
 * ⛔ 舊裁決不會被算成仍然有效。
 */
import { useCallback, useEffect, useState } from "react";
import { Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { browserTokenStorage } from "../session";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = browserTokenStorage.load();
  return { ...(extra ?? {}), ...(t ? { Authorization: `Bearer ${t.accessToken}` } : {}) };
}

interface Section {
  readonly ok?: boolean;
  readonly gap?: string;
  readonly severity?: string;
}
interface ModelSection extends Section {
  readonly modelKey?: string;
  readonly glbPath?: string;
  readonly bytes?: number;
  readonly offDisk?: boolean;
  readonly missingClips?: readonly string[];
  // ⭐ 還沒進 content 的英雄：模型在**別的 repo** 交付 —— 這幾格回答「交了幾個、到了幾個」
  readonly deliveryStatus?: string;
  readonly files?: number;
  readonly filesInRepo?: number;
  readonly filesAtSource?: number | null;
  readonly filesOnlyInSourceHistory?: number;
  readonly filesGone?: number;
}
interface IconSection extends Section {
  readonly path?: string;
  readonly asset?: string | null;
  readonly bytes?: number;
  readonly generated?: boolean;
}
interface VoiceCandidate {
  readonly groupId: string;
  readonly groupName: string;
  readonly library: string;
  readonly language: string;
  readonly fileCount: number;
  readonly why: string;
  readonly confidence: string;
}
interface VoiceSection extends Section {
  readonly pack?: boolean;
  readonly sharedFrom?: string | null;
  readonly categories?: number;
  readonly haveRequired?: number;
  readonly required?: number;
  readonly missing?: readonly string[];
  readonly select?: number;
  readonly candidates?: readonly VoiceCandidate[];
}
interface Hero {
  readonly id: string;
  readonly name: string;
  readonly inContent: boolean;
  readonly model: ModelSection;
  readonly icon: IconSection;
  readonly voice: VoiceSection;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly ready: boolean;
  readonly verdict: "approve" | "reject" | null;
  readonly reason: string;
  readonly verdictAt: string | null;
  readonly stale: boolean;
}
/** ⭐ 交付表的**對帳**：兩頭都走過（我對得到幾列／有沒有哪一列沒人認領）—— ⛔ 不是只報一個數字 */
interface DeliveryAudit {
  readonly path: string;
  readonly rows: number;
  readonly claimed: number;
  readonly unclaimed: readonly string[];
  readonly doubleClaimed: readonly string[];
}
interface Batch {
  readonly batch: string;
  readonly digest: string;
  readonly generatedBy: string;
  readonly voiceIndex: string | null;
  readonly delivery?: DeliveryAudit | null;
  readonly counts: Record<string, number>;
  readonly heroes: readonly Hero[];
}

const KB = (n?: number) => (typeof n === "number" ? `${Math.round(n / 1024)} KB` : "—");

function Dot({ ok, severity }: { ok?: boolean; severity?: string }) {
  const color = ok ? OK : severity === "blocker" ? DANGER : WARN;
  return <span style={{ color, fontWeight: 700 }}>{ok ? "●" : severity === "blocker" ? "▲" : "◐"}</span>;
}

export function HeroIntakePage() {
  const [data, setData] = useState<{ counts: Record<string, number>; batches: Batch[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/__review/hero-intake", { headers: authHeaders() });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const decide = useCallback(
    async (batch: Batch, hero: Hero, verdict: "approve" | "reject") => {
      const key = `${batch.batch}:${hero.id}`;
      const reason = reasons[key] ?? "";
      if (verdict === "reject" && reason.trim() === "") {
        setError(`退回「${hero.name}」要填原因 —— 沒有理由的退回，下一輪沒有人知道要修什麼`);
        return;
      }
      setBusy(key);
      try {
        const r = await fetch("/__review/hero-intake-verdict", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ batch: batch.batch, heroId: hero.id, digest: batch.digest, verdict, reason }),
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        await load();
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [load, reasons],
  );

  return (
    <Panel title="🧍🖼🎙 新英雄上架 · 一頁檢核">
      <p style={{ color: TEXT_DIM, margin: "0 0 10px", maxWidth: "76ch" }}>
        模型對應、圖示、語音配對三段由 <code>node tools/hero-intake/run.mjs --batch &lt;名&gt; --all</code> 全自動算好；
        這一頁只等你按 <b style={{ color: OK }}>通過</b> 或 <b style={{ color: DANGER }}>退回</b>。
        退回必填原因。材料重跑過的列會標 <b style={{ color: WARN }}>⟳ 已重跑</b>，舊裁決不算數。
      </p>
      {error !== null && <p style={{ color: DANGER }}>{error}</p>}
      {data === null && error === null && <p style={{ color: TEXT_DIM }}>讀取中…</p>}
      {data !== null && data.batches.length === 0 && (
        <p style={{ color: TEXT_DIM }}>
          還沒有批核材料。跑一次：<code>node tools/hero-intake/run.mjs --batch ship34 --from &lt;名單.json&gt;</code>
        </p>
      )}
      <label style={{ color: TEXT_DIM, fontSize: 13, display: "block", margin: "0 0 12px" }}>
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 只看還沒判定的
      </label>
      {data?.batches.map((b) => {
        const heroes = onlyOpen ? b.heroes.filter((h) => h.verdict === null || h.stale) : b.heroes;
        return (
          <div key={b.batch} style={{ border: `1px solid ${PANEL_BORDER}`, padding: 12, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 4px", color: TEXT_MAIN }}>
              {b.batch} <span style={{ color: TEXT_DIM, fontSize: 13, fontWeight: 400 }}>
                {b.counts.heroes} 位 · 沒有硬傷 {b.counts.ready} · 被擋 {b.counts.blocked} ·
                通過 {b.counts.approved} · 退回 {b.counts.rejected} · 未判定 {b.counts.undecided}
                {(b.counts.stale ?? 0) > 0 ? ` · ⟳ 已重跑 ${b.counts.stale}` : ""}
              </span>
            </h3>
            <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 8 }}>
              材料 digest <code>{b.digest.slice(0, 12)}</code> · 產生器 <code>{b.generatedBy}</code>
              {b.voiceIndex !== null && <> · 語音索引 <code>{b.voiceIndex.split("/").slice(-1)[0]}</code></>}
              {(b.counts.modelGaps ?? 0) + (b.counts.modelPending ?? 0) > 0 && (
                <> · 模型 擋 {b.counts.modelGaps} ／ 等順序 {b.counts.modelPending}</>
              )}
            </div>
            {b.delivery != null && (
              /* ⭐ join key 的對帳要**印在頁面上** —— 「對上 34/34」是這張表能不能被相信的前提 */
              <div style={{ color: b.delivery.unclaimed.length + b.delivery.doubleClaimed.length > 0 ? WARN : TEXT_DIM, fontSize: 12, marginBottom: 8 }}>
                🔑 模型交付表 {b.delivery.rows} 列 · 對上 {b.delivery.claimed} 列
                {b.delivery.unclaimed.length > 0 && ` · ⚠️ 沒人認領 ${b.delivery.unclaimed.length}（${b.delivery.unclaimed.slice(0, 6).join("、")}）`}
                {b.delivery.doubleClaimed.length > 0 && ` · ⛔ 被兩位認領 ${b.delivery.doubleClaimed.join("、")}`}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                    <th style={{ padding: 4 }}>英雄</th>
                    <th style={{ padding: 4 }}>🖼</th>
                    <th style={{ padding: 4 }}>🧍 模型</th>
                    <th style={{ padding: 4 }}>🎙 語音</th>
                    <th style={{ padding: 4 }}>擋住的事</th>
                    <th style={{ padding: 4 }}>你的決定</th>
                  </tr>
                </thead>
                <tbody>
                  {heroes.map((h) => {
                    const key = `${b.batch}:${h.id}`;
                    return (
                      <tr key={h.id} style={{ borderTop: `1px solid ${PANEL_BORDER}` }}>
                        <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                          <b style={{ color: TEXT_MAIN }}>{h.name}</b>
                          <div style={{ color: TEXT_DIM, fontSize: 11 }}>{h.id}</div>
                          {h.stale && <div style={{ color: WARN, fontSize: 11 }}>⟳ 已重跑</div>}
                        </td>
                        <td style={{ padding: 4 }}>
                          {h.icon.asset != null ? (
                            <img
                              src={`/__review/hero-asset?p=${encodeURIComponent(h.icon.asset)}`}
                              alt={h.name}
                              width={44}
                              height={44}
                              style={{ borderRadius: 6, border: `1px solid ${PANEL_BORDER}` }}
                            />
                          ) : (
                            <Dot ok={h.icon.ok} severity={h.icon.severity} />
                          )}
                        </td>
                        <td style={{ padding: 4 }}>
                          <Dot ok={h.model.ok} severity={h.model.severity} />{" "}
                          <span style={{ color: TEXT_DIM }}>
                            {h.model.offDisk === true ? "S3" : KB(h.model.bytes)}
                            {(h.model.missingClips?.length ?? 0) > 0 && ` · 缺動作 ${h.model.missingClips?.length}`}
                            {typeof h.model.files === "number" && h.model.files > 0 && (
                              ` · 交付檔 ${h.model.filesInRepo ?? 0}/${h.model.files} 進 repo`
                            )}
                            {(h.model.filesOnlyInSourceHistory ?? 0) > 0 && ` · ⚠️ ${h.model.filesOnlyInSourceHistory} 個被合併刪掉（歷史裡還在）`}
                          </span>
                          {h.model.modelKey != null && (
                            <div style={{ color: TEXT_DIM, fontSize: 11 }} title={h.model.modelKey}>{h.model.modelKey.slice(0, 22)}…</div>
                          )}
                        </td>
                        <td style={{ padding: 4 }}>
                          <Dot ok={h.voice.ok} severity={h.voice.severity} />{" "}
                          <span style={{ color: TEXT_DIM }}>
                            {h.voice.pack === true ? `${h.voice.haveRequired}/${h.voice.required} 格` : "無包"}
                            {h.voice.sharedFrom != null && ` · 借 ${h.voice.sharedFrom}`}
                            {(h.voice.candidates?.length ?? 0) > 0 && ` · 候選 ${h.voice.candidates?.length}`}
                          </span>
                          {h.voice.candidates?.slice(0, 1).map((c) => (
                            /* ⭐ 「編號對上而名字對不上」要當場看得到 —— ⛔ 機器不替 owner 決定那是不是同一位角色 */
                            <div key={c.groupId} style={{ color: c.confidence === "identity-name-mismatch" ? WARN : TEXT_DIM, fontSize: 11 }}>
                              {c.confidence === "identity-name-mismatch" ? "⚠️ " : c.confidence === "candidate" ? "· " : "✓ "}
                              {c.groupId} 「{c.groupName}」 {c.fileCount} 檔
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: 4, color: h.blockers.length > 0 ? DANGER : TEXT_DIM, maxWidth: "36ch" }}>
                          {h.blockers.length > 0 ? h.blockers.join("；") : h.warnings.join("；") || "—"}
                        </td>
                        <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            disabled={busy === key}
                            onClick={() => void decide(b, h, "approve")}
                            style={{ color: OK, borderColor: OK, background: "transparent", border: `1px solid ${OK}`, borderRadius: 6, padding: "2px 10px", marginRight: 4 }}
                          >
                            通過
                          </button>
                          <button
                            type="button"
                            disabled={busy === key}
                            onClick={() => void decide(b, h, "reject")}
                            style={{ color: DANGER, background: "transparent", border: `1px solid ${DANGER}`, borderRadius: 6, padding: "2px 10px" }}
                          >
                            退回
                          </button>
                          <div style={{ marginTop: 4 }}>
                            <TextInput
                              value={reasons[key] ?? h.reason ?? ""}
                              onChange={(v) => setReasons((r) => ({ ...r, [key]: v }))}
                              placeholder="退回原因"
                            />
                          </div>
                          {h.verdict !== null && (
                            <div style={{ color: h.verdict === "approve" ? OK : DANGER, fontSize: 11, marginTop: 2 }}>
                              已{h.verdict === "approve" ? "通過" : "退回"}
                              {h.verdictAt != null && ` · ${h.verdictAt.slice(0, 16).replace("T", " ")}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p style={{ color: TEXT_DIM, fontSize: 12 }}>
        結果寫進 <code>docs/_review/verdicts/</code>（與功能批次驗收同一組帳本，id 命名空間 <code>hero-intake:&lt;批次&gt;:&lt;英雄&gt;</code>）。
        <span style={{ color: ACCENT }}> ⛔ 這一頁不改任何內容檔</span> —— 通過之後的落地仍由那批工具做。
      </p>
    </Panel>
  );
}

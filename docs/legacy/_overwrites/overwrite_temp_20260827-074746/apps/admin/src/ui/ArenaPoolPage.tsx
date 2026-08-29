/**
 * 場地輪替 —— 勾選哪幾張場地會進回合輪替（GH#324 收尾）。
 *
 * ## ⚠️ 這一頁存在的理由是一個真的缺陷
 *
 * 在此之前輪替池是 game-server 裡一個**寫死的 TS 陣列**。2026-08-14 產出七張
 * 動漫競技場、驗證過、上線之後，**玩家一場都碰不到** —— 因為沒有人記得去改它。
 * 那是失敗形態②（算出來了但從沒送到玩家面前），而且寫死違反第一守則。
 *
 * ⛔ 這一頁不走通用 `ConfigDocPage`：那個引擎畫的是**固定形狀的純量葉**，
 * 而這裡要的是「一份會長大的場地清單 × 勾選」。硬套會變成一格要手打 id 的文字框，
 * 而打錯一個字的後果是那張圖靜靜地不出現。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { mapCell, useNameIndex } from "./nameCells";
import {
  DEFAULT_ARENA_POOL,
  resolveArenaPoolConfig,
  zConfigArenaPoolDoc,
  type ConfigArenaPoolDoc,
} from "@ggd/shared/content/schema/arenaPoolDoc";
import {
  zConfigMapReportDoc,
  type MapReportRow,
} from "@ggd/shared/content/schema/mapReportDoc";

export function ArenaPoolPage(): JSX.Element {
  const [doc, setDoc] = useState<ConfigArenaPoolDoc | null>(null);
  const [generated, setGenerated] = useState<MapReportRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [ov, sh, rep] = await Promise.all([
        getOverlayDoc("config", "arena-pool").catch(() => null),
        getShippedDoc("config", "arena-pool").catch(() => null),
        getShippedDoc("config", "map-report").catch(() => null),
      ]);
      if (!live) return;
      const parsed =
        zConfigArenaPoolDoc.safeParse(ov ?? null).data ??
        zConfigArenaPoolDoc.safeParse(sh?.doc ?? null).data ??
        null;
      setDoc(parsed);
      const r = zConfigMapReportDoc.safeParse(rep?.doc ?? null);
      if (r.success) setGenerated(r.data.maps);
    })();
    return () => {
      live = false;
    };
  }, []);

  const cfg = useMemo(() => resolveArenaPoolConfig(doc), [doc]);

  /** 全部候選：出貨預設 ∪ 產生器出來的 ∪ 目前池子裡的。⛔ 不寫死清單。 */
  const candidates = useMemo(() => {
    const ids = new Set<string>([
      ...DEFAULT_ARENA_POOL.rotation,
      ...generated.map((m) => m.mapId.replace(/^map\./, "arena.")),
      ...cfg.rotation,
    ]);
    return [...ids].sort();
  }, [generated, cfg.rotation]);

  const toggle = (id: string): void => {
    const on = cfg.rotation.includes(id);
    const next = on ? cfg.rotation.filter((x) => x !== id) : [...cfg.rotation, id];
    if (next.length === 0) {
      setMsg("⛔ 至少要留一張 —— 空的池子會讓每一回合都退回骨架場地。");
      return;
    }
    setMsg(null);
    setDoc({
      id: "arena-pool",
      schema: "config.arena-pool@1",
      ...(doc?.note === undefined ? {} : { note: doc.note }),
      rotation: next,
      finale: cfg.finale,
    });
  };

  const save = async (): Promise<void> => {
    if (doc === null) return;
    setBusy(true);
    try {
      await putOverlayDoc("config", "arena-pool", doc);
      setMsg("✓ 已寫入耐久覆蓋層。⚠️ 要重啟 game-server shard 才生效。");
    } catch (e) {
      setMsg(`⛔ ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="🎲 場地輪替">
      <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        勾選哪幾張場地會進回合輪替。⚠️ 在 GH#324 之前這是一個<strong>寫死在
        game-server 裡的陣列</strong> —— 七張新產出的動漫競技場上線之後玩家一場都碰不到。
        <br />
        ⚠️ 存檔寫進耐久覆蓋層，<strong>覆蓋層會蓋掉 <code>content/config/arena-pool.json</code></strong>。
        <strong>要重啟 game-server shard 才生效</strong>（和冷卻規則／吟唱規則同一個形態）。
        <br />
        ⛔ 決賽場地（<code>{cfg.finale}</code>）刻意不在輪替裡：它是為 12 人四個出生簇
        設計的單分區，塞進一般 3v3 回合會讓三分之二的場地是空的。
      </div>

      {doc === null && <div style={{ color: TEXT_DIM }}>讀取中…</div>}

      {doc !== null && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {candidates.map((id) => {
              const on = cfg.rotation.includes(id);
              const rep = generated.find((m) => m.mapId.replace(/^map\./, "arena.") === id);
              return (
                <label
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 10px",
                    border: `1px solid ${on ? ACCENT : PANEL_BORDER}`,
                    borderRadius: 6,
                    color: TEXT_MAIN,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                  <code>{id}</code>
                  {rep !== undefined && (
                    <span style={{ color: TEXT_DIM }}>
                      {rep.template} · {rep.cols}×{rep.rows} · {rep.regions} 區 ·{" "}
                      {rep.estimatedTraversalSec} 秒
                      {rep.ok ? "" : " ⛔ 未通過驗證"}
                    </span>
                  )}
                  {rep === undefined && <span style={{ color: TEXT_DIM }}>手寫場地</span>}
                </label>
              );
            })}
          </div>

          <Btn onClick={() => void save()} disabled={busy}>
            {busy ? "寫入中…" : "儲存"}
          </Btn>
          {msg !== null && (
            <div style={{ marginTop: 10, color: msg.startsWith("✓") ? OK : DANGER, fontSize: 13 }}>
              {msg}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * 一張英雄 id 清單的**人話版**。GH#497。
 *
 * owner 2026-08-21：「英雄上下架 及 免費解鎖名單 英雄ID以外還要有英雄名稱 不然看不出來
 * 是誰，變身態的話也要註明」。
 *
 * 兩頁（🎭 英雄上下架 / 💰 商店經濟的免費名單）用的是同一個 textarea 形狀：操作者編輯
 * 的仍然是 id（那是存進 JSON 的東西），這個元件掛在 textarea **下面**，把目前解析出來的
 * 每一個 id 翻成「id ＋ 名字 ＋ 形態標註」。
 *
 * ⛔ 刻意不是「把 textarea 換成一個勾選清單」：那會把一份 119 列的表塞進兩頁裡，而且
 * 貼上／整批替換（操作者真正在做的事）會變得不可能。
 *
 * 邏輯全部在 `../championLabels`（測試住在那邊），這裡只有排版。
 */
import { useEffect, useState } from "react";
import { ACCENT, DANGER, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { loadCollection } from "../content";
import type { ContentRow } from "../curation";
import {
  buildChampionLabelIndex,
  championFormNote,
  championLabelsFor,
  type ChampionLabel,
} from "../championLabels";

export interface ChampionLabelIndexState {
  index: Map<string, ChampionLabel>;
  /** 還在載入（列還沒 hydrate）—— 這時候「沒有名字」不代表「這個 id 是錯的」。 */
  loading: boolean;
  error: string | null;
}

/**
 * 載入 `/content/champions/` 並壓成 id → 標籤。
 *
 * ⚠️ 讀不到不是致命的：頁面照樣編輯、照樣存檔，只是列上少了名字（並且會**說出來**
 * ——⛔ 不是安靜地退回只有 id，那跟修好之前長得一模一樣）。
 */
export function useChampionLabelIndex(): ChampionLabelIndexState {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const out = await loadCollection("champions", {
          onProgress: (partial) => {
            if (alive) setRows(partial);
          },
        });
        if (alive) setRows(out);
      } catch (err) {
        if (alive) {
          setError(
            `讀不到 /content/champions/_index.json（${err instanceof Error ? err.message : String(err)}）` +
              " —— 清單只剩 id。dev 請確認 admin vite 的 /content 掛載，prod 請確認 nginx。",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { index: buildChampionLabelIndex(rows), loading, error };
}

export interface ChampionIdListProps {
  ids: readonly string[];
  state: ChampionLabelIndexState;
  /** 清單空的時候要說的話。 */
  emptyText: string;
}

/** 一列：`id　名字　[變身態 ← …]`。 */
function LabelRow({ label }: { label: ChampionLabel }): JSX.Element {
  const note = championFormNote(label);
  return (
    <li style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "1px 0" }}>
      <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 108 }}>{label.id}</code>
      {label.known ? (
        <span style={{ color: TEXT_MAIN, fontSize: 12 }}>
          {label.name || "（這份 doc 沒有 name）"}
        </span>
      ) : (
        <span style={{ color: DANGER, fontSize: 12 }}>⚠ 內容樹裡沒有這個 doc</span>
      )}
      {note !== "" && (
        <span
          style={{
            color: label.alternate ? ACCENT : TEXT_DIM,
            fontSize: 11,
            fontWeight: label.alternate ? 700 : 400,
          }}
        >
          {note}
        </span>
      )}
    </li>
  );
}

export function ChampionIdList({ ids, state, emptyText }: ChampionIdListProps): JSX.Element {
  const labels = championLabelsFor(state.index, ids);
  return (
    <div
      style={{
        marginTop: 8,
        padding: "6px 10px",
        border: PANEL_BORDER,
        borderRadius: 3,
        maxHeight: 260,
        overflowY: "auto",
      }}
    >
      {state.error && (
        <div style={{ color: DANGER, fontSize: 12, marginBottom: 4 }}>{state.error}</div>
      )}
      {ids.length === 0 ? (
        <div style={{ color: TEXT_DIM, fontSize: 12 }}>{emptyText}</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {labels.map((l) => (
            <LabelRow key={l.id} label={l} />
          ))}
        </ul>
      )}
      {state.loading && (
        <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4 }}>
          英雄名稱載入中…（現在還沒有名字的列不代表 id 有錯）
        </div>
      )}
    </div>
  );
}

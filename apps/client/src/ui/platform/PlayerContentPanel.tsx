/**
 * ⭐⭐ **玩家內容的發現入口**（GH#908 責任③）。
 *
 * ⛔⛔ 這是「開放讓玩家自己設計」那條線的**最後一段**，而在此之前它**沒有出口**：
 * 伺服器早就有 `GET /submissions/discoverable`
 * （`apps/platform/internal/submissions/handlers.go:79`）、
 * 審核走既有的 `tools/review/` 流水線、三個住處的開關也齊了
 * （`config.ui-cues@1.playerContent.discover`）——
 * ⭐ 而**客戶端沒有任何一行去讀它**。
 * ⇒ 那是失敗形態⑧：每一段都在，⛔ 而它們之間少一個消費端。
 *
 * ⚠️ ⭐ **開關預設是關的**（`{submit: false, discover: false}`）——
 * 對外開放的東西⛔ 不預設開（這張票的 Implementation constraints 逐字）。
 * ⇒ 這一頁在預設出貨設定下**畫不出任何東西**，而那是對的。
 *
 * ⚠️ ⭐ 而「關著」與「開著但沒有內容」在這裡**刻意是同一條路**：
 * 伺服器關著時回**空陣列**而不是 404（`handlers.go` 逐字：
 * 「一條會 404 的路線會讓客戶端寫出兩套程式碼」）
 * ⇒ 這裡也只有一條路：空清單就 `return null`，⛔ 不做第二套錯誤處理。
 *
 * ⛔ **Non-goals（票文逐字）**：⛔ 不做評分／留言／訂閱。
 * ⚠️ 「一鍵試玩」也**不在這一版** —— 它要接進場流程，⭐ 而那條路今天
 * 還沒有「用一份候選內容開一場」的入口。⇒ 誠實列在票上，⛔ 不假裝有。
 */
import { useEffect, useState } from "react";
import { discoverableSubmissions } from "./api";
import type { DiscoverableSubmission } from "./types";

const GOLD = "#d9b46a";
const DIM = "#8a8f98";

/** ⭐ 來源標籤 —— `origin` 由**認證過的 actor 的角色**填，⛔ 不是包裡自稱的。 */
function originLabel(o: string | undefined): string {
  if (o === "player") return "玩家";
  if (o === "ai-editor") return "AI 編輯器";
  return "未標示";
}

export function PlayerContentPanel(): JSX.Element | null {
  const [rows, setRows] = useState<DiscoverableSubmission[] | null>(null);

  useEffect(() => {
    let alive = true;
    // ⚠️ ⭐ 失敗**吞掉**是刻意的：這一格是大廳的一個附屬面板，
    //   ⛔ 一次讀不到不該讓整個大廳出錯 —— 而它「沒有內容」的樣子
    //   與「關著」一模一樣（見檔頭），所以沉默在這裡不會誤導。
    discoverableSubmissions()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);

  // ⭐ 還沒回來、關著、或真的沒有內容 ⇒ 一律不佔版面。
  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ color: GOLD, fontSize: 12, marginBottom: 6 }}>
        玩家內容 <span style={{ color: DIM }}>({rows.length})</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 11,
              color: DIM,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.kind}
            </span>
            <span style={{ flexShrink: 0 }}>{originLabel(r.origin)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

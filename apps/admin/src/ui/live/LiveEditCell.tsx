/**
 * 💾 LiveEditCell —— live 對照頁的**共用**單格編輯器（GH#821）。
 *
 * owner 2026-08-27（逐字）：
 * > 「我說過**全部都要即時動態資料讀取及儲存（by JSON）, 不是唯讀**，你這樣怎麼算驗收呢」
 *
 * 一個住處（第零守則⑨：N 頁同型＝一個模板）：每一頁的「能改的那一格」都長這樣 ——
 * 點 ✏️ → 改值 → 存 → POST /__live/<dataset>/save {path, pointer, value} →
 * 成功就叫 onSaved()（頁面重抓 —— ⭐ 驗的是**重讀後的值**，⛔ 不是「有呼叫 POST」）。
 *
 * 伺服器端才是裁決者（規則/規格/genguard 全在 middleware）：這裡只把錯誤**原文**
 * 攤出來 —— genguard 409 的訊息會指名產生器擁有者與正確修法，⛔ 不要吞掉它。
 * token 由 liveAuth 的 fetch 攔截器自動帶（⛔ 這裡不碰身分）。
 */
import { useState } from "react";
import { DANGER, GOLD, OK, TEXT_DIM } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function LiveEditCell(props: {
  dataset: string;
  path: string;
  pointer: string;
  current: string | number | null;
  type: "number" | "string";
  /** null 允許時，存空字串＝刪掉這一格（middleware 的 nullable 規格）。 */
  nullable?: boolean;
  onSaved: () => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const save = () => {
    const t = text.trim();
    let value: string | number | null;
    if (t === "" && props.nullable === true) value = null;
    else if (props.type === "number") {
      value = Number(t);
      if (!Number.isFinite(value)) return setErr("要是數字");
    } else value = t;
    setBusy(true);
    setErr(null);
    fetch(`/__live/${props.dataset}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: props.path, pointer: props.pointer, value }),
    })
      .then(async (r) => {
        const body = (await r.json()) as { ok?: boolean; error?: string; genguard?: string; notes?: string[] };
        if (!r.ok || body.ok !== true)
          throw new Error(`${body.error ?? `HTTP ${r.status}`}${body.genguard ? `\n${body.genguard}` : ""}`);
        setEditing(false);
        setOkNote((body.notes ?? []).join(" ") || "已存");
        props.onSaved(); // ⭐ 重抓 —— 頁上看到的是重讀後的值
      })
      .catch((e: unknown) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  };

  if (!editing) {
    return (
      <span style={{ fontFamily: MONO }}>
        <span style={{ color: GOLD }}>{props.current === null ? "—" : String(props.current)}</span>{" "}
        <button
          title={`寫入 ${props.path} 的 ${props.pointer}（共用寫入端）`}
          onClick={() => {
            setText(props.current === null ? "" : String(props.current));
            setOkNote(null);
            setErr(null);
            setEditing(true);
          }}
          style={{ cursor: "pointer", background: "none", border: "none", fontSize: 12 }}
        >
          ✏️
        </button>
        {okNote !== null && <span style={{ color: OK, fontSize: 11 }}> ✓{okNote}</span>}
        {err !== null && <div style={{ color: DANGER, fontSize: 11, whiteSpace: "pre-wrap" }}>{err}</div>}
      </span>
    );
  }
  return (
    <span style={{ fontFamily: MONO }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        style={{ width: 110, fontFamily: MONO, fontSize: 12 }}
      />{" "}
      <button onClick={save} disabled={busy} style={{ cursor: "pointer", fontSize: 12 }}>
        {busy ? "…" : "存"}
      </button>{" "}
      <button onClick={() => setEditing(false)} style={{ cursor: "pointer", fontSize: 12 }}>
        ✕
      </button>
      {props.nullable === true && <span style={{ color: TEXT_DIM, fontSize: 10 }}> 空＝移除</span>}
      {err !== null && <div style={{ color: DANGER, fontSize: 11, whiteSpace: "pre-wrap" }}>{err}</div>}
    </span>
  );
}

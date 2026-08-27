/**
 * 🖼️ **帶身分的 `<img>`** —— GH#669／#796 的交會處，owner 2026-08-27 回報的
 * 「**連續圖片全部都看不到**」就是這一格。
 *
 * ## 根因（⛔ 不是「圖片沒傳完整」，也⛔ 不是串接沒做）
 * 圖片**全部都在 git 裡**（25 個序列逐目錄比對過，本機檔數 ＝ `git ls-files` 檔數），
 * 容器也讀得到（`..:/srv/repo:ro` 蓋住整個 repo）。壞的是**身分**：
 *
 * | 誰 | 帶不帶 token |
 * |---|---|
 * | 批次清單 `GET /__review/features` —— 走 `fetch()` | ✅ `liveAuth.ts` 的攔截器補上 Bearer |
 * | 每一張圖 `<img src="/__review/frame?p=…">` —— **瀏覽器的圖片載入** | ⛔ **攔截器碰不到它** |
 *
 * ⇒ `needsAdmin("/__review/frame")` 回 true ⇒ **每一張圖回 401 JSON** ⇒ 全部空白。
 * ⭐ 而清單是好的，所以頁面照樣寫著「**N 張連續圖片**」—— ⭐ **壞掉跟正常長得一模一樣**。
 *
 * ## ⛔ 三條沒有走的路
 * · **把 `/__review/frame` 開成匿名** ⇒ 未登入的人拿得到內部驗收擷圖
 * · **token 掛 query string** ⇒ ⛔ #724 F-12 剛把這條路關掉（它會逐次進 access_log）
 * · **簽章 cookie** ⇒ 第二套憑證機制 ＝ 第二份真相（第〇·四守則）
 *
 * ⇒ ⭐ 正解是**讓圖片也走 `fetch()`**：同一個攔截器、同一份 token、⛔ URL 裡零秘密。
 *
 * ## ⚠️ 失敗時**說出來**，⛔ 不是留一個空白框
 * 空白框與「這一批本來就沒有圖」長得一模一樣 —— 那正是這個缺陷藏了這麼久的原因。
 * fail-open 沒錯，**靜默**才是缺陷。
 */
import { useEffect, useState } from "react";

export function AuthedImg(props: {
  readonly rel: string;
  readonly alt: string;
  readonly width: number;
  readonly style?: React.CSSProperties;
}): JSX.Element {
  const { rel, alt, width, style } = props;
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    let made: string | null = null;
    setUrl(null);
    setErr(null);
    // ⭐ 走 `fetch()` ⇒ `installLiveAuthFetch` 的攔截器會補上 Bearer。
    fetch(`/__review/frame?p=${encodeURIComponent(rel)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? "（未登入或 token 過期）" : ""}`);
        const blob = await r.blob();
        if (dead) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch((e: unknown) => {
        if (!dead) setErr(String(e instanceof Error ? e.message : e));
      });
    return () => {
      dead = true;
      // ⛔ 不 revoke 就是每翻一批漏一份記憶體（一批可以有 110 張）。
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [rel]);

  const box: React.CSSProperties = { width, display: "block", borderRadius: 6, ...style };
  if (err !== null)
    return (
      <div
        style={{ ...box, minHeight: 100, padding: 8, background: "#2a1416", color: "#ff9a9a", fontSize: 11.5 }}
        title={rel}
      >
        ⛔ 這張圖載不到 —— {err}
        <div style={{ opacity: 0.75, marginTop: 4, wordBreak: "break-all" }}>{rel}</div>
      </div>
    );
  if (url === null) return <div style={{ ...box, minHeight: 100, background: "#151922" }} aria-label={`${alt}（載入中）`} />;
  return <img src={url} alt={alt} style={box} />;
}

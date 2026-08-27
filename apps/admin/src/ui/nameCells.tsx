/**
 * 「給人看的名字」共用格子（#786 → #793 → #799）。
 *
 * owner 2026-08-27（逐字）：
 * > 「我說過 給人看的話不能只有ID 還要有名稱」
 *
 * ⭐ 這一份存在的理由是**第四個頁面**：同一句判準已經在傷害排行榜（#786）、
 * Matches（#793）、MapReport／ArenaPool（#799）上各成立一次 —— 判準已經證明會漏，
 * 而每一頁自己抄一份「三個狀態怎麼畫」就是同一份知識的第 N 個住處（第〇·四守則）。
 * ⇒ join 住 `contentNames.ts`（一份），**怎麼畫**住這裡（一份），⛔ 不是每頁一份。
 *
 * ⚠️ 這裡只做**顯示**。id 仍然原封不動印在旁邊 —— 「給人看的面」與「機器 join 的鍵」
 * 是兩個空間，⛔ 名稱不可以取代 id（營運頁上那個 id 是拿去查 log 的）。
 */
import { useEffect, useState } from "react";
import { fetchNameIndex, nameLabelFor, type NameIndex } from "../contentNames";
import { TEXT_DIM } from "./theme";

/**
 * 出貨名冊（含 fail-open）。⭐ `null` ＝ **還沒載到／載不到**，⛔ 不是「查不到」——
 * 兩個狀態刻意分開：前者頁面印裸 id **不加 ⚠**（什麼都還沒宣稱）。
 *
 * ⚠️ 名冊只是「給人看的那一半」⇒ 抓不到就安靜降級成裸 id，⛔ 不可以讓整頁爆紅
 * （這幾頁的本業是比賽紀錄／地圖體檢／輪替勾選，沒有名字它們照樣要能用）。
 */
export function useNameIndex(): NameIndex | null {
  const [names, setNames] = useState<NameIndex | null>(null);
  useEffect(() => {
    let live = true;
    fetchNameIndex()
      .then((idx) => {
        if (live) setNames(idx);
      })
      .catch(() => {
        /* fail-open：列退回裸 id、⛔ 不加 ⚠ */
      });
    return () => {
      live = false;
    };
  }, []);
  return names;
}

/**
 * #793 —— 「名稱＋小字 id」。三個狀態刻意分開：
 *  · 沒有 mapId          → 「—」
 *  · 名冊還沒載到（null） → 裸 id（⛔ 不加 ⚠：什麼都還沒查過）
 *  · 查過了沒有          → ⚠ ＋裸 id（⛔ 不編一個名字出來；退休場地本來就查不到）
 */
export function mapCell(names: NameIndex | null, mapId: string | undefined): React.ReactNode {
  if (mapId === undefined || mapId === "") return "—";
  if (names === null) return mapId;
  const l = nameLabelFor(names, "maps", mapId);
  if (l.name === null) return <span title="出貨 bundle 裡沒有這個場地 id（退休／舊資料）">⚠ {l.id}</span>;
  return (
    <>
      {l.name} <span style={{ color: TEXT_DIM, fontSize: 10 }}>{l.id}</span>
    </>
  );
}

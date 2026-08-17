/**
 * 英雄上下架 — `config/roster.json` 的兩張清單（下架 / 隱藏）。
 *
 * ⚠️ 這一頁補的是一個**完全不存在的入口**：在它之前 `apps/admin/src` 全樹對這份
 * 文件零引用，下架一位英雄要編 repo + `pnpm content:build` + 一次完整部署 ——
 * 而文件自己的 note 寫著「不用改程式、不用重新部署」（第三守則的那種謊話，現在
 * 那句話已經被改成真的）。
 *
 * 邏輯全部在 `../roster`（測試住在那邊），這裡是視圖。
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, getWhitelist, putOverlayDoc } from "../api";
import {
  ROSTER_COLLECTION,
  ROSTER_DOC_ID,
  extractRoster,
  idListText,
  parseChampionIdList,
  rosterConflicts,
  rosterDocFor,
  rosterSummary,
  type RosterLists,
} from "../roster";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const boxStyle = (warn: boolean): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  background: "transparent",
  color: TEXT_MAIN,
  border: `1px solid ${warn ? GOLD : PANEL_BORDER}`,
  borderRadius: 3,
  fontFamily: "monospace",
  fontSize: 12,
});

export function RosterPage(): JSX.Element {
  const [loaded, setLoaded] = useState<RosterLists | null>(null);
  /** 出貨檔那一份 —— 「回到出貨值」用它，⛔ 不在這裡再抄一份 id 清單當常數。 */
  const [shipped, setShipped] = useState<RosterLists | null>(null);
  const [retiredText, setRetiredText] = useState("");
  const [hiddenText, setHiddenText] = useState("");
  const [roster, setRoster] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // 出貨檔一定要讀（「回到出貨值」要用），覆蓋層優先當作目前生效的那一份。
        const ship = await getShippedDoc(ROSTER_COLLECTION, ROSTER_DOC_ID);
        const shippedLists = ship.present && ship.doc ? extractRoster(ship.doc) : null;
        if (shippedLists) setShipped(shippedLists);
        const overlaid = (await getOverlayDoc(ROSTER_COLLECTION, ROSTER_DOC_ID)) as unknown;
        const lists = extractRoster(overlaid) ?? shippedLists;
        if (lists) {
          setLoaded(lists);
          setRetiredText(idListText(lists.retired));
          setHiddenText(idListText(lists.hidden));
        }
      } catch (err) {
        setApiErr(errText(err));
      }
      try {
        // 開放名單是唯一能回答「這個 id 是不是打錯字」的清單。讀不到不是致命的：
        // 頁面照樣存得下去，只是不再標紅（`parseChampionIdList` 對空集合是沉默的）。
        const wl = await getWhitelist();
        setRoster(wl.champions ?? []);
      } catch {
        setRoster(null);
      }
    })();
  }, []);

  const known = useMemo(() => new Set(roster ?? []), [roster]);
  const retired = useMemo(() => parseChampionIdList(retiredText, known), [retiredText, known]);
  const hidden = useMemo(() => parseChampionIdList(hiddenText, known), [hiddenText, known]);

  const preview: RosterLists | null = loaded
    ? { retired: retired.ids, hidden: hidden.ids, ...(loaded.note !== undefined ? { note: loaded.note } : {}) }
    : null;
  const conflicts = preview ? rosterConflicts(preview) : [];
  const dirty =
    loaded !== null &&
    (retired.ids.join("\n") !== idListText(loaded.retired) ||
      hidden.ids.join("\n") !== idListText(loaded.hidden));

  const save = async (): Promise<void> => {
    if (!preview || conflicts.length > 0) return;
    setBusy(true);
    setApiErr(null);
    try {
      // ⚠️ rosterDocFor 寫整份文件（含 note 與**兩張**清單）。少寫一張的後果不是
      // 「那一格沒存到」，是那七位下架英雄復活或整份內容驗不過 —— 見 ../roster。
      const head = await putOverlayDoc(ROSTER_COLLECTION, ROSTER_DOC_ID, rosterDocFor(preview));
      setLoaded(preview);
      setRetiredText(idListText(preview.retired));
      setHiddenText(idListText(preview.hidden));
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const resetToShipped = (): void => {
    if (!shipped) return;
    setRetiredText(idListText(shipped.retired));
    setHiddenText(idListText(shipped.hidden));
    setFlash(null);
  };

  return (
    <Panel title="英雄上下架">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        兩張清單，差別只有一件事：<b style={{ color: TEXT_MAIN }}>擋幾條路</b>。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        <b style={{ color: DANGER }}>下架</b>
        ：手動選 ⛔ + 隨機抽 ⛔ —— 誰都拿不到，連 bot 與逾時自動配也不會配到。
        用在<b style={{ color: TEXT_MAIN }}>還沒做完的英雄</b>（技能全空、變身態本體）。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        <b style={{ color: ACCENT }}>隱藏</b>
        ：手動選 ⛔ + <b style={{ color: OK }}>隨機抽 ✅</b> —— 選人格子上看不到、
        🎲 抽不到、商店不賣，但<b style={{ color: TEXT_MAIN }}>沒鎖英雄 / 選角逾時 / bot</b>
        那條路仍然會被伺服器配到。這就是<b style={{ color: ACCENT }}>彩蛋</b>
        （owner 2026-08-17「隱藏角色可以隨機到 但不能選到」）。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        兩張都<b style={{ color: OK }}>擋在白名單之外</b>：平台連不上時白名單整份消失
        （客戶端全開、伺服器 bypass），而這兩張照樣成立。一次手滑的白名單勾選
        也放不回來。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 存檔寫進<b style={{ color: OK }}>耐久覆蓋層</b>（撐得過重新部署），
        玩家<b style={{ color: TEXT_MAIN }}>下一場</b>就生效。
        ⚠️ 存過一次之後，<code>content/config/roster.json</code> 就不再是玩家看到的那一份
        —— 要改就從這一頁改。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>
        {preview ? rosterSummary(preview, roster?.length ?? null) : "讀取中…"}
      </div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      {conflicts.length > 0 && (
        <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>
          ⛔ 這些 id 同時在兩張清單上：<code>{conflicts.join("、")}</code>。
          下架已經擋掉了兩條路，再標成隱藏沒有任何意義，而且讀這份文件的人會以為
          它<b>抽得到</b>。挑一張留下才能儲存。
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <span style={{ color: TEXT_MAIN, fontSize: 13 }}>下架名單</span>{" "}
        <code style={{ color: TEXT_DIM, fontSize: 11 }}>retiredChampions</code>{" "}
        <span style={{ color: TEXT_DIM, fontSize: 11 }}>
          一行一個英雄 id（也吃逗號／空白分隔）。目前 {retired.ids.length} 位。
        </span>
      </div>
      <textarea
        aria-label="下架英雄名單"
        data-field="retiredChampions"
        value={retiredText}
        rows={10}
        onChange={(e) => setRetiredText(e.target.value)}
        style={boxStyle(retired.unknown.length > 0)}
      />
      {retired.unknown.length > 0 && (
        <div style={{ color: GOLD, fontSize: 13, marginTop: 8 }}>
          ⚠️ 這些 id 不在目前的開放名單裡：<code>{retired.unknown.join("、")}</code>。
          可能只是還沒開放（那沒問題），也可能是<b>打錯字</b> —— 打錯的話它
          <b>不會下架任何人</b>，而你本來要擋的那一位<b>照樣出現在選人畫面上</b>。
        </div>
      )}

      <div style={{ margin: "16px 0 6px" }}>
        <span style={{ color: TEXT_MAIN, fontSize: 13 }}>隱藏名單（彩蛋）</span>{" "}
        <code style={{ color: TEXT_DIM, fontSize: 11 }}>hiddenChampions</code>{" "}
        <span style={{ color: TEXT_DIM, fontSize: 11 }}>
          一行一個英雄 id。目前 {hidden.ids.length} 位。
        </span>
      </div>
      <textarea
        aria-label="隱藏英雄名單"
        data-field="hiddenChampions"
        value={hiddenText}
        rows={8}
        onChange={(e) => setHiddenText(e.target.value)}
        style={boxStyle(hidden.unknown.length > 0)}
      />
      {hidden.unknown.length > 0 && (
        <div style={{ color: GOLD, fontSize: 13, marginTop: 8 }}>
          ⚠️ 這些 id 不在目前的開放名單裡：<code>{hidden.unknown.join("、")}</code>。
          ⚠️ 隱藏英雄<b>必須先在白名單上</b>才抽得到 —— 隨機池是「白名單 ∩ 有模型」，
          不在白名單上的話它<b>連隨機都不會出現</b>，那等於下架而不是彩蛋。
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !dirty || conflicts.length > 0} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <Btn onClick={resetToShipped} disabled={busy || shipped === null}>
          回到出貨值
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {conflicts.length > 0
            ? "有 id 同時在兩張清單上，無法儲存"
            : "整份文件一起寫入（兩張清單 + 文件說明都帶著走）"}
        </span>
      </div>
    </Panel>
  );
}

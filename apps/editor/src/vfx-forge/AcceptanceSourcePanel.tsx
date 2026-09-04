import type { AcceptanceSourceEntry } from "./acceptanceSources";

export function AcceptanceSourcePanel({ source }: { source: AcceptanceSourceEntry }): React.JSX.Element {
  return (
    <details className="vfx-source-ledger" open>
      <summary>來源對照與偏離紀錄 · {source.label}</summary>
      <div className="vfx-source-grid">
        <article><b>Owner 最新目標</b><p>{source.ownerTarget}</p></article>
        <article><b>目前 main</b><small>{source.main.script === "shipped" ? "已有 vfx-script" : "只有 ability 演出"}</small><p>{source.main.summary}</p></article>
        <article><b>JASS／w3x 蝗蟲群</b><small>{source.jass.rawcodes.join(" · ")}</small><p>{source.jass.summary}</p><p>{source.jass.locustComposition}</p></article>
        {source.videoReference ? (
          <article>
            <b>YouTube 動作參考</b><small>{source.videoReference.state === "interval-sampled" ? "已逐秒取樣＋事件格" : "待逐秒取樣；不可當成已驗收"}</small>
            <p><a href={source.videoReference.url} target="_blank" rel="noreferrer">開啟 Owner 提供影片</a></p>
            <p>{source.videoReference.sampleWindows.map((window) => `${window.fromSec}～${window.toSec}秒／每${window.stepSec}秒一格／${window.frameCount}格`).join("；")}</p>
            <p>{source.videoReference.continuityNotes.join("；")}</p>
            <p>{source.videoReference.keyframes.map((frame) => `${frame.atSec.toFixed(2)}秒：${frame.label}`).join("；")}</p>
          </article>
        ) : null}
        <article className={`alignment-${source.resolution.alignment}`}><b>採用方式</b><small>{source.resolution.alignment}</small><p>{source.resolution.note}</p></article>
      </div>
    </details>
  );
}

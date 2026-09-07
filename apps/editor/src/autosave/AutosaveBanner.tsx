/**
 * 💾 C：接回來的東西**明說**它是草稿（GH#1023 驗收第 3 條）。
 *
 * 票文 Known risks 逐字：「⚠️ 草稿與投稿的語意混淆是**真的風險**」。
 * ⇒ 這一格不是裝飾：⛔ 靜靜地把草稿載進來，作者會以為那是**已投稿**的版本，
 *   然後把它當成基準去改 —— 而伺服器上那一份根本不是這個樣子。
 *
 * ⭐ D 的那一格開關也畫在這裡（住處：作者本機，理由寫在 `autosave.ts` 檔頭）。
 */
import type { AutosaveSettings } from "./autosave";
import { DRAFT_LAYERS, DRAFT_LAYER_LABEL, layerCounts, type DraftRecord } from "./model";

export interface AutosaveBannerProps {
  /** 這一次開頁**接回來**的那一份（沒接到就是 null）。 */
  restored: DraftRecord | null;
  /** 存不起來時的那一句話 —— ⛔ 不可以是 null 之後就沒有人知道。 */
  blocked: string | null;
  savedAt: number | null;
  settings: AutosaveSettings;
  onSettings(next: AutosaveSettings): void;
  onDiscard(): void;
}

const BOX: Record<string, string | number> = {
  margin: "8px 0", padding: "9px 11px", borderRadius: 6, fontSize: 12, lineHeight: 1.6,
};

function stamp(at: number): string {
  return new Date(at).toLocaleTimeString("zh-TW", { hour12: false });
}

export function AutosaveBanner(props: AutosaveBannerProps) {
  const { restored, blocked, savedAt, settings, onSettings, onDiscard } = props;
  const counts = restored ? layerCounts([restored]) : null;
  return (
    <>
      {restored && counts ? (
        <section
          role="status"
          data-testid="autosave-restored"
          style={{ ...BOX, border: "1px solid #d9a441", background: "rgba(217, 164, 65, 0.12)", color: "#ffe9c2" }}
        >
          <b>⚠️ 這是草稿 —— 上次留在這台電腦上的自動存檔，⛔ 還沒有投稿</b>
          <div>
            {stamp(restored.savedAt)} 自動存下 ·{" "}
            {DRAFT_LAYERS.map((layer) => `${DRAFT_LAYER_LABEL[layer]} ${counts[layer]}`).join(" · ")} 格微調
          </div>
          <div>伺服器上那一份還是原來的樣子 —— 要它生效請按下面的 <code>save</code>。</div>
          <button type="button" onClick={onDiscard}>丟棄草稿，改用伺服器上那一份</button>
        </section>
      ) : null}

      {blocked ? (
        <section
          role="alert"
          data-testid="autosave-blocked"
          style={{ ...BOX, border: "1px solid #9d4954", background: "rgba(157, 73, 84, 0.16)", color: "#ffd8dc" }}
        >
          {blocked} —— ⭐ 這一頁不會替你留底，關掉分頁就沒了。
        </section>
      ) : null}

      <div data-testid="autosave-settings" style={{ fontSize: 11, opacity: 0.8, margin: "4px 0" }}>
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onSettings({ ...settings, enabled: e.target.checked })}
          />{" "}
          自動把草稿存在本機（editor.autosave）
        </label>{" "}
        <label>
          停手{" "}
          <input
            type="number"
            min={200}
            max={60000}
            step={100}
            value={settings.intervalMs}
            style={{ width: 72 }}
            onChange={(e) => onSettings({ ...settings, intervalMs: Number(e.target.value) })}
          />{" "}
          毫秒後存一次
        </label>
        {settings.enabled
          ? savedAt !== null ? <span> · 上次 {stamp(savedAt)} 存過</span> : null
          : <span> · ⛔ 已關閉：關掉分頁會丟掉未存的修改</span>}
      </div>
    </>
  );
}

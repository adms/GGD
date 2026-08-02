/**
 * VfxLayerPanel — 鑄技工坊的「特效多重選取」面板。
 *
 * 一層一張，順序就是播放順序（由上往下）。每一層可以選特效、設延遲、選跟著誰，
 * 並覆寫五個參數。所有規則與界限都在 {@link ./vfxLayerModel} 裡，這個檔案只負責畫。
 *
 * ⚠️ 這裡**不重複任何驗證**。錯誤訊息一律來自 `validateVfxLayerDraft`，
 * 而那支函式是拿真的 `zAbilityVfxLayer` 去 safeParse 的 —— 界限只有一份定義。
 */
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  validateVfxLayerDraft,
  type VfxLayerDraft,
} from "./vfxLayerModel";

const OVERRIDE_LABEL: Record<string, string> = {
  w3xScale: "縮放",
  tint: "染色 r,g,b",
  flyHeight: "離地高度",
  alpha: "透明度",
  timeScale: "播放速度",
};

const OVERRIDE_HINT: Record<string, string> = {
  w3xScale: "原作大小的倍率。留空 = 用特效文件自己的值",
  tint: "三個 0-255，逗號分開（例如 90,170,255）。三格一起填或一起空",
  flyHeight: "把整層抬高幾個單位。留空 = 貼地",
  alpha: "0 = 完全看不見。留空 ≠ 0，留空是「不覆寫」",
  timeScale: "1 = 原速。2.4 = 快 2.4 倍",
};

const ATTACH_LABEL: Record<string, string> = {
  "": "施法者（預設）",
  caster: "施法者",
  point: "技能落點",
};

export function VfxLayerPanel({
  layers,
  vfxIds,
  onPatch,
  onMove,
  onRemove,
  onAdd,
}: {
  layers: readonly VfxLayerDraft[];
  /** `content/vfx/` 的全部 id —— 433 支閒置的原作發射器就在這張表裡。 */
  vfxIds: readonly string[];
  onPatch(i: number, patch: Partial<VfxLayerDraft>): void;
  onMove(i: number, dir: -1 | 1): void;
  onRemove(i: number): void;
  onAdd(): void;
}) {
  return (
    <section className="forge-vfx-panel">
      <h3>3. 特效堆疊</h3>
      <p className="forge-note">
        由上往下依序播。第一層是主特效（普查頁與圖鑑讀的是它）。
        一層零覆寫時會寫成單值 <code>vfxKey</code>，維持 646 支技能走的相容路徑。
      </p>

      {layers.length === 0 && (
        <p className="forge-note">
          這支技能目前施法不畫東西。按下面加一層就會開始有視覺。
        </p>
      )}

      {layers.map((l, i) => {
        const errs = validateVfxLayerDraft(l);
        return (
          <div className="forge-vfx-layer" data-layer={i} key={i}>
            <header>
              <strong>第 {i + 1} 層</strong>
              {i === 0 && <span className="forge-badge">主特效</span>}
              <button type="button" aria-label={`第 ${i + 1} 層上移`} disabled={i === 0} onClick={() => onMove(i, -1)}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`第 ${i + 1} 層下移`}
                disabled={i === layers.length - 1}
                onClick={() => onMove(i, 1)}
              >
                ↓
              </button>
              <button type="button" aria-label={`移除第 ${i + 1} 層`} onClick={() => onRemove(i)}>
                ✕
              </button>
            </header>

            <label>
              <span>特效</span>
              <input
                list="forge-vfx-ids"
                data-field={`vfx.${i}.vfxKey`}
                aria-label={`第 ${i + 1} 層的特效`}
                value={l.vfxKey}
                onChange={(e) => onPatch(i, { vfxKey: e.target.value })}
              />
              {errs["vfxKey"] && <em className="error">{errs["vfxKey"]}</em>}
            </label>

            <label>
              <span>跟著誰</span>
              <select
                data-field={`vfx.${i}.attachTo`}
                aria-label={`第 ${i + 1} 層跟著誰`}
                value={l.attachTo}
                onChange={(e) => onPatch(i, { attachTo: e.target.value as VfxLayerDraft["attachTo"] })}
              >
                {Object.entries(ATTACH_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>延遲 (ms)</span>
              <input
                data-field={`vfx.${i}.delayMs`}
                aria-label={`第 ${i + 1} 層的延遲`}
                value={l.delayMs}
                placeholder="0"
                onChange={(e) => onPatch(i, { delayMs: e.target.value })}
              />
              {errs["delayMs"] && <em className="error">{errs["delayMs"]}</em>}
            </label>

            <label className="forge-vfx-enabled">
              <input
                type="checkbox"
                data-field={`vfx.${i}.enabled`}
                aria-label={`第 ${i + 1} 層啟用`}
                checked={l.enabled}
                onChange={(e) => onPatch(i, { enabled: e.target.checked })}
              />
              <span>啟用（關掉＝留著設定但不播）</span>
            </label>

            <div className="forge-vfx-overrides">
              {(["w3xScale", "tint", "flyHeight", "alpha", "timeScale"] as const).map((f) => (
                <label key={f} title={OVERRIDE_HINT[f]}>
                  <span>{OVERRIDE_LABEL[f]}</span>
                  <input
                    data-field={`vfx.${i}.${f}`}
                    aria-label={`第 ${i + 1} 層的${OVERRIDE_LABEL[f]}`}
                    value={l[f]}
                    placeholder="不覆寫"
                    onChange={(e) => onPatch(i, { [f]: e.target.value } as Partial<VfxLayerDraft>)}
                  />
                  {errs[f] && <em className="error">{errs[f]}</em>}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        data-field="vfx.add"
        disabled={layers.length >= ABILITY_VFX_LAYER_HARD_CAP}
        title={
          layers.length >= ABILITY_VFX_LAYER_HARD_CAP
            ? `已到硬上限 ${ABILITY_VFX_LAYER_HARD_CAP} 層 —— 那個數字接在客戶端的粒子預算上`
            : undefined
        }
        onClick={onAdd}
      >
        ＋ 加一層特效
      </button>

      {/* 433 支閒置的原作發射器就在這張表裡 —— 打字即篩。 */}
      <datalist id="forge-vfx-ids">
        {vfxIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </section>
  );
}

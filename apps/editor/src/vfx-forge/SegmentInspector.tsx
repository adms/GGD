import { useMemo } from "react";
import { zVfxScriptSegment, type VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { setIn, type ErrorMap } from "../store";
import { retypeSegment } from "./model";

export function SegmentInspector({
  segment,
  index,
  count,
  errors,
  onChange,
  onSelect,
  onDelete,
  onMove,
}: {
  segment: VfxScriptSegment;
  index: number;
  count: number;
  errors: ErrorMap;
  onChange(segment: VfxScriptSegment): void;
  onSelect(index: number): void;
  onDelete(): void;
  onMove(delta: -1 | 1): void;
}) {
  const ui = useMemo(() => walkZod(zVfxScriptSegment, "", "演出段"), []);
  return (
    <aside className="vfx-inspector">
      <header>
        <div><h2>段落 {index + 1}</h2><code>{segment.kind}</code></div>
        <div>
          <button type="button" disabled={index === 0} onClick={() => onSelect(index - 1)}>上一段</button>
          <button type="button" disabled={index === count - 1} onClick={() => onSelect(index + 1)}>下一段</button>
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" disabled={count <= 1} onClick={onDelete}>刪除</button>
        </div>
      </header>
      <p className="vfx-help">slider 的可填界線來自 `vfx-script@1`；上方另列主程式目前真正會套用的 Runtime 上限。</p>
      {segment.kind === "vfx" ? (
        <p className="vfx-help">
          粒子高度使用 WC3 unit：128 w3u = 1 個場景單位；目前實際離地
          {" "}<b>{((segment.flyHeight ?? 0) / 128).toFixed(2)} u</b>。
        </p>
      ) : null}
      <FormRenderer
        node={ui}
        value={segment}
        dataPath=""
        errors={errors}
        onChange={(path, value) => {
          if (path === "" && value && typeof value === "object" && "kind" in value) {
            onChange(retypeSegment(segment, (value as VfxScriptSegment).kind));
            return;
          }
          onChange(setIn(segment, path, value) as VfxScriptSegment);
        }}
      />
    </aside>
  );
}

/**
 * 🎛 模板家族數字預設的可存格條（GH#824 / #825 共用 —— N 頁同型＝一個模板）。
 *
 * 每一格：`key=<LiveEditCell>` → POST /__live/<dataset>/save 到
 * content/ability-templates/tpl-*.json 的 `/params/<key>/default`。
 * 上下界與「留白格不可編」由 middleware 的 rule.check 裁決（讀那一格自己的 min/max），
 * 這裡只把格攤開；tooltip 帶上下界與 origin 出處。
 * 「留白」＝ 該參數刻意沒有家族預設（tint/alpha 那一族 —— 逐支填），⛔ 不開編輯。
 */
import { LiveEditCell } from "./LiveEditCell";
import { TEXT_DIM } from "../theme";

export type NumericParam = {
  key: string;
  default: number | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  origin: string | null;
  editable: boolean;
};

export function TplParamCells(props: {
  dataset: string;
  file: string;
  params: NumericParam[];
  onSaved: () => void;
}): React.JSX.Element {
  if (props.params.length === 0) return <span style={{ color: TEXT_DIM }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
      {props.params.map((p) => (
        <span
          key={p.key}
          style={{ fontSize: 12, whiteSpace: "nowrap" }}
          title={`界 ${p.min ?? "?"}–${p.max ?? "?"}${p.unit ? ` ${p.unit}` : ""}${p.origin ? `\n出處：${p.origin}` : "\n出處：（豁免表上——改值後請補 owner:… origin）"}`}
        >
          <span style={{ color: TEXT_DIM }}>{p.key}=</span>
          {p.editable ? (
            <LiveEditCell
              dataset={props.dataset}
              path={props.file}
              pointer={`/params/${p.key}/default`}
              current={p.default}
              type="number"
              onSaved={props.onSaved}
            />
          ) : (
            <span style={{ color: TEXT_DIM }}>留白</span>
          )}
        </span>
      ))}
    </div>
  );
}

import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UINumberOrLiteral } from "../uiSchema";
import { defaultValueFor } from "../walk";
import { useRawInputs } from "../RawInputContext";
import { NumberField } from "./NumberField";

export function NumberOrLiteralField(props: FieldProps & { node: UINumberOrLiteral }) {
  const { node, value, dataPath, onChange, errors } = props;
  const inputs = useRawInputs();
  const mode = value === node.literal ? "literal" : value === undefined && node.optional ? "" : "number";
  return <fieldset className="field field-number-or-literal">
    <legend>{node.label}{node.optional ? <em> (optional)</em> : null}</legend>
    <label className="field">
      <span className="field-label">取值方式</span>
      <select aria-label={`${node.label} 取值方式`} data-field={`${dataPath}.$mode`} value={mode}
        onChange={e => {
          const selected = e.target.value;
          const next = selected === "literal" ? node.literal : selected === "number" ? defaultValueFor(node.number) : undefined;
          // Clear stale numeric input when changing to the literal, and vice
          // versa. The same draft field must never retain two conflicting forms.
          inputs?.set(dataPath, next === undefined ? "" : typeof next === "string" ? JSON.stringify(next) : String(next),
            typeof next === "string" ? "json" : "number");
          onChange(dataPath, next);
        }}>
        {node.optional ? <option value="">—</option> : null}
        <option value="number">指定數值</option>
        <option value="literal">{node.literal === "all" ? "全部" : node.literal}</option>
      </select>
    </label>
    {mode === "number" ? <NumberField {...props} node={{ ...node.number, label: "數值" }} />
      : <FieldErrors dataPath={dataPath} errors={errors} />}
  </fieldset>;
}

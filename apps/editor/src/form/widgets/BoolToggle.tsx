import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UIBoolean } from "../uiSchema";

export function BoolToggle({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIBoolean }) {
  return (
    <label className="field field-bool">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(dataPath, node.optional && !e.target.checked ? undefined : e.target.checked)}
      />
      <span className="field-label">{node.label}</span>
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}

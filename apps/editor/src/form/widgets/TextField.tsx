import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UIText } from "../uiSchema";
import { AiFillButton } from "../../ai/AiFillButton";

const MULTILINE = new Set(["description", "lore", "notes", "text", "flavor", "flavour"]);

export function TextField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIText }) {
  const leaf = dataPath.split(".").pop() ?? dataPath;
  const set = (v: string) => onChange(dataPath, v === "" && node.optional ? undefined : v);
  const val = typeof value === "string" ? value : "";

  return (
    <label className="field field-text">
      <span className="field-label">
        {node.label}
        {node.optional ? <em> (optional)</em> : null}
        <AiFillButton field={leaf} dataPath={dataPath} onChange={onChange} />
      </span>
      {MULTILINE.has(leaf) ? (
        <textarea rows={3} value={val} onChange={(e) => set(e.target.value)} />
      ) : (
        <input type="text" value={val} onChange={(e) => set(e.target.value)} />
      )}
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}

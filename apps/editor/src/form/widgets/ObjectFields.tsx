import type { FieldProps } from "../FormRenderer";
import { FieldErrors, renderNode } from "../FormRenderer";
import type { UIObject } from "../uiSchema";

export function ObjectFields({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIObject }) {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const body = node.fields.map((f) => {
    const key = f.path.split(".").pop() ?? f.path;
    return (
      <div key={f.path}>
        {renderNode({
          node: f,
          value: record[key],
          dataPath: dataPath ? `${dataPath}.${key}` : key,
          errors,
          onChange,
        })}
      </div>
    );
  });
  // root object: no fieldset chrome
  if (dataPath === "") return <div className="field-object-root">{body}</div>;
  return (
    <fieldset className="field field-object">
      <legend>
        {node.label}
        {node.optional ? <em> (optional)</em> : null}
      </legend>
      {body}
      <FieldErrors dataPath={dataPath} errors={errors} />
    </fieldset>
  );
}

/**
 * Union card keyed by the discriminator ("kind" for EffectDef): a select that
 * switches variants (re-seeding the value with that variant's defaults) plus
 * the variant's own fields.
 */
import type { FieldProps } from "../FormRenderer";
import { FieldErrors, renderNode } from "../FormRenderer";
import { defaultForVariant } from "../walk";
import type { UIDiscriminatedUnion } from "../uiSchema";

export function DiscriminatedUnionField({
  node,
  value,
  dataPath,
  errors,
  onChange,
}: FieldProps & { node: UIDiscriminatedUnion }) {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const currentTag = String(record[node.discriminator] ?? node.variants[0]?.tag ?? "");
  const variant = node.variants.find((v) => v.tag === currentTag);

  return (
    <div className="field field-union" data-variant={currentTag}>
      <label className="union-kind">
        <span className="field-label">{node.label}</span>
        <select
          value={currentTag}
          onChange={(e) => onChange(dataPath, defaultForVariant(node, e.target.value))}
        >
          {node.variants.map((v) => (
            <option key={v.tag} value={v.tag}>
              {v.tag}
            </option>
          ))}
        </select>
      </label>
      <div className="union-card">
        {variant
            ? variant.fields.map((f, fieldIndex) => {
              const key = f.path.split(".").pop() ?? f.path;
              return (
                <div key={`${f.path}:${fieldIndex}`}>
                  {renderNode({
                    node: f,
                    value: record[key],
                    dataPath: dataPath ? `${dataPath}.${key}` : key,
                    errors,
                    onChange,
                  })}
                </div>
              );
            })
          : null}
      </div>
      <FieldErrors dataPath={dataPath} errors={errors} />
      <FieldErrors dataPath={dataPath ? `${dataPath}.${node.discriminator}` : node.discriminator} errors={errors} />
    </div>
  );
}

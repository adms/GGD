import type { PassivePresentationRule } from "./passivePresentationPrinciples";

const SUPPORT_LABEL: Record<PassivePresentationRule["support"], string> = {
  authored: "✅ 已有專屬演出",
  "runtime-default": "🟦 Runtime 預設演出",
  "authorable-inline": "🟨 可用現有積木補完",
  "main-trigger-gap": "⛔ 缺 Main 事件歸屬積木",
};

export function PassivePresentationPanel(props: {
  readonly rules: readonly PassivePresentationRule[];
}): React.JSX.Element | null {
  if (props.rules.length === 0) return null;
  return (
    <section
      data-field="passive-presentation-plan"
      style={{ border: "1px solid #38516f", borderRadius: 8, padding: 12, margin: "12px 0", background: "rgba(35,72,105,0.1)" }}
    >
      <b>🧩 被動技能演出模板（依真正觸發事件）</b>
      <p style={{ margin: "6px 0 10px", opacity: 0.78 }}>
        被動不補假施法。普攻、暴擊、迴避、格擋、反彈與週期效果各自綁回原本的權威事件；能用現有積木的顯示作者入口，事件無法正確歸屬時明確回報 Main 缺口。
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {props.rules.map((rule, index) => (
          <li key={`${rule.kind}-${index}`} data-field={`passive-presentation-${rule.kind}`} style={{ marginBottom: 7 }}>
            <b>{rule.label}</b> · {SUPPORT_LABEL[rule.support]} · <code>{rule.authoringSurface}</code>
            <div style={{ opacity: 0.78 }}>{rule.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

# Content Editor SPA — TODO

`apps/editor` (Vite + React + Zustand + react-query). Schema-driven forms generated
from the SHARED Zod schemas by a hand-rolled field-walker; CRUD via content-api;
preview computes real FinalStats in a sandbox SimWorld. `src/preview3d/` adds real
Babylon panels (model inspector / vfx / arena / champion embed) fed by the
content-api asset route. The real-engine preview gate item (content-11) lives in
[content-pipeline.md](content-pipeline.md).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| editor-01 | Zod walker emits every widget kind (text/number/bool/enum/array/record/ref/literal) | editor-walker-widgets | unit | done |
| editor-02 | Walker handles discriminated EffectDef union + depth-capped recursion | editor-walker-union | unit | done |
| editor-03 | Store: dirty tracking, immutable path updates, 422 error mapping to fields | editor-store-dirty | unit | done |
| editor-04 | RefSelect options come from the target collection index (component test) | editor-ref-select | unit | pending |
| editor-05 | BabylonPreview: champion/ability/vfx through the real renderer | editor-babylon-preview | integration | pending |
| editor-06 | Map/arena editor: 2D ortho placement + 3D walk preview | editor-map-editor | integration | pending |
| editor-07 | Model inspector: .glb clip mapping + hitbox overlay | editor-model-inspector | integration | done |
| editor-08 | Arena decor placement math: rotQuarter -> rotation.y ground transform (3D panel placement truth) | editor-decor-transform | unit | done |
| editor-09 | toParticleSystem: vfx@1 doc -> Babylon ParticleSystem (emitter/mode/lifetime/size/color/blend/texture) | editor-vfx-particles | unit | done |
| editor-10 | content-api /content-api/assets/* serves GLB/texture binaries to the 3D panels (path-confined) | editor-asset-route | integration | done |
| editor-11 | AI-icon prompt PREFILL builder (name+description+tags+per-kind traits), kind→asset-path mapping, AI 填空 field/context helpers (pure) | editor-ai-prompt | unit | done |
| editor-12 | AI-icon Accept flow writes the PNG asset then sets the doc `icon` field (mocked content-api + real store round-trip) | editor-ai-accept | unit | done |
| editor-13 | AI proxy client speaks the CONTRACT shape; provider-unconfigured ⇒ stub placeholder surfaces the "configure AI in admin" state; base64/data-url helpers | editor-ai-stub | unit | done |

---

## AI 生成 icon + AI 填空 (task #23, editor half)

`src/ai/` adds two authoring aids to the champion / ability / item editors, coded
against the **AI icon/text CONTRACT** (the Go platform's `internal/ai` proxy is
built concurrently; the editor never sees the provider API key — it only calls
the proxy, which attaches the server-side key).

- **AI 生成 icon** (`AiIconPanel.tsx`): a prompt textarea PREFILLED from the doc's
  `name` + `description` + `tags` (+ per-kind traits) via the pure
  `buildIconPrompt` — `Generate` → `POST /api/v1/ai/icon {prompt, style?, size?}`
  → preview the returned PNG → `Accept` writes it to
  `content/assets/icons/<kind>/<docId>.png` (content-api asset PUT, capi-08) and
  sets the doc's `icon` field (`acceptIcon`, then the user Saves the doc).
- **AI 填空** (`AiFillButton.tsx` + `AiFillContext.tsx`): a small button beside
  free-text fields (description / name / …) → `POST /api/v1/ai/text {prompt,
  field, context}` → fills the value for the user to edit before saving.
- **Unconfigured/stub state**: when the provider is not configured the proxy
  answers with `stub: true` + a deterministic placeholder; the panel still
  previews it, `iconResultStatus` surfaces the graceful "configure AI in admin"
  banner, and Accept still works — the whole flow is exercisable with no key.

Dev wiring: `vite.config.ts` proxies `/api` → the Go platform
(`VITE_PLATFORM_API_URL`, default `localhost:8080`); same-origin under nginx in
the dev profile. Suite: `src/ai/*.test.ts` (pure — prompt builder, Accept flow
with a mocked content-api, stub-state presenter; node env, no DOM).

# AI icon/text generation (platform proxy + admin config + editor) — TODO

Task #23. The editor can generate an icon PNG from a description and AI-fill
description/param text fields. The AI provider (endpoint / key / model) is
configured in the ADMIN backend; **the API key stays SERVER-SIDE** — the
editor/client never sees it. The editor/client calls a **platform proxy** that
attaches the key to the outbound provider call.

**Boundaries.** Ships **DISABLED by default**; nobody bundles a real key. When
unconfigured (disabled / no key / no endpoint) the proxy runs in **STUB MODE**:
`/ai/icon` returns a deterministic gradient+glyph placeholder PNG and `/ai/text`
a canned string, each flagged `stub:true`, so the whole editor flow is testable
without a key. The admin UI accepts the operator's OWN key. Provider-agnostic:
OpenAI-compatible and Anthropic-compatible shapes are both handled.

The two AUDIO capabilities (`/ai/tts`, `/ai/music`) deliberately break that
pattern: there is no placeholder worth shipping — a fake clip or a fake
45-second track is worse than none — so unconfigured they answer **501 with
`{stub:true}` and NO audio**, naming the local fallback instead (client-side
machine-VO clips for TTS, `tools/bgm-gen` for music, which is what actually
produced the shipped pack).

**Contract (endpoints).**
- `POST /api/v1/ai/icon` `{prompt, style?, size?}` → `{pngBase64, dataUrl, mime, stub}` — authed.
- `POST /api/v1/ai/text` `{prompt, field, context}` → `{text, stub}` — authed.
- `POST /api/v1/ai/tts` `{text, lang?, voice?}` → `{mp3Base64, dataUrl, mime, stub:false}` — authed. Unconfigured → **501** `{stub:true, code:"tts_not_configured", message}`; empty/oversized text → 400. `voice` overrides the configured default voice; the provider call is the OpenAI-compatible `POST {ttsBaseUrl}/audio/speech`.
- `POST /api/v1/ai/music` `{prompt, scene?, tags?, durationSec?, seed?, instrumental?}` → `{mp3Base64, dataUrl, mime, stub:false}` — authed. Unconfigured → **501** `{stub:true, code:"music_not_configured", message, localGenerator:{tool:"tools/bgm-gen", entry}}`; empty/oversized prompt or oversized tags → 400. `instrumental` **defaults to TRUE** when omitted (game BGM is instrumental — send `false` explicitly to allow vocals); `durationSec` is CLAMPED into the supported range rather than rejected (omitted → default). Music has its OWN, tighter per-account rate budget, separate from the shared icon/text one. The provider call is `POST {musicBaseUrl}/audio/music`.
- `GET  /api/v1/admin/ai/config` → masked config `{enabled, imageBaseUrl, imageModel, textBaseUrl, textModel, ttsBaseUrl, ttsModel, ttsVoice, musicBaseUrl, musicModel, apiKeyMasked, hasKey, imageReady, textReady, ttsReady, musicReady, version, updatedAt}` — admin only.
- `PUT  /api/v1/admin/ai/config` `{enabled?, imageBaseUrl?, imageModel?, textBaseUrl?, textModel?, ttsBaseUrl?, ttsModel?, ttsVoice?, musicBaseUrl?, musicModel?, apiKey?}` → masked config — admin only. **Every field is optional and the save is a PARTIAL update**: omit to keep the stored value, send `""` to clear. That is the same write-only rule the `apiKey` always had, extended to every field — capabilities are configured independently, so a client that only knows about some of them must not blank the rest.

Durable truth: `data/config/ai-provider.json` via the jsonstore (atomic
tmp+rename, single writer). The raw key lives in that file (server-side, admin
read) and is NEVER returned in full — the GET masks it (`sk-…abcd`). The key is
read from server config, attached to the outbound call, and never logged.

## Platform — proxy + provider config (`apps/platform/internal/ai`)

`internal/ai`: a `Service`/`Repo` over the jsonstore for the provider config
(masked `Public` projection), provider-agnostic image + text calls
(`provider.go`, OpenAI + Anthropic shapes), speech + BGM calls
(`generate.go` / `music.go`, OpenAI-compatible audio shapes), a deterministic
placeholder PNG + canned text (`stub.go`), per-account rate limiting (icon+text
share a budget; music has its own tighter one), and handlers wired in
`internal/server/server.go` (generation endpoints authed; config endpoints
behind `admin.Service.AdminOnly`, audited).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ai-plat-01 | Config round-trips; API key MASKED on read (never returned in full), raw key persisted server-side on disk; write-only key semantics (omit = keep, `""` = clear) | ai-config-mask | security | done |
| ai-plat-02 | Unconfigured → STUB: icon is a deterministic gradient+glyph placeholder PNG (valid PNG magic + requested size, stable per seed), flagged `stub:true`; empty prompt → 400 | ai-stub-png | unit | done |
| ai-plat-03 | Unconfigured → STUB: text is a canned, field-aware string flagged `stub:true`; empty prompt → 400 | ai-stub-text | unit | done |
| ai-plat-04 | Configured → the proxy calls the provider, ATTACHES the server-side key to the outbound request, returns the provider result (`stub:false`), and NEVER logs the key | ai-provider-call | integration | done |
| ai-plat-05 | Provider failure → clean 502 envelope (no key echo), never a silent stub fallback | ai-provider-error | exception | done |
| ai-plat-06 | Per-account rate limit shared by the icon + text endpoints | ai-rate-limit | security | done |
| ai-plat-07 | Config read/write is admin-gated (no token → 401, normal user → 403, admin → 200); masked round-trip over HTTP, raw key never in a response | ai-api-admin-config | security | done |
| ai-plat-08 | `/ai/icon` authed; unconfigured returns the stub shape `{pngBase64, dataUrl, mime, stub}`; empty prompt → 400 | ai-api-icon-stub | integration | done |
| ai-plat-09 | `/ai/text` authed; unconfigured returns `{text, stub}` with a non-empty canned string | ai-api-text-stub | integration | done |
| ai-plat-10 | Config PUT is a PARTIAL update: omitted fields (incl. `enabled`) keep their stored value, so a console save that only sends image/text never blanks a tts/music provider; an explicitly-sent `""` still clears just that field | ai-api-config-partial-save | regression | done |
| ai-plat-11 | Unconfigured → TTS STUB: `stub:true` carrying NO audio bytes (callers keep their local machine-VO clips instead of a silent empty clip); empty text and oversized text → 400 | ai-tts-stub | unit | done |
| ai-plat-12 | Configured → the proxy POSTs the OpenAI-compatible `/audio/speech` (model, input, `response_format:mp3`), ATTACHES the server-side key, uses the config default voice unless the request names one, forwards the lang hint, returns the raw MP3 bytes (`stub:false`), and NEVER logs the key | ai-tts-provider-call | integration | done |
| ai-plat-13 | TTS provider failure → clean 502-style error (no key echo), never a silent stub fallback | ai-tts-provider-error | exception | done |
| ai-plat-14 | Unconfigured → music STUB: `stub:true` carrying NO audio (the caller falls back to `tools/bgm-gen`, which produced the shipped pack); empty prompt, oversized prompt and oversized tags → 400 | ai-music-stub | unit | done |
| ai-plat-15 | Configured → the proxy POSTs `/audio/music`, ATTACHES the server-side key, forwards a shaped prompt (caller description + style tags + scene + explicit "no vocals" + loopable) with seed/instrumental, CLAMPS duration into the supported range instead of rejecting (omitted → default), returns the raw audio bytes + MIME (`stub:false`), and NEVER logs the key | ai-music-provider-call | integration | done |
| ai-plat-16 | Music provider failure → clean 502-style error (no key echo), never a silent stub fallback | ai-music-provider-error | exception | done |
| ai-plat-17 | Music has its OWN, much tighter per-account budget than icon/text: spending the whole music budget is refused with a rate-limit error yet leaves text generation working, so neither capability can drain the other | ai-music-rate-limit | security | done |
| ai-plat-18 | Music is configured with the same server-side key as every other capability: once fully configured the masked public view still exposes `musicBaseUrl`/`musicModel` but NEVER the raw key, which stays server-side on disk | ai-music-key-never-returned | security | done |
| ai-plat-19 | `/ai/tts` authed (no token → 401); unconfigured → 501 `{stub:true, code:"tts_not_configured"}` with no audio field; empty text → 400 `bad_request` | ai-api-tts-stub | integration | done |
| ai-plat-20 | `/ai/music` authed (no token → 401); unconfigured → 501 `{stub:true, code:"music_not_configured"}` naming the local generator `tools/bgm-gen`, with no audio field; empty prompt → 400 `bad_request` | ai-api-music-stub | integration | done |
| ai-plat-21 | Music provider fields round-trip over HTTP through the admin-gated config endpoint (`musicReady` flips, an unconfigured capability stays stub), the raw key is never in the response, and a normal user reading the config → 403 | ai-api-music-config | security | done |
| ai-plat-22 | The outbound IMAGE request matches the dialect the configured model speaks: the current models get NO `response_format` (they reject it) and a size they actually offer; the legacy DALL·E models keep `response_format:b64_json` and get the requested edge snapped UP; a provider that answers with a `url` instead of base64 still yields bytes, fetched WITHOUT the API key | ai-image-dialect | regression | done |
| ai-plat-23 | Real async music providers behind the seam: a REPLICATE-style base URL is detected off `musicBaseUrl` (`musicProviderKind`, like `isAnthropic`) and driven create→poll→fetch — create returns a job id + poll URL, the poll goes pending→succeeded, the delivery host returns the bytes; `GenerateMusic` still returns FINISHED MP3 bytes (handlers/client untouched); the music path runs on a per-provider client with a LONGER deadline than the shared 60s timeout; the key is attached to create+poll (Bearer) but NEVER to the delivery host and NEVER logged | ai-music-async-poll | integration | done |
| ai-plat-24 | A SUNO-style async provider (detected off `musicBaseUrl`) is driven against a fake server: create `/generate` returns a job id, poll `/feed/{id}` goes processing→complete with an `audio_url`, the delivery host returns the bytes; instrumental intent is forwarded, `GenerateMusic` returns finished bytes, and the key is attached to create+poll but not the delivery host and never logged | ai-music-async-suno | integration | done |
| ai-plat-25 | One-click BGM pack: `GenerateBGMPack` loops the eleven audio-map BGM scenes through `GenerateMusic`, returning a finished track per scene (each carrying the shaped prompt + the server-side key, never logged); an unconfigured provider short-circuits to `Stub=true` with no tracks (the caller renders locally with `tools/bgm-gen`); a per-scene failure is recorded on that track and the batch continues | ai-music-oneclick-pack | integration | done |

## Admin console — AI 生成設定 page (`apps/admin`)

An `AI 生成設定` page: enabled toggle, a base URL + model per capability
(image / text / tts / music, plus the default TTS voice), and a write-only
API-key field (shows the masked stored value as a placeholder, replaced only
when the admin types a new one). Save posts to the admin endpoint;
a status badge shows configured vs stub-mode. All parse/status/payload/validation
logic is pure (`src/ai.ts`, unit-tested); the page is presentation only.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ai-admin-01 | Masked-config tolerant parse (bare / `{config:…}` / garbage), configured-vs-stub status + per-capability status, form seeding (empty untouched key box), base-URL validation | adminui-ai-config | unit | done |
| ai-admin-02 | Write-only save payload: untouched key box → omit `apiKey` (keep stored secret), typed → send it, touched-empty → clear; API round-trip never expects a raw key back | adminui-ai-save | unit | done |
| ai-admin-03 | The tts + music providers are editable on the page (endpoint / model / default voice) and every save carries all four capabilities, so editing one never drops another from the payload | adminui-ai-tts-music | regression | done |

## Editor — AI icon control + AI 填空 (`apps/editor`)

The editor half (handed off): an `AI 生成 icon` control (prompt prefilled from
the doc's name + description + tags → Generate → preview the returned PNG →
Accept saves it to `content/assets/icons/<kind>/<docId>.png` via the existing
content-api asset PUT and sets the doc's `icon` field), plus a small `AI 填空`
button beside description/text fields that calls `/ai/text` with the field + doc
context and fills the value for the user to edit. The provider-unconfigured/stub
state is shown gracefully (still works, produces a placeholder).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ai-editor-01 | `AI 生成 icon`: prompt prefilled from name+description+tags, Generate → preview PNG, Accept saves the asset + sets the doc `icon` field | editor-ai-icon | unit | pending |
| ai-editor-02 | `AI 填空` beside description/param fields calls `/ai/text` with the field + doc context and fills the value for editing | editor-ai-fill | unit | pending |
| ai-editor-03 | Provider-unconfigured/stub state surfaced gracefully (still works, placeholder image + canned text) | editor-ai-stub-state | unit | pending |

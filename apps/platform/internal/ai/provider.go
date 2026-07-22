package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, provErr("encode request: %v", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, provErr("build request: %v", err)
	}
	authHeaders(req, cfg, anthropic)
	resp, err := s.http.Do(req)
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
func (s *Service) fetchImageBytes(ctx context.Context, url string) ([]byte, error) {
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
		return s.fetchImageBytes(ctx, href)
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

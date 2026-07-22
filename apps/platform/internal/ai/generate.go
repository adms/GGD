package ai

import (
	"context"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// generate.go is the policy layer over the provider: it enforces the rate
// limit, validates input, decides STUB vs real for each capability, shapes the
// provider prompt, and returns a uniform result flagged `stub`.

// IconResult is the outcome of an icon generation.
type IconResult struct {
	// PNG is raw PNG bytes (a placeholder in stub mode, else the provider image).
	PNG []byte
	// Stub reports that no provider was configured and PNG is a placeholder.
	Stub bool
}

// TextResult is the outcome of a text generation.
type TextResult struct {
	Text string
	Stub bool
}

// clampSize normalizes a requested icon edge in pixels.
func clampSize(size int) int {
	if size == 0 {
		return defaultSize
	}
	if size < minSize {
		return minSize
	}
	if size > maxSize {
		return maxSize
	}
	return size
}

// validatePrompt trims and bounds a prompt, rejecting an empty or oversized one.
func validatePrompt(prompt string) (string, error) {
	p := strings.TrimSpace(prompt)
	if p == "" {
		return "", httpx.BadRequest("prompt is required")
	}
	if len(p) > maxPromptLen {
		return "", httpx.BadRequest("prompt too long")
	}
	return p, nil
}

// GenerateIcon returns an icon PNG for the prompt. Unconfigured => a
// deterministic placeholder (Stub=true). Configured => the provider image; a
// provider failure surfaces as a clean error (never a silent placeholder).
func (s *Service) GenerateIcon(ctx context.Context, accountID, prompt, style string, size int) (IconResult, error) {
	prompt, err := validatePrompt(prompt)
	if err != nil {
		return IconResult{}, err
	}
	if len(style) > maxFieldLen*4 {
		style = style[:maxFieldLen*4]
	}
	size = clampSize(size)

	ok, err := s.allow(ctx, accountID)
	if err != nil {
		return IconResult{}, err
	}
	if !ok {
		return IconResult{}, httpx.RateLimited("too many AI requests, slow down")
	}

	cfg, err := s.repo.Load()
	if err != nil {
		return IconResult{}, err
	}
	if !cfg.imageReady() {
		png, perr := PlaceholderPNG(prompt+"|"+style, size)
		if perr != nil {
			return IconResult{}, httpx.Internal("placeholder render failed")
		}
		return IconResult{PNG: png, Stub: true}, nil
	}

	png, perr := s.generateImagePNG(ctx, cfg, iconPrompt(prompt, style), size)
	if perr != nil {
		return IconResult{}, providerFailure(perr)
	}
	return IconResult{PNG: png, Stub: false}, nil
}

// GenerateText returns generated text for a field. Unconfigured => a canned
// string (Stub=true). Configured => the provider completion.
func (s *Service) GenerateText(ctx context.Context, accountID, prompt, field, docContext string) (TextResult, error) {
	prompt, err := validatePrompt(prompt)
	if err != nil {
		return TextResult{}, err
	}
	field = strings.TrimSpace(field)
	if len(field) > maxFieldLen {
		return TextResult{}, httpx.BadRequest("field name too long")
	}
	if len(docContext) > maxContextLen {
		docContext = docContext[:maxContextLen]
	}

	ok, err := s.allow(ctx, accountID)
	if err != nil {
		return TextResult{}, err
	}
	if !ok {
		return TextResult{}, httpx.RateLimited("too many AI requests, slow down")
	}

	cfg, err := s.repo.Load()
	if err != nil {
		return TextResult{}, err
	}
	if !cfg.textReady() {
		return TextResult{Text: stubText(field, prompt, docContext), Stub: true}, nil
	}

	system, user := textPrompt(field, prompt, docContext)
	out, perr := s.generateText(ctx, cfg, system, user)
	if perr != nil {
		return TextResult{}, providerFailure(perr)
	}
	return TextResult{Text: out, Stub: false}, nil
}

// TTSResult is the outcome of a speech generation. There is NO stub audio: in
// stub mode MP3 is nil and Stub is true — the handler maps that to a 501-style
// JSON response and the client tooling keeps its local (say-generated) clips.
type TTSResult struct {
	// MP3 is raw MP3 bytes from the provider (nil in stub mode).
	MP3 []byte
	// Stub reports that no TTS provider was configured (no audio produced).
	Stub bool
}

// GenerateTTS returns synthesized speech for the text. Unconfigured => Stub=true
// with NO audio (unlike icon/text there is no meaningful placeholder — the
// client tooling falls back to its local machine-VO clips). Configured => raw
// MP3 bytes from the provider; a provider failure surfaces as a clean error.
func (s *Service) GenerateTTS(ctx context.Context, accountID, text, lang, voice string) (TTSResult, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return TTSResult{}, httpx.BadRequest("text is required")
	}
	if len(text) > maxTTSTextLen {
		return TTSResult{}, httpx.BadRequest("text too long")
	}
	lang = strings.TrimSpace(lang)
	if len(lang) > maxLangLen {
		return TTSResult{}, httpx.BadRequest("lang too long")
	}
	voice = strings.TrimSpace(voice)
	if len(voice) > maxVoiceLen {
		return TTSResult{}, httpx.BadRequest("voice too long")
	}

	ok, err := s.allow(ctx, accountID)
	if err != nil {
		return TTSResult{}, err
	}
	if !ok {
		return TTSResult{}, httpx.RateLimited("too many AI requests, slow down")
	}

	cfg, err := s.repo.Load()
	if err != nil {
		return TTSResult{}, err
	}
	if !cfg.ttsReady() {
		return TTSResult{Stub: true}, nil
	}

	mp3, perr := s.generateTTSMP3(ctx, cfg, text, lang, voice)
	if perr != nil {
		return TTSResult{}, providerFailure(perr)
	}
	return TTSResult{MP3: mp3, Stub: false}, nil
}

// iconPrompt shapes the outbound image prompt: the user's description first,
// then an optional style, then a concise game-icon instruction.
func iconPrompt(prompt, style string) string {
	var b strings.Builder
	b.WriteString(prompt)
	if s := strings.TrimSpace(style); s != "" {
		b.WriteString(". Style: ")
		b.WriteString(s)
	}
	b.WriteString(". A single centered game champion/ability icon, high contrast, clean silhouette, no text, no border.")
	return b.String()
}

// textPrompt builds the system + user messages for a field completion.
func textPrompt(field, prompt, docContext string) (system, user string) {
	system = "You write concise, flavorful copy for a voxel arena MOBA game editor. " +
		"Reply with ONLY the requested field value — no preamble, no quotes, no markdown."
	var b strings.Builder
	if field != "" {
		b.WriteString("Field to write: ")
		b.WriteString(field)
		b.WriteString("\n")
	}
	if strings.TrimSpace(docContext) != "" {
		b.WriteString("Context:\n")
		b.WriteString(docContext)
		b.WriteString("\n")
	}
	b.WriteString("Instruction: ")
	b.WriteString(prompt)
	return system, b.String()
}

// providerFailure maps a providerError to a clean 502 envelope. Any other error
// (a bug) is left as-is for the generic 500 path. The key is never included.
func providerFailure(err error) error {
	if _, ok := err.(*providerError); ok {
		return httpx.Err(502, "ai_provider", "AI provider request failed: "+err.Error())
	}
	return err
}

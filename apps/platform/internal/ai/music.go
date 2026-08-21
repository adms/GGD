package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ggd/platform/internal/httpx"
)

// music.go is the BGM-generation capability of the AI proxy: policy (rate
// limit, validation, stub-vs-real) plus the outbound provider call. It mirrors
// the TTS capability exactly — same server-side key handling, same stub
// contract, same clean provider errors — and differs only in what it asks for.
//
// STUB CONTRACT (the shipped default). Like TTS and unlike icon/text, there is
// no meaningful placeholder: a fake 45-second track would be worse than no
// track. So an unconfigured proxy returns Stub=true with NO audio and the
// handler answers 501 naming the local fallback — which for music is a real
// one: tools/bgm-gen synthesises the whole pack offline and deterministically,
// with no provider and no licence question. The shipped BGM was made that way.
//
// PROVIDER SEAM (task #53 — Suno / Stability / Replicate). Everything
// provider-specific is behind generateMusicAudio below. It currently speaks one
// shape: an OpenAI-compatible POST {base}/audio/music that returns the audio
// bytes synchronously, which is what the config's musicBaseUrl/musicModel
// describe. The real services differ in two ways that #53 has to absorb there
// and NOWHERE ELSE:
//
//   - They are ASYNC. Suno and Replicate return a job id; the audio is fetched
//     by polling. That polling belongs inside generateMusicAudio (or a
//     per-provider implementation selected the way isAnthropic selects the text
//     shape) so GenerateMusic keeps returning finished bytes.
//   - They need a LONGER deadline than the shared 60s providerTimeout on
//     s.http. A per-provider client with its own timeout is the intended fix;
//     s.http stays the injection point tests use.
//
// The request/response contract of GenerateMusic — prompt in, MP3 bytes out,
// flagged stub — is what the client and the handler depend on, so #53 can
// rewrite the adapter without touching either.

// MusicResult is the outcome of a music generation. Like TTSResult there is NO
// stub audio: in stub mode Audio is nil and Stub is true.
type MusicResult struct {
	// Audio is the raw encoded track from the provider (nil in stub mode).
	Audio []byte
	// MIME is the audio content type ("audio/mpeg" for MP3).
	MIME string
	// Stub reports that no music provider was configured (no audio produced).
	Stub bool
}

// MusicRequest is one BGM generation. Only Prompt is required; the rest shape
// the track so a generated cue can be dropped into the existing pack.
type MusicRequest struct {
	// Prompt describes the music to generate (required).
	Prompt string
	// Scene is the optional audio-map scene key the track is destined for
	// ("menu", "combat", …). It is a label for the prompt, not a lookup.
	Scene string
	// Tags is an optional free-form style/genre hint ("orchestral, taiko").
	Tags string
	// DurationSec is the requested length; clamped to [minMusicSec, maxMusicSec].
	DurationSec int
	// Instrumental asks for no vocals. Game BGM is normally instrumental, so
	// this defaults ON at the handler unless a caller says otherwise.
	Instrumental bool
	// Seed makes a provider run reproducible where the provider supports it
	// (0 = let the provider choose).
	Seed int
}

// clampDuration normalizes a requested track length in seconds.
func clampDuration(sec int) int {
	if sec == 0 {
		return defaultMusicSec
	}
	if sec < minMusicSec {
		return minMusicSec
	}
	if sec > maxMusicSec {
		return maxMusicSec
	}
	return sec
}

// GenerateMusic returns a generated BGM track. Unconfigured => Stub=true with
// NO audio (the caller falls back to tools/bgm-gen). Configured => the encoded
// track from the provider; a provider failure surfaces as a clean 502-style
// error, never a silent stub.
func (s *Service) GenerateMusic(ctx context.Context, accountID string, req MusicRequest) (MusicResult, error) {
	prompt, err := validatePrompt(req.Prompt)
	if err != nil {
		return MusicResult{}, err
	}
	req.Prompt = prompt

	req.Scene = strings.TrimSpace(req.Scene)
	if len(req.Scene) > maxMusicSceneLen {
		return MusicResult{}, httpx.BadRequest("scene name too long")
	}
	req.Tags = strings.TrimSpace(req.Tags)
	if len(req.Tags) > maxMusicTagsLen {
		return MusicResult{}, httpx.BadRequest("tags too long")
	}
	req.DurationSec = clampDuration(req.DurationSec)

	ok, err := s.allowMusic(ctx, accountID)
	if err != nil {
		return MusicResult{}, err
	}
	if !ok {
		return MusicResult{}, httpx.RateLimited("too many music generations, slow down")
	}

	cfg, err := s.repo.Load()
	if err != nil {
		return MusicResult{}, err
	}
	if !cfg.musicReady() {
		return MusicResult{Stub: true}, nil
	}

	audio, perr := s.generateMusicAudio(ctx, cfg, req)
	if perr != nil {
		return MusicResult{}, providerFailure(perr)
	}
	return MusicResult{Audio: audio, MIME: "audio/mpeg", Stub: false}, nil
}

// musicPrompt shapes the outbound prompt: the caller's description first, then
// the style tags, then the scene the cue is for, then the one instruction that
// makes a track usable as game BGM (loopable, no vocals when instrumental).
func musicPrompt(req MusicRequest) string {
	var b strings.Builder
	b.WriteString(req.Prompt)
	if req.Tags != "" {
		b.WriteString(". Style: ")
		b.WriteString(req.Tags)
	}
	if req.Scene != "" {
		b.WriteString(". For the ")
		b.WriteString(req.Scene)
		b.WriteString(" screen of a fantasy arena game")
	}
	if req.Instrumental {
		b.WriteString(". Instrumental only, no vocals, no lyrics")
	}
	b.WriteString(". Seamlessly loopable, consistent tempo, no fade-in and no fade-out.")
	return b.String()
}

// musicClient is the per-provider HTTP client for the music path: it reuses the
// transport of the injected s.http (so tests still reach their fake server) but
// carries the much longer musicProviderTimeout instead of the shared 60s one — a
// real track, sync or polled, is minutes of provider compute.
func (s *Service) musicClient() *http.Client {
	base := s.http
	if base == nil {
		return &http.Client{Timeout: musicProviderTimeout}
	}
	return &http.Client{Transport: base.Transport, Timeout: musicProviderTimeout}
}

// MusicClientTimeout reports the deadline the music path actually runs with. It
// exists so a test can assert the music client is given a LONGER deadline than
// the shared providerTimeout without reaching into unexported state.
func (s *Service) MusicClientTimeout() time.Duration { return s.musicClient().Timeout }

// musicPollInterval is the wait between async job polls (defaultMusicPoll unless
// a test overrode it).
func (s *Service) musicPollInterval() time.Duration {
	if s.musicPoll > 0 {
		return s.musicPoll
	}
	return defaultMusicPoll
}

// generateMusicAudio calls the configured music provider and returns the raw
// encoded track. THIS IS THE PROVIDER SEAM described at the top of the file: it
// selects the provider dialect off the music base URL (musicProviderKind) and
// hands off to the matching adapter. GenerateMusic above — and therefore the
// handler and client — is untouched: every adapter returns finished MP3 bytes.
// The server-side key is attached by authHeaders and is never logged.
func (s *Service) generateMusicAudio(ctx context.Context, cfg Config, req MusicRequest) ([]byte, error) {
	switch musicProviderKind(cfg.MusicBaseURL) {
	case musicKindReplicate:
		return s.generateMusicAsync(ctx, cfg, req, replicateMusicAPI)
	case musicKindSuno:
		return s.generateMusicAsync(ctx, cfg, req, sunoMusicAPI)
	default:
		return s.generateMusicSync(ctx, cfg, req)
	}
}

// generateMusicSync speaks the synchronous OpenAI-compatible shape: one POST
// {base}/audio/music returns the encoded track in the body. This is the shape
// the config's musicBaseUrl/musicModel document, and the default for any host
// not recognised as Suno/Replicate. It runs on the longer-deadline musicClient.
func (s *Service) generateMusicSync(ctx context.Context, cfg Config, req MusicRequest) ([]byte, error) {
	url := joinURL(cfg.MusicBaseURL, "/audio/music")
	body := map[string]any{
		"model":           cfg.MusicModel,
		"prompt":          musicPrompt(req),
		"duration":        req.DurationSec,
		"response_format": "mp3",
	}
	if req.Instrumental {
		body["instrumental"] = true
	}
	if req.Seed != 0 {
		body["seed"] = req.Seed
	}
	return s.doBinaryClient(ctx, s.musicClient(), url, cfg, isAnthropic(cfg.MusicBaseURL), body)
}

// ---- async music adapters (Suno / Replicate) --------------------------------
//
// The generative-music services are ASYNC: a create call returns a job id and
// the finished audio is fetched by polling a status endpoint until the track is
// ready, then downloading it from a delivery URL. All of that lives here so
// GenerateMusic keeps returning finished bytes. Two dialects are implemented,
// selected by musicProviderKind; both flow through generateMusicAsync and differ
// only in create body, poll location, and status vocabulary (the asyncMusicAPI
// closures). REAL-SERVICE PROOF needs paid keys — this is verified against fake
// httptest provider servers (a create returning a job id, a poll that goes
// pending → ready, and a delivery host returning the bytes).

// musicPollResult is one parsed job-status snapshot: finished (with an audio URL
// or inline base64), failed, or still running (all false).
type musicPollResult struct {
	done     bool
	failed   bool
	audioURL string
	audioB64 string
}

// asyncMusicAPI captures the per-service differences behind the shared engine.
type asyncMusicAPI struct {
	// createPath is the job-create endpoint under the music base URL.
	createPath string
	// createBody builds the provider-specific create payload.
	createBody func(cfg Config, req MusicRequest) map[string]any
	// pollURL derives where to poll from the create response (+ base URL).
	pollURL func(cfg Config, createRaw []byte) string
	// parse reads a create OR poll response into a result. The same parser runs
	// on both because a job can already be finished in the create response.
	parse func(raw []byte) musicPollResult
}

// generateMusicAsync runs the create → poll → fetch flow for an async provider.
func (s *Service) generateMusicAsync(ctx context.Context, cfg Config, req MusicRequest, api asyncMusicAPI) ([]byte, error) {
	client := s.musicClient()

	createURL := joinURL(cfg.MusicBaseURL, api.createPath)
	createRaw, err := s.postRaw(ctx, client, createURL, cfg, false, api.createBody(cfg, req))
	if err != nil {
		return nil, err
	}
	// A job may already be finished (or already failed) in the create response.
	if res := api.parse(createRaw); res.failed {
		return nil, provErr("music provider job failed")
	} else if res.done {
		return s.resolveMusicAudio(ctx, client, res, cfg.MusicBaseURL)
	}

	pollURL := api.pollURL(cfg, createRaw)
	if pollURL == "" {
		return nil, provErr("music provider returned no job location")
	}
	for i := 0; i < maxMusicPolls; i++ {
		// pollURL came out of the provider's create response — guardProviderURL
		// inside getRaw is what keeps the API key from following it off-domain.
		pollRaw, err := s.getRaw(ctx, client, pollURL, cfg.MusicBaseURL, cfg, false)
		if err != nil {
			return nil, err
		}
		res := api.parse(pollRaw)
		if res.failed {
			return nil, provErr("music provider job failed")
		}
		if res.done {
			return s.resolveMusicAudio(ctx, client, res, cfg.MusicBaseURL)
		}
		// Still running: wait, but abort promptly if the caller cancels.
		t := time.NewTimer(s.musicPollInterval())
		select {
		case <-ctx.Done():
			t.Stop()
			return nil, provErr("music generation canceled")
		case <-t.C:
		}
	}
	return nil, provErr("music provider did not finish in time")
}

// resolveMusicAudio turns a finished job result into raw track bytes: inline
// base64 if the provider embedded it, otherwise a keyless fetch of the delivery
// URL (the key must never leave the provider API host — see fetchAudioBytes).
func (s *Service) resolveMusicAudio(ctx context.Context, client *http.Client, res musicPollResult, base string) ([]byte, error) {
	if res.audioB64 != "" {
		raw, err := base64.StdEncoding.DecodeString(res.audioB64)
		if err != nil {
			return nil, provErr("music provider returned malformed base64 audio")
		}
		if len(raw) == 0 {
			return nil, provErr("music provider returned empty audio")
		}
		return raw, nil
	}
	if res.audioURL != "" {
		return s.fetchAudioBytes(ctx, client, res.audioURL, base)
	}
	return nil, provErr("music job finished without audio")
}

// firstAudioURL pulls the first URL out of a provider `output` field that may be
// a bare string or an array of strings (Replicate answers with either).
func firstAudioURL(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []any:
		for _, e := range t {
			if str, ok := e.(string); ok && str != "" {
				return str
			}
		}
	}
	return ""
}

// replicateMusicAPI is the Replicate predictions dialect: POST /predictions
// returns {id,status,urls.get}; poll urls.get until status=="succeeded" and read
// the `output` audio URL.
var replicateMusicAPI = asyncMusicAPI{
	createPath: "/predictions",
	createBody: func(cfg Config, req MusicRequest) map[string]any {
		input := map[string]any{
			"prompt":   musicPrompt(req),
			"duration": req.DurationSec,
		}
		if req.Seed != 0 {
			input["seed"] = req.Seed
		}
		body := map[string]any{"input": input}
		if m := strings.TrimSpace(cfg.MusicModel); m != "" {
			// Replicate keys a run by the model VERSION, not a name.
			body["version"] = m
		}
		return body
	},
	pollURL: func(cfg Config, createRaw []byte) string {
		var p struct {
			ID   string `json:"id"`
			URLs struct {
				Get string `json:"get"`
			} `json:"urls"`
		}
		_ = json.Unmarshal(createRaw, &p)
		if p.URLs.Get != "" {
			return p.URLs.Get
		}
		if p.ID != "" {
			return joinURL(cfg.MusicBaseURL, "/predictions/"+p.ID)
		}
		return ""
	},
	parse: func(raw []byte) musicPollResult {
		var p struct {
			Status string `json:"status"`
			Output any    `json:"output"`
		}
		_ = json.Unmarshal(raw, &p)
		var res musicPollResult
		switch p.Status {
		case "succeeded":
			res.done = true
			res.audioURL = firstAudioURL(p.Output)
		case "failed", "canceled":
			res.failed = true
		}
		return res
	},
}

// sunoMusicAPI is the Suno-style dialect: POST /generate returns a job id; poll
// /feed/{id} until a clip reports status=="complete" with an audio_url. The poll
// response is tolerated as a bare object, a {data:[…]} envelope, or a top-level
// array of clips.
var sunoMusicAPI = asyncMusicAPI{
	createPath: "/generate",
	createBody: func(cfg Config, req MusicRequest) map[string]any {
		body := map[string]any{
			"prompt":            musicPrompt(req),
			"make_instrumental": req.Instrumental,
			"duration":          req.DurationSec,
		}
		if m := strings.TrimSpace(cfg.MusicModel); m != "" {
			body["model"] = m
		}
		if req.Seed != 0 {
			body["seed"] = req.Seed
		}
		return body
	},
	pollURL: func(cfg Config, createRaw []byte) string {
		id := sunoJobID(createRaw)
		if id == "" {
			return ""
		}
		return joinURL(cfg.MusicBaseURL, "/feed/"+id)
	},
	parse: sunoParse,
}

// sunoJobID pulls the job id out of a Suno create response under any of the field
// names the various Suno gateways use.
func sunoJobID(raw []byte) string {
	var p struct {
		ID     string `json:"id"`
		TaskID string `json:"task_id"`
		Data   struct {
			ID     string `json:"id"`
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(raw, &p)
	for _, c := range []string{p.ID, p.TaskID, p.Data.ID, p.Data.TaskID} {
		if c != "" {
			return c
		}
	}
	return ""
}

// sunoClip is one Suno track record inside a feed response.
type sunoClip struct {
	Status   string `json:"status"`
	AudioURL string `json:"audio_url"`
}

// sunoParse reads a Suno feed response (object, {data:[…]}, or bare array).
func sunoParse(raw []byte) musicPollResult {
	classify := func(c sunoClip) musicPollResult {
		var res musicPollResult
		switch c.Status {
		case "complete", "succeeded":
			if c.AudioURL != "" {
				res.done = true
				res.audioURL = c.AudioURL
			}
		case "error", "failed":
			res.failed = true
		}
		return res
	}
	var obj struct {
		sunoClip
		Data []sunoClip `json:"data"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		if len(obj.Data) > 0 {
			return classify(obj.Data[0])
		}
		if obj.Status != "" {
			return classify(obj.sunoClip)
		}
	}
	var arr []sunoClip
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		return classify(arr[0])
	}
	return musicPollResult{}
}

// musicStubMessage is the 501 body's human-readable half. It names the local
// generator on purpose: unlike the TTS fallback this one produces the real,
// shipped article, so "not configured" is not a broken state.
func musicStubMessage() string {
	return fmt.Sprintf(
		"no music provider configured; generate BGM locally instead: %s",
		"python3 tools/bgm-gen/src/render.py <scene>")
}

// ---- one-click BGM pack -----------------------------------------------------
//
// The "one-click BGM pack" generates a track for EVERY BGM scene the game plays
// in a single operator action, so a freshly-configured provider can fill the
// whole audio-map without eleven separate calls. It is the provider-backed twin
// of `tools/bgm-gen --all`: same eleven scene keys, same instrumental/loopable
// intent, but the audio comes from the configured Suno/Replicate/OpenAI-
// compatible provider instead of the offline synthesiser.

// bgmPackScene is one entry in the pack: the audio-map scene key plus the prompt
// shaping that scene's cue.
type bgmPackScene struct {
	scene    string
	prompt   string
	tags     string
	duration int
}

// bgmPackScenes is the canonical pack: the eleven original audio-map BGM scenes
// (menuNocturne, added later, is a login alternate and is left out of the batch).
// Order matches the flow of a session: front-end screens, then a match, then the
// result stings.
var bgmPackScenes = []bgmPackScene{
	{"menu", "sacred, monumental main theme — the title statement, driving and resolute", "epic orchestral, SATB choir, D minor", 60},
	{"lobby", "warm hearthlight lobby theme, calm anticipation before the fight", "gentle orchestral, F major", 45},
	{"room", "party-room waiting theme, light and optimistic", "warm orchestral, strings and harp", 45},
	{"champSelect", "champion select theme, rising tension and the weight of choice", "driving orchestral, taiko underpinning", 45},
	{"intermission", "intermission shop theme, a whimsical travelling-merchant stall", "playful orchestral, plucked strings", 45},
	{"battleStart", "battle-start sting, a sudden call to arms", "orchestral hit, brass and cymbal", 12},
	{"combat", "relentless arena combat theme, high energy and momentum", "aggressive orchestral, taiko, supersaw, D minor", 60},
	{"fireRing", "ring-of-fire hazard theme, ominous closing pressure", "dark orchestral, low brass drone", 45},
	{"settlement", "post-match settlement, reflective aftermath", "solemn orchestral, sustained strings", 45},
	{"victory", "victory fanfare sting, triumphant and bright", "brass fanfare, choir", 12},
	{"defeat", "defeat sting, a sombre loss", "low strings, mournful", 12},
}

// BGMPackTrack is one scene's outcome inside a pack run: the finished audio, or a
// per-scene error message (a single failure does not abort the batch).
type BGMPackTrack struct {
	// Scene is the audio-map scene key this track is for.
	Scene string
	// Audio is the finished encoded track (nil when Err is set).
	Audio []byte
	// MIME is the audio content type ("audio/mpeg").
	MIME string
	// Err is a clean, key-free failure message for this scene ("" on success).
	Err string
}

// BGMPackResult is a whole one-click pack run. Stub reports the provider was not
// configured (no tracks produced — the caller renders the pack locally with
// tools/bgm-gen instead), mirroring GenerateMusic's stub contract.
type BGMPackResult struct {
	Stub   bool
	Tracks []BGMPackTrack
}

// GenerateBGMPack runs the whole BGM pack: it loops the eleven scenes through
// GenerateMusic, so every per-scene concern — validation, the tight music rate
// budget, the provider seam, the never-log-the-key guarantee — is exactly the
// single-track path, once per scene. An unconfigured provider short-circuits to
// Stub=true (the first scene reports stub and the config cannot change mid-loop).
// A per-scene failure (a provider error, or the rate budget running out partway
// through) is recorded on that track and the batch continues, so one bad scene
// never discards the tracks that did generate.
func (s *Service) GenerateBGMPack(ctx context.Context, accountID string) (BGMPackResult, error) {
	var out BGMPackResult
	for _, sc := range bgmPackScenes {
		res, err := s.GenerateMusic(ctx, accountID, MusicRequest{
			Prompt:       sc.prompt,
			Scene:        sc.scene,
			Tags:         sc.tags,
			DurationSec:  sc.duration,
			Instrumental: true,
		})
		if err != nil {
			out.Tracks = append(out.Tracks, BGMPackTrack{Scene: sc.scene, Err: err.Error()})
			continue
		}
		if res.Stub {
			// No provider configured — the whole pack is stub. Return the stub
			// signal rather than a half-built pack of placeholders.
			return BGMPackResult{Stub: true}, nil
		}
		out.Tracks = append(out.Tracks, BGMPackTrack{Scene: sc.scene, Audio: res.Audio, MIME: res.MIME})
	}
	return out, nil
}

# Settings page + adaptive quality/FPS + connection tuning — TODO

Client-side settings & performance for smooth, stable gameplay. A typed,
versioned `Settings` object (`settings/`) persists to localStorage and pub/subs
so graphics + network changes apply LIVE. `render/QualityController` flattens
settings + the adaptive level into a single `RenderParams` that the render seam
consumes: the Renderer (hardware scaling / AA), the VfxSystem (particle
budget), the GameApp loop (fps cap, draw-distance cull, interp delay,
damage-number cap) and the Lighting (shadows).

Presets low/medium/high write concrete values; "auto" hands quality to the
adaptive manager (`render/AdaptiveQuality`). The adaptive brain keeps a rolling
window of frame COST (pre-cap ms), computes avg/p95/min fps, and steps quality
DOWN when capability sits below target−margin for ~1.5s, UP when comfortably
above for ~4s, with a neutral hysteresis band + a dwell floor to prevent
thrash. Degradation is ordered: resolution → particles → shadows → draw
distance. The DECISION function is pure `(state, costFps, now, cfg) → next`.

Loop hardening (GameApp): the fps cap throttles the whole frame body via a
time-based accumulator (prediction/interp stay time-based so skips are
lossless); interpolation delay is a live network setting feeding TimeSync;
per-frame allocation in the hot path is pooled (reused entity snapshot objects
+ reused frameBus scratch collections). Perf overlay reads a plain-mutable
`perfBus` (written each frame by the loop, sampled by React at ~4 Hz) — never
per-frame React state. Ping/RTT from input-ack deltas; jitter from snapshot
cadence; connection chip classified good/fair/poor.

First boot: `initSettings()` auto-detects a recommended preset from
hardwareConcurrency + deviceMemory + touch so the first match isn't janky.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sp-01 | Settings persistence: save/load + migrate an older/partial shape onto defaults (clamped) | settings-persistence | unit | done |
| sp-02 | Live pub/sub: subscribers notified on every change; unsubscribe stops delivery | settings-pubsub | unit | done |
| sp-03 | Preset → concrete graphics mapping (low/med/high values; auto delegates; applyPreset/setPreset) | settings-preset-map | unit | done |
| sp-04 | First-boot auto-detect: touch → medium/low, desktop → high/medium; reset-to-recommended; seed-once | settings-autodetect | unit | done |
| sp-05 | FPS-meter math: frame times → avg / p95 / min fps (pure) | fps-meter-math | unit | done |
| sp-06 | Adaptive steps DOWN one level after sustained below-target frames (not before the sustain window) | adaptive-step-down | unit | done |
| sp-07 | Adaptive steps UP one level after sustained comfortable headroom | adaptive-step-up | unit | done |
| sp-08 | Hysteresis + dwell: noisy input never oscillates; a second change waits out the dwell floor | adaptive-hysteresis | unit | done |
| sp-09 | Ordered degradation ladder: resolution → particles → shadows → draw distance (monotonic) | adaptive-ordered-degradation | unit | done |
| sp-10 | resolutionScale + DPR (capped) → Engine hardware-scaling level | resolution-hardware-scaling | unit | done |
| sp-11 | particleDensity (0–1, clamped) → vfx budget (burst counts / capacities) | particle-density-budget | unit | done |
| sp-12 | Connection classifier: ping + jitter (+ stale-snapshot guard) → good / fair / poor (pure) | connection-classifier | unit | done |
| sp-13 | Ping/jitter estimator: RTT from input-ack delta; jitter from snapshot cadence | connection-ping | unit | done |
| sp-14 | perfBus is plain-mutable (no React/Zustand); PerfOverlay samples on an interval, not per-frame state | perfbus-plain-mutable | unit | done |
| sp-15 | A FIXED preset is never dragged below the resolution floor by the ladder (auto keeps the full range); the floor never raises a deliberately-low base | fixed-preset-res-floor | unit | done |

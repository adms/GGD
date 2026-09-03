# Local AI third-party notices

The optional model is not included in the installer. When a player explicitly
downloads it, the editor retrieves `Qwen/Qwen3-14B-GGUF` at pinned revision
`530227a7d994db8eca5ab5ced2fb692b614357fd`. The upstream repository declares
the model artifact under Apache-2.0.

No native inference runtime is released in this milestone. Platform-specific
runtime notices and binary digests must be added only after the E8 macOS and
Windows RTX 4060 Ti 16 GB release gates pass.

`release-gate-manifest.json` intentionally ships in the pending state. It pins
the 216-case corpus digest, exact official model digest, quality machines,
runtime smoke matrix and performance/recovery thresholds. Downloading the model
does not change that state and never grants the renderer an inference binary.

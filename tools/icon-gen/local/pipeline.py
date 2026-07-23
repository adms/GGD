#!/usr/bin/env python3
"""Local Stable-Diffusion pipeline for icon-gen — the ONE place a model is loaded.

This is the LOCAL, on-device image backend. It exists so the whole icon
pipeline can run with no cloud provider, no API key and no per-image bill: a
Civitai/Hugging-Face anime SD1.5 checkpoint runs on Apple-Silicon MPS in a few
seconds an image, and the result is fed through the SAME prompt, downscale and
idempotence machinery the paid path already had.

WHY SD1.5 AND NOT SDXL
    The shipped icon is 128px (src/generate.py DEFAULT_EDGE) and the largest
    on-screen tile is 52px. An SD1.5 model native at 512x512 downscales to a
    crisp 128 in a fraction of SDXL's time and VRAM. Detail that survives 1024
    is mud at 52 anyway (see src/prompt.py), so the extra compute buys nothing.

MODEL SELECTION (env, no code edit needed)
    ICON_GEN_MODEL   a Hugging-Face repo id (default below), OR an absolute path
                     to a diffusers folder, OR a single .safetensors checkpoint
                     (Civitai downloads are single-file — `from_single_file`).
    ICON_GEN_DTYPE   float16 (default) | float32. fp16 halves memory and is
                     faster on MPS; fp32 is the fallback if a checkpoint has NaN
                     issues at half precision.

The default is a permissively-licensed anime SD1.5 that needs NO auth to pull,
so the pipeline proves out on any machine. To use a Civitai checkpoint instead,
download the .safetensors (a token is required — see docs/_local-image-gen-setup.md)
and point ICON_GEN_MODEL at the file.
"""
from __future__ import annotations

import os
import re
import threading

# Keep ALL model weights and the HF cache inside a single gitignored dir so a
# clone never accidentally commits 2-6 GB, and a cleanup is one `rm -rf`.
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "..", "models")
os.environ.setdefault("HF_HOME", os.path.abspath(os.path.join(MODELS_DIR, "hf")))

DEFAULT_MODEL = "dreamlike-art/dreamlike-anime-1.0"

# SD1.5 native resolution. We always render here and resize the final PNG to
# whatever edge the caller asked for.
NATIVE = 512

_lock = threading.Lock()
_pipe = None
_i2i_pipe = None
_loaded_model = None


def split_prompt(full: str) -> tuple[str, str]:
    """The icon-gen prompt module bakes its negatives into ONE string as a
    trailing 'Negative: ...' clause (that shape is what single-prompt cloud
    models want). Stable Diffusion has a real, separate negative-prompt input,
    so pull that clause back out and feed each half to its proper channel — the
    tool's prompt then works unchanged and actually STRONGER here."""
    m = re.search(r"\bNegative:\s*", full)
    if not m:
        return full.strip(), ""
    return full[: m.start()].strip(), full[m.end():].strip()


def load_pipeline():
    """Load (once, cached) the StableDiffusion pipeline on the best device."""
    global _pipe, _loaded_model
    model = os.environ.get("ICON_GEN_MODEL", DEFAULT_MODEL).strip()
    with _lock:
        if _pipe is not None and _loaded_model == model:
            return _pipe

        import torch
        from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler

        dtype_name = os.environ.get("ICON_GEN_DTYPE", "float16").strip().lower()
        dtype = torch.float32 if dtype_name == "float32" else torch.float16

        is_single_file = model.lower().endswith((".safetensors", ".ckpt"))
        loader = (
            StableDiffusionPipeline.from_single_file
            if is_single_file
            else StableDiffusionPipeline.from_pretrained
        )
        # safety_checker=None: this paints game icons (blades, flames, oni masks);
        # the NSFW classifier false-positives on dark-fantasy art and replaces the
        # image with a BLACK SQUARE, which would silently poison a batch run.
        pipe = loader(
            model,
            torch_dtype=dtype,
            safety_checker=None,
            requires_safety_checker=False,
        )
        # DPM++ 2M is the quality/speed sweet spot: ~20-25 steps is plenty.
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        pipe = pipe.to(device)
        pipe.set_progress_bar_config(disable=True)

        _pipe = pipe
        _loaded_model = model
        return _pipe


def load_img2img_pipeline():
    """The IMG2IMG half of the two-pass method (PASS 2 — style).

    Built from the ALREADY-loaded text2img pipe's components, so the UNet / VAE /
    text-encoder weights are shared, NOT loaded a second time (zero extra memory,
    instant). PASS 1 renders a clear, recognisable subject with a plain prompt;
    PASS 2 runs that image back through the SAME model with the game-icon anime
    STYLE prompt at a moderate denoise strength, so the subject's shape and colour
    survive while the Japanese-anime finish is applied. A heavy style prompt in a
    single text2img pass smothered the subject into an abstract blob — that is the
    bug this two-pass split fixes."""
    global _i2i_pipe
    base = load_pipeline()
    with _lock:
        if _i2i_pipe is not None:
            return _i2i_pipe
        from diffusers import StableDiffusionImg2ImgPipeline
        i2i = StableDiffusionImg2ImgPipeline(**base.components)
        i2i.set_progress_bar_config(disable=True)
        _i2i_pipe = i2i
        return _i2i_pipe


def _encode_long(pipe, prompt: str, negative: str):
    """Encode prompts of ANY length past SD1.5's 77-token CLIP limit.

    This is NOT optional polish. The icon prompt (PREFIX + SUBJECT + NEGATIVE)
    is ~200 tokens; CLIP silently truncates at 77, which lops off the SUBJECT
    entirely and leaves only the style boilerplate — every icon would come back
    a generic dark blob. The fix is the standard one: tokenize without
    truncation, split into 75-token windows, wrap each in bos/eos, encode each
    window and concatenate the embeddings. Prompt and negative are padded to the
    SAME window count so their embeddings line up for classifier-free guidance.
    Done by hand (tokenizer + text_encoder the pipe already holds) so it needs no
    extra dependency to drift against transformers/diffusers."""
    import torch

    tok, te = pipe.tokenizer, pipe.text_encoder
    max_len = tok.model_max_length            # 77
    win = max_len - 2                          # 75, leaving room for bos+eos
    bos, eos = tok.bos_token_id, tok.eos_token_id
    device = te.device

    def raw_ids(text: str) -> list[int]:
        return tok(text or "", truncation=False, add_special_tokens=False).input_ids

    p_ids, n_ids = raw_ids(prompt), raw_ids(negative)
    n_windows = max(1, -(-max(len(p_ids), len(n_ids)) // win))  # ceil-div

    def embed(ids: list[int]):
        chunks = []
        for i in range(n_windows):
            seg = [bos] + ids[i * win:(i + 1) * win] + [eos]
            seg += [eos] * (max_len - len(seg))               # pad with eos
            t = torch.tensor([seg], device=device)
            with torch.no_grad():
                chunks.append(te(t)[0])
        return torch.cat(chunks, dim=1)

    return embed(p_ids), embed(n_ids)


def generate(prompt: str, negative: str = "", size: int = NATIVE,
             steps: int = 24, guidance: float = 7.0, seed: int | None = None):
    """prompt (+optional negative) -> a PIL.Image of edge `size`.

    Renders at SD1.5's native 512 then LANCZOS-resizes to `size`, so a request
    for a 128px icon or a 1024px 'provider' image both come from the same,
    in-distribution render."""
    import torch
    from PIL import Image

    pipe = load_pipeline()
    device = pipe.device.type
    generator = None
    if seed is not None:
        # MPS has no manual_seed generator; seed the CPU one, it still determinises.
        generator = torch.Generator(device="cpu" if device == "mps" else device)
        generator.manual_seed(int(seed))

    prompt_embeds, negative_embeds = _encode_long(pipe, prompt, negative)
    image = pipe(
        prompt_embeds=prompt_embeds,
        negative_prompt_embeds=negative_embeds,
        width=NATIVE,
        height=NATIVE,
        num_inference_steps=int(steps),
        guidance_scale=float(guidance),
        generator=generator,
    ).images[0]

    if size != NATIVE:
        image = image.resize((int(size), int(size)), Image.LANCZOS)
    return image


def stylize(init_image, prompt: str, negative: str = "", strength: float = 0.45,
            steps: int = 30, guidance: float = 8.0, size: int = NATIVE,
            seed: int | None = None):
    """PASS 2: img2img the PASS-1 subject with the anime STYLE prompt.

    `strength` is the denoise fraction: how far the model is allowed to repaint
    the init image. ~0.4-0.55 keeps the pass-1 subject's silhouette and colour
    while applying the Japanese-anime finish. Higher drifts back toward an
    abstract blob; lower barely styles it. Deterministic when seeded."""
    import torch
    from PIL import Image

    pipe = load_img2img_pipeline()
    device = pipe.device.type
    generator = None
    if seed is not None:
        generator = torch.Generator(device="cpu" if device == "mps" else device)
        generator.manual_seed(int(seed))

    init = init_image.convert("RGB").resize((NATIVE, NATIVE), Image.LANCZOS)
    prompt_embeds, negative_embeds = _encode_long(pipe, prompt, negative)
    image = pipe(
        prompt_embeds=prompt_embeds,
        negative_prompt_embeds=negative_embeds,
        image=init,
        strength=float(strength),
        num_inference_steps=int(steps),
        guidance_scale=float(guidance),
        generator=generator,
    ).images[0]

    if size != NATIVE:
        image = image.resize((int(size), int(size)), Image.LANCZOS)
    return image

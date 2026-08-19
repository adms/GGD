#!/usr/bin/env python3
"""Local Stable-Diffusion pipeline for icon-gen — the ONE place a model is loaded.

This is the LOCAL, on-device image backend. It exists so the whole icon
pipeline can run with no cloud provider, no API key and no per-image bill: a
Civitai/Hugging-Face anime checkpoint runs on Apple-Silicon MPS in a few
seconds an image, and the result is fed through the SAME prompt, downscale and
idempotence machinery the paid path already had.

ARCHITECTURE IS DETECTED FROM THE FILE, NEVER FROM THE FILENAME
    SD1.5, SD2.x and SDXL differ in exactly one number this loader cares about:
    the UNet's cross-attention (context) dim — 768 / 1024 / 2048. That number
    is in the safetensors HEADER (or `unet/config.json`), so `detect_arch()`
    reads it without loading a single weight, and the right pipeline class,
    the right native resolution and the right prompt encoder follow from it.

    ⛔ Do NOT go back to guessing from the name. Civitai filenames are whatever
    the uploader typed: our own local `638637_pony2_rdxlPixelArt.safetensors`
    says neither "sdxl" nor "xl-base", and `43820_v3.0-sd15_pixelartV3` — which
    DOES say sd15 — is not a checkpoint at all, it is a LoRA. A filename rule
    gets both of those wrong; the header gets both right.

WHY SD1.5 IS STILL THE DEFAULT (measured 2026-08-19, ⛔ not asserted)
    This block used to claim SDXL costs "a fraction of the time and VRAM" more
    with NO number behind it — a prose defence of a hard-coded choice, which is
    exactly the shape CLAUDE.md says to distrust. So it was measured: same three
    real ability docs, same shipped two-pass method (PASS1 26 steps @ CFG 7.5,
    PASS2 30 steps @ strength 0.58 / CFG 7.0), warm, one discarded warm-up,
    M5 Max / 128 GB / MPS / fp16 / DPM++ 2M:

        SD1.5  dreamlike-anime-1.0   @512    7.9 s/icon   (7.9 / 7.8 / 8.0)
        SDXL   pony2_rdxlPixelArt    @1024  24.4 s/icon   (23.5 / 25.2 / 24.5)
                                                          -> 3.1x, not "a fraction"

    Over the 1,010-icon corpus that is ~2.2 h vs ~6.9 h. The shipped icon is
    128px (`src/generate.py` DEFAULT_EDGE) and the largest on-screen tile is
    52px, so the extra 4.6 h buys detail that is mud at 52 either way — SD1.5
    stays the DEFAULT. What changed is that SDXL is now a supported CHOICE (one
    env var, no code edit), because the Fate/ufotable STYLE LoRAs are all on the
    Pony/Illustrious side of Civitai; the SD1.5 side only has CHARACTER LoRAs,
    which are the very thing `src/prompt.py`'s negative prompt exists to block.

MODEL SELECTION (env, no code edit needed)
    ICON_GEN_MODEL   a Hugging-Face repo id (default below), OR an absolute path
                     to a diffusers folder, OR a single .safetensors checkpoint
                     (Civitai downloads are single-file — `from_single_file`).
    ICON_GEN_DTYPE   float16 (default) | float32. fp16 halves memory and is
                     faster on MPS; fp32 is the fallback if a checkpoint has NaN
                     issues at half precision.

LORAS COME FROM CONTENT, NOT FROM CODE (第一守則)
    `content/config/icon-style.json` -> `loras: [{path, weight}]`. Which style
    LoRA at which strength is exactly the kind of look-at-it-and-decide knob
    that must never be a Python constant. `_lora_specs()` reads it through the
    same `keywords.load_icon_style()` every other icon-gen knob goes through,
    so the admin page, the shipped JSON and the fail-open fallback stay one set.

The default is a permissively-licensed anime SD1.5 that needs NO auth to pull,
so the pipeline proves out on any machine. To use a Civitai checkpoint instead,
download the .safetensors (a token is required — see docs/_local-image-gen-setup.md)
and point ICON_GEN_MODEL at the file.
"""
from __future__ import annotations

import json
import os
import re
import struct
import sys
import threading

# Keep ALL model weights and the HF cache inside a single gitignored dir so a
# clone never accidentally commits 2-6 GB, and a cleanup is one `rm -rf`.
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "..", "models")
os.environ.setdefault("HF_HOME", os.path.abspath(os.path.join(MODELS_DIR, "hf")))

DEFAULT_MODEL = "dreamlike-art/dreamlike-anime-1.0"

# SD1.5 native resolution. Kept as a module constant because callers import it;
# the value actually used per render is `native_size()`, which follows the
# LOADED model's architecture (SDXL is trained at 1024 and renders mush at 512).
NATIVE = 512

# The one number that separates the families. Read from the file, see the
# docstring. SD2.x (1024) is deliberately NOT in here — nothing in this repo
# uses it and half-supporting it would be a silent wrong-output path.
ARCH_BY_CONTEXT_DIM = {768: "sd15", 2048: "sdxl"}
NATIVE_BY_ARCH = {"sd15": 512, "sdxl": 1024}

_lock = threading.Lock()
_pipe = None
_i2i_pipe = None
_loaded_model = None
_loaded_loras: tuple = ()
_arch = "sd15"


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


# ------------------------------------------------------ architecture probe ---

def _safetensors_header(path: str) -> dict:
    """The JSON header of a .safetensors file — shapes and dtypes, no weights.

    A safetensors file starts with a little-endian u64 header length followed
    by that many bytes of JSON. Reading it is a couple of KB off the front of a
    6 GB file, which is why architecture detection here is free."""
    with open(path, "rb") as fh:
        n = struct.unpack("<Q", fh.read(8))[0]
        if not 0 < n < (64 << 20):
            raise ValueError(f"implausible safetensors header length {n}")
        return json.loads(fh.read(n))


def context_dim_of_file(path: str) -> int:
    """UNet cross-attention dim of a checkpoint OR a LoRA, from its header.

    Both layouts are covered because both must be checked against each other —
    loading an SD1.5 LoRA onto an SDXL UNet is the single most likely mistake
    on this machine (our models dir holds exactly that mix).

      checkpoint  `...transformer_blocks.0.attn2.to_k.weight`   [out, CONTEXT]
      kohya LoRA  `lora_unet_..._attn2_to_k.lora_down.weight`   [rank, CONTEXT]
      peft LoRA   `...attn2.to_k.lora_A.weight`                 [rank, CONTEXT]

    ⚠️ The `lora_up` / `lora_B` half is skipped on purpose: its second axis is
    the RANK (16, 32, …), not the context dim, and mixing it in poisons the set
    with a number that looks like nothing and matches no architecture.
    """
    dims: set[int] = set()
    for key, meta in _safetensors_header(path).items():
        if key == "__metadata__":
            continue
        shape = meta.get("shape") or []
        if len(shape) != 2:
            continue
        norm = key.replace("_", ".")
        if "attn2.to.k" not in norm:
            continue
        if "lora.up" in norm or "lora.B" in norm:
            continue
        dims.add(int(shape[1]))
    if not dims:
        raise ValueError(f"no cross-attention weights found in {path}")
    return max(dims)


def _unet_config_context_dim(model: str) -> int:
    """`cross_attention_dim` from a diffusers folder's or hub repo's unet config."""
    local = os.path.join(model, "unet", "config.json")
    if os.path.isfile(local):
        with open(local, encoding="utf-8") as fh:
            return int(json.load(fh)["cross_attention_dim"])
    from huggingface_hub import hf_hub_download
    path = hf_hub_download(model, "unet/config.json")
    with open(path, encoding="utf-8") as fh:
        return int(json.load(fh)["cross_attention_dim"])


def detect_arch(model: str) -> str:
    """"sd15" | "sdxl", derived from the model's own weights/config.

    ⛔ Never from the filename — see the module docstring for the two local
    files that a filename rule gets wrong."""
    low = model.lower()
    if low.endswith(".ckpt"):
        # A pickle checkpoint has no readable header. Rather than torch.load a
        # multi-GB file just to branch, assume SD1.5 (every .ckpt era model is)
        # and SAY SO — fail-open is fine, silent is the defect.
        print("[icon-gen] WARNING: .ckpt has no readable header; assuming SD1.5. "
              "Convert to .safetensors to get real architecture detection.",
              file=sys.stderr)
        return "sd15"
    dim = (context_dim_of_file(model) if low.endswith(".safetensors")
           else _unet_config_context_dim(model))
    arch = ARCH_BY_CONTEXT_DIM.get(dim)
    if arch is None:
        raise ValueError(
            f"{model}: cross-attention dim {dim} is neither SD1.5 (768) nor "
            f"SDXL (2048). SD2.x and other families are not supported here.")
    return arch


def arch() -> str:
    """Architecture of the CURRENTLY LOADED model ("sd15" until one is)."""
    return _arch


def native_size() -> int:
    """The resolution the loaded model was trained at — always render here."""
    return NATIVE_BY_ARCH[_arch]


# ----------------------------------------------------------------- loras -----

def _lora_specs() -> tuple[tuple[str, float], ...]:
    """`loras` out of `content/config/icon-style.json`, normalised + resolved.

    ⭐ 第一守則: which LoRA at which weight is content, not code. This goes
    through `keywords.load_icon_style()` so it inherits that function's
    fail-open-but-loud behaviour and its single copy of the config path.

    Relative `path`s resolve against `tools/icon-gen/models/` on purpose: the
    JSON is repo content that gets committed and deployed, so an absolute
    /Users/... path in it would be a machine-specific value in shared data.
    """
    sys.path[:0] = [p for p in (HERE, os.path.join(HERE, "..", "src"))
                    if p not in sys.path]
    import keywords  # local, lazy: server.py imports pipeline WITHOUT keywords

    out: list[tuple[str, float]] = []
    for spec in (keywords.load_icon_style().get("loras") or []):
        path = str(spec.get("path", "")).strip()
        if not path:
            continue
        if not os.path.isabs(path):
            path = os.path.abspath(os.path.join(MODELS_DIR, path))
        weight = spec.get("weight")
        out.append((path, 1.0 if weight is None else float(weight)))
    return tuple(out)


def _te_lora_supported(pipe) -> bool:
    """Can THIS diffusers+transformers pair load the text-encoder half of a LoRA?

    Measured 2026-08-19 on diffusers 0.39.0 + transformers 5.14.1: no.
    diffusers converts a kohya `lora_te_text_model_encoder_layers_0_mlp_fc1`
    key into `text_model.encoder.layers.0.mlp.fc1.lora_B.weight`, then builds
    its rank dict by walking `text_encoder.named_modules()` and looking each
    name up. transformers 5.x dropped the `text_model.` wrapper from those
    module names (`encoder.layers.0.mlp.fc1`), so **every** lookup misses, the
    rank dict comes back empty, and `get_peft_kwargs` dies on
    `list(rank_dict.values())[0]` -> IndexError, with nothing in the message
    that mentions LoRAs, text encoders or prefixes.

    ⚠️ This probe exists so that failure becomes a NAMED, loud, partial
    degradation instead of an IndexError three libraries deep. The UNet half —
    where the look overwhelmingly lives — loads fine either way.
    """
    return any(n.startswith("text_model.") for n, _ in pipe.text_encoder.named_modules())


def _lora_state_dict(pipe, path: str):
    """One LoRA's weights, minus any half this environment cannot load."""
    from safetensors.torch import load_file
    sd = load_file(path)
    te = [k for k in sd
          if k.startswith(("lora_te", "text_encoder")) or ".text_model." in k]
    if te and not _te_lora_supported(pipe):
        print(f"[icon-gen] WARNING: {os.path.basename(path)} — loading the UNet "
              f"half only; this diffusers/transformers pair cannot attach the "
              f"{len(te)} text-encoder tensors (see pipeline._te_lora_supported). "
              f"The LoRA still applies, slightly weaker than on the author's setup.",
              file=sys.stderr)
        drop = set(te)
        sd = {k: v for k, v in sd.items() if k not in drop}
    return sd


def _apply_loras(pipe, specs: tuple[tuple[str, float], ...], want_arch: str) -> None:
    """Attach every configured LoRA and set its weight.

    ⚠️ FAIL LOUD, ⛔ not fail-open. Everywhere else in icon-gen a missing input
    degrades to a default, because a broken run must not be a broken game. Here
    the opposite is right: a LoRA that silently did not attach renders the WHOLE
    batch (1,010 icons, tens of minutes) in a style nobody asked for, and the
    output looks perfectly fine — the exact shape of the bug the style digest
    was added to kill. So a bad path or a wrong-architecture LoRA stops the run.
    """
    if not specs:
        return
    names, weights = [], []
    for i, (path, weight) in enumerate(specs):
        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"LoRA not found: {path} (from content/config/icon-style.json)")
        if not path.lower().endswith(".safetensors"):
            raise ValueError(f"LoRA must be .safetensors (architecture is read "
                             f"from its header): {path}")
        dim = context_dim_of_file(path)
        got = ARCH_BY_CONTEXT_DIM.get(dim)
        if got != want_arch:
            raise ValueError(
                f"LoRA {os.path.basename(path)} is {got or f'dim {dim}'} but "
                f"the checkpoint is {want_arch} — a {want_arch} checkpoint "
                f"only takes {want_arch} LoRAs.")
        name = f"lora{i}"
        pipe.load_lora_weights(_lora_state_dict(pipe, path), adapter_name=name)
        names.append(name)
        weights.append(weight)
    pipe.set_adapters(names, adapter_weights=weights)
    print(f"[icon-gen] {len(names)} LoRA(s) attached: "
          + ", ".join(f"{os.path.basename(p)}@{w}" for p, w in specs))


# ------------------------------------------------------------- loading -------

def load_pipeline():
    """Load (once, cached) the text2img pipeline on the best device."""
    global _pipe, _i2i_pipe, _loaded_model, _loaded_loras, _arch
    model = os.environ.get("ICON_GEN_MODEL", DEFAULT_MODEL).strip()
    specs = _lora_specs()
    with _lock:
        if _pipe is not None and (_loaded_model, _loaded_loras) == (model, specs):
            return _pipe

        import torch
        from diffusers import (DPMSolverMultistepScheduler,
                               StableDiffusionPipeline, StableDiffusionXLPipeline)

        dtype_name = os.environ.get("ICON_GEN_DTYPE", "float16").strip().lower()
        dtype = torch.float32 if dtype_name == "float32" else torch.float16

        want = detect_arch(model)
        cls = StableDiffusionXLPipeline if want == "sdxl" else StableDiffusionPipeline
        is_single_file = model.lower().endswith((".safetensors", ".ckpt"))
        loader = cls.from_single_file if is_single_file else cls.from_pretrained

        kwargs: dict = {"torch_dtype": dtype}
        if want != "sdxl":
            # safety_checker=None: this paints game icons (blades, flames, oni
            # masks); the NSFW classifier false-positives on dark-fantasy art and
            # replaces the image with a BLACK SQUARE, which would silently poison
            # a batch run. (SDXL pipelines ship no safety checker at all, so the
            # kwarg would be a TypeError there — hence the branch.)
            kwargs.update(safety_checker=None, requires_safety_checker=False)
        pipe = loader(model, **kwargs)
        # DPM++ 2M is the quality/speed sweet spot: ~20-25 steps is plenty.
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        pipe = pipe.to(device)
        pipe.set_progress_bar_config(disable=True)
        _apply_loras(pipe, specs, want)

        _pipe = pipe
        _arch = want
        _loaded_model = model
        _loaded_loras = specs
        _i2i_pipe = None      # its components came from the OLD pipe
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
    bug this two-pass split fixes.

    `AutoPipelineForImage2Image.from_pipe` picks the img2img class that matches
    whatever architecture is loaded (SD vs SDXL) and reuses the components, so
    the SDXL path needs no second branch here."""
    global _i2i_pipe
    base = load_pipeline()
    with _lock:
        if _i2i_pipe is not None:
            return _i2i_pipe
        from diffusers import AutoPipelineForImage2Image
        i2i = AutoPipelineForImage2Image.from_pipe(base)
        i2i.set_progress_bar_config(disable=True)
        _i2i_pipe = i2i
        return _i2i_pipe


# ------------------------------------------------------- prompt encoding -----

def _encode_long(pipe, prompt: str, negative: str) -> dict:
    """Encode prompts of ANY length past CLIP's 77-token limit -> pipe kwargs.

    This is NOT optional polish. The icon prompt (PREFIX + SUBJECT + NEGATIVE)
    is ~200 tokens; CLIP silently truncates at 77, which lops off the SUBJECT
    entirely and leaves only the style boilerplate — every icon would come back
    a generic dark blob. The fix is the standard one: tokenize without
    truncation, split into 75-token windows, wrap each in bos/eos, encode each
    window and concatenate the embeddings. Prompt and negative are padded to the
    SAME window count so their embeddings line up for classifier-free guidance.
    Done by hand (tokenizer + text_encoder the pipe already holds) so it needs no
    extra dependency to drift against transformers/diffusers.

    SDXL needs three things SD1.5 does not, and all three are handled here so
    `generate()`/`stylize()` stay architecture-blind:
      * TWO encoders, whose per-token states concatenate to the 2048 the UNet
        wants (CLIP-L 768 + OpenCLIP-bigG 1280);
      * the PENULTIMATE hidden state, not the final one (SDXL was trained on it);
      * a POOLED embedding from encoder 2, which is a whole-prompt vector and
        therefore comes from the FIRST window only — pooling a 3rd window of a
        long prompt would hand the model a summary of its own tail.
    """
    import torch

    encoders = [(pipe.tokenizer, pipe.text_encoder)]
    is_xl = getattr(pipe, "text_encoder_2", None) is not None
    if is_xl:
        encoders.append((pipe.tokenizer_2, pipe.text_encoder_2))

    tok0 = encoders[0][0]
    max_len = tok0.model_max_length            # 77
    win = max_len - 2                          # 75, leaving room for bos+eos

    def raw_ids(tok, text: str) -> list[int]:
        return tok(text or "", truncation=False, add_special_tokens=False).input_ids

    # Window count is decided once, on the FIRST tokenizer, so both encoders
    # produce the same sequence length and the halves can concatenate.
    p_len = len(raw_ids(tok0, prompt))
    n_len = len(raw_ids(tok0, negative))
    n_windows = max(1, -(-max(p_len, n_len) // win))  # ceil-div

    def embed(text: str):
        per_encoder, pooled = [], None
        for tok, te in encoders:
            ids = raw_ids(tok, text)
            bos = tok.bos_token_id
            eos = tok.eos_token_id
            chunks = []
            for i in range(n_windows):
                seg = [bos] + ids[i * win:(i + 1) * win] + [eos]
                seg += [eos] * (max_len - len(seg))           # pad with eos
                t = torch.tensor([seg], device=te.device)
                with torch.no_grad():
                    if is_xl:
                        out = te(t, output_hidden_states=True)
                        if pooled is None and te is encoders[-1][1]:
                            pooled = out[0]                   # first window only
                        chunks.append(out.hidden_states[-2])
                    else:
                        chunks.append(te(t)[0])
            per_encoder.append(torch.cat(chunks, dim=1))
        return torch.cat(per_encoder, dim=-1), pooled

    pos, pos_pooled = embed(prompt)
    neg, neg_pooled = embed(negative)
    kw = {"prompt_embeds": pos, "negative_prompt_embeds": neg}
    if is_xl:
        kw["pooled_prompt_embeds"] = pos_pooled
        kw["negative_pooled_prompt_embeds"] = neg_pooled
    return kw


def _generator(device: str, seed: int | None):
    if seed is None:
        return None
    import torch
    # MPS has no manual_seed generator; seed the CPU one, it still determinises.
    g = torch.Generator(device="cpu" if device == "mps" else device)
    g.manual_seed(int(seed))
    return g


# ------------------------------------------------------------- rendering -----

def generate(prompt: str, negative: str = "", size: int | None = None,
             steps: int = 24, guidance: float = 7.0, seed: int | None = None):
    """prompt (+optional negative) -> a PIL.Image of edge `size`.

    Renders at the LOADED MODEL's native edge (512 for SD1.5, 1024 for SDXL)
    then LANCZOS-resizes to `size`, so a request for a 128px icon or a 1024px
    'provider' image both come from the same, in-distribution render.
    `size=None` keeps the native render."""
    from PIL import Image

    pipe = load_pipeline()
    edge = native_size()
    image = pipe(
        **_encode_long(pipe, prompt, negative),
        width=edge,
        height=edge,
        num_inference_steps=int(steps),
        guidance_scale=float(guidance),
        generator=_generator(pipe.device.type, seed),
    ).images[0]

    if size is not None and int(size) != edge:
        image = image.resize((int(size), int(size)), Image.LANCZOS)
    return image


def stylize(init_image, prompt: str, negative: str = "", strength: float = 0.45,
            steps: int = 30, guidance: float = 8.0, size: int | None = None,
            seed: int | None = None):
    """PASS 2: img2img the PASS-1 subject with the anime STYLE prompt.

    `strength` is the denoise fraction: how far the model is allowed to repaint
    the init image. ~0.4-0.55 keeps the pass-1 subject's silhouette and colour
    while applying the Japanese-anime finish. Higher drifts back toward an
    abstract blob; lower barely styles it. Deterministic when seeded."""
    from PIL import Image

    pipe = load_img2img_pipeline()
    edge = native_size()
    init = init_image.convert("RGB").resize((edge, edge), Image.LANCZOS)
    image = pipe(
        **_encode_long(pipe, prompt, negative),
        image=init,
        strength=float(strength),
        num_inference_steps=int(steps),
        guidance_scale=float(guidance),
        generator=_generator(pipe.device.type, seed),
    ).images[0]

    if size is not None and int(size) != edge:
        image = image.resize((int(size), int(size)), Image.LANCZOS)
    return image

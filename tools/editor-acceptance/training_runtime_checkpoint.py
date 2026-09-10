"""Framework-neutral checkpoint envelope; tensor codec is supplied by the caller.

No pickle, no executable payloads. Publish a checkpoint directory only after all
files are durable; a partial .pending directory is never a resumable checkpoint.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import uuid


def capture_mlx_random(mx):
    """Capture the calling thread's single uint32[2] key, not its sentinel."""
    keys = list(mx.random.state)
    if len(keys) != 1: raise ValueError('UNSUPPORTED_MLX_RANDOM_STATE')
    key = keys[0]
    if key.shape != (2,) or key.dtype != mx.uint32: raise ValueError('INVALID_MLX_RANDOM_KEY')
    return key.tolist()


def restore_mlx_random(mx, key):
    # MLX v0.32.2 mlx/random.cpp:key maps uint64 to [high32, low32].
    # seed() installs that exact key in the thread-local generator. Do not
    # assign mx.random.state: that shadows the module sentinel in Python.
    if not isinstance(key, list) or len(key) != 2 or not all(type(v) is int and 0 <= v < 2**32 for v in key):
        raise ValueError('INVALID_MLX_RANDOM_KEY')
    mx.random.seed((key[0] << 32) | key[1])
    if capture_mlx_random(mx) != key: raise ValueError('MLX_RANDOM_RESTORE_FAILED')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()


def pack(value, tensors, is_tensor):
    if is_tensor(value):
        key = f't{len(tensors)}'; tensors[key] = value
        return ['tensor', key]
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value): raise ValueError('STRING_KEYS_REQUIRED')
        return ['dict', [[k, pack(v, tensors, is_tensor)] for k, v in value.items()]]
    if isinstance(value, (list, tuple)):
        return ['tuple' if isinstance(value, tuple) else 'list', [pack(v, tensors, is_tensor) for v in value]]
    if value is None or type(value) in (str, bool, int, float):
        if type(value) is float and not math.isfinite(value): raise ValueError('NONFINITE_SCALAR')
        return ['scalar', value]
    raise TypeError(f'UNSUPPORTED_CHECKPOINT_TYPE:{type(value).__name__}')


def unpack(node, tensors):
    kind, value = node
    if kind == 'tensor': return tensors[value]
    if kind == 'scalar': return value
    if kind == 'dict': return {k: unpack(v, tensors) for k, v in value}
    if kind in ('tuple', 'list'):
        values = [unpack(v, tensors) for v in value]
        return tuple(values) if kind == 'tuple' else values
    raise ValueError('INVALID_CHECKPOINT_TREE')


def save(root, contract, payload, *, is_tensor, save_tensors):
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    identity = uuid.uuid4().hex
    pending = root / (identity + '.pending'); pending.mkdir()
    tensors = {}; tree = pack(payload, tensors, is_tensor)
    save_tensors(str(pending / 'tensors.safetensors'), tensors)
    record = {'schema': 'training-runtime-checkpoint@1', 'contract': contract,
              'tensorSha256': sha(pending / 'tensors.safetensors'), 'tree': tree}
    (pending / 'state.json').write_text(json.dumps(record, allow_nan=False))
    for name in ('tensors.safetensors', 'state.json'):
        with (pending / name).open('rb') as stream: os.fsync(stream.fileno())
    fd = os.open(pending, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
    destination = root / identity
    pending.rename(destination)
    fd = os.open(root, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
    return {'path': str(destination), 'stateSha256': sha(destination / 'state.json')}


def load(receipt, contract, *, load_tensors):
    path = Path(receipt['path'])
    if path.name.endswith('.pending'): raise ValueError('INCOMPLETE_CHECKPOINT')
    if sha(path / 'state.json') != receipt['stateSha256']: raise ValueError('CHECKPOINT_STATE_DRIFT')
    record = json.loads((path / 'state.json').read_text())
    if record['schema'] != 'training-runtime-checkpoint@1' or record['contract'] != contract:
        raise ValueError('CHECKPOINT_CONTRACT_DRIFT')
    if sha(path / 'tensors.safetensors') != record['tensorSha256']: raise ValueError('CHECKPOINT_TENSOR_DRIFT')
    return unpack(record['tree'], load_tensors(str(path / 'tensors.safetensors')))

"""Download only public, pinned model assets; never uploads project data."""
import argparse
import hashlib
import json
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download

p = argparse.ArgumentParser()
p.add_argument("--destination", required=True)
p.add_argument("--receipt", required=True)
p.add_argument("--revision", default=None)
args = p.parse_args()
repo = "Qwen/Qwen3.5-4B"
info = HfApi().model_info(repo, revision=args.revision)
revision = info.sha
print(json.dumps({"repo": repo, "revision": revision}), flush=True)
destination = Path(args.destination).resolve()
snapshot_download(repo, revision=revision, local_dir=destination,
                  allow_patterns=["*.json", "*.safetensors", "*.jinja", "*.txt", "README.md", "LICENSE*"],
                  max_workers=2)
files = []
for path in sorted(destination.iterdir()):
    if not path.is_file():
        continue
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            sha.update(block)
    files.append({"name": path.name, "bytes": path.stat().st_size, "sha256": sha.hexdigest()})
receipt = Path(args.receipt)
receipt.parent.mkdir(parents=True, exist_ok=True)
with receipt.open("x") as f:
    json.dump({"repo": repo, "revision": revision, "path": str(destination),
               "license": "apache-2.0", "files": files}, f, indent=2)
print(json.dumps({"status": "downloaded", "receipt": str(receipt)}), flush=True)

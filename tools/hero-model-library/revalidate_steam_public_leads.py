#!/usr/bin/env python3
"""Build a Git-pinned status receipt for public Steam Workshop source leads.

The individual metadata files remain in the local intake because they are
time-varying API responses.  This tool verifies their SHA-256 values and emits
only the small, reproducible status projection used by the central library.
It never logs in, downloads Workshop files, or treats a public page as a
downloaded asset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


REPO = Path(__file__).resolve().parents[2]
SCHEMA = "ggd.steam-public-workshop-lead-revalidation@1"
OUT = REPO / "materials/hero-model-library/source-inventories/steam-public-workshop-leads-v1/receipt.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def workshop_id(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.hostname != "steamcommunity.com" or not parsed.path.startswith("/sharedfiles/"):
        return None
    values = parse_qs(parsed.query).get("id", [])
    return values[0] if len(values) == 1 and re.fullmatch(r"[0-9]+", values[0]) else None


def build(workspace: Path) -> dict:
    sources = json.loads((REPO / "materials/hero-model-library/download-sources.json").read_text(encoding="utf-8"))
    rows = []
    for lead in sources.get("publicSourceLeads", []):
        item_id = workshop_id(lead.get("url", ""))
        if item_id is None:
            continue
        intake = workspace / "GGD-Asset-Library/intake/public-sources" / f"{lead['id']}-{item_id}"
        inspection_path = intake / "inspection.json"
        if not inspection_path.is_file():
            raise FileNotFoundError(f"Missing public Steam inspection for {lead['id']}: {inspection_path}")
        inspection = json.loads(inspection_path.read_text(encoding="utf-8"))
        if inspection.get("schema") != "ggd.steam-workshop-public-inspection@1":
            raise ValueError(f"Unexpected inspection schema for {lead['id']}")
        if inspection.get("itemId") != item_id or inspection.get("pageUrl") != lead["url"]:
            raise ValueError(f"Inspection identity mismatch for {lead['id']}")
        metadata = intake / "steam-metadata.json"
        if not metadata.is_file() or sha256(metadata) != inspection.get("metadata", {}).get("sha256"):
            raise ValueError(f"Metadata SHA mismatch for {lead['id']}")
        status = inspection.get("download", {}).get("status")
        if status not in {"public-cdn-url-available", "public-page-no-supported-api-file-url"}:
            raise ValueError(f"Unexpected download status for {lead['id']}: {status}")
        acquisition_path = intake / "acquisition.json"
        acquisition = None
        if acquisition_path.is_file():
            acquisition = json.loads(acquisition_path.read_text(encoding="utf-8"))
            raw = intake / "raw" / f"workshop-{item_id}.bin"
            if status != "public-cdn-url-available":
                raise ValueError(f"Unexpected raw acquisition for blocked lead {lead['id']}")
            if (acquisition.get("itemId") != item_id or not raw.is_file()
                    or acquisition.get("sha256") != sha256(raw)
                    or acquisition.get("bytes") != raw.stat().st_size):
                raise ValueError(f"Raw Workshop acquisition mismatch for {lead['id']}")
        rows.append({
            "sourceId": lead["id"],
            "target": lead.get("target"),
            "heroIds": lead.get("heroIds", []),
            "pageUrl": lead["url"],
            "itemId": item_id,
            "checkedAt": inspection["checkedAt"],
            "title": inspection.get("title"),
            "consumerAppId": inspection.get("consumerAppId"),
            "publicItem": inspection.get("publicItem"),
            "listedFileBytes": inspection.get("fileSize"),
            "downloadStatus": status,
            "metadata": {
                "absolutePath": str(metadata.resolve()),
                "sha256": inspection["metadata"]["sha256"],
            },
            "centralLeadStatus": lead.get("acquisitionStatus"),
            "rawAcquisition": (None if acquisition is None else {
                "absolutePath": str(raw.resolve()),
                "bytes": acquisition["bytes"],
                "sha256": acquisition["sha256"],
                "status": "downloaded-and-sha256-verified",
            }),
            "scope": ("Raw Workshop bytes are locally downloaded and SHA-256 verified; this receipt does not claim "
                      "conversion, registration, selection, or deployment." if acquisition is not None else
                      "Metadata confirms page availability only; raw Workshop bytes were not downloaded, extracted, "
                      "converted, registered, selectable, or deployed."),
        })
    if not rows:
        raise ValueError("No Steam Workshop public-source leads found")
    rows.sort(key=lambda row: row["sourceId"])
    return {
        "schema": SCHEMA,
        "sourceConfig": {
            "gitPath": "materials/hero-model-library/download-sources.json",
            "sha256": sha256(REPO / "materials/hero-model-library/download-sources.json"),
        },
        "scope": "Official Steam public metadata API revalidation. A missing API file_url remains an acquisition blocker.",
        "summary": {
            "steamWorkshopLeadCount": len(rows),
            "publicPagesVerified": sum(row["publicItem"] is True for row in rows),
            "publicCdnUrlsAvailable": sum(row["downloadStatus"] == "public-cdn-url-available" for row in rows),
            "blockedNoPublicApiFileUrl": sum(row["downloadStatus"] == "public-page-no-supported-api-file-url" for row in rows),
            "rawWorkshopFilesDownloaded": sum(row["rawAcquisition"] is not None for row in rows),
            "convertedModels": 0,
            "runtimeSelectable": 0,
            "productionDeployed": False,
        },
        "leads": rows,
        "reproduction": {
            "metadataOnly": "python3 tools/hero-model-library/acquire_steam.py <workshop-id> <intake> --metadata-only",
            "write": "python3 tools/hero-model-library/revalidate_steam_public_leads.py --workspace ..",
            "check": "python3 tools/hero-model-library/revalidate_steam_public_leads.py --workspace .. --check",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = (json.dumps(build(args.workspace.resolve()), ensure_ascii=False, indent=2) + "\n").encode()
    if args.check:
        if not OUT.is_file() or OUT.read_bytes() != content:
            raise SystemExit(f"Stale Steam public-lead receipt: {OUT}")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_bytes(content)
    print(json.dumps({"output": str(OUT.relative_to(REPO)), "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Acquire author-enabled J-STARS rigged model downloads from DeviantArt.

The script uses the same anonymous page and JSON endpoint as the public web
page.  It does not log in or handle restricted deviations.  Every retained
archive is size checked and SHA-256 recorded.
"""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import re
import ssl
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-public-rigged-acquisition@1"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
INIT_URL = "https://www.deviantart.com/_puppy/dadeviation/init"
SOURCES = (
    ("028", "gintoki", 840442089, "https://www.deviantart.com/josoukitsune/art/Gintoki-Sakata---Rigged-840442089"),
    ("041", "nube", 840450291, "https://www.deviantart.com/josoukitsune/art/Meisuke-Nueno-%27Nuubee%27---Rigged-840450291"),
    ("017", "gon", 842121316, "https://www.deviantart.com/josoukitsune/art/Gon-Freecss---Rigged-842121316"),
    ("018", "killua", 842122190, "https://www.deviantart.com/josoukitsune/art/Killua-Zoldyck---Rigged-842122190"),
    ("037", "luckyman", 842120666, "https://www.deviantart.com/josoukitsune/art/Luckyman---Rigged-842120666"),
    ("012", "hiei", 840440823, "https://www.deviantart.com/josoukitsune/art/Hiei---Rigged-840440823"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_csrf(page: str) -> str:
    match = re.search(r"window\.__CSRF_TOKEN__\s*=\s*['\"]([^'\"]+)", page)
    if not match:
        raise ValueError("public page did not contain a CSRF token")
    return match.group(1)


def validate_download(payload: dict[str, Any], deviation_id: int) -> dict[str, Any]:
    deviation = payload.get("deviation") or {}
    if deviation.get("deviationId") != deviation_id:
        raise ValueError(f"unexpected deviation id: {deviation.get('deviationId')!r}")
    if not deviation.get("isDownloadable"):
        raise PermissionError(f"author has not enabled download for {deviation_id}")
    download = (deviation.get("extended") or {}).get("download") or {}
    url = download.get("url")
    if not isinstance(url, str) or not url.startswith("https://www.deviantart.com/download/"):
        raise ValueError(f"public download URL unavailable for {deviation_id}")
    expected = download.get("filesize")
    if not isinstance(expected, int) or expected <= 0:
        raise ValueError(f"public download size unavailable for {deviation_id}")
    return {
        "title": deviation.get("title"),
        "publishedTime": deviation.get("publishedTime"),
        "fileType": download.get("type"),
        "expectedBytes": expected,
        "downloadUrl": url,
        "pageLicenseField": deviation.get("license"),
        "authorUserId": (deviation.get("author") or {}).get("userId")
        if isinstance(deviation.get("author"), dict)
        else deviation.get("author"),
    }


def open_json(opener: urllib.request.OpenerDirector, url: str) -> dict[str, Any]:
    with opener.open(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as response:
        return json.load(response)


def download_file(opener: urllib.request.OpenerDirector, url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.unlink(missing_ok=True)
    with opener.open(request, timeout=60) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    temporary.replace(destination)


def acquire(destination: Path) -> dict[str, Any]:
    destination.mkdir(parents=True, exist_ok=True)
    try:
        import certifi  # type: ignore[import-not-found]

        tls_context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        tls_context = ssl.create_default_context()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        urllib.request.HTTPSHandler(context=tls_context),
    )
    rows = []
    for native_id, slug, deviation_id, page_url in SOURCES:
        with opener.open(urllib.request.Request(page_url, headers={"User-Agent": USER_AGENT}), timeout=30) as response:
            page = response.read().decode("utf-8", errors="replace")
        csrf = parse_csrf(page)
        query = urllib.parse.urlencode(
            {
                "deviationid": deviation_id,
                "username": "josoukitsune",
                "type": "art",
                "include_session": "false",
                "da_minor_version": "20230710",
                "csrf_token": csrf,
            }
        )
        metadata = validate_download(open_json(opener, f"{INIT_URL}?{query}"), deviation_id)
        suffix = "7z" if metadata["fileType"] == "7-zip" else str(metadata["fileType"])
        output = destination / f"{native_id}-{slug}.{suffix}"
        row = {
                "nativeCharacterId": native_id,
                "slug": slug,
                "deviationId": deviation_id,
                "sourcePage": page_url,
                "author": "JosouKitsune",
                "access": "author-enabled-public-download",
                "rightsStatus": "page-license-field-recorded-no-project-license-inference",
                **{key: value for key, value in metadata.items() if key != "downloadUrl"},
        }
        try:
            if not output.is_file():
                download_file(opener, metadata["downloadUrl"], output)
            if output.stat().st_size != metadata["expectedBytes"]:
                raise ValueError(
                    f"download size mismatch for {native_id}: "
                    f"{output.stat().st_size} != {metadata['expectedBytes']}"
                )
            row.update(
                {
                    "fetchStatus": "downloaded-and-hashed",
                    "absolutePath": str(output.resolve()),
                    "bytes": output.stat().st_size,
                    "sha256": sha256(output),
                }
            )
        except urllib.error.HTTPError as error:
            row.update(
                {
                    "fetchStatus": "blocked-public-download-response",
                    "httpStatus": error.code,
                    "blocker": "author-enabled download URL was returned, but anonymous file request was not available",
                }
            )
        rows.append(row)
    return {
        "schema": SCHEMA,
        "sourceId": "josoukitsune-jstars-rigged-v1",
        "files": rows,
        "summary": {
            "sources": len(rows),
            "downloaded": sum(row["fetchStatus"] == "downloaded-and-hashed" for row in rows),
            "blocked": sum(row["fetchStatus"] != "downloaded-and-hashed" for row in rows),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    result = acquire(args.destination.resolve())
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

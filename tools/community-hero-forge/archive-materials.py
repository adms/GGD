#!/usr/bin/env python3
"""Archive the explicitly scoped local hero delivery; no service/database writes."""
import argparse
import gzip
import hashlib
import io
import json
import re
import tarfile
import zipfile
from pathlib import Path

SOURCES = [
    '社群創造後台審查英雄自動鑄造計畫最終執行版.md',
    'GGD社群英雄完整上傳內容與工作流交接_37名.md',
    'GGD社群英雄功能驗收設計稿_37名角色.md',
    'ASSET_LIBRARIES.md',
    'GGD社群英雄上傳內容_37名',
    'outputs/community-hero-asset-integration',
    'outputs/community-lol-models-20260907',
    'outputs/asset-library-registry-20260907',
    'GGD-community-hero-forge/docs/_reports/community-hero-forge/reboot-handoff.md',
    'GGD-community-hero-forge/docs/_reports/community-hero-forge/reboot-state-20260907',
]
TEXT = {'.json', '.jsonl', '.md', '.log', '.mjs', '.mts', '.ts', '.tsx', '.py', '.txt', '.patch', '.sh', '.yaml', '.yml', '.csv', '.html'}
JWT = re.compile(rb'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}')
LITERAL = re.compile(rb'''(?i)(?:["']?(?:password|passwd|hmacSecret|hmacKey|privateKey|clientSecret|accessToken|refreshToken|apiKey|secret)["']?\s*[:=]\s*["'])([^"'\r\n]{6,})''')
PRIVATE_KEY = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
SHA = lambda b: hashlib.sha256(b).hexdigest()


class Parts:
    def __init__(self, output):
        self.output, self.stream, self.size, self.total = output, None, 0, 0
        self.rows = []

    def write(self, data):
        total = len(data)
        while data:
            if self.stream is None:
                name = f'payload.tar.gz.part{len(self.rows):03d}'
                self.stream = (self.output / name).open('xb')
                self.rows.append({'path': name})
                self.size = 0
            chunk, data = data[:32 * 1024 * 1024 - self.size], data[32 * 1024 * 1024 - self.size:]
            self.stream.write(chunk)
            self.size += len(chunk)
            self.total += len(chunk)
            if self.size == 32 * 1024 * 1024:
                self.stream.close()
                self.stream = None
        return total

    def flush(self):
        if self.stream:
            self.stream.flush()

    def finish(self):
        if self.stream:
            self.stream.close()
        for row in self.rows:
            data = (self.output / row['path']).read_bytes()
            row.update(bytes=len(data), sha256=SHA(data))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workspace', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--test-password-file', type=Path, required=True, help='Local secret input; never retained in the archive')
    args = ap.parse_args()
    password = args.test_password_file.read_bytes().strip()
    if len(password) < 8:
        raise ValueError('Missing local test credential to redact')
    args.output.mkdir(parents=True, exist_ok=True)
    if list(args.output.glob('payload.*')) or (args.output / 'manifest.json').exists():
        raise ValueError('Refusing to overwrite an existing archive')
    rows, excluded, seen, scanned = [], [], {}, set()
    parts = Parts(args.output)

    def check(data, name):
        key = SHA(data)
        if key in scanned:
            return
        if JWT.search(data) or PRIVATE_KEY.search(data) or password in data:
            raise ValueError('Credential detected: ' + name)
        if Path(name).suffix in TEXT or not Path(name).suffix:
            literals = list(LITERAL.finditer(data))
            # Preserved implementation evidence contains a deliberately public unit-test fixture.
            fixture = name.endswith('/catalogOverlay.test.ts') and b'const f=fixture(), secret=' in data
            if literals and not fixture:
                raise ValueError('Unreviewed credential-like literal: ' + name)
        if data.startswith(b'PK\x03\x04'):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for item in archive.infolist():
                    if not item.is_dir():
                        check(archive.read(item), name + '!' + item.filename)
        scanned.add(key)

    with gzip.GzipFile(filename='', mode='wb', fileobj=parts, mtime=0, compresslevel=6) as zipped:
        with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            for source in SOURCES:
                root = args.workspace / source
                if not root.exists():
                    raise FileNotFoundError(root)
                paths = sorted(p for p in root.rglob('*') if p.is_file() or p.is_symlink()) if root.is_dir() else [root]
                for path in paths:
                    logical = path.relative_to(args.workspace).as_posix()
                    if path.is_symlink():
                        raise ValueError('Unexpected symlink: ' + logical)
                    if path.name == '.DS_Store' or '__pycache__' in path.parts or path.suffix == '.pyc':
                        excluded.append({'path': logical, 'reason': 'OS or Python cache'})
                        continue
                    data = path.read_bytes()
                    # Executables are rebuildable tools, not the hero submission or asset payload.
                    if data[:4] in [b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe', b'\x7fELF'] or data[:2] == b'MZ':
                        excluded.append({'path': logical, 'bytes': len(data), 'sha256': SHA(data), 'reason': 'Built executable; source and build evidence retained'})
                        continue
                    source_hash = SHA(data)
                    redacted = password in data
                    if redacted:
                        if path.suffix not in {'.mjs', '.mts', '.py', '.sh'}:
                            raise ValueError('Unexpected credential location: ' + logical)
                        data = data.replace(password, b'REDACTED_TEST_PASSWORD')
                    # The placeholder deliberately remains inert in historical reproduction scripts.
                    check_data = data.replace(b'REDACTED_TEST_PASSWORD', b'') if redacted else data
                    check(check_data, logical)
                    digest = SHA(data)
                    mode = path.stat().st_mode & 0o777
                    info = tarfile.TarInfo(logical)
                    info.mode, info.mtime = mode, 0
                    row = {'path': logical, 'bytes': len(data), 'sha256': digest, 'mode': mode}
                    if redacted:
                        row.update(sourceSha256=source_hash, redaction='Local test password replaced with REDACTED_TEST_PASSWORD; original kept locally')
                    if digest in seen:
                        info.type, info.linkname = tarfile.LNKTYPE, seen[digest]
                    else:
                        seen[digest] = logical
                        info.size = len(data)
                    archive.addfile(info, io.BytesIO(data) if info.isfile() else None)
                    rows.append(row)
                    if len(rows) % 2000 == 0:
                        print(json.dumps({'archived': len(rows), 'compressedBytes': parts.total}), flush=True)
    parts.finish()
    result = {'schema': 'ggd-community-materials-archive@1', 'sources': SOURCES, 'files': rows, 'parts': parts.rows,
              'excluded': excluded, 'summary': {'files': len(rows), 'uniquePayloads': len(seen), 'bytes': sum(r['bytes'] for r in rows),
              'compressedBytes': parts.total, 'redactedFiles': sum('redaction' in r for r in rows)}}
    (args.output / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary']), flush=True)


if __name__ == '__main__':
    main()

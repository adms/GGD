#!/usr/bin/env python3
"""Serve a loopback-only resumable upload page for locally supplied assets.

The portal never contacts AWS.  It streams chunks to disk, refuses paths and
oversize files, resumes by immutable browser file metadata, and records the
final absolute path plus SHA-256.  Run it from this checkout, then open the
printed URL on the same Mac.
"""
import argparse
import hashlib
import json
import secrets
import shutil
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


DEFAULT_MAX_BYTES = 10 * 1024 ** 3
CHUNK_LIMIT = 64 * 1024 ** 2
ROOT = Path(__file__).resolve().parents[3]
HTML = r'''<!doctype html><meta charset="utf-8"><title>GGD 本機素材上傳</title>
<style>body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:42px auto;padding:0 18px;color:#172033}button,input{font:inherit;margin:8px 0}progress{width:100%;height:22px}#log{white-space:pre-wrap;background:#f4f6fa;padding:14px;border-radius:8px;min-height:120px}.warn{color:#a13b00}</style>
<h1>GGD 本機素材上傳</h1><p>檔案會直接寫入這台 Mac 的素材接收區。支援續傳；每檔最多 10 GiB。上傳完成後頁面會顯示絕對路徑與 SHA-256。</p>
<input id=file type=file multiple><br><button id=start>開始／續傳</button><progress id=p value=0 max=1></progress><pre id=log>請選擇檔案。</pre>
<script>
const qs=new URLSearchParams(location.search), token=qs.get('token'), log=x=>document.querySelector('#log').textContent+=`\n${x}`;
const esc=s=>encodeURIComponent(s); const chunk=16*1024*1024;
async function api(path,init={}){let u=path+(path.includes('?')?'&':'?')+'token='+esc(token);let r=await fetch(u,init);let d=await r.json().catch(()=>({error:r.statusText}));if(!r.ok)throw new Error(d.error||r.statusText);return d}
document.querySelector('#start').onclick=async()=>{let files=[...document.querySelector('#file').files];if(!token)return log('網址缺少 token，請使用終端列出的完整網址。');if(!files.length)return log('尚未選擇檔案。');document.querySelector('#log').textContent='';let bar=document.querySelector('#p');for(const f of files){try{let meta=await api('/api/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,size:f.size,lastModified:f.lastModified})});let off=meta.received;log(`${f.name}: 從 ${off.toLocaleString()} / ${f.size.toLocaleString()} bytes 開始`);while(off<f.size){let end=Math.min(off+chunk,f.size), b=f.slice(off,end);let r=await fetch('/api/chunk?token='+esc(token)+'&id='+esc(meta.id),{method:'PUT',headers:{'Content-Length':String(b.size),'X-Upload-Offset':String(off)},body:b});let d=await r.json().catch(()=>({error:r.statusText}));if(!r.ok)throw new Error(d.error||r.statusText);off=d.received;bar.max=f.size;bar.value=off;log(`${f.name}: ${Math.floor(100*off/f.size)}%`)}let done=await api('/api/finalize?id='+esc(meta.id),{method:'POST'});log(`完成：${done.absolutePath}\nSHA-256：${done.sha256}\n收據：${done.receiptPath}`)}catch(e){log(`失敗：${f.name}: ${e.message}`);return}}};
</script>'''


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Portal:
    def __init__(self, output, token, max_bytes):
        self.output = Path(output).resolve()
        self.parts = self.output / '.partial'
        self.receipts = self.output / 'receipts'
        self.token, self.max_bytes = token, max_bytes
        for path in (self.output, self.parts, self.receipts): path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def safe_name(name):
        name = Path(name).name
        if not name or name in {'.', '..'} or '\x00' in name:
            raise ValueError('Invalid file name')
        return name

    def state_path(self, upload_id): return self.parts / (upload_id + '.json')
    def read_state(self, upload_id):
        if len(upload_id) != 64 or any(c not in '0123456789abcdef' for c in upload_id): raise ValueError('Invalid upload ID')
        path = self.state_path(upload_id)
        if not path.is_file(): raise ValueError('Unknown upload ID')
        return json.loads(path.read_text())
    def write_state(self, state): self.state_path(state['id']).write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

    def init(self, data):
        name, size, modified = self.safe_name(str(data.get('name', ''))), data.get('size'), data.get('lastModified')
        if not isinstance(size, int) or not isinstance(modified, int) or not 0 <= size <= self.max_bytes: raise ValueError('Invalid file size')
        upload_id = hashlib.sha256(f'{name}\0{size}\0{modified}'.encode()).hexdigest()
        part = self.parts / (upload_id + '.part')
        if self.state_path(upload_id).is_file():
            state = self.read_state(upload_id)
            if (state['name'], state['size'], state['lastModified']) != (name, size, modified): raise ValueError('Upload metadata collision')
            actual = part.stat().st_size if part.exists() else 0
            if actual != state['received']: raise ValueError('Partial upload changed outside portal')
            return state
        state = {'id': upload_id, 'name': name, 'size': size, 'lastModified': modified, 'received': 0, 'createdAt': time.time()}
        part.touch(exist_ok=False); self.write_state(state); return state

    def append(self, upload_id, offset, stream, length):
        state = self.read_state(upload_id)
        if not isinstance(offset, int) or offset != state['received']: raise ValueError('Chunk offset does not match saved upload state')
        if not 0 <= length <= CHUNK_LIMIT or offset + length > state['size']: raise ValueError('Invalid chunk size')
        part = self.parts / (upload_id + '.part')
        left = length
        with part.open('r+b') as dest:
            dest.seek(offset)
            while left:
                block = stream.read(min(left, 1024 * 1024))
                if not block: raise ValueError('Unexpected end of upload body')
                dest.write(block); left -= len(block)
        if part.stat().st_size != offset + length: raise ValueError('Partial file length mismatch')
        state['received'] += length; state['updatedAt'] = time.time(); self.write_state(state); return state

    def finalize(self, upload_id):
        state = self.read_state(upload_id)
        part = self.parts / (upload_id + '.part')
        if state['received'] != state['size'] or part.stat().st_size != state['size']: raise ValueError('Upload is incomplete')
        target = self.output / state['name']
        if target.exists(): raise ValueError('Destination already exists; choose a different file name')
        checksum = sha256(part)
        part.rename(target)
        receipt = {'schema': 'ggd-local-upload-receipt@1', 'name': state['name'], 'bytes': state['size'], 'sha256': checksum,
                   'absolutePath': str(target), 'receivedAt': time.time(), 'transfer': 'loopback-resumable-upload',
                   's3Uploaded': False, 'sourceRegistration': 'pending-intake-validation'}
        receipt_path = self.receipts / (checksum + '.json')
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        self.state_path(upload_id).unlink(); return {**receipt, 'receiptPath': str(receipt_path)}


def handler(portal):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args): print('%s - %s' % (self.address_string(), fmt % args), flush=True)
        def reply(self, code, data):
            blob = json.dumps(data, ensure_ascii=False).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob)
        def authorized(self): return parse_qs(urlparse(self.path).query).get('token', [''])[0] == portal.token
        def json_body(self):
            size = int(self.headers.get('Content-Length', '0'))
            if size > 65536: raise ValueError('Metadata body too large')
            return json.loads(self.rfile.read(size))
        def do_GET(self):
            if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
            if urlparse(self.path).path != '/': return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
            blob = HTML.encode(); self.send_response(HTTPStatus.OK); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob)
        def do_POST(self):
            try:
                if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
                path, query = urlparse(self.path).path, parse_qs(urlparse(self.path).query)
                if path == '/api/init': return self.reply(HTTPStatus.OK, portal.init(self.json_body()))
                if path == '/api/finalize': return self.reply(HTTPStatus.OK, portal.finalize(query.get('id', [''])[0]))
                return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
            except (ValueError, json.JSONDecodeError) as e: return self.reply(HTTPStatus.BAD_REQUEST, {'error': str(e)})
        def do_PUT(self):
            try:
                if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
                query = parse_qs(urlparse(self.path).query)
                if urlparse(self.path).path != '/api/chunk': return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
                state = portal.append(query.get('id', [''])[0], int(self.headers.get('X-Upload-Offset', '')), self.rfile, int(self.headers.get('Content-Length', '')))
                return self.reply(HTTPStatus.OK, {'received': state['received'], 'size': state['size']})
            except (ValueError, json.JSONDecodeError) as e: return self.reply(HTTPStatus.BAD_REQUEST, {'error': str(e)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'GGD-Asset-Library/incoming/user-uploads')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--max-bytes', type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()
    token = secrets.token_urlsafe(32); portal = Portal(args.output, token, args.max_bytes)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler(portal))
    print('GGD local upload portal:', f'http://127.0.0.1:{args.port}/?token={token}', flush=True)
    print('Destination:', portal.output, 'max bytes per file:', portal.max_bytes, flush=True)
    server.serve_forever()


if __name__ == '__main__': main()

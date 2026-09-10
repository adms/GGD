"""Preserve .NET resource bytes and Wwise embedded media without executing MOD code."""
import hashlib
import json
from pathlib import Path
import re
import struct


def wwise_media(data):
    """Read little-endian DIDX/DATA; reject malformed chunks before returning media.

    Format reference: https://github.com/bnnm/wwiser-utils/blob/master/scripts/wwise_bnk_extractor.bms
    Media may be streaming prefetch; no assertion of complete or playable audio.
    """
    if data[:4] != b'BKHD':
        raise ValueError('Expected a Wwise BKHD bank')
    chunks, offset = {}, 0
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('Truncated Wwise chunk header')
        kind, size = struct.unpack_from('<4sI', data, offset)
        end = offset + 8 + size
        if end > len(data) or kind in chunks:
            raise ValueError('Truncated or duplicate Wwise chunk')
        chunks[kind] = data[offset + 8:end]
        offset = end
    if len(chunks[b'BKHD']) < 4:
        raise ValueError('Truncated bank version')
    if b'DIDX' not in chunks and b'DATA' not in chunks:
        return []  # Event-only banks contain no embedded media.
    if b'DIDX' not in chunks or b'DATA' not in chunks or len(chunks[b'DIDX']) % 12:
        raise ValueError('Invalid Wwise media index')
    records, ids = [], set()
    for media_id, offset, size in struct.iter_unpack('<III', chunks[b'DIDX']):
        if media_id in ids or size == 0 or offset + size > len(chunks[b'DATA']):
            raise ValueError('Duplicate, empty or out-of-bounds Wwise media')
        ids.add(media_id)
        records.append((media_id, chunks[b'DATA'][offset:offset+size]))
    return records


def extract_embedded_resources(home):
    import dnfile
    records = []
    for dll in sorted((home/'extracted').rglob('*.dll')):
        assembly = dll.relative_to(home/'extracted')
        dest = home/'embedded-resources'/assembly
        pe = dnfile.dnPE(str(dll))
        try:
            for resource in (pe.net.resources if pe.net else []):
                if not isinstance(resource.data, bytes):
                    continue
                data = resource.data
                name = str(resource.name)
                slug = re.sub(r'[^a-zA-Z0-9._-]', '_', name)[:160]
                # Distinguish resources whose sanitized names would otherwise collide.
                slug = hashlib.sha256(name.encode()).hexdigest()[:12] + '-' + (slug or 'resource')
                path = dest/slug
                dest.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                record = {'assembly': dll.relative_to(home).as_posix(), 'resource': name,
                          'path': path.relative_to(home).as_posix(), 'bytes': len(data),
                          'sha256': hashlib.sha256(data).hexdigest()}
                if data.startswith(b'BKHD'):
                    record.update(format='Wwise BNK', media=[], decoded=False,
                                  limitation='Embedded media only; event mapping and streaming completeness unverified.')
                    try:
                        media = wwise_media(data)
                        for mid, blob in media:
                            target = dest/(slug + '-media')/(str(mid)+'.wem')
                            target.parent.mkdir(exist_ok=True)
                            target.write_bytes(blob)
                            record['media'].append({'id': mid, 'path': target.relative_to(home).as_posix(),
                                                    'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()})
                    except ValueError as exc:
                        record['mediaExtractionError'] = str(exc)
                records.append(record)
        finally:
            pe.close()
    (home/'embedded-resources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n')
    return records

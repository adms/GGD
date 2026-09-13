#!/usr/bin/env python3
"""Inspect locally acquired public model packs without executing mod code.

ZIP/RAR/7z files are unpacked with path/size checks. Unity bundles embedded in .NET resources
are read with dnfile, never loaded as executable assemblies. Maps are read using
StormLib's normal archive API. Large native trees belong in intake / S3 legacy.
"""
import argparse
import collections
import ctypes as C
from ctypes.util import find_library
import hashlib
import json
import lzma
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import zipfile
import zlib


def extract_map_references(read, dest):
    """Follow paths stored in map metadata and MDX dependencies via normal reads."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'w3x-import'))
    from types import SimpleNamespace
    from w3xlib.extract import KNOWN_NAMES, collect_candidates, _variants, _texs_paths, _atch_paths

    errors, records, missing = [], [], []
    seen = set()
    cache = {}

    def cached_read(name):
        key = name.lower()
        if key not in cache:
            cache[key] = read(name)
        return cache[key]

    def save(name, reason):
        key = name.lower()
        if key in seen:
            return None
        seen.add(key)
        try:
            target = safe_path(dest, name)
            data = cached_read(name)
            if data is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            records.append({'archivePath': name, 'path': str(target.relative_to(dest)),
                'discoveredFrom': reason, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            return data
        except Exception as exc:
            errors.append({'member': name, 'error': str(exc)})
            return None

    listed = cached_read('(listfile)')
    listed_names = listed.decode('utf-8-sig', errors='replace').splitlines() if listed else []
    for name in sorted(set(KNOWN_NAMES + [n.strip() for n in listed_names if n.strip()])):
        save(name, 'map-format metadata or listfile')
    try:
        candidates = collect_candidates(SimpleNamespace(read_file=cached_read))
    except Exception as exc:
        errors.append({'member': 'object/script references', 'error': str(exc)})
        candidates = set()
    queue = [(n, 'object/script reference') for n in sorted(candidates)]
    # Models already named by the listfile also contribute texture/attachment paths.
    for record in list(records):
        data = cached_read(record['archivePath'])
        if data and data.startswith(b'MDLX'):
            queue += [(n, record['archivePath']) for n in _texs_paths(data) + _atch_paths(data)]
    references_seen = set()
    while queue:
        name, reason = queue.pop(0)
        if name.lower() in references_seen:
            continue
        references_seen.add(name.lower())
        found = False
        for variant in _variants(name):
            data = cached_read(variant)
            if data is None:
                continue
            found = True
            saved = save(variant, reason)
            if saved and saved.startswith(b'MDLX'):
                queue += [(n, variant) for n in _texs_paths(saved) + _atch_paths(saved)]
            break
        if not found:
            missing.append({'reference': name, 'discoveredFrom': reason})
    report = {'schema': 'ggd-map-reference-extraction@1', 'files': records,
        'missingReferences': missing, 'errors': errors,
        'scope': 'Referenced files only; unresolved references may belong to Warcraft base archives. Unreferenced archive members are not claimed complete.'}
    dest.mkdir(parents=True, exist_ok=True)
    (dest/'map-reference-extraction.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    return errors


def safe_path(root, name):
    parts = PurePosixPath(name.replace('\\', '/'))
    if parts.is_absolute() or '..' in parts.parts or ':' in name:
        raise ValueError('Unsafe archive member: ' + name)
    result = root.joinpath(*parts.parts)
    if not result.resolve().is_relative_to(root.resolve()):
        raise ValueError('Archive path escapes destination')
    return result


def unpack_zip(src, dest):
    with zipfile.ZipFile(src) as archive:
        if sum(i.file_size for i in archive.infolist()) > 2_000_000_000:
            raise ValueError('Archive exceeds 2 GB extraction limit')
        if archive.testzip() is not None:
            raise ValueError('ZIP CRC verification failed')
        for info in archive.infolist():
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError('Archive symlinks are not supported')
            target = safe_path(dest, info.filename)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(info))


def unpack_native_archive(src, dest):
    """Read RAR/7z with system libarchive; validate members before writing files.

    API reference: https://github.com/libarchive/libarchive/wiki/Examples
    No archive-provided code, symlinks, hardlinks or filesystem metadata is used.
    """
    lib = C.CDLL(find_library('archive') or 'libarchive.dylib')
    ptr = C.c_void_p
    signatures = {
        'archive_read_new': ([], ptr),
        'archive_read_support_filter_all': ([ptr], C.c_int),
        'archive_read_support_format_all': ([ptr], C.c_int),
        'archive_read_open_filename': ([ptr, C.c_char_p, C.c_size_t], C.c_int),
        'archive_read_next_header': ([ptr, C.POINTER(ptr)], C.c_int),
        'archive_entry_pathname': ([ptr], C.c_char_p),
        'archive_entry_size': ([ptr], C.c_int64),
        'archive_entry_filetype': ([ptr], C.c_uint),
        'archive_entry_symlink': ([ptr], C.c_char_p),
        'archive_entry_hardlink': ([ptr], C.c_char_p),
        'archive_read_data': ([ptr, ptr, C.c_size_t], C.c_ssize_t),
        'archive_error_string': ([ptr], C.c_char_p),
        'archive_read_free': ([ptr], C.c_int),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(lib, name); fn.argtypes = args; fn.restype = result
    archive = lib.archive_read_new()
    if not archive: raise ValueError('Cannot allocate archive reader')
    records, seen, total = [], set(), 0
    def error():
        return ValueError((lib.archive_error_string(archive) or b'Archive read failed').decode('utf-8', errors='replace'))
    try:
        lib.archive_read_support_filter_all(archive)
        lib.archive_read_support_format_all(archive)
        if lib.archive_read_open_filename(archive, str(src).encode(), 10240) != 0: raise error()
        entry = ptr()
        while True:
            status = lib.archive_read_next_header(archive, C.byref(entry))
            if status == 1: break  # ARCHIVE_EOF
            if status != 0: raise error()
            name = (lib.archive_entry_pathname(entry) or b'').decode('utf-8')
            if not name: raise ValueError('Empty archive path')
            target = safe_path(dest, name)
            key = str(target.relative_to(dest)).casefold()
            if key in seen or len(seen) >= 20000: raise ValueError('Duplicate path or too many archive members')
            seen.add(key)
            if lib.archive_entry_symlink(entry) or lib.archive_entry_hardlink(entry): raise ValueError('Archive links are not supported')
            kind = lib.archive_entry_filetype(entry)
            if kind == stat.S_IFDIR: continue
            if kind != stat.S_IFREG: raise ValueError('Archive member is not a regular file')
            size = lib.archive_entry_size(entry); total += size
            if not 0 <= size <= 256_000_000 or total > 2_000_000_000: raise ValueError('Archive extraction size limit exceeded')
            data = bytearray(); buffer = C.create_string_buffer(1024 * 1024)
            while True:
                n = lib.archive_read_data(archive, buffer, len(buffer))
                if n < 0: raise error()
                if n == 0: break
                if len(data) + n > size: raise ValueError('Archive member exceeds declared size')
                data.extend(buffer.raw[:n])
            if len(data) != size: raise ValueError('Truncated archive member')
            records.append((target, bytes(data)))
    finally:
        lib.archive_read_free(archive)
    for target, data in records:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def unpack_gma(src, dest):
    """Read GMA v1-v3, optionally Steam's LZMA wrapper, without running Lua.

    Format: https://github.com/Facepunch/gmad/blob/master/include/AddonReader.h
    """
    limit = 2_000_000_000
    data = src.read_bytes()
    if not data.startswith(b'GMAD'):
        decoder = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE, memlimit=536870912)
        data = decoder.decompress(data, max_length=limit+1)
        if not decoder.eof or len(data)>limit:
            raise ValueError('Incomplete or oversized GMA compression stream')
    if len(data)>limit or data[:4]!=b'GMAD' or len(data)<21 or data[4] not in (1,2,3):
        raise ValueError('Unsupported GMA header')
    offset = 21

    def number(fmt):
        nonlocal offset
        size = struct.calcsize(fmt)
        if offset+size>len(data): raise ValueError('Truncated GMA number')
        value = struct.unpack_from(fmt,data,offset)[0];offset+=size
        return value

    def string():
        nonlocal offset
        end = data.find(b'\0',offset)
        if end<0: raise ValueError('Truncated GMA string')
        value = data[offset:end].decode('utf-8',errors='replace');offset=end+1
        return value

    if data[4]>1:
        while string(): pass
    title, description, author = string(), string(), string()
    number('<i')
    entries, paths, total = [], set(), 0
    while number('<I'):
        name = string();target = safe_path(dest,name);size = number('<q');crc = number('<I')
        if target in paths or size<0 or size>limit or total+size>limit:
            raise ValueError('Duplicate or oversized GMA member')
        paths.add(target);total+=size
        entries.append({'path':name,'bytes':size,'crc32':crc})
    start = offset
    for entry in entries:
        chunk = data[offset:offset+entry['bytes']]
        if len(chunk)!=entry['bytes'] or zlib.crc32(chunk)!=entry['crc32']:
            raise ValueError('GMA member size/CRC mismatch: '+entry['path'])
        entry['sha256']=hashlib.sha256(chunk).hexdigest();offset+=entry['bytes']
    offset = start
    for entry in entries:
        target = safe_path(dest,entry['path']);target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data[offset:offset+entry['bytes']]);offset+=entry['bytes']
    dest.mkdir(parents=True,exist_ok=True)
    (dest/'gma-manifest.json').write_text(json.dumps({'version':data[4],'title':title,
        'description':description,'author':author,'files':entries,
        'validation':'Every member size and CRC32 verified; addon code not executed'},ensure_ascii=False,indent=2)+'\n')


def read_map(src, dest, library):
    lib = C.CDLL(library)
    handle = C.c_void_p
    signatures = {
        'SFileOpenArchive': ([C.c_char_p, C.c_uint32, C.c_uint32, C.POINTER(handle)], C.c_bool),
        'SFileOpenFileEx': ([handle, C.c_char_p, C.c_uint32, C.POINTER(handle)], C.c_bool),
        'SFileGetFileSize': ([handle, C.POINTER(C.c_uint32)], C.c_uint32),
        'SFileReadFile': ([handle, C.c_void_p, C.c_uint32, C.POINTER(C.c_uint32), C.c_void_p], C.c_bool),
        'SFileCloseFile': ([handle], C.c_bool),
        'SFileCloseArchive': ([handle], C.c_bool),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(lib, name); fn.argtypes = args; fn.restype = result
    archive = handle()
    if not lib.SFileOpenArchive(str(src).encode(), 0, 0x100, C.byref(archive)):
        raise ValueError('StormLib could not open map')

    def read(name):
        file = handle()
        if not lib.SFileOpenFileEx(archive, name.encode(), 0, C.byref(file)):
            return None
        try:
            high = C.c_uint32(); size = lib.SFileGetFileSize(file, C.byref(high))
            if high.value or size > 256_000_000: raise ValueError('Map member too large')
            buffer = C.create_string_buffer(size); got = C.c_uint32()
            if not lib.SFileReadFile(file, buffer, size, C.byref(got), None) or got.value != size:
                raise ValueError('StormLib could not read ' + name)
            return buffer.raw
        finally:
            lib.SFileCloseFile(file)
    try:
        return extract_map_references(read, dest)
    finally:
        lib.SFileCloseArchive(archive)


def extract_unity(home):
    import dnfile
    import UnityPy
    records = []
    for dll in sorted((home/'extracted').rglob('*.dll')):
        pe = dnfile.dnPE(str(dll))
        for resource in (pe.net.resources if pe.net else []):
            if not isinstance(resource.data, bytes) or not resource.data.startswith(b'UnityFS\0'):
                continue
            slug = re.sub(r'[^a-zA-Z0-9._-]', '_', str(resource.name))
            bundle = home/'bundles'/(slug+'.bundle'); bundle.parent.mkdir(exist_ok=True)
            bundle.write_bytes(resource.data)
            env = UnityPy.load(resource.data)
            out = home/'unity-extracted'/slug; out.mkdir(parents=True, exist_ok=True)
            objects = []
            for obj in env.objects:
                typ = obj.type.name
                record = {'pathId': obj.path_id, 'type': typ, 'name': obj.peek_name()}
                if typ in {'Mesh','Transform','GameObject','SkinnedMeshRenderer','Material','Avatar','AnimationClip','Animator','ParticleSystem','AudioClip'}:
                    (out/(str(obj.path_id)+'.json')).write_text(json.dumps(obj.parse_as_dict(),ensure_ascii=False,default=str))
                if typ == 'Texture2D':
                    record['png'] = str(obj.path_id)+'.png'
                    obj.parse_as_object().image.save(out/record['png'])
                if typ == 'Mesh':
                    data = obj.parse_as_object()
                    record['obj'] = str(obj.path_id)+'.obj'
                    (out/record['obj']).write_text(data.export())
                objects.append(record)
            record = {'assembly':str(dll.relative_to(home)), 'resource':str(resource.name),
                      'bundle':str(bundle.relative_to(home)), 'objectCounts':dict(collections.Counter(o['type'] for o in objects)),
                      'objects':objects, 'note':'OBJ previews are static; native weights, bind poses and transform trees are preserved in native JSON. No animation is synthesized.'}
            (out/'objects.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
            records.append(record)
        pe.close()
    return records


def process(home, stormlib):
    from embedded_resources import extract_embedded_resources
    errors=[]
    for source in sorted((home/'raw').iterdir()):
        magic=source.read_bytes()[:8]
        if magic.startswith(b'PK'):
            unpack_zip(source,home/'extracted')
        elif magic.startswith((b'Rar!', b'7z\xbc\xaf\x27\x1c')):
            unpack_native_archive(source,home/'extracted')
        elif magic.startswith(b'GMAD') or source.name.endswith(('.gma','.gma.lzma')):
            unpack_gma(source,home/'extracted')
        elif magic.startswith((b'HM3W',b'MPQ')):
            try: errors += read_map(source,home/'extracted',stormlib)
            except Exception as exc: errors.append({'member':source.name,'error':str(exc)})
    embedded=extract_embedded_resources(home)
    errors += [{'member': r['path'], 'error': r['mediaExtractionError']} for r in embedded if r.get('mediaExtractionError')]
    unity=extract_unity(home)
    files=[]
    for p in sorted(home.rglob('*')):
        if p.is_file() and p.name!='extraction.json':
            b=p.read_bytes();files.append({'path':str(p.relative_to(home)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
    result={'sourceId':home.name,'files':files,'errors':errors,'unity':unity,'embeddedResources':embedded,
            'extractedExtensions':dict(collections.Counter(Path(f['path']).suffix.lower() for f in files if f['path'].startswith('extracted/')))}
    (home/'extraction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(home.name,'files',len(files),'errors',len(errors),'unity bundles',len(unity),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,nargs='+')
    parser.add_argument('--stormlib',default='/usr/local/lib/libstorm.dylib')
    args=parser.parse_args()
    for source in args.source:process(source,args.stormlib)

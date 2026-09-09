#!/usr/bin/env python3
"""Inspect locally acquired public model packs without executing mod code.

ZIPs are unpacked with path/size checks. Unity bundles embedded in .NET resources
are read with dnfile, never loaded as executable assemblies. Maps are read using
StormLib's normal archive API. Large native trees belong in intake / S3 legacy.
"""
import argparse
import collections
import ctypes as C
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile


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
        listed = read('(listfile)')
        if not listed: raise ValueError('Map has no readable member list; not guessing names')
        names = listed.decode('utf-8-sig', errors='replace').splitlines()
        names += ['war3map.j', 'war3map.w3u', 'war3map.w3a', 'war3map.wts', 'war3map.imp']
        names = sorted(set(n for n in names if n))
        errors = []
        for name in names:
            try:
                target = safe_path(dest, name); data = read(name)
                if data is not None:
                    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            except Exception as exc:
                errors.append({'member': name, 'error': str(exc)})
        return errors
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
    errors=[]
    for source in sorted((home/'raw').iterdir()):
        magic=source.read_bytes()[:8]
        if magic.startswith(b'PK'):
            unpack_zip(source,home/'extracted')
        elif magic.startswith((b'HM3W',b'MPQ')):
            try: errors += read_map(source,home/'extracted',stormlib)
            except Exception as exc: errors.append({'member':source.name,'error':str(exc)})
    unity=extract_unity(home)
    files=[]
    for p in sorted(home.rglob('*')):
        if p.is_file() and p.name!='extraction.json':
            b=p.read_bytes();files.append({'path':str(p.relative_to(home)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
    result={'sourceId':home.name,'files':files,'errors':errors,'unity':unity,
            'extractedExtensions':dict(collections.Counter(Path(f['path']).suffix.lower() for f in files if f['path'].startswith('extracted/')))}
    (home/'extraction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(home.name,'files',len(files),'errors',len(errors),'unity bundles',len(unity),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,nargs='+')
    parser.add_argument('--stormlib',default='/usr/local/lib/libstorm.dylib')
    args=parser.parse_args()
    for source in args.source:process(source,args.stormlib)

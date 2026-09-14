"""Bake ignored alpha to opaque without changing OPAQUE material rendering or RGB."""
import io
import json
import struct
from PIL import Image

def normalize(raw):
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    size, kind = struct.unpack_from('<I4s', raw, 20+n)
    if kind != b'BIN\0': raise ValueError('Expected embedded GLB')
    binary = bytearray(raw[28+n:28+n+size])
    opaque, blended = set(), set()
    for material in doc.get('materials', []):
        texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if texture is None: continue
        image = doc['textures'][texture['index']]['source']
        (opaque if material.get('alphaMode', 'OPAQUE') == 'OPAQUE' else blended).add(image)
    changed = []
    for index in sorted(opaque-blended):
        image = doc['images'][index]
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        with Image.open(io.BytesIO(binary[start:start+view['byteLength']])) as source:
            pixels = source.convert('RGBA')
        if pixels.getchannel('A').getextrema() == (255, 255): continue
        before = pixels.convert('RGB').tobytes()
        pixels.putalpha(255)
        assert before == pixels.convert('RGB').tobytes()
        encoded = io.BytesIO(); pixels.save(encoded, format='PNG')
        binary.extend(b'\0'*(-len(binary)%4))
        image['bufferView'] = len(doc['bufferViews']); image['mimeType'] = 'image/png'
        doc['bufferViews'].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(encoded.getvalue())))
        binary.extend(encoded.getvalue()); changed.append(index)
    if not changed: return raw, []
    # Existing buffer prefix (all geometry, skin and motion) stays byte-for-byte intact.
    assert bytes(binary[:size]) == raw[28+n:28+n+size]
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\0'*(-len(binary)%4))
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' '*(-len(encoded)%4)
    result = struct.pack('<4sII', b'glTF', 2, 28+len(encoded)+len(binary)) + struct.pack('<I4s', len(encoded), b'JSON')+encoded+struct.pack('<I4s', len(binary), b'BIN\0')+binary
    return bytes(result), changed

if __name__ == '__main__':
    import argparse
    from pathlib import Path
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    data,changed=normalize(a.source.read_bytes());a.output.write_bytes(data)
    print(json.dumps(dict(opaqueAlphaImages=changed,rgbAndGeometryUnchanged=True)))

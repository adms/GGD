#!/usr/bin/env python3
"""Prove the pet/name/model join from native GBK protobuf tables, without exporting bulk data."""
import argparse
import hashlib
import json
from pathlib import Path


def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError("Invalid varint")


def fields(data):
    pos = 0
    while pos < len(data):
        offset = pos
        tag, pos = varint(data, pos)
        wire = tag & 7
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire in (1, 2, 5):
            if wire == 2:
                size, pos = varint(data, pos)
            else:
                size = 8 if wire == 1 else 4
            if pos + size > len(data):
                raise ValueError("Truncated protobuf field")
            value, pos = data[pos:pos + size], pos + size
        else:
            raise ValueError(f"Unsupported wire type {wire}")
        yield tag >> 3, wire, value, offset


def prove(workspace):
    root = workspace / "outputs/game-asset-library-20260907/300heroes/raw"
    evidence = []
    records = []
    for name, wanted in [("pokemon_pet_c.dat", 24034), ("monster_c.dat", 45029)]:
        path = root / "excel" / name
        raw = path.read_bytes()
        matches = []
        for field, wire, record, offset in fields(raw):
            if field != 1 or wire != 2:
                continue
            values = {f: v for f, w, v, o in fields(record)}
            if values.get(1) == wanted:
                matches.append((values, record, offset))
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one native record for {wanted}")
        values, record, offset = matches[0]
        if values[2].decode("gbk") != "蜘蛛子":
            raise ValueError("Native character name changed")
        records.append(values)
        evidence.append(dict(path=str(path.relative_to(workspace)), sha256=hashlib.sha256(raw).hexdigest(),
                             recordId=wanted, recordOffset=offset, recordSha256=hashlib.sha256(record).hexdigest(),
                             fields={str(k): values[k].decode("gbk") if isinstance(values[k], bytes) else values[k]
                                     for k in ([1, 2, 5, 10] if wanted == 24034 else [1, 2, 96, 99])}))
    pet, monster = records
    if pet[10] != monster[1]:
        raise ValueError("Pet-to-monster ID join failed")
    model_rel = monster[99].decode("gbk").replace("\\", "/").removeprefix("../").lower()
    if model_rel != "data/character/monster/pokemen/27_zhizhuzi/27_zhizhuzi.x":
        raise ValueError("Native model reference changed")
    model = root / model_rel
    return dict(schema="ggd-source-identity-proof@1", sourceId="pet:spider", character="蜘蛛子",
                work="轉生成蜘蛛又怎樣！", relationship="exact", form="300英雄寵物版／蜘蛛魔物形態",
                conclusion="原生寵物表名稱與怪物表名稱一致，24034 的欄位 10 連到 45029，再由欄位 99 指定模型。",
                boundary="確認角色與來源模型對應；不表示完整戰鬥動畫、人形或專屬特效音效已就緒。",
                evidence=evidence, model=dict(path=str(model.relative_to(workspace)), sha256=hashlib.sha256(model.read_bytes()).hexdigest()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    proof = prove(args.workspace.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(proof, ensure_ascii=False))

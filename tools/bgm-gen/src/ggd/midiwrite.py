"""midiwrite — a 40-line format-0 SMF writer.

There is no `mido` here and there does not need to be: building the sample bank
needs exactly note-on, note-off, bank-select and program-change. Writing them by
hand keeps bgm-gen's dependency list at "numpy + ffmpeg + fluidsynth" instead of
adding a package whose version becomes one more thing that can change the output.
"""
from __future__ import annotations

import struct

TPQ = 480  # ticks per quarter note


def _vlq(n: int) -> bytes:
    out = bytearray([n & 0x7F])
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def write(path: str, events: list[tuple[int, bytes]], bpm: float = 120.0) -> None:
    """`events` = [(absolute_tick, raw_status_bytes), …]; sorted here, so the
    caller may emit note-ons and note-offs in any order. Note-offs sort before
    note-ons at the same tick, so a repeated pitch retriggers cleanly."""
    trk = bytearray()
    us = int(round(60_000_000 / bpm))
    trk += _vlq(0) + b"\xff\x51\x03" + struct.pack(">I", us)[1:]
    last = 0
    for tick, data in sorted(events, key=lambda e: (e[0], e[1][0] & 0xF0)):
        trk += _vlq(tick - last) + data
        last = tick
    trk += _vlq(0) + b"\xff\x2f\x00"
    with open(path, "wb") as fh:
        fh.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ))
        fh.write(b"MTrk" + struct.pack(">I", len(trk)) + bytes(trk))


def program(ch: int, prog: int) -> bytes:
    return bytes([0xC0 | (ch & 0x0F), prog & 0x7F])


def bank_msb(ch: int, bank: int) -> bytes:
    return bytes([0xB0 | (ch & 0x0F), 0x00, bank & 0x7F])


def note_on(ch: int, midi: int, vel: int) -> bytes:
    return bytes([0x90 | (ch & 0x0F), midi & 0x7F, vel & 0x7F])


def note_off(ch: int, midi: int) -> bytes:
    return bytes([0x80 | (ch & 0x0F), midi & 0x7F, 0])

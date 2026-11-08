"""Erzeugt die App-Icons aus einer 16x16-Pixelkarte (ohne Abhängigkeiten).
Aufruf: python3 tools/make_icons.py  (aus dem Projektordner)"""
import struct, zlib, pathlib

PALETTE = {
    '.': (29, 43, 83), '*': (255, 241, 232),
    'g': (99, 199, 77), 'G': (62, 137, 72),
    'd': (138, 90, 50), 'D': (107, 66, 38),
    't': (38, 27, 24), 'k': (120, 80, 40), 'f': (244, 185, 66), 'F': (232, 106, 46),
    'c': (126, 232, 250), 'C': (44, 160, 200), 'w': (255, 255, 255),
    's': (111, 116, 128), 'S': (85, 90, 102),
}
MAP = [
    "................",
    "..*.........*...",
    ".........*......",
    "....*...........",
    "gggggggggggggggg",
    "GgGgGGgGgGGgGgGG",
    "dddDddddddDddddd",
    "dtttfttttddcdDdd",
    "dtttFttttdcwCdDd",
    "dtttktttttcCCddd",
    "dDtttttttddCdDdd",
    "ssssSsssssssSsss",
    "sSsssssSssssssSs",
    "ssssssSsssssSsss",
    "sSssssssssSsssss",
    "ssssSsssssssssSs",
]

def png(size, path):
    scale = size // 16
    pad = (size - 16 * scale) // 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            mx = min(15, max(0, (x - pad) // scale))
            my = min(15, max(0, (y - pad) // scale))
            row += bytes(PALETTE[MAP[my][mx]])
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)

for s in (180, 192, 512):
    png(s, f'icons/icon-{s}.png')
print('ok')

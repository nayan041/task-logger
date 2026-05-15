#!/usr/bin/env python3
"""Generate placeholder PWA icons + iOS splash screens using stdlib only.

Usage: python3 _gen.py
"""
import struct, zlib, os

ROOT = os.path.dirname(os.path.abspath(__file__))

# A simple solid-color + centered glyph "TL" rendered via per-pixel composition.
# We avoid external libs so this works on any macOS install.

def png(width, height, pixels):
    """pixels: bytes RGBA, length = width*height*4."""
    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        )

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    raw = b''
    stride = width * 4
    for y in range(height):
        raw += b'\x00' + pixels[y*stride:(y+1)*stride]
    idat = zlib.compress(raw, 9)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def make_icon(size, bg=(216, 57, 114), fg=(255, 255, 255)):
    """Square icon with a rounded background and 'TL' glyph (approximate)."""
    pixels = bytearray(size * size * 4)
    cx = cy = size / 2
    radius = size * 0.46
    inner_r = size * 0.42
    for y in range(size):
        for x in range(size):
            # Rounded square mask
            dx = abs(x - cx); dy = abs(y - cy)
            # Use squircle-ish: max corners
            edge_x = max(0, dx - inner_r)
            edge_y = max(0, dy - inner_r)
            corner = (edge_x*edge_x + edge_y*edge_y) ** 0.5
            inside = corner < (radius - inner_r)
            # Anti-alias 1px edge
            alpha = 255
            if inside:
                color = bg
            else:
                # outside the rounded square — transparent
                color = (0, 0, 0)
                alpha = 0
            i = (y * size + x) * 4
            pixels[i]   = color[0]
            pixels[i+1] = color[1]
            pixels[i+2] = color[2]
            pixels[i+3] = alpha

    # Draw a chunky "T" + "L" using rectangle blocks roughly centered
    def fill(x0, y0, x1, y1, c):
        for yy in range(max(0, y0), min(size, y1)):
            for xx in range(max(0, x0), min(size, x1)):
                i = (yy * size + xx) * 4
                pixels[i]   = c[0]; pixels[i+1] = c[1]
                pixels[i+2] = c[2]; pixels[i+3] = 255

    s = size
    # T: horizontal top + vertical bar
    fill(int(s*0.22), int(s*0.30), int(s*0.52), int(s*0.40), fg)
    fill(int(s*0.34), int(s*0.30), int(s*0.42), int(s*0.72), fg)
    # L: vertical bar + bottom
    fill(int(s*0.56), int(s*0.30), int(s*0.64), int(s*0.72), fg)
    fill(int(s*0.56), int(s*0.64), int(s*0.80), int(s*0.72), fg)

    return png(size, size, bytes(pixels))

def make_splash(w, h, bg=(255, 247, 249), accent=(216, 57, 114)):
    pixels = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            pixels[i]   = bg[0]; pixels[i+1] = bg[1]
            pixels[i+2] = bg[2]; pixels[i+3] = 255
    # Centered small accent square as a brand mark
    side = min(w, h) // 6
    cx = w // 2; cy = h // 2
    for y in range(cy - side//2, cy + side//2):
        for x in range(cx - side//2, cx + side//2):
            i = (y * w + x) * 4
            pixels[i]   = accent[0]; pixels[i+1] = accent[1]
            pixels[i+2] = accent[2]; pixels[i+3] = 255
    return png(w, h, bytes(pixels))

def write(name, data):
    p = os.path.join(ROOT, name)
    with open(p, 'wb') as f: f.write(data)
    print(f"  wrote {name} ({len(data)} bytes)")

if __name__ == '__main__':
    print('Generating PWA icons...')
    write('icon-192.png', make_icon(192))
    write('icon-512.png', make_icon(512))
    write('apple-touch-icon-180.png', make_icon(180))
    print('Generating iOS splash screens...')
    write('apple-splash-2048x2732.png', make_splash(2048, 2732))
    write('apple-splash-1170x2532.png', make_splash(1170, 2532))
    write('apple-splash-1284x2778.png', make_splash(1284, 2778))
    print('Done.')

"""Small helpers for the image scripts: read an SVG path into polygons, point-in-shape tests."""
import re

_tok = re.compile(r'([MLHVQCZ])|(-?\d*\.?\d+(?:e-?\d+)?)')


def contours(d, steps=10):
    """Flattened contours (lists of (x, y)) of an absolute path made of M L H V Q C Z."""
    toks = [(m.group(1), m.group(2)) for m in _tok.finditer(d)]
    i, cmd, out, cur, pos = 0, None, [], [], (0.0, 0.0)

    def num():
        nonlocal i
        v = float(toks[i][1]); i += 1
        return v

    while i < len(toks):
        c, n = toks[i]
        if c:
            cmd = c; i += 1
            if cmd == 'Z':
                if cur: out.append(cur); cur = []
                continue
        if cmd == 'M':
            if cur: out.append(cur)
            pos = (num(), num()); cur = [pos]; cmd = 'L'
        elif cmd == 'L':
            pos = (num(), num()); cur.append(pos)
        elif cmd == 'H':
            pos = (num(), pos[1]); cur.append(pos)
        elif cmd == 'V':
            pos = (pos[0], num()); cur.append(pos)
        elif cmd == 'Q':
            c1 = (num(), num()); p1 = (num(), num())
            for t in range(1, steps + 1):
                u = t / steps
                cur.append(((1 - u) ** 2 * pos[0] + 2 * (1 - u) * u * c1[0] + u * u * p1[0],
                            (1 - u) ** 2 * pos[1] + 2 * (1 - u) * u * c1[1] + u * u * p1[1]))
            pos = p1
        elif cmd == 'C':
            c1 = (num(), num()); c2 = (num(), num()); p1 = (num(), num())
            for t in range(1, steps + 1):
                u = t / steps; v = 1 - u
                cur.append((v ** 3 * pos[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * p1[0],
                            v ** 3 * pos[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * p1[1]))
            pos = p1
        else:
            i += 1
    if cur: out.append(cur)
    return out


def inside(polys, x, y):
    """Even-odd point-in-shape test over a list of contours."""
    hit = False
    for poly in polys:
        n = len(poly)
        j = n - 1
        for k in range(n):
            xi, yi = poly[k]; xj, yj = poly[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = k
    return hit

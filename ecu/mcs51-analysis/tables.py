"""Extract and classify every calibration table reachable from the 0x45C0 index.

Facts this relies on (all derived from the image itself):
  * 0x45C0..0x46EB is an array of 150 big-endian 16-bit table pointers.
  * Consecutive distinct pointers bound each table, giving exact byte sizes.
Two layouts are then fitted against those exact sizes.
"""

import sys
from collections import Counter, defaultdict

ROM = "/tmp/ecu-re/318i_175_soft1267356378.bin"
PTR_BASE, PTR_END = 0x45C0, 0x46EC
CAL_END = 0x5A0A          # first byte of the FF gap after the last table


def load():
    with open(ROM, "rb") as f:
        return f.read()


def pointers(d):
    return [(d[a] << 8) | d[a + 1] for a in range(PTR_BASE, PTR_END, 2)]


def sizes_of(d):
    ptrs = pointers(d)
    starts = sorted(set(ptrs))
    out = {}
    for i, s in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else CAL_END
        out[s] = end - s
    return ptrs, starts, out


def classify(d, s, size):
    """Return (kind, ny, nx, axis_a, axis_b, data_off) or None."""
    n = d[s + 1]
    if n and size == 2 + 2 * n:
        return ("1D", 1, n, [], list(d[s + 2:s + 2 + n]), s + 2 + n)
    ny, nx = d[s + 1], d[s + 2]
    if ny and nx and size == 4 + ny + nx + ny * nx:
        a = list(d[s + 4:s + 4 + ny])
        b = list(d[s + 4 + ny:s + 4 + ny + nx])
        return ("2D", ny, nx, a, b, s + 4 + ny + nx)
    return None


def main():
    d = load()
    ptrs, starts, sizes = sizes_of(d)
    kinds = Counter()
    rows = []
    unfit = []
    for s in starts:
        c = classify(d, s, sizes[s])
        if c is None:
            unfit.append((s, sizes[s]))
            continue
        kind, ny, nx, a, b, dp = c
        kinds[kind] += 1
        rows.append((s, sizes[s], kind, ny, nx, a, b, dp))
    print("pointer entries      : %d" % len(ptrs))
    print("distinct table starts: %d" % len(starts))
    print("classified           : 1D=%d  2D=%d   unfit=%d"
          % (kinds["1D"], kinds["2D"], len(unfit)))
    if unfit:
        print("\nunfit tables:")
        for s, sz in unfit:
            print("   0x%04X size=%-4d %s" % (s, sz, " ".join("%02X" % b for b in d[s:s + 8])))
    print()
    print("=== axis monotonicity test (are stored axes sorted ascending?) ===")
    asc = mono = tot = 0
    for s, sz, kind, ny, nx, a, b, dp in rows:
        for ax in ((a, b) if kind == "2D" else (b,)):
            if not ax:
                continue
            tot += 1
            if all(ax[i] <= ax[i + 1] for i in range(len(ax) - 1)):
                asc += 1
            elif all(ax[i] >= ax[i + 1] for i in range(len(ax) - 1)):
                mono += 1
    print("   axes total=%d  non-decreasing=%d  non-increasing=%d  neither=%d"
          % (tot, asc, mono, tot - asc - mono))
    print()
    print("=== format byte (byte0) vs kind ===")
    fk = defaultdict(Counter)
    for s, sz, kind, ny, nx, a, b, dp in rows:
        fk[d[s]][kind] += 1
    for f in sorted(fk):
        print("   0x%02X : %s" % (f, dict(fk[f])))
    print()
    print("=== header bytes 2,3 for 2D tables (byte3 = ?) ===")
    b3 = Counter()
    for s, sz, kind, ny, nx, a, b, dp in rows:
        if kind == "2D":
            b3[(d[s + 3])] += 1
    print("   byte3 census:", dict(b3))
    print()
    print("=== full table listing ===")
    for i, (s, sz, kind, ny, nx, a, b, dp) in enumerate(rows):
        idxs = [j for j, p in enumerate(ptrs) if p == s]
        print("\n[%3d] table 0x%04X size=%-4d %s %dx%d  data@0x%04X  index_slots=%s"
              % (i, s, sz, kind, ny, nx, dp, idxs))
        print("      hdr : %s" % " ".join("%02X" % x for x in d[s:dp - ny - nx]))
        if kind == "2D":
            print("      axA : %s" % " ".join("%02X" % x for x in a))
        print("      axB : %s" % " ".join("%02X" % x for x in b))
        for r in range(ny):
            print("      z%-2d : %s" % (r, " ".join("%02X" % x for x in d[dp + r * nx:dp + (r + 1) * nx])))


if __name__ == "__main__":
    main()

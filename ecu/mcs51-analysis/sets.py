"""Calibration-set organisation, checksum schemes, ident block, selector tables."""

import re
import zlib
from collections import Counter, defaultdict

ROM = "/tmp/ecu-re/318i_175_soft1267356378.bin"
XDF = "/tmp/ecu-re/BMW_175_318i_soft378.xdf"
d = open(ROM, "rb").read()
PTR_BASE, PTR_END, CAL_END = 0x45C0, 0x46EC, 0x5A0A
ptrs = [(d[a] << 8) | d[a + 1] for a in range(PTR_BASE, PTR_END, 2)]
starts = sorted(set(ptrs))
size = {s: (starts[i + 1] if i + 1 < len(starts) else CAL_END) - s
        for i, s in enumerate(starts)}


def parse(s):
    sz, n = size[s], d[s + 1]
    if n and sz == 2 + 2 * n:
        return ("1D", 1, n, s + 2 + n)
    ny = d[s + 1]
    nx = d[s + 3 + ny]
    return ("2D", ny, nx, s + 4 + ny + nx)


tabs = {s: parse(s) for s in starts}

txt = open(XDF, encoding="latin-1").read()
xnames = {}
for kind, body in re.findall(r"%%(TABLE|CONSTANT)%%(.*?)%%END%%", txt, re.S):
    m = re.search(r"Address\s+=0x([0-9A-Fa-f]+)", body)
    t = re.search(r'Title\s+="([^"]*)"', body)
    if m and t:
        xnames.setdefault(int(m.group(1), 16), t.group(1))

print("=" * 78)
print("A. INDEX-SLOT ORDER REVEALS PARALLEL CALIBRATION SETS")
print("   slots 44-56 (fuel banks) and 88-101 (ignition banks)")
for lo, hi, lbl in ((43, 57, "FUEL"), (87, 102, "IGNITION")):
    print("\n   --- %s ---" % lbl)
    for i in range(lo, hi):
        s = ptrs[i]
        k, ny, nx, dp = tabs[s]
        nm = xnames.get(dp, "")
        print("   slot %3d -> hdr 0x%04X %s %2dx%-2d data@0x%04X  %s"
              % (i, s, k, ny, nx, dp, nm))

print()
print("=" * 78)
print("B. CHECKSUM SCHEMES TESTED (all negative unless noted)")
seg_all = d
print("   sum8  over whole 32K            = 0x%02X   (0x00 would imply 2's-compl scheme)"
      % (sum(seg_all) & 0xFF))
print("   sum16 over whole 32K            = 0x%04X" % (sum(seg_all) & 0xFFFF))
x = 0
for b in seg_all:
    x ^= b
print("   xor8  over whole 32K            = 0x%02X" % x)
print("   CRC16/IBM over 0x0000-0x7FFC    = 0x%04X" % (zlib.crc32(d[:0x7FFD]) & 0xFFFF))
print()
print("   Search: any 8/16-bit value in the image equal to sum of a")
print("   contiguous region ending just before it? (word-aligned scan)")
found = 0
pref = [0] * (len(d) + 1)
for i, b in enumerate(d):
    pref[i + 1] = pref[i] + b
for end in range(0x100, 0x7FFF):
    tot16 = pref[end] & 0xFFFF
    for a in (end, end - 2):
        if a < 0 or a + 1 >= len(d):
            continue
        if ((d[a] << 8) | d[a + 1]) == tot16 or (d[a] | (d[a + 1] << 8)) == tot16:
            found += 1
            if found <= 6:
                print("      candidate: sum(0..0x%04X)=0x%04X stored at 0x%04X" % (end, tot16, a))
print("      total candidates: %d" % found)
print()
print("   Region-limited: does sum over the CALIBRATION block alone appear anywhere?")
for lo, hi in ((0x4200, 0x5A0A), (0x4700, 0x5A0A), (0x45C0, 0x5A0A)):
    t16 = sum(d[lo:hi]) & 0xFFFF
    where = [a for a in range(len(d) - 1)
             if ((d[a] << 8) | d[a + 1]) == t16 or (d[a] | (d[a + 1] << 8)) == t16]
    print("      sum(0x%04X-0x%04X)=0x%04X found at: %s"
          % (lo, hi, t16, " ".join("0x%04X" % w for w in where[:8]) or "NOWHERE"))

print()
print("=" * 78)
print("C. IDENT / VERSION BLOCK CANDIDATES")
runs = []
cur = []
for i, b in enumerate(d):
    if 0x20 <= b < 0x7F:
        cur.append((i, b))
    else:
        if len(cur) >= 6:
            runs.append((cur[0][0], bytes(x for _, x in cur)))
        cur = []
print("   printable ASCII runs >= 6 chars:")
for off, s in runs:
    print("      0x%04X  %r" % (off, s.decode("ascii")))
print()
print("   BCD-looking region 0x2000-0x20E0 (many FF gaps):")
for a in range(0x2000, 0x20E0, 16):
    print("      %04X: %s" % (a, " ".join("%02X" % b for b in d[a:a + 16])))

print()
print("=" * 78)
print("D. SELECTOR TABLES USED BY THE ROUTINE AT FILE 0x0402 (runs at PC 0x8402)")
print("   it searches code[0x44F5+0x3D..] for a match, then indexes 0x47B1/0x47B5")
print("   0x4531-0x4560 (0x44F5+0x3C = 0x4531):")
for a in range(0x4530, 0x4570, 16):
    print("      %04X: %s" % (a, " ".join("%02X" % b for b in d[a:a + 16])))
print("   0x47B0-0x4835 (indexed by the routine):")
for a in range(0x47B0, 0x4838, 16):
    print("      %04X: %s" % (a, " ".join("%02X" % b for b in d[a:a + 16])))

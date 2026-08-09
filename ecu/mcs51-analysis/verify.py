"""Validate the derived table grammar, then cross-check the XDF and checksums."""

import re
from collections import Counter, defaultdict

ROM = "/tmp/ecu-re/318i_175_soft1267356378.bin"
XDF = "/tmp/ecu-re/BMW_175_318i_soft378.xdf"
PTR_BASE, PTR_END, CAL_END = 0x45C0, 0x46EC, 0x5A0A

d = open(ROM, "rb").read()
ptrs = [(d[a] << 8) | d[a + 1] for a in range(PTR_BASE, PTR_END, 2)]
starts = sorted(set(ptrs))
size = {s: (starts[i + 1] if i + 1 < len(starts) else CAL_END) - s
        for i, s in enumerate(starts)}


def parse(s):
    """Return dict describing the table at start offset s."""
    sz = size[s]
    n = d[s + 1]
    if n and sz == 2 + 2 * n:
        return dict(kind="1D", ny=1, nx=n, axA=None,
                    axB=list(d[s + 2:s + 2 + n]), data=s + 2 + n, extra=None)
    ny = d[s + 1]
    nx = d[s + 3 + ny] if s + 3 + ny < len(d) else 0
    if nx and sz == 4 + ny + nx + ny * nx:
        return dict(kind="2D", ny=ny, nx=nx,
                    axA=list(d[s + 2:s + 2 + ny]),
                    extra=d[s + 2 + ny],
                    axB=list(d[s + 4 + ny:s + 4 + ny + nx]),
                    data=s + 4 + ny + nx)
    return None


tabs = {s: parse(s) for s in starts}
assert all(tabs.values()), "grammar failed"


def cumsum(v):
    out, a = [], 0
    for x in v:
        a += x
        out.append(a)
    return out


print("=" * 70)
print("A. DELTA-ENCODED AXIS HYPOTHESIS")
print("   axis bytes are increments; cumulative sum yields breakpoints")
tot = fit = over = flat = 0
for s, t in tabs.items():
    for ax in ([t["axA"], t["axB"]] if t["kind"] == "2D" else [t["axB"]]):
        if not ax:
            continue
        tot += 1
        c = cumsum(ax)
        if c[-1] > 255:
            over += 1
        elif any(x == 0 for x in ax):
            flat += 1
        else:
            fit += 1
print("   axes examined                    : %d" % tot)
print("   strictly ascending & max <= 255  : %d" % fit)
print("   contains a zero increment        : %d" % flat)
print("   cumulative total > 255 (refutes) : %d" % over)
print()
print("   control: treating bytes as ABSOLUTE breakpoints instead")
absfit = 0
for s, t in tabs.items():
    for ax in ([t["axA"], t["axB"]] if t["kind"] == "2D" else [t["axB"]]):
        if ax and all(ax[i] < ax[i + 1] for i in range(len(ax) - 1)):
            absfit += 1
print("   strictly ascending as absolute   : %d  (of %d)" % (absfit, tot))

print()
print("=" * 70)
print("B. CHECKSUM SEARCH")
print("   XDF claims a 16-bit checksum at 0x7FFD.")
print("   bytes 0x7FFD-0x7FFF = %s  (blank EPROM)" % d[0x7FFD:0x8000].hex(" "))
last = max(i for i, b in enumerate(d) if b != 0xFF)
print("   last non-FF byte     = 0x%04X" % last)
print()
cands = []
for lo, hi in ((0, 0x7D33), (0, 0x7D34), (0, 0x7FFF), (0x2000, 0x7D34),
               (0, 0x8000), (0x4000, 0x5A0A)):
    seg = d[lo:hi]
    s8 = sum(seg) & 0xFF
    s16 = sum(seg) & 0xFFFF
    x8 = 0
    for b in seg:
        x8 ^= b
    cands.append((lo, hi, s8, s16, x8))
    print("   range 0x%04X-0x%04X : sum8=0x%02X sum16=0x%04X xor8=0x%02X"
          % (lo, hi, s8, s16, x8))
print()
print("   Does any 16-bit word in the image equal a sum16 of the region")
print("   preceding it (classic 'checksum stored at end') ?")
hits = 0
run = 0
for a in range(0x4000, 0x7D35):
    w_be = (d[a] << 8) | d[a + 1]
    w_le = d[a] | (d[a + 1] << 8)
    s = sum(d[0:a]) & 0xFFFF
    if w_be == s or w_le == s:
        print("      MATCH at 0x%04X (be=0x%04X le=0x%04X sum=0x%04X)" % (a, w_be, w_le, s))
        hits += 1
print("      matches: %d" % hits)

print()
print("=" * 70)
print("C. DUPLICATED CALIBRATION SETS")
print("   longest repeated byte runs inside the calibration block")
best = []
blk = d[0x4200:CAL_END]
seen = {}
for L in (64, 48, 32):
    occ = defaultdict(list)
    for i in range(len(blk) - L):
        occ[blk[i:i + L]].append(i + 0x4200)
    rep = {k: v for k, v in occ.items() if len(v) > 1}
    print("   runs of %d identical bytes appearing >1x : %d distinct" % (L, len(rep)))
    if L == 32:
        shown = 0
        for k, v in sorted(rep.items(), key=lambda kv: kv[1][0]):
            if shown >= 8:
                break
            print("      at %s" % " ".join("0x%04X" % x for x in v[:6]))
            shown += 1

print()
print("=" * 70
      )
print("D. XDF CROSS-CHECK: do XDF Addresses land on derived table data offsets?")
txt = open(XDF, encoding="latin-1").read()
blocks = re.findall(r"%%(TABLE|CONSTANT)%%(.*?)%%END%%", txt, re.S)
data_offs = {t["data"]: s for s, t in tabs.items()}
n_ok = n_hdr = n_miss = 0
rows = []
for kind, body in blocks:
    def g(pat, default=None):
        m = re.search(pat, body)
        return m.group(1) if m else default
    title = g(r'Title\s+="([^"]*)"', "")
    addr = g(r"Address\s+=0x([0-9A-Fa-f]+)")
    rows_ = g(r"Rows\s+=0x([0-9A-Fa-f]+)", "1")
    cols_ = g(r"Cols\s+=0x([0-9A-Fa-f]+)", "1")
    if addr is None:
        continue
    a = int(addr, 16)
    if a == 0:
        continue
    r_, c_ = int(rows_, 16), int(cols_, 16)
    if a in data_offs:
        s = data_offs[a]
        t = tabs[s]
        agree = (t["ny"] * t["nx"] == r_ * c_)
        rows.append((title, a, r_, c_, s, t, "DATA-START", agree))
        n_ok += 1
    elif a in tabs:
        rows.append((title, a, r_, c_, a, tabs[a], "TABLE-START(header)", None))
        n_hdr += 1
    else:
        rows.append((title, a, r_, c_, None, None, "NOT A TABLE BOUNDARY", None))
        n_miss += 1
print("   XDF entries with nonzero Address     : %d" % len(rows))
print("   land exactly on a derived data start : %d" % n_ok)
print("   land on a table header start         : %d" % n_hdr)
print("   land on neither                      : %d" % n_miss)
print()
for title, a, r_, c_, s, t, status, agree in rows:
    if t:
        note = "" if agree is None else ("  dims OK" if agree else
                                         "  DIMS DISAGREE rom=%dx%d xdf=%dx%d"
                                         % (t["ny"], t["nx"], r_, c_))
        print("   0x%04X %-44s %-20s rom %s %dx%d%s"
              % (a, title[:44], status, t["kind"], t["ny"], t["nx"], note))
    else:
        print("   0x%04X %-44s %s" % (a, title[:44], status))

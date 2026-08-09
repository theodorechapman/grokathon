"""Render the safety/driveability-critical maps in engineering units."""

ROM = "/tmp/ecu-re/318i_175_soft1267356378.bin"
d = open(ROM, "rb").read()
PTR_BASE, PTR_END, CAL_END = 0x45C0, 0x46EC, 0x5A0A
ptrs = [(d[a] << 8) | d[a + 1] for a in range(PTR_BASE, PTR_END, 2)]
starts = sorted(set(ptrs))
size = {s: (starts[i + 1] if i + 1 < len(starts) else CAL_END) - s
        for i, s in enumerate(starts)}


def parse(s):
    sz, n = size[s], d[s + 1]
    if n and sz == 2 + 2 * n:
        return dict(kind="1D", ny=1, nx=n, axA=[], axB=list(d[s + 2:s + 2 + n]),
                    data=s + 2 + n)
    ny = d[s + 1]
    nx = d[s + 3 + ny]
    return dict(kind="2D", ny=ny, nx=nx, axA=list(d[s + 2:s + 2 + ny]),
                extra=d[s + 2 + ny], axB=list(d[s + 4 + ny:s + 4 + ny + nx]),
                data=s + 4 + ny + nx)


tabs = {s: parse(s) for s in starts}
by_data = {t["data"]: s for s, t in tabs.items()}


def cum(v):
    o, a = [], 0
    for x in v:
        a += x
        o.append(a)
    return o


def show(data_off, label, fmt, unit):
    s = by_data[data_off]
    t = tabs[s]
    print("\n" + "=" * 74)
    print("%s" % label)
    print("  table hdr 0x%04X  type=0x%02X  %s %dx%d  data@0x%04X  size=%d"
          % (s, d[s], t["kind"], t["ny"], t["nx"], t["data"], size[s]))
    idxs = [i for i, p in enumerate(ptrs) if p == s]
    print("  index slot(s) in 0x45C0 table: %s" % idxs)
    if t["kind"] == "2D":
        print("  axis A raw deltas : %s" % " ".join("%02X" % x for x in t["axA"]))
        print("  axis A cumulative : %s" % " ".join("%3d" % x for x in cum(t["axA"])))
        print("  byte after axis A : 0x%02X" % t["extra"])
    print("  axis B raw deltas : %s" % " ".join("%02X" % x for x in t["axB"]))
    print("  axis B cumulative : %s" % " ".join("%3d" % x for x in cum(t["axB"])))
    print("  values (%s):" % unit)
    for r in range(t["ny"]):
        row = d[t["data"] + r * t["nx"]: t["data"] + (r + 1) * t["nx"]]
        print("    raw %s" % " ".join("%02X" % x for x in row))
        print("    eng %s" % " ".join(fmt(x) for x in row))


afr = lambda x: "%5.1f" % (1881.6 / x) if x else "  inf"
lam = lambda x: "%5.3f" % (128.0 / x) if x else "  inf"
ign = lambda x: "%6.2f" % (x * 0.75 - 22.5)
raw = lambda x: "%5d" % x

print("#" * 74)
print("# FUEL: value 128 (0x80) == lambda 1.00 (XDF AFR eq 1881.6/X -> 1881.6/128 = 14.70)")
show(0x4B42, "High-load fuel map, set 1  (XDF 'High part throttle fuel map')", lam, "lambda")
show(0x4BAC, "Part-load fuel map, set 1  (XDF 'Low Throttle Fuel map')", lam, "lambda")
show(0x49DF, "WOT fuel vs rpm, set 1     (XDF 'Fuel WOT Map1')", lam, "lambda")
show(0x4A2F, "WOT fuel vs rpm, set 2     (XDF 'Fuel WOT Map 2')", lam, "lambda")

print("\n\n" + "#" * 74)
print("# IGNITION: XDF eq (X*0.75)-22.5 deg  => 0x1E(30)=0.00 deg, 0.75 deg/count")
show(0x52C2, "High-load ignition, set 1", ign, "deg BTDC")
show(0x532C, "Part-load ignition, set 1", ign, "deg BTDC")
show(0x5165, "WOT ignition vs rpm, set 1", ign, "deg BTDC")
show(0x518C, "Idle ignition", ign, "deg BTDC")

print("\n\n" + "#" * 74)
print("# IDLE SPEED TARGETS")
for a, lbl in ((0x57EF, "AT in P/N, A/C on or off"), (0x57FB, "AT in D/R, A/C on"),
               (0x5805, "AT in D/R, A/C off")):
    show(a, "Idle target: %s" % lbl, raw, "raw")

print("\n\n" + "#" * 74)
print("# SENSOR LINEARISATION / CORRECTIONS")
show(0x4849, "Engine temp sensor transfer", raw, "raw")
show(0x4931, "Injector trim (air temp x battery V)", raw, "raw")
show(0x488B, "Injector dead time vs battery V", raw, "raw")
show(0x4967, "Coolant enrichment 1", raw, "raw")
show(0x4988, "Coolant enrichment 2", raw, "raw")
show(0x4977, "Acceleration enrichment", raw, "raw")
show(0x49C1, "Idle fuel map", lam, "lambda")

print("\n\n" + "#" * 74)
print("# NON-INDEXED DATA BLOCK 0x4700-0x47B4 (XDF calls this AFM)")
print("  0x4700 (8 bytes, XDF 'AFM map scale factors'): %s"
      % " ".join("%02X" % x for x in d[0x4700:0x4708]))
print("  0x4708 (8 bytes, unlabelled)                : %s"
      % " ".join("%02X" % x for x in d[0x4708:0x4710]))
print("  0x4710 (32 bytes, XDF 'AFM voltage transfer'): %s"
      % " ".join("%02X" % x for x in d[0x4710:0x4730]))
print("     as decimal: %s" % " ".join("%d" % x for x in d[0x4710:0x4730]))
print("     increments: %s" % " ".join("%d" % (d[0x4710 + i + 1] - d[0x4710 + i])
                                       for i in range(31)))
print("  0x4730 (32 bytes, unlabelled)               : %s"
      % " ".join("%02X" % x for x in d[0x4730:0x4750]))
print("     as decimal: %s" % " ".join("%d" % x for x in d[0x4730:0x4750]))

print("\n\n" + "#" * 74)
print("# THE NEUTRAL TABLE (pointed at by 6 index slots)")
s = 0x4835
print("  0x4835: %s   -> type=0x38 n=2 axis=[0x64,0x52] values=[0x80,0x80]"
      % " ".join("%02X" % x for x in d[s:s + 6]))
print("  0x80 = 128 = unity/stoich; a 2-point flat table = 'feature disabled'")
print("  index slots using it: %s" % [i for i, p in enumerate(ptrs) if p == 0x4835])

print("\n\n" + "#" * 74)
print("# TABLES NOT DESCRIBED BY THE XDF")
import re
txt = open("/tmp/ecu-re/BMW_175_318i_soft378.xdf", encoding="latin-1").read()
xaddr = {int(m, 16) for m in re.findall(r"Address\s+=0x([0-9A-Fa-f]+)", txt)}
named = {s for s, t in tabs.items() if t["data"] in xaddr}
print("  total indexed tables : %d" % len(tabs))
print("  identified by XDF    : %d" % len(named))
print("  UNIDENTIFIED         : %d" % (len(tabs) - len(named)))
uk = [(s, tabs[s]) for s in starts if s not in named]
print("\n  unidentified tables (hdr, type, dims, data offset, bytes):")
for s, t in uk:
    print("   0x%04X type=0x%02X %s %2dx%-2d data@0x%04X" %
          (s, d[s], t["kind"], t["ny"], t["nx"], t["data"]))

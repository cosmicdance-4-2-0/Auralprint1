"""Independent high-precision definitions, evaluated outside JavaScript/binary64."""
import json, sys
from decimal import Decimal, localcontext

with localcontext() as ctx:
    ctx.prec = 700
    def forward(mode, f):
        if mode == "linear": return f
        if mode == "log": return f.ln()
        if mode == "mel": return Decimal(2595) * (1 + f / 700).log10()
        if mode == "bark": return Decimal("26.81") * f / (1960 + f) - Decimal("0.53")
        return Decimal("21.4") * (1 + Decimal("0.00437") * f).log10()
    def inverse(mode, s):
        if mode == "linear": return s
        if mode == "log": return s.exp()
        if mode == "mel": return 700 * ((s / 2595 * Decimal(10).ln()).exp() - 1)
        if mode == "bark": return 1960 * (s + Decimal("0.53")) / (Decimal("26.28") - s)
        return ((s / Decimal("21.4") * Decimal(10).ln()).exp() - 1) / Decimal("0.00437")
    result = []
    for mode, n, lo, hi in json.load(sys.stdin):
        a, b = Decimal.from_float(lo), Decimal.from_float(hi)
        s0, s1 = forward(mode, a), forward(mode, b)
        result.append([float(inverse(mode, s0 + (s1-s0)*Decimal(i)/n)) for i in range(n+1)])
    json.dump(result, sys.stdout)

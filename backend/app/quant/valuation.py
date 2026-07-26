"""Valuation engine — intrinsic value computed in Python, never by the AI.

Three layers, all deterministic (numpy only, no new dependencies):

1. `wacc()` — CAPM cost of equity (risk-free + beta x equity risk premium),
   optionally blended with an after-tax cost of debt using a debt/equity weight,
   then clamped to a sane 6-16% band so one bad beta cannot produce a nonsense
   discount rate.

2. `dcf()` — a standard two-stage free-cash-flow DCF. Stage 1 projects `years`
   of FCF starting from the latest reported FCF, with the starting growth rate
   fading LINEARLY toward the terminal rate (year 1 = starting growth, final
   year = terminal growth). Stage 2 is a Gordon-growth terminal value. Both are
   discounted at the WACC and summed to an enterprise value; less net debt gives
   the equity value; divided by shares gives intrinsic value per share.

3. `monte_carlo_dcf()` — the same model re-run thousands of times with growth,
   WACC and terminal growth drawn from distributions around the base case
   (normal for growth/WACC, triangular for terminal growth), producing a
   distribution of intrinsic values: P10/P25/median/P75/P90 plus a histogram.
   The RNG is explicitly seeded, so the output is byte-for-byte reproducible.

`valuation_ranges()` turns whatever inputs exist into a "football field" of
per-share ranges (DCF Monte Carlo, P/E, EV/EBITDA, P/S, FCF yield, 52-week) and
`build_valuation()` is the single entry point the API and report layers call.

Discipline: every function is None-safe and returns None (or omits a range)
rather than inventing an input. The few unavoidable modelling assumptions
(risk-free rate, ERP, tax, multiple bands, and an assumed beta of 1.0 when beta
is unknown) are constants declared below and echoed back in `assumptions` /
`basis` / `missing`, so both the UI and the AI can state them plainly.
"""

from __future__ import annotations

import math

import numpy as np

# ---- macro / capital-structure assumptions -------------------------------------
RISK_FREE_DEFAULT = 0.042        # ~10y UST
ERP_DEFAULT = 0.05               # equity risk premium
COST_OF_DEBT_DEFAULT = 0.055
TAX_DEFAULT = 0.21               # US federal statutory
BETA_ASSUMED = 1.0               # used only when beta is unknown (disclosed)

# ---- model bounds (guards, not opinions) ---------------------------------------
WACC_FLOOR, WACC_CEIL = 0.06, 0.16
BETA_FLOOR, BETA_CEIL = 0.30, 3.00
DE_CEIL = 5.0                    # cap the debt weight at 5x equity
MIN_SPREAD = 0.01                # minimum WACC - terminal growth spread
GROWTH_FLOOR, GROWTH_CEIL = -0.20, 0.30
TERMINAL_CEIL = 0.04
MIN_YEARS, MAX_YEARS = 3, 20

# ---- defaults ------------------------------------------------------------------
DEFAULT_TERMINAL_GROWTH = 0.025
DEFAULT_YEARS = 10

# ---- Monte Carlo ---------------------------------------------------------------
MC_TRIALS = 4000
MC_SEED = 42
HIST_BINS = 28
WACC_SIGMA = 0.015
GROWTH_SIGMA_FLOOR, GROWTH_SIGMA_CEIL = 0.03, 0.10
TERMINAL_SPAN = 0.0125           # +/- span of the triangular terminal-growth draw

# ---- market-wide multiple bands used for the football field ---------------------
# Deliberately broad, market-level (not company-specific) bands. They are an
# explicit assumption, reported back in each range's `basis` string.
PEER_BANDS: dict[str, tuple[float, float]] = {
    "pe": (14.0, 24.0),
    "ev_ebitda": (9.0, 15.0),
    "ps": (1.5, 4.5),
    "fcf_yield": (0.035, 0.065),   # low yield -> high value
}


# --------------------------------------------------------------------------- utils
def _f(x) -> float | None:
    """Coerce to a clean float or None (drops NaN/inf)."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _round(x, nd: int = 4) -> float | None:
    v = _f(x)
    return None if v is None else round(v, nd)


def _first(*values) -> float | None:
    for v in values:
        got = _f(v)
        if got is not None:
            return got
    return None


def _pos(x) -> float | None:
    """Float, but only if strictly positive."""
    v = _f(x)
    return v if (v is not None and v > 0) else None


# ---------------------------------------------------------------------------- wacc
def wacc(beta, risk_free: float = RISK_FREE_DEFAULT, erp: float = ERP_DEFAULT,
         debt_to_equity=None, cost_of_debt: float = COST_OF_DEBT_DEFAULT,
         tax: float = TAX_DEFAULT) -> float | None:
    """CAPM cost of equity, optionally debt-weighted. Clamped to WACC_FLOOR..CEIL.

    Returns None when beta / risk_free / erp are unusable — a discount rate is
    never guessed here (see `build_valuation` for the disclosed beta fallback).
    """
    b, rf, e = _f(beta), _f(risk_free), _f(erp)
    if b is None or rf is None or e is None:
        return None
    b = min(max(b, BETA_FLOOR), BETA_CEIL)
    cost_equity = rf + b * e

    de, cod, tx = _f(debt_to_equity), _f(cost_of_debt), _f(tax)
    rate = cost_equity
    if de is not None and de > 0 and cod is not None and tx is not None and 0.0 <= tx < 1.0:
        de = min(de, DE_CEIL)
        w_equity = 1.0 / (1.0 + de)
        w_debt = de / (1.0 + de)
        rate = w_equity * cost_equity + w_debt * cod * (1.0 - tx)

    if not math.isfinite(rate):
        return None
    return round(min(max(rate, WACC_FLOOR), WACC_CEIL), 6)


# ----------------------------------------------------------------------------- dcf
def dcf(fcf, growth, wacc_rate, terminal_growth: float = DEFAULT_TERMINAL_GROWTH,
        years: int = DEFAULT_YEARS, shares=None, net_debt=None) -> dict | None:
    """Two-stage FCF DCF. Growth fades linearly to `terminal_growth` over `years`.

    Returns None when inputs are insufficient (missing FCF/growth/WACC, or a
    non-positive FCF, for which a growth DCF is meaningless).
    """
    f0, g_in, w, tg = _f(fcf), _f(growth), _f(wacc_rate), _f(terminal_growth)
    if f0 is None or g_in is None or w is None or tg is None:
        return None
    if f0 <= 0 or w <= 0:
        return None

    try:
        n = int(years)
    except (TypeError, ValueError):
        return None
    n = min(max(n, MIN_YEARS), MAX_YEARS)

    tg = min(max(tg, 0.0), TERMINAL_CEIL)
    if w - tg < MIN_SPREAD:               # Gordon denominator must stay meaningful
        return None

    g = min(max(g_in, GROWTH_FLOOR), GROWTH_CEIL)

    pv_explicit = 0.0
    projection: list[dict] = []
    f = f0
    for t in range(1, n + 1):
        frac = (t - 1) / (n - 1) if n > 1 else 1.0
        g_t = g + (tg - g) * frac
        f = f * (1.0 + g_t)
        pv = f / ((1.0 + w) ** t)
        pv_explicit += pv
        projection.append({"year": t, "growth": round(g_t, 6),
                           "fcf": _round(f, 2), "pv": _round(pv, 2)})

    terminal_value = f * (1.0 + tg) / (w - tg)
    pv_terminal = terminal_value / ((1.0 + w) ** n)
    ev = pv_explicit + pv_terminal
    if not math.isfinite(ev):
        return None

    nd = _f(net_debt)
    nd = 0.0 if nd is None else nd
    equity = ev - nd
    sh = _pos(shares)
    per_share = equity / sh if sh else None

    return {
        "enterprise_value": _round(ev, 2),
        "equity_value": _round(equity, 2),
        "intrinsic_value_per_share": _round(per_share, 4),
        "pv_explicit": _round(pv_explicit, 2),
        "pv_terminal": _round(pv_terminal, 2),
        "terminal_value": _round(terminal_value, 2),
        "projection": projection,
        "assumptions": {
            "fcf": _round(f0, 2),
            "growth": round(g, 6),
            "growth_input": round(g_in, 6),
            "wacc": round(w, 6),
            "terminal_growth": round(tg, 6),
            "years": n,
            "shares": _round(sh, 2),
            "net_debt": _round(nd, 2),
            "terminal_pct_of_value": _round(pv_terminal / ev, 4) if ev else None,
        },
    }


# --------------------------------------------------------------------- monte carlo
def _pick(base: dict, *keys) -> float | None:
    """Look keys up at the top level of `base`, then inside base['assumptions']."""
    nested = base.get("assumptions") if isinstance(base.get("assumptions"), dict) else None
    for src in (base, nested):
        if not isinstance(src, dict):
            continue
        for k in keys:
            v = _f(src.get(k))
            if v is not None:
                return v
    return None


def monte_carlo_dcf(base, *, trials: int = MC_TRIALS, seed: int = MC_SEED) -> dict | None:
    """Distribution of intrinsic values per share around a base-case DCF.

    `base` may be the dict returned by `dcf()` (inputs are read from its
    `assumptions`) or a flat dict with fcf / growth / wacc / terminal_growth /
    years / shares / net_debt / price. Growth and WACC are drawn normal,
    terminal growth triangular; terminal growth is always held at least
    MIN_SPREAD below the drawn WACC so the Gordon denominator stays positive.

    Reproducible: same `base` + `seed` -> identical output.
    """
    if not isinstance(base, dict):
        return None

    fcf = _pick(base, "fcf", "free_cash_flow")
    growth = _pick(base, "growth")
    w0 = _pick(base, "wacc", "wacc_rate")
    tg0 = _pick(base, "terminal_growth")
    shares = _pos(_pick(base, "shares", "shares_outstanding"))
    net_debt = _pick(base, "net_debt")
    price = _pos(_pick(base, "price", "last_price"))
    years = _pick(base, "years")

    if fcf is None or fcf <= 0 or growth is None or w0 is None or w0 <= 0 or shares is None:
        return None

    net_debt = 0.0 if net_debt is None else net_debt
    tg0 = DEFAULT_TERMINAL_GROWTH if tg0 is None else min(max(tg0, 0.0), TERMINAL_CEIL)
    n = int(min(max(years or DEFAULT_YEARS, MIN_YEARS), MAX_YEARS))
    try:
        k = int(trials)
    except (TypeError, ValueError):
        k = MC_TRIALS
    k = min(max(k, 200), 40_000)

    try:
        rng = np.random.default_rng(int(seed))
        g_sigma = min(max(abs(growth) * 0.5, GROWTH_SIGMA_FLOOR), GROWTH_SIGMA_CEIL)
        g = np.clip(rng.normal(growth, g_sigma, k), GROWTH_FLOOR, GROWTH_CEIL)
        w = np.clip(rng.normal(w0, WACC_SIGMA, k), WACC_FLOOR - 0.01, WACC_CEIL + 0.04)

        lo_t = max(0.0, tg0 - TERMINAL_SPAN)
        hi_t = max(lo_t + 1e-6, tg0 + TERMINAL_SPAN)
        mode_t = min(max(tg0, lo_t), hi_t)
        tg = rng.triangular(lo_t, mode_t, hi_t, k)
        tg = np.minimum(tg, w - MIN_SPREAD)          # denominator >= MIN_SPREAD

        idx = np.arange(n)
        frac = (idx / (n - 1)) if n > 1 else np.ones(n)
        g_path = g[:, None] + (tg[:, None] - g[:, None]) * frac[None, :]
        fcfs = fcf * np.cumprod(1.0 + g_path, axis=1)
        pv_explicit = np.sum(fcfs / (1.0 + w[:, None]) ** (idx + 1), axis=1)
        pv_terminal = (fcfs[:, -1] * (1.0 + tg) / (w - tg)) / (1.0 + w) ** n
        per_share = (pv_explicit + pv_terminal - net_debt) / shares

        vals = per_share[np.isfinite(per_share)]
        if vals.size < 50:
            return None

        p10, p25, p50, p75, p90 = (float(x) for x in np.percentile(vals, [10, 25, 50, 75, 90]))
        lo = float(np.percentile(vals, 1))
        hi = float(np.percentile(vals, 99))
        if not (math.isfinite(lo) and math.isfinite(hi)):
            return None
        if hi <= lo:
            hi = lo + max(abs(lo) * 0.01, 0.01)
        counts, edges = np.histogram(np.clip(vals, lo, hi), bins=HIST_BINS, range=(lo, hi))
        histogram = [{"x": round(float(edges[i]), 4), "count": int(counts[i])}
                     for i in range(len(counts))]

        prob = float(np.mean(vals > price)) if price else None
    except (ValueError, FloatingPointError, ZeroDivisionError, OverflowError):
        return None

    return {
        "median": _round(p50, 4),
        "mean": _round(float(vals.mean()), 4),
        "p10": _round(p10, 4),
        "p25": _round(p25, 4),
        "p75": _round(p75, 4),
        "p90": _round(p90, 4),
        "std_dev": _round(float(vals.std()), 4),
        "prob_above_price": _round(prob, 4),
        "histogram": histogram,
        "bin_width": _round((hi - lo) / HIST_BINS, 6),
        "trials": int(vals.size),
        "trials_requested": k,
        "seed": int(seed),
    }


# ------------------------------------------------------------------ football field
def _range(label: str, method: str, low, high, basis: str, mid=None) -> dict | None:
    lo, hi = _f(low), _f(high)
    if lo is None or hi is None:
        return None
    if hi < lo:
        lo, hi = hi, lo
    if hi <= 0:
        return None
    lo = max(lo, 0.0)                     # equity value floors at zero on the chart
    m = _f(mid)
    if m is None:
        m = (lo + hi) / 2.0
    m = min(max(m, lo), hi)
    return {"label": label, "method": method, "low": round(lo, 4),
            "high": round(hi, 4), "mid": round(m, 4), "basis": basis}


def valuation_ranges(*, price=None, shares=None, eps=None, revenue=None, fcf=None,
                     ebitda=None, net_debt=None, monte_carlo: dict | None = None,
                     high_52w=None, low_52w=None,
                     bands: dict | None = None) -> list[dict]:
    """The "football field": one {label, method, low, high, mid, basis} per method.

    Any method whose inputs are missing (or non-positive where a positive value
    is required) is skipped entirely — nothing is fabricated to fill the chart.
    """
    b = {**PEER_BANDS, **(bands or {})}
    sh = _pos(shares)
    nd = _f(net_debt) or 0.0
    out: list[dict] = []

    # 1) DCF Monte Carlo P10-P90
    if isinstance(monte_carlo, dict):
        mc_trials = monte_carlo.get("trials")
        out.append(_range(
            "DCF (Monte Carlo P10–P90)", "dcf_mc",
            monte_carlo.get("p10"), monte_carlo.get("p90"),
            f"{mc_trials:,} simulated DCFs" if isinstance(mc_trials, int) else "simulated DCFs",
            mid=monte_carlo.get("median")))

    # 2) P/E multiple on trailing EPS
    e = _pos(eps)
    if e is not None and "pe" in b:
        lo_m, hi_m = b["pe"]
        out.append(_range("P/E multiple", "pe", e * lo_m, e * hi_m,
                          f"EPS {e:,.2f} x {lo_m:g}-{hi_m:g}"))

    # 3) EV/EBITDA -> equity value per share
    eb = _pos(ebitda)
    if eb is not None and sh is not None and "ev_ebitda" in b:
        lo_m, hi_m = b["ev_ebitda"]
        out.append(_range("EV/EBITDA", "ev_ebitda",
                          (eb * lo_m - nd) / sh, (eb * hi_m - nd) / sh,
                          f"EBITDA {eb:,.0f} x {lo_m:g}-{hi_m:g} less net debt"))

    # 4) P/S multiple on trailing revenue
    rev = _pos(revenue)
    if rev is not None and sh is not None and "ps" in b:
        lo_m, hi_m = b["ps"]
        out.append(_range("P/S", "ps", rev * lo_m / sh, rev * hi_m / sh,
                          f"Revenue {rev:,.0f} x {lo_m:g}-{hi_m:g}"))

    # 5) FCF yield (low yield = high value)
    fc = _pos(fcf)
    if fc is not None and sh is not None and "fcf_yield" in b:
        lo_y, hi_y = b["fcf_yield"]
        if lo_y > 0 and hi_y > 0:
            out.append(_range("FCF yield", "fcf_yield",
                              fc / hi_y / sh, fc / lo_y / sh,
                              f"FCF {fc:,.0f} at {lo_y * 100:.1f}%-{hi_y * 100:.1f}% yield"))

    # 6) Realized 52-week range (pure market data, no assumptions)
    lo52, hi52 = _pos(low_52w), _pos(high_52w)
    if lo52 is not None and hi52 is not None:
        out.append(_range("52-week range", "range_52w", lo52, hi52, "realized trading range"))

    return [r for r in out if r is not None]


# ---------------------------------------------------------------------- entrypoint
def build_valuation(fundamentals: dict | None, technicals: dict | None, *,
                    price=None, shares=None) -> dict:
    """Full valuation payload. Never raises; missing pieces come back as None.

    `fundamentals` is the dict shape produced by app.quant.fundamental (or the
    FinancialData row mapped into it), `technicals` the app.quant.technical
    snapshot (its `extra` supplies last price and the 52-week range).
    """
    f = fundamentals or {}
    t = technicals or {}
    extra = t.get("extra") if isinstance(t.get("extra"), dict) else {}
    used: list[str] = []
    missing: list[str] = []

    def track(name: str, value, note: str | None = None):
        (used if value is not None else missing).append(note or name)
        return value

    # --- price / size --------------------------------------------------------
    px = track("price", _pos(_first(price, t.get("last_price"), extra.get("last_price"))))
    market_cap = track("market_cap", _pos(f.get("market_cap")))

    sh = _pos(_first(shares, f.get("shares_outstanding"), extra.get("shares_outstanding")))
    shares_source = "provided" if sh is not None else None
    if sh is None and market_cap is not None and px is not None:
        sh = market_cap / px
        shares_source = "derived: market_cap / price"
    track("shares_outstanding", sh, f"shares_outstanding ({shares_source})" if sh else None)

    # --- cash flow + growth --------------------------------------------------
    fcf = track("free_cash_flow", _f(f.get("free_cash_flow")))
    if fcf is not None and fcf <= 0:
        missing.append("positive free_cash_flow (DCF not applicable)")

    growth_source = None
    growth = None
    for key in ("fcf_growth", "revenue_growth", "earnings_growth", "eps_growth"):
        cand = _f(f.get(key))
        if cand is not None:
            growth, growth_source = cand, key
            break
    if growth is None:
        growth, growth_source = DEFAULT_TERMINAL_GROWTH, "assumed (no growth data)"
        missing.append("growth (fcf/revenue/earnings)")
    else:
        used.append(f"growth ({growth_source})")

    # --- balance sheet -------------------------------------------------------
    total_debt = _f(f.get("total_debt"))
    cash = _f(f.get("cash"))
    net_debt = None
    if total_debt is not None or cash is not None:
        net_debt = (total_debt or 0.0) - (cash or 0.0)
    track("net_debt", net_debt, "net_debt (total_debt - cash)")

    # --- discount rate -------------------------------------------------------
    beta = _f(_first(f.get("beta"), extra.get("beta")))
    beta_source = "reported"
    if beta is None:
        beta, beta_source = BETA_ASSUMED, "assumed 1.0 (beta unavailable)"
        missing.append("beta")
    else:
        used.append("beta")

    de = _f(f.get("debt_to_equity"))
    de_source = "reported" if de is not None else None
    if de is None and total_debt is not None and market_cap:
        de = total_debt / market_cap
        de_source = "derived: total_debt / market_cap"
    if de is None:
        missing.append("debt_to_equity")
    else:
        used.append(f"debt_to_equity ({de_source})")

    w = wacc(beta, debt_to_equity=de)

    # --- DCF + Monte Carlo ---------------------------------------------------
    base = dcf(fcf, growth, w, terminal_growth=DEFAULT_TERMINAL_GROWTH,
               years=DEFAULT_YEARS, shares=sh, net_debt=net_debt)
    mc = monte_carlo_dcf({**base, "price": px}, trials=MC_TRIALS, seed=MC_SEED) if base else None

    intrinsic = base.get("intrinsic_value_per_share") if base else None
    upside = (intrinsic / px - 1.0) if (intrinsic is not None and px) else None

    # --- multiples for the football field ------------------------------------
    vm = f.get("valuation_metrics") if isinstance(f.get("valuation_metrics"), dict) else {}
    eps = _f(f.get("eps"))
    revenue = _f(f.get("revenue"))
    ev_ebitda = _pos(vm.get("ev_ebitda"))
    ebitda = None
    if ev_ebitda is not None and market_cap is not None:
        ebitda = (market_cap + (net_debt or 0.0)) / ev_ebitda
        used.append("ebitda (derived: EV / EV-EBITDA)")

    ranges = valuation_ranges(
        price=px, shares=sh, eps=eps, revenue=revenue, fcf=fcf, ebitda=ebitda,
        net_debt=net_debt, monte_carlo=mc,
        high_52w=extra.get("high_52w"), low_52w=extra.get("low_52w"))

    return {
        "price": _round(px, 4),
        "intrinsic_value": _round(intrinsic, 4),
        "upside": _round(upside, 6),
        "wacc": _round(w, 6),
        "assumptions": {
            "risk_free": RISK_FREE_DEFAULT,
            "equity_risk_premium": ERP_DEFAULT,
            "beta": _round(beta, 4),
            "beta_source": beta_source,
            "cost_of_debt": COST_OF_DEBT_DEFAULT,
            "tax_rate": TAX_DEFAULT,
            "debt_to_equity": _round(de, 4),
            "debt_to_equity_source": de_source,
            "wacc": _round(w, 6),
            "growth": _round(min(max(growth, GROWTH_FLOOR), GROWTH_CEIL), 6),
            "growth_input": _round(growth, 6),
            "growth_source": growth_source,
            "terminal_growth": DEFAULT_TERMINAL_GROWTH,
            "years": DEFAULT_YEARS,
            "fcf": _round(fcf, 2),
            "net_debt": _round(net_debt, 2),
            "shares_outstanding": _round(sh, 2),
            "shares_source": shares_source,
            "market_cap": _round(market_cap, 2),
            "ebitda": _round(ebitda, 2),
            "multiple_bands": {k: list(v) for k, v in PEER_BANDS.items()},
            "trials": MC_TRIALS,
            "seed": MC_SEED,
        },
        "dcf": base,
        "monte_carlo": mc,
        "ranges": ranges,
        "inputs_used": used,
        "missing": missing,
    }

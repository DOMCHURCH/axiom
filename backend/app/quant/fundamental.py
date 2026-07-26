"""Normalize fundamentals from FMP statements (with SEC Company Facts fallback).

All numbers are computed here in Python. Growth is YoY off the two most recent
annual periods (FMP returns newest-first). Missing inputs yield None, not zero.
"""

from __future__ import annotations

import math


def _f(x) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _g(row: dict | None, *keys):
    if not row:
        return None
    for k in keys:
        if k in row and row[k] is not None:
            v = _f(row[k])
            if v is not None:
                return v
    return None


def _yoy(newest, prior) -> float | None:
    a, b = _f(newest), _f(prior)
    if a is None or b is None or b == 0:
        return None
    return round(a / abs(b) - 1.0, 6)


def compute_fundamentals(bundle: dict, sec_facts: dict | None = None) -> dict:
    """`bundle` = {profile, income[], balance[], cashflow[], ratios[], key_metrics[]}."""
    income = bundle.get("income") or []
    balance = bundle.get("balance") or []
    cashflow = bundle.get("cashflow") or []
    ratios = bundle.get("ratios") or []
    kmetrics = bundle.get("key_metrics") or []
    profile = bundle.get("profile") or {}
    sec = sec_facts or {}

    inc0 = income[0] if income else None
    inc1 = income[1] if len(income) > 1 else None
    bal0 = balance[0] if balance else None
    cf0 = cashflow[0] if cashflow else None
    cf1 = cashflow[1] if len(cashflow) > 1 else None
    rat0 = ratios[0] if ratios else None
    km0 = kmetrics[0] if kmetrics else None

    revenue = _g(inc0, "revenue") or _f(sec.get("revenue"))
    net_income = _g(inc0, "netIncome") or _f(sec.get("net_income"))
    eps = _g(inc0, "epsdiluted", "eps") or _f(sec.get("eps"))
    fcf = _g(cf0, "freeCashFlow")
    equity = _g(bal0, "totalStockholdersEquity") or _f(sec.get("equity"))

    gross_margin = _g(inc0, "grossProfitRatio")
    if gross_margin is None and revenue:
        gp = _g(inc0, "grossProfit")
        gross_margin = round(gp / revenue, 6) if gp is not None else None
    operating_margin = _g(inc0, "operatingIncomeRatio")
    if operating_margin is None and revenue:
        oi = _g(inc0, "operatingIncome")
        operating_margin = round(oi / revenue, 6) if oi is not None else None
    net_margin = _g(inc0, "netIncomeRatio")
    if net_margin is None and revenue and net_income is not None:
        net_margin = round(net_income / revenue, 6)

    roe = _g(rat0, "returnOnEquity")
    if roe is None and net_income is not None and equity:
        roe = round(net_income / equity, 6)
    roic = _g(km0, "roic") or _g(rat0, "returnOnCapitalEmployed")

    valuation = {
        "pe": _g(rat0, "priceEarningsRatio") or _g(km0, "peRatio"),
        "ps": _g(rat0, "priceToSalesRatio") or _g(km0, "priceToSalesRatio"),
        "pb": _g(rat0, "priceToBookRatio") or _g(km0, "pbRatio"),
        "ev_ebitda": _g(rat0, "enterpriseValueMultiple") or _g(km0, "enterpriseValueOverEBITDA"),
        "peg": _g(rat0, "priceEarningsToGrowthRatio"),
        "fcf_yield": _g(km0, "freeCashFlowYield"),
        "dividend_yield": _g(rat0, "dividendYield") or _g(km0, "dividendYield"),
    }

    return {
        "fiscal_date": (inc0 or {}).get("date") or sec.get("fiscal_end"),
        "revenue": revenue,
        "revenue_growth": _yoy(_g(inc0, "revenue"), _g(inc1, "revenue")),
        "earnings": net_income,
        "earnings_growth": _yoy(_g(inc0, "netIncome"), _g(inc1, "netIncome")),
        "eps": eps,
        "eps_growth": _yoy(_g(inc0, "epsdiluted", "eps"), _g(inc1, "epsdiluted", "eps")),
        "gross_margin": gross_margin,
        "operating_margin": operating_margin,
        "net_margin": net_margin,
        "free_cash_flow": fcf,
        "fcf_growth": _yoy(_g(cf0, "freeCashFlow"), _g(cf1, "freeCashFlow")),
        "total_debt": _g(bal0, "totalDebt") or _g(bal0, "totalLiabilities"),
        "cash": _g(bal0, "cashAndCashEquivalents") or _f(sec.get("cash")),
        "debt_to_equity": _g(rat0, "debtEquityRatio"),
        "current_ratio": _g(rat0, "currentRatio"),
        "roic": roic,
        "roe": roe,
        "market_cap": _g(profile, "mktCap"),
        "beta": _g(profile, "beta"),
        "valuation_metrics": valuation,
    }

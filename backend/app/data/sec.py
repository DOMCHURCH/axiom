"""SEC EDGAR — filings (10-K/10-Q/8-K) + structured Company Facts (XBRL).

No API key; requires a descriptive User-Agent. Unlimited (fair-use). Provides:
  * recent_filings(cik)     -> filing metadata list
  * fetch_filing_text(url)  -> plain text of a filing document
  * company_facts(cik)      -> raw XBRL facts
  * facts_financials(facts) -> a few normalized fundamentals (free FMP fallback)
"""

from __future__ import annotations

from bs4 import BeautifulSoup

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json, get_text
from app.core.logging import get_logger
from app.data.limits import sec_throttle

log = get_logger("sec")

SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc}/{doc}"


def _headers() -> dict:
    return {"User-Agent": settings.sec_user_agent, "Accept-Encoding": "gzip, deflate"}


def _pad(cik: str) -> str:
    return str(cik).lstrip("0").zfill(10)


def recent_filings(cik: str, forms=("10-K", "10-Q", "8-K"), limit: int = 20) -> list[dict]:
    cik10 = _pad(cik)
    key = _key("sec_sub", cik10, ",".join(forms), limit)
    hit = cache_get(key)
    if hit is not None:
        return hit

    sec_throttle.acquire()
    try:
        data = get_json(SUBMISSIONS.format(cik=cik10), headers=_headers())
    except Exception as exc:
        log.warning("sec submissions failed", extra={"cik": cik10, "err": str(exc)})
        return []

    recent = (data.get("filings") or {}).get("recent") or {}
    accs = recent.get("accessionNumber", [])
    out: list[dict] = []
    for i, acc in enumerate(accs):
        form = recent.get("form", [None])[i]
        if forms and form not in forms:
            continue
        acc_nodash = acc.replace("-", "")
        doc = recent.get("primaryDocument", [""])[i]
        out.append({
            "accession_no": acc,
            "filing_type": form,
            "filing_date": recent.get("filingDate", [None])[i],
            "period_of_report": recent.get("reportDate", [None])[i] or None,
            "url": ARCHIVE.format(cik_int=int(cik10), acc=acc_nodash, doc=doc) if doc else None,
        })
        if len(out) >= limit:
            break
    cache_set(key, out, 6 * 3600)
    return out


def fetch_filing_text(url: str, max_chars: int = 400_000) -> str:
    """Download a filing document and strip HTML to plain text."""
    if not url:
        return ""
    key = _key("sec_text", url)
    hit = cache_get(key)
    if hit is not None:
        return hit

    sec_throttle.acquire()
    try:
        html = get_text(url, headers=_headers())
    except Exception as exc:
        log.warning("sec filing fetch failed", extra={"url": url, "err": str(exc)})
        return ""

    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "table"]):
        tag.decompose()
    text = " ".join(soup.get_text(separator=" ").split())[:max_chars]
    cache_set(key, text, 30 * 24 * 3600)
    return text


def company_facts(cik: str) -> dict | None:
    cik10 = _pad(cik)
    key = _key("sec_facts", cik10)
    hit = cache_get(key)
    if hit is not None:
        return hit

    sec_throttle.acquire()
    try:
        data = get_json(FACTS.format(cik=cik10), headers=_headers())
    except Exception as exc:
        log.warning("sec facts failed", extra={"cik": cik10, "err": str(exc)})
        return None
    if data is not None:
        cache_set(key, data, 7 * 24 * 3600)
    return data


def _latest_fact(facts: dict, concept: str, unit: str = "USD"):
    """Most-recent annual value for a us-gaap concept, or None."""
    try:
        units = facts["facts"]["us-gaap"][concept]["units"][unit]
    except (KeyError, TypeError):
        return None
    annual = [u for u in units if u.get("form") in ("10-K", "10-K/A") and u.get("fp") == "FY"]
    pool = annual or units
    if not pool:
        return None
    latest = max(pool, key=lambda u: u.get("end", ""))
    return {"value": latest.get("value"), "end": latest.get("end")}


def facts_financials(facts: dict | None) -> dict:
    """Normalized subset of fundamentals from Company Facts (free FMP fallback)."""
    if not facts:
        return {}
    revenue = (_latest_fact(facts, "Revenues")
               or _latest_fact(facts, "RevenueFromContractWithCustomerExcludingAssessedTax"))
    out = {
        "revenue": (revenue or {}).get("value"),
        "net_income": (_latest_fact(facts, "NetIncomeLoss") or {}).get("value"),
        "eps": (_latest_fact(facts, "EarningsPerShareDiluted", "USD/shares")
                or _latest_fact(facts, "EarningsPerShareBasic", "USD/shares") or {}).get("value"),
        "assets": (_latest_fact(facts, "Assets") or {}).get("value"),
        "liabilities": (_latest_fact(facts, "Liabilities") or {}).get("value"),
        "cash": (_latest_fact(facts, "CashAndCashEquivalentsAtCarryingValue") or {}).get("value"),
        "equity": (_latest_fact(facts, "StockholdersEquity") or {}).get("value"),
        "fiscal_end": (revenue or {}).get("end"),
    }
    return out

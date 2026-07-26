"""Plain-English meaning for SEC/EDGAR filing types — deterministic, zero-AI.

Turns a raw form code (8-K, 10-Q, Form 4, SC 13D...) into what it is, why a
company files it, and how a short-term trader can use it.
"""

from __future__ import annotations

FORM_INFO = {
    "10-K": {
        "name": "Annual report",
        "what": "The full audited yearly report — financials, risk factors, and management's discussion.",
        "why": "Required once a year; it's the most complete picture of the business.",
        "how": "Rarely moves a stock by itself (it's expected), but new risk factors or guidance can set the tone.",
    },
    "10-Q": {
        "name": "Quarterly report",
        "what": "Unaudited quarterly financials and updates on the business.",
        "why": "Filed each quarter to keep investors current between annual reports.",
        "how": "Lands around earnings — watch for revenue/margin surprises versus the prior quarter.",
    },
    "8-K": {
        "name": "Material event",
        "what": "A 'something just happened' disclosure — earnings, M&A, executive changes, guidance, big contracts.",
        "why": "Filed within 4 business days of a material event the market should know about.",
        "how": "The single most tradeable filing — a fresh 8-K often explains a sudden move; read it before acting.",
    },
    "4": {
        "name": "Insider transaction",
        "what": "An officer, director, or 10%+ owner bought or sold shares.",
        "why": "Insiders must report trades within two business days.",
        "how": "Cluster buying by insiders is a bullish tell; heavy insider selling is a caution flag.",
    },
    "3": {
        "name": "Initial insider ownership",
        "what": "A new insider's starting stake on record.",
        "why": "Filed when someone first becomes an officer, director, or major holder.",
        "how": "Context only — pair it with later Form 4 buys/sells to read intent.",
    },
    "5": {
        "name": "Annual insider summary",
        "what": "Year-end summary of insider transactions that weren't reported earlier.",
        "why": "Cleans up any deferred insider reporting.",
        "how": "Low signal on its own; useful for spotting quietly-accumulated positions.",
    },
    "SC 13D": {
        "name": "Activist stake (>5%)",
        "what": "An investor took a >5% position with intent to influence the company.",
        "why": "Required when a holder crosses 5% and isn't purely passive.",
        "how": "Activist involvement can be a catalyst — often a pop, then a longer campaign to watch.",
    },
    "SC 13G": {
        "name": "Passive stake (>5%)",
        "what": "A large but passive >5% ownership position.",
        "why": "The passive-investor version of a 13D.",
        "how": "Confirms big-money interest, but no activist catalyst — lower urgency.",
    },
    "DEF 14A": {
        "name": "Proxy statement",
        "what": "Materials for the shareholder vote — pay, board, and any proposals.",
        "why": "Filed ahead of the annual meeting.",
        "how": "Usually quiet, but merger or governance proposals here can matter.",
    },
    "S-1": {
        "name": "Registration / IPO",
        "what": "Registration of new securities, often an IPO or major share offering.",
        "why": "Required before selling new shares to the public.",
        "how": "A secondary offering can dilute holders and pressure the stock short-term.",
    },
    "424B": {
        "name": "Prospectus",
        "what": "The final terms of a securities offering.",
        "why": "Filed when an offering is priced.",
        "how": "Confirms dilution/size — watch for supply hitting the market.",
    },
    "13F": {
        "name": "Institutional holdings",
        "what": "A large fund's quarterly list of US equity positions.",
        "why": "Filed by managers with >$100M within 45 days of quarter-end.",
        "how": "Backward-looking (up to 45 days stale) but shows what the big funds own.",
    },
}

# normalize common variants (amendments, slashes) to a base key
_ALIASES = {
    "10-K/A": "10-K", "10-Q/A": "10-Q", "8-K/A": "8-K",
    "SC 13D/A": "SC 13D", "SC 13G/A": "SC 13G", "424B1": "424B",
    "424B2": "424B", "424B3": "424B", "424B4": "424B", "424B5": "424B",
    "S-1/A": "S-1",
}

_UNKNOWN = {
    "name": "SEC filing",
    "what": "A regulatory filing with the SEC.",
    "why": "Part of the company's ongoing disclosure obligations.",
    "how": "Open it to see what changed and whether it's material to the trade.",
}


def explain_filing(form: str | None) -> dict:
    if not form:
        return dict(_UNKNOWN)
    base = _ALIASES.get(form, form)
    if base not in FORM_INFO and base.split("/")[0] in FORM_INFO:
        base = base.split("/")[0]
    return dict(FORM_INFO.get(base, _UNKNOWN))

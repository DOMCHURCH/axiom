"""Curated liquid US trading universe, grouped by sector.

A short-term trading workstation only cares about liquid names you can actually
enter and exit — not the full ~10k SEC universe. Scanning this focused set keeps
'Find Best Trades' fast and relevant. Sectors are baked in (no API call needed),
which powers allocation sector-caps and the 'Strongest Sectors' view for free.
"""

from __future__ import annotations

SECTORS: dict[str, list[str]] = {
    "Semiconductors": [
        "NVDA", "AMD", "AVGO", "TSM", "ASML", "QCOM", "TXN", "INTC", "MU", "AMAT",
        "LRCX", "KLAC", "ADI", "MRVL", "NXPI", "MCHP", "ON", "TER", "GFS", "ARM",
        "SMCI", "SOXL",
    ],
    "Software": [
        "MSFT", "ORCL", "CRM", "ADBE", "NOW", "INTU", "SNPS", "CDNS", "PANW", "CRWD",
        "FTNT", "ZS", "PLTR", "SNOW", "DDOG", "NET", "MDB", "TEAM", "WDAY", "SHOP",
    ],
    "Tech Hardware": [
        "AAPL", "CSCO", "IBM", "DELL", "HPQ", "ANET", "WDC", "STX",
    ],
    "Communication": [
        "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "WBD",
        "SNAP", "PINS", "RDDT", "SPOT", "ROKU", "RBLX", "U", "EA", "TTWO",
    ],
    "Consumer Discretionary": [
        "AMZN", "TSLA", "HD", "LOW", "NKE", "SBUX", "MCD", "CMG", "LULU", "TJX",
        "ROST", "BKNG", "ABNB", "UBER", "LYFT", "DASH", "DKNG", "ONON", "CVNA",
        "ULTA", "EBAY", "ETSY", "RIVN", "LCID", "NIO", "LI", "XPEV", "F", "GM",
    ],
    "Consumer Staples": [
        "WMT", "COST", "PG", "KO", "PEP", "CL", "MDLZ", "KHC", "GIS", "MNST",
        "KDP", "STZ", "TGT", "DG", "DLTR",
    ],
    "Financials": [
        "JPM", "BAC", "WFC", "C", "GS", "MS", "SCHW", "BLK", "AXP", "USB", "PNC",
        "TFC", "COF", "BK", "SPGI", "CME", "ICE", "V", "MA", "FIS", "PGR", "TRV",
        "ALL", "MET", "AIG", "CB", "MMC", "AON", "COIN", "HOOD", "SOFI", "AFRM",
        "UPST", "SQ", "PYPL", "MSTR",
    ],
    "Healthcare": [
        "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
        "AMGN", "GILD", "VRTX", "REGN", "ISRG", "MDT", "CVS", "CI", "HUM", "BSX",
        "MRNA", "BIIB", "ZTS", "SYK", "BDX", "HCA", "IDXX", "DXCM", "ALNY",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "WMB",
        "KMI", "HAL", "DVN", "FANG", "HES", "BKR", "OKE", "ENPH", "FSLR",
    ],
    "Industrials": [
        "CAT", "DE", "BA", "GE", "HON", "UNP", "UPS", "FDX", "LMT", "RTX", "GD",
        "NOC", "EMR", "ETN", "PH", "ITW", "MMM", "CSX", "NSC", "WM", "GEV", "PWR",
        "URI", "PCAR",
    ],
    "Materials": [
        "LIN", "SHW", "FCX", "NEM", "NUE", "APD", "ECL", "DOW", "CTVA",
    ],
    "Utilities": [
        "NEE", "DUK", "SO", "AEP", "D", "EXC", "SRE",
    ],
    "ETF": [
        "SPY", "QQQ", "IWM", "DIA", "SMH", "XLK", "XLF", "XLE", "XLV", "XLY",
        "XLI", "XLP", "XLU", "XLB", "XLC", "XLRE", "ARKK", "TQQQ",
    ],
}

TICKER_SECTOR: dict[str, str] = {
    t.upper(): sector for sector, tickers in SECTORS.items() for t in tickers
}
LIQUID_TICKERS: list[str] = sorted(TICKER_SECTOR.keys())

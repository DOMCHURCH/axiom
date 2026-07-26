"""Curated liquid US trading universe, grouped by sector.

A broad but *tradable* universe — the most liquid ~600 US large/mid-caps + sector
ETFs — so 'Find Best Stocks' scans a deep, relevant field fast (cheap Yahoo prices
over this set take seconds, vs. minutes for the full ~10k SEC list). Sectors are
baked in (no API call), powering sector views for free. Set universe="full" on a
scan to sweep the entire SEC universe instead.
"""

from __future__ import annotations

SECTORS: dict[str, list[str]] = {
    "Semiconductors": [
        "NVDA", "AMD", "AVGO", "TSM", "ASML", "QCOM", "TXN", "INTC", "MU", "AMAT",
        "LRCX", "KLAC", "ADI", "MRVL", "NXPI", "MCHP", "ON", "TER", "GFS", "ARM",
        "SMCI", "MPWR", "SWKS", "QRVO", "ENTG", "LSCC", "AMKR", "WOLF", "ALGM", "RMBS",
        "SITM", "CRUS", "POWI", "FORM", "ACLS", "UCTT", "COHR", "NVMI", "ONTO",
    ],
    "Software": [
        "MSFT", "ORCL", "CRM", "ADBE", "NOW", "INTU", "SNPS", "CDNS", "PANW", "CRWD",
        "FTNT", "ZS", "PLTR", "SNOW", "DDOG", "NET", "MDB", "TEAM", "WDAY", "SHOP",
        "ADSK", "ROP", "FICO", "ANSS", "PAYC", "PCTY", "HUBS", "ZM", "DOCU", "OKTA",
        "TWLO", "S", "GTLB", "PATH", "BILL", "APP", "DBX", "PEGA", "MANH", "CFLT",
        "ESTC", "FROG", "BRZE", "ASAN", "MNDY", "SMAR", "AI", "TOST", "DT", "FSLY",
        "GWRE", "TYL", "PTC", "SPT", "WK", "APPF", "ALKT", "DSGX", "ZI",
    ],
    "Tech Hardware": [
        "AAPL", "CSCO", "IBM", "DELL", "HPQ", "ANET", "WDC", "STX", "HPE", "NTAP",
        "JBL", "FFIV", "JNPR", "KEYS", "ZBRA", "TDY", "GLW", "APH", "TEL", "CDW",
        "PSTG", "NTNX", "VRT", "FLEX", "SNX", "PLXS",
    ],
    "Communication": [
        "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "WBD",
        "SNAP", "PINS", "RDDT", "SPOT", "ROKU", "RBLX", "U", "EA", "TTWO", "OMC",
        "IPG", "TTD", "MTCH", "BIDU", "PARA", "FOXA", "FOX", "LYV", "NWSA", "CHTR",
        "DASH", "Z", "ZG", "YELP", "BMBL", "WBD", "CARG", "IQ", "GRAB",
    ],
    "Consumer Discretionary": [
        "AMZN", "TSLA", "HD", "LOW", "NKE", "SBUX", "MCD", "CMG", "LULU", "TJX",
        "ROST", "BKNG", "ABNB", "UBER", "LYFT", "DKNG", "ONON", "CVNA", "ULTA", "EBAY",
        "ETSY", "RIVN", "LCID", "NIO", "LI", "XPEV", "F", "GM", "YUM", "MAR", "HLT",
        "RCL", "CCL", "NCLH", "EXPE", "DHI", "LEN", "PHM", "NVR", "GRMN", "APTV",
        "BBY", "DECK", "TSCO", "ORLY", "AZO", "POOL", "WSM", "RH", "CROX", "SKX",
        "YETI", "PLNT", "WING", "CAVA", "TXRH", "DRI", "DPZ", "QSR", "LVS", "WYNN",
        "MGM", "CZR", "GME", "AMC", "W", "CHWY", "FND", "BURL", "DDS", "KMX",
    ],
    "Consumer Staples": [
        "WMT", "COST", "PG", "KO", "PEP", "CL", "MDLZ", "KHC", "GIS", "MNST",
        "KDP", "STZ", "TGT", "DG", "DLTR", "KR", "SYY", "ADM", "KVUE", "CHD",
        "CLX", "HSY", "K", "MKC", "CAG", "CPB", "HRL", "SJM", "TAP", "KMB",
        "EL", "BG", "TSN", "KDP", "COTY", "BJ", "GO", "PM", "MO", "BTI",
    ],
    "Financials": [
        "JPM", "BAC", "WFC", "C", "GS", "MS", "SCHW", "BLK", "AXP", "USB", "PNC",
        "TFC", "COF", "BK", "SPGI", "CME", "ICE", "V", "MA", "FIS", "PGR", "TRV",
        "ALL", "MET", "AIG", "CB", "MMC", "AON", "COIN", "HOOD", "SOFI", "AFRM",
        "UPST", "PYPL", "MSTR", "FISV", "GPN", "MCO", "MSCI", "NDAQ", "CBOE", "AJG",
        "BRO", "WTW", "ACGL", "HIG", "PRU", "AFL", "CINF", "L", "FITB", "MTB",
        "HBAN", "RF", "KEY", "CFG", "ALLY", "DFS", "SYF", "NTRS", "STT", "BEN",
        "TROW", "IVZ", "AMP", "RJF", "LPLA", "KKR", "APO", "BX", "ARES", "CG",
        "OWL", "TW", "MKL", "PFG", "GL", "EG", "WRB", "RYAN", "FCNCA", "BAP",
    ],
    "Healthcare": [
        "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
        "AMGN", "GILD", "VRTX", "REGN", "ISRG", "MDT", "CVS", "CI", "HUM", "BSX",
        "MRNA", "BIIB", "ZTS", "SYK", "BDX", "HCA", "IDXX", "DXCM", "ALNY", "ELV",
        "MCK", "COR", "CAH", "GEHC", "EW", "IQV", "A", "RMD", "WST", "MTD",
        "ZBH", "STE", "BAX", "HOLX", "PODD", "ILMN", "INCY", "BMRN", "EXEL", "NBIX",
        "SRPT", "RARE", "HALO", "MEDP", "CRL", "DGX", "LH", "CTLT", "TECH", "VEEV",
        "DVA", "UHS", "THC", "MOH", "CNC", "GMED", "TFX", "PEN", "INSP", "NARI",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "WMB",
        "KMI", "HAL", "DVN", "FANG", "HES", "BKR", "OKE", "ENPH", "FSLR", "TRGP",
        "LNG", "CTRA", "MRO", "APA", "EQT", "OVV", "AR", "RRC", "CHRD", "MTDR",
        "SM", "PR", "DINO", "PBF", "NOV", "FTI", "RIG", "HP", "CHK", "TPL",
        "FLNC", "RUN", "NEE", "SEDG", "ARRY", "SHLS", "PLUG", "BE", "NOVA",
    ],
    "Industrials": [
        "CAT", "DE", "BA", "GE", "HON", "UNP", "UPS", "FDX", "LMT", "RTX", "GD",
        "NOC", "EMR", "ETN", "PH", "ITW", "MMM", "CSX", "NSC", "WM", "GEV", "PWR",
        "URI", "PCAR", "CMI", "PNR", "AME", "ROK", "DOV", "IR", "FTV", "XYL",
        "OTIS", "CARR", "JCI", "TT", "GWW", "FAST", "PAYX", "ODFL", "CTAS", "VRSK",
        "RSG", "WAB", "AXON", "HWM", "TDG", "LHX", "TXT", "HII", "GNRC", "AOS",
        "DAL", "UAL", "LUV", "AAL", "ALK", "JBLU", "CHRW", "EXPD", "JBHT", "KNX",
        "SAIA", "XPO", "LII", "MAS", "BLDR", "BLD", "WSC", "CSL", "EME", "PRIM",
    ],
    "Materials": [
        "LIN", "SHW", "FCX", "NEM", "NUE", "APD", "ECL", "DOW", "CTVA", "DD",
        "PPG", "VMC", "MLM", "STLD", "ALB", "CF", "MOS", "LYB", "IFF", "PKG",
        "IP", "AMCR", "AVY", "BALL", "CE", "EMN", "RPM", "FMC", "CLF", "X",
        "RS", "SCCO", "GOLD", "AA", "MP", "ATI", "CRS", "AXTA", "WLK",
    ],
    "Utilities": [
        "NEE", "DUK", "SO", "AEP", "D", "EXC", "SRE", "XEL", "PEG", "ED",
        "WEC", "ES", "EIX", "PCG", "AEE", "DTE", "PPL", "FE", "ETR", "CNP",
        "CMS", "ATO", "NI", "LNT", "EVRG", "AES", "NRG", "VST", "CEG", "PNW",
    ],
    "Real Estate": [
        "PLD", "AMT", "EQIX", "WELL", "SPG", "PSA", "O", "DLR", "CCI", "CBRE",
        "VICI", "EXR", "AVB", "EQR", "IRM", "SBAC", "VTR", "ARE", "INVH", "MAA",
        "ESS", "KIM", "UDR", "CPT", "HST", "REG", "BXP", "DOC", "WPC", "ELS",
    ],
    "China / Intl ADR": [
        "BABA", "PDD", "JD", "NTES", "TCOM", "BEKE", "ZTO", "YUMC", "TME", "VIPS",
        "SE", "MELI", "GLOB", "NU", "STNE", "PAGS", "DLO", "SHOP", "SPOT", "CPNG",
    ],
    "ETF": [
        "SPY", "QQQ", "IWM", "DIA", "SMH", "XLK", "XLF", "XLE", "XLV", "XLY",
        "XLI", "XLP", "XLU", "XLB", "XLC", "XLRE", "ARKK", "SOXX", "IBB", "XBI",
        "VTI", "VOO", "IVV", "XOP", "KRE", "ITB", "XHB", "JETS", "GDX", "SLV",
    ],
}

TICKER_SECTOR: dict[str, str] = {
    t.upper(): sector for sector, tickers in SECTORS.items() for t in tickers
}
LIQUID_TICKERS: list[str] = sorted(TICKER_SECTOR.keys())

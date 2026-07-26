"""Curated liquid US trading universe, grouped by sector.

A deliberately BROAD but tradable field — ~1,100 of the most liquid US listings
(large, mid and liquid small caps + sector ETFs + major ADRs). The scanner prices
this whole set cheaply from Yahoo, gates it on liquidity, ranks it on technicals,
enriches the leaders with fundamentals, and narrows to the day's top contenders.

Scanning ~1.1k names takes seconds-to-a-minute; the full ~10k SEC filer list
(universe="full") takes minutes and is mostly illiquid shells. Sectors are baked
in (no API call), which powers sector views for free.

Any ticker that no longer exists is harmlessly dropped: the scanner keeps only
names present in the SEC-seeded company table, and the liquidity gate removes the
rest. So this list is intentionally generous.
"""

from __future__ import annotations

SECTORS: dict[str, list[str]] = {
    "Semiconductors": [
        "NVDA", "AMD", "AVGO", "TSM", "ASML", "QCOM", "TXN", "INTC", "MU", "AMAT",
        "LRCX", "KLAC", "ADI", "MRVL", "NXPI", "MCHP", "ON", "TER", "GFS", "ARM",
        "SMCI", "MPWR", "SWKS", "QRVO", "ENTG", "LSCC", "AMKR", "WOLF", "ALGM", "RMBS",
        "SITM", "CRUS", "POWI", "FORM", "ACLS", "UCTT", "COHR", "NVMI", "ONTO", "MTSI",
        "SLAB", "DIOD", "SYNA", "IPGP", "MKSI", "AEIS", "CRDO", "ALAB", "AOSL", "SMTC",
        "PI", "VECO", "ICHR", "PLAB", "AMBA", "LFUS", "QUIK", "NVTS",
    ],
    "Software": [
        "MSFT", "ORCL", "CRM", "ADBE", "NOW", "INTU", "SNPS", "CDNS", "PANW", "CRWD",
        "FTNT", "ZS", "PLTR", "SNOW", "DDOG", "NET", "MDB", "TEAM", "WDAY", "SHOP",
        "ADSK", "ROP", "FICO", "ANSS", "PAYC", "PCTY", "HUBS", "ZM", "DOCU", "OKTA",
        "TWLO", "S", "GTLB", "PATH", "BILL", "APP", "DBX", "PEGA", "MANH", "CFLT",
        "ESTC", "FROG", "BRZE", "ASAN", "MNDY", "SMAR", "AI", "TOST", "DT", "FSLY",
        "GWRE", "TYL", "PTC", "SPT", "WK", "APPF", "ALKT", "DSGX", "ZI", "QLYS",
        "TENB", "RPD", "VRNS", "CYBR", "DOCN", "BOX", "PD", "AMPL", "ZETA", "IAS",
        "SEMR", "PRGS", "SPSC", "WIX", "GDDY", "VRSN", "AKAM", "RNG", "FIVN", "NICE",
        "IOT", "CWAN", "VERX", "NCNO", "KVYO", "DUOL", "COUR", "UDMY", "CHGG", "OS",
        "BLKB", "ENV", "CVLT", "NTNX", "JAMF", "YEXT", "EGHT", "RAMP", "TTAN",
    ],
    "Tech Hardware": [
        "AAPL", "CSCO", "IBM", "DELL", "HPQ", "ANET", "WDC", "STX", "HPE", "NTAP",
        "JBL", "FFIV", "JNPR", "KEYS", "ZBRA", "TDY", "GLW", "APH", "TEL", "CDW",
        "PSTG", "VRT", "FLEX", "SNX", "PLXS", "SANM", "BHE", "CTS", "OSIS", "TRMB",
        "NCR", "XRX", "LOGI", "SONO", "HEAR", "IMMR", "BDC", "ROG", "MEI",
    ],
    "Communication & Media": [
        "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "WBD",
        "SNAP", "PINS", "RDDT", "SPOT", "ROKU", "RBLX", "U", "EA", "TTWO", "OMC",
        "IPG", "TTD", "MTCH", "BIDU", "PARA", "FOXA", "FOX", "LYV", "NWSA", "CHTR",
        "Z", "ZG", "YELP", "BMBL", "GRAB", "NYT", "TGNA", "NXST", "SBGI", "CRTO",
        "MGNI", "PUBM", "WMG", "MSGS", "MSGE", "EDR", "TKO", "RSI", "FLUT", "IMAX",
        "CNK", "LUMN", "FYBR", "TDS", "IRDM", "GSAT", "VSAT", "CABO", "ATUS", "SATS",
        "GOGO", "AMX", "CCOI", "ZD", "CARG", "DJT",
    ],
    "Consumer Discretionary": [
        "AMZN", "TSLA", "HD", "LOW", "NKE", "SBUX", "MCD", "CMG", "LULU", "TJX",
        "ROST", "BKNG", "ABNB", "UBER", "LYFT", "DKNG", "ONON", "CVNA", "ULTA", "EBAY",
        "ETSY", "RIVN", "LCID", "NIO", "LI", "XPEV", "F", "GM", "YUM", "MAR", "HLT",
        "RCL", "CCL", "NCLH", "EXPE", "GRMN", "APTV", "BBY", "DECK", "TSCO", "ORLY",
        "AZO", "POOL", "WSM", "RH", "CROX", "SKX", "YETI", "PLNT", "WING", "CAVA",
        "TXRH", "DRI", "DPZ", "QSR", "LVS", "WYNN", "MGM", "CZR", "GME", "W",
        "CHWY", "FND", "BURL", "DDS", "KMX", "FIVE", "OLLI", "DKS", "ASO", "BOOT",
        "SHOO", "VFC", "PVH", "RL", "LEVI", "GAP", "ANF", "AEO", "URBN", "M",
        "JWN", "KSS", "TPR", "CPRI", "COLM", "KTB", "HBI", "BBWI", "VSCO", "SIG",
        "SHAK", "SG", "BROS", "JACK", "WEN", "PZZA", "EAT", "BLMN", "CAKE", "CBRL",
        "PTLO", "DNUT", "HGV", "TNL", "VAC", "CHDN", "PENN", "BYD", "RRR", "GDEN",
        "MCRI", "H", "WH", "CHH", "PLYA", "PTON", "LTH", "MTN", "SABR", "TRIP",
        "MMYT", "HOG", "PII", "BC", "THO", "WGO", "LKQ", "GPC", "AAP", "ABG",
        "AN", "LAD", "PAG", "GPI", "DORM", "LEA", "BWA", "ALV", "MGA", "GT",
        "AXL", "ADNT", "DAN", "GTES", "PATK", "LCII", "SKY", "CVCO",
    ],
    "Consumer Staples": [
        "WMT", "COST", "PG", "KO", "PEP", "CL", "MDLZ", "KHC", "GIS", "MNST",
        "KDP", "STZ", "TGT", "DG", "DLTR", "KR", "SYY", "ADM", "KVUE", "CHD",
        "CLX", "HSY", "K", "MKC", "CAG", "CPB", "HRL", "SJM", "TAP", "KMB",
        "EL", "BG", "TSN", "COTY", "BJ", "PM", "MO", "BTI", "SFM", "CASY",
        "MUSA", "DAR", "INGR", "LW", "POST", "FLO", "THS", "SMPL", "BRBR", "CELH",
        "COKE", "PPC", "CALM", "USFD", "PFGC", "ACI", "UNFI", "NAPA", "FIZZ",
    ],
    "Banks & Financials": [
        "JPM", "BAC", "WFC", "C", "GS", "MS", "SCHW", "BLK", "AXP", "USB", "PNC",
        "TFC", "COF", "BK", "SPGI", "CME", "ICE", "V", "MA", "FIS", "MCO", "MSCI",
        "NDAQ", "CBOE", "FITB", "MTB", "HBAN", "RF", "KEY", "CFG", "ALLY", "DFS",
        "SYF", "NTRS", "STT", "BEN", "TROW", "IVZ", "AMP", "RJF", "LPLA", "WAL",
        "ZION", "CMA", "SNV", "PB", "ONB", "WBS", "FHN", "EWBC", "CFR", "UMBF",
        "BOKF", "GBCI", "HOMB", "VLY", "FNB", "ASB", "CADE", "BPOP", "WTFC", "PNFP",
        "SFNC", "ABCB", "AUB", "FIBK", "TCBI", "HWC", "RNST", "WSFS", "INDB", "CBU",
        "FFIN", "COLB", "PPBI", "BANR", "FBP", "OZK", "SSB", "UBSI", "EBC", "WAFD",
        "BKU", "CATY", "AX", "JEF", "EVR", "LAZ", "PJT", "MC", "HLI", "PIPR",
        "SF", "VIRT", "IBKR", "MKTX", "TPG", "BN", "BAM", "STEP", "KKR", "APO",
        "BX", "ARES", "CG", "OWL", "TW", "GPN", "JKHY", "ACIW", "EVTC", "WU",
        "FLYW", "XYZ", "FOUR", "WEX", "EEFT", "PAYO", "RELY", "MQ", "LC", "ENVA",
        "CACC", "PYPL", "COIN", "HOOD", "SOFI", "AFRM", "UPST", "MSTR", "NU", "STNE",
        "PAGS", "DLO", "ARCC", "MAIN", "OBDC", "GBDC", "FSK", "PSEC", "TSLX", "HTGC",
        "CSWC", "AGNC", "NLY", "STWD", "RITM", "ABR", "BXMT",
    ],
    "Insurance": [
        "PGR", "TRV", "ALL", "MET", "AIG", "CB", "MMC", "AON", "AJG", "BRO",
        "WTW", "ACGL", "HIG", "PRU", "AFL", "CINF", "L", "MKL", "PFG", "GL",
        "EG", "WRB", "RYAN", "KNSL", "ERIE", "ORI", "AIZ", "RGA", "UNM", "VOYA",
        "EQH", "CNO", "PRI", "FAF", "FNF", "RDN", "ESNT", "MTG", "NMIH", "LMND",
        "ROOT", "GSHD", "PLMR", "TRUP", "SIGI", "THG", "KMPR", "AFG", "AGO", "HCI",
    ],
    "Healthcare & Pharma": [
        "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
        "AMGN", "GILD", "VRTX", "REGN", "ISRG", "MDT", "CVS", "CI", "HUM", "BSX",
        "MRNA", "BIIB", "ZTS", "SYK", "BDX", "HCA", "IDXX", "DXCM", "ALNY", "ELV",
        "MCK", "COR", "CAH", "GEHC", "EW", "IQV", "A", "RMD", "WST", "MTD",
        "ZBH", "STE", "BAX", "HOLX", "PODD", "ILMN", "INCY", "BMRN", "EXEL", "NBIX",
        "SRPT", "RARE", "HALO", "MEDP", "CRL", "DGX", "LH", "CTLT", "TECH", "VEEV",
        "DVA", "UHS", "THC", "MOH", "CNC", "GMED", "TFX", "PEN", "INSP", "NARI",
        "VKTX", "CRSP", "NTLA", "BEAM", "EDIT", "VERV", "RXRX", "SDGR", "TWST", "PACB",
        "DNA", "ARWR", "IONS", "AXSM", "ACAD", "PTCT", "FOLD", "KRYS", "INSM", "IMVT",
        "CYTK", "MDGL", "ZLAB", "LEGN", "RVMD", "KYMR", "RCUS", "ARVN", "ALKS", "JAZZ",
        "NUVL", "TGTX", "XENE", "SAGE", "BPMC", "WVE", "IOVA", "ADMA", "ANIP", "AMPH",
        "HRMY", "COLL", "SUPN", "PCRX", "VCEL", "NVCR", "IRTC", "TNDM", "MASI", "BRKR",
        "QDEL", "NEOG", "RDNT", "ENSG", "EHC", "CHE", "ACHC", "SEM", "PINC", "HQY",
        "PGNY", "ALHC", "OSCR", "HIMS", "DOCS", "TDOC", "GDRX", "RVTY", "WAT", "BIO",
        "MYGN", "NTRA", "EXAS", "GH", "TXG", "CDNA", "VCYT", "OPCH", "ADUS", "LNTH",
        "UTHR", "ITCI", "PRGO", "TEVA", "VTRS", "OGN", "CORT", "ATRC", "CNMD", "ICUI",
        "XRAY", "ALGN", "LIVN", "NUVA", "PRCT", "TMDX", "ATEC", "GKOS", "ITGR", "MMSI",
        "HAE", "BGNE", "WBA", "HSIC", "PDCO", "OMCL", "EVH", "ASTH",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "WMB",
        "KMI", "HAL", "DVN", "FANG", "HES", "BKR", "OKE", "TRGP", "LNG", "CTRA",
        "MRO", "APA", "EQT", "OVV", "AR", "RRC", "CHRD", "MTDR", "SM", "PR",
        "DINO", "PBF", "NOV", "FTI", "RIG", "HP", "CHK", "TPL", "WFRD", "LBRT",
        "PTEN", "TDW", "VAL", "OII", "CHX", "WHD", "BTU", "HCC", "CEIX", "ARLP",
        "AMR", "SU", "CNQ", "CVE", "PBR", "YPF", "E", "SHEL", "BP", "TTE",
        "EQNR", "VIST", "EPD", "ET", "PAA", "WES", "MPLX", "AM", "DTM", "GLNG",
    ],
    "Industrials": [
        "CAT", "DE", "BA", "GE", "HON", "UNP", "UPS", "FDX", "LMT", "RTX", "GD",
        "NOC", "EMR", "ETN", "PH", "ITW", "MMM", "CSX", "NSC", "WM", "GEV", "PWR",
        "URI", "PCAR", "CMI", "PNR", "AME", "ROK", "DOV", "IR", "FTV", "XYL",
        "OTIS", "CARR", "JCI", "TT", "GWW", "FAST", "PAYX", "ODFL", "CTAS", "VRSK",
        "RSG", "WAB", "AXON", "HWM", "TDG", "LHX", "TXT", "HII", "GNRC", "AOS",
        "DAL", "UAL", "LUV", "AAL", "ALK", "JBLU", "CHRW", "EXPD", "JBHT", "KNX",
        "SAIA", "XPO", "LII", "MAS", "BLDR", "BLD", "WSC", "CSL", "EME", "PRIM",
        "HUBB", "ATKR", "ACM", "J", "KBR", "FLR", "MTZ", "DY", "STRL", "TTEK",
        "EXP", "ITT", "CR", "FLS", "WTS", "BMI", "RBC", "TKR", "GGG", "NDSN",
        "IEX", "ALLE", "SWK", "SNA", "TTC", "RKLB", "ASTS", "AVAV", "KTOS", "HEI",
        "CW", "WWD", "MRCY", "SPR", "ATRO", "DCO", "AIR", "LUNR", "TREX", "AZEK",
        "FBIN", "MHK", "SSD", "OC", "WMS", "IBP", "TPH", "MTH", "TMHC", "KBH",
        "LGIH", "KNF", "GVA", "IESC", "FIX", "NVEE", "MATX", "HUBG", "WERN", "ARCB",
        "RXO", "GXO", "ZIM", "SBLK", "INSW", "FRO", "DHT", "STNG", "KEX", "CP",
        "CNI", "MAN", "RHI", "KFY", "ASGN", "TNET", "ADP", "NSP", "FCN", "EFX",
        "TRU", "CLH", "NVRI", "MLI", "AIT", "WCC", "GTLS", "PLUG", "BE", "FLNC",
    ],
    "Materials & Chemicals": [
        "LIN", "SHW", "FCX", "NEM", "NUE", "APD", "ECL", "DOW", "CTVA", "DD",
        "PPG", "VMC", "MLM", "STLD", "ALB", "CF", "MOS", "LYB", "IFF", "PKG",
        "IP", "AMCR", "AVY", "BALL", "CE", "EMN", "RPM", "FMC", "CLF", "X",
        "RS", "SCCO", "GOLD", "AA", "MP", "ATI", "CRS", "AXTA", "WLK", "TROX",
        "HUN", "OLN", "CBT", "ASH", "SXT", "HWKN", "AVNT", "FUL", "KWR", "IOSP",
        "NEU", "CC", "SMG", "NTR", "GEF", "SON", "SEE", "BERY", "ATR", "SLGN",
        "OI", "GPK", "SW", "CCK", "RYN", "PCH", "WY", "LPX", "BCC", "UFPI",
        "AGI", "KGC", "AU", "HMY", "EGO", "BTG", "IAG", "SSRM", "PAAS", "WPM",
        "FNV", "RGLD", "AEM", "CDE", "HL", "UEC", "CCJ", "DNN", "NXE", "LEU",
        "SMR", "OKLO", "UUUU", "BHP", "RIO", "VALE", "TECK", "SBSW", "GFI", "GGB",
    ],
    "Utilities & Water": [
        "NEE", "DUK", "SO", "AEP", "D", "EXC", "SRE", "XEL", "PEG", "ED",
        "WEC", "ES", "EIX", "PCG", "AEE", "DTE", "PPL", "FE", "ETR", "CNP",
        "CMS", "ATO", "NI", "LNT", "EVRG", "AES", "NRG", "VST", "CEG", "PNW",
        "OGE", "IDA", "POR", "BKH", "NWE", "OTTR", "SR", "NJR", "SWX", "OGS",
        "NFG", "UGI", "AWK", "WTRG", "CWT", "SJW", "MSEX", "CWEN", "AMRC", "TAC",
    ],
    "Real Estate": [
        "PLD", "AMT", "EQIX", "WELL", "SPG", "PSA", "O", "DLR", "CCI", "CBRE",
        "VICI", "EXR", "AVB", "EQR", "IRM", "SBAC", "VTR", "ARE", "INVH", "MAA",
        "ESS", "KIM", "UDR", "CPT", "HST", "REG", "BXP", "DOC", "WPC", "ELS",
        "CUBE", "NSA", "SUI", "AMH", "IRT", "BRX", "FRT", "KRG", "PECO", "SKT",
        "MAC", "GTY", "ADC", "NNN", "EPRT", "STAG", "TRNO", "FR", "EGP", "REXR",
        "COLD", "OHI", "CTRE", "SBRA", "NHI", "MPW", "HIW", "KRC", "SLG", "VNO",
        "ESRT", "DEI", "CUZ", "DBRG", "LAMR", "OUT", "JLL", "HHH", "OPEN", "COMP",
    ],
    "International ADR": [
        "BABA", "PDD", "JD", "NTES", "TCOM", "BEKE", "ZTO", "YUMC", "TME", "VIPS",
        "SE", "MELI", "GLOB", "CPNG", "BILI", "WB", "QFIN", "FUTU", "TIGR", "ATAT",
        "HTHT", "YMM", "GDS", "KC", "DOYU", "HUYA", "MOMO", "RLX", "EDU", "TAL",
        "ITUB", "BBD", "ABEV", "CIB", "BAP", "CX", "INFY", "WIT", "HDB", "IBN",
        "ERJ", "SAP", "SONY", "TM", "HMC", "MUFG", "SMFG", "MFG", "NMR", "DB",
        "UBS", "HSBC", "BCS", "RY", "TD", "BMO", "BNS", "CM", "ING", "SAN",
        "BBVA", "LYG", "NVO", "AZN", "GSK", "NVS", "SNY", "TAK", "STLA", "RACE",
    ],
    "Crypto & Miners": [
        "RIOT", "MARA", "CLSK", "HUT", "BITF", "CIFR", "WULF", "CORZ", "IREN", "BTBT",
        "BTDR", "GLXY", "BKKT", "CAN", "SDIG", "HIVE",
    ],
    "Solar & Clean Energy": [
        "ENPH", "FSLR", "SEDG", "RUN", "ARRY", "SHLS", "NOVA", "CSIQ", "JKS", "DQ",
        "NXT", "TPIC", "MAXN", "ORA", "BEPC", "AY", "STEM",
    ],
    "ETF": [
        "SPY", "QQQ", "IWM", "DIA", "SMH", "XLK", "XLF", "XLE", "XLV", "XLY",
        "XLI", "XLP", "XLU", "XLB", "XLC", "XLRE", "ARKK", "SOXX", "IBB", "XBI",
        "VTI", "VOO", "IVV", "XOP", "KRE", "ITB", "XHB", "JETS", "GDX", "SLV",
        "GLD", "TLT", "IEF", "HYG", "LQD", "AGG", "BND", "EEM", "EFA", "VEA",
        "VWO", "IEMG", "FXI", "KWEB", "EWJ", "EWZ", "INDA", "EWY", "EWT", "XME",
        "TQQQ", "SOXL", "IYR", "XRT", "XLG", "RSP", "MDY", "IJH", "IJR", "SCHD",
    ],
}

TICKER_SECTOR: dict[str, str] = {
    t.upper(): sector for sector, tickers in SECTORS.items() for t in tickers
}
LIQUID_TICKERS: list[str] = sorted(TICKER_SECTOR.keys())

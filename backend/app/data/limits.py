"""Per-provider throttles instantiated from settings. Import these in clients."""

from __future__ import annotations

from app.config import settings
from app.core.ratelimit import Throttle

# FMP: hard 250/day budget (no per-minute cap documented; keep it daily).
fmp_throttle = Throttle("fmp", per_day=settings.fmp_daily_limit)

# Finnhub: 60/min — block briefly when saturated.
finnhub_throttle = Throttle("finnhub", per_min=settings.finnhub_per_min)

# Polygon/Massive: 5/min AND 7200/day — both enforced.
polygon_throttle = Throttle("polygon", per_min=settings.polygon_per_min,
                            per_day=settings.polygon_per_day)

# SEC: no key, but fair-use ~10 req/s. Stay polite with a generous per-minute cap.
sec_throttle = Throttle("sec", per_min=300)

# GDELT: unlimited but be gentle.
gdelt_throttle = Throttle("gdelt", per_min=120)

# FRED: 120 req/min per key is safe; data changes slowly and is heavily cached.
fred_throttle = Throttle("fred", per_min=120)
